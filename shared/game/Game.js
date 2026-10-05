// Simulation autoritaire du jeu. Exécutée par le serveur (parties en ligne) ou
// directement dans le navigateur (solo / local). Aucune dépendance au DOM.

import {
  TILE,
  COLS,
  ROWS,
  WORLD_W,
  WORLD_H,
  MAX_PLAYERS,
  PLAYER_COLORS,
  PHASE,
  RARITIES,
  DIFFICULTIES,
  MODES,
  CAMPAIGN_WAVES,
  PLAYER_HP_SCALE,
  TARGET_MODES,
  UPGRADE_STATS,
  BRANCH_LEVEL,
  SELL_REFUND,
  QUICK_CHAT,
} from '../constants.js';
import { MAPS, DEFAULT_MAP } from '../data/maps.js';
import { TOWER_TYPES } from '../data/towers.js';
import { ENEMY_INDEX } from '../data/enemies.js';
import { getWaveDef, prepTime, waveReward, teamWaveReward, hpMult, countMult, intervalMult } from '../data/waves.js';
import { ENEMY_TYPES } from '../data/enemies.js';
import { TEAM_ITEMS, SYNERGIES, ABILITIES, COOP, synergyWeight, synergyPower, FRATERNITY_NEED, ARSENAL_NEED } from '../data/team.js';
import { RNG, buildPath, sanitizeName, sanitizeText, clamp } from '../util.js';
import {
  WAVE_EVENTS,
  WAVE_EVENT_IDS,
  EVENT_CHANCE,
  EVENT_MIN_WAVE,
  MERCHANT_DEALS,
  MERCHANT_DEAL_IDS,
  MERCHANT_CHANCE,
  MERCHANT_MIN_WAVE,
  POLISH_MAX_RARITY,
} from '../data/events.js';
import { computeTowerStats, upgradeCost, upgradeSlots, upgradesUsed } from './stats.js';
import { CombatMixin } from './combat.js';
import { EnemyMixin } from './enemies.js';
import { TowerMixin } from './towers.js';
import { FusionMixin } from './fusion.js';

export const CELL = { FREE: 0, PATH: 1, BLOCKED: 2, BASE: 3, WATER: 4 };

const r1 = (v) => Math.round(v * 10) / 10;
// Recherche sûre : ignore les clés héritées (« constructor », « __proto__ »…).
const own = (obj, key) => (typeof key === 'string' && Object.hasOwn(obj, key) ? obj[key] : undefined);

export class Game {
  constructor(opts = {}) {
    this.seed = (opts.seed ?? Math.floor(Math.random() * 2 ** 31)) >>> 0;
    this.rng = new RNG(this.seed);
    this.difficulty = DIFFICULTIES[opts.difficulty] ? opts.difficulty : 'normal';
    this.diff = DIFFICULTIES[this.difficulty];
    this.mode = MODES[opts.mode] ? opts.mode : 'campaign';
    this.totalWaves = this.mode === 'campaign' ? CAMPAIGN_WAVES : 0;
    this.mapId = MAPS[opts.mapId] ? opts.mapId : DEFAULT_MAP;
    this.map = MAPS[this.mapId];
    this.sharedScreen = !!opts.sharedScreen;
    // Réglages d'équilibrage (simulateur uniquement).
    this.tuning = { hp: 1, gold: 1, ...(opts.tuning || {}) };
    this.setupMap();

    const plist = (opts.players && opts.players.length ? opts.players : [{ name: 'Joueur 1' }]).slice(0, MAX_PLAYERS);
    this.players = plist.map((p, i) => this.createPlayer(i, p));
    this.hpScale = PLAYER_HP_SCALE[this.players.length - 1];
    this.teamSrc = { owners: this.players.map((p) => p.id), kind: 'snipe', armorPierce: 4, bossMult: 1, airMult: 1 };

    this.tick = 0;
    this.time = 0;
    this.phase = PHASE.PREP;
    this.wave = 0;
    this.timer = prepTime(1, getWaveDef(1, this.seed));
    this.speed = 1;
    this.base = {
      hp: this.diff.baseHp,
      maxHp: this.diff.baseHp,
      shield: 0,
      armorLvl: 0,
      cannonLvl: 0,
      cannonCd: 0,
    };
    this.teamGold = 0;
    this.team = {};
    this.towers = [];
    this.towerById = new Map();
    this.enemies = [];
    this.enemyById = new Map();
    this.projectiles = [];
    this.zones = [];
    this.delayed = [];
    this.fusionRequests = [];
    this.events = [];
    this.cmdQueue = [];
    this.nextId = 1;
    this.towersVersion = 1;
    this.towersDirty = false;
    this.synergies = new Set();
    this.waveState = null;
    this.lastWaveSummary = null;
    this.result = null;
    this.history = [];
    this.nextEvent = null;
    this.waveEvent = null;
    this.lastEventId = null;
    this.merchant = null;
    this.rangeMult = 1;
    this.nextPreview = this.computePreview(1);
  }

  // ---------------------------------------------------------------- Carte
  setupMap() {
    const m = this.map;
    const toPx = ([c, r]) => [(c + 0.5) * TILE, (r + 0.5) * TILE];
    this.paths = m.paths.map((p) => buildPath(p.map(toPx)));
    this.airPaths = (m.airPaths || []).map((p) => buildPath(p.map(toPx)));
    if (!this.airPaths.length) {
      const p = this.paths[0].points;
      this.airPaths = [buildPath([p[0], p[p.length - 1]])];
    }
    this.basePos = { x: (m.base.col + 0.5) * TILE, y: (m.base.row + 0.5) * TILE };
    this.grid = new Uint8Array(COLS * ROWS);
    for (const path of this.paths) {
      for (let d = 0; d <= path.length; d += 4) {
        const pt = { x: 0, y: 0 };
        // échantillonnage simple du chemin
        let acc = 0;
        for (const s of path.segs) {
          if (d <= acc + s.len) {
            const t = d - acc;
            pt.x = s.x1 + s.dx * t;
            pt.y = s.y1 + s.dy * t;
            break;
          }
          acc += s.len;
        }
        const c = Math.floor(pt.x / TILE);
        const r = Math.floor(pt.y / TILE);
        if (c >= 0 && c < COLS && r >= 0 && r < ROWS) this.grid[r * COLS + c] = CELL.PATH;
      }
    }
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        const c = m.base.col + dc;
        const r = m.base.row + dr;
        if (c >= 0 && c < COLS && r >= 0 && r < ROWS) this.grid[r * COLS + c] = CELL.BASE;
      }
    }
    for (const [c, r] of m.water || []) if (this.grid[r * COLS + c] === CELL.FREE) this.grid[r * COLS + c] = CELL.WATER;
    for (const [c, r] of m.rocks || []) if (this.grid[r * COLS + c] === CELL.FREE) this.grid[r * COLS + c] = CELL.BLOCKED;
    this.towerGrid = new Int32Array(COLS * ROWS);
  }

  isBuildable(c, r) {
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return false;
    const i = r * COLS + c;
    return this.grid[i] === CELL.FREE && this.towerGrid[i] === 0;
  }

  // -------------------------------------------------------------- Joueurs
  createPlayer(i, p) {
    const bonus = clamp(Number(p.startBonus) || 0, 0, 0.2);
    return {
      id: i,
      name: sanitizeName(p.name, p.bot ? `IA ${i + 1}` : `Joueur ${i + 1}`),
      color: PLAYER_COLORS[i],
      bot: !!p.bot,
      connected: true,
      autopilot: false,
      gold: Math.round(this.diff.startGold * (1 + bonus)),
      cores: p.startCore ? 1 : 0,
      ready: false,
      speedVote: false,
      cds: ABILITIES.map(() => 0),
      overchargeT: 0,
      skin: clamp(p.skin | 0, 0, 7),
      chatT: 0,
      pingT: 0,
      stats: {
        kills: 0,
        damage: 0,
        gold: 0,
        built: 0,
        fusions: 0,
        coopFusions: 0,
        combos: 0,
        coopCombos: 0,
        abilities: 0,
        upgrades: 0,
        gifts: 0,
        bosses: 0,
        teamBuys: 0,
        hybrids: 0,
      },
    };
  }

  setConnected(pid, connected) {
    const p = this.players[pid];
    if (!p) return;
    p.connected = connected;
    this.emit({ e: 'info', m: `${p.name} ${connected ? 's’est reconnecté' : 's’est déconnecté'}.`, k: 'net' });
  }

  // ------------------------------------------------------------ Événements
  emit(ev) {
    this.events.push(ev);
  }

  error(pid, msg) {
    this.emit({ e: 'err', p: pid, m: msg });
    return false;
  }

  drainEvents() {
    const ev = this.events;
    this.events = [];
    return ev;
  }

  // ------------------------------------------------------------- Commandes
  command(pid, cmd) {
    if (!cmd || typeof cmd !== 'object' || typeof cmd.a !== 'string') return;
    if (!this.players[pid]) return;
    if (this.cmdQueue.length > 500) return;
    this.cmdQueue.push([pid, cmd]);
  }

  processCommands() {
    const q = this.cmdQueue;
    this.cmdQueue = [];
    for (const [pid, c] of q) {
      try {
        this.execCommand(pid, c);
      } catch {
        this.error(pid, 'Commande invalide.');
      }
    }
  }

  execCommand(pid, c) {
    const over = this.phase === PHASE.VICTORY || this.phase === PHASE.DEFEAT;
    if (over && c.a !== 'chat' && c.a !== 'ping') return;
    switch (c.a) {
      case 'place':
        return this.cmdPlace(pid, c);
      case 'upgrade':
        return this.cmdUpgrade(pid, c);
      case 'sell':
        return this.cmdSell(pid, c);
      case 'move':
        return this.cmdMove(pid, c);
      case 'target':
        return this.cmdTarget(pid, c);
      case 'branch':
        return this.cmdBranch(pid, c);
      case 'fuse':
        return this.cmdFuse(pid, c);
      case 'fuseReply':
        return this.cmdFuseReply(pid, c);
      case 'ready':
        return this.cmdReady(pid, c);
      case 'ability':
        return this.cmdAbility(pid, c);
      case 'team':
        return this.cmdTeam(pid, c);
      case 'gift':
        return this.cmdGift(pid, c);
      case 'chat':
        return this.cmdChat(pid, c);
      case 'ping':
        return this.cmdPing(pid, c);
      case 'speed':
        return this.cmdSpeed(pid, c);
      case 'merchant':
        return this.cmdMerchant(pid, c);
      default:
        return this.error(pid, 'Commande inconnue.');
    }
  }

  rollRarity() {
    let total = 0;
    for (const r of RARITIES) total += r.weight;
    let x = this.rng.next() * total;
    for (const r of RARITIES) {
      if (x < r.weight) return r.id;
      x -= r.weight;
    }
    return 0;
  }

  cmdPlace(pid, c) {
    const def = own(TOWER_TYPES, c.tt);
    if (!def) return this.error(pid, 'Type de tourelle inconnu.');
    const col = c.c | 0;
    const row = c.r | 0;
    if (!this.isBuildable(col, row)) return this.error(pid, 'Emplacement impossible.');
    const p = this.players[pid];
    if (p.gold < def.cost) return this.error(pid, 'Pas assez d’or.');
    p.gold -= def.cost;
    const t = {
      id: this.nextId++,
      type: def.id,
      level: 1,
      rarity: this.rollRarity(),
      branch: null,
      owner: pid,
      owners: [pid],
      c: col,
      r: row,
      x: (col + 0.5) * TILE,
      y: (row + 0.5) * TILE,
      up: { dmg: 0, rate: 0, range: 0 },
      invested: { [pid]: def.cost },
      upSpend: {},
      targetMode: def.defaultTarget || 'first',
      cd: 0.2,
      angle: -Math.PI / 2,
      targetId: 0,
      retarget: 0,
      disabledT: 0,
      shots: 0,
      burstT: 0,
      burstCd: 8,
      link: 0,
      aura: 0,
      stats: null,
      src: null,
      kills: 0,
      dmg: 0,
    };
    this.towers.push(t);
    this.towerById.set(t.id, t);
    this.towerGrid[row * COLS + col] = t.id;
    p.stats.built++;
    this.towersDirty = true;
    this.emit({ e: 'place', id: t.id, p: pid, x: t.x, y: t.y, tt: t.type, r: t.rarity });
    return t;
  }

  removeTower(t) {
    const i = this.towers.indexOf(t);
    if (i >= 0) this.towers.splice(i, 1);
    this.towerById.delete(t.id);
    if (this.towerGrid[t.r * COLS + t.c] === t.id) this.towerGrid[t.r * COLS + t.c] = 0;
    this.towersDirty = true;
    // Annule les demandes de fusion qui impliquaient cette tourelle.
    for (let k = this.fusionRequests.length - 1; k >= 0; k--) {
      const r = this.fusionRequests[k];
      if (r.primary === t.id || r.partners.includes(t.id)) {
        this.fusionRequests.splice(k, 1);
        this.emit({ e: 'fuseRes', id: r.id, ok: 0, from: r.from, msg: 'Fusion annulée : une tourelle a disparu.' });
      }
    }
  }

  cmdUpgrade(pid, c) {
    const t = this.towerById.get(c.id | 0);
    if (!t) return this.error(pid, 'Tourelle introuvable.');
    if (!own(UPGRADE_STATS, c.s)) return this.error(pid, 'Amélioration inconnue.');
    if (upgradesUsed(t) >= upgradeSlots(t)) return this.error(pid, 'Plus d’emplacement d’amélioration : fusionnez pour en obtenir.');
    const cost = upgradeCost(t);
    const p = this.players[pid];
    if (p.gold < cost) return this.error(pid, 'Pas assez d’or.');
    p.gold -= cost;
    t.up[c.s]++;
    t.invested[pid] = (t.invested[pid] || 0) + cost;
    t.upSpend[pid] = (t.upSpend[pid] || 0) + cost;
    p.stats.upgrades++;
    this.towersDirty = true;
    this.emit({ e: 'upgrade', id: t.id, p: pid, x: t.x, y: t.y, s: c.s, gift: t.owners.includes(pid) ? 0 : 1 });
  }

  cmdSell(pid, c) {
    const t = this.towerById.get(c.id | 0);
    if (!t) return this.error(pid, 'Tourelle introuvable.');
    if (t.owner !== pid) return this.error(pid, 'Seul le propriétaire principal peut vendre cette tourelle.');
    let total = 0;
    for (const k in t.invested) {
      const v = Math.max(0, t.invested[k]) * SELL_REFUND;
      const pl = this.players[k];
      if (pl) pl.gold += v;
      total += v;
    }
    this.removeTower(t);
    this.emit({ e: 'sell', id: t.id, p: pid, x: t.x, y: t.y, v: Math.round(total) });
  }

  cmdMove(pid, c) {
    const t = this.towerById.get(c.id | 0);
    if (!t) return this.error(pid, 'Tourelle introuvable.');
    if (!t.owners.includes(pid)) return this.error(pid, 'Cette tourelle ne vous appartient pas.');
    if (this.phase !== PHASE.PREP) return this.error(pid, 'Déplacement possible uniquement pendant la préparation.');
    const col = c.c | 0;
    const row = c.r | 0;
    if (!this.isBuildable(col, row)) return this.error(pid, 'Emplacement impossible.');
    const fromX = t.x;
    const fromY = t.y;
    this.towerGrid[t.r * COLS + t.c] = 0;
    t.c = col;
    t.r = row;
    t.x = (col + 0.5) * TILE;
    t.y = (row + 0.5) * TILE;
    this.towerGrid[row * COLS + col] = t.id;
    this.towersDirty = true;
    this.emit({ e: 'move', id: t.id, p: pid, x1: fromX, y1: fromY, x: t.x, y: t.y });
  }

  cmdTarget(pid, c) {
    const t = this.towerById.get(c.id | 0);
    if (!t) return this.error(pid, 'Tourelle introuvable.');
    if (!t.owners.includes(pid)) return this.error(pid, 'Cette tourelle ne vous appartient pas.');
    if (!TARGET_MODES.some((m) => m.id === c.m)) return this.error(pid, 'Mode de ciblage inconnu.');
    t.targetMode = c.m;
    t.retarget = 0;
    this.towersVersion++;
  }

  cmdBranch(pid, c) {
    const t = this.towerById.get(c.id | 0);
    if (!t) return this.error(pid, 'Tourelle introuvable.');
    if (!t.owners.includes(pid)) return this.error(pid, 'Cette tourelle ne vous appartient pas.');
    if (t.level < BRANCH_LEVEL) return this.error(pid, `Spécialisation disponible au niveau ${BRANCH_LEVEL}.`);
    if (t.branch) return this.error(pid, 'Cette tourelle est déjà spécialisée (choix irréversible).');
    const def = TOWER_TYPES[t.type];
    if (!own(def.branches, c.b)) return this.error(pid, 'Spécialisation inconnue.');
    t.branch = c.b;
    this.towersDirty = true;
    this.emit({ e: 'branch', id: t.id, p: pid, x: t.x, y: t.y, b: c.b, n: def.branches[c.b].name });
  }

  allReady() {
    let any = false;
    for (const p of this.players) {
      if (!p.connected && !p.bot) continue;
      any = true;
      if (!p.ready) return false;
    }
    return any;
  }

  cmdReady(pid, c) {
    if (this.phase !== PHASE.PREP) return;
    const p = this.players[pid];
    p.ready = typeof c.v === 'boolean' ? c.v : !p.ready;
  }

  cmdSpeed(pid, c) {
    const p = this.players[pid];
    p.speedVote = typeof c.v === 'boolean' ? c.v : !p.speedVote;
    if (this.sharedScreen) {
      for (const q of this.players) q.speedVote = p.speedVote;
    }
    this.updateSpeed();
  }

  updateSpeed() {
    let humans = 0;
    let votes = 0;
    for (const p of this.players) {
      if (p.bot || !p.connected) continue;
      humans++;
      if (p.speedVote) votes++;
    }
    const newSpeed = humans > 0 && votes === humans ? 2 : 1;
    if (newSpeed !== this.speed) {
      this.speed = newSpeed;
      this.emit({ e: 'speed', v: newSpeed });
    }
  }

  cmdAbility(pid, c) {
    const i = c.i | 0;
    const ab = ABILITIES[i];
    if (!ab) return this.error(pid, 'Capacité inconnue.');
    const p = this.players[pid];
    if (p.cds[i] > 0) return this.error(pid, `${ab.name} : en recharge (${Math.ceil(p.cds[i])} s).`);
    if (this.phase !== PHASE.WAVE) return this.error(pid, 'Les capacités s’utilisent pendant les vagues.');
    const src = { owners: [pid], kind: 'explosion', armorPierce: 10, bossMult: 1, airMult: 1 };
    if (ab.id === 'strike') {
      const x = clamp(Number(c.x) || 0, 0, WORLD_W);
      const y = clamp(Number(c.y) || 0, 0, WORLD_H);
      const dmg = 110 * hpMult(this.wave) * this.diff.hp;
      this.delayed.push({ k: 'strike', t: ab.delay, x, y, r: ab.radius, dmg, src });
      this.emit({ e: 'strike', p: pid, x: Math.round(x), y: Math.round(y), r: ab.radius, d: ab.delay });
    } else if (ab.id === 'freeze') {
      const fsrc = { owners: [pid], kind: 'ability' };
      for (const e of this.enemies) if (!e.dead) this.applySlow(e, 0.5, ab.dur, fsrc);
      this.emit({ e: 'freeze', p: pid });
    } else if (ab.id === 'overcharge') {
      p.overchargeT = ab.dur;
      this.emit({ e: 'overcharge', p: pid });
    }
    p.cds[i] = ab.cd;
    p.stats.abilities++;
    this.emit({ e: 'ability', p: pid, a: ab.id });
  }

  cmdTeam(pid, c) {
    const it = own(TEAM_ITEMS, c.item);
    if (!it) return this.error(pid, 'Objet inconnu.');
    const n = this.team[it.id] || 0;
    if (it.max && n >= it.max) return this.error(pid, `${it.name} : niveau maximum atteint.`);
    const cost = it.cost(n);
    if (this.teamGold < cost) return this.error(pid, 'Trésor d’équipe insuffisant.');
    const p = this.players[pid];
    const b = this.base;
    switch (it.id) {
      case 'repair':
        if (b.hp >= b.maxHp) return this.error(pid, 'La base est déjà intacte.');
        b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.2);
        break;
      case 'shield':
        if (b.shield >= 500) return this.error(pid, 'Bouclier déjà au maximum.');
        b.shield = Math.min(500, b.shield + 250);
        break;
      case 'armor':
        b.armorLvl++;
        break;
      case 'cannon':
        b.cannonLvl++;
        break;
      case 'training':
        this.towersDirty = true;
        break;
      case 'generator':
        break;
      case 'core':
        p.cores++;
        break;
    }
    this.team[it.id] = n + 1;
    this.teamGold -= cost;
    p.stats.teamBuys++;
    this.emit({ e: 'team', p: pid, item: it.id, m: `${p.name} a acheté « ${it.name} » avec le trésor d’équipe.` });
  }

  cmdGift(pid, c) {
    const to = this.players[c.to | 0];
    const p = this.players[pid];
    if (!to || to.id === pid) return this.error(pid, 'Destinataire invalide.');
    const amount = Math.floor(clamp(Number(c.v) || 0, 0, Math.floor(p.gold)));
    if (amount <= 0) return this.error(pid, 'Pas assez d’or.');
    p.gold -= amount;
    to.gold += amount;
    p.stats.gifts += amount;
    this.emit({ e: 'gift', p: pid, to: to.id, v: amount, m: `${p.name} a donné ${amount} or à ${to.name}.` });
  }

  cmdMerchant(pid, c) {
    const m = this.merchant;
    if (!m || this.phase !== PHASE.PREP) return this.error(pid, 'Le marchand est parti.');
    const deal = own(MERCHANT_DEALS, c.deal);
    if (!deal || !m.deals.includes(deal.id)) return this.error(pid, 'Offre indisponible.');
    if (m.bought[pid].includes(deal.id)) return this.error(pid, 'Vous avez déjà acheté cette offre.');
    const p = this.players[pid];
    let t = null;
    if (deal.needsTower) {
      t = this.towerById.get(c.id | 0);
      if (!t || !t.owners.includes(pid)) return this.error(pid, 'Sélectionnez une de vos tourelles.');
      if (t.rarity >= POLISH_MAX_RARITY) return this.error(pid, 'Rareté déjà maximale pour le marchand.');
    }
    const cost = deal.cost(Math.max(1, this.wave), t);
    if (p.gold < cost) return this.error(pid, 'Pas assez d’or.');
    if (deal.id === 'repair' && this.base.hp >= this.base.maxHp) return this.error(pid, 'La base est déjà intacte.');
    p.gold -= cost;
    m.bought[pid].push(deal.id);
    switch (deal.id) {
      case 'core':
        p.cores++;
        break;
      case 'polish':
        t.rarity++;
        t.invested[pid] = (t.invested[pid] || 0) + cost;
        this.towersDirty = true;
        break;
      case 'repair':
        this.base.hp = Math.min(this.base.maxHp, this.base.hp + this.base.maxHp * 0.15);
        break;
      case 'recharge':
        p.cds = p.cds.map(() => 0);
        break;
    }
    this.emit({
      e: 'deal',
      p: pid,
      deal: deal.id,
      id: t ? t.id : 0,
      x: t ? t.x : 0,
      y: t ? t.y : 0,
      r: t ? t.rarity : 0,
      m: `${p.name} a acheté « ${deal.name} » au marchand.`,
    });
  }

  cmdChat(pid, c) {
    const p = this.players[pid];
    if (this.time - p.chatT < 0.6) return;
    p.chatT = this.time;
    if (typeof c.q === 'number') {
      if (!QUICK_CHAT[c.q]) return;
      this.emit({ e: 'chat', p: pid, q: c.q });
    } else {
      const m = sanitizeText(c.m);
      if (!m) return;
      this.emit({ e: 'chat', p: pid, m });
    }
  }

  cmdPing(pid, c) {
    const p = this.players[pid];
    if (this.time - p.pingT < 0.4) return;
    p.pingT = this.time;
    const x = clamp(Number(c.x) || 0, 0, WORLD_W);
    const y = clamp(Number(c.y) || 0, 0, WORLD_H);
    const kind = ['here', 'danger', 'build', 'fuse'].includes(c.k) ? c.k : 'here';
    this.emit({ e: 'ping', p: pid, x: Math.round(x), y: Math.round(y), k: kind });
  }

  // ---------------------------------------------------- Calculs tourelles
  recomputeTowers() {
    this.towersDirty = false;
    const power = synergyPower(this.towers);
    const ppower = this.players.map(() => 0);
    for (const t of this.towers) {
      const w = synergyWeight(t.level);
      for (const o of t.owners) ppower[o] += w / t.owners.length;
    }
    const active = new Set();
    for (const syn of SYNERGIES) {
      if (syn.type && power[syn.type] >= syn.need) active.add(syn.id);
      else if (syn.special === 'arsenal' && Object.values(power).filter((v) => v > 0).length >= ARSENAL_NEED) active.add(syn.id);
      else if (syn.special === 'fraternity' && ppower.filter((v) => v >= FRATERNITY_NEED).length >= 2) active.add(syn.id);
    }
    for (const id of active) if (!this.synergies.has(id)) this.emit({ e: 'synergy', id, on: 1 });
    for (const id of this.synergies) if (!active.has(id)) this.emit({ e: 'synergy', id, on: 0 });
    this.synergies = active;
    this.power = power;

    const R2 = COOP.linkRadius * COOP.linkRadius;
    const A2 = 110 * 110;
    for (const t of this.towers) {
      const others = new Set();
      let aura = 0;
      for (const u of this.towers) {
        if (u === t) continue;
        const dx = u.x - t.x;
        const dy = u.y - t.y;
        const d2 = dx * dx + dy * dy;
        if (d2 <= R2) for (const o of u.owners) if (!t.owners.includes(o)) others.add(o);
        if (d2 <= A2 && RARITIES[u.rarity].aura) aura = Math.max(aura, RARITIES[u.rarity].aura);
      }
      t.link = others.size >= 2 ? COOP.linkBonus2 : others.size === 1 ? COOP.linkBonus1 : 0;
      t.linkWith = [...others];
      t.aura = aura;
    }
    const ctx = { synergies: active, training: this.team.training || 0 };
    for (const t of this.towers) {
      t.stats = computeTowerStats(t, ctx);
      const kind = t.stats.kind === 'mortar' ? 'explosion' : t.stats.kind;
      t.src = {
        tower: t,
        owners: t.owners,
        kind,
        armorPierce: t.stats.armorPierce,
        bossMult: t.stats.bossMult,
        airMult: t.stats.airMult,
      };
      t.src.splash = { ...t.src, kind: 'explosion' };
      t.srcChain = { ...t.src, kind: 'chain' };
    }
    this.towersVersion++;
  }

  // ---------------------------------------------------------------- Vagues
  computePreview(w) {
    if (this.totalWaves && w > this.totalWaves) return null;
    const def = getWaveDef(w, this.seed);
    const counts = {};
    const cm = countMult(w);
    for (const g of def.groups) {
      const big = ENEMY_TYPES[g.t].boss || ENEMY_TYPES[g.t].miniboss;
      counts[g.t] = (counts[g.t] || 0) + (big ? g.n : Math.round(g.n * cm));
    }
    return {
      w,
      name: def.name || null,
      boss: !!def.boss,
      mini: !!def.mini,
      ev: this.nextEvent,
      groups: Object.entries(counts).map(([t, n]) => [ENEMY_INDEX[t], n]),
    };
  }

  // Tirage de l'événement de la prochaine vague et du marchand (pendant la préparation).
  rollEvents(nextWave) {
    this.nextEvent = null;
    this.merchant = null;
    const def = getWaveDef(nextWave, this.seed);
    if (nextWave >= EVENT_MIN_WAVE && !def.boss && !def.mini && this.rng.next() < EVENT_CHANCE) {
      const pool = WAVE_EVENT_IDS.filter((id) => id !== this.lastEventId);
      this.nextEvent = pool[Math.floor(this.rng.next() * pool.length)];
      this.lastEventId = this.nextEvent;
    }
    if (nextWave > MERCHANT_MIN_WAVE && this.rng.next() < MERCHANT_CHANCE) {
      const pool = MERCHANT_DEAL_IDS.slice();
      const deals = [];
      while (deals.length < 3 && pool.length) deals.push(pool.splice(Math.floor(this.rng.next() * pool.length), 1)[0]);
      this.merchant = { deals, bought: this.players.map(() => []) };
      this.emit({ e: 'merchant', deals });
    }
  }

  startWave() {
    const early = this.timer;
    this.wave++;
    const def = getWaveDef(this.wave, this.seed);
    if (early >= 1 && this.wave > 1) {
      const bonus = Math.floor(Math.floor(early) * 0.6 * (1 + 0.05 * this.wave) * this.diff.gold);
      if (bonus > 0) {
        for (const p of this.players) {
          p.gold += bonus;
          p.stats.gold += bonus;
        }
        this.emit({ e: 'info', m: `Départ anticipé : +${bonus} or pour chaque joueur.`, k: 'gold' });
      }
    }
    const queue = [];
    const cm = countMult(this.wave);
    const im = intervalMult(this.wave);
    def.groups.forEach((g, gi) => {
      const big = ENEMY_TYPES[g.t].boss || ENEMY_TYPES[g.t].miniboss;
      const n = big ? g.n : Math.round(g.n * cm);
      const interval = big ? g.i : g.i * im;
      for (let k = 0; k < n; k++) {
        queue.push({ time: g.d + k * interval, type: g.t, pathIdx: (gi + k) % this.paths.length, phases: def.bossPhases });
      }
    });
    const ev = this.nextEvent ? WAVE_EVENTS[this.nextEvent] : null;
    if (ev && ev.extra) {
      const g = ev.extra(this.wave);
      for (let k = 0; k < g.n; k++) queue.push({ time: g.d + k * g.i, type: g.t, pathIdx: k % this.paths.length });
    }
    queue.sort((a, b) => a.time - b.time);
    this.waveEvent = ev;
    this.nextEvent = null;
    this.merchant = null;
    this.rangeMult = ev && ev.rangeMult ? ev.rangeMult : 1;
    if (ev && ev.disable && this.towers.length) {
      const n = Math.max(1, Math.round(this.towers.length * ev.disable.frac));
      const pool = this.towers.slice();
      for (let k = 0; k < n && pool.length; k++) {
        const t = pool.splice(Math.floor(this.rng.next() * pool.length), 1)[0];
        t.disabledT = Math.max(t.disabledT, ev.disable.dur);
      }
      this.towersVersion++;
    }
    this.phase = PHASE.WAVE;
    this.timer = 0;
    this.waveState = {
      def,
      queue,
      qi: 0,
      time: 0,
      kills: 0,
      leaks: 0,
      baseDmg: 0,
      total: 0,
      hpTotal: 0,
      bossKilled: false,
      perPlayer: this.players.map(() => ({ kills: 0, damage: 0, gold: 0 })),
    };
    for (const p of this.players) p.ready = false;
    this.nextPreview = null;
    this.emit({ e: 'waveStart', w: this.wave, boss: def.boss ? 1 : 0, mini: def.mini ? 1 : 0, n: def.name || null, ev: ev ? ev.id : null });
  }

  updateWaveSpawns(dt) {
    const ws = this.waveState;
    ws.time += dt;
    while (ws.qi < ws.queue.length && ws.queue[ws.qi].time <= ws.time) {
      const q = ws.queue[ws.qi++];
      this.spawnEnemy(q.type, { pathIdx: q.pathIdx, phases: q.phases });
    }
  }

  remaining() {
    let alive = 0;
    for (const e of this.enemies) if (!e.dead) alive++;
    const ws = this.waveState;
    return alive + (ws && this.phase === PHASE.WAVE ? ws.queue.length - ws.qi : 0);
  }

  endWave() {
    const w = this.wave;
    const ws = this.waveState;
    const perfect = ws.leaks === 0;
    let reward = waveReward(w) * this.diff.gold * (this.waveEvent && this.waveEvent.rewardMult ? this.waveEvent.rewardMult : 1);
    if (perfect) reward *= 1.25;
    reward += 15 * (this.team.generator || 0);
    reward = Math.round(reward);
    for (const p of this.players) {
      p.gold += reward;
      p.stats.gold += reward;
    }
    const team = teamWaveReward(w);
    this.teamGold += team;
    const summary = {
      w,
      reward,
      team,
      perfect: perfect ? 1 : 0,
      time: Math.round(ws.time),
      kills: ws.kills,
      leaks: ws.leaks,
      baseDmg: Math.round(ws.baseDmg),
      boss: ws.bossKilled ? 1 : 0,
      hpTotal: Math.round(ws.hpTotal),
      players: ws.perPlayer.map((s) => ({ k: s.kills, d: Math.round(s.damage), g: Math.round(s.gold) })),
    };
    this.lastWaveSummary = summary;
    this.history.push({ w, hp: Math.round(this.base.hp), leaks: ws.leaks });
    this.emit({ e: 'waveEnd', ...summary });
    this.waveState = null;
    this.waveEvent = null;
    this.rangeMult = 1;
    this.projectiles.length = 0;
    this.zones.length = 0;
    this.delayed.length = 0;
    if (this.totalWaves && w >= this.totalWaves) {
      this.endGame(true);
      return;
    }
    this.phase = PHASE.PREP;
    const nextDef = getWaveDef(w + 1, this.seed);
    this.timer = prepTime(w + 1, nextDef);
    this.rollEvents(w + 1);
    this.nextPreview = this.computePreview(w + 1);
  }

  endGame(victory) {
    if (this.result) return;
    this.phase = victory ? PHASE.VICTORY : PHASE.DEFEAT;
    const cleared = victory ? this.wave : Math.max(0, this.wave - 1);
    const diffXp = this.diff.xp;
    this.result = {
      victory,
      wave: this.wave,
      cleared,
      time: Math.round(this.time),
      difficulty: this.difficulty,
      mode: this.mode,
      map: this.mapId,
      players: this.players.map((p) => {
        const s = p.stats;
        const xp = Math.round(
          (cleared * 12 + s.kills * 0.15 + s.bosses * 60 + s.fusions * 4 + s.coopFusions * 10 + s.coopCombos * 0.5 + (victory ? 250 : 0)) *
            diffXp,
        );
        return {
          id: p.id,
          name: p.name,
          color: p.color,
          bot: p.bot,
          xp,
          stats: { ...s, damage: Math.round(s.damage), gold: Math.round(s.gold) },
        };
      }),
    };
    for (const e of this.enemies) e.dead = true;
    this.emit({ e: victory ? 'victory' : 'defeat', w: this.wave });
  }

  // ------------------------------------------------------------------ Tick
  step(dt) {
    this.tick++;
    this.processCommands();
    if (this.towersDirty) this.recomputeTowers();
    if (this.phase === PHASE.VICTORY || this.phase === PHASE.DEFEAT) return;
    this.time += dt;

    for (const p of this.players) {
      for (let i = 0; i < p.cds.length; i++) if (p.cds[i] > 0) p.cds[i] = Math.max(0, p.cds[i] - dt);
      if (p.overchargeT > 0) p.overchargeT = Math.max(0, p.overchargeT - dt);
    }
    this.updateFusionRequests(dt);

    if (this.phase === PHASE.PREP) {
      this.timer -= dt;
      if (this.timer <= 0 || this.allReady()) this.startWave();
    }
    if (this.phase === PHASE.WAVE) {
      this.updateWaveSpawns(dt);
      this.updateEnemies(dt);
      if (this.phase !== PHASE.WAVE) return;
      this.updateTowers(dt);
      this.updateProjectiles(dt);
      this.updateZones(dt);
      this.updateDelayed(dt);
      this.updateBaseCannon(dt);
      this.cleanupEnemies();
      if (this.phase !== PHASE.WAVE) return;
      const ws = this.waveState;
      if (ws.qi >= ws.queue.length && this.enemies.length === 0) this.endWave();
    }
    if (this.towersDirty) this.recomputeTowers();
  }

  cleanupEnemies() {
    let w = 0;
    for (const e of this.enemies) {
      if (e.dead) this.enemyById.delete(e.id);
      else this.enemies[w++] = e;
    }
    this.enemies.length = w;
  }

  // -------------------------------------------------------------- Snapshot
  bossInfo() {
    let boss = null;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.boss || (e.mini && (!boss || !boss.boss))) boss = e;
      if (e.boss) break;
    }
    if (!boss) return null;
    return {
      id: boss.id,
      n: boss.def.name,
      boss: boss.boss ? 1 : 0,
      hp: Math.ceil(boss.hp),
      max: Math.ceil(boss.maxHp),
      ph: boss.phase,
      mph: boss.maxPhase,
      phn: boss.def.phases ? boss.def.phases[boss.phase - 1].name : null,
      th: boss.def.phases ? boss.def.phases.slice(1, boss.maxPhase).map((p) => p.at) : [],
      as: boss.assault ? 1 : 0,
      inv: boss.invulnT > 0 ? 1 : 0,
      prog: Math.round((boss.dist / boss.path.length) * 1000) / 1000,
    };
  }

  serializeTower(t) {
    const s = t.stats || computeTowerStats(t, null);
    return {
      id: t.id,
      tt: t.type,
      l: t.level,
      r: t.rarity,
      b: t.branch,
      o: t.owner,
      os: t.owners,
      c: t.c,
      rw: t.r,
      x: t.x,
      y: t.y,
      tm: t.targetMode,
      up: [t.up.dmg, t.up.rate, t.up.range],
      dis: t.disabledT > 0 ? 1 : 0,
      lk: t.link,
      lw: t.linkWith || [],
      au: t.aura,
      k: t.kills,
      dd: Math.round(t.dmg),
      inv: t.invested,
      st: {
        dmg: r1(s.damage),
        rate: Math.round(s.rate * 100) / 100,
        range: Math.round(s.range),
        dps: Math.round(s.dps),
        splash: Math.round(s.splash),
        crit: Math.round(s.crit * 100),
        ap: Math.round(s.armorPierce),
        pierce: s.pierce,
        multi: s.multi,
        air: s.air ? 1 : 0,
        min: s.minRange,
        chains: s.chains,
        stun: Math.round(s.stun * 100) / 100,
        slow: s.slow ? Math.round(s.slow.pct * 100) : 0,
        detect: s.detect ? 1 : 0,
        aura: s.aura ? 1 : 0,
      },
    };
  }

  enemyFlags(e) {
    let f = 0;
    if (e.st.slow) f |= 1;
    if (e.st.burn) f |= 2;
    if (e.st.brk) f |= 4;
    if (e.st.mark) f |= 8;
    if (e.invulnT > 0) f |= 16;
    if (e.chargeT > 0 || (e.boss && e.phase >= 3)) f |= 32;
    if (e.flying) f |= 64;
    if (e.stealth && !e.revealed) f |= 128;
    if (e.rush) f |= 256;
    if (e.st.stun) f |= 512;
    if (e.st.chill) f |= 1024;
    return f;
  }

  snapshot(includeTowers = true) {
    const snap = {
      tick: this.tick,
      time: Math.round(this.time * 100) / 100,
      phase: this.phase,
      wave: this.wave,
      total: this.totalWaves,
      timer: r1(Math.max(0, this.timer)),
      speed: this.speed,
      diff: this.difficulty,
      mode: this.mode,
      map: this.mapId,
      base: {
        hp: Math.ceil(this.base.hp),
        max: this.base.maxHp,
        sh: Math.round(this.base.shield),
        ar: this.base.armorLvl,
        cn: this.base.cannonLvl,
      },
      team: Math.floor(this.teamGold),
      tl: this.team,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        bot: p.bot ? 1 : 0,
        on: p.connected ? 1 : 0,
        ap: p.autopilot ? 1 : 0,
        gold: Math.floor(p.gold),
        cores: p.cores,
        ready: p.ready ? 1 : 0,
        cds: p.cds.map(r1),
        oc: r1(p.overchargeT),
        sv: p.speedVote ? 1 : 0,
        skin: p.skin,
      })),
      enemies: this.enemies
        .filter((e) => !e.dead)
        .map((e) => [
          e.id,
          ENEMY_INDEX[e.type],
          Math.round(e.x),
          Math.round(e.y),
          Math.ceil(e.hp),
          Math.ceil(e.maxHp),
          this.enemyFlags(e),
          Math.round(e.armor),
          Math.ceil(e.shield),
          Math.ceil(e.maxShield),
        ]),
      boss: this.bossInfo(),
      reqs: this.fusionRequests.map((r) => ({
        id: r.id,
        from: r.from,
        primary: r.primary,
        partners: r.partners,
        core: r.core ? 1 : 0,
        need: r.need,
        acc: r.acc,
        t: Math.ceil(r.t),
        tt: r.type,
        l: r.level,
        hy: r.hybrid || null,
      })),
      syn: [...this.synergies],
      next: this.nextPreview,
      ev: this.waveEvent ? this.waveEvent.id : null,
      merchant: this.merchant ? { deals: this.merchant.deals, bought: this.merchant.bought } : null,
      remain: this.remaining(),
      zones: this.zones.map((z) => [z.id, Math.round(z.x), Math.round(z.y), Math.round(z.r), r1(z.t)]),
      tv: this.towersVersion,
      events: this.drainEvents(),
    };
    if (includeTowers) snap.towers = this.towers.map((t) => this.serializeTower(t));
    if (this.result) snap.result = this.result;
    return snap;
  }
}

Object.assign(Game.prototype, CombatMixin, EnemyMixin, TowerMixin, FusionMixin);

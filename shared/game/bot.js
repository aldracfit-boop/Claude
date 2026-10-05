// Intelligence artificielle d'un coéquipier. Elle utilise exactement les mêmes
// commandes qu'un joueur humain (aucune triche) : placement, fusion, amélioration,
// spécialisation, capacités, trésor d'équipe, réponses aux demandes de fusion.
// Elle sert aussi au simulateur d'équilibrage (tools/simulate.js).

import { TILE, COLS, ROWS, PHASE, FUSION_COUNT, MAX_LEVEL, BRANCH_LEVEL } from '../constants.js';
import { TOWER_TYPES, TOWER_IDS } from '../data/towers.js';
import { ENEMY_IDS } from '../data/enemies.js';
import { TEAM_ITEMS, ABILITIES } from '../data/team.js';
import { MERCHANT_DEALS } from '../data/events.js';
import { RNG } from '../util.js';
import { upgradeCost, upgradeSlots, upgradesUsed } from './stats.js';

export const BOT_STYLES = {
  artillery: { name: 'Artilleur', focus: ['mortar', 'canon'], branches: { mortar: 'C', canon: 'B', mg: 'C', sniper: 'A' } },
  marksman: { name: 'Tireur', focus: ['sniper', 'mg'], branches: { sniper: 'A', mg: 'C', canon: 'A', mortar: 'A' } },
  balanced: { name: 'Polyvalent', focus: ['canon', 'sniper'], branches: { canon: 'B', sniper: 'C', mg: 'A', mortar: 'B' } },
  swarm: { name: 'Nettoyeur', focus: ['mg', 'mortar'], branches: { mg: 'A', mortar: 'A', canon: 'C', sniper: 'B' } },
};
const STYLE_ORDER = ['artillery', 'marksman', 'balanced', 'swarm'];

export class BotBrain {
  constructor(game, pid, opts = {}) {
    this.g = game;
    this.pid = pid;
    this.rng = new RNG((game.seed ^ (pid * 0x9e3779b1)) >>> 0);
    this.styleId = opts.style && BOT_STYLES[opts.style] ? opts.style : STYLE_ORDER[pid % STYLE_ORDER.length];
    this.style = BOT_STYLES[this.styleId];
    this.skill = opts.skill ?? 1;
    this.proposeToHumans = opts.proposeToHumans ?? true;
    this.interval = opts.interval ?? 0.6;
    this.thinkT = 0.3 + pid * 0.17;
    this.scoreCache = new Map();
    this.proposeCd = 20;
    this.saidBoss = 0;
    this.lastWave = -1;
  }

  update(dt) {
    this.proposeCd -= dt;
    this.thinkT -= dt;
    if (this.thinkT > 0) return;
    this.thinkT = this.interval;
    const g = this.g;
    if (g.phase === PHASE.VICTORY || g.phase === PHASE.DEFEAT) return;
    this.think();
  }

  cmd(c) {
    this.g.command(this.pid, c);
  }

  get me() {
    return this.g.players[this.pid];
  }

  // ----------------------------------------------------------- Évaluation
  // Score de couverture d'une case pour un type de tourelle.
  tileScores(type) {
    if (this.scoreCache.has(type)) return this.scoreCache.get(type);
    const g = this.g;
    const def = TOWER_TYPES[type];
    const range = def.range * 1.05;
    const minR = def.minRange || 0;
    const samples = [];
    for (const path of g.paths) {
      for (let d = 0; d < path.length; d += 20) {
        const pt = pointAt(path, d);
        // les derniers mètres valent un peu plus (dernière ligne de défense)
        samples.push([pt.x, pt.y, 1 + 0.4 * (d / path.length), false]);
      }
    }
    if (def.air) {
      for (const path of g.airPaths) {
        for (let d = 0; d < path.length; d += 20) {
          const pt = pointAt(path, d);
          samples.push([pt.x, pt.y, 1.2, true]);
        }
      }
    }
    const scores = new Float32Array(COLS * ROWS);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = (c + 0.5) * TILE;
        const y = (r + 0.5) * TILE;
        let s = 0;
        let sAir = 0;
        for (const [sx, sy, w, air] of samples) {
          const d = Math.hypot(sx - x, sy - y);
          if (d <= range && d >= minR) {
            if (air) sAir += w;
            else s += w;
          }
        }
        scores[r * COLS + c] = s + sAir * 0.6;
      }
    }
    const res = { scores };
    this.scoreCache.set(type, res);
    return res;
  }

  bestTile(type) {
    const g = this.g;
    const { scores } = this.tileScores(type);
    const cands = [];
    for (let i = 0; i < scores.length; i++) {
      const c = i % COLS;
      const r = (i / COLS) | 0;
      if (!g.isBuildable(c, r)) continue;
      // éviter de s'entasser exactement sur les mêmes cases que les alliés : petit bonus de coopération
      let bonus = 0;
      for (const t of g.towers) {
        const d = Math.abs(t.c - c) + Math.abs(t.r - r);
        if (d <= 2 && !t.owners.includes(this.pid)) bonus += 0.6;
      }
      cands.push([scores[i] + bonus, c, r]);
    }
    if (!cands.length) return null;
    cands.sort((a, b) => b[0] - a[0]);
    const top = this.skill >= 1 ? 1 : Math.max(1, Math.round((1 - this.skill) * 10));
    const pick = cands[Math.floor(this.rng.next() * Math.min(top, cands.length))];
    return pick[0] > 3 ? { c: pick[1], r: pick[2], score: pick[0] } : null;
  }

  myTowers() {
    return this.g.towers.filter((t) => t.owners.length === 1 && t.owners[0] === this.pid);
  }

  upcoming() {
    const g = this.g;
    const types = new Set();
    let boss = false;
    if (g.phase === PHASE.WAVE) {
      for (const e of g.enemies) types.add(e.type);
      if (g.waveState) for (let i = g.waveState.qi; i < g.waveState.queue.length; i++) types.add(g.waveState.queue[i].type);
      if (g.waveState && g.waveState.def.boss) boss = true;
    } else if (g.nextPreview) {
      for (const [ti] of g.nextPreview.groups) types.add(ENEMY_IDS[ti]);
      boss = g.nextPreview.boss || g.nextPreview.mini;
    }
    return { types, boss };
  }

  chooseType() {
    const g = this.g;
    const mine = this.myTowers();
    // Compléter un trio de fusion en priorité.
    const groups = groupTowers(mine);
    let best = null;
    for (const [key, arr] of groups) {
      const [type, level] = key.split('|');
      if (+level !== 1 || arr.length >= FUSION_COUNT) continue;
      if (!best || arr.length > best.n) best = { type, n: arr.length };
    }
    const up = this.upcoming();
    const teamAir = g.towers.filter((t) => t.stats && t.stats.air).reduce((a, t) => a + t.level, 0);
    if (up.types.has('drone') && teamAir < 3 + g.wave * 0.5 && this.rng.next() < 0.6) {
      return this.style.focus.includes('mg') ? 'mg' : this.style.focus.includes('sniper') ? 'sniper' : 'canon';
    }
    if (best && best.n >= 1 && this.rng.next() < 0.8) return best.type;
    const r = this.rng.next();
    if (r < 0.5) return this.style.focus[0];
    if (r < 0.85) return this.style.focus[1];
    return TOWER_IDS[Math.floor(this.rng.next() * TOWER_IDS.length)];
  }

  // ------------------------------------------------------------- Décision
  think() {
    const g = this.g;
    const me = this.me;

    // 1. Répondre aux demandes de fusion.
    for (const r of g.fusionRequests) {
      if (r.need.includes(this.pid) && !r.acc.includes(this.pid)) {
        this.cmd({ a: 'fuseReply', id: r.id, ok: true });
      }
    }

    // 2. Spécialisations.
    for (const t of this.myTowers()) {
      if (t.level >= BRANCH_LEVEL && !t.branch) {
        this.cmd({ a: 'branch', id: t.id, b: this.style.branches[t.type] || 'A' });
      }
    }

    // 3. Fusions personnelles.
    const fused = this.tryFusions();

    // 4. Capacités.
    if (g.phase === PHASE.WAVE) this.useAbilities();

    // 5. Trésor d'équipe (un seul « intendant » : l'IA de plus petit identifiant).
    const steward = g.players.find((p) => p.bot || p.autopilot);
    if (steward && steward.id === this.pid) this.teamShop();

    // 6. Marchand : un Noyau de fusion est toujours une bonne affaire.
    if (g.merchant && g.phase === PHASE.PREP && g.merchant.deals.includes('core') && !g.merchant.bought[this.pid].includes('core')) {
      if (me.gold >= MERCHANT_DEALS.core.cost(Math.max(1, g.wave)) + 150) this.cmd({ a: 'merchant', deal: 'core' });
    }

    // 7. Dépenses.
    if (!fused) this.spend();

    // 8. Communication.
    if (g.phase === PHASE.WAVE && g.waveState && g.waveState.def.boss && this.saidBoss !== g.wave && this.pid === steward?.id) {
      this.saidBoss = g.wave;
      this.cmd({ a: 'chat', q: 2 });
    }

    // 9. Prêt pour la vague suivante.
    if (g.phase === PHASE.PREP && !me.ready) this.cmd({ a: 'ready', v: true });
  }

  tryFusions() {
    const g = this.g;
    const me = this.me;
    const groups = groupTowers(this.myTowers());
    for (const [key, arr] of groups) {
      const level = +key.split('|')[1];
      if (level >= MAX_LEVEL) continue;
      const scores = this.tileScores(arr[0].type).scores;
      arr.sort((a, b) => scores[b.r * COLS + b.c] - scores[a.r * COLS + a.c]);
      if (arr.length >= FUSION_COUNT) {
        const [p, ...rest] = arr;
        this.cmd({ a: 'fuse', id: p.id, partners: rest.slice(0, FUSION_COUNT - 1).map((t) => t.id) });
        return true;
      }
      if (arr.length === FUSION_COUNT - 1 && me.cores > 0 && level >= 2) {
        this.cmd({ a: 'fuse', id: arr[0].id, partners: [arr[1].id], core: true });
        return true;
      }
      // Fusion d'équipe : il me manque une tourelle, un allié en possède une.
      if (arr.length === FUSION_COUNT - 1 && level >= 2 && this.proposeCd <= 0) {
        const partner = g.towers.find(
          (u) =>
            !u.owners.includes(this.pid) &&
            u.type === arr[0].type &&
            u.level === level &&
            (!u.branch || !arr.some((a) => a.branch && a.branch !== u.branch)) &&
            u.owners.every((o) => g.players[o].bot || g.players[o].autopilot || this.proposeToHumans),
        );
        if (partner && !g.fusionRequests.some((r) => r.from === this.pid)) {
          this.proposeCd = 60;
          this.cmd({ a: 'fuse', id: arr[0].id, partners: [arr[1].id, partner.id] });
          if (partner.owners.some((o) => !g.players[o].bot)) this.cmd({ a: 'chat', q: 1 });
          return true;
        }
      }
    }
    return false;
  }

  useAbilities() {
    const g = this.g;
    const me = this.me;
    const alive = g.enemies.filter((e) => !e.dead);
    if (!alive.length) return;
    const boss = alive.find((e) => e.boss || e.mini);
    // Frappe aérienne : sur le groupe le plus dense.
    const si = ABILITIES.findIndex((a) => a.id === 'strike');
    if (me.cds[si] <= 0) {
      let best = null;
      let bestN = 0;
      for (const e of alive) {
        let n = 0;
        for (const f of alive) if ((f.x - e.x) ** 2 + (f.y - e.y) ** 2 < 80 * 80) n += f.boss || f.mini ? 6 : 1;
        if (n > bestN) {
          bestN = n;
          best = e;
        }
      }
      if (best && bestN >= 6) {
        const p = g.predictPos(best, 0.8, { x: 0, y: 0 });
        this.cmd({ a: 'ability', i: si, x: p.x, y: p.y });
      }
    }
    const fi = ABILITIES.findIndex((a) => a.id === 'freeze');
    if (me.cds[fi] <= 0) {
      const late = alive.filter((e) => e.dist / e.path.length > 0.8).length;
      if ((boss && boss.dist / boss.path.length > 0.45) || late >= 4 || alive.length >= 30) {
        this.cmd({ a: 'ability', i: fi });
      }
    }
    const oi = ABILITIES.findIndex((a) => a.id === 'overcharge');
    if (me.cds[oi] <= 0 && (boss || alive.length >= 18)) {
      this.cmd({ a: 'ability', i: oi });
    }
  }

  teamShop() {
    const g = this.g;
    const b = g.base;
    const n = (id) => g.team[id] || 0;
    const can = (id) => {
      const it = TEAM_ITEMS[id];
      return (!it.max || n(id) < it.max) && g.teamGold >= it.cost(n(id));
    };
    if (b.hp < b.maxHp * 0.55 && can('repair')) return this.cmd({ a: 'team', item: 'repair' });
    if (g.nextPreview && g.nextPreview.boss && b.shield < 250 && can('shield')) return this.cmd({ a: 'team', item: 'shield' });
    if (g.wave <= 8 && can('generator')) return this.cmd({ a: 'team', item: 'generator' });
    if (can('training')) return this.cmd({ a: 'team', item: 'training' });
    if (g.wave >= 8 && can('cannon')) return this.cmd({ a: 'team', item: 'cannon' });
    if (g.wave >= 6 && can('armor')) return this.cmd({ a: 'team', item: 'armor' });
  }

  spend() {
    const me = this.me;
    const type = this.chooseType();
    const def = TOWER_TYPES[type];
    if (me.gold >= def.cost) {
      const tile = this.bestTile(type);
      if (tile) {
        this.cmd({ a: 'place', tt: type, c: tile.c, r: tile.r });
        return;
      }
    }
    // Pas de place ou pas assez d'or pour ce type : améliorer une tourelle de haut niveau.
    const mine = this.myTowers().filter((t) => t.level >= 3 && upgradesUsed(t) < upgradeSlots(t));
    if (!mine.length) return;
    mine.sort((a, b) => b.level - a.level || (b.stats?.dps || 0) - (a.stats?.dps || 0));
    const t = mine[0];
    const cost = upgradeCost(t);
    if (me.gold >= cost + 40) {
      const stat = t.up.dmg <= t.up.rate ? 'dmg' : 'rate';
      this.cmd({ a: 'upgrade', id: t.id, s: stat });
    }
  }
}

function groupTowers(list) {
  const groups = new Map();
  for (const t of list) {
    const key = `${t.type}|${t.level}|${t.branch || '-'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  // Les tourelles non spécialisées peuvent rejoindre un groupe spécialisé.
  for (const [key, arr] of groups) {
    const [type, level, branch] = key.split('|');
    if (branch === '-') continue;
    const free = groups.get(`${type}|${level}|-`);
    if (free) for (const t of free) if (!arr.includes(t)) arr.push(t);
  }
  return groups;
}

function pointAt(path, d) {
  for (const s of path.segs) {
    if (d <= s.start + s.len) {
      const t = d - s.start;
      return { x: s.x1 + s.dx * t, y: s.y1 + s.dy * t };
    }
  }
  const last = path.segs[path.segs.length - 1];
  return { x: last.x2, y: last.y2 };
}

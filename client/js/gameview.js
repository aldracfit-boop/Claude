// Vue de jeu : relie session, état, rendu, HUD, entrées, audio et tutoriel.

import { h, fmtInt, fmtDuration } from './dom.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { ClientState } from './state.js';
import { Renderer } from './render/renderer.js';
import { Effects } from './render/effects.js';
import { Tutorial } from './tutorial.js';
import { audio } from './audio.js';
import { profile, xpForLevel } from './profile.js';
import { Game, CELL } from '../../shared/game/Game.js';
import {
  COLS,
  WORLD_W,
  WORLD_H,
  QUICK_CHAT,
  RARITIES,
  PLAYER_COLORS,
  DIFFICULTIES,
  MODES,
  FUSION_COUNT,
  TARGET_MODES,
} from '../../shared/constants.js';
import { TOWER_TYPES } from '../../shared/data/towers.js';
import { ENEMY_TYPES, ENEMY_IDS } from '../../shared/data/enemies.js';
import { ABILITIES, SYNERGIES, COMBOS, TEAM_ITEMS } from '../../shared/data/team.js';

const ENEMY_DEFS = ENEMY_IDS.map((id) => ENEMY_TYPES[id]);

export class GameView {
  constructor(app, session, opts = {}) {
    this.app = app;
    this.session = session;
    this.opts = opts;
    this.state = new ClientState();
    this.fx = new Effects();
    this.fx.shakeEnabled = profile.settings.shake;
    this.fx.showDamage = profile.settings.damage;
    this.mapGame = session.isLocal ? session.game : new Game({ mapId: opts.mapId, players: [{ name: 'x' }] });
    this.ui = {
      me: session.activePid,
      placing: null,
      moving: null,
      selectedId: null,
      selectedEnemyId: null,
      hoverTile: null,
      hoverTowerId: null,
      hoverEnemyId: null,
      mouseWorld: null,
      abilityTarget: null,
      fusionSel: null,
      pingMode: false,
      canPlaceAt: (c, r) => this.canPlaceAt(c, r),
    };
    this.actions = this.makeActions();
    this.hud = new Hud(this);
    this.mood = null;
    this.ended = false;
    this.lastHud = 0;
    this.sellArm = null;
  }

  mount(root) {
    this.root = root;
    this.hud.build(root);
    this.renderer = new Renderer(this.hud.canvas, this.mapGame, this.fx);
    this.input = new Input(this);
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(this.hud.stage);
    this.resize();
    if (this.opts.tutorial) this.tutorial = new Tutorial(this.hud.overlay, () => this.ui.me);
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.frame(t));
    audio.setVolumes(profile.settings.music, profile.settings.sfx);
    audio.setMood('prep');
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.raf = null;
    this.resizeObs?.disconnect();
    this.input?.destroy();
    this.session.destroy();
    audio.setMood('menu');
  }

  resize() {
    const st = this.hud.stage;
    const W = st.clientWidth;
    const H = st.clientHeight;
    if (!W || !H) return;
    let w = Math.min(W, (H * WORLD_W) / WORLD_H);
    let hh = (w * WORLD_H) / WORLD_W;
    w = Math.floor(w);
    hh = Math.floor(hh);
    this.hud.stageInner.style.width = `${w}px`;
    this.hud.stageInner.style.height = `${hh}px`;
    this.renderer.resize(w, hh);
  }

  audioInit() {
    audio.init();
  }

  audio(name, opts) {
    audio.play(name, opts);
  }

  send(cmd) {
    this.session.send(cmd);
  }

  // ------------------------------------------------------------ Boucle
  frame(now) {
    if (!this.raf) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const snap = this.session.update(dt);
    if (snap) this.onSnapshot(snap, now);
    this.state.updateRender(now);
    if (!this.session.paused) this.fx.update(dt, this.state.enemies);
    this.renderer.draw(now, this.state, this.ui);
    if (now - this.lastHud > 100 && this.state.snap) {
      this.lastHud = now;
      this.ui.me = this.session.activePid;
      this.hud.update(this.state, this.ui);
    }
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  onSnapshot(snap, now) {
    this.state.apply(snap, now);
    this.ui.me = this.session.activePid;
    for (const ev of snap.events || []) {
      try {
        this.handleEvent(ev, now);
      } catch (err) {
        console.error('Événement', ev, err);
      }
      if (this.tutorial && !this.tutorial.closed) this.tutorial.onEvent(ev);
    }
    let mood = 'prep';
    if (snap.phase === 'wave') mood = snap.boss && snap.boss.boss ? 'boss' : 'wave';
    else if (snap.phase === 'victory' || snap.phase === 'defeat') mood = 'off';
    if (mood !== this.mood) {
      this.mood = mood;
      audio.setMood(mood);
    }
    if (snap.result && !this.ended) {
      this.ended = true;
      setTimeout(() => this.showEnd(snap.result), 1600);
    }
  }

  isLocalPid(pid) {
    return this.session.humanPids.includes(pid);
  }

  towerName(t) {
    const def = TOWER_TYPES[t.tt];
    return def.name + (t.b ? ` · ${def.branches[t.b].name}` : '');
  }

  // ------------------------------------------------------------ Événements
  handleEvent(ev, now) {
    const fx = this.fx;
    const me = this.ui.me;
    const snap = this.state.snap;
    switch (ev.e) {
      case 'shot': {
        const t = this.state.towers.get(ev.tw);
        if (t) {
          t.aim = Math.atan2(ev.y2 - ev.y1, ev.x2 - ev.x1);
          t.recoil = 1;
        }
        if (ev.k === 'shell') {
          fx.shell(ev.x1, ev.y1, ev.x2, ev.y2, ev.tg, ev.sp, ev.m, ev.l);
          audio.play('shell');
        } else if (ev.k === 'bullet') {
          const ang = Math.atan2(ev.y2 - ev.y1, ev.x2 - ev.x1);
          const sx = ev.x1 + Math.cos(ang) * 16;
          const sy = ev.y1 + Math.sin(ang) * 16;
          fx.tracer(sx, sy, ev.x2, ev.y2, ev.c ? '#ffb347' : 'rgba(255, 240, 150, 0.85)', ev.c ? 2.5 : 1.3, 0.07);
          if (Math.random() < 0.3) fx.burst(ev.x2, ev.y2, '#fff3b0', 2, 60, 0.15, 1.5);
          audio.play('bullet');
        } else if (ev.k === 'snipe') {
          const ang = Math.atan2(ev.y2 - ev.y1, ev.x2 - ev.x1);
          const sx = ev.x1 + Math.cos(ang) * 20;
          const sy = ev.y1 + Math.sin(ang) * 20;
          fx.tracer(sx, sy, ev.x2, ev.y2, ev.p ? '#7cc0ff' : '#e8d6ff', ev.p ? 4 : 2.5, 0.22);
          fx.tracer(sx, sy, ev.x2, ev.y2, '#ffffff', 1, 0.12);
          fx.burst(sx, sy, '#ffffff', 4, 80, 0.15, 2);
          audio.play('snipe');
        } else if (ev.k === 'mortar') {
          fx.mortar(ev.x1, ev.y1, ev.x2, ev.y2, ev.d, ev.l);
          fx.smoke(ev.x1, ev.y1 - 6, 1, 'rgba(160,160,170,0.5)');
          audio.play('mortar');
        } else if (ev.k === 'base') {
          this.renderer.cannonAngle = Math.atan2(ev.y2 - ev.y1, ev.x2 - ev.x1);
          fx.tracer(ev.x1, ev.y1, ev.x2, ev.y2, '#9fd3ff', 2.5, 0.12);
          audio.play('base');
        }
        break;
      }
      case 'boom':
        fx.explosion(ev.x, ev.y, ev.r, ev.k);
        if (ev.k !== 'shell' && ev.k !== 'frag') audio.play('boom', { big: ev.k === 'mega' || ev.k === 'strike' });
        break;
      case 'hit':
        if (fx.showDamage)
          fx.text(ev.x + (Math.random() - 0.5) * 10, ev.y - 14, fmtInt(ev.v), ev.c ? '#ffb347' : '#ffffff', ev.c ? 16 : 12, {
            bold: ev.c,
            life: 0.7,
          });
        break;
      case 'combo': {
        const c = COMBOS[ev.n];
        fx.text(
          ev.x,
          ev.y - 26,
          ev.coop ? `COMBO D’ÉQUIPE ! ${c.name}` : `COMBO ! ${c.name}`,
          ev.coop ? '#e0b3ff' : '#ffd166',
          ev.coop ? 15 : 13,
          { bold: true, life: 1, important: !!ev.coop },
        );
        fx.ring(ev.x, ev.y, 6, 30, 0.35, ev.coop ? '#c792ea' : '#ffd166', 2);
        audio.play('combo', { coop: ev.coop });
        break;
      }
      case 'die': {
        const def = ENEMY_DEFS[ev.t];
        fx.burst(ev.x, ev.y, def.color, def.boss ? 60 : def.miniboss ? 30 : 9, def.boss ? 260 : 110, 0.5, def.boss ? 5 : 3);
        const g = ev.g ? ev.g[me] : 0;
        if (g >= 1) fx.text(ev.x, ev.y - 10, `+${Math.round(g)}`, '#ffd166', 12, { life: 0.8 });
        audio.play('die');
        if (g >= 1) audio.play('coin');
        break;
      }
      case 'leak':
        this.renderer.baseHitT = now;
        fx.addShake(ev.boss ? 12 : 3);
        fx.text(this.mapGame.basePos.x, this.mapGame.basePos.y - 60, `−${ev.v}`, '#ff5c6c', ev.boss ? 26 : 16, {
          bold: true,
          important: true,
        });
        fx.flash('#ff0033', ev.boss ? 0.35 : 0.12, 0.3);
        this.hud.el.base.classList.remove('hit');
        void this.hud.el.base.offsetWidth;
        this.hud.el.base.classList.add('hit');
        audio.play('leak');
        break;
      case 'place':
        fx.ring(ev.x, ev.y, 6, 30, 0.3, PLAYER_COLORS[ev.p], 2);
        fx.burst(ev.x, ev.y + 10, 'rgba(200,180,140,0.9)', 8, 60, 0.4, 2.5);
        if (ev.r >= 1) {
          const R = RARITIES[ev.r];
          fx.text(ev.x, ev.y - 26, R.name.toUpperCase(), R.color, ev.r >= 2 ? 15 : 12, { bold: true, important: ev.r >= 2 });
          if (ev.r >= 2) fx.burst(ev.x, ev.y, R.color, 16, 120, 0.6, 3, { glow: true });
        }
        if (this.isLocalPid(ev.p)) audio.play('place');
        break;
      case 'sell':
        fx.burst(ev.x, ev.y, '#ffd166', 12, 90, 0.5, 2.5);
        if (this.isLocalPid(ev.p)) {
          fx.text(ev.x, ev.y - 16, `+${ev.v}`, '#ffd166', 14, { bold: true });
          audio.play('sell');
        }
        if (this.ui.selectedId === ev.id) this.ui.selectedId = null;
        break;
      case 'move':
        fx.ring(ev.x, ev.y, 6, 26, 0.3, '#ffffff', 2);
        break;
      case 'upgrade':
        fx.burst(ev.x, ev.y, '#7cc0ff', 10, 70, 0.5, 2.5, { grav: -80 });
        fx.text(ev.x, ev.y - 20, ev.gift ? '🎁 ⬆' : '⬆', '#7cc0ff', 15, { bold: true });
        if (this.isLocalPid(ev.p)) audio.play('upgrade');
        if (ev.gift && snap) this.hud.chat(null, `${snap.players[ev.p].name} a offert une amélioration.`, true);
        break;
      case 'branch':
        fx.ring(ev.x, ev.y, 8, 60, 0.6, '#ffd166', 4);
        fx.burst(ev.x, ev.y, '#ffd166', 24, 150, 0.7, 3, { glow: true });
        fx.text(ev.x, ev.y - 30, ev.n.toUpperCase(), '#ffd166', 16, { bold: true, important: true, life: 1.4 });
        audio.play('branch');
        break;
      case 'fusion': {
        fx.fusion(ev);
        audio.play('fusion', { rare: ev.promo || ev.r >= 3 });
        if (ev.refund > 0 && this.isLocalPid(ev.p)) this.hud.toast(`Améliorations remboursées : +${ev.refund} or`, 'good');
        if (profile.discover(`fusion-${ev.tt}-${ev.l}`))
          this.hud.toast(`Nouvelle découverte : ${TOWER_TYPES[ev.tt].name} niveau ${ev.l} !`, 'good');
        break;
      }
      case 'waveStart':
        audio.play('waveStart');
        if (ev.boss) this.hud.banner(`Vague ${ev.w}`, ev.n || 'Boss', 'boss');
        else if (ev.mini) this.hud.banner(`Vague ${ev.w}`, `Mini-boss : ${ev.n}`, 'mini');
        else this.hud.banner(`Vague ${ev.w}`, ev.n || null);
        if (this.ui.moving) this.ui.moving = null;
        break;
      case 'waveEnd':
        audio.play('waveEnd');
        this.hud.waveSummary(ev, me);
        break;
      case 'bossSpawn':
        this.hud.banner(ev.n, 'Le boss est arrivé !', 'boss');
        fx.flash('#ff0033', 0.25, 0.6);
        fx.addShake(10);
        audio.play('boss');
        break;
      case 'miniSpawn':
        this.hud.banner(ev.n, 'Mini-boss en approche', 'mini');
        audio.play('phase');
        break;
      case 'bossPhase':
        this.hud.banner(`Phase ${ev.ph}`, ev.n, 'boss');
        fx.flash('#ff2200', 0.3, 0.5);
        fx.ring(ev.x, ev.y, 10, 160, 0.8, '#ff4d4d', 6);
        fx.addShake(9);
        audio.play('phase');
        break;
      case 'bossDown':
        this.hud.banner(`${ev.n} vaincu !`, `+${ev.g} or et +${ev.c} Noyau${ev.c > 1 ? 'x' : ''} de fusion pour chaque joueur`, 'good');
        fx.ring(ev.x, ev.y, 10, 220, 1, '#ffd166', 8);
        fx.burst(ev.x, ev.y, '#ffd166', 60, 300, 1.2, 4, { glow: true });
        fx.addShake(10);
        audio.play('victory');
        audio.play('core');
        break;
      case 'stomp':
        fx.ring(ev.x, ev.y, 10, ev.r, 0.6, 'rgba(210, 160, 110, 0.9)', 7);
        fx.burst(ev.x, ev.y, 'rgba(170,140,110,0.8)', 30, ev.r * 1.8, 0.7, 4);
        fx.addShake(8);
        if (ev.n)
          fx.text(ev.x, ev.y - 50, `${ev.n} tourelle${ev.n > 1 ? 's' : ''} neutralisée${ev.n > 1 ? 's' : ''} !`, '#ffa94d', 14, {
            bold: true,
            important: true,
          });
        audio.play('stomp');
        break;
      case 'charge':
        fx.text(ev.x, ev.y - 34, 'CHARGE !', '#ff6b6b', 15, { bold: true });
        break;
      case 'summon':
        fx.ring(ev.x, ev.y, 6, 50, 0.5, '#a3e635', 3);
        break;
      case 'strike':
        fx.strike(ev.x, ev.y, ev.r, ev.d);
        audio.play('strike');
        break;
      case 'freeze':
        fx.flash('#7cc0ff', 0.28, 0.6);
        for (let i = 0; i < 60; i++)
          fx.particle({
            x: Math.random() * WORLD_W,
            y: Math.random() * WORLD_H,
            vx: (Math.random() - 0.5) * 20,
            vy: 20 + Math.random() * 30,
            life: 1.6,
            max: 1.6,
            size: 2.5,
            color: '#e6f4ff',
            drag: 0.2,
          });
        audio.play('freeze');
        this.sysChat(ev.p, 'a lancé Gel ❄️');
        break;
      case 'overcharge':
        fx.flash(PLAYER_COLORS[ev.p], 0.12, 0.4);
        audio.play('overcharge');
        this.sysChat(ev.p, 'a lancé Surcharge ⚡');
        break;
      case 'burst': {
        const t = this.state.towers.get(ev.id);
        if (t) fx.ring(t.x, t.y, 10, 40, 0.4, '#ffd166', 3);
        break;
      }
      case 'exec':
        fx.text(ev.x, ev.y - 18, 'EXÉCUTION', '#ff5c6c', 12, { bold: true });
        break;
      case 'chat': {
        const text = ev.q != null ? `${QUICK_CHAT[ev.q].icon} ${QUICK_CHAT[ev.q].text}` : ev.m;
        this.hud.chat(ev.p, text);
        audio.play('chat');
        break;
      }
      case 'ping':
        fx.ping(ev.x, ev.y, ev.p, ev.k);
        audio.play('ping');
        break;
      case 'err':
        if (this.isLocalPid(ev.p)) {
          this.hud.toast(ev.m, 'err');
          audio.play('err');
        }
        break;
      case 'info':
        this.hud.chat(null, ev.m, true);
        if (ev.k === 'gold') this.hud.toast(ev.m, 'good');
        break;
      case 'team':
        this.hud.chat(null, ev.m, true);
        this.hud.toast(ev.m, 'team');
        audio.play('upgrade');
        break;
      case 'gift':
        this.hud.chat(null, ev.m, true);
        if (this.isLocalPid(ev.to)) {
          this.hud.toast(ev.m, 'good');
          audio.play('coin');
        }
        break;
      case 'fuseReq':
        if (ev.to.some((p) => this.isLocalPid(p))) {
          audio.play('fuseReq');
          this.hud.toast(`${snap.players[ev.from].name} propose une fusion !`, 'team');
        } else if (this.isLocalPid(ev.from)) this.hud.toast('Demande de fusion envoyée : en attente de l’accord de votre allié.', 'team');
        break;
      case 'fuseRes':
        if (this.isLocalPid(ev.from) || (ev.by != null && this.isLocalPid(ev.by))) {
          if (!ev.ok) this.hud.toast(ev.msg || `${snap.players[ev.by]?.name || 'Votre allié'} a refusé la fusion.`, 'err');
        }
        break;
      case 'synergy': {
        const s = SYNERGIES.find((x) => x.id === ev.id);
        if (s && ev.on) {
          this.hud.toast(`${s.icon} Synergie active : ${s.name} — ${s.desc}`, 'team');
          audio.play('core');
        }
        break;
      }
      case 'speed':
        this.hud.toast(ev.v === 2 ? 'Vitesse ×2 activée' : 'Vitesse normale', 'good');
        break;
      case 'victory':
        audio.play('victory');
        this.hud.banner('Victoire !', 'La base a tenu bon', 'good');
        break;
      case 'defeat':
        audio.play('defeat');
        this.hud.banner('Défaite', 'La base est tombée', 'boss');
        break;
      default:
        break;
    }
  }

  sysChat(pid, text) {
    const snap = this.state.snap;
    if (!snap || !snap.players[pid]) return;
    this.hud.chat(null, `${snap.players[pid].name} ${text}`, true);
  }

  // ------------------------------------------------------------ Actions
  canPlaceAt(c, r) {
    const g = this.mapGame;
    if (c < 0 || r < 0 || c >= COLS || r >= g.grid.length / COLS) return false;
    if (g.grid[r * COLS + c] !== CELL.FREE) return false;
    const t = this.state.towerAtTile(c, r);
    return !t;
  }

  cancelModes(deselect = false) {
    const ui = this.ui;
    let any = false;
    if (ui.placing || ui.moving || ui.abilityTarget || ui.fusionSel || ui.pingMode) any = true;
    ui.placing = null;
    ui.moving = null;
    ui.abilityTarget = null;
    ui.fusionSel = null;
    ui.pingMode = false;
    if (deselect && !any && (ui.selectedId || ui.selectedEnemyId)) {
      ui.selectedId = null;
      ui.selectedEnemyId = null;
      any = true;
    }
    return any;
  }

  select(id) {
    this.ui.selectedId = id;
    this.ui.selectedEnemyId = null;
    this.hud.setTab('build');
    audio.play('select');
  }

  cycleTarget(id) {
    const t = this.state.towers.get(id);
    if (!t) return;
    const i = TARGET_MODES.findIndex((m) => m.id === t.tm);
    const next = TARGET_MODES[(i + 1) % TARGET_MODES.length];
    this.send({ a: 'target', id, m: next.id });
    this.hud.toast(`Ciblage : ${next.name}`);
  }

  sellWithConfirm(id) {
    const now = performance.now();
    if (this.sellArm && this.sellArm.id === id && now - this.sellArm.t < 1500) {
      this.send({ a: 'sell', id });
      this.sellArm = null;
    } else {
      this.sellArm = { id, t: now };
      this.hud.toast('Appuyez à nouveau sur Suppr pour vendre.');
    }
  }

  toggleFusionPick(id) {
    const fs = this.ui.fusionSel;
    const i = fs.chosen.indexOf(id);
    if (i >= 0) fs.chosen.splice(i, 1);
    else fs.chosen.push(id);
    audio.play('select');
    if (fs.chosen.length >= fs.need) {
      this.send({ a: 'fuse', id: fs.primaryId, partners: fs.chosen.slice(0, fs.need), core: fs.core });
      this.ui.fusionSel = null;
    }
  }

  startTeamFusion(id) {
    const t = this.state.towers.get(id);
    const me = this.state.snap.players[this.ui.me];
    if (!t || !me) return;
    const cands = new Set();
    for (const u of this.state.towers.values()) {
      if (u.id === t.id || u.tt !== t.tt || u.l !== t.l) continue;
      if (t.b && u.b && t.b !== u.b) continue;
      cands.add(u.id);
    }
    let need = FUSION_COUNT - 1;
    let core = false;
    if (cands.size < need && me.cores > 0) {
      need--;
      core = true;
    }
    if (cands.size < need) {
      this.hud.toast('Pas assez de tourelles compatibles dans l’équipe.', 'err');
      return;
    }
    this.cancelModes();
    this.ui.fusionSel = { primaryId: id, candidates: cands, chosen: [], need, core };
  }

  makeActions() {
    return {
      place: (type) => {
        audio.init();
        if (this.ui.placing === type) {
          this.ui.placing = null;
          return;
        }
        this.cancelModes();
        this.ui.placing = type;
        audio.play('click');
      },
      ready: () => {
        audio.init();
        this.send({ a: 'ready' });
      },
      ability: (i) => {
        audio.init();
        const ab = ABILITIES[i];
        const me = this.state.snap?.players[this.ui.me];
        if (me && me.cds[i] > 0) {
          this.hud.toast(`${ab.name} : en recharge (${Math.ceil(me.cds[i])} s)`, 'err');
          return;
        }
        if (this.state.snap?.phase !== 'wave') {
          this.hud.toast('Les capacités s’utilisent pendant les vagues.', 'err');
          return;
        }
        if (ab.targeted) {
          this.cancelModes();
          this.ui.abilityTarget = { i, radius: ab.radius };
        } else this.send({ a: 'ability', i });
      },
      upgrade: (id, s) => this.send({ a: 'upgrade', id, s }),
      sell: (id) => {
        this.send({ a: 'sell', id });
        this.ui.selectedId = null;
      },
      move: (id) => {
        if (this.state.snap?.phase !== 'prep') {
          this.hud.toast('Déplacement possible uniquement pendant la préparation.', 'err');
          return;
        }
        this.cancelModes();
        this.ui.moving = id;
      },
      target: (id, m) => this.send({ a: 'target', id, m }),
      branch: (id, b) => this.send({ a: 'branch', id, b }),
      fuse: (id, opts = {}) => this.send({ a: 'fuse', id, core: !!opts.core }),
      teamFuse: (id) => this.startTeamFusion(id),
      team: (item) => {
        const it = TEAM_ITEMS[item];
        if (it && item !== 'repair' && item !== 'shield' && !confirm(`Acheter « ${it.name} » avec le trésor d’équipe ?`)) return;
        this.send({ a: 'team', item });
      },
      gift: (to, v) => this.send({ a: 'gift', to, v }),
      chat: (msg) => this.send({ a: 'chat', ...msg }),
      speed: () => this.send({ a: 'speed' }),
      switchPlayer: (pid) => {
        if (!this.session.hotSeat) return;
        if (pid == null) this.session.cycleActive();
        else this.session.setActive(pid);
        this.ui.me = this.session.activePid;
        this.cancelModes();
        const p = this.state.snap?.players[this.ui.me];
        if (p) this.hud.toast(`Contrôle : ${p.name}`);
      },
      fuseReply: (id, ok, pid) => this.session.send({ a: 'fuseReply', id, ok }, pid),
      focusTower: (id) => this.select(id),
      pingMode: () => {
        this.cancelModes();
        this.ui.pingMode = true;
      },
      pause: () => {
        if (!this.session.isLocal || this.ended) return;
        const p = !this.session.paused;
        this.session.setPaused(p);
        if (p) this.showMenu(true);
        else this.closeModal();
      },
      menu: () => this.showMenu(this.session.isLocal),
    };
  }

  // ------------------------------------------------------------ Modales
  closeModal() {
    if (this.modal) {
      this.modal.remove();
      this.modal = null;
    }
    if (this.session.isLocal && !this.ended) this.session.setPaused(false);
  }

  showMenu(pause) {
    if (this.ended) return;
    if (this.modal) {
      this.closeModal();
      return;
    }
    if (pause) this.session.setPaused(true);
    const music = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: profile.settings.music });
    const sfx = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: profile.settings.sfx });
    const upd = () => {
      profile.setSetting('music', +music.value);
      profile.setSetting('sfx', +sfx.value);
      audio.setVolumes(+music.value, +sfx.value);
    };
    music.oninput = upd;
    sfx.oninput = upd;
    const snap = this.state.snap;
    this.modal = h(
      'div.modal-back',
      h(
        'div.modal',
        { style: { maxWidth: '460px' } },
        h('h2', pause ? 'Pause' : 'Menu'),
        h('p.muted', snap ? `Vague ${snap.wave} · ${DIFFICULTIES[snap.diff].name} · ${MODES[snap.mode].name}` : ''),
        h(
          'div.stack',
          h('div.range-row', h('span', '🎵 Musique'), music, h('span')),
          h('div.range-row', h('span', '🔊 Effets'), sfx, h('span')),
        ),
        h(
          'div.panel',
          { style: { marginTop: '14px' } },
          h('h4', 'Raccourcis'),
          h(
            'div.hint-line',
            h(
              'div',
              h('kbd', '1-4'),
              ' tourelles · ',
              h('kbd', 'Espace'),
              ' prêt · ',
              h('kbd', 'E'),
              h('kbd', 'R'),
              h('kbd', 'T'),
              ' capacités',
            ),
            h(
              'div',
              h('kbd', 'F'),
              ' fusion · ',
              h('kbd', 'M'),
              ' déplacer · ',
              h('kbd', 'C'),
              ' ciblage · ',
              h('kbd', 'Suppr'),
              ' vendre',
            ),
            h(
              'div',
              h('kbd', 'G'),
              '+clic ping · ',
              h('kbd', 'Maj'),
              '+clic placement multiple · ',
              this.session.hotSeat ? [h('kbd', 'Tab'), ' changer de joueur'] : null,
            ),
          ),
        ),
        h(
          'div.row.end',
          { style: { marginTop: '16px' } },
          h(
            'button.btn.danger',
            {
              onclick: () => {
                if (confirm('Quitter la partie en cours ?')) this.app.exitGame();
              },
            },
            'Quitter la partie',
          ),
          h('button.btn.primary', { onclick: () => this.closeModal() }, 'Reprendre'),
        ),
      ),
    );
    this.hud.overlay.append(this.modal);
  }

  showEnd(result) {
    if (this.modal) this.modal.remove();
    const pid = this.session.humanPids[0] ?? 0;
    const teamNames = result.players.map((p) => p.name);
    const rec = profile.recordGame(result, pid, teamNames);
    if (this.opts.onResult) this.opts.onResult(result);
    const lv = rec.after;
    const cur = profile.data.xp - xpForLevel(lv);
    const need = xpForLevel(lv + 1) - xpForLevel(lv);
    const bar = h('i', { style: { width: '0%' } });
    const rows = result.players.map((p) =>
      h(
        'tr',
        h('td', h('b', { style: { color: p.color } }, (p.bot ? '🤖 ' : '') + p.name)),
        h('td', fmtInt(p.stats.damage)),
        h('td', fmtInt(p.stats.kills)),
        h('td', `${p.stats.fusions} (${p.stats.coopFusions} 🤝)`),
        h('td', `${p.stats.combos} (${p.stats.coopCombos} 🤝)`),
        h('td', fmtInt(p.stats.gold)),
        h('td', `+${p.xp}`),
      ),
    );
    const endless = result.mode === 'endless';
    this.modal = h(
      'div.modal-back',
      h(
        'div.modal',
        h(`h2.${result.victory ? 'win' : 'lose'}`, result.victory ? 'Victoire !' : endless ? 'Fin de la partie' : 'Défaite'),
        h(
          'p.muted',
          endless ? `Vous avez atteint la vague ${result.wave} en mode Infini` : `Vagues réussies : ${result.cleared} / 20`,
          ` · ${DIFFICULTIES[result.difficulty].name} · durée ${fmtDuration(result.time)}`,
        ),
        rec.record ? h('div.record', endless ? `🏆 Nouveau record : vague ${result.wave} !` : '🏆 Nouveau record personnel !') : null,
        h(
          'div.end-xp',
          h('span.lvl-badge', String(lv)),
          h('div', h('div', `+${rec.xp} XP${rec.after > rec.before ? ` — niveau ${rec.after} atteint !` : ''}`), h('div.xpbar', bar)),
          h('span.muted', `${Math.floor(cur)} / ${need}`),
        ),
        h(
          'div.table-wrap',
          h(
            'table.stats-table',
            h(
              'tr',
              h('th', 'Joueur'),
              h('th', 'Dégâts'),
              h('th', 'Élim.'),
              h('th', 'Fusions'),
              h('th', 'Combos'),
              h('th', 'Or gagné'),
              h('th', 'XP'),
            ),
            rows,
          ),
        ),
        h(
          'div.row.end',
          { style: { marginTop: '18px' } },
          h('button.btn', { onclick: () => this.app.exitGame() }, 'Menu principal'),
          this.session.isLocal ? h('button.btn.primary', { onclick: () => this.app.restartGame() }, 'Rejouer') : null,
          !this.session.isLocal && this.opts.onBackToLobby
            ? h('button.btn.primary', { onclick: () => this.opts.onBackToLobby() }, 'Retour au salon')
            : null,
        ),
      ),
    );
    this.hud.overlay.append(this.modal);
    requestAnimationFrame(() => setTimeout(() => (bar.style.width = `${Math.min(100, (100 * cur) / need)}%`), 50));
  }
}

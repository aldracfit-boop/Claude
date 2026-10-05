// Dégâts, statuts, combos, explosions et mort des ennemis.
// Méthodes « mixées » dans Game.prototype (this = instance de Game).

import { COMBOS, COOP_COMBO_MULT, COOP } from '../data/team.js';
import { ENEMY_INDEX } from '../data/enemies.js';

const r1 = (v) => Math.round(v * 10) / 10;

export const CombatMixin = {
  // Inflige des dégâts à un ennemi. `src` : { owners, kind, armorPierce, bossMult, airMult, tower }
  damageEnemy(e, raw, src) {
    if (e.dead || raw <= 0) return 0;
    if (e.invulnT > 0) return 0;
    let dmg = raw;
    const st = e.st;
    if (src.kind !== 'burn') {
      if (st.mark) dmg *= 1.2;
      if (st.brk) dmg *= 1.2;
      let combo = null;
      let statusSrc = null;
      if (src.kind === 'explosion') {
        if (st.slow && st.slow.pct >= 0.25) {
          combo = 'shatter';
          statusSrc = st.slow.src;
        } else if (st.burn) {
          combo = 'ignite';
          statusSrc = st.burn.src;
        }
      } else if (src.kind === 'snipe' && st.brk) {
        combo = 'weakspot';
        statusSrc = st.brk.src;
      }
      if (combo) {
        dmg *= COMBOS[combo].mult;
        const coop = !!(statusSrc && statusSrc.owners && src.owners && !statusSrc.owners.some((o) => src.owners.includes(o)));
        if (coop) dmg *= COOP_COMBO_MULT;
        this.registerCombo(e, combo, coop, src, statusSrc);
      }
      if (e.boss || e.mini) {
        dmg *= src.bossMult || 1;
        if (src.owners) for (const o of src.owners) e.hitT[o] = this.time;
        let n = 0;
        for (let i = 0; i < e.hitT.length; i++) if (this.time - e.hitT[i] < COOP.bossAssaultWindow) n++;
        e.assault = n >= 2;
        if (e.assault) dmg *= 1 + COOP.bossAssaultBonus;
      }
      if (e.flying) dmg *= src.airMult || 1;
      const armor = st.brk ? 0 : Math.max(0, e.armor - (src.armorPierce || 0));
      dmg = Math.max(dmg * 0.15, dmg - armor);
    } else if (st.mark) {
      dmg *= 1.2;
    }

    // Les boss ne peuvent pas « sauter » une phase : les PV sont bloqués au seuil.
    if (e.boss && e.phase < e.maxPhase) {
      const thr = e.def.phases[e.phase].at * e.maxHp;
      if (e.hp - dmg <= thr) {
        dmg = Math.max(0, e.hp - thr);
        this.creditDamage(e, dmg, src);
        e.hp = thr;
        this.bossPhaseUp(e);
        return dmg;
      }
    }

    const dealt = Math.min(e.hp, dmg);
    e.hp -= dmg;
    this.creditDamage(e, dealt, src);
    if (e.hp <= 0) this.killEnemy(e, src);
    return dealt;
  },

  creditDamage(e, dealt, src) {
    const owners = src.owners;
    if (owners && owners.length) {
      const share = dealt / owners.length;
      const ws = this.waveState;
      for (const o of owners) {
        e.dmgBy[o] += share;
        const p = this.players[o];
        if (p) p.stats.damage += share;
        if (ws) ws.perPlayer[o].damage += share;
      }
    }
    if (src.tower) src.tower.dmg += dealt;
  },

  registerCombo(e, combo, coop, src, statusSrc) {
    if (this.time - e.comboT < 0.4) return;
    e.comboT = this.time;
    const involved = new Set(src.owners || []);
    for (const o of src.owners || []) {
      const p = this.players[o];
      if (p) {
        p.stats.combos++;
        if (coop) p.stats.coopCombos++;
      }
    }
    if (coop && statusSrc) {
      for (const o of statusSrc.owners) {
        involved.add(o);
        const p = this.players[o];
        if (p) p.stats.coopCombos++;
      }
      for (const o of involved) {
        const p = this.players[o];
        if (p) {
          p.gold += 0.5;
          p.stats.gold += 0.5;
        }
      }
    }
    this.emit({ e: 'combo', x: Math.round(e.x), y: Math.round(e.y), n: combo, coop: coop ? 1 : 0 });
  },

  applySlow(e, pct, t, src) {
    const cur = e.st.slow;
    if (!cur || pct > cur.pct) e.st.slow = { pct, t, src };
    else if (pct === cur.pct && t > cur.t) {
      cur.t = t;
      cur.src = src;
    }
  },

  applyBurn(e, dps, t, src) {
    if (e.flying) return;
    const cur = e.st.burn;
    if (!cur || dps >= cur.dps) e.st.burn = { dps, t: Math.max(t, cur ? cur.t : 0), src: { ...src, kind: 'burn' } };
    else cur.t = Math.max(cur.t, t);
  },

  applyBreak(e, t, src) {
    const cur = e.st.brk;
    if (!cur || cur.t < t) e.st.brk = { t, src };
  },

  applyMark(e, t, src) {
    const cur = e.st.mark;
    if (!cur || cur.t < t) e.st.mark = { t, src };
  },

  // Explosion au sol (les volants ne sont touchés que si `air` est vrai).
  explode(x, y, r, dmg, src, opts = {}) {
    const r2base = r;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.flying && !opts.air) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const reach = r2base + e.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 > reach * reach) continue;
      const d = Math.sqrt(d2);
      const fall = opts.flat ? 1 : 1 - 0.5 * Math.min(1, d / r2base);
      this.damageEnemy(e, dmg * fall, src);
      if (e.dead) continue;
      if (opts.slow) this.applySlow(e, opts.slow.pct, opts.slow.t, src);
      if (opts.burn) this.applyBurn(e, dmg * opts.burn.dpsPct, opts.burn.t, src);
    }
    this.emit({ e: 'boom', x: Math.round(x), y: Math.round(y), r: Math.round(r), k: opts.k || 'mortar' });
    if (opts.napalm) {
      this.zones.push({
        id: this.nextId++,
        x,
        y,
        r: r * opts.napalm.r,
        t: opts.napalm.t,
        dps: dmg * (opts.burn ? opts.burn.dpsPct : 0.3),
        tick: 0,
        src,
      });
    }
    if (opts.frags) {
      const base = this.rng.next() * Math.PI * 2;
      for (let k = 0; k < opts.frags; k++) {
        const a = base + (k * Math.PI * 2) / opts.frags;
        this.projectiles.push({
          k: 'mortar',
          x0: x,
          y0: y,
          x: x + Math.cos(a) * 48,
          y: y + Math.sin(a) * 48,
          t: 0,
          dur: 0.35,
          dmg: dmg * 0.35,
          r: 34,
          src,
          frag: true,
        });
      }
    }
  },

  killEnemy(e, src) {
    if (e.dead) return;
    e.dead = true;
    e.hp = 0;
    const n = this.players.length;
    let total = 0;
    for (let i = 0; i < n; i++) total += e.dmgBy[i];
    const gains = new Array(n).fill(0);
    for (let i = 0; i < n; i++) gains[i] = total > 0 ? (e.bounty * e.dmgBy[i]) / total : e.bounty / n;
    const ws = this.waveState;
    for (let i = 0; i < n; i++) {
      const p = this.players[i];
      p.gold += gains[i];
      p.stats.gold += gains[i];
      if (ws) ws.perPlayer[i].gold += gains[i];
    }
    this.teamGold += e.bounty * COOP.teamBountyShare;
    const killer = src && src.owners && src.owners.length ? src.owners[0] : -1;
    if (killer >= 0 && this.players[killer]) {
      this.players[killer].stats.kills++;
      if (ws) ws.perPlayer[killer].kills++;
    }
    if (src && src.tower) src.tower.kills++;
    if (ws) ws.kills++;
    this.emit({
      e: 'die',
      x: Math.round(e.x),
      y: Math.round(e.y),
      t: ENEMY_INDEX[e.type],
      g: gains.map(r1),
    });

    if (e.def.split) {
      const sp = e.def.split;
      for (let k = 0; k < sp.count; k++) {
        this.spawnEnemy(sp.type, { pathIdx: e.pathIdx, dist: Math.max(0, e.dist - k * 12), minion: true });
      }
    }
    if (e.boss || e.mini) this.onBossKilled(e);
  },
};

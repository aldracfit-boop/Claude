// Ciblage, tirs, projectiles et zones des tourelles.
// Méthodes « mixées » dans Game.prototype.

import { BASE_CANNON } from '../data/team.js';

const pred = { x: 0, y: 0 };
const r0 = (v) => Math.round(v);

export const TowerMixin = {
  canTarget(s, e) {
    if (e.stealth && !e.revealed) return false;
    return e.flying ? s.air : s.ground;
  },

  // Les Snipers (et les tourelles qui détectent) révèlent les ennemis furtifs à portée,
  // pour toute l'équipe. Une cible marquée reste visible.
  updateStealth() {
    let detectors = null;
    for (const e of this.enemies) {
      if (!e.stealth || e.dead) continue;
      if (!detectors) detectors = this.towers.filter((t) => t.stats && t.stats.detect && t.disabledT <= 0);
      let rev = !!e.st.mark;
      for (let i = 0; !rev && i < detectors.length; i++) {
        const t = detectors[i];
        const r = t.stats.range * this.rangeMult;
        if ((t.x - e.x) ** 2 + (t.y - e.y) ** 2 <= r * r) rev = true;
      }
      if (!rev && this.base.cannonLvl > 0) {
        const r = BASE_CANNON.range;
        if ((this.basePos.x - e.x) ** 2 + (this.basePos.y - e.y) ** 2 <= r * r) rev = true;
      }
      e.revealed = rev;
    }
  },

  inRange(t, s, e) {
    if (e.dead || !this.canTarget(s, e)) return false;
    const dx = e.x - t.x;
    const dy = e.y - t.y;
    const d2 = dx * dx + dy * dy;
    const reach = s.range * this.rangeMult + e.radius * 0.5;
    if (d2 > reach * reach) return false;
    if (s.minRange && d2 < s.minRange * s.minRange) return false;
    return true;
  },

  targetScore(mode, t, e) {
    switch (mode) {
      case 'last':
        return -e.dist / e.path.length;
      case 'closest': {
        const dx = e.x - t.x;
        const dy = e.y - t.y;
        return -(dx * dx + dy * dy);
      }
      case 'strongest':
        return e.hp;
      case 'fastest':
        return e.curSpeed;
      case 'boss':
        return (e.boss ? 2e6 : e.mini ? 1e6 : 0) + e.dist / e.path.length;
      case 'first':
      default:
        return e.dist / e.path.length;
    }
  },

  findTarget(t, s, exclude) {
    let best = null;
    let bestScore = -Infinity;
    const mode = t.targetMode;
    for (const e of this.enemies) {
      if (exclude && exclude.includes(e)) continue;
      if (!this.inRange(t, s, e)) continue;
      const sc = this.targetScore(mode, t, e);
      if (sc > bestScore) {
        bestScore = sc;
        best = e;
      }
    }
    return best;
  },

  findTargets(t, s, first, n) {
    const out = [first];
    while (out.length < n) {
      const e = this.findTarget(t, s, out);
      if (!e) break;
      out.push(e);
    }
    return out;
  },

  updateTowers(dt) {
    this.updateStealth();
    for (const t of this.towers) {
      if (t.disabledT > 0) {
        t.disabledT -= dt;
        if (t.disabledT <= 0) {
          t.disabledT = 0;
          this.towersVersion++;
        }
        continue;
      }
      const s = t.stats;
      let oc = false;
      for (const o of t.owners) if (this.players[o] && this.players[o].overchargeT > 0) oc = true;
      let rateMul = oc ? 1.25 : 1;
      if (s.ultimate === 'storm') {
        if (t.burstT > 0) {
          t.burstT -= dt;
          rateMul *= 3;
        } else if (t.burstCd > 0) t.burstCd -= dt;
      }
      if (t.cd > 0) t.cd -= dt * rateMul;
      t.retarget -= dt;
      let target = t.targetId ? this.enemyById.get(t.targetId) : null;
      if (!target || t.retarget <= 0 || !this.inRange(t, s, target)) {
        target = this.findTarget(t, s);
        t.targetId = target ? target.id : 0;
        t.retarget = 0.2;
      }
      if (!target) continue;
      t.angle = Math.atan2(target.y - t.y, target.x - t.x);
      if (s.ultimate === 'storm' && t.burstT <= 0 && t.burstCd <= 0) {
        t.burstT = 2.5;
        t.burstCd = 8;
        this.emit({ e: 'burst', id: t.id });
      }
      let shots = 0;
      while (t.cd <= 0 && shots < 3) {
        if (target.dead) {
          target = this.findTarget(t, s);
          if (!target) break;
          t.targetId = target.id;
        }
        this.fireTower(t, s, target, oc ? 1.5 : 1);
        t.cd += 1 / s.rate;
        shots++;
      }
      if (t.cd < -0.1) t.cd = 0;
    }
  },

  rollCrit(s) {
    return s.crit > 0 && this.rng.next() < s.crit;
  },

  fireTower(t, s, target, dmgMul) {
    t.shots++;
    const base = s.damage * dmgMul;
    switch (s.kind) {
      case 'shell': {
        const mega = s.ultimate === 'bombard' && t.shots % 5 === 0;
        const targets = s.multi > 1 ? this.findTargets(t, s, target, s.multi) : [target];
        for (const tg of targets) {
          const crit = this.rollCrit(s);
          this.projectiles.push({
            k: 'shell',
            x: t.x,
            y: t.y,
            tid: tg.id,
            tx: tg.x,
            ty: tg.y,
            spd: s.projSpeed * (mega ? 0.8 : 1),
            dmg: base * (mega ? 4 : 1) * (crit ? s.critMult : 1),
            splash: mega ? 80 : s.splash,
            sp: mega ? 1 : s.splashPct,
            brk: s.armorBreak,
            src: t.src,
            mega,
          });
          this.emit({
            e: 'shot',
            k: 'shell',
            tw: t.id,
            x1: r0(t.x),
            y1: r0(t.y),
            x2: r0(tg.x),
            y2: r0(tg.y),
            tg: tg.id,
            sp: s.projSpeed,
            m: mega ? 1 : 0,
            l: t.level,
          });
        }
        break;
      }
      case 'bullet': {
        const crit = this.rollCrit(s);
        const dmg = base * (crit ? s.critMult : 1);
        let end = target;
        if (s.pierce > 1) {
          const hits = this.lineTargets(t.x, t.y, t.angle, s.range, 10, s, s.pierce);
          let f = 1;
          for (const e of hits) {
            this.bulletHit(e, dmg * f, s, t);
            end = e;
            f *= s.pierceFalloff;
          }
          if (!hits.length) this.bulletHit(target, dmg, s, t);
        } else {
          this.bulletHit(target, dmg, s, t);
        }
        this.emit({
          e: 'shot',
          k: 'bullet',
          tw: t.id,
          x1: r0(t.x),
          y1: r0(t.y),
          x2: r0(end.x),
          y2: r0(end.y),
          c: crit ? 1 : 0,
          l: t.level,
        });
        if (crit) this.emit({ e: 'hit', x: r0(target.x), y: r0(target.y), v: r0(dmg), c: 1 });
        break;
      }
      case 'snipe': {
        const charged = s.ultimate === 'charged' && t.shots % 4 === 0;
        const crit = this.rollCrit(s);
        const dmg = base * (crit ? s.critMult : 1) * (charged ? 3 : 1);
        const pierce = charged ? 99 : s.pierce;
        let endX = target.x;
        let endY = target.y;
        if (pierce > 1) {
          const len = s.range * 1.1;
          const hits = this.lineTargets(t.x, t.y, t.angle, len, 12, s, pierce);
          let f = 1;
          for (const e of hits) {
            this.snipeHit(e, dmg * f, s, t);
            f *= s.pierceFalloff;
          }
          endX = t.x + Math.cos(t.angle) * len;
          endY = t.y + Math.sin(t.angle) * len;
          if (!hits.length) this.snipeHit(target, dmg, s, t);
        } else {
          this.snipeHit(target, dmg, s, t);
        }
        this.emit({
          e: 'shot',
          k: 'snipe',
          tw: t.id,
          x1: r0(t.x),
          y1: r0(t.y),
          x2: r0(endX),
          y2: r0(endY),
          c: crit || charged ? 1 : 0,
          l: t.level,
          p: pierce > 1 ? 1 : 0,
        });
        this.emit({ e: 'hit', x: r0(target.x), y: r0(target.y), v: r0(dmg), c: crit || charged ? 1 : 0 });
        break;
      }
      case 'mortar': {
        const targets = s.multi > 1 ? this.findTargets(t, s, target, s.multi) : [target];
        for (let i = 0; i < targets.length; i++) {
          const tg = targets[i];
          const dur = s.flightTime + i * 0.12;
          this.predictPos(tg, dur, pred);
          this.launchMortar(t, s, pred.x, pred.y, dur, base);
        }
        if (s.ultimate === 'carpet' && t.shots % 3 === 0) {
          this.predictPos(target, s.flightTime, pred);
          for (let k = 0; k < 4; k++) {
            const a = (k * Math.PI) / 2 + Math.PI / 4;
            this.launchMortar(t, s, pred.x + Math.cos(a) * 50, pred.y + Math.sin(a) * 50, s.flightTime + 0.15 + k * 0.08, base);
          }
        }
        break;
      }
    }
  },

  launchMortar(t, s, x, y, dur, dmg) {
    this.projectiles.push({
      k: 'mortar',
      x0: t.x,
      y0: t.y,
      x,
      y,
      t: 0,
      dur,
      dmg,
      r: s.splash,
      src: t.src,
      slow: s.slow,
      burn: s.burn,
      napalm: s.napalm,
      frags: s.frags,
    });
    this.emit({
      e: 'shot',
      k: 'mortar',
      tw: t.id,
      x1: r0(t.x),
      y1: r0(t.y),
      x2: r0(x),
      y2: r0(y),
      d: Math.round(dur * 100) / 100,
      l: t.level,
    });
  },

  bulletHit(e, dmg, s, t) {
    this.damageEnemy(e, dmg, t.src);
    if (!e.dead && s.slow) this.applySlow(e, s.slow.pct, s.slow.t, t.src);
  },

  snipeHit(e, dmg, s, t) {
    if (s.execute && !e.boss && !e.mini && !e.dead && e.hp / e.maxHp < s.execute) {
      this.damageEnemy(e, e.hp + 1e6, { ...t.src, armorPierce: 1e6 });
      this.emit({ e: 'exec', x: r0(e.x), y: r0(e.y) });
      return;
    }
    this.damageEnemy(e, dmg, t.src);
    if (!e.dead) {
      if (s.mark) this.applyMark(e, s.mark.t, t.src);
      if (s.execute && !e.boss && !e.mini && e.hp / e.maxHp < s.execute) {
        this.damageEnemy(e, e.hp + 1e6, { ...t.src, armorPierce: 1e6 });
        this.emit({ e: 'exec', x: r0(e.x), y: r0(e.y) });
      }
    }
  },

  // Ennemis alignés sur un segment (tirs perforants).
  lineTargets(x1, y1, angle, len, width, s, max) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const res = [];
    for (const e of this.enemies) {
      if (e.dead || !this.canTarget(s, e)) continue;
      const ex = e.x - x1;
      const ey = e.y - y1;
      const proj = ex * dx + ey * dy;
      if (proj < 0 || proj > len) continue;
      const perp = Math.abs(ex * dy - ey * dx);
      if (perp > width + e.radius) continue;
      res.push([proj, e]);
    }
    res.sort((a, b) => a[0] - b[0]);
    const out = [];
    for (let i = 0; i < res.length && i < max; i++) out.push(res[i][1]);
    return out;
  },

  updateProjectiles(dt) {
    const list = this.projectiles;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      let alive = true;
      if (p.k === 'shell') {
        const tg = this.enemyById.get(p.tid);
        if (tg && !tg.dead) {
          p.tx = tg.x;
          p.ty = tg.y;
        }
        const dx = p.tx - p.x;
        const dy = p.ty - p.y;
        const d = Math.hypot(dx, dy);
        const step = p.spd * dt;
        if (d <= step + 4) {
          alive = false;
          this.shellImpact(p, tg && !tg.dead ? tg : null);
        } else {
          p.x += (dx / d) * step;
          p.y += (dy / d) * step;
        }
      } else if (p.k === 'mortar') {
        p.t += dt;
        if (p.t >= p.dur) {
          alive = false;
          this.explode(p.x, p.y, p.r, p.dmg, p.src.kind === 'explosion' ? p.src : { ...p.src, kind: 'explosion' }, {
            slow: p.slow,
            burn: p.burn,
            napalm: p.napalm,
            frags: p.frag ? 0 : p.frags,
            k: p.frag ? 'frag' : 'mortar',
          });
        }
      }
      if (alive) list[w++] = p;
    }
    list.length = w;
  },

  shellImpact(p, target) {
    if (target) {
      this.damageEnemy(target, p.dmg, p.src);
      if (!target.dead && p.brk) this.applyBreak(target, p.brk.t, p.src);
    }
    if (p.splash > 0) {
      const src = p.src.splash;
      for (const e of this.enemies) {
        if (e.dead || e === target || e.flying) continue;
        const dx = e.x - p.tx;
        const dy = e.y - p.ty;
        const reach = p.splash + e.radius;
        if (dx * dx + dy * dy <= reach * reach) {
          this.damageEnemy(e, p.dmg * p.sp, src);
          if (!e.dead && p.brk) this.applyBreak(e, p.brk.t, p.src);
        }
      }
      this.emit({ e: 'boom', x: r0(p.tx), y: r0(p.ty), r: r0(p.splash), k: p.mega ? 'mega' : 'shell' });
    }
  },

  updateZones(dt) {
    let w = 0;
    for (const z of this.zones) {
      z.t -= dt;
      z.tick -= dt;
      if (z.tick <= 0) {
        z.tick = 0.25;
        for (const e of this.enemies) {
          if (e.dead || e.flying) continue;
          const dx = e.x - z.x;
          const dy = e.y - z.y;
          const reach = z.r + e.radius;
          if (dx * dx + dy * dy <= reach * reach) this.applyBurn(e, z.dps, 1, z.src);
        }
      }
      if (z.t > 0) this.zones[w++] = z;
    }
    this.zones.length = w;
  },

  updateDelayed(dt) {
    let w = 0;
    for (const d of this.delayed) {
      d.t -= dt;
      if (d.t <= 0) {
        if (d.k === 'strike') {
          this.explode(d.x, d.y, d.r, d.dmg, d.src, { air: true, k: 'strike' });
        }
      } else this.delayed[w++] = d;
    }
    this.delayed.length = w;
  },

  updateBaseCannon(dt) {
    const lvl = this.base.cannonLvl;
    if (!lvl) return;
    this.base.cannonCd -= dt;
    if (this.base.cannonCd > 0) return;
    const bx = this.basePos.x;
    const by = this.basePos.y;
    const r2 = BASE_CANNON.range * BASE_CANNON.range;
    let best = null;
    let bestD = Infinity;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.x - bx;
      const dy = e.y - by;
      const d2 = dx * dx + dy * dy;
      if (d2 <= r2 && d2 < bestD) {
        bestD = d2;
        best = e;
      }
    }
    if (!best) return;
    this.base.cannonCd = 1 / BASE_CANNON.rate;
    const dmg = BASE_CANNON.damage[lvl - 1] * (1 + 0.15 * (Math.max(1, this.wave) - 1));
    this.damageEnemy(best, dmg, this.teamSrc);
    this.emit({ e: 'shot', k: 'base', tw: 0, x1: r0(bx), y1: r0(by - 10), x2: r0(best.x), y2: r0(best.y), l: lvl });
  },
};

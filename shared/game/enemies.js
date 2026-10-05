// Apparition, déplacement et capacités spéciales des ennemis (boss inclus).
// Méthodes « mixées » dans Game.prototype.

import { ENEMY_TYPES } from '../data/enemies.js';
import { hpMult, bountyMult, armorMult, speedMult, countMult } from '../data/waves.js';
import { pointOnPath } from '../util.js';

const tmp = { x: 0, y: 0, dx: 0, dy: 0 };

export const EnemyMixin = {
  spawnEnemy(type, opts = {}) {
    const def = ENEMY_TYPES[type];
    if (!def) return null;
    const w = Math.max(1, this.wave);
    const flying = !!def.flying;
    const pathIdx = opts.pathIdx ?? 0;
    const path = flying ? this.airPaths[pathIdx % this.airPaths.length] : this.paths[pathIdx % this.paths.length];
    let hp =
      def.hp *
      hpMult(w) *
      this.diff.hp *
      this.hpScale *
      this.tuning.hp *
      (this.waveEvent && this.waveEvent.hpMult ? this.waveEvent.hpMult : 1);
    if (def.boss && opts.phases === 2) hp *= 0.8;
    const e = {
      id: this.nextId++,
      type,
      def,
      hp,
      maxHp: hp,
      baseArmor: def.armor * armorMult(w),
      armor: def.armor * armorMult(w),
      speed: def.speed * this.diff.speed * speedMult(w) * (def.boss || def.miniboss ? 1 : this.rng.range(0.96, 1.04)),
      curSpeed: 0,
      flying,
      path,
      pathIdx,
      dist: opts.dist ?? 0,
      seg: 0,
      x: 0,
      y: 0,
      off: def.boss || def.miniboss ? 0 : this.rng.range(-8, 8) * (flying ? 1.8 : 1),
      bounty:
        (def.bounty *
          bountyMult(w) *
          this.diff.gold *
          this.tuning.gold *
          (this.waveEvent && this.waveEvent.bountyMult ? this.waveEvent.bountyMult : 1) *
          (opts.minion && !def.minion ? 0.5 : 1)) /
        (def.boss || def.miniboss ? 1 : countMult(w)),
      damage: def.damagePct ? def.damagePct * this.base.maxHp : def.damage,
      radius: def.radius,
      st: { slow: null, burn: null, brk: null, mark: null, stun: null, chill: null },
      dmgBy: new Array(this.players.length).fill(0),
      hitT: new Array(this.players.length).fill(-99),
      assault: false,
      invulnT: 0,
      comboT: -99,
      specT: def.special && def.special.cd ? def.special.cd * 0.6 : 0,
      shield: 0,
      maxShield: 0,
      shieldT: 0,
      stealth: !!def.stealth,
      revealed: !def.stealth,
      rush: false,
      chargeT: 0,
      boss: !!def.boss,
      mini: !!def.miniboss,
      phase: 1,
      maxPhase: def.phases ? Math.min(def.phases.length, opts.phases || def.phases.length) : 1,
      stompT: 4,
      summonT: 3,
      dead: false,
      leaked: false,
    };
    if (def.special && def.special.kind === 'shield') {
      e.maxShield = e.shield = hp * def.special.amount;
    }
    this.updateEnemyPos(e);
    this.enemies.push(e);
    this.enemyById.set(e.id, e);
    if (this.waveState) {
      this.waveState.total++;
      this.waveState.hpTotal += hp;
    }
    if (e.boss) this.emit({ e: 'bossSpawn', id: e.id, n: def.name });
    else if (e.mini) this.emit({ e: 'miniSpawn', id: e.id, n: def.name });
    return e;
  },

  updateEnemyPos(e) {
    e.seg = pointOnPath(e.path, e.dist, tmp, e.seg);
    e.x = tmp.x - tmp.dy * e.off;
    e.y = tmp.y + tmp.dx * e.off;
    e.dirX = tmp.dx;
    e.dirY = tmp.dy;
  },

  // Position prédite après `t` secondes (pour les tirs en cloche du Mortier).
  predictPos(e, t, out) {
    const d = e.dist + e.curSpeed * t;
    pointOnPath(e.path, Math.min(d, e.path.length), tmp, e.seg);
    out.x = tmp.x - tmp.dy * e.off;
    out.y = tmp.y + tmp.dx * e.off;
    return out;
  },

  updateEnemies(dt) {
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead) continue;
      const st = e.st;
      if (st.slow && (st.slow.t -= dt) <= 0) st.slow = null;
      if (st.brk && (st.brk.t -= dt) <= 0) st.brk = null;
      if (st.mark && (st.mark.t -= dt) <= 0) st.mark = null;
      if (st.chill && (st.chill.t -= dt) <= 0) st.chill = null;
      if (st.burn) {
        const b = st.burn;
        this.damageEnemy(e, b.dps * dt, b.src);
        if (e.dead) continue;
        if ((b.t -= dt) <= 0) st.burn = null;
      }
      if (e.invulnT > 0) e.invulnT -= dt;

      const sp = e.def.special;
      if (sp) {
        if (sp.kind === 'regen') {
          if (!st.burn && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * sp.pct * dt);
        } else if (sp.kind === 'shield') {
          e.shieldT += dt;
          if (e.shieldT >= sp.delay && e.shield < e.maxShield) e.shield = Math.min(e.maxShield, e.shield + e.maxShield * sp.regen * dt);
        } else if (sp.kind === 'rush') {
          if (!e.rush && e.dist / e.path.length >= sp.at) {
            e.rush = true;
            this.emit({ e: 'rush', x: Math.round(e.x), y: Math.round(e.y) });
          }
        } else this.enemySpecial(e, dt);
      }
      if (e.boss) this.bossUpdate(e, dt);
      if (e.dead) continue;

      let spd = e.speed;
      if (st.slow) spd *= 1 - st.slow.pct * (e.boss || e.mini ? 0.5 : 1);
      if (e.chargeT > 0) {
        spd *= e.def.special.mult;
        e.chargeT -= dt;
      }
      if (e.rush) spd *= e.def.special.mult;
      if (st.stun) {
        spd = 0;
        if ((st.stun.t -= dt) <= 0) st.stun = null;
      }
      if (e.boss) {
        const ph = e.def.phases[e.phase - 1];
        if (ph.speedMult) spd *= ph.speedMult;
        if (e.invulnT > 0) spd *= 0.2;
      }
      e.curSpeed = spd;
      e.dist += spd * dt;
      if (e.dist >= e.path.length) {
        this.enemyReachBase(e);
        continue;
      }
      this.updateEnemyPos(e);
    }
  },

  enemySpecial(e, dt) {
    const sp = e.def.special;
    e.specT -= dt;
    if (e.specT > 0) return;
    e.specT = sp.cd;
    if (sp.kind === 'charge') {
      e.chargeT = sp.dur;
      this.emit({ e: 'charge', id: e.id, x: Math.round(e.x), y: Math.round(e.y) });
    } else if (sp.kind === 'heal') {
      const r2 = sp.radius * sp.radius;
      let n = 0;
      for (const f of this.enemies) {
        if (f.dead || f.hp >= f.maxHp) continue;
        if ((f.x - e.x) ** 2 + (f.y - e.y) ** 2 > r2) continue;
        const pct = f.boss || f.mini ? sp.pct * 0.2 : f === e ? sp.pct * 0.5 : sp.pct;
        f.hp = Math.min(f.maxHp, f.hp + f.maxHp * pct);
        n++;
      }
      this.emit({ e: 'heal', x: Math.round(e.x), y: Math.round(e.y), r: sp.radius, n });
    } else if (sp.kind === 'jam') {
      const r2 = sp.radius * sp.radius;
      let n = 0;
      for (const t of this.towers) {
        if ((t.x - e.x) ** 2 + (t.y - e.y) ** 2 <= r2) {
          if (t.disabledT <= 0) n++;
          t.disabledT = Math.max(t.disabledT, sp.dur);
        }
      }
      if (n) this.towersVersion++;
      this.emit({ e: 'jam', x: Math.round(e.x), y: Math.round(e.y), r: sp.radius, n });
    } else if (sp.kind === 'spawn') {
      for (let k = 0; k < sp.count; k++) {
        this.spawnEnemy(sp.type, { pathIdx: e.pathIdx, dist: Math.max(0, e.dist - 6 - k * 10), minion: true });
      }
      this.emit({ e: 'summon', x: Math.round(e.x), y: Math.round(e.y) });
    }
  },

  bossUpdate(e, dt) {
    const ph = e.def.phases[e.phase - 1];
    if (e.invulnT > 0) return;
    e.stompT -= dt;
    if (e.stompT <= 0) {
      e.stompT = ph.stompCd;
      this.stomp(e, ph.stompR, ph.stompDur);
    }
    if (ph.summon) {
      e.summonT -= dt;
      if (e.summonT <= 0) {
        e.summonT = ph.summonCd;
        for (let k = 0; k < ph.summon.count; k++) {
          this.spawnEnemy(ph.summon.type, { pathIdx: e.pathIdx, dist: Math.max(0, e.dist - 30 - k * 16), minion: true });
        }
        this.emit({ e: 'summon', x: Math.round(e.x), y: Math.round(e.y), boss: 1 });
      }
    }
  },

  bossPhaseUp(e) {
    e.phase++;
    const ph = e.def.phases[e.phase - 1];
    e.invulnT = 1.5;
    e.armor = e.baseArmor + (ph.armorAdd || 0);
    e.stompT = 2.5;
    e.summonT = 2;
    this.emit({ e: 'bossPhase', id: e.id, ph: e.phase, n: ph.name, x: Math.round(e.x), y: Math.round(e.y) });
  },

  stomp(e, r, dur) {
    let n = 0;
    const r2 = r * r;
    for (const t of this.towers) {
      const dx = t.x - e.x;
      const dy = t.y - e.y;
      if (dx * dx + dy * dy <= r2) {
        if (t.disabledT <= 0) n++;
        t.disabledT = Math.max(t.disabledT, dur);
      }
    }
    if (n) this.towersVersion++;
    this.emit({ e: 'stomp', x: Math.round(e.x), y: Math.round(e.y), r, n });
  },

  onBossKilled(e) {
    const gold = Math.round((e.boss ? 150 : 60) * this.diff.gold);
    const cores = e.boss ? 2 : 1;
    for (const p of this.players) {
      p.gold += gold;
      p.stats.gold += gold;
      p.cores += cores;
      if (e.boss) p.stats.bosses++;
    }
    this.teamGold += e.boss ? 200 : 80;
    if (this.waveState) this.waveState.bossKilled = true;
    this.emit({ e: 'bossDown', n: e.def.name, boss: e.boss ? 1 : 0, g: gold, c: cores, x: Math.round(e.x), y: Math.round(e.y) });
  },

  enemyReachBase(e) {
    e.dead = true;
    e.leaked = true;
    let dmg = e.damage * (1 - 0.12 * this.base.armorLvl);
    if (this.base.shield > 0) {
      const absorbed = Math.min(this.base.shield, dmg);
      this.base.shield -= absorbed;
      dmg -= absorbed;
    }
    this.base.hp = Math.max(0, this.base.hp - dmg);
    if (this.waveState) {
      this.waveState.leaks++;
      this.waveState.baseDmg += dmg;
    }
    this.emit({ e: 'leak', x: Math.round(e.x), y: Math.round(e.y), v: Math.round(dmg), boss: e.boss ? 1 : 0 });
    if (this.base.hp <= 0) this.endGame(false);
  },
};

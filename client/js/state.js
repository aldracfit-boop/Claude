// État côté client : dernier instantané reçu + interpolation des positions ennemies.

import { ENEMY_TYPES, ENEMY_IDS } from '../../shared/data/enemies.js';

const ENEMY_DEFS = ENEMY_IDS.map((id) => ENEMY_TYPES[id]);

export class ClientState {
  constructor() {
    this.snap = null;
    this.enemies = new Map();
    this.towers = new Map();
    this.tv = -1;
    this.lastSnapT = 0;
    this.interval = 50;
    this.zones = [];
  }

  apply(snap, now) {
    const prev = this.enemies;
    const next = new Map();
    for (const a of snap.enemies) {
      const id = a[0];
      let e = prev.get(id);
      if (!e) {
        const def = ENEMY_DEFS[a[1]];
        e = {
          id,
          ti: a[1],
          def,
          x: a[2],
          y: a[3],
          px: a[2],
          py: a[3],
          rx: a[2],
          ry: a[3],
          hp: a[4],
          max: a[5],
          f: a[6],
          ar: a[7],
          angle: 0,
          born: now,
          hitT: -1,
          seed: (id * 2654435761) % 1000,
        };
      } else {
        e.px = e.rx;
        e.py = e.ry;
        e.x = a[2];
        e.y = a[3];
        if (a[4] < e.hp) e.hitT = now;
        e.hp = a[4];
        e.max = a[5];
        e.f = a[6];
        e.ar = a[7];
      }
      const dx = e.x - e.px;
      const dy = e.y - e.py;
      if (dx * dx + dy * dy > 0.3) e.angle = Math.atan2(dy, dx);
      next.set(id, e);
    }
    this.enemies = next;

    if (snap.towers) {
      const m = new Map();
      for (const t of snap.towers) {
        const old = this.towers.get(t.id);
        t.angle = old ? old.angle : -Math.PI / 2 + ((t.id * 0.7) % 1);
        t.recoil = old ? old.recoil : 0;
        t.placedAt = old ? old.placedAt : now;
        t.levelAt = old && old.l !== t.l ? now : old ? old.levelAt : 0;
        m.set(t.id, t);
      }
      this.towers = m;
      this.tv = snap.tv;
    }
    this.zones = snap.zones || [];
    if (this.lastSnapT) {
      const d = now - this.lastSnapT;
      this.interval = this.interval * 0.8 + Math.min(200, Math.max(10, d)) * 0.2;
    }
    this.lastSnapT = now;
    this.snap = snap;
  }

  updateRender(now) {
    const alpha = Math.min(1, Math.max(0, (now - this.lastSnapT) / this.interval));
    for (const e of this.enemies.values()) {
      e.rx = e.px + (e.x - e.px) * alpha;
      e.ry = e.py + (e.y - e.py) * alpha;
    }
  }

  enemyAt(x, y, extra = 6) {
    let best = null;
    let bestD = Infinity;
    for (const e of this.enemies.values()) {
      const r = e.def.radius + extra;
      const d = (e.rx - x) ** 2 + (e.ry - y) ** 2;
      if (d <= r * r && d < bestD) {
        best = e;
        bestD = d;
      }
    }
    return best;
  }

  towerAtTile(c, r) {
    for (const t of this.towers.values()) if (t.c === c && t.rw === r) return t;
    return null;
  }
}

// Rendu d'une image complète du jeu sur le canvas.

import { TILE, COLS, ROWS, WORLD_W, WORLD_H, PLAYER_COLORS, RARITIES } from '../../../shared/constants.js';
import { TOWER_TYPES } from '../../../shared/data/towers.js';
import { COOP } from '../../../shared/data/team.js';
import { CELL } from '../../../shared/game/Game.js';
import { renderBackground } from './background.js';
import { drawTower, drawEnemy, drawBase, drawPortal, drawGlow } from './sprites.js';

const TAU = Math.PI * 2;

export class Renderer {
  constructor(canvas, mapGame, effects) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.mapGame = mapGame;
    this.fx = effects;
    this.scale = 1;
    this.dpr = 1;
    this.bg = null;
    this.baseHitT = -1e9;
    this.cannonAngle = -Math.PI / 2;
  }

  resize(cssW, cssH) {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.scale = cssW / WORLD_W;
    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);
    this.bg = renderBackground(this.mapGame, this.scale * this.dpr);
  }

  // Coordonnées écran (CSS) -> monde
  toWorld(px, py) {
    return { x: px / this.scale, y: py / this.scale };
  }

  toScreen(x, y) {
    return { x: x * this.scale, y: y * this.scale };
  }

  draw(now, state, ui) {
    const ctx = this.ctx;
    const snap = state.snap;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!snap || !this.bg) return;
    const s = this.scale * this.dpr;
    const [ox, oy] = this.fx.shakeOffset();
    ctx.setTransform(s, 0, 0, s, ox * s, oy * s);
    ctx.drawImage(this.bg, 0, 0, WORLD_W, WORLD_H);

    const g = this.mapGame;
    // portails d'entrée
    for (const p of g.paths) {
      const [x, y] = p.points[0];
      drawPortal(ctx, Math.max(14, x), y, '#ff4d6d', now);
    }
    for (const p of g.airPaths) {
      const [x, y] = p.points[0];
      drawPortal(ctx, Math.max(14, x), Math.min(WORLD_H - 14, y), '#48dbfb', now, 18);
    }

    // zones de napalm
    for (const z of state.zones) {
      const [, x, y, r, t] = z;
      const a = Math.min(1, t);
      drawGlow(ctx, x, y, r * 1.3, '#ff6a00', 0.45 * a);
      ctx.fillStyle = `rgba(255, 120, 30, ${0.18 * a})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      if (Math.random() < 0.5) {
        const aa = Math.random() * TAU;
        const rr = Math.random() * r;
        this.fx.particle({
          x: x + Math.cos(aa) * rr,
          y: y + Math.sin(aa) * rr,
          vx: 0,
          vy: -30,
          life: 0.5,
          max: 0.5,
          size: 3,
          color: '#ffb347',
          drag: 1,
          glow: true,
        });
      }
    }

    // surbrillance de placement / déplacement
    const placing = ui.placing || ui.moving;
    if (placing) this.drawPlacementGrid(ctx, state, ui);

    // portée de la tourelle survolée / sélectionnée
    const sel = ui.selectedId ? state.towers.get(ui.selectedId) : null;
    const hov = ui.hoverTowerId && ui.hoverTowerId !== ui.selectedId ? state.towers.get(ui.hoverTowerId) : null;
    const rangeK = snap.ev === 'storm' ? 0.85 : 1;
    if (sel) this.drawRange(ctx, sel.x, sel.y, sel.st.range * rangeK, sel.st.min, PLAYER_COLORS[sel.o], 0.16);
    if (hov) this.drawRange(ctx, hov.x, hov.y, hov.st.range * rangeK, hov.st.min, '#ffffff', 0.07);
    if (sel) this.drawLinks(ctx, state, sel);

    // base
    const base = snap.base;
    drawBase(ctx, g.basePos.x, g.basePos.y, base, now, { hitT: this.baseHitT, cannonAngle: this.cannonAngle });

    // tourelles
    const players = snap.players;
    for (const t of state.towers.values()) {
      // orientation lissée
      if (t.aim != null) {
        let d = t.aim - t.angle;
        while (d > Math.PI) d -= TAU;
        while (d < -Math.PI) d += TAU;
        t.angle += d * 0.35;
      }
      if (t.recoil > 0) t.recoil = Math.max(0, t.recoil - 0.12);
      const scale = this.fx.fusionScale(t.id);
      const placedK = Math.min(1, (now - t.placedAt) / 180);
      const oc = (t.os || [t.o]).some((o) => players[o] && players[o].oc > 0);
      const owner = players[t.o];
      drawTower(ctx, t, {
        now,
        skin: owner ? owner.skin : 0,
        scale: scale * (0.6 + 0.4 * placedK),
        overcharge: oc,
      });
      if (ui.fusionSel && ui.fusionSel.candidates.has(t.id)) {
        const chosen = ui.fusionSel.chosen.includes(t.id);
        ctx.strokeStyle = chosen ? '#5ef2e6' : `rgba(94, 242, 230, ${0.4 + 0.4 * Math.sin(now / 150)})`;
        ctx.lineWidth = chosen ? 3 : 2;
        ctx.beginPath();
        ctx.arc(t.x, t.y, 24, 0, TAU);
        ctx.stroke();
        if (chosen) {
          ctx.fillStyle = '#5ef2e6';
          ctx.font = 'bold 14px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('✓', t.x + 15, t.y - 13);
        }
      }
    }
    if (sel && !ui.fusionSel) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(sel.x - 22, sel.y - 22, 44, 44);
      ctx.setLineDash([]);
    }
    if (ui.fusionSel) {
      const p = state.towers.get(ui.fusionSel.primaryId);
      if (p) {
        drawGlow(ctx, p.x, p.y, 34, '#5ef2e6', 0.6);
      }
    }

    // ennemis (terrestres puis volants)
    const bossId = snap.boss ? snap.boss.id : 0;
    for (let pass = 0; pass < 2; pass++) {
      for (const e of state.enemies.values()) {
        if (!!e.def.flying !== (pass === 1)) continue;
        drawEnemy(ctx, e, now);
        if (e.f & 2 && Math.random() < 0.3) {
          this.fx.particle({
            x: e.rx + (Math.random() - 0.5) * e.def.radius,
            y: e.ry - e.def.radius * 0.3,
            vx: 0,
            vy: -40,
            life: 0.35,
            max: 0.35,
            size: 2.5,
            color: '#ff9f43',
            drag: 1,
            glow: true,
          });
        }
        if (e.hp < e.max && e.id !== bossId) this.drawHpBar(ctx, e);
        if (ui.hoverEnemyId === e.id) {
          ctx.strokeStyle = 'rgba(255,255,255,0.7)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(e.rx, e.ry, e.def.radius + 5, 0, TAU);
          ctx.stroke();
        }
      }
    }

    this.fx.drawWorld(ctx, now);

    // fantôme de placement
    if (placing && ui.hoverTile) this.drawGhost(ctx, state, ui, now);

    // ciblage de capacité
    if (ui.abilityTarget && ui.mouseWorld) {
      const { x, y } = ui.mouseWorld;
      ctx.strokeStyle = 'rgba(255, 120, 80, 0.9)';
      ctx.fillStyle = 'rgba(255, 120, 80, 0.12)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.arc(x, y, ui.abilityTarget.radius, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x - 8, y);
      ctx.lineTo(x + 8, y);
      ctx.moveTo(x, y - 8);
      ctx.lineTo(x, y + 8);
      ctx.stroke();
    }

    this.fx.drawTexts(ctx);

    // Tempête : pluie et assombrissement
    if (snap.ev === 'storm') this.drawStorm(ctx, now);

    // effets plein écran
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;
    this.fx.drawScreen(ctx, w, h);
    const hpPct = base.hp / base.max;
    if (hpPct < 0.3 && snap.phase === 'wave') {
      const a = (0.3 - hpPct) * 1.2 * (0.6 + 0.4 * Math.sin(now / 250));
      const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, w * 0.7);
      vg.addColorStop(0, 'rgba(255,0,0,0)');
      vg.addColorStop(1, `rgba(255,0,30,${a})`);
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
    }
  }

  drawStorm(ctx, now) {
    ctx.fillStyle = 'rgba(20, 30, 50, 0.28)';
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    ctx.strokeStyle = 'rgba(180, 200, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const t = now / 1000;
    for (let i = 0; i < 160; i++) {
      const x = ((i * 97.13 + t * 260) % (WORLD_W + 100)) - 50;
      const y = ((i * 53.7 + t * 900) % (WORLD_H + 60)) - 30;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 6, y + 16);
    }
    ctx.stroke();
    if (Math.sin(t * 0.7) > 0.995) {
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    }
  }

  drawRange(ctx, x, y, r, minR, color, alpha) {
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = Math.min(1, alpha * 4);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (minR) {
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(x, y, minR, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;
  }

  drawLinks(ctx, state, t) {
    const R2 = COOP.linkRadius * COOP.linkRadius;
    const owners = t.os || [t.o];
    for (const u of state.towers.values()) {
      if (u === t) continue;
      const d2 = (u.x - t.x) ** 2 + (u.y - t.y) ** 2;
      if (d2 > R2) continue;
      const other = (u.os || [u.o]).find((o) => !owners.includes(o));
      if (other == null) continue;
      ctx.strokeStyle = PLAYER_COLORS[other];
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(t.x, t.y);
      ctx.lineTo(u.x, u.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
  }

  drawPlacementGrid(ctx, state, ui) {
    const g = this.mapGame;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (g.grid[r * COLS + c] !== CELL.FREE) continue;
        if (state.towerAtTile(c, r)) continue;
        ctx.fillRect(c * TILE + 3, r * TILE + 3, TILE - 6, TILE - 6);
      }
    }
  }

  drawGhost(ctx, state, ui, now) {
    const { c, r } = ui.hoverTile;
    const x = (c + 0.5) * TILE;
    const y = (r + 0.5) * TILE;
    const valid = ui.canPlaceAt(c, r);
    let type;
    let range;
    let minR = 0;
    let level = 1;
    let rarity = 0;
    let branch = null;
    let owner = ui.me;
    if (ui.moving) {
      const t = state.towers.get(ui.moving);
      if (!t) return;
      type = t.tt;
      range = t.st.range;
      minR = t.st.min;
      level = t.l;
      rarity = t.r;
      branch = t.b;
      owner = t.o;
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(t.x, t.y);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      type = ui.placing;
      const def = TOWER_TYPES[type];
      range = def.range;
      minR = def.minRange || 0;
    }
    this.drawRange(ctx, x, y, range, minR, valid ? '#7cc0ff' : '#ff5c6c', 0.12);
    // aperçu des liens de coopération à cet emplacement
    if (valid) {
      const R2 = COOP.linkRadius * COOP.linkRadius;
      for (const u of state.towers.values()) {
        if ((u.x - x) ** 2 + (u.y - y) ** 2 > R2 || u.id === ui.moving) continue;
        const other = (u.os || [u.o]).find((o) => o !== owner);
        if (other == null) continue;
        ctx.strokeStyle = PLAYER_COLORS[other];
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(u.x, u.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    drawTower(
      ctx,
      { tt: type, l: level, r: rarity, b: branch, o: owner, os: [owner], x, y, id: 0 },
      { now, alpha: valid ? 0.75 : 0.35, angle: -Math.PI / 2 },
    );
    ctx.strokeStyle = valid ? 'rgba(120, 255, 170, 0.9)' : 'rgba(255, 80, 90, 0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(c * TILE + 1, r * TILE + 1, TILE - 2, TILE - 2);
  }

  drawHpBar(ctx, e) {
    const r = e.def.radius;
    const w = Math.max(18, r * 2);
    const x = e.rx - w / 2;
    const y = e.ry - r - (e.def.flying ? 16 : 9);
    const k = Math.max(0, e.hp / e.max);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - 1, y - 1, w + 2, 5);
    ctx.fillStyle = k > 0.6 ? '#2ed573' : k > 0.3 ? '#ffd166' : '#ff5c6c';
    ctx.fillRect(x, y, w * k, 3);
    if (e.ar > 0) {
      ctx.fillStyle = e.f & 4 ? '#ffa94d' : '#c9d1d9';
      ctx.fillRect(x, y + 3, Math.min(w, e.ar * 2), 1);
    }
  }
}

export { RARITIES };

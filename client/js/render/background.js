// Pré-rendu du décor d'une carte dans un canvas hors-écran.

import { TILE, COLS, ROWS, WORLD_W, WORLD_H } from '../../../shared/constants.js';
import { CELL } from '../../../shared/game/Game.js';
import { RNG } from '../../../shared/util.js';
import { shade } from './sprites.js';

export function renderBackground(game, scale) {
  const map = game.map;
  const theme = map.theme;
  const cv = document.createElement('canvas');
  cv.width = Math.round(WORLD_W * scale);
  cv.height = Math.round(WORLD_H * scale);
  const ctx = cv.getContext('2d');
  ctx.scale(scale, scale);
  const rng = new RNG(map.decorSeed || 1);

  // Herbe
  ctx.fillStyle = theme.grassA;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = rng.next();
      ctx.fillStyle = (c + r) % 2 ? theme.grassA : theme.grassB;
      ctx.globalAlpha = 0.55 + v * 0.25;
      ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
    }
  }
  ctx.globalAlpha = 1;
  // touffes et fleurs
  for (let i = 0; i < 900; i++) {
    const x = rng.next() * WORLD_W;
    const y = rng.next() * WORLD_H;
    const c = Math.floor(x / TILE);
    const r = Math.floor(y / TILE);
    if (game.grid[r * COLS + c] !== CELL.FREE) continue;
    if (rng.next() < 0.08) {
      ctx.fillStyle = rng.pick(['#f7d794', '#f8a5c2', '#ffffff', '#c8d6e5']);
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = shade(theme.grassB, rng.range(-0.25, 0.25));
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 2, y - 4);
      ctx.moveTo(x, y);
      ctx.lineTo(x + 2, y - 5);
      ctx.stroke();
    }
  }

  // Couloir aérien (indication stratégique)
  ctx.save();
  ctx.setLineDash([10, 12]);
  ctx.strokeStyle = 'rgba(130, 220, 255, 0.28)';
  ctx.lineWidth = 3;
  for (const p of game.airPaths) {
    ctx.beginPath();
    p.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  }
  ctx.restore();

  // Chemin terrestre
  for (const p of game.paths) {
    const pts = p.points;
    const stroke = (w, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    };
    stroke(TILE + 2, shade(theme.pathEdge, -0.25));
    stroke(TILE - 2, theme.pathEdge);
    stroke(TILE - 8, theme.path);
    // traces
    ctx.save();
    ctx.setLineDash([2, 14]);
    stroke(3, shade(theme.path, -0.12));
    ctx.restore();
  }
  // gravillons sur le chemin
  for (let i = 0; i < 1400; i++) {
    const x = rng.next() * WORLD_W;
    const y = rng.next() * WORLD_H;
    const c = Math.floor(x / TILE);
    const r = Math.floor(y / TILE);
    if (game.grid[r * COLS + c] !== CELL.PATH) continue;
    ctx.fillStyle = shade(theme.path, rng.range(-0.2, 0.15));
    ctx.fillRect(x, y, 2, 2);
  }

  // Eau
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (game.grid[r * COLS + c] !== CELL.WATER) continue;
      const x = c * TILE;
      const y = r * TILE;
      ctx.fillStyle = shade(theme.water, -0.2);
      ctx.fillRect(x - 1, y - 1, TILE + 2, TILE + 2);
    }
  }
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (game.grid[r * COLS + c] !== CELL.WATER) continue;
      const x = c * TILE;
      const y = r * TILE;
      ctx.fillStyle = theme.water;
      ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1.2;
      for (let k = 0; k < 2; k++) {
        const wx = x + 6 + rng.next() * 20;
        const wy = y + 8 + rng.next() * 24;
        ctx.beginPath();
        ctx.moveTo(wx, wy);
        ctx.quadraticCurveTo(wx + 4, wy - 3, wx + 9, wy);
        ctx.stroke();
      }
    }
  }

  // Rochers et arbres
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (game.grid[r * COLS + c] !== CELL.BLOCKED) continue;
      const x = (c + 0.5) * TILE;
      const y = (r + 0.5) * TILE;
      if ((c * 7 + r * 3) % 3 === 0) drawTree(ctx, x, y, rng);
      else drawRock(ctx, x, y, rng);
    }
  }

  // Grille discrète des cases constructibles
  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  ctx.lineWidth = 1;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (game.grid[r * COLS + c] !== CELL.FREE) continue;
      ctx.strokeRect(c * TILE + 0.5, r * TILE + 0.5, TILE - 1, TILE - 1);
    }
  }

  // Vignettage
  const vg = ctx.createRadialGradient(WORLD_W / 2, WORLD_H / 2, WORLD_H * 0.4, WORLD_W / 2, WORLD_H / 2, WORLD_W * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  return cv;
}

function drawRock(ctx, x, y, rng) {
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(x + 2, y + 9, 15, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  const n = 7;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i * Math.PI * 2) / n;
    const rr = 11 + rng.next() * 6;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr * 0.8;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  const g = ctx.createLinearGradient(x, y - 14, x, y + 14);
  g.addColorStop(0, '#a4adbd');
  g.addColorStop(1, '#5a6272');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = '#3a404c';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawTree(ctx, x, y, rng) {
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(x + 3, y + 10, 16, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6b4f32';
  ctx.fillRect(x - 3, y, 6, 12);
  const base = rng.pick(['#2f6b2f', '#3b7d3b', '#2a5f3a']);
  for (const [dx, dy, r] of [
    [0, -6, 13],
    [-7, 0, 10],
    [7, 0, 10],
    [0, -14, 9],
  ]) {
    ctx.fillStyle = shade(base, dy < -10 ? 0.15 : 0);
    ctx.beginPath();
    ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.beginPath();
  ctx.arc(x - 4, y - 12, 5, 0, Math.PI * 2);
  ctx.fill();
}

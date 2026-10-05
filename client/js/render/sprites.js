// Dessin procédural des tourelles, ennemis et de la base (aucune image externe).

import { TOWER_TYPES } from '../../../shared/data/towers.js';
import { RARITIES, PLAYER_COLORS } from '../../../shared/constants.js';
import { SKINS } from '../profile.js';

const TAU = Math.PI * 2;

export function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Sprites de halo (dégradés radiaux) mis en cache : bien plus rapides que shadowBlur.
const glowCache = new Map();
export function glowSprite(color, radius = 32) {
  const key = color + radius;
  let c = glowCache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = radius * 2;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(radius, radius, 0, radius, radius, radius);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, radius * 2, radius * 2);
    glowCache.set(key, c);
  }
  return c;
}

// Cache générique de sprites pré-rendus (évite de recréer des dégradés à chaque image).
const spriteCache = new Map();
const SPRITE_RES = 2;
function cachedSprite(key, w, hgt, draw) {
  let c = spriteCache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = Math.ceil(w * SPRITE_RES);
    c.height = Math.ceil(hgt * SPRITE_RES);
    const g = c.getContext('2d');
    g.scale(SPRITE_RES, SPRITE_RES);
    g.translate(w / 2, hgt / 2);
    draw(g);
    spriteCache.set(key, c);
  }
  return c;
}

function blit(ctx, sprite, w, hgt) {
  ctx.drawImage(sprite, -w / 2, -hgt / 2, w, hgt);
}

export function drawGlow(ctx, x, y, r, color, alpha = 1) {
  const s = glowSprite(color);
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * alpha;
  ctx.drawImage(s, x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = a;
}

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (amt >= 0) {
    r += (255 - r) * amt;
    g += (255 - g) * amt;
    b += (255 - b) * amt;
  } else {
    r *= 1 + amt;
    g *= 1 + amt;
    b *= 1 + amt;
  }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// ------------------------------------------------------------------ Tourelles
export function drawTower(ctx, t, o = {}) {
  const def = TOWER_TYPES[t.tt];
  const L = t.l;
  const R = RARITIES[t.r] || RARITIES[0];
  const now = o.now || 0;
  const skin = SKINS[o.skin | 0] || SKINS[0];
  const angle = o.angle ?? t.angle ?? -Math.PI / 4;
  ctx.save();
  ctx.translate(t.x, t.y);
  if (o.scale && o.scale !== 1) ctx.scale(o.scale, o.scale);
  if (o.alpha != null) ctx.globalAlpha *= o.alpha;

  // Halo de rareté
  if (t.r >= 2) {
    const pulse = t.r >= 3 ? 0.25 + 0.12 * Math.sin(now / 400 + t.id) : 0.18;
    drawGlow(ctx, 0, 0, 30 + t.r * 3, R.color, pulse);
  }
  if (t.r >= 4) {
    ctx.save();
    ctx.rotate(now / 2500);
    ctx.fillStyle = 'rgba(255, 209, 102, 0.16)';
    for (let i = 0; i < 6; i++) {
      ctx.rotate(TAU / 6);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(34, -5);
      ctx.lineTo(34, 5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // Socle
  const size = 28 + L * 1.4;
  const hs = size / 2;
  const pw = size + 4;
  blit(
    ctx,
    cachedSprite(`plate|${skin.id}|${L}|${R.id}`, pw, pw, (g) => {
      const grad = g.createLinearGradient(0, -hs, 0, hs);
      grad.addColorStop(0, skin.plate[0]);
      grad.addColorStop(1, skin.plate[1]);
      g.fillStyle = grad;
      rrect(g, -hs, -hs, size, size, 7);
      g.fill();
      g.lineWidth = L >= 5 ? 2.6 : 2;
      g.strokeStyle = R.color;
      g.stroke();
      if (L >= 4) {
        g.lineWidth = 1;
        g.strokeStyle = L >= 5 ? '#ffd166' : skin.trim;
        rrect(g, -hs + 3.5, -hs + 3.5, size - 7, size - 7, 5);
        g.stroke();
      }
      // rivets (niveau 2+)
      if (L >= 2) {
        g.fillStyle = L >= 5 ? '#ffd166' : skin.trim;
        const k = hs - 4.5;
        for (const [sx, sy] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ]) {
          g.beginPath();
          g.arc(sx * k, sy * k, L >= 3 ? 1.9 : 1.4, 0, TAU);
          g.fill();
        }
      }
    }),
    pw,
    pw,
  );
  // Bande(s) du ou des propriétaires
  const owners = t.os && t.os.length ? t.os : [t.o];
  const bw = (size - 10) / owners.length;
  owners.forEach((oid, i) => {
    ctx.fillStyle = PLAYER_COLORS[oid] || '#fff';
    ctx.fillRect(-hs + 5 + i * bw, hs - 4.5, bw - (i < owners.length - 1 ? 1 : 0), 3);
  });

  // Tourelle orientable
  ctx.save();
  ctx.rotate(angle);
  if (t.recoil) ctx.translate(-t.recoil * 3, 0);
  const k = 1 + (L - 1) * 0.09;
  TURRETS[def.id](ctx, k, L, t.b, def, now);
  ctx.restore();

  // Pastilles de niveau
  for (let i = 0; i < L; i++) {
    ctx.fillStyle = L >= 5 ? '#ffd166' : '#ffffff';
    ctx.globalAlpha *= 0.9;
    ctx.beginPath();
    ctx.arc(-hs + 5 + i * 4.2, -hs + 4.5, 1.5, 0, TAU);
    ctx.fill();
    ctx.globalAlpha /= 0.9;
  }

  if (o.overcharge) {
    ctx.strokeStyle = `rgba(255, 230, 80, ${0.5 + 0.4 * Math.sin(now / 80)})`;
    ctx.lineWidth = 2;
    rrect(ctx, -hs - 3, -hs - 3, size + 6, size + 6, 9);
    ctx.stroke();
  }
  if (t.dis) {
    ctx.fillStyle = 'rgba(10, 10, 20, 0.6)';
    rrect(ctx, -hs, -hs, size, size, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 140, 80, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-hs + 4, -4);
    ctx.lineTo(-3, 2);
    ctx.lineTo(3, -3);
    ctx.lineTo(hs - 4, 5);
    ctx.stroke();
    ctx.fillStyle = '#ffd166';
    for (let i = 0; i < 3; i++) {
      const a = now / 300 + (i * TAU) / 3;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 10, -hs - 2 + Math.sin(a) * 3, 1.8, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

function barrel(ctx, x, y, len, w, color, tip) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y - w / 2, len, w);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x, y - w / 2, len, w * 0.3);
  if (tip) {
    ctx.fillStyle = tip;
    ctx.fillRect(x + len - 3, y - w / 2 - 0.8, 3, w + 1.6);
  }
}

function body(ctx, r, color, stroke) {
  const d = r * 2 + 4;
  blit(
    ctx,
    cachedSprite(`body|${color}|${r.toFixed(2)}|${stroke}`, d, d, (g) => {
      const grad = g.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r);
      grad.addColorStop(0, shade(color, 0.35));
      grad.addColorStop(1, shade(color, -0.25));
      g.fillStyle = grad;
      g.beginPath();
      g.arc(0, 0, r, 0, TAU);
      g.fill();
      g.strokeStyle = stroke;
      g.lineWidth = 1.5;
      g.stroke();
    }),
    d,
    d,
  );
}

const TURRETS = {
  canon(ctx, k, L, b, def) {
    const dark = shade(def.color, -0.45);
    const twin = L >= 4 || b === 'C';
    const len = (b === 'A' ? 12 : 15) * k;
    const w = (b === 'A' ? 8 : 6) * k;
    const tip = b === 'B' ? '#ff5c6c' : b === 'A' ? '#ffa94d' : null;
    if (twin) {
      barrel(ctx, 2, -3.6 * k, len, w * 0.8, dark, tip);
      barrel(ctx, 2, 3.6 * k, len, w * 0.8, dark, tip);
    } else barrel(ctx, 2, 0, len, w, dark, tip);
    body(ctx, 8.5 * k, def.color, dark);
    if (L >= 3) {
      ctx.fillStyle = shade(def.color, -0.3);
      ctx.beginPath();
      ctx.arc(0, 0, 3.4 * k, 0, TAU);
      ctx.fill();
    }
  },
  mg(ctx, k, L, b, def, now) {
    const dark = shade(def.color, -0.5);
    const n = b === 'B' ? 1 : L >= 3 ? 3 : 2;
    const len = (b === 'B' ? 20 : 16) * k;
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : (i - (n - 1) / 2) * 3.2 * k;
      barrel(ctx, 3, off, len, 2.4 * k, dark, b === 'C' ? '#ffd166' : null);
    }
    if (b === 'A') {
      ctx.save();
      ctx.translate(len + 2, 0);
      ctx.rotate(now / 40);
      ctx.strokeStyle = '#d7e3b5';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 3.5 * k, 0, TAU * 0.75);
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = def.color;
    rrect(ctx, -7.5 * k, -7 * k, 14 * k, 14 * k, 4);
    ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (b === 'B') {
      ctx.fillStyle = '#222';
      ctx.fillRect(2, -6.5 * k, 9 * k, 3);
      ctx.fillStyle = '#7cc0ff';
      ctx.fillRect(10 * k, -6.5 * k, 2, 3);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(-5.5 * k, -5 * k, 10 * k, 2);
  },
  sniper(ctx, k, L, b, def) {
    const dark = shade(def.color, -0.5);
    const len = 25 * k;
    barrel(ctx, 0, 0, len, 3.2 * k, dark, '#1b1b1b');
    if (b === 'B') {
      ctx.fillStyle = '#58a6ff';
      for (let i = 0; i < 3; i++) ctx.fillRect(7 + i * 5 * k, -3 * k, 2.2, 6 * k);
    }
    if (b === 'A') {
      ctx.fillStyle = '#ff5c6c';
      ctx.fillRect(6, -2 * k, 8 * k, 1.4);
    }
    ctx.fillStyle = dark;
    ctx.fillRect(len - 4, -3 * k, 4, 6 * k);
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.moveTo(-9 * k, 0);
    ctx.lineTo(-3 * k, -7 * k);
    ctx.lineTo(6 * k, -5 * k);
    ctx.lineTo(6 * k, 5 * k);
    ctx.lineTo(-3 * k, 7 * k);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = '#20232b';
    ctx.fillRect(-2 * k, -5.5 * k, 10 * k, 3.4 * k);
    ctx.fillStyle = b === 'C' ? '#ff5c6c' : '#7cc0ff';
    ctx.fillRect(7 * k, -5.5 * k, 1.8, 3.4 * k);
  },
  mortar(ctx, k, L, b, def) {
    const dark = shade(def.color, -0.5);
    body(ctx, 10.5 * k, shade(def.color, -0.15), dark);
    const ring = b === 'A' ? '#ff7b39' : b === 'C' ? '#5ef2e6' : b === 'B' ? '#c9d1d9' : shade(def.color, 0.2);
    const tubes =
      L >= 4
        ? [
            [3, -4.5],
            [3, 4.5],
          ]
        : [[3.5, 0]];
    for (const [tx, ty] of tubes) {
      const r = (L >= 4 ? 5.2 : 6.6) * k;
      ctx.fillStyle = shade(def.color, 0.1);
      ctx.beginPath();
      ctx.arc(tx * k, ty * k, r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = ring;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.fillStyle = '#16100c';
      ctx.beginPath();
      ctx.arc(tx * k + 0.8, ty * k, r * 0.6, 0, TAU);
      ctx.fill();
    }
    if (b === 'B') {
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-10 * k, 0);
      ctx.lineTo(-4 * k, 0);
      ctx.stroke();
    }
  },
  frost(ctx, k, L, b, def, now) {
    const dark = shade(def.color, -0.5);
    if (b === 'B') {
      // aura polaire : flocon tournant
      ctx.save();
      ctx.rotate(now / 900);
      ctx.strokeStyle = '#e6fbff';
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        ctx.rotate(TAU / 6);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(11 * k, 0);
        ctx.moveTo(7 * k, 0);
        ctx.lineTo(9.5 * k, -3 * k);
        ctx.moveTo(7 * k, 0);
        ctx.lineTo(9.5 * k, 3 * k);
        ctx.stroke();
      }
      ctx.restore();
      drawGlow(ctx, 0, 0, 14 * k, '#bff6ff', 0.7);
      return;
    }
    const shards = L >= 4 ? [-3.2, 3.2] : [0];
    for (const off of shards) {
      ctx.fillStyle = '#dff9fb';
      ctx.beginPath();
      ctx.moveTo(4, off * k - 2.6 * k);
      ctx.lineTo((b === 'C' ? 21 : 16) * k, off * k);
      ctx.lineTo(4, off * k + 2.6 * k);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = dark;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.fillStyle = def.color;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i * TAU) / 6;
      const x = Math.cos(a) * 8.5 * k;
      const y = Math.sin(a) * 8.5 * k;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = b === 'A' ? '#ff7675' : '#ffffff';
    ctx.globalAlpha *= 0.85;
    ctx.beginPath();
    ctx.arc(0, 0, 3 * k, 0, TAU);
    ctx.fill();
    ctx.globalAlpha /= 0.85;
  },
  tesla(ctx, k, L, b, def, now) {
    const dark = shade(def.color, -0.55);
    ctx.strokeStyle = dark;
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, (10 - i * 3.5) * k, 0, TAU);
      ctx.stroke();
    }
    const prongs = b === 'B' ? 1 : b === 'A' ? 4 : 3;
    ctx.save();
    ctx.rotate(now / 1200);
    for (let i = 0; i < prongs; i++) {
      ctx.rotate(TAU / prongs);
      ctx.fillStyle = '#dcd6ff';
      ctx.fillRect(7 * k, -1.5, 5 * k, 3);
    }
    ctx.restore();
    const orb = b === 'C' ? '#ffd166' : '#c8b6ff';
    drawGlow(ctx, 0, 0, 13 * k, orb, 0.75 + 0.25 * Math.sin(now / 90));
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 3.6 * k, 0, TAU);
    ctx.fill();
    if (Math.random() < 0.25) {
      ctx.strokeStyle = 'rgba(220, 210, 255, 0.9)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const a = Math.random() * TAU;
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * 6 * k + (Math.random() - 0.5) * 3, Math.sin(a) * 6 * k + (Math.random() - 0.5) * 3);
      ctx.lineTo(Math.cos(a) * 11 * k, Math.sin(a) * 11 * k);
      ctx.stroke();
    }
  },
  railgun(ctx, k, L, b, def, now) {
    const dark = shade(def.color, -0.55);
    ctx.fillStyle = dark;
    ctx.fillRect(-2, -5 * k, 27 * k, 2.6);
    ctx.fillRect(-2, 5 * k - 2.6, 27 * k, 2.6);
    ctx.globalAlpha *= 0.6 + 0.4 * Math.sin(now / 120);
    ctx.fillStyle = '#9ad0ff';
    ctx.fillRect(2, -1.2, 23 * k, 2.4);
    ctx.globalAlpha = 1;
    ctx.fillStyle = def.color;
    rrect(ctx, -9 * k, -7 * k, 14 * k, 14 * k, 4);
    ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    drawGlow(ctx, -2 * k, 0, 7 * k, '#74b9ff', 0.8);
  },
  cryomortar(ctx, k, L, b, def) {
    TURRETS.mortar(ctx, k, L, 'C', { color: '#7fb3d5' });
    drawGlow(ctx, 3 * k, 0, 9 * k, '#d6f5ff', 0.55);
  },
  plasma(ctx, k, L, b, def, now) {
    const n = 3;
    for (let i = 0; i < n; i++) {
      const off = (i - 1) * 3.4 * k;
      ctx.fillStyle = '#4b2a63';
      ctx.fillRect(3, off - 1.3 * k, 17 * k, 2.6 * k);
      ctx.fillStyle = `rgba(230, 160, 255, ${0.5 + 0.4 * Math.sin(now / 70 + i)})`;
      ctx.fillRect(5, off - 0.6, 14 * k, 1.2);
    }
    body(ctx, 8.5 * k, def.color, shade(def.color, -0.55));
    drawGlow(ctx, 0, 0, 8 * k, '#f0b3ff', 0.6);
  },
  elemental(ctx, k, L, b, def, now) {
    ctx.save();
    ctx.rotate(now / 500);
    ctx.fillStyle = '#ff7b39';
    ctx.beginPath();
    ctx.arc(0, 0, 10 * k, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = '#48dbfb';
    ctx.beginPath();
    ctx.arc(0, 0, 10 * k, Math.PI, TAU);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#2d1b10';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 10 * k, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = '#16100c';
    ctx.beginPath();
    ctx.arc(3 * k, 0, 4.5 * k, 0, TAU);
    ctx.fill();
    drawGlow(ctx, 3 * k, 0, 7 * k, '#ffffff', 0.35);
  },
};

// Icône statique d'une tourelle (boutique, panneau).
export function towerIcon(canvas, type, level = 1, rarity = 0, branch = null, owner = 0, skin = 0) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || canvas.width;
  const hgt = canvas.clientHeight || canvas.height;
  canvas.width = w * dpr;
  canvas.height = hgt * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, hgt);
  const s = Math.min(w, hgt) / 44;
  ctx.translate(w / 2, hgt / 2);
  ctx.scale(s, s);
  drawTower(ctx, { tt: type, l: level, r: rarity, b: branch, o: owner, os: [owner], x: 0, y: 0, id: 1 }, { angle: -Math.PI / 4, skin });
}

export function enemyIcon(canvas, def) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || canvas.width;
  const hgt = canvas.clientHeight || canvas.height;
  canvas.width = w * dpr;
  canvas.height = hgt * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const s = Math.min(w, hgt) / (def.radius * 2.6);
  ctx.translate(w / 2, hgt / 2);
  ctx.scale(s, s);
  drawEnemy(ctx, { def, rx: 0, ry: 0, angle: 0, f: def.flying ? 64 : 0, hp: 1, max: 1, seed: 1, hitT: -1, id: 1 }, 0, { icon: true });
}

// ------------------------------------------------------------------ Ennemis
export function drawEnemy(ctx, e, now, o = {}) {
  const d = e.def;
  const r = d.radius;
  const flying = d.flying;
  ctx.save();
  ctx.translate(e.rx, e.ry);
  if (!o.icon) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    if (flying) ctx.ellipse(0, 16, r * 0.9, r * 0.4, 0, 0, TAU);
    else ctx.ellipse(0, r * 0.65, r * 0.95, r * 0.45, 0, 0, TAU);
    ctx.fill();
  }
  if (flying && !o.icon) ctx.translate(0, Math.sin(now / 220 + e.seed) * 2 - 4);
  const f = e.f || 0;
  if (f & 128) ctx.globalAlpha *= 0.22 + 0.08 * Math.sin(now / 120 + e.seed);
  if (f & 16) drawGlow(ctx, 0, 0, r * 2.2, '#ffffff', 0.5);
  if (f & 32 && (d.boss || d.miniboss)) drawGlow(ctx, 0, 0, r * 2.4, '#ff3b3b', 0.55 + 0.2 * Math.sin(now / 90));
  const draw = ENEMIES[d.id] || ENEMIES.runner;
  draw(ctx, e, r, d, now, f);
  if (now - e.hitT < 70) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.95, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  if (f & 1) {
    ctx.strokeStyle = 'rgba(140, 210, 255, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r + 3, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = 'rgba(140, 210, 255, 0.18)';
    ctx.fill();
  }
  if (f & 512) {
    ctx.strokeStyle = '#fff3a0';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 3; i++) {
      const a = now / 150 + (i * TAU) / 3;
      const x = Math.cos(a) * (r + 2);
      const y = -r - 4 + Math.sin(a) * 3;
      ctx.beginPath();
      ctx.moveTo(x - 2, y - 2);
      ctx.lineTo(x + 1, y);
      ctx.lineTo(x - 1, y + 1);
      ctx.lineTo(x + 2, y + 3);
      ctx.stroke();
    }
  }
  if (f & 1024) {
    ctx.fillStyle = 'rgba(200, 245, 255, 0.85)';
    for (let i = 0; i < 4; i++) {
      const a = (i * TAU) / 4 + 0.4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
      ctx.lineTo(Math.cos(a + 0.2) * (r + 4), Math.sin(a + 0.2) * (r + 4));
      ctx.lineTo(Math.cos(a - 0.2) * (r + 4), Math.sin(a - 0.2) * (r + 4));
      ctx.closePath();
      ctx.fill();
    }
  }
  if (f & 8) {
    ctx.save();
    ctx.rotate(now / 500);
    ctx.strokeStyle = '#ff4d6d';
    ctx.lineWidth = 1.5;
    const m = r + 6;
    ctx.beginPath();
    ctx.arc(0, 0, m, 0, TAU);
    for (let i = 0; i < 4; i++) {
      const a = (i * TAU) / 4;
      ctx.moveTo(Math.cos(a) * (m - 3), Math.sin(a) * (m - 3));
      ctx.lineTo(Math.cos(a) * (m + 4), Math.sin(a) * (m + 4));
    }
    ctx.stroke();
    ctx.restore();
  }
  if (e.sh > 0) {
    const k = e.msh ? e.sh / e.msh : 1;
    ctx.strokeStyle = `rgba(110, 180, 255, ${0.35 + 0.5 * k})`;
    ctx.lineWidth = 1.5 + k * 1.5;
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const a = (i * TAU) / 6 + now / 1500;
      const x = Math.cos(a) * (r + 5);
      const y = Math.sin(a) * (r + 5);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = `rgba(110, 180, 255, ${0.1 + 0.12 * k})`;
    ctx.fill();
  }
  if (f & 4) {
    ctx.fillStyle = '#ffa94d';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⛨', 0, -r - 9);
  }
  ctx.restore();
}

function eyes(ctx, e, r, ex = 0.35, size = 0.28) {
  const a = e.angle || 0;
  const fx = Math.cos(a);
  const fy = Math.sin(a);
  const px = -fy;
  const py = fx;
  for (const s of [-1, 1]) {
    const cx = fx * r * 0.35 + px * r * ex * s;
    const cy = fy * r * 0.35 + py * r * ex * s;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx, cy, r * size, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(cx + fx * r * 0.1, cy + fy * r * 0.1, r * size * 0.5, 0, TAU);
    ctx.fill();
  }
}

function blob(ctx, r, color, sq = 0) {
  const d = r * 2 + 4;
  const sprite = cachedSprite(`blob|${color}|${r.toFixed(2)}`, d, d, (g) => {
    const grad = g.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
    grad.addColorStop(0, shade(color, 0.3));
    grad.addColorStop(1, shade(color, -0.3));
    g.fillStyle = grad;
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.fill();
    g.strokeStyle = shade(color, -0.55);
    g.lineWidth = 1.5;
    g.stroke();
  });
  if (sq) {
    ctx.save();
    ctx.scale(1 + sq, 1 - sq);
    blit(ctx, sprite, d, d);
    ctx.restore();
  } else blit(ctx, sprite, d, d);
}

const ENEMIES = {
  runner(ctx, e, r, d, now) {
    const bob = Math.sin(now / 90 + e.seed) * 0.06;
    blob(ctx, r, d.color, bob);
    eyes(ctx, e, r);
  },
  scout(ctx, e, r, d, now) {
    ctx.rotate(e.angle || 0);
    ctx.strokeStyle = 'rgba(246, 185, 59, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-r * 1.1, -r * 0.4);
    ctx.lineTo(-r * 2.1, -r * 0.4);
    ctx.moveTo(-r * 1.1, r * 0.4);
    ctx.lineTo(-r * 2.4 - Math.sin(now / 60) * 2, r * 0.4);
    ctx.stroke();
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.moveTo(r * 1.4, 0);
    ctx.lineTo(-r * 0.9, -r * 0.95);
    ctx.lineTo(-r * 0.5, 0);
    ctx.lineTo(-r * 0.9, r * 0.95);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = shade(d.color, -0.5);
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(r * 0.35, 0, r * 0.22, 0, TAU);
    ctx.fill();
  },
  tank(ctx, e, r, d) {
    ctx.rotate(e.angle || 0);
    ctx.fillStyle = '#2b2f36';
    rrect(ctx, -r * 1.05, -r * 0.95, r * 2.1, r * 0.45, 3);
    ctx.fill();
    rrect(ctx, -r * 1.05, r * 0.5, r * 2.1, r * 0.45, 3);
    ctx.fill();
    const tw = r * 2 + 4;
    blit(
      ctx,
      cachedSprite(`tank|${d.color}|${r}`, tw, tw, (g) => {
        const grad = g.createLinearGradient(0, -r, 0, r);
        grad.addColorStop(0, shade(d.color, 0.25));
        grad.addColorStop(1, shade(d.color, -0.35));
        g.fillStyle = grad;
        rrect(g, -r * 0.95, -r * 0.62, r * 1.9, r * 1.24, 5);
        g.fill();
        g.strokeStyle = shade(d.color, -0.6);
        g.lineWidth = 1.5;
        g.stroke();
      }),
      tw,
      tw,
    );
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.moveTo(-r * 0.3, -r * 0.6);
    ctx.lineTo(-r * 0.3, r * 0.6);
    ctx.moveTo(r * 0.25, -r * 0.6);
    ctx.lineTo(r * 0.25, r * 0.6);
    ctx.stroke();
    ctx.fillStyle = '#ff6b6b';
    ctx.fillRect(r * 0.62, -r * 0.18, r * 0.25, r * 0.36);
  },
  drone(ctx, e, r, d, now) {
    ctx.rotate((e.angle || 0) + Math.PI / 4);
    ctx.strokeStyle = '#34495e';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-r, -r);
    ctx.lineTo(r, r);
    ctx.moveTo(r, -r);
    ctx.lineTo(-r, r);
    ctx.stroke();
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      ctx.save();
      ctx.translate(sx * r, sy * r);
      ctx.fillStyle = 'rgba(200, 240, 255, 0.25)';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.55, 0, TAU);
      ctx.fill();
      ctx.rotate(now / 25 + sx);
      ctx.strokeStyle = 'rgba(230, 250, 255, 0.9)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-r * 0.5, 0);
      ctx.lineTo(r * 0.5, 0);
      ctx.stroke();
      ctx.restore();
    }
    blob(ctx, r * 0.55, d.color);
    ctx.fillStyle = '#ff4d6d';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.18, 0, TAU);
    ctx.fill();
  },
  splitter(ctx, e, r, d, now) {
    const p = 1 + Math.sin(now / 200 + e.seed) * 0.05;
    ctx.scale(p, p);
    blob(ctx, r, d.color);
    ctx.strokeStyle = shade(d.color, 0.45);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = (i * TAU) / 3 + e.seed;
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
    }
    ctx.stroke();
    eyes(ctx, e, r, 0.3, 0.22);
  },
  regen(ctx, e, r, d, now) {
    const p = 1 + Math.sin(now / 160 + e.seed) * 0.06;
    ctx.scale(p, p);
    blob(ctx, r, d.color);
    ctx.fillStyle = `rgba(220, 255, 230, ${0.65 + 0.3 * Math.sin(now / 200)})`;
    ctx.fillRect(-r * 0.15, -r * 0.55, r * 0.3, r * 1.1);
    ctx.fillRect(-r * 0.55, -r * 0.15, r * 1.1, r * 0.3);
  },
  shield(ctx, e, r, d) {
    blob(ctx, r * 0.9, d.color);
    eyes(ctx, e, r * 0.9, 0.32, 0.24);
  },
  stealth(ctx, e, r, d, now) {
    ctx.rotate(e.angle || 0);
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.moveTo(r * 1.3, 0);
    ctx.quadraticCurveTo(0, -r * 1.1, -r * 1.1, -r * 0.6);
    ctx.lineTo(-r * 0.6, 0);
    ctx.lineTo(-r * 1.1, r * 0.6);
    ctx.quadraticCurveTo(0, r * 1.1, r * 1.3, 0);
    ctx.fill();
    ctx.strokeStyle = '#57606f';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.fillStyle = '#ff4757';
    ctx.fillRect(r * 0.2, -r * 0.35, r * 0.5, r * 0.18);
    ctx.fillRect(r * 0.2, r * 0.17, r * 0.5, r * 0.18);
    if (!(e.f & 128)) {
      ctx.globalAlpha *= 0.6 + 0.3 * Math.sin(now / 90);
      ctx.strokeStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(0, 0, r + 4, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  },
  healer(ctx, e, r, d, now) {
    ctx.save();
    ctx.rotate(now / 700);
    ctx.strokeStyle = 'rgba(85, 239, 196, 0.7)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, r + 5, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    blob(ctx, r, d.color);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-r * 0.14, -r * 0.5, r * 0.28, r);
    ctx.fillRect(-r * 0.5, -r * 0.14, r, r * 0.28);
  },
  kamikaze(ctx, e, r, d, now, f) {
    if (f & 256) drawGlow(ctx, 0, 0, r * 2.4, '#ff6b35', 0.6 + 0.3 * Math.sin(now / 50));
    blob(ctx, r, f & 256 ? '#ff5e3a' : d.color);
    ctx.strokeStyle = '#3d2b1f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.quadraticCurveTo(r * 0.4, -r * 1.5, r * 0.15, -r * 1.75);
    ctx.stroke();
    drawGlow(ctx, r * 0.15, -r * 1.75, 6, '#ffd166', 0.6 + 0.4 * Math.random());
    ctx.fillStyle = '#2d3436';
    ctx.font = `bold ${Math.round(r)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', 0, 1);
    ctx.textBaseline = 'alphabetic';
  },
  jammer(ctx, e, r, d, now) {
    ctx.rotate(e.angle || 0);
    ctx.fillStyle = shade(d.color, -0.2);
    rrect(ctx, -r * 0.95, -r * 0.8, r * 1.9, r * 1.6, 4);
    ctx.fill();
    ctx.strokeStyle = shade(d.color, -0.6);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.save();
    ctx.rotate(now / 300);
    ctx.strokeStyle = '#ffeaa7';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.55, -0.9, 0.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(r * 0.6, 0);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#ffeaa7';
    ctx.beginPath();
    ctx.arc(0, 0, 2.2, 0, TAU);
    ctx.fill();
  },
  shard(ctx, e, r, d, now) {
    ctx.rotate(now / 150 + e.seed);
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.2);
    ctx.lineTo(r, 0);
    ctx.lineTo(0, r * 1.2);
    ctx.lineTo(-r, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = shade(d.color, -0.5);
    ctx.lineWidth = 1.2;
    ctx.stroke();
  },
  mastodon(ctx, e, r, d, now, f) {
    ctx.rotate(e.angle || 0);
    if (f & 32) {
      ctx.strokeStyle = 'rgba(255, 80, 60, 0.6)';
      ctx.lineWidth = 2;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(-r * 1.2, i * r * 0.5);
        ctx.lineTo(-r * 2 - Math.random() * 8, i * r * 0.5);
        ctx.stroke();
      }
    }
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 2, 0, 0, r * 1.2);
    g.addColorStop(0, shade(d.color, 0.3));
    g.addColorStop(1, shade(d.color, -0.4));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.15, r * 0.9, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = shade(d.color, -0.6);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 3;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.arc(-r * 0.2 + i * r * 0.35, 0, r * 0.75, -0.9, 0.9);
      ctx.stroke();
    }
    ctx.fillStyle = '#f3ead8';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(r * 0.85, s * r * 0.35);
      ctx.quadraticCurveTo(r * 1.6, s * r * 0.55, r * 1.55, s * r * 0.05);
      ctx.lineTo(r * 1.0, s * r * 0.15);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(r * 0.75, -r * 0.3, 2.5, 0, TAU);
    ctx.arc(r * 0.75, r * 0.3, 2.5, 0, TAU);
    ctx.fill();
  },
  broodmother(ctx, e, r, d, now) {
    for (let i = 0; i < 6; i++) {
      const a = (i * TAU) / 6 + now / 2000;
      const p = 1 + Math.sin(now / 250 + i) * 0.15;
      ctx.fillStyle = shade('#a3e635', -0.1);
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85, r * 0.32 * p, 0, TAU);
      ctx.fill();
    }
    blob(ctx, r * 0.9, d.color);
    eyes(ctx, e, r * 0.9, 0.3, 0.24);
  },
  colossus(ctx, e, r, d, now, f) {
    const rage = f & 32;
    const walk = Math.sin(now / 260);
    ctx.rotate((e.angle || 0) + Math.PI / 2);
    // poings
    for (const s of [-1, 1]) {
      ctx.fillStyle = shade('#6d5a4b', -0.15);
      ctx.beginPath();
      ctx.arc(s * r * 1.05, -walk * s * r * 0.3, r * 0.42, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#2b211b';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // corps rocheux
    ctx.beginPath();
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = (i * TAU) / n;
      const rr = r * (0.86 + ((i * 37) % 10) / 55);
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 4, 0, 0, r);
    g.addColorStop(0, '#8d7b6a');
    g.addColorStop(1, '#3e322a');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#211913';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // fissures lumineuses
    const glowC = rage ? '#ff3b3b' : '#ff9f43';
    ctx.strokeStyle = glowC;
    ctx.lineWidth = rage ? 3 : 2;
    ctx.globalAlpha *= 0.75 + 0.25 * Math.sin(now / 150);
    ctx.beginPath();
    ctx.moveTo(-r * 0.6, r * 0.2);
    ctx.lineTo(-r * 0.15, r * 0.05);
    ctx.lineTo(0, r * 0.45);
    ctx.lineTo(r * 0.35, r * 0.15);
    ctx.lineTo(r * 0.65, r * 0.4);
    ctx.moveTo(-r * 0.2, -r * 0.55);
    ctx.lineTo(r * 0.1, -r * 0.2);
    ctx.lineTo(r * 0.45, -r * 0.45);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // yeux
    for (const s of [-1, 1]) {
      drawGlow(ctx, s * r * 0.28, -r * 0.62, 10, glowC, 0.9);
      ctx.fillStyle = '#fff3c4';
      ctx.beginPath();
      ctx.arc(s * r * 0.28, -r * 0.62, 3, 0, TAU);
      ctx.fill();
    }
  },
};

// ------------------------------------------------------------------ Base
export function drawBase(ctx, x, y, base, now, o = {}) {
  ctx.save();
  ctx.translate(x, y);
  const hpPct = base.hp / base.max;
  const hurt = now - (o.hitT || -1e9) < 250;
  // aura de bouclier
  if (base.sh > 0) {
    const a = 0.25 + 0.15 * Math.sin(now / 300) + Math.min(0.3, base.sh / 1500);
    ctx.strokeStyle = `rgba(94, 242, 230, ${a + 0.25})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, 66, 0, TAU);
    ctx.stroke();
    drawGlow(ctx, 0, 0, 72, '#5ef2e6', a * 0.6);
  }
  // remparts
  const wall = hurt ? '#a35656' : '#59647f';
  const wallDark = '#323a52';
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 46, 58, 14, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = wallDark;
  rrect(ctx, -54, -40, 108, 86, 10);
  ctx.fill();
  const g = ctx.createLinearGradient(0, -44, 0, 44);
  g.addColorStop(0, shade(wall.startsWith('#') ? wall : '#59647f', 0.15));
  g.addColorStop(1, wall);
  ctx.fillStyle = g;
  rrect(ctx, -50, -44, 100, 84, 9);
  ctx.fill();
  // créneaux
  ctx.fillStyle = shade('#59647f', 0.25);
  for (let i = -2; i <= 2; i++) ctx.fillRect(i * 20 - 6, -52, 12, 10);
  // donjon
  ctx.fillStyle = '#3d4763';
  rrect(ctx, -24, -30, 48, 52, 6);
  ctx.fill();
  ctx.fillStyle = '#ffd166';
  ctx.globalAlpha = 0.65 + 0.35 * Math.sin(now / 500);
  ctx.fillRect(-12, -16, 7, 10);
  ctx.fillRect(5, -16, 7, 10);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#2a2f40';
  rrect(ctx, -9, 4, 18, 18, 8);
  ctx.fill();
  // drapeau
  ctx.strokeStyle = '#ddd';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -30);
  ctx.lineTo(0, -64);
  ctx.stroke();
  ctx.fillStyle = '#4da3ff';
  ctx.beginPath();
  const wave = Math.sin(now / 200) * 3;
  ctx.moveTo(0, -64);
  ctx.quadraticCurveTo(12, -62 + wave, 24, -60);
  ctx.lineTo(0, -50);
  ctx.closePath();
  ctx.fill();
  // canon défensif
  if (base.cn > 0) {
    ctx.save();
    ctx.translate(0, -10);
    ctx.rotate(o.cannonAngle ?? -Math.PI / 2);
    ctx.fillStyle = '#20263a';
    ctx.fillRect(0, -3 - base.cn, 20 + base.cn * 3, 6 + base.cn * 2);
    ctx.restore();
    ctx.fillStyle = '#7c8bb0';
    ctx.beginPath();
    ctx.arc(0, -10, 8 + base.cn, 0, TAU);
    ctx.fill();
  }
  // blindage
  if (base.ar > 0) {
    ctx.strokeStyle = '#c0c8dd';
    ctx.lineWidth = 1 + base.ar;
    rrect(ctx, -50, -44, 100, 84, 9);
    ctx.stroke();
  }
  // fissures si endommagée
  if (hpPct < 0.6) {
    ctx.strokeStyle = 'rgba(20, 20, 30, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-40, -20);
    ctx.lineTo(-30, -8);
    ctx.lineTo(-36, 6);
    if (hpPct < 0.3) {
      ctx.moveTo(38, -30);
      ctx.lineTo(28, -16);
      ctx.lineTo(34, 0);
      ctx.lineTo(26, 14);
    }
    ctx.stroke();
  }
  ctx.restore();
}

export function drawPortal(ctx, x, y, color, now, r = 22) {
  ctx.save();
  ctx.translate(x, y);
  drawGlow(ctx, 0, 0, r * 2.2, color, 0.55);
  for (let i = 0; i < 3; i++) {
    ctx.rotate(now / (700 - i * 150) + i);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.5 + i * 0.15;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r - i * 6, 0, Math.PI * 1.3);
    ctx.stroke();
  }
  ctx.restore();
}

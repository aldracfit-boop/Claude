// Outils mathématiques et géométriques partagés.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

export function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

// Générateur pseudo-aléatoire déterministe (mulberry32).
export class RNG {
  constructor(seed = 1) {
    this.s = seed >>> 0 || 1;
  }
  next() {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) {
    return a + (b - a) * this.next();
  }
  int(a, b) {
    return Math.floor(this.range(a, b + 1));
  }
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
  chance(p) {
    return this.next() < p;
  }
}

// Construit un chemin à partir d'une liste de points en pixels.
export function buildPath(points) {
  const segs = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len === 0) continue;
    segs.push({ x1, y1, x2, y2, len, start: total, dx: (x2 - x1) / len, dy: (y2 - y1) / len });
    total += len;
  }
  return { points, segs, length: total };
}

// Position sur un chemin à une distance donnée. `hint` = index de segment de départ
// (les ennemis avancent toujours, ce qui rend la recherche quasi O(1)).
export function pointOnPath(path, d, out, hint = 0) {
  const segs = path.segs;
  let i = Math.min(Math.max(hint, 0), segs.length - 1);
  if (d <= 0) {
    const s = segs[0];
    out.x = s.x1 + s.dx * d;
    out.y = s.y1 + s.dy * d;
    out.dx = s.dx;
    out.dy = s.dy;
    return 0;
  }
  while (i < segs.length - 1 && d > segs[i].start + segs[i].len) i++;
  while (i > 0 && d < segs[i].start) i--;
  const s = segs[i];
  const t = Math.min(d - s.start, s.len);
  out.x = s.x1 + s.dx * t;
  out.y = s.y1 + s.dy * t;
  out.dx = s.dx;
  out.dy = s.dy;
  return i;
}

// Distance (au carré) d'un point à un segment.
export function distToSegment2(px, py, x1, y1, x2, y2) {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const l2 = vx * vx + vy * vy;
  let t = l2 > 0 ? ((px - x1) * vx + (py - y1) * vy) / l2 : 0;
  t = clamp(t, 0, 1);
  return dist2(px, py, x1 + vx * t, y1 + vy * t);
}

export function formatNumber(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'k';
  return String(Math.round(n));
}

export function sanitizeName(name, fallback = 'Joueur') {
  const s = String(name ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, 16);
  return s || fallback;
}

export function sanitizeText(text, max = 120) {
  return String(text ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, max);
}

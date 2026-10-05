// Effets visuels : particules, traçantes, projectiles, explosions, textes flottants,
// pings, animations de fusion, secousses d'écran. Tout est purement visuel.

import { RARITIES, PLAYER_COLORS } from '../../../shared/constants.js';
import { drawGlow } from './sprites.js';

const TAU = Math.PI * 2;
const MAX_PARTICLES = 1400;
const MAX_TEXTS = 70;

export class Effects {
  constructor() {
    this.particles = [];
    this.tracers = [];
    this.shells = [];
    this.mortars = [];
    this.rings = [];
    this.texts = [];
    this.pings = [];
    this.strikes = [];
    this.fusions = [];
    this.flashes = [];
    this.shake = 0;
    this.shakeEnabled = true;
    this.showDamage = true;
  }

  // ------------------------------------------------------------ Émetteurs
  particle(p) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push(p);
  }

  burst(x, y, color, n = 10, speed = 90, life = 0.5, size = 2.5, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const s = speed * (0.3 + Math.random() * 0.9);
      this.particle({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: life * (0.6 + Math.random() * 0.6),
        max: life,
        size: size * (0.6 + Math.random() * 0.8),
        color,
        drag: opts.drag ?? 2.5,
        grav: opts.grav ?? 0,
        glow: opts.glow,
        shape: opts.shape,
      });
    }
  }

  smoke(x, y, n = 4, color = 'rgba(90,90,100,0.5)') {
    for (let i = 0; i < n; i++) {
      this.particle({
        x: x + (Math.random() - 0.5) * 10,
        y: y + (Math.random() - 0.5) * 10,
        vx: (Math.random() - 0.5) * 20,
        vy: -10 - Math.random() * 20,
        life: 0.9,
        max: 0.9,
        size: 6 + Math.random() * 6,
        color,
        drag: 1,
        grow: 10,
        shape: 'smoke',
      });
    }
  }

  ring(x, y, r0, r1, life, color, width = 3) {
    this.rings.push({ x, y, r0, r1, t: 0, life, color, width });
  }

  tracer(x1, y1, x2, y2, color, width = 1.5, life = 0.08) {
    if (this.tracers.length > 400) this.tracers.shift();
    this.tracers.push({ x1, y1, x2, y2, color, width, t: 0, life });
  }

  text(x, y, str, color = '#fff', size = 13, opts = {}) {
    if (this.texts.length >= MAX_TEXTS) {
      if (!opts.important) return;
      this.texts.shift();
    }
    this.texts.push({
      x,
      y,
      str,
      color,
      size,
      t: 0,
      life: opts.life || 0.9,
      vy: opts.vy ?? -38,
      bold: opts.bold,
      stroke: opts.stroke ?? true,
    });
  }

  flash(color, alpha = 0.35, life = 0.35) {
    this.flashes.push({ color, alpha, t: 0, life });
  }

  addShake(v) {
    if (this.shakeEnabled) this.shake = Math.min(14, this.shake + v);
  }

  shell(x1, y1, x2, y2, targetId, speed, mega, level) {
    if (this.shells.length > 300) return;
    this.shells.push({ x: x1, y: y1, tx: x2, ty: y2, targetId, speed: speed || 480, mega, level, trail: [] });
  }

  mortar(x1, y1, x2, y2, dur, level) {
    if (this.mortars.length > 200) return;
    this.mortars.push({ x0: x1, y0: y1, x1: x2, y1: y2, t: 0, dur: dur || 0.9, level });
  }

  explosion(x, y, r, kind) {
    const big = kind === 'mega' || kind === 'strike';
    const color = kind === 'strike' ? '#ffb347' : kind === 'frag' ? '#ffd166' : '#ff8c42';
    this.ring(x, y, r * 0.2, r, 0.35, 'rgba(255, 190, 120, 0.9)', big ? 5 : 3);
    this.burst(x, y, color, big ? 26 : kind === 'shell' ? 5 : 12, r * 2.4, 0.45, big ? 4 : 3, { glow: true });
    if (kind !== 'shell' && kind !== 'frag') this.smoke(x, y, big ? 6 : 3);
    this.flashes.push({ x, y, r: r * 1.4, t: 0, life: 0.18, local: true, color: '#ffcf8a' });
    if (big) this.addShake(4);
  }

  ping(x, y, pid, kind) {
    this.pings.push({ x, y, color: PLAYER_COLORS[pid] || '#fff', t: 0, life: 3, kind });
  }

  strike(x, y, r, delay) {
    this.strikes.push({ x, y, r, t: 0, delay });
  }

  fusion(ev) {
    const rare = ev.promo || ev.r >= 3;
    this.fusions.push({ ...ev, t: 0, life: rare ? 2.1 : 1.6, rare });
  }

  // Une tourelle est-elle en cours d'apparition après une fusion ? (échelle 0..1)
  fusionScale(towerId) {
    for (const f of this.fusions) {
      if (f.id === towerId) {
        const k = f.t / 0.55;
        if (k < 1) return 0.15;
        return Math.min(1, 0.15 + (f.t - 0.55) * 4);
      }
    }
    return 1;
  }

  // ------------------------------------------------------------ Mise à jour
  update(dt, enemies) {
    for (const p of this.particles) {
      p.life -= dt;
      p.vx -= p.vx * p.drag * dt;
      p.vy -= p.vy * p.drag * dt;
      p.vy += (p.grav || 0) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.grow) p.size += p.grow * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const t of this.tracers) t.t += dt;
    this.tracers = this.tracers.filter((t) => t.t < t.life);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.life);
    for (const t of this.texts) {
      t.t += dt;
      t.y += t.vy * dt;
      t.vy *= 1 - 1.5 * dt;
    }
    this.texts = this.texts.filter((t) => t.t < t.life);
    for (const p of this.pings) p.t += dt;
    this.pings = this.pings.filter((p) => p.t < p.life);
    for (const s of this.strikes) s.t += dt;
    this.strikes = this.strikes.filter((s) => s.t < s.delay + 0.1);
    for (const f of this.flashes) f.t += dt;
    this.flashes = this.flashes.filter((f) => f.t < f.life);
    for (const f of this.fusions) {
      const before = f.t;
      f.t += dt;
      if (before < 0.55 && f.t >= 0.55) this.fusionBurst(f);
    }
    this.fusions = this.fusions.filter((f) => f.t < f.life);

    // obus de canon : guidés vers l'ennemi visé (position interpolée)
    for (const s of this.shells) {
      const e = enemies.get(s.targetId);
      if (e) {
        s.tx = e.rx;
        s.ty = e.ry;
      }
      const dx = s.tx - s.x;
      const dy = s.ty - s.y;
      const d = Math.hypot(dx, dy);
      const step = s.speed * dt;
      s.trail.push(s.x, s.y);
      if (s.trail.length > 8) s.trail.splice(0, 2);
      if (d <= step + 3) {
        s.done = true;
        this.burst(s.tx, s.ty, '#ffe08a', s.mega ? 14 : 4, s.mega ? 160 : 70, 0.25, 2);
      } else {
        s.x += (dx / d) * step;
        s.y += (dy / d) * step;
      }
    }
    this.shells = this.shells.filter((s) => !s.done);
    for (const m of this.mortars) m.t += dt;
    this.mortars = this.mortars.filter((m) => m.t < m.dur);
    this.shake = Math.max(0, this.shake - dt * 30);
  }

  fusionBurst(f) {
    const R = RARITIES[f.r] || RARITIES[0];
    this.ring(f.x, f.y, 4, f.rare ? 110 : 70, 0.6, R.color, f.rare ? 6 : 4);
    this.ring(f.x, f.y, 4, f.rare ? 70 : 45, 0.45, '#ffffff', 2);
    this.burst(f.x, f.y, R.color, f.rare ? 50 : 28, f.rare ? 260 : 170, 0.8, 3.5, { glow: true });
    this.burst(f.x, f.y, '#ffffff', 16, 120, 0.5, 2, { glow: true });
    this.flashes.push({ x: f.x, y: f.y, r: f.rare ? 160 : 100, t: 0, life: 0.35, local: true, color: R.color });
    this.addShake(f.rare ? 7 : 3);
    this.text(f.x, f.y - 30, `NIVEAU ${f.l} !`, R.color, f.rare ? 22 : 18, { important: true, life: 1.5, bold: true, vy: -26 });
    if (f.promo)
      this.text(f.x, f.y - 54, `RARETÉ ${R.name.toUpperCase()} !`, R.color, 15, { important: true, life: 1.7, bold: true, vy: -18 });
    if (f.coop) this.text(f.x, f.y + 26, 'FUSION D’ÉQUIPE', '#c792ea', 13, { important: true, life: 1.5, bold: true, vy: 10 });
  }

  // ------------------------------------------------------------ Dessin
  drawWorld(ctx, now) {
    // pings au sol
    for (const p of this.pings) {
      const k = p.t / p.life;
      ctx.strokeStyle = p.color;
      for (let i = 0; i < 2; i++) {
        const ph = (p.t * 1.4 + i * 0.5) % 1;
        ctx.globalAlpha = (1 - ph) * (1 - k * 0.6);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8 + ph * 34, 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 1 - k * 0.5;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - 7, p.y - 16);
      ctx.lineTo(p.x + 7, p.y - 16);
      ctx.closePath();
      ctx.fill();
      ctx.font = 'bold 13px Inter, sans-serif';
      ctx.textAlign = 'center';
      const icon = p.kind === 'danger' ? '⚠' : p.kind === 'build' ? '🔨' : p.kind === 'fuse' ? '⚡' : '!';
      ctx.fillStyle = '#fff';
      ctx.fillText(icon, p.x, p.y - 20);
      ctx.globalAlpha = 1;
    }
    // réticules de frappe aérienne
    for (const s of this.strikes) {
      const k = Math.min(1, s.t / s.delay);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(now / 400);
      ctx.strokeStyle = `rgba(255, 90, 70, ${0.5 + 0.5 * k})`;
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, s.r * (1.15 - k * 0.15), 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      // missiles qui tombent
      ctx.strokeStyle = 'rgba(255, 220, 160, 0.9)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const a = (i * TAU) / 4 + 0.6;
        const ox = Math.cos(a) * s.r * 0.45;
        const oy = Math.sin(a) * s.r * 0.45;
        const h = (1 - k) * 260;
        ctx.beginPath();
        ctx.moveTo(s.x + ox + h * 0.3, s.y + oy - h);
        ctx.lineTo(s.x + ox + h * 0.3 + 6, s.y + oy - h - 18);
        ctx.stroke();
      }
    }
    // ombres + obus de mortier (trajectoire en cloche)
    for (const m of this.mortars) {
      const k = m.t / m.dur;
      const x = m.x0 + (m.x1 - m.x0) * k;
      const y = m.y0 + (m.y1 - m.y0) * k;
      const hgt = Math.sin(k * Math.PI) * (60 + Math.hypot(m.x1 - m.x0, m.y1 - m.y0) * 0.25);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(x, y, 4, 2, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#2b1d14';
      ctx.beginPath();
      ctx.arc(x, y - hgt, 4 + (m.level || 1) * 0.4, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#ffb36b';
      ctx.lineWidth = 1;
      ctx.stroke();
      if (k > 0.6) {
        ctx.strokeStyle = `rgba(255, 80, 60, ${(k - 0.6) * 1.6})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(m.x1, m.y1, 10 * (1.4 - k), 0, TAU);
        ctx.stroke();
      }
    }
    // obus de canon
    for (const s of this.shells) {
      ctx.strokeStyle = s.mega ? 'rgba(255, 170, 80, 0.6)' : 'rgba(255, 230, 160, 0.45)';
      ctx.lineWidth = s.mega ? 4 : 2;
      ctx.beginPath();
      for (let i = 0; i < s.trail.length; i += 2) {
        if (i === 0) ctx.moveTo(s.trail[i], s.trail[i + 1]);
        else ctx.lineTo(s.trail[i], s.trail[i + 1]);
      }
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
      ctx.fillStyle = s.mega ? '#ff9f43' : '#ffe8a3';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.mega ? 6 : 3 + (s.level || 1) * 0.3, 0, TAU);
      ctx.fill();
    }
    // traçantes
    ctx.lineCap = 'round';
    for (const t of this.tracers) {
      const a = 1 - t.t / t.life;
      ctx.globalAlpha = a;
      ctx.strokeStyle = t.color;
      ctx.lineWidth = t.width;
      ctx.beginPath();
      ctx.moveTo(t.x1, t.y1);
      ctx.lineTo(t.x2, t.y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // anneaux
    for (const r of this.rings) {
      const k = r.t / r.life;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (1 - k * 0.5);
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * easeOut(k), 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // éclairs locaux
    for (const f of this.flashes) {
      if (!f.local) continue;
      drawGlow(ctx, f.x, f.y, f.r, f.color, 0.8 * (1 - f.t / f.life));
    }
    // particules
    for (const p of this.particles) {
      const a = Math.max(0, p.life / p.max);
      if (p.shape === 'smoke') {
        ctx.globalAlpha = a * 0.5;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.fill();
      } else if (p.glow) {
        drawGlow(ctx, p.x, p.y, p.size * 3, p.color, a);
      } else {
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
    // animations de fusion (avant l'explosion lumineuse)
    for (const f of this.fusions) this.drawFusion(ctx, f, now);
  }

  drawFusion(ctx, f, now) {
    const R = RARITIES[f.r] || RARITIES[0];
    if (f.t < 0.55) {
      const k = easeIn(f.t / 0.55);
      for (const [sx, sy] of f.from || []) {
        const x = sx + (f.x - sx) * k;
        const y = sy + (f.y - sy) * k;
        ctx.strokeStyle = R.color;
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(sx + (f.x - sx) * Math.max(0, k - 0.25), sy + (f.y - sy) * Math.max(0, k - 0.25));
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.globalAlpha = 1;
        drawGlow(ctx, x, y, 22, R.color, 0.9);
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, TAU);
        ctx.fill();
      }
      drawGlow(ctx, f.x, f.y, 20 + k * 40, R.color, 0.4 + k * 0.6);
      ctx.strokeStyle = R.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(f.x, f.y, 40 - k * 28, 0, TAU);
      ctx.stroke();
    } else if (f.rare) {
      // faisceaux pour les raretés élevées
      const k = (f.t - 0.55) / (f.life - 0.55);
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(now / 600);
      ctx.globalAlpha = 0.35 * (1 - k);
      ctx.fillStyle = R.color;
      for (let i = 0; i < 8; i++) {
        ctx.rotate(TAU / 8);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(140, -8);
        ctx.lineTo(140, 8);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  drawTexts(ctx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const a = Math.min(1, (1 - t.t / t.life) * 2);
      const pop = t.t < 0.1 ? 0.7 + t.t * 3 : 1;
      ctx.globalAlpha = a;
      ctx.font = `${t.bold ? 800 : 700} ${Math.round(t.size * pop)}px Rajdhani, Inter, sans-serif`;
      if (t.stroke) {
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.strokeText(t.str, t.x, t.y);
      }
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'alphabetic';
  }

  drawScreen(ctx, w, h) {
    for (const f of this.flashes) {
      if (f.local) continue;
      ctx.globalAlpha = f.alpha * (1 - f.t / f.life);
      ctx.fillStyle = f.color;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.globalAlpha = 1;
  }

  shakeOffset() {
    if (this.shake <= 0) return [0, 0];
    return [(Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake];
  }
}

function easeOut(k) {
  return 1 - (1 - k) * (1 - k);
}

function easeIn(k) {
  return k * k;
}

// Moteur audio entièrement synthétisé (WebAudio) : effets sonores + musique adaptative.
// Aucune ressource externe : tout est généré à la volée.

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI -> Hz

// Progressions d'accords (notes MIDI de la fondamentale) par intensité.
const MOODS = {
  menu: { bpm: 84, chords: [57, 53, 60, 55], minor: [true, false, false, false], layers: ['pad', 'arp'] },
  prep: { bpm: 92, chords: [57, 53, 60, 55], minor: [true, false, false, false], layers: ['pad', 'arp', 'bassSoft', 'hat'] },
  wave: { bpm: 112, chords: [57, 55, 53, 52], minor: [true, false, false, false], layers: ['pad', 'arp', 'bass', 'kick', 'hat', 'snare'] },
  boss: {
    bpm: 128,
    chords: [57, 58, 57, 52],
    minor: [true, false, true, false],
    layers: ['padDark', 'arpFast', 'bassDist', 'kick', 'hat', 'snare', 'tom'],
  },
};

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.musicVol = 0.45;
    this.sfxVol = 0.7;
    this.last = new Map();
    this.voices = 0;
    this.mood = 'off';
    this.pendingMood = 'off';
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      return;
    }
    const c = this.ctx;
    this.master = c.createDynamicsCompressor();
    this.master.threshold.value = -14;
    this.master.ratio.value = 4;
    this.master.connect(c.destination);
    this.sfx = c.createGain();
    this.sfx.gain.value = this.sfxVol;
    this.sfx.connect(this.master);
    this.music = c.createGain();
    this.music.gain.value = this.musicVol * 0.5;
    this.music.connect(this.master);
    // tampon de bruit blanc réutilisable
    const len = c.sampleRate * 1.5;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  setVolumes(music, sfx) {
    this.musicVol = music;
    this.sfxVol = sfx;
    if (!this.ctx) return;
    this.sfx.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.05);
    this.music.gain.setTargetAtTime(music * 0.5, this.ctx.currentTime, 0.1);
  }

  setMood(m) {
    this.pendingMood = m;
    if (this.mood === 'off' && m !== 'off' && this.ctx) {
      this.mood = m;
      this.step = 0;
      this.nextTime = this.ctx.currentTime + 0.1;
    }
  }

  // ------------------------------------------------------------ Primitives
  osc(type, freq, t, dur, vol, { to, curve = 'exp', dest, attack = 0.005, detune = 0 } = {}) {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.detune.value = detune;
    if (to) {
      if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
      else o.frequency.linearRampToValueAtTime(to, t + dur);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest || this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  noiseBurst(t, dur, vol, { type = 'lowpass', freq = 1200, to, q = 0.8, dest, attack = 0.003 } = {}) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(dest || this.sfx);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  // ------------------------------------------------------------ Effets
  play(name, opts = {}) {
    if (!this.ctx || this.sfxVol <= 0) return;
    const now = this.ctx.currentTime;
    const minGap = THROTTLE[name] ?? 0.03;
    const last = this.last.get(name) || 0;
    if (now - last < minGap) return;
    this.last.set(name, now);
    const fn = SFX[name];
    if (fn) fn(this, now, opts);
  }

  // ------------------------------------------------------------ Musique
  schedule() {
    if (!this.ctx || this.mood === 'off') {
      if (this.pendingMood !== 'off' && this.ctx) this.setMood(this.pendingMood);
      return;
    }
    const ahead = this.ctx.currentTime + 0.15;
    while (this.nextTime < ahead) {
      if (this.step % 16 === 0 && this.pendingMood !== this.mood) {
        this.mood = this.pendingMood;
        if (this.mood === 'off') return;
      }
      this.playStep(this.step, this.nextTime);
      const mood = MOODS[this.mood];
      this.nextTime += 60 / mood.bpm / 4;
      this.step = (this.step + 1) % 64;
    }
  }

  playStep(step, t) {
    const mood = MOODS[this.mood];
    if (!mood || this.musicVol <= 0) return;
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const root = mood.chords[bar];
    const minor = mood.minor[bar];
    const third = root + (minor ? 3 : 4);
    const fifth = root + 7;
    const L = mood.layers;
    const beat = 60 / mood.bpm;
    const M = this.music;
    if (s === 0 && (L.includes('pad') || L.includes('padDark'))) {
      const dark = L.includes('padDark');
      for (const n of [root, third, fifth]) {
        this.osc(dark ? 'sawtooth' : 'triangle', NOTE(n - 12 + (dark ? 0 : 12)), t, beat * 4, dark ? 0.035 : 0.05, {
          dest: M,
          attack: 0.4,
          detune: (n % 3) * 4,
        });
      }
    }
    if (L.includes('arp') && s % 2 === 0) {
      const seq = [root, third, fifth, third + 12, fifth, third, root + 12, fifth];
      this.osc('square', NOTE(seq[(s / 2) % 8] + 12), t, beat * 0.4, 0.018, { dest: M });
    }
    if (L.includes('arpFast')) {
      const seq = [root, third, fifth, root + 12];
      this.osc('square', NOTE(seq[s % 4] + 12), t, beat * 0.22, 0.016, { dest: M });
    }
    if (L.includes('bassSoft') && (s === 0 || s === 8)) {
      this.osc('triangle', NOTE(root - 24), t, beat * 1.6, 0.09, { dest: M });
    }
    if (L.includes('bass') && s % 2 === 0) {
      const n = s % 8 === 6 ? fifth - 24 : root - 24;
      this.osc('sawtooth', NOTE(n), t, beat * 0.45, 0.05, { dest: M });
      this.osc('sine', NOTE(n), t, beat * 0.45, 0.08, { dest: M });
    }
    if (L.includes('bassDist') && s % 2 === 0) {
      const n = s % 4 === 2 ? root - 24 + 12 : root - 24;
      this.osc('sawtooth', NOTE(n), t, beat * 0.4, 0.07, { dest: M, detune: 12 });
      this.osc('square', NOTE(n), t, beat * 0.4, 0.04, { dest: M, detune: -12 });
    }
    if (L.includes('kick') && s % 4 === 0) {
      this.osc('sine', 150, t, 0.3, 0.32, { to: 40, dest: M });
    }
    if (L.includes('snare') && (s === 4 || s === 12)) {
      this.noiseBurst(t, 0.16, 0.12, { type: 'highpass', freq: 1800, dest: M });
      this.osc('triangle', 220, t, 0.1, 0.06, { to: 120, dest: M });
    }
    if (L.includes('hat') && s % 2 === 1) {
      this.noiseBurst(t, 0.04, this.mood === 'prep' ? 0.02 : 0.035, { type: 'highpass', freq: 7000, dest: M });
    }
    if (L.includes('tom') && (s === 14 || s === 15) && bar === 3) {
      this.osc('sine', s === 14 ? 180 : 130, t, 0.25, 0.2, { to: 70, dest: M });
    }
  }
}

const THROTTLE = {
  bullet: 0.045,
  shell: 0.05,
  snipe: 0.06,
  mortar: 0.08,
  boom: 0.06,
  die: 0.035,
  coin: 0.06,
  leak: 0.15,
  combo: 0.12,
  hit: 0.05,
  err: 0.25,
  ping: 0.2,
  chat: 0.15,
  stomp: 0.3,
};

const SFX = {
  click: (a, t) => a.osc('triangle', 900, t, 0.05, 0.05, { to: 600 }),
  select: (a, t) => a.osc('sine', 700, t, 0.06, 0.05, { to: 900 }),
  err: (a, t) => {
    a.osc('square', 180, t, 0.09, 0.05);
    a.osc('square', 140, t + 0.1, 0.12, 0.05);
  },
  place: (a, t) => {
    a.osc('triangle', 300, t, 0.12, 0.12, { to: 180 });
    a.noiseBurst(t, 0.06, 0.08, { type: 'bandpass', freq: 2500 });
    a.osc('sine', 880, t + 0.04, 0.1, 0.04);
  },
  sell: (a, t) => {
    a.osc('sine', 1046, t, 0.08, 0.06);
    a.osc('sine', 784, t + 0.07, 0.1, 0.06);
  },
  upgrade: (a, t) => {
    [523, 659, 784].forEach((f, i) => a.osc('triangle', f, t + i * 0.06, 0.14, 0.08));
  },
  branch: (a, t) => {
    [392, 523, 659, 1046].forEach((f, i) => a.osc('sawtooth', f, t + i * 0.07, 0.2, 0.05));
  },
  shell: (a, t) => {
    a.osc('sine', 170, t, 0.13, 0.12, { to: 60 });
    a.noiseBurst(t, 0.05, 0.05, { freq: 1500 });
  },
  bullet: (a, t) => a.noiseBurst(t, 0.035, 0.05, { type: 'bandpass', freq: 3200, q: 2 }),
  snipe: (a, t) => {
    a.noiseBurst(t, 0.18, 0.14, { type: 'highpass', freq: 2500, to: 600 });
    a.osc('sawtooth', 1200, t, 0.2, 0.05, { to: 150 });
  },
  mortar: (a, t) => a.osc('sine', 110, t, 0.28, 0.16, { to: 45 }),
  base: (a, t) => {
    a.osc('square', 260, t, 0.12, 0.05, { to: 90 });
    a.noiseBurst(t, 0.08, 0.06, { freq: 2000 });
  },
  boom: (a, t, o) => {
    const big = o.big ? 1.6 : 1;
    a.noiseBurst(t, 0.35 * big, 0.16 * big, { freq: 900, to: 80 });
    a.osc('sine', 90, t, 0.3 * big, 0.14 * big, { to: 35 });
  },
  die: (a, t) => a.osc('sine', 380, t, 0.07, 0.04, { to: 760 }),
  coin: (a, t) => {
    a.osc('sine', 1568, t, 0.06, 0.03);
    a.osc('sine', 2093, t + 0.05, 0.08, 0.03);
  },
  leak: (a, t) => {
    a.osc('square', 110, t, 0.22, 0.09);
    a.osc('square', 104, t, 0.22, 0.06);
  },
  combo: (a, t, o) => {
    a.osc('sine', 1318, t, 0.15, 0.06);
    a.osc('sine', o.coop ? 1975 : 1760, t + 0.04, 0.2, 0.05);
  },
  hit: (a, t) => a.osc('triangle', 600, t, 0.06, 0.04, { to: 300 }),
  fusion: (a, t, o) => {
    const rare = o.rare;
    a.osc('sawtooth', 200, t, 0.55, 0.05, { to: 1200 });
    a.noiseBurst(t, 0.55, 0.05, { type: 'bandpass', freq: 600, to: 5000, q: 3, attack: 0.4 });
    const chord = rare ? [523, 659, 784, 1046, 1318] : [523, 659, 784, 1046];
    chord.forEach((f, i) => a.osc('triangle', f, t + 0.55 + i * 0.05, 0.6, 0.06));
    a.noiseBurst(t + 0.55, 0.35, 0.12, { freq: 4000, to: 300 });
    if (rare) [1568, 2093, 2637].forEach((f, i) => a.osc('sine', f, t + 0.8 + i * 0.08, 0.5, 0.03));
  },
  waveStart: (a, t) => {
    a.osc('sawtooth', 220, t, 0.7, 0.07, { attack: 0.15 });
    a.osc('sawtooth', 330, t + 0.05, 0.7, 0.05, { attack: 0.15 });
    a.osc('sawtooth', 440, t + 0.35, 0.6, 0.05, { attack: 0.1 });
  },
  waveEnd: (a, t) => {
    [523, 659, 784, 1046].forEach((f, i) => a.osc('triangle', f, t + i * 0.09, 0.5, 0.07));
  },
  boss: (a, t) => {
    a.osc('sawtooth', 70, t, 1.4, 0.16, { to: 45, attack: 0.2 });
    a.osc('sawtooth', 73, t, 1.4, 0.12, { to: 47, attack: 0.2 });
    a.noiseBurst(t, 1.2, 0.12, { freq: 400, to: 120, attack: 0.3 });
  },
  phase: (a, t) => {
    a.osc('sawtooth', 90, t, 0.9, 0.14, { to: 55, attack: 0.1 });
    a.noiseBurst(t, 0.8, 0.1, { freq: 700, to: 100, attack: 0.1 });
  },
  stomp: (a, t) => {
    a.osc('sine', 70, t, 0.5, 0.3, { to: 28 });
    a.noiseBurst(t, 0.45, 0.16, { freq: 500, to: 60 });
  },
  freeze: (a, t) => {
    [1760, 2217, 2637, 3520].forEach((f, i) => a.osc('sine', f, t + i * 0.05, 0.6, 0.03));
    a.noiseBurst(t, 0.7, 0.06, { type: 'highpass', freq: 3000, to: 9000 });
  },
  overcharge: (a, t) => {
    a.osc('sawtooth', 160, t, 0.6, 0.06, { to: 900 });
    a.osc('square', 320, t + 0.1, 0.5, 0.03, { to: 1800 });
  },
  strike: (a, t) => a.osc('sine', 1400, t, 0.95, 0.04, { to: 300, attack: 0.2 }),
  ping: (a, t) => {
    a.osc('sine', 988, t, 0.3, 0.07);
    a.osc('sine', 1480, t + 0.08, 0.35, 0.05);
  },
  chat: (a, t) => a.osc('sine', 660, t, 0.08, 0.04, { to: 880 }),
  fuseReq: (a, t) => {
    [784, 988, 784, 988].forEach((f, i) => a.osc('triangle', f, t + i * 0.1, 0.12, 0.06));
  },
  core: (a, t) => [880, 1318, 1760].forEach((f, i) => a.osc('sine', f, t + i * 0.07, 0.3, 0.05)),
  victory: (a, t) => {
    const seq = [523, 659, 784, 1046, 784, 1046, 1318];
    seq.forEach((f, i) => a.osc('triangle', f, t + i * 0.13, 0.4, 0.09));
    [523, 659, 784, 1046].forEach((f) => a.osc('sawtooth', f, t + 1, 1.4, 0.03, { attack: 0.1 }));
  },
  defeat: (a, t) => {
    [440, 415, 392, 349, 330].forEach((f, i) => a.osc('sawtooth', f, t + i * 0.22, 0.4, 0.06));
    a.osc('sine', 110, t + 1.1, 1.4, 0.12, { to: 55 });
  },
};

export const audio = new AudioEngine();

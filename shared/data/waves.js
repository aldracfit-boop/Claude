// Définition des vagues.
// Un groupe : { t: type d'ennemi, n: nombre, i: intervalle (s), d: délai depuis le début (s) }.
// Les vagues 1 à 20 sont écrites à la main (campagne) ; au-delà, elles sont générées
// de manière déterministe (mode Infini).

import { RNG } from '../util.js';

const g = (t, n, i, d = 0) => ({ t, n, i, d });

export const CAMPAIGN = [
  /* 1 */ { groups: [g('runner', 8, 1.3)] },
  /* 2 */ { groups: [g('runner', 12, 1.1)] },
  /* 3 */ { groups: [g('runner', 8, 1.2), g('scout', 8, 0.8, 6)] },
  /* 4 */ { groups: [g('runner', 12, 1.0), g('tank', 2, 4, 8)], intro: 'tank' },
  /* 5 */ { mini: true, name: 'Le Mastodonte', groups: [g('runner', 10, 1.0), g('scout', 6, 0.7, 6), g('mastodon', 1, 1, 10)] },
  /* 6 */ { groups: [g('drone', 8, 1.5), g('runner', 12, 1.0, 3)], intro: 'drone' },
  /* 7 */ { groups: [g('splitter', 6, 2.2), g('scout', 14, 0.6, 5)], intro: 'splitter' },
  /* 8 */ { groups: [g('tank', 5, 3), g('runner', 14, 0.9, 2), g('drone', 6, 1.4, 8)] },
  /* 9 */ { name: 'Invasion', groups: [g('scout', 36, 0.35), g('splitter', 6, 2, 8)] },
  /* 10 */ {
    boss: true,
    name: 'Le Colosse',
    bossPhases: 2,
    groups: [g('runner', 10, 1.5), g('colossus', 1, 1, 4), g('drone', 6, 1.5, 14)],
  },
  /* 11 */ { groups: [g('runner', 20, 0.8), g('drone', 10, 1.2, 4)] },
  /* 12 */ { groups: [g('tank', 9, 2.4), g('scout', 12, 0.6, 6)] },
  /* 13 */ { groups: [g('splitter', 12, 1.4), g('drone', 12, 1.1, 3)] },
  /* 14 */ { groups: [g('runner', 26, 0.6), g('tank', 7, 3, 4), g('scout', 18, 0.5, 10)] },
  /* 15 */ { mini: true, name: 'La Nuée-mère', groups: [g('drone', 10, 1.2), g('tank', 4, 3, 3), g('broodmother', 1, 1, 8)] },
  /* 16 */ { groups: [g('drone', 20, 0.8), g('splitter', 10, 1.6, 4)] },
  /* 17 */ { groups: [g('tank', 13, 2), g('scout', 28, 0.4, 6)] },
  /* 18 */ { groups: [g('runner', 24, 0.6), g('tank', 9, 2.5, 3), g('drone', 14, 1, 6), g('splitter', 9, 1.8, 10)] },
  /* 19 */ { name: 'Assaut final', groups: [g('scout', 36, 0.35), g('tank', 14, 1.8, 3), g('drone', 18, 0.9, 6)] },
  /* 20 */ {
    boss: true,
    name: 'Le Colosse — Colère finale',
    bossPhases: 3,
    groups: [g('runner', 16, 1), g('colossus', 1, 1, 5), g('tank', 6, 3, 10), g('drone', 10, 1.2, 14)],
  },
];

// Coûts « budget » utilisés par le générateur de vagues infinies.
const ENDLESS_POOL = [
  { t: 'runner', cost: 1, i: 0.6 },
  { t: 'scout', cost: 0.8, i: 0.35 },
  { t: 'tank', cost: 5, i: 1.8 },
  { t: 'drone', cost: 2, i: 0.9 },
  { t: 'splitter', cost: 3.2, i: 1.4 },
];

export function getWaveDef(wave, seed = 1) {
  if (wave <= CAMPAIGN.length) return CAMPAIGN[wave - 1];
  const rng = new RNG((seed * 9973 + wave * 7919) >>> 0);
  const budget = 30 * Math.pow(wave, 1.25);
  const kinds = 2 + Math.min(2, Math.floor((wave - 20) / 8)) + (rng.chance(0.4) ? 1 : 0);
  const chosen = [];
  const pool = ENDLESS_POOL.slice();
  for (let k = 0; k < kinds && pool.length; k++) {
    chosen.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0]);
  }
  const groups = [];
  let delay = 0;
  for (const c of chosen) {
    const share = budget / chosen.length;
    const n = Math.max(3, Math.min(60, Math.round(share / c.cost)));
    groups.push(g(c.t, n, c.i * Math.max(0.5, 1 - (wave - 20) * 0.01), delay));
    delay += rng.range(2, 6);
  }
  const def = { groups, generated: true };
  if (wave % 10 === 0) {
    def.boss = true;
    def.bossPhases = 3;
    def.name = `Le Colosse — Écho ${wave / 10}`;
    groups.push(g('colossus', 1 + Math.floor((wave - 20) / 30), 6, 4));
  } else if (wave % 5 === 0) {
    def.mini = true;
    const mini = (wave / 5) % 2 === 0 ? 'broodmother' : 'mastodon';
    def.name = mini === 'mastodon' ? 'Le Mastodonte' : 'La Nuée-mère';
    groups.push(g(mini, 1 + Math.floor((wave - 20) / 20), 4, 6));
  }
  return def;
}

// Multiplicateur de PV par vague : croissance quadratique puis exponentielle en Infini.
export function hpMult(wave) {
  const w = wave - 1;
  let m = 2 * (1 + 0.17 * w + 0.013 * w * w) * (1 + 0.32 * w);
  if (wave > 20) m *= Math.pow(1.08, wave - 20);
  return m;
}

// Densité : plus d'ennemis, plus serrés, au fil des vagues (appliqué aux groupes non-boss).
export function countMult(wave) {
  return 1 + 0.025 * (wave - 1);
}

export function intervalMult(wave) {
  return Math.max(0.6, 1 - 0.012 * (wave - 1));
}

export function bountyMult(wave) {
  return 1 + 0.04 * (wave - 1);
}

export function armorMult(wave) {
  return 1 + 0.03 * (wave - 1);
}

export function speedMult(wave) {
  if (wave <= 20) return 1 + 0.012 * (wave - 1);
  return Math.min(1.6, 1.23 + (wave - 20) * 0.01);
}

export function prepTime(nextWave, def) {
  if (nextWave === 1) return 35;
  if (def && (def.boss || def.mini)) return 28;
  return 20;
}

// Récompense de fin de vague (par joueur, avant multiplicateur de difficulté).
export function waveReward(wave) {
  return Math.round(30 + 9 * wave);
}

export function teamWaveReward(wave) {
  return Math.round(20 + 6 * wave);
}

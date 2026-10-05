// Profil joueur persistant (localStorage) : XP, niveaux, déblocages, records, réglages.

const KEY = 'tdf_profile_v1';

export const SKINS = [
  { id: 0, name: 'Acier', plate: ['#3a4560', '#232b40'], trim: '#6b7899', level: 1 },
  { id: 1, name: 'Acier bleu', plate: ['#2c4f80', '#172b4d'], trim: '#6fa8ff', level: 3 },
  { id: 2, name: 'Cuivre', plate: ['#7a4a2a', '#43261a'], trim: '#e09a5c', level: 5 },
  { id: 3, name: 'Néon', plate: ['#1d1d3a', '#0d0d1c'], trim: '#ff4fd8', level: 8 },
  { id: 4, name: 'Or royal', plate: ['#7a6220', '#3d300d'], trim: '#ffd166', level: 10 },
  { id: 5, name: 'Obsidienne', plate: ['#151515', '#050505'], trim: '#9b6bff', level: 12 },
];

export const LEVEL_REWARDS = [
  { level: 2, text: '+2 % d’or de départ' },
  { level: 3, text: 'Apparence « Acier bleu »' },
  { level: 4, text: '+4 % d’or de départ' },
  { level: 5, text: 'Apparence « Cuivre » et titre « Vétéran »' },
  { level: 6, text: '+6 % d’or de départ' },
  { level: 7, text: 'Commencez chaque partie avec un Noyau de fusion' },
  { level: 8, text: 'Apparence « Néon » et +8 % d’or de départ' },
  { level: 10, text: 'Apparence « Or royal », +10 % d’or et titre « Stratège »' },
  { level: 12, text: 'Apparence « Obsidienne »' },
  { level: 15, text: 'Titre « Légende de la Fusion »' },
];

export function xpForLevel(level) {
  // XP cumulée nécessaire pour atteindre `level`.
  return (150 * (level - 1) * level) / 2;
}

export function levelFromXp(xp) {
  let l = 1;
  while (xp >= xpForLevel(l + 1) && l < 99) l++;
  return l;
}

export function startBonus(level) {
  if (level >= 10) return 0.1;
  if (level >= 8) return 0.08;
  if (level >= 6) return 0.06;
  if (level >= 4) return 0.04;
  if (level >= 2) return 0.02;
  return 0;
}

export function titleFor(level) {
  if (level >= 15) return 'Légende de la Fusion';
  if (level >= 10) return 'Stratège';
  if (level >= 5) return 'Vétéran';
  return 'Recrue';
}

const DEFAULT = {
  name: '',
  xp: 0,
  skin: 0,
  games: 0,
  wins: 0,
  kills: 0,
  fusions: 0,
  coopFusions: 0,
  bosses: 0,
  bestWave: {},
  endlessBest: {},
  leaderboard: [],
  tutorialDone: false,
  discovered: [],
  settings: { music: 0.45, sfx: 0.7, hints: true, shake: true, damage: true },
};

function safeStorage() {
  try {
    const k = '__tdf_test';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    return null;
  }
}

class Profile {
  constructor() {
    this.store = safeStorage();
    this.data = this.load();
  }

  load() {
    let d = null;
    try {
      const raw = this.store && this.store.getItem(KEY);
      d = raw ? JSON.parse(raw) : null;
    } catch {
      d = null;
    }
    const base = structuredClone(DEFAULT);
    if (!d || typeof d !== 'object') return base;
    return { ...base, ...d, settings: { ...base.settings, ...(d.settings || {}) } };
  }

  save() {
    try {
      if (this.store) this.store.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* stockage indisponible : la progression reste en mémoire */
    }
  }

  get level() {
    return levelFromXp(this.data.xp);
  }

  get settings() {
    return this.data.settings;
  }

  setSetting(k, v) {
    this.data.settings[k] = v;
    this.save();
  }

  setName(n) {
    this.data.name = n;
    this.save();
  }

  setSkin(id) {
    const s = SKINS.find((x) => x.id === id);
    if (s && this.level >= s.level) {
      this.data.skin = id;
      this.save();
    }
  }

  perks() {
    const lv = this.level;
    return { startBonus: startBonus(lv), startCore: lv >= 7, skin: this.data.skin | 0 };
  }

  discover(key) {
    if (!this.data.discovered.includes(key)) {
      this.data.discovered.push(key);
      this.save();
      return true;
    }
    return false;
  }

  // Enregistre le résultat d'une partie pour le joueur local `pid`.
  recordGame(result, pid, teamNames) {
    const d = this.data;
    const me = result.players.find((p) => p.id === pid) || result.players[0];
    const before = this.level;
    d.xp += me ? me.xp : 0;
    d.games++;
    if (result.victory) d.wins++;
    if (me) {
      d.kills += me.stats.kills;
      d.fusions += me.stats.fusions;
      d.coopFusions += me.stats.coopFusions;
      d.bosses += me.stats.bosses;
    }
    const key = result.difficulty;
    let record = false;
    if (result.mode === 'endless') {
      if ((d.endlessBest[key] || 0) < result.wave) {
        d.endlessBest[key] = result.wave;
        record = true;
      }
      d.leaderboard.push({ wave: result.wave, diff: key, team: teamNames, date: Date.now() });
      d.leaderboard.sort((a, b) => b.wave - a.wave);
      d.leaderboard = d.leaderboard.slice(0, 10);
    } else if ((d.bestWave[key] || 0) < result.cleared) {
      d.bestWave[key] = result.cleared;
      record = true;
    }
    this.save();
    return { xp: me ? me.xp : 0, before, after: this.level, record };
  }

  reset() {
    const settings = this.data.settings;
    this.data = structuredClone(DEFAULT);
    this.data.settings = settings;
    this.save();
  }
}

export const profile = new Profile();

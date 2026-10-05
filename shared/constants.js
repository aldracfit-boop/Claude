// Constantes globales partagées entre le client et le serveur.

export const TILE = 40;
export const COLS = 32;
export const ROWS = 18;
export const WORLD_W = COLS * TILE; // 1280
export const WORLD_H = ROWS * TILE; // 720

export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;

export const MAX_PLAYERS = 4;
export const PLAYER_COLORS = ['#4da3ff', '#ff9f43', '#2ed573', '#d980fa'];
export const PLAYER_COLOR_NAMES = ['Bleu', 'Orange', 'Vert', 'Violet'];

export const PHASE = {
  PREP: 'prep',
  WAVE: 'wave',
  VICTORY: 'victory',
  DEFEAT: 'defeat',
};

export const RARITIES = [
  { id: 0, key: 'common', name: 'Commune', color: '#c9d1d9', dmg: 1.0, range: 0, slots: 0, weight: 72 },
  { id: 1, key: 'uncommon', name: 'Peu commune', color: '#3fb950', dmg: 1.12, range: 0, slots: 0, weight: 20 },
  { id: 2, key: 'rare', name: 'Rare', color: '#58a6ff', dmg: 1.25, range: 0.05, slots: 0, weight: 7 },
  { id: 3, key: 'epic', name: 'Épique', color: '#bc8cff', dmg: 1.4, range: 0.08, slots: 1, weight: 1 },
  { id: 4, key: 'legendary', name: 'Légendaire', color: '#ffa94d', dmg: 1.6, range: 0.12, slots: 1, weight: 0, aura: 0.1 },
];
export const MAX_RARITY = RARITIES.length - 1;

// Les niveaux ne sont pas une simple progression linéaire : chaque niveau
// débloque aussi un trait (voir data/towers.js).
export const LEVELS = [
  null,
  { n: 1, name: 'Débutante', dmg: 1, rate: 1, range: 1 },
  { n: 2, name: 'Améliorée', dmg: 2.9, rate: 1.1, range: 1.07 },
  { n: 3, name: 'Avancée', dmg: 8, rate: 1.2, range: 1.14 },
  { n: 4, name: 'Supérieure', dmg: 22, rate: 1.3, range: 1.22 },
  { n: 5, name: 'Ultime', dmg: 62, rate: 1.45, range: 1.3 },
];
export const MAX_LEVEL = 5;
export const BRANCH_LEVEL = 3; // niveau à partir duquel on choisit une spécialisation

export const UPGRADE_STATS = {
  dmg: { key: 'dmg', name: 'Dégâts', short: 'DÉG', pct: 0.3, icon: '⚔️' },
  rate: { key: 'rate', name: 'Cadence', short: 'CAD', pct: 0.2, icon: '⚡' },
  range: { key: 'range', name: 'Portée', short: 'POR', pct: 0.12, icon: '🎯' },
};

export const SELL_REFUND = 0.7;
export const FUSION_UPGRADE_REFUND = 0.75;
export const FUSION_COUNT = 3; // 3 tourelles identiques -> 1 tourelle niveau +1
export const FUSION_REQUEST_TIMEOUT = 20;

export const TARGET_MODES = [
  { id: 'first', name: 'Premier' },
  { id: 'last', name: 'Dernier' },
  { id: 'closest', name: 'Plus proche' },
  { id: 'strongest', name: 'Plus de PV' },
  { id: 'fastest', name: 'Plus rapide' },
  { id: 'boss', name: 'Boss d’abord' },
];

export const DIFFICULTIES = {
  easy: {
    id: 'easy',
    name: 'Facile',
    desc: 'Pour découvrir le jeu.',
    hp: 0.7,
    speed: 0.95,
    gold: 1.2,
    baseHp: 1500,
    startGold: 260,
    xp: 0.6,
  },
  normal: { id: 'normal', name: 'Normal', desc: 'L’expérience standard.', hp: 1, speed: 1, gold: 1, baseHp: 1000, startGold: 220, xp: 1 },
  hard: {
    id: 'hard',
    name: 'Difficile',
    desc: 'Ennemis plus résistants et plus rapides.',
    hp: 1.35,
    speed: 1.08,
    gold: 0.95,
    baseHp: 800,
    startGold: 210,
    xp: 1.5,
  },
  nightmare: {
    id: 'nightmare',
    name: 'Cauchemar',
    desc: 'Pour les équipes parfaitement coordonnées.',
    hp: 1.5,
    speed: 1.12,
    gold: 0.9,
    baseHp: 600,
    startGold: 200,
    xp: 2.2,
  },
};

export const MODES = {
  campaign: { id: 'campaign', name: 'Campagne', desc: '20 vagues, 2 boss. Survivez pour gagner.' },
  endless: { id: 'endless', name: 'Infini', desc: 'Les vagues ne s’arrêtent jamais. Battez votre record.' },
};

export const CAMPAIGN_WAVES = 20;

// Multiplicateur de PV selon le nombre de joueurs (chaque joueur a ses propres revenus).
export const PLAYER_HP_SCALE = [0.55, 1, 1.45, 1.95];

export const QUICK_CHAT = [
  { id: 0, text: 'Je m’occupe de ce chemin.', icon: '🛡️' },
  { id: 1, text: 'Fusion ?', icon: '⚡' },
  { id: 2, text: 'Boss en approche !', icon: '💀' },
  { id: 3, text: 'Besoin d’aide !', icon: '🆘' },
  { id: 4, text: 'Améliore cette tourelle.', icon: '⬆️' },
  { id: 5, text: 'Prêt !', icon: '✅' },
  { id: 6, text: 'Bien joué !', icon: '👏' },
  { id: 7, text: 'Attention aux volants !', icon: '🛩️' },
];

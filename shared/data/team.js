// Ressource commune (Trésor d'équipe), synergies de composition, capacités et combos.

export const TEAM_ITEMS = {
  repair: {
    id: 'repair',
    name: 'Réparation',
    icon: '🔧',
    desc: 'Restaure 20 % des PV max de la base.',
    cost: (n) => 100 + 40 * n,
  },
  shield: {
    id: 'shield',
    name: 'Bouclier de base',
    icon: '🛡️',
    desc: 'Ajoute 250 points de bouclier qui absorbent les dégâts (max 500).',
    cost: (n) => 140 + 30 * n,
  },
  armor: {
    id: 'armor',
    name: 'Blindage',
    icon: '🧱',
    desc: 'La base subit 12 % de dégâts en moins par niveau.',
    max: 3,
    cost: (n) => [200, 350, 550][n],
  },
  cannon: {
    id: 'cannon',
    name: 'Canon défensif',
    icon: '💥',
    desc: 'La base tire sur les ennemis proches. Ses dégâts augmentent avec les vagues.',
    max: 3,
    cost: (n) => [250, 450, 750][n],
  },
  training: {
    id: 'training',
    name: 'Entraînement',
    icon: '📈',
    desc: '+6 % de dégâts pour toutes les tourelles de l’équipe.',
    max: 5,
    cost: (n) => 180 + 120 * n,
  },
  generator: {
    id: 'generator',
    name: 'Générateur',
    icon: '⚙️',
    desc: '+15 or pour chaque joueur à chaque fin de vague.',
    max: 3,
    cost: (n) => [150, 260, 400][n],
  },
  core: {
    id: 'core',
    name: 'Noyau de fusion',
    icon: '💠',
    desc: 'Donne un Noyau de fusion à l’acheteur : il remplace une tourelle lors d’une fusion.',
    cost: (n) => 300 + 100 * n,
  },
};

export const TEAM_ITEM_IDS = Object.keys(TEAM_ITEMS);

export const BASE_CANNON = {
  damage: [30, 80, 200],
  rate: 1.5,
  range: 190,
};

// Synergies de composition : comptées en « puissance » = somme des niveaux des tourelles
// d'un type, toutes équipes confondues.
export const SYNERGIES = [
  {
    id: 'battery', name: 'Batterie', icon: '🎯', type: 'canon', need: 4,
    desc: 'Canons : +15 % de cadence.',
    apply: (s, t) => { if (t.type === 'canon') s.rate *= 1.15; },
  },
  {
    id: 'battery2', name: 'Batterie lourde', icon: '🎯', type: 'canon', need: 9,
    desc: 'Canons : +20 % de dégâts.',
    apply: (s, t) => { if (t.type === 'canon') s.damage *= 1.2; },
  },
  {
    id: 'bullets', name: 'Pluie de balles', icon: '🔫', type: 'mg', need: 4,
    desc: 'Mitrailleuses : +2 perforation d’armure.',
    apply: (s, t) => { if (t.type === 'mg') s.armorPierce += 2; },
  },
  {
    id: 'bullets2', name: 'Mur de plomb', icon: '🔫', type: 'mg', need: 9,
    desc: 'Mitrailleuses : +20 % de cadence.',
    apply: (s, t) => { if (t.type === 'mg') s.rate *= 1.2; },
  },
  {
    id: 'lynx', name: 'Œil de lynx', icon: '🔭', type: 'sniper', need: 4,
    desc: 'Snipers : +12 % de portée.',
    apply: (s, t) => { if (t.type === 'sniper') s.range *= 1.12; },
  },
  {
    id: 'lynx2', name: 'Tireurs d’élite', icon: '🔭', type: 'sniper', need: 9,
    desc: 'Snipers : +10 % de chances de critique.',
    apply: (s, t) => { if (t.type === 'sniper') s.crit += 0.1; },
  },
  {
    id: 'artillery', name: 'Artillerie lourde', icon: '💣', type: 'mortar', need: 4,
    desc: 'Mortiers : +20 % de rayon d’explosion.',
    apply: (s, t) => { if (t.type === 'mortar') s.splash *= 1.2; },
  },
  {
    id: 'artillery2', name: 'Pilonnage', icon: '💣', type: 'mortar', need: 9,
    desc: 'Mortiers : +20 % de dégâts.',
    apply: (s, t) => { if (t.type === 'mortar') s.damage *= 1.2; },
  },
  {
    id: 'arsenal', name: 'Arsenal complet', icon: '🧰', special: 'arsenal',
    desc: 'Au moins une tourelle de chaque type : +8 % de dégâts pour toutes les tourelles.',
    apply: (s) => { s.damage *= 1.08; },
  },
  {
    id: 'fraternity', name: 'Fraternité', icon: '🤝', special: 'fraternity',
    desc: 'Au moins 2 joueurs ont chacun 4 niveaux de tourelles : +5 % de cadence pour toutes.',
    apply: (s) => { s.rate *= 1.05; },
  },
];

export const ABILITIES = [
  {
    id: 'strike',
    key: 'e',
    name: 'Frappe aérienne',
    icon: '✈️',
    cd: 40,
    targeted: true,
    radius: 90,
    delay: 1.0,
    desc: 'Bombarde une zone après 1 s. Les dégâts augmentent avec les vagues.',
  },
  {
    id: 'freeze',
    key: 'r',
    name: 'Gel',
    icon: '❄️',
    cd: 55,
    dur: 4,
    desc: 'Ralentit tous les ennemis de 50 % pendant 4 s (boss : 25 %). Combo avec les explosions !',
  },
  {
    id: 'overcharge',
    key: 't',
    name: 'Surcharge',
    icon: '⚡',
    cd: 70,
    dur: 8,
    desc: 'Vos tourelles : dégâts +50 % et cadence +25 % pendant 8 s.',
  },
];

export const ABILITY_INDEX = Object.fromEntries(ABILITIES.map((a, i) => [a.id, i]));

export const COMBOS = {
  shatter: { id: 'shatter', name: 'Brisure glaciale', mult: 1.4, desc: 'Explosion sur une cible ralentie : +40 %.' },
  ignite: { id: 'ignite', name: 'Embrasement', mult: 1.3, desc: 'Explosion sur une cible en feu : +30 %.' },
  weakspot: { id: 'weakspot', name: 'Point faible', mult: 2, desc: 'Sniper sur une armure brisée : dégâts ×2.' },
};
export const COOP_COMBO_MULT = 1.15;

// Bonus de coopération
export const COOP = {
  linkRadius: 90, // tourelles de joueurs différents proches
  linkBonus1: 0.1,
  linkBonus2: 0.15,
  sharedTowerBonus: 0.1, // tourelle issue d'une fusion entre joueurs
  bossAssaultWindow: 3, // s
  bossAssaultBonus: 0.2,
  teamBountyShare: 0.1, // part des primes reversée au trésor d'équipe
};

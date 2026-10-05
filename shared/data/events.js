// Événements aléatoires de vague et marchand ambulant.
// Un événement est annoncé pendant la préparation (aperçu de la prochaine vague)
// pour laisser l'équipe s'adapter.

export const WAVE_EVENTS = {
  storm: {
    id: 'storm',
    name: 'Tempête',
    icon: '🌩️',
    desc: 'Visibilité réduite : la portée de toutes les tourelles baisse de 15 % pendant la vague.',
    rangeMult: 0.85,
  },
  goldrush: {
    id: 'goldrush',
    name: 'Ruée vers l’or',
    icon: '💰',
    desc: 'Primes et récompense de fin de vague ×1,5.',
    bountyMult: 1.5,
    rewardMult: 1.5,
  },
  reinforced: {
    id: 'reinforced',
    name: 'Vague renforcée',
    icon: '💪',
    desc: 'Les ennemis ont 30 % de PV en plus, mais rapportent 50 % d’or en plus.',
    hpMult: 1.3,
    bountyMult: 1.5,
  },
  invasion: {
    id: 'invasion',
    name: 'Invasion',
    icon: '👾',
    desc: 'Une horde d’Éclaireurs supplémentaires rejoint la vague.',
    extra: (w) => ({ t: 'scout', n: 10 + 2 * w, i: 0.3, d: 4 }),
  },
  blackout: {
    id: 'blackout',
    name: 'Panne',
    icon: '🔌',
    desc: 'Au début de la vague, un quart des tourelles sont hors service pendant 8 s.',
    disable: { frac: 0.25, dur: 8 },
  },
};

export const WAVE_EVENT_IDS = Object.keys(WAVE_EVENTS);
export const EVENT_CHANCE = 0.35;
export const EVENT_MIN_WAVE = 4;

export const MERCHANT_DEALS = {
  core: {
    id: 'core',
    name: 'Noyau de fusion',
    icon: '💠',
    desc: 'Un Noyau de fusion pour vous : il remplace une tourelle lors d’une fusion.',
    cost: (w) => 120 + 8 * w,
  },
  polish: {
    id: 'polish',
    name: 'Polissage',
    icon: '✨',
    desc: 'Augmente d’un cran la rareté de la tourelle sélectionnée (jusqu’à Épique).',
    needsTower: true,
    cost: (w, t) => Math.round(45 * Math.pow(3, (t ? t.level : 1) - 1) * (1 + (t ? t.rarity : 0) * 0.5)),
  },
  repair: {
    id: 'repair',
    name: 'Kit de réparation',
    icon: '🧰',
    desc: 'Répare 15 % des PV max de la base (payé avec votre or).',
    cost: (w) => 60 + 5 * w,
  },
  recharge: {
    id: 'recharge',
    name: 'Batteries chargées',
    icon: '🔋',
    desc: 'Réinitialise immédiatement toutes vos capacités.',
    cost: (w) => 50 + 4 * w,
  },
};

export const MERCHANT_DEAL_IDS = Object.keys(MERCHANT_DEALS);
export const MERCHANT_CHANCE = 0.3;
export const MERCHANT_MIN_WAVE = 3;
export const POLISH_MAX_RARITY = 3;

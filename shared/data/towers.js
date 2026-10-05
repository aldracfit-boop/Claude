// Définition des tourelles. Chaque tourelle possède :
//  - des statistiques de base (niveau 1, rareté commune) ;
//  - des traits débloqués aux niveaux 2, 4 et 5 (changement de comportement) ;
//  - trois spécialisations (branches) au choix à partir du niveau 3 (irréversible).
// Les fonctions `apply` modifient l'objet de statistiques calculé (voir game/stats.js).

export const TOWER_TYPES = {
  canon: {
    id: 'canon',
    name: 'Canon',
    hotkey: '1',
    role: 'Polyvalent',
    desc: 'Tourelle polyvalente et économique. Touche les ennemis terrestres et volants.',
    strengths: 'Bon rapport qualité/prix, touche les volants.',
    weaknesses: 'Aucun point fort marqué.',
    cost: 50,
    damage: 14,
    rate: 1.0,
    range: 120,
    kind: 'shell',
    projSpeed: 480,
    ground: true,
    air: true,
    color: '#9fb3c8',
    accent: '#56697d',
    traits: {
      2: {
        name: 'Éclats',
        desc: 'Les obus projettent des éclats autour de l’impact (35 % des dégâts).',
        apply: (s) => {
          s.splash = Math.max(s.splash, 28);
          s.splashPct = Math.max(s.splashPct, 0.35);
        },
      },
      4: { name: 'Double tir', desc: 'Tire sur deux cibles à la fois.', apply: (s) => (s.multi = 2) },
      5: {
        name: 'Bombarde',
        desc: 'Un tir sur 5 est un obus géant : dégâts ×4 et grande explosion.',
        apply: (s) => (s.ultimate = 'bombard'),
      },
    },
    branches: {
      A: {
        name: 'Obusier',
        desc: 'Obus explosifs : zone de 55 px à 70 % des dégâts.',
        apply: (s) => {
          s.splash = 55;
          s.splashPct = 0.7;
          s.damage *= 1.1;
        },
      },
      B: {
        name: 'Perce-blindage',
        desc: 'Brise l’armure 4 s : la cible perd son armure et subit +20 % de dégâts. Combo avec les Snipers !',
        apply: (s) => {
          s.armorPierce += 6;
          s.armorBreak = { t: 4 };
        },
      },
      C: {
        name: 'Double canon',
        desc: 'Cadence ×1,8 mais dégâts ×0,8.',
        apply: (s) => {
          s.rate *= 1.8;
          s.damage *= 0.8;
        },
      },
    },
  },

  mg: {
    id: 'mg',
    name: 'Mitrailleuse',
    hotkey: '2',
    role: 'Anti-essaim',
    desc: 'Cadence extrême, dégâts faibles. Excellente contre les essaims et les volants (+40 %).',
    strengths: 'Essaims, ennemis rapides, volants.',
    weaknesses: 'Presque inutile contre l’armure.',
    cost: 70,
    damage: 4,
    rate: 6,
    range: 105,
    kind: 'bullet',
    ground: true,
    air: true,
    airMult: 1.4,
    color: '#a3be8c',
    accent: '#5e7a4a',
    traits: {
      2: { name: 'Balles blindées', desc: '+2 perforation d’armure.', apply: (s) => (s.armorPierce += 2) },
      4: {
        name: 'Suppression',
        desc: 'Les balles ralentissent légèrement les cibles (15 %, 0,5 s).',
        apply: (s) => (s.slow = { pct: 0.15, t: 0.5 }),
      },
      5: {
        name: 'Tempête de plomb',
        desc: 'Toutes les 8 s : rafale de 2,5 s à cadence ×3.',
        apply: (s) => (s.ultimate = 'storm'),
      },
    },
    branches: {
      A: {
        name: 'Gatling (DPS)',
        desc: 'Cadence ×1,8, dégâts ×0,85.',
        apply: (s) => {
          s.rate *= 1.8;
          s.damage *= 0.85;
        },
      },
      B: {
        name: 'Critique',
        desc: 'Cadence ×0,55, dégâts ×2 et 25 % de coups critiques ×3.',
        apply: (s) => {
          s.rate *= 0.55;
          s.damage *= 2;
          s.crit = Math.max(s.crit, 0.25);
          s.critMult = 3;
        },
      },
      C: {
        name: 'Perforation',
        desc: 'Les balles traversent jusqu’à 3 ennemis et gagnent +3 perforation d’armure.',
        apply: (s) => {
          s.pierce = 3;
          s.pierceFalloff = 0.75;
          s.armorPierce += 3;
        },
      },
    },
  },

  sniper: {
    id: 'sniper',
    name: 'Sniper',
    hotkey: '3',
    role: 'Anti-blindé',
    desc: 'Portée immense, tirs lents mais dévastateurs. Ignore une grande partie de l’armure.',
    strengths: 'Tanks, boss, ennemis isolés.',
    weaknesses: 'Très lent : débordé par les essaims.',
    cost: 110,
    damage: 75,
    rate: 0.4,
    range: 300,
    kind: 'snipe',
    ground: true,
    air: true,
    armorPierce: 6,
    defaultTarget: 'strongest',
    color: '#b48ead',
    accent: '#6d4f68',
    traits: {
      2: { name: 'Lunette', desc: '15 % de coups critiques ×2.', apply: (s) => (s.crit = Math.max(s.crit, 0.15)) },
      4: {
        name: 'Exécution',
        desc: 'Achève instantanément les ennemis (hors boss) sous 20 % de PV.',
        apply: (s) => (s.execute = 0.2),
      },
      5: {
        name: 'Tir chargé',
        desc: 'Un tir sur 4 inflige ×3 dégâts et traverse tous les ennemis.',
        apply: (s) => (s.ultimate = 'charged'),
      },
    },
    branches: {
      A: {
        name: 'Chasseur de boss',
        desc: '+80 % de dégâts contre les boss et mini-boss, dégâts ×1,2.',
        apply: (s) => {
          s.bossMult *= 1.8;
          s.damage *= 1.2;
        },
      },
      B: {
        name: 'Perforant',
        desc: 'Le tir traverse tous les ennemis alignés (90 % des dégâts).',
        apply: (s) => {
          s.pierce = 99;
          s.pierceFalloff = 0.9;
          s.damage *= 0.9;
        },
      },
      C: {
        name: 'Marqueur',
        desc: 'Marque la cible 5 s : +20 % de dégâts reçus de toutes les sources. Cadence ×1,2.',
        apply: (s) => {
          s.mark = { t: 5 };
          s.rate *= 1.2;
        },
      },
    },
  },

  mortar: {
    id: 'mortar',
    name: 'Mortier',
    hotkey: '4',
    role: 'Zone',
    desc: 'Obus en cloche qui explosent en zone. Redoutable contre les groupes.',
    strengths: 'Groupes compacts, ennemis lents.',
    weaknesses: 'Lent, ne touche pas les volants, portée minimale.',
    cost: 120,
    damage: 30,
    rate: 0.5,
    range: 170,
    minRange: 45,
    kind: 'mortar',
    ground: true,
    air: false,
    splash: 60,
    flightTime: 0.9,
    color: '#d08770',
    accent: '#8a4f3d',
    traits: {
      2: { name: 'Charge accrue', desc: 'Rayon d’explosion +20 %.', apply: (s) => (s.splash *= 1.2) },
      4: { name: 'Double salve', desc: 'Tire deux obus par salve.', apply: (s) => (s.multi = 2) },
      5: {
        name: 'Tapis de bombes',
        desc: 'Une salve sur 3 déclenche 4 obus supplémentaires autour de la cible.',
        apply: (s) => (s.ultimate = 'carpet'),
      },
    },
    branches: {
      A: {
        name: 'Napalm',
        desc: 'Enflamme le sol 3 s et brûle les ennemis. Combo : explosions sur cible en feu +30 %.',
        apply: (s) => {
          s.napalm = { t: 3, r: 0.8 };
          s.burn = { t: 3, dpsPct: 0.35 };
        },
      },
      B: {
        name: 'Fragmentation',
        desc: 'L’explosion libère 4 sous-munitions (35 % des dégâts chacune).',
        apply: (s) => (s.frags = 4),
      },
      C: {
        name: 'Onde de choc',
        desc: 'Ralentit de 35 % pendant 2 s et rayon +25 %. Combo avec les explosions !',
        apply: (s) => {
          s.slow = { pct: 0.35, t: 2 };
          s.splash *= 1.25;
        },
      },
    },
  },
};

export const TOWER_LIST = Object.values(TOWER_TYPES);
export const TOWER_IDS = Object.keys(TOWER_TYPES);

// Valeur « théorique » d'une tourelle : base des coûts d'amélioration.
export function towerValue(type, level) {
  return TOWER_TYPES[type].cost * Math.pow(3, level - 1);
}

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
    desc: 'Portée immense, tirs lents mais dévastateurs. Ignore une grande partie de l’armure et détecte les ennemis furtifs.',
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
    detect: true,
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

  frost: {
    id: 'frost',
    name: 'Givre',
    hotkey: '5',
    role: 'Contrôle',
    desc: 'Projette des éclats de glace qui ralentissent fortement. Prépare les combos (explosions, électricité).',
    strengths: 'Ralentit tout, y compris les volants. Combos d’équipe.',
    weaknesses: 'Dégâts faibles. Les boss résistent au ralentissement.',
    cost: 90,
    damage: 7,
    rate: 1.25,
    range: 110,
    kind: 'frost',
    ground: true,
    air: true,
    slow: { pct: 0.3, t: 2 },
    color: '#81ecec',
    accent: '#2c8c99',
    traits: {
      2: {
        name: 'Gel profond',
        desc: 'Ralentissement porté à 40 %.',
        apply: (s) => (s.slow = { ...s.slow, pct: Math.max(s.slow.pct, 0.4) }),
      },
      4: {
        name: 'Blizzard',
        desc: 'Chaque éclat explose en une petite zone glacée (40 px) qui ralentit aussi les ennemis voisins.',
        apply: (s) => (s.splash = Math.max(s.splash, 40)),
      },
      5: {
        name: 'Zéro absolu',
        desc: 'Toutes les 6 s, gèle sur place tous les ennemis à portée (1,2 s ; boss 0,4 s).',
        apply: (s) => (s.ultimate = 'absolute'),
      },
    },
    branches: {
      A: {
        name: 'Glace brisante',
        desc: 'Les cibles deviennent fragiles 3 s : elles subissent +15 % de dégâts de toutes les sources.',
        apply: (s) => (s.chill = { t: 3, pct: 0.15 }),
      },
      B: {
        name: 'Aura polaire',
        desc: 'Ne tire plus : ralentit en permanence tous les ennemis à portée et les blesse lentement.',
        apply: (s) => {
          s.aura = true;
          s.damage *= 1.4;
        },
      },
      C: {
        name: 'Éclats perforants',
        desc: 'Les éclats traversent 3 ennemis et font 50 % de dégâts en plus.',
        apply: (s) => {
          s.pierce = 3;
          s.pierceFalloff = 0.85;
          s.damage *= 1.5;
        },
      },
    },
  },

  tesla: {
    id: 'tesla',
    name: 'Tesla',
    hotkey: '6',
    role: 'Chaîne',
    desc: 'Un arc électrique qui rebondit entre les ennemis proches. Excellent contre les groupes et les boucliers.',
    strengths: 'Groupes, boucliers (×2), volants.',
    weaknesses: 'Portée courte, dégâts dispersés sur les cibles isolées.',
    cost: 100,
    damage: 16,
    rate: 0.8,
    range: 115,
    kind: 'chain',
    ground: true,
    air: true,
    chains: 3,
    chainRange: 75,
    chainFalloff: 0.8,
    color: '#a29bfe',
    accent: '#5f4fd1',
    traits: {
      2: { name: 'Arc étendu', desc: 'L’arc rebondit sur une cible de plus.', apply: (s) => (s.chains += 1) },
      4: { name: 'Surtension', desc: 'Chaque cible touchée est paralysée 0,25 s.', apply: (s) => (s.stun = Math.max(s.stun, 0.25)) },
      5: {
        name: 'Tempête électrique',
        desc: 'Un tir sur 5 rebondit sur 12 cibles sans perte de puissance.',
        apply: (s) => (s.ultimate = 'thunder'),
      },
    },
    branches: {
      A: {
        name: 'Arc de foudre',
        desc: '+3 rebonds, dégâts ×0,85.',
        apply: (s) => {
          s.chains += 3;
          s.damage *= 0.85;
        },
      },
      B: {
        name: 'Condensateur',
        desc: 'Ne rebondit plus mais frappe une seule cible : dégâts ×2,6, cadence ×0,75.',
        apply: (s) => {
          s.chains = 0;
          s.damage *= 2.6;
          s.rate *= 0.75;
        },
      },
      C: {
        name: 'Paralysie',
        desc: 'Paralyse chaque cible 0,5 s (hors boss). Dégâts ×0,8.',
        apply: (s) => {
          s.stun = Math.max(s.stun, 0.5);
          s.damage *= 0.8;
        },
      },
    },
  },

  // ---------------------------------------------------------------------------
  // Tourelles hybrides : uniquement par fusion avancée (voir data/recipes.js).
  // Elles naissent au niveau de leurs ingrédients (3 minimum) et peuvent ensuite
  // fusionner entre elles (3 identiques -> niveau +1). Pas de spécialisation.
  railgun: {
    id: 'railgun',
    name: 'Railgun',
    hybrid: true,
    role: 'Hybride',
    desc: 'Sniper + Tesla. Un rayon magnétique qui traverse toute la ligne, détecte les furtifs et paralyse brièvement.',
    strengths: 'Lignes d’ennemis, boss, furtifs.',
    weaknesses: 'Cadence très lente.',
    cost: 210,
    damage: 190,
    rate: 0.33,
    range: 330,
    kind: 'snipe',
    ground: true,
    air: true,
    armorPierce: 12,
    detect: true,
    pierceAll: true,
    stun: 0.3,
    defaultTarget: 'strongest',
    color: '#74b9ff',
    accent: '#0652dd',
    traits: {
      4: { name: 'Surcharge magnétique', desc: '25 % de coups critiques ×2.', apply: (s) => (s.crit = Math.max(s.crit, 0.25)) },
      5: { name: 'Tir chargé', desc: 'Un tir sur 4 inflige ×3 dégâts.', apply: (s) => (s.ultimate = 'charged') },
    },
    branches: {},
  },
  cryomortar: {
    id: 'cryomortar',
    name: 'Cryo-mortier',
    hybrid: true,
    role: 'Hybride',
    desc: 'Mortier + Givre. Des obus glacés qui gèlent la zone d’impact. Prépare d’énormes combos d’explosions.',
    strengths: 'Groupes, contrôle de foule.',
    weaknesses: 'Ne touche pas les volants.',
    cost: 210,
    damage: 55,
    rate: 0.5,
    range: 175,
    minRange: 45,
    kind: 'mortar',
    ground: true,
    air: false,
    splash: 72,
    flightTime: 0.9,
    slow: { pct: 0.5, t: 2.5 },
    stun: 0.6,
    color: '#a5d8ff',
    accent: '#3d7bd9',
    traits: {
      4: { name: 'Double salve', desc: 'Tire deux obus par salve.', apply: (s) => (s.multi = 2) },
      5: { name: 'Hiver éternel', desc: 'Une salve sur 3 déclenche 4 obus supplémentaires.', apply: (s) => (s.ultimate = 'carpet') },
    },
    branches: {},
  },
  plasma: {
    id: 'plasma',
    name: 'Gatling à plasma',
    hybrid: true,
    role: 'Hybride',
    desc: 'Mitrailleuse + Tesla. Des balles de plasma qui ignorent presque toute l’armure et rebondissent sur une cible voisine.',
    strengths: 'Essaims, blindés, boucliers.',
    weaknesses: 'Portée moyenne.',
    cost: 170,
    damage: 7,
    rate: 8,
    range: 115,
    kind: 'bullet',
    ground: true,
    air: true,
    airMult: 1.3,
    armorPierce: 10,
    chains: 1,
    chainRange: 70,
    chainFalloff: 0.7,
    color: '#d980fa',
    accent: '#8e44ad',
    traits: {
      4: { name: 'Plasma instable', desc: 'Rebondit sur 2 cibles.', apply: (s) => (s.chains = Math.max(s.chains, 2)) },
      5: { name: 'Tempête de plasma', desc: 'Toutes les 8 s : rafale de 2,5 s à cadence ×3.', apply: (s) => (s.ultimate = 'storm') },
    },
    branches: {},
  },
  elemental: {
    id: 'elemental',
    name: 'Élémentaire',
    hybrid: true,
    role: 'Hybride secret',
    desc: 'Mortier Napalm + Givre. Le feu et la glace à la fois : brûle, ralentit et déclenche des combos en chaîne.',
    strengths: 'Tout ce qui marche au sol.',
    weaknesses: 'Ne touche pas les volants.',
    cost: 210,
    damage: 60,
    rate: 0.55,
    range: 180,
    minRange: 40,
    kind: 'mortar',
    ground: true,
    air: false,
    splash: 70,
    flightTime: 0.8,
    slow: { pct: 0.4, t: 2.5 },
    burn: { t: 3, dpsPct: 0.4 },
    color: '#ff9f43',
    accent: '#48dbfb',
    traits: {
      4: { name: 'Choc thermique', desc: 'Dégâts +30 %.', apply: (s) => (s.damage *= 1.3) },
      5: { name: 'Cataclysme', desc: 'Une salve sur 3 déclenche 4 obus supplémentaires.', apply: (s) => (s.ultimate = 'carpet') },
    },
    branches: {},
  },
};

// Tourelles achetables (boutique) ; les hybrides ne s'obtiennent que par fusion.
export const TOWER_LIST = Object.values(TOWER_TYPES).filter((d) => !d.hybrid);
export const TOWER_IDS = TOWER_LIST.map((d) => d.id);
export const HYBRID_LIST = Object.values(TOWER_TYPES).filter((d) => d.hybrid);

// Valeur « théorique » d'une tourelle : base des coûts d'amélioration.
export function towerValue(type, level) {
  return TOWER_TYPES[type].cost * Math.pow(3, level - 1);
}

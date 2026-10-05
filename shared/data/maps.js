// Définition des cartes. Les coordonnées sont en cases (centre de case).
// Une carte peut avoir plusieurs chemins terrestres (choisis par les ennemis)
// et un ou plusieurs couloirs aériens empruntés par les ennemis volants.

export const MAPS = {
  plaine: {
    id: 'plaine',
    name: 'Plaine',
    desc: 'Un chemin unique et sinueux. Idéal pour apprendre les bases.',
    paths: [
      [
        [-1, 3],
        [6, 3],
        [6, 13],
        [12, 13],
        [12, 4],
        [19, 4],
        [19, 14],
        [25, 14],
        [25, 8],
        [28, 8],
      ],
    ],
    airPaths: [
      [
        [-1, 16],
        [28, 8],
      ],
    ],
    base: { col: 29, row: 8 },
    // étang central (infranchissable, non constructible)
    water: [
      [15, 7],
      [16, 7],
      [15, 8],
      [16, 8],
      [15, 9],
      [16, 9],
      [14, 8],
      [17, 8],
    ],
    // rochers (non constructibles)
    rocks: [
      [2, 10],
      [3, 10],
      [2, 11],
      [9, 1],
      [22, 1],
      [23, 1],
      [28, 15],
      [29, 15],
      [29, 16],
    ],
    decorSeed: 7,
    theme: {
      grassA: '#3d6b35',
      grassB: '#447a3a',
      path: '#b8956a',
      pathEdge: '#8d6e4c',
      water: '#3a7bd5',
    },
  },
};

export const DEFAULT_MAP = 'plaine';

// Recettes de fusion avancée : deux tourelles de types différents (même niveau, 3 minimum)
// donnent une tourelle hybride du même niveau. Certaines recettes exigent une spécialisation
// précise d'un ingrédient : elles sont prioritaires et restent à découvrir.

export const HYBRID_MIN_LEVEL = 3;

export const RECIPES = [
  { id: 'elemental', a: 'mortar', aBranch: 'A', b: 'frost', result: 'elemental', secret: true },
  { id: 'railgun', a: 'sniper', b: 'tesla', result: 'railgun' },
  { id: 'cryomortar', a: 'mortar', b: 'frost', result: 'cryomortar' },
  { id: 'plasma', a: 'mg', b: 'tesla', result: 'plasma' },
];

// Recette applicable à deux tourelles (objets { type, level, branch }), ou null.
export function findRecipe(t, u) {
  if (!t || !u || t.type === u.type || t.level !== u.level || t.level < HYBRID_MIN_LEVEL) return null;
  for (const r of RECIPES) {
    const direct = t.type === r.a && u.type === r.b && (!r.aBranch || t.branch === r.aBranch);
    const swapped = u.type === r.a && t.type === r.b && (!r.aBranch || u.branch === r.aBranch);
    if (direct || swapped) return r;
  }
  return null;
}

// Recettes dans lesquelles un type peut entrer (pour l'interface).
export function recipesFor(type) {
  return RECIPES.filter((r) => r.a === type || r.b === type);
}

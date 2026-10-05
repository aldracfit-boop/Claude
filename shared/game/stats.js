// Calcul des statistiques effectives d'une tourelle.
// Partagé : le serveur l'utilise pour la simulation, le client pour l'affichage.

import { LEVELS, RARITIES, UPGRADE_STATS, MAX_LEVEL, SELL_REFUND } from '../constants.js';
import { TOWER_TYPES, towerValue } from '../data/towers.js';
import { SYNERGIES, COOP } from '../data/team.js';

export function baseStats(t) {
  const def = TOWER_TYPES[t.type];
  const L = LEVELS[t.level];
  const R = RARITIES[t.rarity];
  const s = {
    damage: def.damage * L.dmg * R.dmg,
    rate: def.rate * L.rate,
    range: def.range * L.range * (1 + R.range),
    minRange: def.minRange || 0,
    ground: def.ground,
    air: def.air,
    kind: def.kind,
    projSpeed: def.projSpeed || 0,
    flightTime: def.flightTime || 0,
    splash: def.splash || 0,
    splashPct: def.kind === 'mortar' ? 1 : 0,
    armorPierce: def.armorPierce || 0,
    airMult: def.airMult || 1,
    crit: 0,
    critMult: 2,
    pierce: 1,
    pierceFalloff: 1,
    multi: 1,
    bossMult: 1,
    execute: 0,
    slow: null,
    burn: null,
    armorBreak: null,
    mark: null,
    napalm: null,
    frags: 0,
    ultimate: null,
    detect: !!def.detect,
    dmgBonus: 0, // bonus additifs (coop, entraînement, auras)
  };
  for (let lv = 2; lv <= t.level; lv++) {
    const trait = def.traits[lv];
    if (trait) trait.apply(s);
  }
  if (t.branch && def.branches[t.branch]) def.branches[t.branch].apply(s);
  s.damage *= 1 + UPGRADE_STATS.dmg.pct * t.up.dmg;
  s.rate *= 1 + UPGRADE_STATS.rate.pct * t.up.rate;
  s.range *= 1 + UPGRADE_STATS.range.pct * t.up.range;
  return s;
}

// ctx : { synergies: Set<id>, training: niveau, }
export function computeTowerStats(t, ctx) {
  const s = baseStats(t);
  if (ctx) {
    for (const syn of SYNERGIES) {
      if (ctx.synergies && ctx.synergies.has(syn.id)) syn.apply(s, t);
    }
    s.dmgBonus += 0.06 * (ctx.training || 0);
  }
  s.dmgBonus += t.link || 0;
  s.dmgBonus += t.aura || 0;
  if (t.owners && t.owners.length > 1) s.dmgBonus += COOP.sharedTowerBonus;
  s.damage *= 1 + s.dmgBonus;
  s.crit = Math.min(s.crit, 0.9);
  s.dps = estimateDps(s);
  return s;
}

export function estimateDps(s) {
  const critAvg = 1 + s.crit * (s.critMult - 1);
  let dps = s.damage * s.rate * critAvg * s.multi;
  if (s.burn) dps += s.damage * s.burn.dpsPct * s.multi * 0.5;
  if (s.frags) dps += s.damage * 0.35 * s.frags * s.rate * 0.4;
  return dps;
}

export function upgradeSlots(t) {
  return t.level + 1 + RARITIES[t.rarity].slots;
}

export function upgradesUsed(t) {
  return t.up.dmg + t.up.rate + t.up.range;
}

export function upgradeCost(t) {
  const n = upgradesUsed(t);
  return Math.round(0.3 * towerValue(t.type, t.level) * (1 + 0.5 * n));
}

export function sellValue(t) {
  let total = 0;
  for (const k in t.invested) total += Math.max(0, t.invested[k]);
  return Math.floor(total * SELL_REFUND);
}

export function canFuseTogether(a, b) {
  if (a.type !== b.type || a.level !== b.level) return false;
  if (a.level >= MAX_LEVEL) return false;
  if (a.branch && b.branch && a.branch !== b.branch) return false;
  return true;
}

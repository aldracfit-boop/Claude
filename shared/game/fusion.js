// Système de fusion : 3 tourelles identiques (type + niveau) -> 1 tourelle niveau +1.
// Un Noyau de fusion peut remplacer une des tourelles sacrifiées.
// Les fusions impliquant les tourelles d'autres joueurs nécessitent leur accord.

import { FUSION_COUNT, FUSION_UPGRADE_REFUND, FUSION_REQUEST_TIMEOUT, MAX_LEVEL, MAX_RARITY } from '../constants.js';
import { canFuseTogether } from './stats.js';

export const FusionMixin = {
  // Tourelles compatibles avec `t` (hors `t`), triées par distance.
  fusionCandidates(t, { ownOnly = false, pid = t.owner } = {}) {
    const out = [];
    for (const u of this.towers) {
      if (u === t || !canFuseTogether(t, u)) continue;
      if (t.branch && u.branch && t.branch !== u.branch) continue;
      if (ownOnly && !(u.owners.length === 1 && u.owners[0] === pid)) continue;
      out.push(u);
    }
    out.sort((a, b) => (a.x - t.x) ** 2 + (a.y - t.y) ** 2 - ((b.x - t.x) ** 2 + (b.y - t.y) ** 2));
    return out;
  },

  // Vérifie une composition de fusion. Retourne { ok, msg, towers, consent:Set }
  validateFusion(pid, primaryId, partnerIds, useCore) {
    const t = this.towerById.get(primaryId);
    if (!t) return { ok: false, msg: 'Tourelle introuvable.' };
    if (!t.owners.includes(pid)) return { ok: false, msg: 'Cette tourelle ne vous appartient pas.' };
    if (t.level >= MAX_LEVEL) return { ok: false, msg: 'Niveau maximum atteint.' };
    const p = this.players[pid];
    if (useCore && p.cores <= 0) return { ok: false, msg: 'Aucun Noyau de fusion disponible.' };
    const need = FUSION_COUNT - 1 - (useCore ? 1 : 0);
    if (!Array.isArray(partnerIds) || partnerIds.length !== need) {
      return { ok: false, msg: `Il faut ${need} tourelle(s) compatible(s).` };
    }
    const partners = [];
    const seen = new Set([primaryId]);
    let branch = t.branch;
    for (const id of partnerIds) {
      if (seen.has(id)) return { ok: false, msg: 'Sélection invalide.' };
      seen.add(id);
      const u = this.towerById.get(id);
      if (!u) return { ok: false, msg: 'Tourelle introuvable.' };
      if (!canFuseTogether(t, u)) return { ok: false, msg: 'Tourelles incompatibles (même type et même niveau requis).' };
      if (u.branch) {
        if (branch && branch !== u.branch) return { ok: false, msg: 'Spécialisations différentes : fusion impossible.' };
        branch = u.branch;
      }
      partners.push(u);
    }
    const consent = new Set();
    for (const tw of [t, ...partners]) for (const o of tw.owners) if (o !== pid) consent.add(o);
    return { ok: true, t, partners, consent };
  },

  cmdFuse(pid, c) {
    const t = this.towerById.get(c.id | 0);
    if (!t) return this.error(pid, 'Tourelle introuvable.');
    const useCore = !!c.core;
    let partnerIds = Array.isArray(c.partners) ? c.partners.map((x) => x | 0) : null;
    if (!partnerIds) {
      // Sélection automatique : tourelles personnelles les plus proches.
      const need = FUSION_COUNT - 1 - (useCore ? 1 : 0);
      const cands = this.fusionCandidates(t, { ownOnly: true, pid });
      if (cands.length < need) return this.error(pid, 'Pas assez de tourelles compatibles.');
      partnerIds = cands.slice(0, need).map((u) => u.id);
    }
    const v = this.validateFusion(pid, t.id, partnerIds, useCore);
    if (!v.ok) return this.error(pid, v.msg);
    for (const r of this.fusionRequests) {
      if ([r.primary, ...r.partners].some((id) => id === t.id || partnerIds.includes(id))) {
        return this.error(pid, 'Une demande de fusion est déjà en cours pour ces tourelles.');
      }
    }
    if (v.consent.size === 0) {
      this.doFusion(pid, v.t, v.partners, useCore);
      return;
    }
    const req = {
      id: this.nextId++,
      from: pid,
      primary: t.id,
      partners: partnerIds,
      core: useCore,
      need: [...v.consent],
      acc: [],
      t: FUSION_REQUEST_TIMEOUT,
      type: t.type,
      level: t.level,
    };
    this.fusionRequests.push(req);
    this.emit({ e: 'fuseReq', id: req.id, from: pid, to: req.need, tt: t.type, l: t.level });
  },

  cmdFuseReply(pid, c) {
    const req = this.fusionRequests.find((r) => r.id === (c.id | 0));
    if (!req) return this.error(pid, 'Cette demande de fusion n’existe plus.');
    if (!req.need.includes(pid) || req.acc.includes(pid)) return;
    if (!c.ok) {
      this.fusionRequests.splice(this.fusionRequests.indexOf(req), 1);
      this.emit({ e: 'fuseRes', id: req.id, ok: 0, by: pid, from: req.from });
      return;
    }
    req.acc.push(pid);
    if (req.acc.length < req.need.length) return;
    this.fusionRequests.splice(this.fusionRequests.indexOf(req), 1);
    const v = this.validateFusion(req.from, req.primary, req.partners, req.core);
    if (!v.ok) {
      this.emit({ e: 'fuseRes', id: req.id, ok: 0, from: req.from, msg: v.msg });
      return;
    }
    this.emit({ e: 'fuseRes', id: req.id, ok: 1, from: req.from });
    this.doFusion(req.from, v.t, v.partners, req.core);
  },

  updateFusionRequests(dt) {
    for (let i = this.fusionRequests.length - 1; i >= 0; i--) {
      const r = this.fusionRequests[i];
      r.t -= dt;
      if (r.t <= 0) {
        this.fusionRequests.splice(i, 1);
        this.emit({ e: 'fuseRes', id: r.id, ok: 0, from: r.from, msg: 'Demande de fusion expirée.' });
      }
    }
  },

  doFusion(pid, t, partners, useCore) {
    const all = [t, ...partners];
    const p = this.players[pid];
    // Remboursement des améliorations des tourelles fusionnées.
    let refundTotal = 0;
    for (const tw of all) {
      for (const k in tw.upSpend) {
        const amt = tw.upSpend[k];
        const refund = amt * FUSION_UPGRADE_REFUND;
        const pl = this.players[k];
        if (pl) pl.gold += refund;
        tw.invested[k] = (tw.invested[k] || 0) - amt;
        refundTotal += refund;
      }
      tw.upSpend = {};
    }
    // Propriétaires et investissement.
    const owners = [t.owner];
    const invested = {};
    for (const tw of all) {
      for (const o of tw.owners) if (!owners.includes(o)) owners.push(o);
      for (const k in tw.invested) invested[k] = (invested[k] || 0) + Math.max(0, tw.invested[k]);
    }
    // Rareté : la plus haute, avec une chance de promotion.
    let rarity = 0;
    for (const tw of all) rarity = Math.max(rarity, tw.rarity);
    const same = all.filter((tw) => tw.rarity === rarity).length;
    let promoted = false;
    if (rarity < MAX_RARITY && this.rng.next() < 0.15 + 0.1 * (same - 1) + (useCore ? 0.1 : 0)) {
      rarity++;
      promoted = true;
    }
    const branch = all.find((tw) => tw.branch)?.branch ?? t.branch;
    const from = partners.map((u) => [Math.round(u.x), Math.round(u.y)]);
    for (const u of partners) this.removeTower(u);
    if (useCore) p.cores--;
    t.level++;
    t.rarity = rarity;
    t.branch = branch;
    t.owners = owners;
    t.invested = invested;
    t.up = { dmg: 0, rate: 0, range: 0 };
    t.cd = 0.4;
    const coop = owners.length > 1;
    for (const o of owners) {
      const pl = this.players[o];
      if (!pl) continue;
      pl.stats.fusions++;
      if (coop) pl.stats.coopFusions++;
    }
    this.towersDirty = true;
    this.emit({
      e: 'fusion',
      id: t.id,
      p: pid,
      x: Math.round(t.x),
      y: Math.round(t.y),
      from,
      tt: t.type,
      l: t.level,
      r: rarity,
      promo: promoted ? 1 : 0,
      coop: coop ? 1 : 0,
      core: useCore ? 1 : 0,
      refund: Math.round(refundTotal),
      own: owners,
    });
  },
};

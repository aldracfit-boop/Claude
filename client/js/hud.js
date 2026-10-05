// Interface (DOM) autour du canvas : barres, panneaux, boutique, sélection, chat, alertes.

import { h, put, clear, setText, toggleClass, fmtTime, fmtDuration, fmtInt } from './dom.js';
import {
  RARITIES,
  LEVELS,
  TARGET_MODES,
  UPGRADE_STATS,
  QUICK_CHAT,
  PLAYER_COLORS,
  MAX_LEVEL,
  BRANCH_LEVEL,
  DIFFICULTIES,
  MODES,
  FUSION_COUNT,
} from '../../shared/constants.js';
import { TOWER_TYPES, TOWER_LIST } from '../../shared/data/towers.js';
import { ENEMY_TYPES, ENEMY_IDS } from '../../shared/data/enemies.js';
import { TEAM_ITEMS, TEAM_ITEM_IDS, SYNERGIES, ABILITIES, synergyPower, ARSENAL_NEED } from '../../shared/data/team.js';
import { upgradeCost, upgradeSlots } from '../../shared/game/stats.js';
import { towerIcon, enemyIcon } from './render/sprites.js';
import { WAVE_EVENTS, MERCHANT_DEALS, POLISH_MAX_RARITY } from '../../shared/data/events.js';
import { recipesFor, findRecipe, HYBRID_MIN_LEVEL } from '../../shared/data/recipes.js';
import { profile } from './profile.js';

const ENEMY_DEFS = ENEMY_IDS.map((id) => ENEMY_TYPES[id]);

export class Hud {
  constructor(view) {
    this.view = view;
    this.actions = view.actions;
    this.selKey = '';
    this.lastSnapKey = '';
    this.tab = 'build';
    this.chatLines = [];
    this.costButtons = [];
  }

  // ------------------------------------------------------------ Construction
  build(root) {
    const a = this.actions;
    this.root = h('div.game');

    // Barre du haut
    this.el = {};
    const E = this.el;
    E.menuBtn = h('button.icon-btn', { title: 'Menu (Échap)', onclick: () => a.menu() }, '≡');
    E.wave = h('div.tb-wave');
    E.phase = h('span.tb-phase');
    E.timer = h('span.tb-timer');
    E.readyInfo = h('span.muted');
    E.baseBar = h('i');
    E.baseShield = h('em');
    E.baseText = h('span');
    E.base = h('div.basehp', h('span', '❤️'), h('div.bar', E.baseBar, E.baseShield, E.baseText));
    E.gold = h('span.tb-gold.gold');
    E.cores = h('span', { title: 'Noyaux de fusion : remplacent une tourelle lors d’une fusion' });
    E.team = h('span', { style: { color: 'var(--team)', fontWeight: 700 }, title: 'Trésor d’équipe' });
    E.speed = h('button.icon-btn', { title: 'Vitesse ×2 (vote de toute l’équipe)', onclick: () => a.speed() }, '×1');
    E.diff = h('span.tag');
    E.event = h('span.tag.event.hidden');
    E.pauseBtn = h('button.icon-btn', { title: 'Pause (P)', onclick: () => a.pause() }, '❚❚');
    const top = h(
      'div.topbar',
      E.menuBtn,
      h('div.tb-block', E.wave, E.phase, E.timer, E.readyInfo),
      h('div.grow'),
      E.base,
      h('div.grow'),
      h('div.tb-block', E.gold, E.cores, E.team),
      E.event,
      E.diff,
      E.speed,
      this.view.session.isLocal ? E.pauseBtn : null,
    );

    // Panneau gauche
    E.players = h('div');
    E.next = h('div.next-wave');
    E.merchant = h('div.side-section.hidden');
    E.syn = h('div.syn-list');
    const left = h(
      'div.side.left',
      h('div.side-section', h('h5', 'Équipe'), E.players),
      h('div.side-section', h('h5', 'Prochaine vague'), E.next),
      E.merchant,
      h('div.side-section', h('h5', 'Synergies'), E.syn),
    );

    // Scène
    this.canvas = h('canvas');
    this.overlay = h('div.overlay');
    E.bossbar = h('div.bossbar.hidden');
    E.toasts = h('div.toasts');
    E.modeHint = h('div.mode-hint.hidden');
    E.tooltip = h('div.tooltip.hidden');
    E.fusionReq = h('div.hidden');
    E.summary = h('div.hidden');
    this.overlay.append(E.bossbar, E.modeHint, E.summary, E.fusionReq, E.toasts, E.tooltip);
    this.stageInner = h('div.stage-inner', this.canvas, this.overlay);
    this.stage = h('div.stage', this.stageInner);

    // Barre du bas
    E.abilities = ABILITIES.map((ab, i) => {
      const cdov = h('div.cdov');
      const cdt = h('div.cdt');
      const btn = h(
        'button.ability',
        { title: `${ab.name} [${ab.key.toUpperCase()}] — ${ab.desc} (recharge ${ab.cd} s)`, onclick: () => a.ability(i) },
        h('span.k', ab.key.toUpperCase()),
        ab.icon,
        cdov,
        cdt,
      );
      return { btn, cdov, cdt };
    });
    E.ready = h('button.btn.primary.ready-btn', { onclick: () => a.ready(), title: 'Lancer la vague (Espace)' }, 'Prêt !');
    const qc = h(
      'div.quickchat',
      QUICK_CHAT.map((q) => h('button', { title: q.text, onclick: () => a.chat({ q: q.id }) }, q.icon)),
      h('button', { title: 'Ping sur la carte (G ou clic molette)', onclick: () => a.pingMode() }, '📍'),
    );
    E.chat = h('div.chatlog');
    E.chatInput = this.view.session.isLocal
      ? null
      : h('input.chat-input', {
          placeholder: 'Message (Entrée)…',
          maxlength: 120,
          onkeydown: (ev) => {
            ev.stopPropagation();
            if (ev.key === 'Enter') {
              const v = ev.target.value.trim();
              if (v) a.chat({ m: v });
              ev.target.value = '';
              ev.target.blur();
            } else if (ev.key === 'Escape') ev.target.blur();
          },
        });
    const bottom = h(
      'div.bottombar',
      h(
        'div.abilities',
        E.abilities.map((x) => x.btn),
      ),
      E.ready,
      qc,
      E.chat,
      E.chatInput,
    );

    // Panneau droit
    E.tabBuild = h('button.on', { onclick: () => this.setTab('build') }, 'Construire');
    E.tabTeam = h('button', { onclick: () => this.setTab('team') }, 'Équipe');
    E.shop = h('div.shop');
    E.towerCards = TOWER_LIST.map((def) => {
      const cv = h('canvas');
      const btn = h(
        'button.tower-card',
        {
          title: `${def.name} — ${def.desc}\nForces : ${def.strengths}\nFaiblesses : ${def.weaknesses}`,
          onclick: () => a.place(def.id),
        },
        cv,
        h('span.nm', def.name),
        h('span.role', def.role),
        h('span.cost', String(def.cost)),
        h('kbd.hk', def.hotkey),
      );
      E.shop.append(btn);
      return { def, btn, cv };
    });
    E.sel = h('div');
    E.buildPane = h('div.stack', E.shop, E.sel);
    E.teamPane = h('div.stack.hidden');
    const right = h('div.side.right', h('div.tabs', E.tabBuild, E.tabTeam), E.buildPane, E.teamPane);

    this.root.append(top, left, this.stage, bottom, right);
    root.append(this.root);
    for (const c of E.towerCards) towerIcon(c.cv, c.def.id, 1, 0, null, this.view.ui.me);
    this.buildTeamPane();
    return this.root;
  }

  setTab(tab) {
    this.tab = tab;
    toggleClass(this.el.tabBuild, 'on', tab === 'build');
    toggleClass(this.el.tabTeam, 'on', tab === 'team');
    toggleClass(this.el.buildPane, 'hidden', tab !== 'build');
    toggleClass(this.el.teamPane, 'hidden', tab !== 'team');
  }

  buildTeamPane() {
    const E = this.el;
    E.teamTotal = h('span.v');
    E.teamItems = TEAM_ITEM_IDS.map((id) => {
      const it = TEAM_ITEMS[id];
      const cost = h('span.cost');
      const lvl = h('span');
      const btn = h(
        'button.team-item',
        { onclick: () => this.actions.team(id), title: it.desc },
        h('div.ic', it.icon),
        h('div', h('b', it.name), lvl, h('span', it.desc)),
        cost,
      );
      return { id, it, btn, cost, lvl };
    });
    clear(E.teamPane).append(
      h('div.team-total', h('span', '🤝 Trésor d’équipe'), E.teamTotal),
      h(
        'div.hint-line',
        'Alimenté par 10 % de toutes les primes et par chaque fin de vague. Tout le monde peut l’utiliser : concertez-vous !',
      ),
      h(
        'div.team-shop',
        E.teamItems.map((x) => x.btn),
      ),
      h(
        'div.hint-line',
        'Astuce : cliquez sur 🎁 à côté d’un coéquipier pour lui donner 50 or. Vous pouvez aussi payer l’amélioration de ses tourelles.',
      ),
    );
  }

  // ------------------------------------------------------------ Mise à jour
  update(state, ui) {
    const snap = state.snap;
    if (!snap) return;
    const E = this.el;
    const me = snap.players[ui.me];
    const total = snap.total;
    setText(E.wave, '');
    E.wave.innerHTML = '';
    E.wave.append(`Vague ${Math.max(1, snap.phase === 'prep' ? snap.wave + 1 : snap.wave)}`, h('small', total ? ` / ${total}` : ' · ∞'));
    const prep = snap.phase === 'prep';
    setText(E.phase, prep ? 'Préparation' : snap.phase === 'wave' ? 'Vague en cours' : snap.phase === 'victory' ? 'Victoire' : 'Défaite');
    toggleClass(E.phase, 'prep', prep);
    toggleClass(E.phase, 'wave', snap.phase === 'wave');
    if (prep) {
      setText(E.timer, fmtTime(snap.timer));
      toggleClass(E.timer, 'urgent', snap.timer <= 5);
      const humans = snap.players.filter((p) => p.on || p.bot);
      setText(E.readyInfo, `Prêts ${humans.filter((p) => p.ready).length}/${humans.length}`);
    } else {
      setText(E.timer, `👾 ${snap.remain}`);
      toggleClass(E.timer, 'urgent', false);
      setText(E.readyInfo, '');
    }
    const b = snap.base;
    E.baseBar.style.width = `${(100 * b.hp) / b.max}%`;
    E.baseShield.style.width = `${Math.min(100, (100 * b.sh) / b.max)}%`;
    setText(E.baseText, `${fmtInt(b.hp)} / ${fmtInt(b.max)}${b.sh ? `  +🛡${b.sh}` : ''}`);
    if (me) {
      setText(E.gold, `💰 ${fmtInt(me.gold)}`);
      setText(E.cores, me.cores ? `💠 ${me.cores}` : '');
    }
    setText(E.team, `🤝 ${fmtInt(snap.team)}`);
    setText(E.speed, `×${snap.speed}`);
    toggleClass(E.speed, 'on', me && me.sv);
    setText(E.diff, `${DIFFICULTIES[snap.diff]?.name || ''} · ${MODES[snap.mode]?.name || ''}`);
    const wev = snap.ev ? WAVE_EVENTS[snap.ev] : null;
    toggleClass(E.event, 'hidden', !wev);
    if (wev) {
      setText(E.event, `${wev.icon} ${wev.name}`);
      E.event.title = wev.desc;
    }
    toggleClass(E.pauseBtn, 'on', this.view.session.paused);

    this.updatePlayers(snap, ui);
    this.updateNext(snap);
    this.updateMerchant(state, ui, me);
    this.updateSynergies(state);
    this.updateBoss(snap);
    this.updateBottom(snap, ui, me);
    this.updateShop(me, ui);
    this.updateSelection(state, ui, me);
    this.updateTeamPane(snap);
    this.updateFusionRequests(state, ui);
  }

  updatePlayers(snap, ui) {
    const key = snap.players.map((p) => `${p.id}${p.name}${p.on}${p.ap}`).join('|') + ui.me + this.view.session.hotSeat;
    if (key !== this.playersKey) {
      this.playersKey = key;
      clear(this.el.players);
      this.pcards = snap.players.map((p) => {
        const gold = h('span.g');
        const cores = h('span.c');
        const ready = h('span.ready');
        const pips = h(
          'div.cdpips',
          ABILITIES.map(() => h('i')),
        );
        const local = this.view.session.humanPids.includes(p.id);
        const card = h(
          'div.pcard',
          {
            style: { '--pc': p.color },
            onclick: () => local && this.actions.switchPlayer(p.id),
          },
          h('div.top', h('span.dot'), h('span.name', (p.bot ? '🤖 ' : '') + p.name + (p.ap ? ' (IA)' : '')), ready),
          h(
            'div.meta',
            gold,
            cores,
            p.id !== ui.me
              ? h(
                  'button.gift',
                  { title: `Donner 50 or à ${p.name}`, onclick: (ev) => (ev.stopPropagation(), this.actions.gift(p.id, 50)) },
                  '🎁 50',
                )
              : null,
          ),
          pips,
        );
        toggleClass(card, 'switchable', local && this.view.session.hotSeat);
        this.el.players.append(card);
        return { card, gold, cores, ready, pips };
      });
    }
    snap.players.forEach((p, i) => {
      const c = this.pcards[i];
      toggleClass(c.card, 'me', p.id === ui.me);
      toggleClass(c.card, 'off', !p.on && !p.bot);
      setText(c.gold, `💰 ${fmtInt(p.gold)}`);
      setText(c.cores, p.cores ? `💠 ${p.cores}` : '');
      setText(c.ready, snap.phase === 'prep' ? (p.ready ? '✓ Prêt' : '…') : '');
      toggleClass(c.ready, 'no', !p.ready);
      [...c.pips.children].forEach((pip, k) => toggleClass(pip, 'cd', p.cds[k] > 0));
    });
  }

  updateNext(snap) {
    const n = snap.next;
    const key = n ? JSON.stringify(n) : snap.phase === 'wave' ? `w${snap.wave}` : 'none';
    if (key === this.nextKey) return;
    this.nextKey = key;
    const box = clear(this.el.next);
    if (!n) {
      box.append(h('div.muted', snap.phase === 'wave' ? 'Vague en cours…' : '—'));
      return;
    }
    const cls = n.boss ? 'ttl.boss' : n.mini ? 'ttl.mini' : 'ttl';
    box.append(h(`div.${cls}`, `Vague ${n.w}${n.name ? ' — ' + n.name : ''}${n.boss ? ' 💀' : n.mini ? ' ⚠️' : ''}`));
    const chips = h('div.enemy-chips');
    for (const [ti, count] of n.groups) {
      const def = ENEMY_DEFS[ti];
      const cv = h('canvas');
      chips.append(h('span.enemy-chip', { title: `${def.name} — ${def.desc}` }, cv, `${count}× ${def.name}`));
      requestAnimationFrame(() => enemyIcon(cv, def));
    }
    box.append(chips);
    if (n.ev) {
      const ev = WAVE_EVENTS[n.ev];
      box.append(h('div.wave-event', h('b', `${ev.icon} Événement : ${ev.name}`), h('span', ev.desc)));
    }
    if (n.groups.some(([ti]) => ENEMY_DEFS[ti].flying))
      box.append(h('div.hint-line', '🛩️ Volants : suivent le couloir aérien en pointillés.'));
  }

  updateMerchant(state, ui, me) {
    const snap = state.snap;
    const m = snap.merchant;
    const el = this.el.merchant;
    if (!m || !me) {
      if (!el.classList.contains('hidden')) el.classList.add('hidden');
      this.merchantKey = '';
      return;
    }
    const t = ui.selectedId ? state.towers.get(ui.selectedId) : null;
    const myTower = t && (t.os || [t.o]).includes(ui.me) ? t : null;
    const bought = m.bought[ui.me] || [];
    const wave = Math.max(1, snap.wave);
    const key = `${m.deals}|${bought}|${myTower ? myTower.id + ':' + myTower.l + ':' + myTower.r : ''}|${Math.floor(me.gold / 5)}|${ui.me}`;
    if (key === this.merchantKey) return;
    this.merchantKey = key;
    el.classList.remove('hidden');
    const items = m.deals.map((id) => {
      const d = MERCHANT_DEALS[id];
      const tw = d.needsTower && myTower ? { level: myTower.l, rarity: myTower.r } : null;
      const cost = d.cost(wave, tw);
      const done = bought.includes(id);
      let reason = '';
      if (done) reason = 'Déjà acheté';
      else if (d.needsTower && !myTower) reason = 'Sélectionnez une de vos tourelles';
      else if (d.needsTower && myTower.r >= POLISH_MAX_RARITY) reason = 'Rareté maximale';
      const btn = h(
        'button.team-item',
        { title: d.desc, onclick: () => this.actions.merchant(id, myTower ? myTower.id : 0) },
        h('div.ic', d.icon),
        h('div', h('b', d.name), h('span', reason || d.desc)),
        h('span.cost.gold', done ? '✓' : `${cost}`),
      );
      btn.disabled = done || !!reason || me.gold < cost;
      return btn;
    });
    put(
      clear(el),
      h('h5', '🧳 Marchand ambulant'),
      h('div.team-shop', items),
      h('div.hint-line', 'Il repart au début de la prochaine vague.'),
    );
  }

  updateSynergies(state) {
    const snap = state.snap;
    const power = synergyPower([...state.towers.values()].map((t) => ({ type: t.tt, level: t.l })));
    const active = new Set(snap.syn);
    const key = JSON.stringify(power) + snap.syn.join(',');
    if (key === this.synKey) return;
    this.synKey = key;
    const box = clear(this.el.syn);
    for (const s of SYNERGIES) {
      let progress = '';
      if (s.type) progress = `${Math.min(power[s.type], s.need)}/${s.need}`;
      else if (s.special === 'arsenal')
        progress = `${Math.min(ARSENAL_NEED, Object.values(power).filter((v) => v > 0).length)}/${ARSENAL_NEED}`;
      const on = active.has(s.id);
      if (!on && s.type && power[s.type] === 0) continue;
      box.append(
        h(
          `div.syn${on ? '.on' : ''}`,
          { title: `${s.desc}${s.type ? ' (progression en équivalents tourelle niveau 1)' : ''}` },
          h('span', s.icon),
          h('span', s.name),
          h('span.pg', on ? '✓' : progress),
        ),
      );
    }
  }

  updateBoss(snap) {
    const bb = this.el.bossbar;
    const boss = snap.boss;
    if (!boss) {
      bb.classList.add('hidden');
      this.bossKey = '';
      return;
    }
    const key = `${boss.id}|${boss.ph}`;
    if (key !== this.bossKey) {
      this.bossKey = key;
      bb.classList.remove('hidden');
      toggleClass(bb, 'mini', !boss.boss);
      this.bossEls = { fill: h('i'), tags: h('div.tags'), name: h('div.nm') };
      const bar = h(
        'div.bar',
        this.bossEls.fill,
        boss.th.map((t) => h('u', { style: { left: `${t * 100}%` } })),
      );
      clear(bb).append(this.bossEls.name, bar, this.bossEls.tags);
    }
    const el = this.bossEls;
    put(clear(el.name), boss.n, boss.phn ? h('small', `Phase ${boss.ph}/${boss.mph} — ${boss.phn}`) : null);
    el.fill.style.width = `${(100 * boss.hp) / boss.max}%`;
    put(
      clear(el.tags),
      h('span', `${fmtInt(boss.hp)} PV`),
      h('span', `Progression ${Math.round(boss.prog * 100)} %`),
      boss.as ? h('span.assault', '⚔️ Assaut coordonné +20 %') : null,
      boss.inv ? h('span.inv', '🛡️ Invulnérable') : null,
    );
  }

  updateBottom(snap, ui, me) {
    const E = this.el;
    if (!me) return;
    ABILITIES.forEach((ab, i) => {
      const x = E.abilities[i];
      const cd = me.cds[i];
      x.cdov.style.setProperty('--p', `${Math.round((100 * cd) / ab.cd)}%`);
      setText(x.cdt, cd > 0 ? Math.ceil(cd) : '');
      toggleClass(x.btn, 'targeting', ui.abilityTarget && ui.abilityTarget.i === i);
    });
    const prep = snap.phase === 'prep';
    E.ready.disabled = !prep;
    toggleClass(E.ready, 'is-ready', prep && me.ready);
    setText(E.ready, prep ? (me.ready ? '✓ Prêt (annuler)' : `Prêt ! (${fmtTime(snap.timer)})`) : 'Vague en cours');
    if (ui.abilityTarget) this.setModeHint(`Choisissez la zone de la Frappe aérienne — clic droit pour annuler`);
    else if (ui.pingMode) this.setModeHint('Cliquez sur la carte pour placer un ping');
    else if (ui.fusionSel)
      this.setModeHint(
        `Fusion d’équipe : choisissez ${ui.fusionSel.need - ui.fusionSel.chosen.length} tourelle(s) en surbrillance — clic droit pour annuler`,
      );
    else if (ui.placing) this.setModeHint(`Placement : ${TOWER_TYPES[ui.placing].name} — Maj pour enchaîner, clic droit pour annuler`);
    else if (ui.moving) this.setModeHint('Déplacement : choisissez une case libre — clic droit pour annuler');
    else this.setModeHint(null);
  }

  setModeHint(text) {
    const el = this.el.modeHint;
    if (!text) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    setText(el, text);
  }

  updateShop(me, ui) {
    if (!me) return;
    for (const c of this.el.towerCards) {
      c.btn.disabled = me.gold < c.def.cost;
      toggleClass(c.btn, 'on', ui.placing === c.def.id);
    }
  }

  updateTeamPane(snap) {
    const E = this.el;
    setText(E.teamTotal, fmtInt(snap.team));
    for (const x of E.teamItems) {
      const n = snap.tl[x.id] || 0;
      const maxed = x.it.max && n >= x.it.max;
      const cost = maxed ? null : x.it.cost(n);
      setText(x.cost, maxed ? 'MAX' : `🤝 ${cost}`);
      setText(x.lvl, x.it.max ? ` · niv. ${n}/${x.it.max}` : n ? ` · ×${n}` : '');
      let disabled = maxed || snap.team < cost;
      if (x.id === 'repair' && snap.base.hp >= snap.base.max) disabled = true;
      if (x.id === 'shield' && snap.base.sh >= 500) disabled = true;
      x.btn.disabled = disabled;
    }
  }

  // ------------------------------------------------------------ Sélection
  updateSelection(state, ui, me) {
    const snap = state.snap;
    const t = ui.selectedId ? state.towers.get(ui.selectedId) : null;
    const enemy = !t && ui.selectedEnemyId ? state.enemies.get(ui.selectedEnemyId) : null;
    if (ui.selectedId && !t) ui.selectedId = null;
    const key = t ? `t${t.id}|${state.tv}|${ui.me}|${snap.phase}|${ui.fusionSel ? 1 : 0}` : enemy ? `e${enemy.id}` : `none|${snap.phase}`;
    if (key !== this.selKey) {
      this.selKey = key;
      this.costButtons = [];
      const box = clear(this.el.sel);
      if (t) box.append(this.towerPanel(state, t, ui, me));
      else if (enemy) {
        this.enemyEls = {};
        box.append(this.enemyPanel(enemy));
      } else box.append(this.helpPanel(snap));
    }
    if (enemy && this.enemyEls && this.enemyEls.hp) setText(this.enemyEls.hp, `${fmtInt(enemy.hp)} / ${fmtInt(enemy.max)}`);
    if (!enemy && ui.selectedEnemyId) ui.selectedEnemyId = null;
    // rafraîchissement léger des coûts
    if (me) for (const [btn, cost, extra] of this.costButtons) btn.disabled = me.gold < cost || (extra && extra());
  }

  helpPanel(snap) {
    return h(
      'div.selpanel',
      h('div.subttl', 'Comment jouer'),
      h(
        'div.hint-line',
        h('div', '• Choisissez une tourelle (1-6) puis cliquez sur une case libre.'),
        h('div', '• Cliquez sur une tourelle pour l’améliorer, la spécialiser ou la fusionner.'),
        h('div', `• ${FUSION_COUNT} tourelles identiques (type + niveau) → 1 tourelle de niveau supérieur.`),
        h('div', '• Les tourelles de joueurs différents proches gagnent +10 % de dégâts.'),
        h('div', '• Capacités : E, R, T. Ping : G. Prêt : Espace.'),
        snap.phase === 'prep'
          ? h(
              'div',
              { style: { color: 'var(--accent2)', marginTop: '6px' } },
              'Pendant la préparation, vous pouvez déplacer vos tourelles gratuitement.',
            )
          : null,
      ),
    );
  }

  enemyPanel(e) {
    const d = e.def;
    const cv = h('canvas');
    const hp = h('b');
    this.enemyEls = { hp };
    requestAnimationFrame(() => enemyIcon(cv, d));
    const flags = [];
    if (e.f & 1) flags.push('❄️ Ralenti');
    if (e.f & 2) flags.push('🔥 En feu');
    if (e.f & 4) flags.push('⛨ Armure brisée');
    if (e.f & 8) flags.push('🎯 Marqué');
    return h(
      'div.selpanel',
      h(
        'div.hdr',
        cv,
        h('div', h('div.t', d.name), h('div.s', d.boss ? 'Boss' : d.miniboss ? 'Mini-boss' : d.flying ? 'Volant' : 'Terrestre')),
      ),
      h('div.hint-line', d.desc),
      h(
        'div.statgrid',
        h('div', 'PV', hp),
        h('div', 'Armure', h('b', String(e.ar))),
        h('div', 'Vitesse', h('b', String(d.speed))),
        h('div', 'Dégâts base', h('b', d.damagePct ? `${Math.round(d.damagePct * 100)} %` : String(d.damage))),
      ),
      flags.length ? h('div.hint-line', flags.join(' · ')) : null,
    );
  }

  towerPanel(state, t, ui, me) {
    const a = this.actions;
    const snap = state.snap;
    const def = TOWER_TYPES[t.tt];
    const R = RARITIES[t.r];
    const owners = t.os || [t.o];
    const mine = owners.includes(ui.me);
    const isPrimary = t.o === ui.me;
    const prep = snap.phase === 'prep';
    const cv = h('canvas');
    requestAnimationFrame(() => towerIcon(cv, t.tt, t.l, t.r, t.b, t.o, snap.players[t.o]?.skin || 0));

    const st = t.st;
    const panel = h('div.selpanel');
    panel.append(
      h(
        'div.hdr',
        cv,
        h(
          'div',
          h('div.t', def.name + (t.b ? ` · ${def.branches[t.b].name}` : '')),
          h('div.s', `Niveau ${t.l} — ${LEVELS[t.l].name} `, h('span.rar', { style: { color: R.color } }, R.name)),
          h(
            'div.owners',
            owners.map((o) => h('span.owner-chip', { style: { '--pc': PLAYER_COLORS[o] } }, snap.players[o]?.name || '?')),
          ),
        ),
      ),
    );
    const extra = [];
    if (st.splash) extra.push(h('div', 'Zone', h('b', `${st.splash} px`)));
    if (st.crit) extra.push(h('div', 'Critique', h('b', `${st.crit} %`)));
    if (st.ap) extra.push(h('div', 'Perce-armure', h('b', String(st.ap))));
    if (st.pierce > 1) extra.push(h('div', 'Traverse', h('b', st.pierce > 10 ? 'tous' : `${st.pierce}`)));
    if (st.multi > 1) extra.push(h('div', 'Cibles', h('b', `×${st.multi}`)));
    if (st.chains) extra.push(h('div', 'Rebonds', h('b', String(st.chains))));
    if (st.slow) extra.push(h('div', 'Ralentit', h('b', `${st.slow} %`)));
    if (st.stun) extra.push(h('div', 'Paralyse', h('b', `${st.stun} s`)));
    const bonus = [];
    if (t.lk) bonus.push(`🤝 Lien d’équipe +${Math.round(t.lk * 100)} %`);
    if (t.au) bonus.push(`✨ Aura légendaire +${Math.round(t.au * 100)} %`);
    if (owners.length > 1) bonus.push('🫂 Tourelle partagée +10 %');
    panel.append(
      h(
        'div.statgrid',
        h('div', 'Dégâts', h('b', fmtInt(st.dmg))),
        h('div', 'Cadence', h('b', `${st.rate}/s`)),
        h('div', 'Portée', h('b', `${st.range}`)),
        h('div.dps', 'DPS', h('b', fmtInt(st.dps))),
        extra,
        h('div', 'Éliminations', h('b', fmtInt(t.k))),
        h('div', 'Dégâts infligés', h('b', fmtInt(t.dd))),
      ),
      h(
        'div.hint-line',
        `${st.air ? '✓ Touche les volants' : '✗ Ne touche pas les volants'}${bonus.length ? ' · ' + bonus.join(' · ') : ''}`,
      ),
    );
    if (t.dis) panel.append(h('div.hint-line', { style: { color: 'var(--warn)' } }, '💥 Neutralisée par un piétinement !'));

    // Ciblage
    if (mine) {
      panel.append(
        h('div.subttl', 'Ciblage', h('kbd', 'C')),
        h(
          'div.tm-row',
          TARGET_MODES.map((m) => h(`button${t.tm === m.id ? '.on' : ''}`, { onclick: () => a.target(t.id, m.id) }, m.name)),
        ),
      );
    }

    // Améliorations
    const used = t.up[0] + t.up[1] + t.up[2];
    const slots = upgradeSlots({ level: t.l, rarity: t.r });
    const cost = upgradeCost({ type: t.tt, level: t.l, up: { dmg: t.up[0], rate: t.up[1], range: t.up[2] } });
    const upRow = h('div.upg-row');
    ['dmg', 'rate', 'range'].forEach((k, i) => {
      const U = UPGRADE_STATS[k];
      const full = used >= slots;
      const btn = h(
        'button.upg',
        {
          onclick: () => a.upgrade(t.id, k),
          title: `${U.name} +${Math.round(U.pct * 100)} %${mine ? '' : ' (offert à votre coéquipier)'}`,
        },
        h('span', U.icon),
        h('b', `${U.short} +${Math.round(U.pct * 100)}%`),
        h('span.lv', `×${t.up[i]}`),
        h('span.cost', full ? 'MAX' : `${cost}`),
      );
      btn.disabled = full || (me && me.gold < cost);
      if (!full) this.costButtons.push([btn, cost]);
      upRow.append(btn);
    });
    panel.append(h('div.subttl', mine ? 'Améliorations' : 'Offrir une amélioration', h('span', `${used}/${slots} emplacements`)), upRow);

    // Spécialisation
    if (def.hybrid) {
      panel.append(
        h(
          'div.hint-line',
          { style: { color: 'var(--team)' } },
          `⚗️ Tourelle hybride (${def.role}) : pas de spécialisation, mais des traits uniques.`,
        ),
      );
    } else if (t.l >= BRANCH_LEVEL && !t.b && mine) {
      panel.append(
        h('div.subttl', '⭐ Spécialisation (irréversible)'),
        h(
          'div.branches',
          Object.entries(def.branches).map(([id, br]) =>
            h(
              'button.branch',
              {
                onclick: () => {
                  if (confirm(`Spécialiser en « ${br.name} » ? Ce choix est définitif pour cette tourelle.`)) a.branch(t.id, id);
                },
              },
              h('b', `${id} — ${br.name}`),
              h('span', br.desc),
            ),
          ),
        ),
      );
    } else if (t.l < BRANCH_LEVEL) {
      panel.append(h('div.hint-line', `⭐ Spécialisation débloquée au niveau ${BRANCH_LEVEL}.`));
    }
    if (st.detect) panel.append(h('div.hint-line', '👁️ Détecte les ennemis furtifs à portée (pour toute l’équipe).'));

    // Traits
    panel.append(
      h('div.subttl', 'Évolution'),
      h(
        'div.traits',
        Object.entries(def.traits).map(([lv, tr]) =>
          h(`div.trait${t.l >= +lv ? '.on' : ''}`, `${t.l >= +lv ? '✓' : '🔒'} Niv. ${lv} — `, h('b', tr.name), ` : ${tr.desc}`),
        ),
      ),
    );

    // Fusion
    if (t.l < MAX_LEVEL && mine) {
      const own = [];
      const team = [];
      for (const u of state.towers.values()) {
        if (u.id === t.id || u.tt !== t.tt || u.l !== t.l) continue;
        if (t.b && u.b && t.b !== u.b) continue;
        const uo = u.os || [u.o];
        if (uo.length === 1 && uo[0] === ui.me) own.push(u);
        else team.push(u);
      }
      const need = FUSION_COUNT - 1;
      const cores = me ? me.cores : 0;
      const box = h('div.fusion-box');
      box.append(
        h('div.subttl', `⚡ Fusion → niveau ${t.l + 1}`, h('kbd', 'F')),
        h('div.info', `Compatibles : ${own.length} à vous, ${team.length} chez vos alliés. Il en faut ${need}.`),
      );
      const row = h('div.actions-row');
      const b1 = h('button.btn.small.fuse', { onclick: () => a.fuse(t.id) }, `⚡ Fusionner (${Math.min(own.length, need)}/${need})`);
      b1.disabled = own.length < need;
      row.append(b1);
      const b2 = h(
        'button.btn.small',
        { onclick: () => a.teamFuse(t.id), title: 'Choisir des tourelles d’alliés (leur accord est requis)' },
        '🤝 Fusion d’équipe',
      );
      b2.disabled = own.length + team.length < need && !(cores > 0 && own.length + team.length >= need - 1);
      row.append(b2);
      box.append(row);
      if (cores > 0) {
        const b3 = h(
          'button.btn.small',
          { onclick: () => a.fuse(t.id, { core: true }) },
          `💠 Avec un Noyau (${Math.min(own.length, need - 1)}/${need - 1})`,
        );
        b3.disabled = own.length < need - 1;
        box.append(b3);
      }
      box.append(h('div.hint-line', 'Les améliorations des tourelles fusionnées sont remboursées à 75 %. La rareté peut augmenter !'));
      panel.append(box);
    }

    // Fusion avancée (hybrides)
    if (!def.hybrid && mine) {
      const adv = this.advancedFusion(state, t, ui);
      if (adv) panel.append(adv);
    }

    // Actions
    const acts = h('div.actions-row');
    if (mine) {
      const mv = h('button.btn.small', { onclick: () => a.move(t.id), title: 'Déplacer (préparation uniquement) — M' }, '↔ Déplacer');
      mv.disabled = !prep;
      acts.append(mv);
    }
    if (isPrimary) {
      let v = 0;
      for (const k in t.inv) v += Math.max(0, t.inv[k]);
      acts.append(
        h(
          'button.btn.small.danger',
          {
            onclick: () => {
              if (
                confirm(
                  `Vendre cette tourelle pour ${Math.floor(v * 0.7)} or${owners.length > 1 ? ' (partagés entre les propriétaires)' : ''} ?`,
                )
              )
                a.sell(t.id);
            },
            title: 'Vendre (Suppr)',
          },
          `Vendre +${Math.floor(v * 0.7)}`,
        ),
      );
    }
    if (acts.children.length) panel.append(acts);
    return panel;
  }

  advancedFusion(state, t, ui) {
    const me = { type: t.tt, level: t.l, branch: t.b };
    const recipes = recipesFor(t.tt).filter((r) => !r.aBranch || (r.a === t.tt && r.aBranch === t.b) || r.b === t.tt);
    if (!recipes.length) return null;
    const box = h('div.fusion-box', { style: { borderColor: 'rgba(199, 146, 234, 0.55)', background: 'rgba(199, 146, 234, 0.06)' } });
    box.append(h('div.subttl', '⚗️ Fusion avancée (2 tourelles différentes)'));
    const seen = new Set();
    for (const r of recipes) {
      const partnerType = r.a === t.tt ? r.b : r.a;
      if (seen.has(partnerType + (r.aBranch || ''))) continue;
      const own = [];
      const team = [];
      for (const u of state.towers.values()) {
        if (u.id === t.id || u.tt !== partnerType) continue;
        const rec = findRecipe(me, { type: u.tt, level: u.l, branch: u.b });
        if (!rec || rec.id !== r.id) continue;
        const uo = u.os || [u.o];
        if (uo.length === 1 && uo[0] === ui.me) own.push(u);
        else team.push(u);
      }
      // la recette secrète n'apparaît que si elle est réellement possible
      if (r.secret && !own.length && !team.length && !profile.data.discovered.includes(`recipe-${r.id}`)) continue;
      seen.add(partnerType + (r.aBranch || ''));
      const known = profile.data.discovered.includes(`recipe-${r.id}`);
      const result = known ? TOWER_TYPES[r.result].name : '???';
      const pname =
        TOWER_TYPES[partnerType].name + (r.aBranch && r.a === partnerType ? ` (${TOWER_TYPES[partnerType].branches[r.aBranch].name})` : '');
      const btn = h(
        'button.btn.small',
        {
          title: known ? TOWER_TYPES[r.result].desc : 'Recette encore inconnue : essayez-la !',
          onclick: () =>
            own.length
              ? this.actions.hybrid(t.id, own[0].id)
              : this.actions.teamHybrid(
                  t.id,
                  team.map((u) => u.id),
                ),
        },
        `+ ${pname} niv. ${t.l} → ${result}`,
      );
      btn.disabled = t.l < HYBRID_MIN_LEVEL || (!own.length && !team.length);
      box.append(btn);
    }
    if (!seen.size) return null;
    box.append(
      h(
        'div.hint-line',
        t.l < HYBRID_MIN_LEVEL
          ? `Disponible à partir du niveau ${HYBRID_MIN_LEVEL}, avec une tourelle du même niveau.`
          : 'La tourelle hybride garde le niveau des ingrédients. Celles des alliés demandent leur accord.',
      ),
    );
    return box;
  }

  // ------------------------------------------------------------ Demandes de fusion
  updateFusionRequests(state, ui) {
    const snap = state.snap;
    const locals = this.view.session.humanPids;
    const req = snap.reqs.find((r) => r.need.some((p) => locals.includes(p) && !r.acc.includes(p)));
    const el = this.el.fusionReq;
    if (!req) {
      el.className = 'hidden';
      this.reqKey = '';
      return;
    }
    const target = req.need.find((p) => locals.includes(p) && !req.acc.includes(p));
    const key = `${req.id}|${target}`;
    if (key !== this.reqKey) {
      this.reqKey = key;
      el.className = 'fusion-req';
      const from = snap.players[req.from];
      const def = TOWER_TYPES[req.tt];
      this.reqTimer = h('div.timer');
      clear(el).append(
        h('h4', '⚡ Proposition de fusion'),
        h(
          'p',
          h('b', { style: { color: from.color } }, from.name),
          req.hy
            ? ` propose une fusion avancée : sa tourelle ${def.name} niveau ${req.l} + la vôtre → ${profile.data.discovered.includes(`recipe-${req.hy}`) ? TOWER_TYPES[req.hy].name : 'hybride inconnue'}. `
            : ` propose de fusionner des ${def.name} niveau ${req.l} → niveau ${req.l + 1}. `,
          `La nouvelle tourelle sera partagée (+10 % de dégâts).`,
          locals.length > 1
            ? h('div', { style: { marginTop: '4px', color: 'var(--text)' } }, `Réponse attendue de : ${snap.players[target].name}`)
            : null,
        ),
        this.reqTimer,
        h(
          'div.row',
          h('button.btn.small.success', { onclick: () => this.actions.fuseReply(req.id, true, target) }, '✓ Accepter'),
          h('button.btn.small.danger', { onclick: () => this.actions.fuseReply(req.id, false, target) }, '✗ Refuser'),
          h('button.btn.small.ghost', { onclick: () => this.actions.focusTower(req.primary) }, 'Voir'),
        ),
      );
    }
    this.reqTimer.style.width = `${(100 * req.t) / 20}%`;
  }

  // ------------------------------------------------------------ Notifications
  toast(msg, cls = '') {
    const el = h(`div.toast${cls ? '.' + cls : ''}`, msg);
    this.el.toasts.append(el);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
    setTimeout(() => el.remove(), 2500);
  }

  banner(big, sub, cls = '') {
    if (this.bannerEl) this.bannerEl.remove();
    this.bannerEl = h(`div.banner${cls ? '.' + cls : ''}`, h('div.big', big), sub ? h('div.sub', sub) : null);
    this.overlay.append(this.bannerEl);
    const el = this.bannerEl;
    setTimeout(() => el.remove(), 2700);
  }

  chat(pid, text, sys = false) {
    const snap = this.view.state.snap;
    const p = snap && pid != null ? snap.players[pid] : null;
    const line = sys ? h('div.sys', text) : h('div', h('b', { style: { color: p ? p.color : '#fff' } }, `${p ? p.name : '?'} : `), text);
    this.el.chat.append(line);
    while (this.el.chat.children.length > 5) this.el.chat.firstChild.remove();
  }

  waveSummary(ev, me) {
    const snap = this.view.state.snap;
    const el = this.el.summary;
    el.className = 'wave-summary';
    const rows = ev.players.map((p, i) =>
      h(
        'tr',
        h('td', h('b', { style: { color: snap.players[i]?.color } }, snap.players[i]?.name || '')),
        h('td', `${p.k} élim.`),
        h('td', `${fmtInt(p.d)} dégâts`),
        h('td.gold', `+${p.g} or`),
      ),
    );
    clear(el).append(
      h('h3', `✓ Vague ${ev.w} terminée`),
      h(
        'div.rw',
        h('span', 'Récompense : ', h('b', `+${ev.reward} or`), ' chacun'),
        h('span', { style: { color: 'var(--team)' } }, `+${ev.team} 🤝`),
        ev.perfect
          ? h('span', { style: { color: 'var(--ok)' } }, '★ Base intacte (+25 %)')
          : h('span', { style: { color: 'var(--danger)' } }, `${ev.leaks} fuite(s), −${ev.baseDmg} PV`),
        h('span.muted', `${ev.kills} éliminations en ${fmtDuration(ev.time)}`),
      ),
      h('table', rows),
    );
    clearTimeout(this.summaryT);
    this.summaryT = setTimeout(() => (el.className = 'hidden'), 6000);
    el.onclick = () => (el.className = 'hidden');
  }

  tooltip(text, x, y) {
    const el = this.el.tooltip;
    if (!text) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    if (el._text !== text) {
      el._text = text;
      el.innerHTML = text;
    }
    const w = this.stageInner.clientWidth;
    el.style.left = `${Math.min(x + 14, w - 250)}px`;
    el.style.top = `${y + 14}px`;
  }
}

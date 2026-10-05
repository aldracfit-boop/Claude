// Application : écrans de menu, configuration, salon en ligne, profil, classement.

import { h, clear, fmtInt } from './dom.js';
import { LocalSession, OnlineSession } from './session.js';
import { GameView } from './gameview.js';
import { Net, serverAvailable } from './net.js';
import { audio } from './audio.js';
import { profile, SKINS, LEVEL_REWARDS, xpForLevel, titleFor } from './profile.js';
import { towerIcon, enemyIcon } from './render/sprites.js';
import { DIFFICULTIES, MODES, PLAYER_COLORS, MAX_PLAYERS, FUSION_COUNT } from '../../shared/constants.js';
import { MAPS } from '../../shared/data/maps.js';
import { TOWER_LIST } from '../../shared/data/towers.js';
import { ENEMY_TYPES } from '../../shared/data/enemies.js';
import { SYNERGIES, ABILITIES, COMBOS, TEAM_ITEMS } from '../../shared/data/team.js';

export class App {
  constructor(root) {
    this.root = root;
    this.view = null;
    this.net = null;
    this.lastConfig = null;
    this.setup = {
      difficulty: 'normal',
      mode: 'campaign',
      mapId: 'plaine',
    };
  }

  start() {
    const unlock = () => {
      audio.init();
      audio.setVolumes(profile.settings.music, profile.settings.sfx);
      audio.setMood('menu');
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    const room = new URLSearchParams(location.search).get('room');
    const rejoin = this.rejoinInfo();
    if (rejoin && serverAvailable()) this.tryRejoin(rejoin, () => (room ? this.showOnline(room.toUpperCase()) : this.showMenu()));
    else if (room && serverAvailable()) this.showOnline(room.toUpperCase());
    else this.showMenu();
  }

  rejoinInfo() {
    try {
      const raw = sessionStorage.getItem('tdf_rejoin');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  clearRejoin() {
    try {
      sessionStorage.removeItem('tdf_rejoin');
    } catch {
      /* ignore */
    }
  }

  // Reprise d'une partie en ligne (rechargement de page ou coupure réseau).
  async tryRejoin(info, onFail, attempts = 1) {
    for (let i = 0; i < attempts; i++) {
      try {
        await this.connect();
        this.rejoinFail = () => {
          this.clearRejoin();
          this.leaveNet();
          onFail();
        };
        this.net.send({ t: 'rejoin', code: info.code, token: info.token });
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
      }
    }
    this.clearRejoin();
    onFail();
  }

  screen(...children) {
    if (this.view) {
      this.view.destroy();
      this.view = null;
    }
    clear(this.root);
    const s = h('div.screen', h('div.screen-inner', ...children));
    this.root.append(s);
    return s;
  }

  back(title, onBack = () => this.showMenu()) {
    return h(
      'div.back-row',
      h('button.btn.small', { onclick: () => (audio.play('click'), onBack()) }, '← Retour'),
      h('h2.section-title', title),
    );
  }

  // ------------------------------------------------------------ Menu principal
  showMenu() {
    this.leaveNet();
    const lv = profile.level;
    const xp = profile.data.xp;
    const cur = xp - xpForLevel(lv);
    const need = xpForLevel(lv + 1) - xpForLevel(lv);
    const first = !profile.data.tutorialDone;
    const card = (ic, title, text, onclick, featured) =>
      h(
        `button.menu-card${featured ? '.featured' : ''}`,
        { onclick: () => (audio.play('click'), onclick()) },
        h('div.ic', ic),
        h('h3', title),
        h('p', text),
      );
    this.screen(
      h('div.menu-hero', h('h1.logo', 'TOUR DE FORCE', h('small', 'Tower Defense coopératif'))),
      h(
        'div.menu-grid',
        card('🎓', 'Tutoriel', 'Apprenez les bases pas à pas avec un coéquipier IA.', () => this.startTutorial(), first),
        card('🤖', 'Solo + IA', 'Jouez avec 1 à 3 coéquipiers contrôlés par l’IA.', () => this.showSetup('solo'), !first),
        card('🎮', 'Local', 'Jusqu’à 4 joueurs sur le même écran (Tab pour changer de joueur).', () => this.showSetup('local')),
        card('🌐', 'En ligne', 'Créez un salon et invitez vos amis avec un code.', () => this.showOnline()),
        card('📖', 'Guide', 'Tourelles, fusions, ennemis, combos et synergies.', () => this.showGuide()),
        card('🏆', 'Profil & records', 'Niveau, déblocages, statistiques et classement.', () => this.showProfile()),
      ),
      h(
        'div.profile-strip',
        h('span.lvl-badge', String(lv)),
        h(
          'div',
          h('div', h('b', profile.data.name || 'Joueur'), ` — ${titleFor(lv)}`),
          h('div.xpbar', h('i', { style: { width: `${(100 * cur) / need}%` } })),
        ),
        h('span', `${fmtInt(cur)} / ${fmtInt(need)} XP`),
        profile.data.endlessBest.normal ? h('span', `· Record Infini : vague ${profile.data.endlessBest.normal}`) : null,
      ),
    );
  }

  // ------------------------------------------------------------ Configuration locale
  showSetup(kind) {
    const s = this.setup;
    const myName = profile.data.name || 'Joueur 1';
    if (!this.slots || this.slotsKind !== kind) {
      this.slotsKind = kind;
      this.slots =
        kind === 'solo'
          ? [{ kind: 'human', name: myName }, { kind: 'bot', name: 'IA Artilleur' }, { kind: 'off' }, { kind: 'off' }]
          : [{ kind: 'human', name: myName }, { kind: 'human', name: 'Joueur 2' }, { kind: 'off' }, { kind: 'off' }];
    }
    const render = () => this.showSetup(kind);
    const choice = (list, key) =>
      h(
        'div.choice-grid',
        Object.values(list).map((d) =>
          h(
            `button.choice${s[key] === d.id ? '.active' : ''}`,
            { onclick: () => ((s[key] = d.id), audio.play('click'), render()) },
            h('b', d.name),
            h('span', d.desc),
          ),
        ),
      );
    const botNames = ['IA Artilleur', 'IA Tireur', 'IA Polyvalente', 'IA Nettoyeur'];
    const slotRow = (sl, i) => {
      const opts = i === 0 ? ['human'] : kind === 'solo' ? ['off', 'bot'] : ['off', 'human', 'bot'];
      const labels = { off: 'Vide', human: 'Humain', bot: 'IA' };
      return h(
        'div.slot',
        h('span.dot', { style: { background: sl.kind === 'off' ? '#444' : PLAYER_COLORS[i] } }),
        sl.kind === 'off'
          ? h('span.muted', `Emplacement ${i + 1} libre`)
          : sl.kind === 'bot'
            ? h('span', `🤖 ${botNames[i]}`)
            : h('input', { value: sl.name || `Joueur ${i + 1}`, maxlength: 16, oninput: (e) => (sl.name = e.target.value) }),
        h(
          'div.seg',
          opts.map((o) =>
            h(
              `button${sl.kind === o ? '.on' : ''}`,
              {
                onclick: () => {
                  sl.kind = o;
                  if (o === 'bot') sl.name = botNames[i];
                  if (o === 'human' && !sl.name) sl.name = `Joueur ${i + 1}`;
                  render();
                },
              },
              labels[o],
            ),
          ),
        ),
      );
    };
    const active = this.slots.filter((x) => x.kind !== 'off').length;
    this.screen(
      this.back(kind === 'solo' ? 'Solo avec IA' : 'Local — même écran'),
      h('div.panel', h('h4', 'Mode'), choice(MODES, 'mode')),
      h('div.panel', h('h4', 'Difficulté'), choice(DIFFICULTIES, 'difficulty')),
      h('div.panel', h('h4', 'Carte'), choice(MAPS, 'mapId')),
      h(
        'div.panel',
        h('h4', `Équipe (${active}/${MAX_PLAYERS})`),
        h('div.slots', this.slots.map(slotRow)),
        kind === 'local'
          ? h(
              'p.hint-line',
              { style: { marginTop: '10px' } },
              'Les joueurs humains partagent la souris : appuyez sur Tab (ou cliquez sur une carte joueur) pour changer de joueur actif.',
            )
          : h(
              'p.hint-line',
              { style: { marginTop: '10px' } },
              'Les IA construisent, fusionnent, utilisent leurs capacités et vous proposent parfois des fusions d’équipe.',
            ),
      ),
      h(
        'div.row.end',
        { style: { marginTop: '16px' } },
        h(
          'button.btn.primary.big',
          {
            onclick: () => {
              if (this.slots[0].name) profile.setName(this.slots[0].name.trim().slice(0, 16));
              this.startLocal(this.buildConfig());
            },
          },
          '▶ Lancer la partie',
        ),
      ),
    );
  }

  buildConfig(extra = {}) {
    const perks = profile.perks();
    const players = this.slots
      .filter((x) => x.kind !== 'off')
      .map((x, i) => (x.kind === 'bot' ? { name: x.name, bot: true } : { name: x.name, ...(i === 0 ? perks : {}) }));
    return { ...this.setup, players, seed: Math.floor(Math.random() * 1e9), ...extra };
  }

  startTutorial() {
    const perks = profile.perks();
    this.startLocal(
      {
        difficulty: 'easy',
        mode: 'campaign',
        mapId: 'plaine',
        players: [
          { name: profile.data.name || 'Vous', ...perks },
          { name: 'IA Tireur', bot: true },
        ],
        seed: Math.floor(Math.random() * 1e9),
      },
      { tutorial: true },
    );
  }

  startLocal(config, opts = {}) {
    this.lastConfig = { config, opts };
    const session = new LocalSession(config);
    this.mountGame(session, opts);
  }

  mountGame(session, opts) {
    if (this.view) this.view.destroy();
    clear(this.root);
    this.view = new GameView(this, session, opts);
    this.view.mount(this.root);
  }

  restartGame() {
    if (!this.lastConfig) return this.showMenu();
    const { config, opts } = this.lastConfig;
    this.startLocal({ ...config, seed: Math.floor(Math.random() * 1e9) }, opts);
  }

  exitGame() {
    if (this.view) {
      this.view.destroy();
      this.view = null;
    }
    if (this.net) {
      this.net.send({ t: 'leave' });
      this.leaveNet();
    }
    this.clearRejoin();
    this.showMenu();
  }

  leaveNet() {
    if (this.net) {
      this.net.close();
      this.net = null;
    }
    this.lobby = null;
  }

  // ------------------------------------------------------------ En ligne
  showOnline(prefillCode = '') {
    if (!serverAvailable()) {
      this.screen(
        this.back('En ligne'),
        h(
          'div.panel',
          h('h4', 'Serveur requis'),
          h('p', 'Le mode en ligne nécessite le serveur du jeu. Depuis le dossier du projet :'),
          h('pre', { style: { background: 'var(--bg2)', padding: '12px', borderRadius: '8px' } }, 'npm install\nnpm start'),
          h('p.muted', 'Puis ouvrez http://localhost:3000 et partagez l’adresse (ou le code du salon) avec vos amis sur le même réseau.'),
        ),
      );
      return;
    }
    const name = h('input', { value: profile.data.name || '', placeholder: 'Votre pseudo', maxlength: 16 });
    const code = h('input', {
      value: prefillCode,
      placeholder: 'CODE',
      maxlength: 4,
      style: { textTransform: 'uppercase', width: '110px', letterSpacing: '0.2em', fontWeight: 700 },
    });
    const status = h('p.muted');
    const go = async (create) => {
      const n = name.value.trim() || 'Joueur';
      profile.setName(n);
      status.textContent = 'Connexion…';
      try {
        await this.connect();
      } catch (err) {
        status.textContent = `❌ ${err.message}`;
        return;
      }
      const perks = profile.perks();
      if (create) this.net.send({ t: 'create', name: n, perks });
      else {
        const c = code.value.trim().toUpperCase();
        if (c.length !== 4) {
          status.textContent = 'Entrez un code de salon à 4 lettres.';
          return;
        }
        this.net.send({ t: 'join', code: c, name: n, perks });
      }
    };
    this.screen(
      this.back('En ligne'),
      h('div.panel', h('h4', 'Pseudo'), name),
      h(
        'div.choice-grid',
        { style: { marginTop: '14px' } },
        h(
          'div.panel',
          h('h4', 'Créer un salon'),
          h('p.muted', 'Vous serez l’hôte : choisissez la difficulté, ajoutez des IA et lancez la partie.'),
          h('button.btn.primary', { onclick: () => go(true) }, '＋ Créer'),
        ),
        h(
          'div.panel',
          h('h4', 'Rejoindre'),
          h('p.muted', 'Entrez le code à 4 lettres donné par l’hôte.'),
          h('div.row', code, h('button.btn.success', { onclick: () => go(false) }, 'Rejoindre')),
        ),
      ),
      status,
    );
  }

  async connect() {
    if (this.net && this.net.open) return;
    this.leaveNet();
    const net = new Net();
    await net.connect();
    this.net = net;
    net.on('error', (m) => {
      if (this.rejoinFail) {
        const f = this.rejoinFail;
        this.rejoinFail = null;
        f();
        return;
      }
      if (this.view) this.view.hud.toast(m.m, 'err');
      else alert(m.m);
    });
    net.on('joined', (m) => {
      this.rejoinFail = null;
      this.netPid = m.pid;
      try {
        sessionStorage.setItem('tdf_rejoin', JSON.stringify({ code: m.code, token: m.token }));
      } catch {
        /* ignore */
      }
    });
    net.on('lobby', (m) => {
      this.lobby = m;
      if (!this.view) this.showLobby();
    });
    net.on('start', (m) => {
      this.netPid = m.pid;
      const session = new OnlineSession(this.net, m.pid);
      this.lastConfig = null;
      this.mountGame(session, {
        mapId: m.mapId,
        onBackToLobby: () => {
          this.net.send({ t: 'backToLobby' });
        },
      });
    });
    net.on('toLobby', () => {
      if (this.view) {
        this.view.destroy();
        this.view = null;
      }
      this.showLobby();
    });
    net.on('close', () => {
      const info = this.rejoinInfo();
      if (this.view && info) {
        this.view.hud.toast('Connexion perdue : reconnexion…', 'err');
        this.net = null;
        this.tryRejoin(info, () => this.exitGame(), 5);
      } else if (this.view) {
        this.view.hud.toast('Connexion au serveur perdue.', 'err');
        setTimeout(() => this.exitGame(), 1500);
      } else if (this.lobby) {
        alert('Connexion au serveur perdue.');
        this.showMenu();
      }
    });
  }

  showLobby() {
    const L = this.lobby;
    if (!L) return;
    const host = L.host === L.you;
    const url = `${location.origin}${location.pathname}?room=${L.code}`;
    const settingChoice = (list, key) =>
      h(
        'div.choice-grid',
        Object.values(list).map((d) =>
          h(
            `button.choice${L.settings[key] === d.id ? '.active' : ''}`,
            { disabled: !host, onclick: () => this.net.send({ t: 'settings', [key]: d.id }) },
            h('b', d.name),
            h('span', d.desc),
          ),
        ),
      );
    this.screen(
      this.back('Salon', () => {
        this.net?.send({ t: 'leave' });
        this.leaveNet();
        this.clearRejoin();
        this.showMenu();
      }),
      h(
        'div.panel',
        h(
          'div.row.between',
          h('div', h('h4', 'Code du salon'), h('div.code-big', L.code)),
          h(
            'div.stack',
            h('button.btn.small', { onclick: () => navigator.clipboard?.writeText(url) }, '📋 Copier le lien'),
            h('span.muted', { style: { fontSize: '12px' } }, url),
          ),
        ),
      ),
      h(
        'div.panel',
        h('h4', `Joueurs (${L.players.length}/${MAX_PLAYERS})`),
        h(
          'div.lobby-players',
          L.players.map((p) =>
            h(
              'div.lobby-player',
              h('span.dot', { style: { background: PLAYER_COLORS[p.id] } }),
              h('span.grow', (p.bot ? '🤖 ' : '') + p.name + (p.id === L.you ? ' (vous)' : '')),
              p.id === L.host ? h('span.tag.host', 'Hôte') : null,
              p.bot ? h('span.tag.bot', 'IA') : null,
              !p.bot && !p.connected ? h('span.tag', 'déconnecté') : null,
              host && p.bot ? h('button.btn.small.ghost', { onclick: () => this.net.send({ t: 'removeBot', id: p.id }) }, 'Retirer') : null,
            ),
          ),
        ),
        host && L.players.length < MAX_PLAYERS
          ? h(
              'div.row',
              { style: { marginTop: '10px' } },
              h('button.btn.small', { onclick: () => this.net.send({ t: 'addBot' }) }, '＋ Ajouter une IA'),
            )
          : null,
      ),
      h('div.panel', h('h4', 'Mode'), settingChoice(MODES, 'mode')),
      h('div.panel', h('h4', 'Difficulté'), settingChoice(DIFFICULTIES, 'difficulty')),
      h(
        'div.row.end',
        { style: { marginTop: '16px' } },
        host
          ? h('button.btn.primary.big', { onclick: () => this.net.send({ t: 'start' }) }, '▶ Lancer la partie')
          : h('p.muted', 'En attente du lancement par l’hôte…'),
      ),
    );
  }

  // ------------------------------------------------------------ Profil
  showProfile() {
    const d = profile.data;
    const lv = profile.level;
    const name = h('input', {
      value: d.name,
      placeholder: 'Pseudo',
      maxlength: 16,
      onchange: (e) => profile.setName(e.target.value.trim()),
    });
    const skinRow = h(
      'div.choice-grid',
      SKINS.map((s) => {
        const cv = h('canvas', { style: { width: '44px', height: '44px' } });
        const btn = h(
          `button.choice${d.skin === s.id ? '.active' : ''}`,
          { disabled: lv < s.level, onclick: () => (profile.setSkin(s.id), this.showProfile()) },
          h('div.row', cv, h('div', h('b', s.name), h('span', lv >= s.level ? 'Débloquée' : `Niveau ${s.level}`))),
        );
        requestAnimationFrame(() => towerIcon(cv, 'canon', 3, 2, null, 0, s.id));
        return btn;
      }),
    );
    const diffRows = Object.values(DIFFICULTIES).map((df) =>
      h(
        'tr',
        h('td', df.name),
        h('td', d.bestWave[df.id] ? `${d.bestWave[df.id]} / 20` : '—'),
        h('td', d.endlessBest[df.id] ? `vague ${d.endlessBest[df.id]}` : '—'),
      ),
    );
    const board = d.leaderboard.length
      ? d.leaderboard.map((e, i) =>
          h(
            'tr',
            h('td', ['🥇', '🥈', '🥉'][i] || `${i + 1}.`),
            h('td', e.team.join(', ')),
            h('td', DIFFICULTIES[e.diff]?.name || e.diff),
            h('td', `vague ${e.wave}`),
            h('td', new Date(e.date).toLocaleDateString('fr-FR')),
          ),
        )
      : [h('tr', h('td', { colspan: 5 }, h('span.muted', 'Aucune partie Infini pour l’instant.')))];
    const online = h('div', h('p.muted', serverAvailable() ? 'Chargement…' : 'Classement en ligne indisponible sans serveur.'));
    if (serverAvailable()) {
      fetch('/api/leaderboard')
        .then((r) => r.json())
        .then((list) => {
          clear(online).append(
            list.length
              ? h(
                  'table.stats-table',
                  h('tr', h('th', '#'), h('th', 'Équipe'), h('th', 'Difficulté'), h('th', 'Vague')),
                  list.map((e, i) =>
                    h(
                      'tr',
                      h('td', ['🥇', '🥈', '🥉'][i] || `${i + 1}.`),
                      h('td', e.team.join(', ')),
                      h('td', DIFFICULTIES[e.diff]?.name || e.diff),
                      h('td', `vague ${e.wave}`),
                    ),
                  ),
                )
              : h('p.muted', 'Aucune partie en ligne enregistrée.'),
          );
        })
        .catch(() => clear(online).append(h('p.muted', 'Classement en ligne indisponible.')));
    }
    const s = profile.settings;
    const toggle = (k, label) =>
      h('label.row', h('input', { type: 'checkbox', checked: !!s[k], onchange: (e) => profile.setSetting(k, e.target.checked) }), label);
    this.screen(
      this.back('Profil & records'),
      h(
        'div.panel',
        h(
          'div.row',
          h('span.lvl-badge', String(lv)),
          h('div', h('b', `Niveau ${lv} — ${titleFor(lv)}`), h('div.muted', `${fmtInt(d.xp)} XP au total`)),
          h('div', { style: { flex: 1 } }),
          name,
        ),
      ),
      h(
        'div.panel',
        h('h4', 'Statistiques'),
        h(
          'div.kv',
          h('div', h('b', d.games), h('span', 'Parties')),
          h('div', h('b', d.wins), h('span', 'Victoires')),
          h('div', h('b', fmtInt(d.kills)), h('span', 'Éliminations')),
          h('div', h('b', d.fusions), h('span', 'Fusions')),
          h('div', h('b', d.coopFusions), h('span', 'Fusions d’équipe')),
          h('div', h('b', d.bosses), h('span', 'Boss vaincus')),
          h('div', h('b', d.discovered.length), h('span', 'Découvertes')),
        ),
      ),
      h(
        'div.panel',
        h('h4', 'Records'),
        h('table.stats-table', h('tr', h('th', 'Difficulté'), h('th', 'Campagne'), h('th', 'Infini')), diffRows),
      ),
      h('div.panel', h('h4', 'Classement Infini (cet appareil)'), h('div.table-wrap', h('table.stats-table', board))),
      h('div.panel', h('h4', 'Classement en ligne'), online),
      h('div.panel', h('h4', 'Apparence des tourelles'), skinRow),
      h(
        'div.panel',
        h('h4', 'Déblocages par niveau'),
        h(
          'div.unlock-list',
          LEVEL_REWARDS.map((r) =>
            h(
              `div.unlock${lv >= r.level ? '.on' : ''}`,
              h('span.lv', `Niv. ${r.level}`),
              h('span', r.text),
              lv >= r.level ? h('span.tag.ok', '✓') : null,
            ),
          ),
        ),
      ),
      h(
        'div.panel',
        h('h4', 'Options'),
        h('div.stack', toggle('shake', 'Secousses d’écran'), toggle('damage', 'Afficher les dégâts')),
        h(
          'div.row',
          { style: { marginTop: '12px' } },
          h(
            'button.btn.small.danger',
            {
              onclick: () => {
                if (confirm('Réinitialiser toute la progression ?')) {
                  profile.reset();
                  this.showProfile();
                }
              },
            },
            'Réinitialiser la progression',
          ),
        ),
      ),
    );
  }

  // ------------------------------------------------------------ Guide
  showGuide() {
    const towers = TOWER_LIST.map((def) => {
      const cv = h('canvas', { style: { width: '48px', height: '48px' } });
      requestAnimationFrame(() => towerIcon(cv, def.id, 3, 0, null, 0));
      return h(
        'div.panel',
        h('div.row', cv, h('div', h('b', `${def.name} — ${def.cost} or`), h('div.muted', def.role))),
        h('p', def.desc),
        h('p', h('b', 'Forces : '), def.strengths),
        h('p', h('b', 'Faiblesses : '), def.weaknesses),
        h(
          'p',
          h('b', 'Évolution : '),
          Object.entries(def.traits)
            .map(([lv, t]) => `Niv. ${lv} ${t.name}`)
            .join(' · '),
        ),
        h(
          'p',
          h('b', 'Spécialisations (niv. 3) : '),
          Object.values(def.branches)
            .map((b) => b.name)
            .join(' / '),
        ),
      );
    });
    const enemies = Object.values(ENEMY_TYPES).map((def) => {
      const cv = h('canvas', { style: { width: '36px', height: '36px' } });
      requestAnimationFrame(() => enemyIcon(cv, def));
      return h(
        'div.panel',
        h('div.row', cv, h('b', def.name), def.boss ? h('span.tag.host', 'Boss') : def.miniboss ? h('span.tag', 'Mini-boss') : null),
        h('p', def.desc),
      );
    });
    this.screen(
      this.back('Guide'),
      h(
        'div.panel',
        h('h4', 'Principe'),
        h(
          'p',
          'Défendez la base ensemble contre 20 vagues (ou à l’infini). Chaque joueur a son or, ses tourelles et ses capacités ; la base et le trésor d’équipe sont partagés.',
        ),
        h(
          'p',
          `Phase de préparation : construisez, déplacez, fusionnez. Phase de vague : les tourelles tirent seules, vous intervenez avec vos capacités. Chaque fin de vague rapporte de l’or (+25 % si la base n’a subi aucun dégât).`,
        ),
      ),
      h(
        'div.panel',
        h('h4', 'Fusion — la mécanique centrale'),
        h(
          'p',
          `${FUSION_COUNT} tourelles du même type et du même niveau → 1 tourelle de niveau supérieur (jusqu’au niveau 5). Chaque niveau change le comportement : éclats, double tir, attaques ultimes…`,
        ),
        h(
          'p',
          'Au niveau 3, choisissez une spécialisation définitive. La rareté (Commune → Légendaire) augmente les dégâts et peut monter lors d’une fusion. Un Noyau de fusion (boss, trésor) remplace une tourelle.',
        ),
        h(
          'p',
          'Fusion d’équipe : combinez vos tourelles avec celles d’un allié (son accord est requis). La tourelle obtenue est partagée et gagne +10 % de dégâts.',
        ),
      ),
      h(
        'div.panel',
        h('h4', 'Coopération'),
        h(
          'p',
          '• Lien d’équipe : une tourelle proche (≤ 90 px) d’une tourelle d’un autre joueur gagne +10 % de dégâts (+15 % avec deux alliés).',
        ),
        h('p', '• Combos d’équipe : un statut appliqué par un joueur puis exploité par un autre donne +15 % et un peu d’or aux deux.'),
        h('p', '• Assaut coordonné : si au moins deux joueurs touchent un boss en moins de 3 s, il subit +20 % de dégâts.'),
        h(
          'p',
          '• Les primes sont partagées selon les dégâts infligés. Donnez de l’or, payez les améliorations d’un allié, utilisez le trésor d’équipe.',
        ),
      ),
      h(
        'div.panel',
        h('h4', 'Combos'),
        Object.values(COMBOS).map((c) => h('p', h('b', c.name), ' — ', c.desc)),
      ),
      h(
        'div.panel',
        h('h4', 'Synergies d’équipe'),
        SYNERGIES.map((s) => h('p', `${s.icon} `, h('b', s.name), ' — ', s.desc)),
      ),
      h(
        'div.panel',
        h('h4', 'Capacités'),
        ABILITIES.map((a) => h('p', `${a.icon} `, h('b', `${a.name} [${a.key.toUpperCase()}]`), ` — ${a.desc} Recharge : ${a.cd} s.`)),
      ),
      h(
        'div.panel',
        h('h4', 'Trésor d’équipe'),
        Object.values(TEAM_ITEMS).map((t) => h('p', `${t.icon} `, h('b', t.name), ' — ', t.desc)),
      ),
      h('h3.section-title', { style: { marginTop: '20px' } }, 'Tourelles'),
      h('div.help-grid', towers),
      h('h3.section-title', { style: { marginTop: '20px' } }, 'Ennemis'),
      h('div.help-grid', enemies),
    );
  }
}

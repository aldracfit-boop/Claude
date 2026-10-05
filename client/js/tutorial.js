// Tutoriel progressif : chaque étape se valide par une action réelle du joueur.

import { h, clear } from './dom.js';
import { profile } from './profile.js';

const STEPS = [
  {
    title: 'Placez votre première tourelle',
    text: 'Choisissez une tourelle dans la boutique à droite (ou touches 1 à 4), puis cliquez sur une case libre près du chemin. Le Canon est un bon début !',
    done: (ev, me) => ev.e === 'place' && ev.p === me,
  },
  {
    title: 'Lancez la vague',
    text: 'Cliquez sur « Prêt ! » (ou Espace). Lancer la vague avant la fin du compte à rebours rapporte de l’or bonus. Vos tourelles tirent automatiquement.',
    done: (ev) => ev.e === 'waveStart',
  },
  {
    title: 'Éliminez les ennemis',
    text: 'Chaque ennemi éliminé rapporte de l’or, partagé selon les dégâts infligés par chacun. Si un ennemi atteint la base, elle perd des PV.',
    done: (ev, me, t) => ev.e === 'die' && ++t.kills >= 5,
  },
  {
    title: 'Améliorez une tourelle',
    text: 'Cliquez sur une de vos tourelles, puis achetez DÉG, CAD ou POR. Les emplacements sont limités : choisissez bien !',
    done: (ev, me) => ev.e === 'upgrade' && ev.p === me,
  },
  {
    title: 'Fusionnez trois tourelles',
    text: 'Le cœur du jeu ! Placez 3 tourelles du même type et du même niveau, sélectionnez-en une et cliquez sur « ⚡ Fusionner » (ou F). Elle passe au niveau supérieur et gagne de nouveaux pouvoirs.',
    done: (ev, me) => ev.e === 'fusion' && (ev.own || []).includes(me),
  },
  {
    title: 'Utilisez vos capacités',
    text: 'Pendant une vague : E = Frappe aérienne (cliquez sur une zone), R = Gel, T = Surcharge. Elles ont un temps de recharge.',
    done: (ev, me) => ev.e === 'ability' && ev.p === me,
  },
  {
    title: 'Préparez-vous au boss',
    text: 'À la vague 10, Le Colosse arrive : ses piétinements neutralisent les tourelles proches. Gardez de la puissance de feu à distance (Snipers) et le Gel en réserve.',
    manual: true,
  },
  {
    title: 'Coopérez avec votre équipe',
    text: 'Ping : G + clic. Messages rapides en bas. Tourelles proches de celles d’un allié : +10 % de dégâts. Fusion d’équipe : combinez vos tourelles avec les siennes (accord requis).',
    done: (ev, me) => (ev.e === 'ping' || ev.e === 'chat') && ev.p === me,
  },
];

export class Tutorial {
  constructor(overlay, getMe) {
    this.overlay = overlay;
    this.getMe = getMe;
    this.i = 0;
    this.track = { kills: 0 };
    this.el = h('div.tutorial');
    overlay.append(this.el);
    this.render();
  }

  render() {
    const s = STEPS[this.i];
    if (!s) {
      clear(this.el).append(
        h('div.step', 'Tutoriel terminé'),
        h('h4', 'Bravo, vous êtes prêt !'),
        h('p', 'Vous connaissez les bases. Terminez la partie, puis essayez le mode Normal avec des amis en ligne.'),
        h('button.btn.small.primary', { onclick: () => this.close() }, 'Fermer'),
      );
      profile.data.tutorialDone = true;
      profile.save();
      return;
    }
    clear(this.el).append(
      h('div.step', `Étape ${this.i + 1} / ${STEPS.length}`),
      h('h4', s.title),
      h('p', s.text),
      h(
        'div.row',
        s.manual ? h('button.btn.small.primary', { onclick: () => this.next() }, 'Compris !') : null,
        h('button.btn.small.ghost', { onclick: () => this.skip() }, 'Passer le tutoriel'),
      ),
    );
  }

  onEvent(ev) {
    const s = STEPS[this.i];
    if (!s || s.manual || !s.done) return;
    if (s.done(ev, this.getMe(), this.track)) this.next();
  }

  next() {
    this.i++;
    this.render();
  }

  skip() {
    profile.data.tutorialDone = true;
    profile.save();
    this.close();
  }

  close() {
    this.el.remove();
    this.closed = true;
  }
}

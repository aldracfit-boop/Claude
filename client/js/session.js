// Sessions de jeu : locale (simulation dans le navigateur) ou en ligne (serveur autoritaire).
// Les deux exposent la même interface : send(cmd, pid?), update(dt) -> snapshot|null,
// humanPids, activePid, isLocal.

import { Game } from '../../shared/game/Game.js';
import { BotBrain } from '../../shared/game/bot.js';
import { DT } from '../../shared/constants.js';

export class LocalSession {
  constructor(config) {
    this.config = config;
    this.isLocal = true;
    this.game = new Game({
      seed: config.seed,
      difficulty: config.difficulty,
      mode: config.mode,
      mapId: config.mapId,
      sharedScreen: config.players.filter((p) => !p.bot).length > 1,
      players: config.players,
    });
    this.bots = this.game.players.filter((p) => p.bot).map((p) => new BotBrain(this.game, p.id, { proposeToHumans: true }));
    this.humanPids = this.game.players.filter((p) => !p.bot).map((p) => p.id);
    this.activePid = this.humanPids[0] ?? 0;
    this.acc = 0;
    this.paused = false;
    this.lastTv = -1;
  }

  get hotSeat() {
    return this.humanPids.length > 1;
  }

  send(cmd, pid = this.activePid) {
    this.game.command(pid, cmd);
  }

  setActive(pid) {
    if (this.humanPids.includes(pid)) this.activePid = pid;
  }

  cycleActive() {
    if (!this.hotSeat) return;
    const i = this.humanPids.indexOf(this.activePid);
    this.activePid = this.humanPids[(i + 1) % this.humanPids.length];
  }

  setPaused(p) {
    this.paused = p;
  }

  update(realDt) {
    if (this.paused) return null;
    this.acc += Math.min(realDt, 0.25) * this.game.speed;
    let steps = 0;
    while (this.acc >= DT && steps < 8) {
      for (const b of this.bots) b.update(DT);
      this.game.step(DT);
      this.acc -= DT;
      steps++;
    }
    if (!steps) return null;
    const withTowers = this.game.towersVersion !== this.lastTv;
    const snap = this.game.snapshot(withTowers);
    if (withTowers) this.lastTv = snap.tv;
    snap.dt = (steps * DT) / this.game.speed;
    return snap;
  }

  destroy() {}
}

// Session en ligne : le serveur fait tourner la simulation, on reçoit des instantanés.
export class OnlineSession {
  constructor(net, pid) {
    this.net = net;
    this.isLocal = false;
    this.pid = pid;
    this.activePid = pid;
    this.humanPids = [pid];
    this.queue = [];
    this.paused = false;
    this.offSnap = net.on('snap', (snap) => this.queue.push(snap));
  }

  get hotSeat() {
    return false;
  }

  send(cmd) {
    this.net.send({ t: 'cmd', c: cmd });
  }

  setActive() {}
  cycleActive() {}
  setPaused() {}

  update() {
    if (!this.queue.length) return null;
    // On applique tous les instantanés en attente (les événements sont cumulés).
    const last = this.queue[this.queue.length - 1];
    if (this.queue.length > 1) {
      const events = [];
      let towers = null;
      for (const s of this.queue) {
        events.push(...(s.events || []));
        if (s.towers) towers = s.towers;
      }
      last.events = events;
      if (towers && !last.towers) last.towers = towers;
    }
    this.queue.length = 0;
    return last;
  }

  destroy() {
    this.offSnap();
  }
}

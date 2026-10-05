// Salons multijoueurs : lobby, IA, lancement, boucle de simulation autoritaire,
// diffusion des instantanés, reconnexion et pilote automatique en cas de déconnexion.

import crypto from 'node:crypto';
import { Game } from '../shared/game/Game.js';
import { BotBrain } from '../shared/game/bot.js';
import { DT, TICK_RATE, MAX_PLAYERS, DIFFICULTIES, MODES, PHASE } from '../shared/constants.js';
import { MAPS } from '../shared/data/maps.js';
import { sanitizeName, clamp } from '../shared/util.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const BOT_NAMES = ['IA Artilleur', 'IA Tireur', 'IA Polyvalente', 'IA Nettoyeur'];
const SNAP_EVERY = 2; // instantané tous les 2 ticks -> 15 Hz
const EMPTY_ROOM_TTL = 60_000;
const MAX_ROOMS = 200;

export class RoomManager {
  constructor({ leaderboard, log = () => {} } = {}) {
    this.rooms = new Map();
    this.leaderboard = leaderboard;
    this.log = log;
  }

  newCode() {
    for (let i = 0; i < 1000; i++) {
      let c = '';
      for (let k = 0; k < 4; k++) c += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
      if (!this.rooms.has(c)) return c;
    }
    return null;
  }

  create(conn, name, perks) {
    if (this.rooms.size >= MAX_ROOMS) return conn.error('Trop de salons ouverts, réessayez plus tard.');
    const code = this.newCode();
    if (!code) return conn.error('Impossible de créer un salon.');
    const room = new Room(this, code);
    this.rooms.set(code, room);
    this.log(`salon ${code} créé`);
    room.join(conn, name, perks);
  }

  join(conn, code, name, perks) {
    const room = this.rooms.get(String(code || '').toUpperCase());
    if (!room) return conn.error('Salon introuvable. Vérifiez le code.');
    room.join(conn, name, perks);
  }

  rejoin(conn, code, token) {
    const room = this.rooms.get(String(code || '').toUpperCase());
    if (!room) return conn.error('Ce salon n’existe plus.');
    room.rejoin(conn, token);
  }

  remove(room) {
    room.stopLoop();
    this.rooms.delete(room.code);
    this.log(`salon ${room.code} fermé`);
  }
}

class Room {
  constructor(manager, code) {
    this.manager = manager;
    this.code = code;
    this.players = []; // { name, bot, conn, token, connected, perks }
    this.hostIdx = 0;
    this.settings = { difficulty: 'normal', mode: 'campaign', mapId: 'plaine' };
    this.state = 'lobby';
    this.game = null;
    this.brains = new Map();
    this.loop = null;
    this.emptySince = null;
  }

  get humans() {
    return this.players.filter((p) => !p.bot);
  }

  pidOf(conn) {
    return this.players.findIndex((p) => p.conn === conn);
  }

  join(conn, name, perks) {
    if (conn.room) conn.room.leave(conn);
    if (this.state !== 'lobby') return conn.error('La partie a déjà commencé.');
    if (this.players.length >= MAX_PLAYERS) return conn.error('Le salon est complet (4 joueurs).');
    const token = crypto.randomBytes(12).toString('hex');
    const p = { name: sanitizeName(name), bot: false, conn, token, connected: true, perks: sanitizePerks(perks) };
    this.players.push(p);
    conn.room = this;
    this.emptySince = null;
    conn.send({ t: 'joined', code: this.code, pid: this.players.length - 1, token });
    this.broadcastLobby();
  }

  rejoin(conn, token) {
    const p = this.players.find((x) => !x.bot && x.token === token);
    if (!p) return conn.error('Impossible de rejoindre ce salon.');
    if (conn.room && conn.room !== this) conn.room.leave(conn);
    if (p.conn && p.conn !== conn) p.conn.room = null;
    p.conn = conn;
    p.connected = true;
    conn.room = this;
    this.emptySince = null;
    const pid = this.players.indexOf(p);
    conn.send({ t: 'joined', code: this.code, pid, token });
    if (this.state === 'lobby') this.broadcastLobby();
    else {
      this.game.setConnected(pid, true);
      this.game.players[pid].autopilot = false;
      this.brains.delete(pid);
      this.game.updateSpeed();
      conn.send({ t: 'start', mapId: this.settings.mapId, pid });
      this.forceTowers = true;
    }
  }

  leave(conn) {
    const pid = this.pidOf(conn);
    conn.room = null;
    if (pid < 0) return;
    const p = this.players[pid];
    if (this.state === 'lobby') {
      this.players.splice(pid, 1);
      if (this.hostIdx === pid || !this.players[this.hostIdx] || this.players[this.hostIdx].bot) {
        this.hostIdx = Math.max(
          0,
          this.players.findIndex((x) => !x.bot),
        );
      } else if (this.hostIdx > pid) this.hostIdx--;
      // réindexation : chaque client connaît son nouvel identifiant via le message de lobby
    } else {
      p.connected = false;
      p.conn = null;
      if (this.game && this.game.players[pid]) {
        this.game.setConnected(pid, false);
        this.game.players[pid].autopilot = true;
        this.brains.set(pid, new BotBrain(this.game, pid, { proposeToHumans: false }));
        this.game.updateSpeed();
      }
      if (pid === this.hostIdx) {
        const next = this.players.findIndex((x) => !x.bot && x.connected);
        if (next >= 0) this.hostIdx = next;
      }
    }
    if (!this.humans.some((x) => x.connected)) {
      if (this.state !== 'game') this.manager.remove(this);
      else this.emptySince = Date.now();
      return;
    }
    if (this.state === 'lobby') this.broadcastLobby();
  }

  isHost(conn) {
    return this.pidOf(conn) === this.hostIdx;
  }

  lobbyState(pid) {
    return {
      t: 'lobby',
      code: this.code,
      you: pid,
      host: this.hostIdx,
      state: this.state,
      settings: this.settings,
      players: this.players.map((p, i) => ({ id: i, name: p.name, bot: p.bot, connected: p.bot || p.connected })),
    };
  }

  broadcastLobby() {
    this.players.forEach((p, i) => {
      if (p.conn) p.conn.send(this.lobbyState(i));
    });
  }

  handle(conn, msg) {
    const pid = this.pidOf(conn);
    if (pid < 0) return;
    switch (msg.t) {
      case 'cmd':
        if (this.state === 'game' && this.game) this.game.command(pid, msg.c);
        break;
      case 'settings':
        if (!this.isHost(conn) || this.state !== 'lobby') return;
        if (DIFFICULTIES[msg.difficulty]) this.settings.difficulty = msg.difficulty;
        if (MODES[msg.mode]) this.settings.mode = msg.mode;
        if (MAPS[msg.mapId]) this.settings.mapId = msg.mapId;
        this.broadcastLobby();
        break;
      case 'addBot':
        if (!this.isHost(conn) || this.state !== 'lobby' || this.players.length >= MAX_PLAYERS) return;
        this.players.push({ name: BOT_NAMES[this.players.length % BOT_NAMES.length], bot: true, conn: null, connected: true, perks: {} });
        this.broadcastLobby();
        break;
      case 'removeBot': {
        if (!this.isHost(conn) || this.state !== 'lobby') return;
        const i = msg.id | 0;
        if (this.players[i] && this.players[i].bot) {
          this.players.splice(i, 1);
          if (this.hostIdx > i) this.hostIdx--;
          this.broadcastLobby();
        }
        break;
      }
      case 'start':
        if (!this.isHost(conn) || this.state !== 'lobby') return;
        this.startGame();
        break;
      case 'backToLobby':
        if (!this.isHost(conn) || this.state !== 'ended') return;
        this.toLobby();
        break;
      case 'leave':
        this.leave(conn);
        break;
      default:
        break;
    }
  }

  startGame() {
    // les joueurs déconnectés pendant le lobby ont déjà été retirés
    this.state = 'game';
    this.game = new Game({
      seed: crypto.randomInt(2 ** 31),
      difficulty: this.settings.difficulty,
      mode: this.settings.mode,
      mapId: this.settings.mapId,
      players: this.players.map((p) => ({ name: p.name, bot: p.bot, ...p.perks })),
    });
    this.brains.clear();
    this.players.forEach((p, i) => {
      if (p.bot) this.brains.set(i, new BotBrain(this.game, i, { proposeToHumans: true }));
    });
    this.players.forEach((p, i) => {
      if (p.conn) p.conn.send({ t: 'start', mapId: this.settings.mapId, pid: i });
    });
    this.forceTowers = true;
    this.lastTv = -1;
    this.tickCount = 0;
    this.recorded = false;
    this.manager.log(
      `salon ${this.code} : partie lancée (${this.players.length} joueurs, ${this.settings.difficulty}, ${this.settings.mode})`,
    );
    this.startLoop();
  }

  toLobby() {
    this.stopLoop();
    this.state = 'lobby';
    this.game = null;
    this.brains.clear();
    this.players = this.players.filter((p) => p.bot || p.connected);
    this.hostIdx = Math.max(
      0,
      this.players.findIndex((p) => !p.bot),
    );
    this.players.forEach((p) => p.conn && p.conn.send({ t: 'toLobby' }));
    this.broadcastLobby();
  }

  startLoop() {
    this.stopLoop();
    let last = Date.now();
    let acc = 0;
    this.loop = setInterval(() => {
      const now = Date.now();
      acc += Math.min(250, now - last) / 1000;
      last = now;
      while (acc >= DT) {
        acc -= DT;
        this.tick();
      }
    }, 1000 / TICK_RATE);
  }

  stopLoop() {
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
  }

  tick() {
    const g = this.game;
    if (!g) return;
    if (this.emptySince && Date.now() - this.emptySince > EMPTY_ROOM_TTL) {
      this.manager.remove(this);
      return;
    }
    for (let s = 0; s < g.speed; s++) {
      for (const b of this.brains.values()) b.update(DT);
      g.step(DT);
    }
    this.tickCount++;
    if (this.tickCount % SNAP_EVERY === 0) this.broadcastSnapshot();
    if ((g.phase === PHASE.VICTORY || g.phase === PHASE.DEFEAT) && !this.recorded) {
      this.recorded = true;
      this.broadcastSnapshot();
      this.state = 'ended';
      this.recordResult(g.result);
      this.stopLoop();
    }
  }

  broadcastSnapshot() {
    const g = this.game;
    const withTowers = this.forceTowers || g.towersVersion !== this.lastTv;
    const snap = g.snapshot(withTowers);
    if (withTowers) {
      this.lastTv = snap.tv;
      this.forceTowers = false;
    }
    snap.t = 'snap';
    const data = JSON.stringify(snap);
    for (const p of this.players) if (p.conn) p.conn.sendRaw(data);
  }

  recordResult(result) {
    if (!result || !this.manager.leaderboard) return;
    if (result.mode === 'endless' || result.victory) {
      this.manager.leaderboard.add({
        wave: result.wave,
        diff: result.difficulty,
        mode: result.mode,
        team: result.players.map((p) => (p.bot ? `🤖 ${p.name}` : p.name)),
        date: Date.now(),
      });
    }
  }
}

function sanitizePerks(perks) {
  const p = perks && typeof perks === 'object' ? perks : {};
  return {
    startBonus: clamp(Number(p.startBonus) || 0, 0, 0.1),
    startCore: !!p.startCore,
    skin: clamp(p.skin | 0, 0, 5),
  };
}

#!/usr/bin/env node
// Simulateur d'équilibrage : fait jouer des équipes d'IA sans interface.
// Usage : node tools/simulate.js [--runs 10] [--players 2] [--difficulty normal] [--mode campaign] [--verbose]

import { Game } from '../shared/game/Game.js';
import { BotBrain } from '../shared/game/bot.js';
import { DT, PHASE } from '../shared/constants.js';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const runs = +opt('runs', 8);
const nPlayers = +opt('players', 2);
const difficulties = opt('difficulty', 'normal').split(',');
const mode = opt('mode', 'campaign');
const verbose = args.includes('--verbose');
const skill = +opt('skill', 1);
const maxWave = +opt('max-wave', 200);
const hpTune = +opt('hp', 1);
const goldTune = +opt('gold', 1);

export function runGame({ seed, difficulty, players, mode, skill = 1, verbose = false, tuning }) {
  const game = new Game({
    seed,
    difficulty,
    mode,
    tuning,
    players: Array.from({ length: players }, (_, i) => ({ name: `IA ${i + 1}`, bot: true })),
  });
  const bots = game.players.map((p) => new BotBrain(game, p.id, { skill }));
  let ticks = 0;
  const t0 = Date.now();
  let maxEnemies = 0;
  while (game.phase !== PHASE.VICTORY && game.phase !== PHASE.DEFEAT && ticks < 30 * 60 * 120) {
    for (const b of bots) b.update(DT);
    game.step(DT);
    ticks++;
    if (game.enemies.length > maxEnemies) maxEnemies = game.enemies.length;
    for (const ev of game.drainEvents()) {
      if (verbose && ev.e === 'waveEnd') {
        const towers = game.towers.map((t) => `${{ canon: 'C', mg: 'G', sniper: 'S', mortar: 'M' }[t.type]}${t.level}`).join(' ');
        console.log(
          `  vague ${String(ev.w).padStart(2)} | base ${String(Math.round(game.base.hp)).padStart(5)} | fuites ${String(ev.leaks).padStart(2)} | ` +
            `or ${game.players.map((p) => Math.round(p.gold)).join('/')} | trésor ${String(Math.round(game.teamGold)).padStart(4)} | ` +
            `DPS ${String(Math.round(game.towers.reduce((a, t) => a + (t.stats ? t.stats.dps : 0), 0))).padStart(6)} | PV vague ${String(ev.hpTotal).padStart(7)} | ${towers}`,
        );
      }
      if (verbose && (ev.e === 'bossDown' || ev.e === 'bossPhase')) console.log('   ', ev.e, ev.n, ev.ph || '');
    }
    if (game.wave > maxWave) break;
  }
  return {
    victory: game.phase === PHASE.VICTORY,
    wave: game.wave,
    hp: Math.round(game.base.hp),
    hpPct: game.base.hp / game.base.maxHp,
    ms: Date.now() - t0,
    ticks,
    maxEnemies,
    towers: game.towers.length,
    fusions: game.players.reduce((a, p) => a + p.stats.fusions, 0),
    coop: game.players.reduce((a, p) => a + p.stats.coopFusions, 0),
    combos: game.players.reduce((a, p) => a + p.stats.combos, 0),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const difficulty of difficulties) {
    const results = [];
    for (let i = 0; i < runs; i++) {
      const r = runGame({ seed: 1000 + i * 77, difficulty, players: nPlayers, mode, skill, verbose, tuning: { hp: hpTune, gold: goldTune } });
      results.push(r);
      console.log(
        `[${difficulty}] partie ${i + 1}: ${r.victory ? 'VICTOIRE' : 'défaite'} vague ${r.wave} base ${r.hp} ` +
          `(${r.towers} tourelles, ${r.fusions} fusions dont ${r.coop} coop, ${r.combos} combos, max ${r.maxEnemies} ennemis, ${r.ms} ms)`,
      );
    }
    const wins = results.filter((r) => r.victory).length;
    const avgWave = results.reduce((a, r) => a + r.wave, 0) / results.length;
    const avgHp = results.reduce((a, r) => a + r.hpPct, 0) / results.length;
    console.log(`==> ${difficulty} / ${nPlayers} joueurs : ${wins}/${runs} victoires, vague moyenne ${avgWave.toFixed(1)}, base restante moyenne ${Math.round(avgHp * 100)} %\n`);
  }
}

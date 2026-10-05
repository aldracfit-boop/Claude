import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, CELL } from '../shared/game/Game.js';
import { BotBrain } from '../shared/game/bot.js';
import { DT, PHASE, COLS, ROWS } from '../shared/constants.js';
import { TOWER_TYPES } from '../shared/data/towers.js';
import { upgradeCost, upgradeSlots, sellValue } from '../shared/game/stats.js';

function newGame(opts = {}) {
  return new Game({ seed: 123, players: [{ name: 'A' }, { name: 'B' }], ...opts });
}

function freeTiles(g, n) {
  const out = [];
  for (let r = 0; r < ROWS && out.length < n; r++) {
    for (let c = 0; c < COLS && out.length < n; c++) if (g.isBuildable(c, r)) out.push([c, r]);
  }
  return out;
}

function run(g, cmds) {
  for (const [pid, c] of cmds) g.command(pid, c);
  g.step(DT);
  return g.drainEvents();
}

function place(g, pid, tt, tile) {
  run(g, [[pid, { a: 'place', tt, c: tile[0], r: tile[1] }]]);
  return g.towers[g.towers.length - 1];
}

test('placement : coût, case invalide, or insuffisant', () => {
  const g = newGame();
  const [t1] = freeTiles(g, 1);
  const gold = g.players[0].gold;
  const t = place(g, 0, 'canon', t1);
  assert.equal(t.type, 'canon');
  assert.equal(g.players[0].gold, gold - TOWER_TYPES.canon.cost);
  // case occupée
  let ev = run(g, [[1, { a: 'place', tt: 'canon', c: t1[0], r: t1[1] }]]);
  assert.ok(ev.some((e) => e.e === 'err' && e.p === 1));
  // case de chemin
  let pathTile = null;
  for (let i = 0; i < g.grid.length; i++)
    if (g.grid[i] === CELL.PATH) {
      pathTile = [i % COLS, (i / COLS) | 0];
      break;
    }
  ev = run(g, [[0, { a: 'place', tt: 'canon', c: pathTile[0], r: pathTile[1] }]]);
  assert.ok(ev.some((e) => e.e === 'err'));
  // or insuffisant
  g.players[1].gold = 10;
  const [t2] = freeTiles(g, 1);
  ev = run(g, [[1, { a: 'place', tt: 'sniper', c: t2[0], r: t2[1] }]]);
  assert.ok(ev.some((e) => e.e === 'err' && /or/.test(e.m)));
});

test('fusion : 3 tourelles identiques donnent une tourelle de niveau 2', () => {
  const g = newGame();
  g.players[0].gold = 10000;
  const tiles = freeTiles(g, 3);
  const ts = tiles.map((tl) => place(g, 0, 'mg', tl));
  const ev = run(g, [[0, { a: 'fuse', id: ts[0].id }]]);
  const fusion = ev.find((e) => e.e === 'fusion');
  assert.ok(fusion, 'un événement de fusion est émis');
  assert.equal(g.towers.length, 1);
  assert.equal(g.towers[0].level, 2);
  assert.equal(g.towers[0].id, ts[0].id);
  assert.equal(g.towers[0].invested[0], 3 * TOWER_TYPES.mg.cost);
  // les cases libérées redeviennent constructibles
  assert.ok(g.isBuildable(tiles[1][0], tiles[1][1]));
});

test('fusion : types ou niveaux différents refusés', () => {
  const g = newGame();
  g.players[0].gold = 10000;
  const tiles = freeTiles(g, 3);
  const a = place(g, 0, 'mg', tiles[0]);
  const b = place(g, 0, 'canon', tiles[1]);
  const c = place(g, 0, 'mg', tiles[2]);
  const ev = run(g, [[0, { a: 'fuse', id: a.id, partners: [b.id, c.id] }]]);
  assert.ok(ev.some((e) => e.e === 'err'));
  assert.equal(g.towers.length, 3);
});

test('fusion avec Noyau : 2 tourelles suffisent', () => {
  const g = newGame();
  g.players[0].gold = 10000;
  g.players[0].cores = 1;
  const tiles = freeTiles(g, 2);
  const a = place(g, 0, 'sniper', tiles[0]);
  const b = place(g, 0, 'sniper', tiles[1]);
  run(g, [[0, { a: 'fuse', id: a.id, partners: [b.id], core: true }]]);
  assert.equal(g.towers.length, 1);
  assert.equal(g.towers[0].level, 2);
  assert.equal(g.players[0].cores, 0);
});

test('fusion entre joueurs : nécessite l’accord, refus et acceptation', () => {
  const g = newGame();
  g.players[0].gold = 10000;
  g.players[1].gold = 10000;
  const tiles = freeTiles(g, 6);
  const a = place(g, 0, 'canon', tiles[0]);
  const b = place(g, 0, 'canon', tiles[1]);
  const c = place(g, 1, 'canon', tiles[2]);
  let ev = run(g, [[0, { a: 'fuse', id: a.id, partners: [b.id, c.id] }]]);
  const req = ev.find((e) => e.e === 'fuseReq');
  assert.ok(req, 'une demande est créée');
  assert.deepEqual(req.to, [1]);
  assert.equal(g.towers.length, 3, 'aucune fusion sans accord');
  // refus
  ev = run(g, [[1, { a: 'fuseReply', id: req.id, ok: false }]]);
  assert.ok(ev.some((e) => e.e === 'fuseRes' && e.ok === 0));
  assert.equal(g.towers.length, 3);
  // nouvelle demande puis acceptation
  ev = run(g, [[0, { a: 'fuse', id: a.id, partners: [b.id, c.id] }]]);
  const req2 = ev.find((e) => e.e === 'fuseReq');
  // un tiers ne peut pas accepter à la place du propriétaire
  run(g, [[0, { a: 'fuseReply', id: req2.id, ok: true }]]);
  assert.equal(g.towers.length, 3);
  ev = run(g, [[1, { a: 'fuseReply', id: req2.id, ok: true }]]);
  const f = ev.find((e) => e.e === 'fusion');
  assert.ok(f && f.coop === 1);
  assert.equal(g.towers.length, 1);
  assert.deepEqual(g.towers[0].owners.sort(), [0, 1]);
  assert.ok(g.towers[0].stats.dmgBonus >= 0.1, 'bonus de tourelle partagée');
});

test('demande de fusion expirée', () => {
  const g = newGame();
  g.players[0].gold = 10000;
  g.players[1].gold = 10000;
  const tiles = freeTiles(g, 3);
  const a = place(g, 0, 'canon', tiles[0]);
  const b = place(g, 0, 'canon', tiles[1]);
  const c = place(g, 1, 'canon', tiles[2]);
  run(g, [[0, { a: 'fuse', id: a.id, partners: [b.id, c.id] }]]);
  let expired = false;
  for (let i = 0; i < 30 * 25; i++) {
    g.step(DT);
    if (g.drainEvents().some((e) => e.e === 'fuseRes' && /expir/.test(e.msg || ''))) expired = true;
  }
  assert.ok(expired);
  assert.equal(g.fusionRequests.length, 0);
});

test('améliorations : emplacements limités, coût croissant, remboursement à la fusion', () => {
  const g = newGame();
  g.players[0].gold = 100000;
  const tiles = freeTiles(g, 3);
  const a = place(g, 0, 'canon', tiles[0]);
  const slots = upgradeSlots(a);
  const c1 = upgradeCost(a);
  run(g, [[0, { a: 'upgrade', id: a.id, s: 'dmg' }]]);
  const c2 = upgradeCost(a);
  assert.ok(c2 > c1, 'le coût augmente');
  for (let i = 1; i < slots; i++) run(g, [[0, { a: 'upgrade', id: a.id, s: 'range' }]]);
  const ev = run(g, [[0, { a: 'upgrade', id: a.id, s: 'rate' }]]);
  assert.ok(
    ev.some((e) => e.e === 'err'),
    'plus d’emplacement',
  );
  const spent = a.upSpend[0];
  const before = g.players[0].gold;
  const b = place(g, 0, 'canon', tiles[1]);
  const c = place(g, 0, 'canon', tiles[2]);
  const afterPlace = g.players[0].gold;
  assert.equal(before - afterPlace, 2 * TOWER_TYPES.canon.cost);
  run(g, [[0, { a: 'fuse', id: a.id, partners: [b.id, c.id] }]]);
  assert.ok(Math.abs(g.players[0].gold - afterPlace - spent * 0.75) < 1e-6);
  assert.equal(g.towers[0].up.dmg, 0);
});

test('un allié peut payer l’amélioration de ma tourelle', () => {
  const g = newGame();
  const [tl] = freeTiles(g, 1);
  const a = place(g, 0, 'canon', tl);
  g.players[1].gold = 1000;
  const ev = run(g, [[1, { a: 'upgrade', id: a.id, s: 'dmg' }]]);
  assert.ok(ev.some((e) => e.e === 'upgrade' && e.gift === 1));
  assert.equal(a.up.dmg, 1);
  // mais il ne peut pas la vendre
  const ev2 = run(g, [[1, { a: 'sell', id: a.id }]]);
  assert.ok(ev2.some((e) => e.e === 'err'));
});

test('vente : 70 % de l’investissement', () => {
  const g = newGame();
  const [tl] = freeTiles(g, 1);
  const a = place(g, 0, 'sniper', tl);
  const gold = g.players[0].gold;
  const expected = sellValue(a);
  run(g, [[0, { a: 'sell', id: a.id }]]);
  assert.equal(g.towers.length, 0);
  assert.ok(Math.abs(g.players[0].gold - gold - expected) < 1);
});

test('spécialisation : niveau 3 requis et irréversible', () => {
  const g = newGame();
  const [tl] = freeTiles(g, 1);
  const a = place(g, 0, 'mortar', tl);
  let ev = run(g, [[0, { a: 'branch', id: a.id, b: 'A' }]]);
  assert.ok(ev.some((e) => e.e === 'err'));
  a.level = 3;
  g.towersDirty = true;
  run(g, [[0, { a: 'branch', id: a.id, b: 'C' }]]);
  assert.equal(a.branch, 'C');
  assert.ok(a.stats.slow, 'Onde de choc ralentit');
  ev = run(g, [[0, { a: 'branch', id: a.id, b: 'A' }]]);
  assert.ok(ev.some((e) => e.e === 'err'));
  assert.equal(a.branch, 'C');
});

test('déroulement : préparation -> vague quand tout le monde est prêt -> récompenses', () => {
  const g = newGame();
  const tiles = freeTiles(g, 1);
  assert.equal(g.phase, PHASE.PREP);
  run(g, [[0, { a: 'ready' }]]);
  assert.equal(g.phase, PHASE.PREP, 'un seul joueur prêt ne suffit pas');
  const ev = run(g, [[1, { a: 'ready' }]]);
  assert.equal(g.phase, PHASE.WAVE);
  assert.ok(ev.some((e) => e.e === 'waveStart' && e.w === 1));
  // tuer tous les ennemis instantanément via une Frappe aérienne répétée n'est pas nécessaire :
  // on vide la file et on tue ce qui existe.
  const gold = g.players.map((p) => p.gold);
  g.waveState.qi = g.waveState.queue.length;
  for (const e of g.enemies) g.killEnemy(e, { owners: [0] });
  g.step(DT);
  const end = g.drainEvents().find((e) => e.e === 'waveEnd');
  assert.ok(end);
  assert.equal(g.phase, PHASE.PREP);
  assert.ok(g.players[1].gold > gold[1]);
  assert.ok(tiles.length);
});

test('armure : réduit chaque coup, brisure d’armure + sniper = combo', () => {
  const g = newGame();
  run(g, [
    [0, { a: 'ready' }],
    [1, { a: 'ready' }],
  ]);
  const e = g.spawnEnemy('tank');
  const hp0 = e.hp;
  g.damageEnemy(e, 4, { owners: [0], kind: 'bullet', armorPierce: 0 });
  assert.ok(hp0 - e.hp < 4 * 0.5, 'l’armure absorbe une bonne partie des petits coups');
  g.applyBreak(e, 4, { owners: [0] });
  g.drainEvents();
  const hp1 = e.hp;
  g.damageEnemy(e, 50, { owners: [1], kind: 'snipe', armorPierce: 0 });
  const ev = g.drainEvents();
  const combo = ev.find((x) => x.e === 'combo');
  assert.ok(combo && combo.n === 'weakspot' && combo.coop === 1, 'combo coopératif détecté');
  assert.ok(hp1 - e.hp > 50 * 2, 'dégâts multipliés');
});

test('boss : impossible de sauter une phase', () => {
  const g = newGame();
  run(g, [
    [0, { a: 'ready' }],
    [1, { a: 'ready' }],
  ]);
  const boss = g.spawnEnemy('colossus', { phases: 3 });
  g.damageEnemy(boss, boss.maxHp * 10, { owners: [0], kind: 'snipe', armorPierce: 99 });
  assert.equal(boss.dead, false);
  assert.equal(boss.phase, 2);
  assert.ok(boss.invulnT > 0);
  g.damageEnemy(boss, 1e9, { owners: [0], kind: 'snipe', armorPierce: 99 });
  assert.equal(boss.phase, 2, 'invulnérable pendant la transition');
});

test('le piétinement du Colosse neutralise les tourelles proches', () => {
  const g = newGame();
  g.players[0].gold = 10000;
  const tiles = freeTiles(g, 1);
  const t = place(g, 0, 'canon', tiles[0]);
  run(g, [
    [0, { a: 'ready' }],
    [1, { a: 'ready' }],
  ]);
  const boss = g.spawnEnemy('colossus');
  boss.x = t.x;
  boss.y = t.y;
  g.stomp(boss, 100, 5);
  assert.ok(t.disabledT > 0);
});

test('défaite quand la base tombe à 0', () => {
  const g = newGame();
  run(g, [
    [0, { a: 'ready' }],
    [1, { a: 'ready' }],
  ]);
  g.base.hp = 1;
  const e = g.spawnEnemy('runner');
  g.enemyReachBase(e);
  assert.equal(g.phase, PHASE.DEFEAT);
  assert.ok(g.result && g.result.victory === false);
});

test('victoire après la dernière vague de campagne', () => {
  const g = newGame();
  run(g, [
    [0, { a: 'ready' }],
    [1, { a: 'ready' }],
  ]);
  g.wave = 20;
  g.waveState.qi = g.waveState.queue.length;
  for (const e of g.enemies) e.dead = true;
  g.step(DT);
  assert.equal(g.phase, PHASE.VICTORY);
  assert.ok(g.result.victory);
  assert.equal(g.result.players.length, 2);
});

test('capacités : recharge et phase de vague', () => {
  const g = newGame();
  let ev = run(g, [[0, { a: 'ability', i: 1 }]]);
  assert.ok(
    ev.some((e) => e.e === 'err'),
    'pas pendant la préparation',
  );
  run(g, [
    [0, { a: 'ready' }],
    [1, { a: 'ready' }],
  ]);
  ev = run(g, [[0, { a: 'ability', i: 1 }]]);
  assert.ok(ev.some((e) => e.e === 'freeze'));
  ev = run(g, [[0, { a: 'ability', i: 1 }]]);
  assert.ok(ev.some((e) => e.e === 'err' && /recharge/.test(e.m)));
});

test('trésor d’équipe et don d’or', () => {
  const g = newGame();
  g.teamGold = 1000;
  g.base.hp = 500;
  run(g, [[1, { a: 'team', item: 'repair' }]]);
  assert.ok(g.base.hp > 500);
  assert.ok(g.teamGold < 1000);
  const g0 = g.players[0].gold;
  const g1 = g.players[1].gold;
  run(g, [[0, { a: 'gift', to: 1, v: 50 }]]);
  assert.equal(g.players[0].gold, g0 - 50);
  assert.equal(g.players[1].gold, g1 + 50);
});

test('synergies et bonus de proximité entre joueurs', () => {
  const g = newGame();
  g.players[0].gold = 10000;
  g.players[1].gold = 10000;
  // deux cases adjacentes
  let pair = null;
  for (let r = 0; r < ROWS && !pair; r++)
    for (let c = 0; c < COLS - 1 && !pair; c++)
      if (g.isBuildable(c, r) && g.isBuildable(c + 1, r))
        pair = [
          [c, r],
          [c + 1, r],
        ];
  const a = place(g, 0, 'canon', pair[0]);
  const b = place(g, 1, 'sniper', pair[1]);
  assert.equal(a.link, 0.1);
  assert.equal(b.link, 0.1);
  const tiles = freeTiles(g, 5);
  for (const tl of tiles) place(g, 0, 'canon', tl);
  assert.ok(g.synergies.has('battery'), '6 canons niveau 1 activent Batterie');
});

test('fusionner ne fait pas perdre une synergie', () => {
  const g = newGame();
  g.players[0].gold = 10000;
  const tiles = freeTiles(g, 6);
  const ts = tiles.map((tl) => place(g, 0, 'canon', tl));
  assert.ok(g.synergies.has('battery'));
  run(g, [[0, { a: 'fuse', id: ts[0].id, partners: [ts[1].id, ts[2].id] }]]);
  assert.equal(g.towers.length, 4);
  assert.ok(g.synergies.has('battery'), 'toujours active après fusion');
});

test('événements : tempête, invasion et panne', () => {
  const g = newGame();
  g.players[0].gold = 10000;
  const tiles = freeTiles(g, 4);
  for (const tl of tiles) place(g, 0, 'canon', tl);
  g.nextEvent = 'storm';
  run(g, [
    [0, { a: 'ready', v: true }],
    [1, { a: 'ready', v: true }],
  ]);
  assert.equal(g.rangeMult, 0.85);
  assert.equal(g.snapshot(false).ev, 'storm');
  // fin de vague : retour à la normale
  g.waveState.qi = g.waveState.queue.length;
  for (const e of g.enemies) e.dead = true;
  g.step(DT);
  assert.equal(g.rangeMult, 1);

  const g2 = newGame();
  g2.nextEvent = 'invasion';
  const base = g2.computePreview(1).groups.reduce((a, [, n]) => a + n, 0);
  run(g2, [
    [0, { a: 'ready', v: true }],
    [1, { a: 'ready', v: true }],
  ]);
  assert.ok(g2.waveState.queue.length > base + 10, 'des éclaireurs supplémentaires sont ajoutés');

  const g3 = newGame();
  g3.players[0].gold = 10000;
  for (const tl of freeTiles(g3, 8)) place(g3, 0, 'mg', tl);
  g3.nextEvent = 'blackout';
  run(g3, [
    [0, { a: 'ready', v: true }],
    [1, { a: 'ready', v: true }],
  ]);
  assert.equal(g3.towers.filter((t) => t.disabledT > 0).length, 2);
});

test('marchand : achats uniques par joueur', () => {
  const g = newGame();
  const [tl] = freeTiles(g, 1);
  const t = place(g, 0, 'sniper', tl);
  g.players[0].gold = 5000;
  g.merchant = { deals: ['core', 'polish', 'recharge'], bought: [[], []] };
  run(g, [[0, { a: 'merchant', deal: 'core' }]]);
  assert.equal(g.players[0].cores, 1);
  const ev = run(g, [[0, { a: 'merchant', deal: 'core' }]]);
  assert.ok(
    ev.some((e) => e.e === 'err'),
    'une seule fois par joueur',
  );
  const r0 = t.rarity;
  run(g, [[0, { a: 'merchant', deal: 'polish', id: t.id }]]);
  assert.equal(t.rarity, r0 + 1);
  const ev2 = run(g, [[0, { a: 'merchant', deal: 'repair' }]]);
  assert.ok(
    ev2.some((e) => e.e === 'err'),
    'offre non proposée',
  );
  g.players[1].gold = 5000;
  run(g, [[1, { a: 'merchant', deal: 'core' }]]);
  assert.equal(g.players[1].cores, 1, 'chaque joueur peut acheter');
});

test('instantané sérialisable en JSON', () => {
  const g = newGame();
  const [tl] = freeTiles(g, 1);
  place(g, 0, 'canon', tl);
  run(g, [
    [0, { a: 'ready' }],
    [1, { a: 'ready' }],
  ]);
  for (let i = 0; i < 60; i++) g.step(DT);
  const snap = g.snapshot(true);
  const json = JSON.stringify(snap);
  const back = JSON.parse(json);
  assert.equal(back.towers.length, 1);
  assert.ok(Array.isArray(back.enemies));
  assert.equal(back.players.length, 2);
});

test('commandes malformées ignorées sans planter', () => {
  const g = newGame();
  const bad = [
    null,
    42,
    {},
    { a: 5 },
    { a: 'place' },
    { a: 'fuse', id: 'x', partners: 'y' },
    { a: 'upgrade', id: 1e9, s: '__proto__' },
    { a: 'gift', to: -1, v: 1e9 },
    { a: 'chat', m: 'x'.repeat(5000) },
  ];
  for (const c of bad) g.command(0, c);
  g.command(9, { a: 'ready' });
  assert.doesNotThrow(() => g.step(DT));
});

test('clés héritées refusées (pas de corruption de l’état)', () => {
  const g = newGame();
  const [tl] = freeTiles(g, 1);
  const t = place(g, 0, 'canon', tl);
  const gold = g.players[0].gold;
  for (const k of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    g.command(0, { a: 'place', tt: k, c: 0, r: 0 });
    g.command(0, { a: 'upgrade', id: t.id, s: k });
    g.command(0, { a: 'team', item: k });
    g.command(0, { a: 'branch', id: t.id, b: k });
  }
  g.step(DT);
  assert.equal(g.players[0].gold, gold);
  assert.ok(Number.isFinite(g.players[0].gold));
  assert.deepEqual(Object.keys(t.up).sort(), ['dmg', 'range', 'rate']);
});

test('partie complète jouée par des IA sans erreur', () => {
  const g = new Game({ seed: 7, difficulty: 'easy', players: [{ bot: true }, { bot: true }] });
  const bots = g.players.map((p) => new BotBrain(g, p.id));
  let ticks = 0;
  while (g.phase !== PHASE.VICTORY && g.phase !== PHASE.DEFEAT && ticks < 30 * 60 * 60) {
    for (const b of bots) b.update(DT);
    g.step(DT);
    g.drainEvents();
    ticks++;
  }
  assert.equal(g.phase, PHASE.VICTORY);
  assert.ok(g.players.every((p) => p.stats.fusions > 0));
});

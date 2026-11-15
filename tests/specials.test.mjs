// launch-16: besondere Squishes – Eis, Bombe, Kette (Spiellogik, Kampagne, Solver, Hinweis).
import test from 'node:test';
import assert from 'node:assert/strict';
import { insertTile, settle, mergePass, findStreets, tickBombs, boardCode, boardFromCode, BOMB_MS } from '../game/game-logic.mjs';
import * as Camp from '../game/campaign.mjs';
import { solveLevel } from '../tools/campaign/solver.mjs';
import { findHint, hintState } from '../game/hint-solver.mjs';
import { readFileSync } from 'node:fs';

let id = 1;
const T = (value, extra = {}) => ({ id: id++, value, ...extra });
const B = rows => rows.map(r => r.map(x => (x == null ? null : typeof x === 'number' ? T(x) : x)));
const vals = b => b.map(r => r.map(t => (t ? (t.bound ? '#' : (t.ice ? '*' : '') + t.value + (t.bomb != null ? 'b' : '')) : '.')).join(' ')).join(' / ');

test('Eis: gefrorener Stein verschmilzt nicht (weder Fusion noch Straße)', () => {
  const b = B([[2, 2, T(2, { ice: true }), null, null], [1, 2, T(3, { ice: true }), null, null], ...Array.from({ length: 3 }, () => Array(5).fill(null))]);
  assert.equal(mergePass(b).groups.length, 0);
  assert.equal(findStreets(b).length, 0);
  assert.equal(settle(b).passes.length, 0);
});

test('Eis: taut durch eine Fusion direkt daneben auf und verschmilzt danach normal', () => {
  // Reihe 0: 3 3 3 → Fusion; darunter (1,1) gefrorene 4, daneben 4 4 → nach dem Auftauen 4 4 4 in Reihe 1.
  const b = B([[3, 3, 3, null, null], [null, T(4, { ice: true }), 4, 4, null], ...Array.from({ length: 3 }, () => Array(5).fill(null))]);
  const p = mergePass(b);
  assert.equal(p.groups.length, 1);
  assert.deepEqual(p.thawed, [[1, 1]]);
  assert.equal(p.board[1][1].ice, undefined);
  const s = settle(b);
  assert.equal(s.passes.length, 2, 'zweiter Durchgang: aufgetaute 4 verschmilzt');
  assert.equal(s.board[1][2]?.value, 5);
});

test('Eis: diagonal taut nicht; Eis zieht beim Einschieben normal mit', () => {
  const b = B([[3, 3, 3, null, null], [null, null, null, T(4, { ice: true }), null], ...Array.from({ length: 3 }, () => Array(5).fill(null))]);
  assert.equal(mergePass(b).board[1][3].ice, true);
  const row = B([[1, 2, 5, T(4, { ice: true }), null], ...Array.from({ length: 4 }, () => Array(5).fill(null))]);
  const ins = insertTile(row, 'right', 0, T(1));
  assert.equal(ins.accepted, true);
  assert.equal(ins.board[0][4].ice, true, 'gefrorener Stein rückt mit');
});

test('Kette: bewegt sich nie; Einschub stoppt davor; volle Strecke davor = Reihe voll', () => {
  const chain = () => T(0, { bound: true });
  const b = B([[null, 1, chain(), null, 2], ...Array.from({ length: 4 }, () => Array(5).fill(null))]);
  let ins = insertTile(b, 'right', 0, T(5));
  assert.equal(ins.accepted, true);
  assert.equal(vals([ins.board[0]]), '5 1 # . 2');
  // Von rechts: Lücke bei 3 vor der Kette → 2 rückt nach 3.
  ins = insertTile(b, 'left', 0, T(6));
  assert.equal(vals([ins.board[0]]), '. 1 # 2 6');
  // Kette am Einschubrand → Reihe nimmt nichts auf.
  const c = B([[chain(), null, null, null, null], ...Array.from({ length: 4 }, () => Array(5).fill(null))]);
  assert.equal(insertTile(c, 'right', 0, T(1)).accepted, false);
  // Strecke vor der Kette voll → abgelehnt, obwohl dahinter frei ist.
  const d = B([[1, 4, chain(), null, null], ...Array.from({ length: 4 }, () => Array(5).fill(null))]);
  assert.equal(insertTile(d, 'right', 0, T(1)).accepted, false);
});

test('Kette: verschmilzt nie und trennt Linien', () => {
  const b = B([[2, 2, T(0, { bound: true }), 2, 2], ...Array.from({ length: 4 }, () => Array(5).fill(null))]);
  assert.equal(settle(b).passes.length, 0);
});

test('Bombe: Countdown, Explosion räumt die 8 Nachbarn (nicht die Kette), keine Kettenexplosion', () => {
  const b = B([[1, 2, 3, null, null], [4, T(5, { bomb: 1000 }), T(0, { bound: true }), null, null], [T(6, { bomb: 50000 }), 7, 8, 9, null], [null, null, null, null, null], [null, null, null, null, null]]);
  let t = tickBombs(b, 400);
  assert.equal(t.exploded.length, 0);
  assert.equal(t.board[1][1].bomb, 600);
  t = tickBombs(t.board, 600);
  assert.equal(t.exploded.length, 1);
  assert.equal(vals(t.board), '. . . . . / . . # . . / . . . 9 . / . . . . . / . . . . .');
  assert.equal(t.exploded[0].removed.length, 8);
});

test('Bombe: in einer Fusion verschmolzen = entschärft; zieht normal mit', () => {
  const b = B([[3, T(3, { bomb: 5000 }), 3, null, null], ...Array.from({ length: 4 }, () => Array(5).fill(null))]);
  const s = settle(b);
  assert.equal(s.board[0][1].value, 4);
  assert.equal(s.board[0][1].bomb, undefined);
  assert.equal(tickBombs(s.board, 99999).exploded.length, 0);
  assert.equal(insertTile(b, 'right', 0, T(1)).board[0][2].bomb, 5000);
});

test('Brett-Schlüssel (Solver/Hinweis) kodieren Eis, Kette, Bombe verlustfrei (Bombe in 2,5-s-Einheiten)', () => {
  const b = B([[1, T(4, { ice: true }), T(0, { bound: true }), T(7, { bomb: 20000 }), null], ...Array.from({ length: 4 }, () => Array(5).fill(null))]);
  const k = boardCode(b);
  assert.equal(k.length, 25);
  const back = boardFromCode(k);
  assert.deepEqual([back[0][1].ice, back[0][1].value, back[0][2].bound, back[0][3].bomb, back[0][3].value], [true, 4, true, 20000, 7]);
});

const lab = JSON.parse(readFileSync(new URL('../levels/levels-lab.json', import.meta.url))).levels;
const blank = (over = {}) => ({ id: 900, board: Array.from({ length: 5 }, () => Array(5).fill(null)), moves: 6, sequence: [1, 1, 1, 1, 1, 1, 1, 1], goals: [{ type: 'score', points: 10 }], stars: { three: 2, two: 4 }, ...over });

test('Level-Format: specials werden geprüft und gesetzt', () => {
  const board = blank().board.map(r => r.slice()); board[0][0] = 3; board[1][1] = 2;
  const lv = blank({ board, specials: { ice: [[0, 0]], bomb: [[1, 1]], bound: [[2, 2]], bombSeconds: 20 } });
  const run = Camp.createLevelRun(lv);
  assert.equal(run.board[0][0].ice, true);
  assert.equal(run.board[1][1].bomb, BOMB_MS);
  assert.equal(run.board[2][2].bound, true);
  assert.equal(Camp.specialOf(run.board[2][2]), 'bound');
  assert.throws(() => Camp.validateLevel(blank({ specials: { ice: [[0, 0]] } })), /braucht einen Stein/);
  const b2 = blank().board.map(r => r.slice()); b2[2][2] = 4;
  assert.throws(() => Camp.validateLevel(blank({ board: b2, specials: { bound: [[2, 2]] } })), /leer/);
  assert.throws(() => Camp.validateLevel(blank({ specials: { lava: [] } })), /unbekannt/);
});

test('Kampagne: Bomben-Uhr startet erst mit dem ersten Zug, Rakete/Zauberstab nicht auf Ketten', () => {
  const board = blank().board.map(r => r.slice()); board[2][2] = 5;
  const run = Camp.createLevelRun(blank({ board, specials: { bomb: [[2, 2]], bound: [[0, 0]] } }));
  assert.deepEqual(Camp.tickLevelBombs(run, 30000), [], 'vor dem ersten Zug läuft nichts');
  assert.equal(Camp.nextBombMs(run), 20000);
  assert.equal(Camp.useRocket(run, 0, 0), false);
  assert.deepEqual(Camp.wandChoices(run, 0, 0), []);
  Camp.applyLevelMove(run, 'right', 4);
  assert.equal(Camp.tickLevelBombs(run, 19999).length, 0);
  const ex = Camp.tickLevelBombs(run, 1);
  assert.equal(ex.length, 1);
  assert.equal(run.board[2][2], null);
  assert.equal(run.exploded, 1);
  assert.equal(Camp.tilesOn(run.board), 1, 'Kette zählt nicht als Stein');
});

test('Test-Level (levels-lab.json): gültig, Solver löst jedes ohne Werkzeug, gespeicherte Lösung gewinnt mit 3★', () => {
  assert.ok(lab.length >= 4);
  const kinds = new Set();
  for (const lv of lab) {
    Camp.validateLevel(lv);
    for (const k of Camp.SPECIAL_KINDS) if (lv.specials?.[k]?.length) kinds.add(k);
    const s = solveLevel(lv);
    assert.ok(s.solvable && s.exact, `Lab ${lv.id}: lösbar`);
    assert.equal(s.minMoves, lv.meta.minMoves, `Lab ${lv.id}: Optimum`);
    assert.deepEqual(lv.stars, Camp.starThresholds(s.minMoves, lv.moves), `Lab ${lv.id}: Sterne`);
    const r = Camp.replaySolution(lv, lv.solution);
    assert.ok(r.ok, `Lab ${lv.id}: Lösung gewinnt`);
    assert.equal(r.stars, 3);
  }
  assert.deepEqual([...kinds].sort(), ['bomb', 'bound', 'ice']);
});

test('Hinweis kennt die besonderen Squishes (Eis wird nicht als verschmelzbar gesehen)', () => {
  for (const lv of lab) {
    const run = Camp.createLevelRun(lv);
    const h = findHint(hintState(run, { movesLeft: lv.moves, vec: Camp.progressVector(run) }), { maxMs: 4000 });
    assert.ok(h.found, `Lab ${lv.id}: Hinweis gefunden`);
    const r = Camp.replaySolution(lv, lv.solution);
    assert.ok(h.minMoves <= r.run.moves, `Lab ${lv.id}: Hinweis-Optimum ≤ Lösung`);
  }
});

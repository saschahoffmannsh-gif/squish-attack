import test from 'node:test';
import assert from 'node:assert/strict';
import { solveLevel, expand, advanceVec, randomPlayouts, playerModel, boardKey, boardFromKey } from '../tools/campaign/solver.mjs';
import { createLevelRun, applyLevelMove, goalProgress, progressVector, vanished, ALL_MOVES } from '../game/campaign.mjs';
import { settle as settleB, insertTile as insertB } from '../game/game-logic.mjs';
import { createRng } from '../game/ranked.mjs';
import { insertTile } from '../game/game-logic.mjs';

const E = null;
const empty = () => Array.from({ length: 5 }, () => Array(5).fill(E));

test('Brett-Schlüssel hin und zurück', () => {
  const b = empty(); b[0][0] = 3; b[2][2] = 7; b[4][4] = 11;
  const run = createLevelRun({ board: b, sequence: [1], moves: 1, goals: [{ type: 'tile', value: 2 }], stars: { three: 1, two: 1 } });
  const key = boardKey(run.board);
  assert.equal(key.length, 25);
  assert.equal(boardKey(boardFromKey(key).board), key);
});

test('Minimale Zugzahl: 1-Zug-Level und 2-Zug-Level', () => {
  const b = empty(); b[0][0] = 1; b[0][1] = 1;
  const one = solveLevel({ board: b, sequence: [1, 1, 1], moves: 3, goals: [{ type: 'tile', value: 2 }], stars: { three: 1, two: 2 } });
  assert.equal(one.minMoves, 1);
  assert.ok(one.optimalSolutions >= 1);
  const b2 = empty(); b2[0][0] = 1; b2[4][4] = 2;
  const two = solveLevel({ board: b2, sequence: [1, 1, 1], moves: 3, goals: [{ type: 'tile', value: 2 }], stars: { three: 2, two: 3 } });
  assert.equal(two.minMoves, 2);
});

test('Unlösbar wird erkannt', () => {
  const b = empty(); b[0][0] = 1;
  const r = solveLevel({ board: b, sequence: [3, 5], moves: 2, goals: [{ type: 'tile', value: 4 }], stars: { three: 2, two: 2 } });
  assert.equal(r.solvable, false);
});

test('Schneller Zielvektor = campaign.mjs-Zählung (500 Zufallspartien, alle Zielarten)', () => {
  const rng = createRng(42);
  const goals = [{ type: 'tile', value: 5 }, { type: 'make', value: 2, count: 30 }, { type: 'score', points: 99999 },
    { type: 'clear', tiles: 99 }, { type: 'street', count: 20 }, { type: 'combo', chain: 3 },
    { type: 'long', count: 20 }, { type: 'purge', value: 2, tiles: 99 }, { type: 'purge', value: 1, tiles: 99 }, { type: 'empty', max: 4 }];
  for (let g = 0; g < 500; g++) {
    const b = empty();
    for (let k = 0; k < 6; k++) b[Math.floor(rng() * 5)][Math.floor(rng() * 5)] = 1 + Math.floor(rng() * 3);
    const level = { board: b, sequence: Array.from({ length: 15 }, () => 1 + Math.floor(rng() * 3)), moves: 15, goals, stars: { three: 15, two: 15 } };
    const run = createLevelRun(level);
    let vec = progressVector(run);
    for (let d = 0; d < 15 && run.status === 'playing'; d++) {
      const legal = ALL_MOVES.filter(m => insertTile(run.board, m.direction, m.line, { value: 0 }).accepted);
      if (!legal.length) break;
      const m = legal[Math.floor(rng() * legal.length)];
      const r = applyLevelMove(run, m.direction, m.line);
      vec = advanceVec(goals, vec, r.settled).vec;
      assert.deepEqual(vec, progressVector(run));
    }
  }
});

test('expand liefert dieselben Bretter wie applyLevelMove', () => {
  const b = empty(); b[1][1] = 2; b[1][2] = 2; b[3][0] = 1; b[0][4] = 4;
  const level = { board: b, sequence: [2], moves: 1, goals: [{ type: 'tile', value: 3 }], stars: { three: 1, two: 1 } };
  const kids = expand(level, createLevelRun(level).board, [0], 0);
  for (const k of kids) {
    const run = createLevelRun(level);
    const m = ALL_MOVES.find((_, i) => String.fromCharCode(97 + i) === k.move);
    applyLevelMove(run, m.direction, m.line);
    assert.equal(boardKey(run.board), boardKey(k.board));
    assert.equal(run.status === 'won', k.win);
  }
});

test('Spielermodelle sind reproduzierbar', () => {
  const b = empty(); b[0][0] = 1; b[0][1] = 1; b[2][2] = 2;
  const level = { board: b, sequence: [2, 1, 2, 1, 2, 1], moves: 6, goals: [{ type: 'tile', value: 3 }], stars: { three: 2, two: 4 } };
  assert.deepEqual(randomPlayouts(level, { n: 50, seed: 3 }).winsBy, randomPlayouts(level, { n: 50, seed: 3 }).winsBy);
  assert.deepEqual(playerModel(level, { n: 30, seed: 3 }).winsBy, playerModel(level, { n: 30, seed: 3 }).winsBy);
});

test('Wert räumen: vanished() = Bestand vorher + neu erzeugt − Bestand nachher (unabhängige Zählung)', () => {
  const rng = createRng(7); let checked = 0;
  for (let g = 0; g < 3000; g++) {
    const b = empty();
    for (let k = 0; k < 14; k++) b[Math.floor(rng() * 5)][Math.floor(rng() * 5)] = { value: 1 + Math.floor(rng() * 4) };
    const m = ALL_MOVES[Math.floor(rng() * 20)];
    const ins = insertB(b, m.direction, m.line, { value: 1 + Math.floor(rng() * 4) });
    if (!ins.accepted) continue;
    const st = settleB(ins.board);
    if (!st.passes.length) continue;
    const cnt = (bd, v) => bd.flat().filter(t => t && t.value === v).length;
    for (let v = 1; v <= 9; v++) {
      let made = 0, gone = 0;
      for (const p of st.passes) for (const x of p) { if (x.nextValue === v && x.nextValue !== x.value) made++; for (const [val, n] of vanished(x)) if (val === v) gone += n; }
      assert.equal(gone, cnt(ins.board, v) + made - cnt(st.board, v), `Partie ${g}, Wert ${v}`);
    }
    checked++;
  }
  assert.ok(checked > 300);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { solveLevel, expand, advanceVec, randomPlayouts, playerModel, boardKey, boardFromKey } from '../tools/campaign/solver.mjs';
import { createLevelRun, applyLevelMove, goalProgress, ALL_MOVES } from '../game/campaign.mjs';
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
    { type: 'clear', tiles: 99 }, { type: 'street', count: 20 }, { type: 'combo', chain: 3 }];
  for (let g = 0; g < 500; g++) {
    const b = empty();
    for (let k = 0; k < 6; k++) b[Math.floor(rng() * 5)][Math.floor(rng() * 5)] = 1 + Math.floor(rng() * 3);
    const level = { board: b, sequence: Array.from({ length: 15 }, () => 1 + Math.floor(rng() * 3)), moves: 15, goals, stars: { three: 15, two: 15 } };
    const run = createLevelRun(level);
    let vec = goals.map(gl => goalProgress(gl, run).current);
    for (let d = 0; d < 15 && run.status === 'playing'; d++) {
      const legal = ALL_MOVES.filter(m => insertTile(run.board, m.direction, m.line, { value: 0 }).accepted);
      if (!legal.length) break;
      const m = legal[Math.floor(rng() * legal.length)];
      const r = applyLevelMove(run, m.direction, m.line);
      vec = advanceVec(goals, vec, r.settled).vec;
      assert.deepEqual(vec, goals.map(gl => goalProgress(gl, run).current));
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

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLevelRun, applyLevelMove, starsFor, replaySolution, goalProgress, queueOf, movesLeft,
  validateLevel, encodeMove, decodeMove, recordResult, mergeProgress, emptyProgress, isUnlocked,
  nextLevel, totalStars, loadProgress, saveProgress, goalText, isRock, ROCK,
} from '../game/campaign.mjs';

const E = null;
const base = (over = {}) => ({
  id: 't', board: [[1, 1, E, E, E], [E, E, E, E, E], [E, E, E, E, E], [E, E, E, E, E], [E, E, E, E, E]],
  sequence: [1, 2, 3], moves: 3, goals: [{ type: 'tile', value: 2 }], stars: { three: 1, two: 2 }, ...over,
});

test('Zugcodes passen zu ranked.mjs', () => {
  assert.equal(encodeMove('left', 0), 'a');
  assert.equal(encodeMove('down', 4), 't');
  assert.deepEqual(decodeMove('h'), { direction: 'right', line: 2 });
  assert.equal(decodeMove('z'), null);
});

test('ein Zug: Einschieben + Fusion zählt als Ziel', () => {
  const run = createLevelRun(base());
  assert.deepEqual(queueOf(run), [1, 2, 3]);
  const r = applyLevelMove(run, 'right', 0);   // 1 kommt links rein, schiebt 1,1 nach rechts → 1,1,1
  assert.ok(r.ok);
  assert.equal(run.board[0].filter(Boolean).length, 1);
  assert.equal(run.board[0].find(Boolean).value, 2);
  assert.equal(run.status, 'won');
  assert.equal(run.cleared, 2);
  assert.equal(run.merges, 1);
  assert.equal(run.score, 60);                  // nextValue 2 × 3 Steine × 10
  assert.equal(starsFor(run.level, run.moves), 3);
  assert.equal(movesLeft(run), 2);
});

test('Zuglimit: verloren, wenn Züge aufgebraucht', () => {
  const run = createLevelRun(base({ goals: [{ type: 'tile', value: 5 }], moves: 2, stars: { three: 1, two: 2 } }));
  assert.ok(applyLevelMove(run, 'left', 4).ok);
  assert.equal(run.status, 'playing');
  assert.ok(applyLevelMove(run, 'left', 3).ok);
  assert.equal(run.status, 'lost');
  assert.equal(run.lostReason, 'moves');
  assert.equal(applyLevelMove(run, 'left', 2).reason, 'finished');
  assert.deepEqual(queueOf(run), []);
});

test('volle Reihe wird abgelehnt und kostet keinen Zug', () => {
  const lv = base({ board: [[1, 2, 1, 2, 1], [E, E, E, E, E], [E, E, E, E, E], [E, E, E, E, E], [E, E, E, E, E]], goals: [{ type: 'tile', value: 4 }] });
  const run = createLevelRun(lv);
  assert.equal(applyLevelMove(run, 'right', 0).reason, 'full-line');
  assert.equal(run.moves, 0);
});

test('Sterne', () => {
  const lv = base({ moves: 6, stars: { three: 2, two: 4 } });
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(m => starsFor(lv, m)), [3, 3, 2, 2, 1, 1, 0]);
  assert.equal(starsFor(lv, 2, false), 0);
});

test('Felsen fusionieren nie, auch nicht drei nebeneinander', () => {
  const lv = base({ board: [[ROCK, ROCK, E, E, E], [E, E, E, E, E], [E, E, E, E, E], [E, E, E, E, E], [E, E, E, E, E]], sequence: [ROCK, 1, 1], goals: [{ type: 'clear', tiles: 1 }] });
  const run = createLevelRun(lv);
  applyLevelMove(run, 'right', 0);
  assert.equal(run.board[0].filter(isRock).length, 3);
  assert.equal(run.cleared, 0);
});

test('Ziele: make, score, clear, street, combo', () => {
  const run = createLevelRun(base());
  run.created = { 2: 1, 3: 2 }; run.score = 250; run.cleared = 4; run.streets = 1; run.bestCombo = 2;
  assert.deepEqual(goalProgress({ type: 'make', value: 3, count: 3 }, run), { current: 2, target: 3, done: false });
  assert.equal(goalProgress({ type: 'make', value: 2, count: 3 }, run).done, true);
  assert.equal(goalProgress({ type: 'score', points: 200 }, run).done, true);
  assert.deepEqual(goalProgress({ type: 'clear', tiles: 9 }, run), { current: 4, target: 9, done: false });
  assert.equal(goalProgress({ type: 'street', count: 1 }, run).done, true);
  assert.equal(goalProgress({ type: 'combo', chain: 3 }, run).done, false);
  assert.equal(goalProgress({ type: 'tile', value: 3 }, run).done, true);
});

test('Straße wird gezählt', () => {
  // 1,2 liegen in Reihe 0; eine 3 kommt von rechts herein → 1,2,3 = Straße
  const lv = base({ sequence: [3], moves: 1, goals: [{ type: 'street', count: 1 }], stars: { three: 1, two: 1 } });
  const lv2 = { ...lv, board: [[E, E, 1, 2, E], [E, E, E, E, E], [E, E, E, E, E], [E, E, E, E, E], [E, E, E, E, E]], sequence: [3] };
  const r2 = replaySolution(lv2, encodeMove('left', 0)); // 3 kommt rechts rein: 1,2,3
  assert.ok(r2.ok);
  assert.equal(r2.run.streets, 1);
});

test('validateLevel lehnt kaputte Level ab', () => {
  assert.throws(() => validateLevel(base({ board: [[1]] })));
  assert.throws(() => validateLevel(base({ sequence: [1] })));
  assert.throws(() => validateLevel(base({ goals: [{ type: 'foo' }] })));
  assert.throws(() => validateLevel(base({ stars: { three: 3, two: 1 } })));
  assert.ok(goalText({ type: 'tile', value: 3 }).includes('3'));
});

test('Fortschritt: bestes Ergebnis bleibt, Freischalten, Zusammenführen', () => {
  let p = emptyProgress();
  assert.ok(isUnlocked(p, 1)); assert.ok(!isUnlocked(p, 2));
  p = recordResult(p, 1, { stars: 2, moves: 5, now: 1 });
  p = recordResult(p, 1, { stars: 1, moves: 3, now: 2 });
  assert.deepEqual(p.levels['1'], { stars: 2, moves: 5, at: 1 });
  p = recordResult(p, 1, { stars: 2, moves: 4, now: 3 });
  assert.equal(p.levels['1'].moves, 4);
  assert.ok(isUnlocked(p, 2));
  assert.equal(nextLevel(p, 100), 2);
  const other = recordResult(recordResult(emptyProgress(), 1, { stars: 3, moves: 3, now: 5 }), 2, { stars: 1, moves: 9, now: 6 });
  const m = mergeProgress(p, other);
  assert.equal(m.levels['1'].stars, 3); assert.equal(m.levels['2'].stars, 1);
  assert.equal(totalStars(m), 4);
  const mem = new Map(); const storage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.ok(saveProgress(m, storage));
  assert.deepEqual(loadProgress(storage), m);
  assert.deepEqual(loadProgress({ getItem: () => '{kaputt' }), emptyProgress());
});

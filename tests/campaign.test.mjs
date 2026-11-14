import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLevelRun, applyLevelMove, starsFor, replaySolution, goalProgress, queueOf, movesLeft,
  validateLevel, encodeMove, decodeMove, recordResult, mergeProgress, emptyProgress, isUnlocked,
  nextLevel, totalStars, loadProgress, saveProgress, goalText, starThresholds, starsOfRun, addExtraMoves,
  markToolUsed, moveLimit, lockReason, chapterOf, starGate, CHAPTER_SIZE, STARS_PER_CHAPTER_GATE,
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

test('Sterne: 3★ = Optimum + 1, 2★ = Mitte, 1★ = im Limit', () => {
  assert.deepEqual(starThresholds(3, 6), { three: 4, two: 5 });
  assert.deepEqual(starThresholds(2, 7), { three: 3, two: 5 });
  assert.deepEqual(starThresholds(1, 5), { three: 2, two: 4 });
  const lv = base({ moves: 6, stars: starThresholds(3, 6) });
  assert.deepEqual([3, 4, 5, 6].map(m => starsFor(lv, m)), [3, 3, 2, 1]);
  assert.equal(starsFor(lv, 3, false), 0);
});

test('Hilfsmittel deckeln auf 2 Sterne', () => {
  const lv = base({ moves: 6, stars: starThresholds(3, 6) });
  assert.equal(starsFor(lv, 3, true, { toolsUsed: 1 }), 2);
  assert.equal(starsFor(lv, 5, true, { toolsUsed: 1 }), 2);
  assert.equal(starsFor(lv, 6, true, { toolsUsed: 2 }), 1);
  const run = createLevelRun(base());
  markToolUsed(run, 'hammer');
  applyLevelMove(run, 'right', 0);
  assert.equal(run.status, 'won');
  assert.equal(starsOfRun(run), 2);
});

test('+3 Züge: nutzt Reserve-Steine, rettet eine Niederlage, max. 2★, gewonnen nach Limit = 1★', () => {
  // Ziel braucht 2 Züge (zwei 1er von links in Reihe 0), Limit aber nur 1.
  const lv = base({ board: [[1, E, E, E, E], [E, E, E, E, E], [E, E, E, E, E], [E, E, E, E, E], [E, E, E, E, E]],
    sequence: [1, 1, 2, 2], moves: 1, stars: { three: 1, two: 1 } });
  const run = createLevelRun(lv);
  assert.deepEqual(queueOf(run), [1]);
  applyLevelMove(run, 'right', 0);
  assert.equal(run.status, 'lost'); assert.equal(run.lostReason, 'moves');
  assert.equal(addExtraMoves(run, 3), 3);
  assert.equal(moveLimit(run), 4); assert.equal(run.status, 'playing');
  assert.deepEqual(queueOf(run), [1, 2, 2]);
  applyLevelMove(run, 'right', 0);
  assert.equal(run.status, 'won');
  assert.equal(starsOfRun(run), 1);
  assert.equal(addExtraMoves(run, 3), 0);               // nach dem Sieg nicht mehr
  const run2 = createLevelRun({ ...lv, sequence: [1, 1] });
  assert.equal(addExtraMoves(run2, 3), 1);              // nur so viele wie Reserve-Steine
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

test('Fortschritt: bestes Ergebnis bleibt, Zusammenführen, Speichern', () => {
  let p = emptyProgress();
  p = recordResult(p, 1, { stars: 2, moves: 5, now: 1 });
  p = recordResult(p, 1, { stars: 1, moves: 3, now: 2 });
  assert.deepEqual(p.levels['1'], { stars: 2, moves: 5, at: 1 });
  p = recordResult(p, 1, { stars: 2, moves: 4, now: 3 });
  assert.equal(p.levels['1'].moves, 4);
  assert.equal(recordResult(p, 2, { stars: 0, moves: 4 }), p);
  const other = recordResult(recordResult(emptyProgress(), 1, { stars: 3, moves: 3, now: 5 }), 2, { stars: 1, moves: 9, now: 6 });
  const m = mergeProgress(p, other);
  assert.equal(m.levels['1'].stars, 3); assert.equal(m.levels['2'].stars, 1);
  assert.equal(totalStars(m), 4);
  const mem = new Map(); const storage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.ok(saveProgress(m, storage));
  assert.deepEqual(loadProgress(storage), m);
  assert.deepEqual(loadProgress({ getItem: () => '{kaputt' }), emptyProgress());
});

const withStars = list => list.reduce((p, stars, i) => (stars ? recordResult(p, i + 1, { stars, moves: 5, now: 1 }) : p), emptyProgress());

test('Kapitel: 10 Level, Schranke 18★ je Kapitel', () => {
  assert.equal(CHAPTER_SIZE, 10); assert.equal(STARS_PER_CHAPTER_GATE, 18);
  assert.deepEqual([1, 10, 11, 20, 21, 25, 100].map(chapterOf), [1, 1, 2, 2, 3, 3, 10]);
  assert.deepEqual([1, 2, 3, 10].map(starGate), [0, 18, 36, 162]);
});

test('Freischalten: der Reihe nach', () => {
  const p = withStars([3, 2]);
  assert.ok(isUnlocked(p, 1)); assert.ok(isUnlocked(p, 2)); assert.ok(isUnlocked(p, 3));
  assert.deepEqual(lockReason(p, 4), { reason: 'previous' });
  assert.equal(nextLevel(p, 25), 3);
  assert.equal(nextLevel(emptyProgress(), 25), 1);
});

test('Freischalten: Sterne-Schranke am Kapitelanfang', () => {
  const low = withStars(Array(10).fill(1));                 // 10★ < 18★
  assert.deepEqual(lockReason(low, 11), { reason: 'stars', need: 18, have: 10, chapter: 2 });
  assert.equal(nextLevel(low, 25), 10);                     // alles geschafft, Kapitel 2 noch zu
  const ok = withStars([2, 2, 2, 2, 2, 2, 2, 2, 1, 1]);     // 18★, z. B. alles mit Hilfsmitteln (max. 2★)
  assert.ok(isUnlocked(ok, 11));
  assert.ok(!isUnlocked(ok, 12));                           // innerhalb des Kapitels weiter der Reihe nach
  const ch3 = withStars([...Array(10).fill(2), ...Array(9).fill(2), 1]); // 39★ ≥ 36★
  assert.ok(isUnlocked(ch3, 21));
  const ch3low = withStars([...Array(10).fill(2), ...Array(10).fill(1)]); // 30★ < 36★
  assert.equal(lockReason(ch3low, 21).reason, 'stars');
  assert.ok(isUnlocked(ch3low, 20));                        // gesperrt wird nur der Kapitelanfang
});

import { useHammer, emptyInventory, loadInventory, saveInventory, spendTool, grantGifts } from '../game/campaign.mjs';

test('Hammer entfernt einen Stein, kostet keinen Zug, deckelt auf 2★', () => {
  const run = createLevelRun(base());
  assert.equal(useHammer(run, 2, 2), false);            // leeres Feld
  assert.equal(useHammer(run, 0, 1), true);
  assert.equal(run.board[0][1], null);
  assert.equal(run.moves, 0);
  assert.deepEqual(run.toolsUsed, ['hammer']);
  assert.equal(run.level.board[0][1], 1);                // Level-Daten unverändert
});

test('Inventar: laden, speichern, verbrauchen', () => {
  const mem = new Map(); const storage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.deepEqual(loadInventory(storage), emptyInventory());
  const inv = { ...emptyInventory(), extraMoves: 1 };
  saveInventory(inv, storage);
  assert.deepEqual(loadInventory(storage), inv);
  assert.equal(spendTool(inv, 'hammer'), null);
  assert.equal(spendTool(inv, 'extraMoves').extraMoves, 0);
  assert.deepEqual(loadInventory({ getItem: () => '{"version":1,"gifts":[],"extraMoves":-3}' }).extraMoves, 0);
});

test('Geschenke: Level 10, Level 20, je 10 Sterne – jeweils nur einmal', () => {
  let p = emptyProgress();
  for (let n = 1; n <= 9; n++) p = recordResult(p, n, { stars: 1, moves: 5, now: 1 });   // 9★
  let r = grantGifts(emptyInventory(), p);
  assert.deepEqual(r.granted, []);
  p = recordResult(p, 10, { stars: 2, moves: 5, now: 1 });                                // 11★, Level 10
  r = grantGifts(r.inventory, p);
  assert.deepEqual(r.granted.map(g => g.id), ['level-10', 'stars-10']);
  assert.equal(r.inventory.extraMoves, 2);
  assert.deepEqual(grantGifts(r.inventory, p).granted, []);                               // nicht doppelt
  for (let n = 11; n <= 20; n++) p = recordResult(p, n, { stars: 1, moves: 5, now: 1 });  // 21★, Level 20
  r = grantGifts(r.inventory, p);
  assert.deepEqual(r.granted.map(g => g.id), ['level-20', 'stars-20']);
  assert.equal(r.inventory.hammer, 2);
});

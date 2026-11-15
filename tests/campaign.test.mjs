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
  markToolUsed(run, 'rocket');
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

import { FREE_TOOLS_PER_LEVEL, TOOL_STOCK, freeToolCharges, toolsAvailable, spendCharge } from '../game/campaign.mjs';
import { useRocket, useWand, wandChoices, wandCap, progressVector, emptyInventory, loadInventory, saveInventory, spendTool, grantGifts, toolName } from '../game/campaign.mjs';
import { findHint, hintState } from '../game/hint-solver.mjs';
import { readFileSync } from 'node:fs';

test('Rakete entfernt einen Stein, kostet keinen Zug, deckelt auf 2★', () => {
  const run = createLevelRun(base());
  assert.equal(useRocket(run, 2, 2), false);            // leeres Feld
  assert.equal(useRocket(run, 0, 1), true);
  assert.equal(run.board[0][1], null);
  assert.equal(run.moves, 0);
  assert.deepEqual(run.toolsUsed, ['rocket']);
  assert.equal(run.level.board[0][1], 1);                // Level-Daten unverändert
});

test('Inventar: laden, speichern, verbrauchen; alter Hammer wird Rakete', () => {
  const mem = new Map(); const storage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.deepEqual(loadInventory(storage), emptyInventory());
  const inv = { ...emptyInventory(), extraMoves: 1, hint: 2 };
  saveInventory(inv, storage);
  assert.deepEqual(loadInventory(storage), inv);
  assert.equal(spendTool(inv, 'rocket'), null);
  assert.equal(spendTool(inv, 'hammer'), null);
  assert.equal(spendTool(inv, 'hint').hint, 1);
  assert.deepEqual(loadInventory({ getItem: () => '{"version":1,"gifts":[],"extraMoves":-3}' }).extraMoves, 0);
  const old = loadInventory({ getItem: () => '{"version":1,"extraMoves":1,"hammer":2,"gifts":["level-10","stars-20"]}' });
  assert.deepEqual(old, { version: 2, extraMoves: 1, rocket: 2, hint: 0, wand: 0, gifts: ['level-10', 'stars-20'] });
  assert.equal(toolName('rocket'), 'Rakete'); assert.equal(toolName('wand'), 'Zauberstab'); assert.equal(toolName('hint'), 'Hinweis');
});

test('Geschenke: Level 3/6/10/20 und je 10 Sterne im Wechsel – jeweils nur einmal', () => {
  let p = emptyProgress();
  for (let n = 1; n <= 9; n++) p = recordResult(p, n, { stars: 1, moves: 5, now: 1 });   // 9★
  let r = grantGifts(emptyInventory(), p);
  assert.deepEqual(r.granted.map(g => g.id), ['level-3', 'level-6']);
  assert.equal(r.inventory.hint, 1); assert.equal(r.inventory.wand, 1);
  p = recordResult(p, 10, { stars: 2, moves: 5, now: 1 });                                // 11★, Level 10
  r = grantGifts(r.inventory, p);
  assert.deepEqual(r.granted.map(g => g.id), ['level-10', 'stars-10']);
  assert.equal(r.inventory.extraMoves, 2);
  assert.deepEqual(grantGifts(r.inventory, p).granted, []);                               // nicht doppelt
  for (let n = 11; n <= 20; n++) p = recordResult(p, n, { stars: 1, moves: 5, now: 1 });  // 21★, Level 20
  r = grantGifts(r.inventory, p);
  assert.deepEqual(r.granted.map(g => g.id), ['level-20', 'stars-20']);
  assert.equal(r.inventory.rocket, 2);
  for (let n = 1; n <= 20; n++) p = recordResult(p, n, { stars: 2, moves: 4, now: 2 });   // 40★
  r = grantGifts(r.inventory, p);
  assert.deepEqual(r.granted, [{ id: 'stars-30', type: 'hint' }, { id: 'stars-40', type: 'wand' }]);
  // Alter Spielstand mit Hammer-Geschenk: kein doppeltes Geschenk
  const migrated = loadInventory({ getItem: () => '{"version":1,"extraMoves":0,"hammer":1,"gifts":["level-10","level-20","stars-10","stars-20"]}' });
  assert.deepEqual(grantGifts(migrated, p).granted.map(g => g.id), ['level-3', 'level-6', 'stars-30', 'stars-40']);
});

test('Zauberstab: Zahlen 1 … Zielwert, nicht der aktuelle Wert, kein Sofort-Sieg; danach normale Fusion', () => {
  // Ziel 4er; Brett: 3 3 1 . .
  const lv = base({ board: [[3, 3, 1, E, E], [E, E, E, E, E], [E, E, E, E, E], [E, E, E, E, E], [E, E, E, E, E]],
    goals: [{ type: 'tile', value: 4 }], moves: 3, stars: { three: 1, two: 2 } });
  const run = createLevelRun(lv);
  assert.equal(wandCap(run), 4);
  // 1 → 3 würde 3,3,3 verbinden und sofort den 4er erzeugen → gesperrt; der Zielwert 4 selbst ist erlaubt (gewinnt nicht sofort)
  assert.deepEqual(wandChoices(run, 0, 2), [2, 4]);
  assert.deepEqual(wandChoices(run, 0, 0), [1, 2, 4]);
  assert.deepEqual(wandChoices(run, 2, 2), []);              // leeres Feld
  assert.equal(useWand(run, 0, 2, 3).ok, false);
  const id = run.board[0][2].id;
  assert.equal(useWand(run, 0, 2, 2).ok, true);
  assert.equal(run.board[0][2].value, 2); assert.equal(run.board[0][2].id, id);
  assert.equal(run.moves, 0); assert.deepEqual(run.toolsUsed, ['wand']); assert.equal(run.status, 'playing');
  // Fusion nach dem Zauberstab: Ziel 5er, 2 2 1 → 1 wird 2 → drei 2er fusionieren zu 3
  const lv2 = base({ board: [[2, 2, 1, E, E], [E, E, E, E, E], [E, E, E, E, E], [E, E, E, E, E], [E, E, E, E, E]],
    goals: [{ type: 'tile', value: 5 }], moves: 3, stars: { three: 1, two: 2 } });
  const run2 = createLevelRun(lv2);
  const res = useWand(run2, 0, 2, 2);
  assert.ok(res.ok);
  assert.equal(run2.board.flat().filter(Boolean).length, 1);
  assert.equal(run2.board.flat().find(Boolean).value, 3);
  assert.ok(run2.merges >= 1 && run2.score > 0);
  // Ohne tile/make-Ziel: höchster Wert auf Brett/Vorschau
  const run3 = createLevelRun(base({ goals: [{ type: 'score', points: 999 }], sequence: [1, 5, 3] }));
  assert.equal(wandCap(run3), 5);
  // Erzeuge-Ziel 2er (wie Level 5/8): Zielwert 2 wird angeboten, außer er gewinnt sofort
  const run4 = createLevelRun(base({ board: [[1, E, E, E, E], [E, E, E, E, E], [E, E, E, E, E], [E, E, E, E, E], [E, E, E, E, E]],
    goals: [{ type: 'make', value: 2, count: 3 }] }));
  assert.equal(wandCap(run4), 2);
  assert.deepEqual(wandChoices(run4, 0, 0), [2]);
  const run5 = createLevelRun(base({ board: [[2, 2, 1, E, E], [E, E, E, E, E], [E, E, E, E, E], [E, E, E, E, E], [E, E, E, E, E]],
    goals: [{ type: 'tile', value: 3 }] }));
  assert.deepEqual(wandChoices(run5, 0, 2), [3]);          // 2 würde 2,2,2 → 3er = Sofort-Sieg → gesperrt
});

test('Hinweis-Suche: kürzester Weg wie der Solver, Züge gewinnen wirklich; kein Weg wird erkannt', () => {
  const levels = JSON.parse(readFileSync(new URL('../levels/levels-001-025.json', import.meta.url), 'utf8')).levels;
  for (const lv of levels) {
    const run = createLevelRun(lv);
    const h = findHint(hintState(run, { movesLeft: movesLeft(run), vec: progressVector(run) }));
    assert.ok(h.found && h.exact, `Level ${lv.id}`);
    assert.equal(h.minMoves, lv.meta.minMoves, `Level ${lv.id}: Optimum`);
    assert.equal(h.moves.length, Math.min(2, h.minMoves));
    // Hinweis-Züge spielen, dann jeweils neu suchen, bis gewonnen – darf nie länger als das Optimum dauern
    let guard = 0;
    while (run.status === 'playing' && guard++ < 10) {
      const k = findHint(hintState(run, { movesLeft: movesLeft(run), vec: progressVector(run) }));
      assert.ok(k.found, `Level ${lv.id}: Weg verloren`);
      for (const ch of k.moves) { const m = decodeMove(ch); applyLevelMove(run, m.direction, m.line); }
    }
    assert.equal(run.status, 'won'); assert.equal(run.moves, lv.meta.minMoves, `Level ${lv.id}: Hinweise spielen optimal`);
  }
  // Kein Weg: zu wenig Züge übrig
  const lv = levels[24], run = createLevelRun(lv);
  const none = findHint(hintState(run, { movesLeft: lv.meta.minMoves - 1, vec: progressVector(run) }));
  assert.equal(none.found, false); assert.equal(none.reason, 'none');
  // Budget: Beam statt Absturz
  const tight = findHint(hintState(run, { movesLeft: movesLeft(run), vec: progressVector(run) }), { maxStates: 50, beamWidth: 30 });
  assert.equal(tight.exact, false);
});

test('Test-Einstellung launch-11: je Versuch 1× jedes Hilfsmittel, kein Vorrat', () => {
  assert.equal(FREE_TOOLS_PER_LEVEL, 1); assert.equal(TOOL_STOCK, false);
  const free = freeToolCharges();
  assert.deepEqual(free, { extraMoves: 1, rocket: 1, hint: 1, wand: 1 });
  const stock = { ...emptyInventory(), rocket: 3, hint: 2 };
  // ohne Vorrat: nur die Ladungen des Versuchs zählen, Inventar bleibt unberührt
  assert.deepEqual(toolsAvailable(stock, free), { extraMoves: 1, rocket: 1, hint: 1, wand: 1 });
  const a = spendCharge(stock, free, 'rocket');
  assert.equal(a.fromFree, true); assert.equal(a.inventory, stock); assert.equal(a.free.rocket, 0);
  assert.equal(spendCharge(stock, a.free, 'rocket'), null);
  assert.deepEqual(toolsAvailable(stock, a.free).rocket, 0);
  assert.equal(spendCharge(stock, free, 'hammer'), null);
  // neuer Versuch = wieder volle Ladungen
  assert.deepEqual(freeToolCharges(), free);
  // Schalter zurück (Vorrat an, 0 gratis): altes Verhalten
  const none = freeToolCharges(0);
  assert.deepEqual(toolsAvailable(stock, none, true), { extraMoves: 0, rocket: 3, hint: 2, wand: 0 });
  const b = spendCharge(stock, none, 'hint', true);
  assert.equal(b.fromFree, false); assert.equal(b.inventory.hint, 1);
  // beides an: erst gratis, dann Vorrat
  assert.equal(toolsAvailable(stock, free, true).rocket, 4);
  assert.equal(spendCharge(stock, free, 'rocket', true).fromFree, true);
});

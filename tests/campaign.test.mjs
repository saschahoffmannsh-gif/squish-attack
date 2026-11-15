import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLevelRun, applyLevelMove, starsFor, replaySolution, goalProgress, queueOf, movesLeft,
  validateLevel, encodeMove, decodeMove, recordResult, mergeProgress, emptyProgress, isUnlocked,
  nextLevel, totalStars, loadProgress, saveProgress, goalText, starThresholds, starsOfRun, addExtraMoves,
  markToolUsed, moveLimit, lockReason, chapterOf, starGate, CHAPTER_SIZE, STARS_PER_CHAPTER_GATE,
  resetChangedStarsOnce, STARS_RESET, STARS_RESET_KEY,
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

import { FREE_TOOLS_PER_LEVEL, TOOL_STOCK, freeToolCharges, toolsAvailable, spendCharge, queueGifts, collectGift, addToStock } from '../game/campaign.mjs';
import { SHOP_CONFIG, shopProducts, formatPrice, purchase, activeStore, registerNativeStore } from '../game/shop.mjs';
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
  assert.deepEqual(old, { version: 3, extraMoves: 1, rocket: 2, hint: 0, wand: 0, gifts: ['level-10', 'stars-20'], pending: [] });
  assert.equal(toolName('rocket'), 'Rakete'); assert.equal(toolName('wand'), 'Zauberstab'); assert.equal(toolName('hint'), 'Hinweis');
});

test('Geschenke (launch-14): nur Level 3/6/10/20, keine Sterne-Geschenke – jeweils nur einmal', () => {
  let p = emptyProgress();
  for (let n = 1; n <= 9; n++) p = recordResult(p, n, { stars: 3, moves: 5, now: 1 });   // 27★
  let r = grantGifts(emptyInventory(), p);
  assert.deepEqual(r.granted.map(g => g.id), ['level-3', 'level-6']);                      // trotz 27★ kein Sterne-Geschenk
  assert.equal(r.inventory.hint, 1); assert.equal(r.inventory.wand, 1);
  p = recordResult(p, 10, { stars: 3, moves: 5, now: 1 });
  r = grantGifts(r.inventory, p);
  assert.deepEqual(r.granted.map(g => g.id), ['level-10']);
  assert.equal(r.inventory.extraMoves, 1);
  assert.deepEqual(grantGifts(r.inventory, p).granted, []);                               // nicht doppelt
  for (let n = 11; n <= 25; n++) p = recordResult(p, n, { stars: 3, moves: 4, now: 2 });  // 75★
  r = grantGifts(r.inventory, p);
  assert.deepEqual(r.granted, [{ id: 'level-20', type: 'rocket' }]);
  assert.ok(!r.inventory.gifts.some(id => id.startsWith('stars-')));
  // Alter Spielstand: vergebene Geschenke bleiben vergeben, offene Sterne-Geschenke fallen weg
  const migrated = loadInventory({ getItem: () => '{"version":3,"extraMoves":0,"rocket":0,"hint":0,"wand":0,"gifts":["level-10","stars-10"],"pending":[{"id":"stars-10","type":"wand"},{"id":"level-10","type":"extraMoves"}]}' });
  assert.deepEqual(migrated.pending, [{ id: 'level-10', type: 'extraMoves' }]);
  assert.deepEqual(grantGifts(migrated, p).granted.map(g => g.id), ['level-3', 'level-6', 'level-20']);
  assert.equal(giftLevel('level-20'), 20); assert.equal(giftLevel('stars-10'), null);
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

test('Ladungen je Versuch (launch-11) + Vorrat (launch-12): zuerst gratis, dann Vorrat', () => {
  assert.equal(TOOL_STOCK, true);
  const free = freeToolCharges(1);
  assert.deepEqual(free, { extraMoves: 1, rocket: 1, hint: 1, wand: 1 });
  const stock = { ...emptyInventory(), rocket: 3, hint: 2 };
  assert.deepEqual(toolsAvailable(stock, free), { extraMoves: 1, rocket: 4, hint: 3, wand: 1 });
  const a = spendCharge(stock, free, 'rocket');
  assert.equal(a.fromFree, true); assert.equal(a.inventory, stock); assert.equal(a.free.rocket, 0);
  const b = spendCharge(a.inventory, a.free, 'rocket');
  assert.equal(b.fromFree, false); assert.equal(b.inventory.rocket, 2);
  assert.equal(spendCharge(stock, a.free, 'wand') !== null, true);
  const w = spendCharge(stock, { ...free, wand: 0 }, 'wand');
  assert.equal(w, null);                                        // weder gratis noch Vorrat
  assert.equal(spendCharge(stock, free, 'hammer'), null);
  assert.deepEqual(freeToolCharges(1), free);                   // neuer Versuch = wieder volle Ladungen
  // Schalter: ohne Vorrat zählt nur gratis
  assert.deepEqual(toolsAvailable(stock, free, false), { extraMoves: 1, rocket: 1, hint: 1, wand: 1 });
  assert.equal(spendCharge(stock, a.free, 'rocket', false), null);
  // ohne Gratis-Ladungen: altes Verhalten
  assert.deepEqual(toolsAvailable(stock, freeToolCharges(0)), { extraMoves: 0, rocket: 3, hint: 2, wand: 0 });
});

test('Geschenke als offene Pakete: einreihen, einzeln einsammeln, gespeichert, nie doppelt', () => {
  let p = emptyProgress();
  for (let n = 1; n <= 10; n++) p = recordResult(p, n, { stars: 1, moves: 5, now: 1 });   // 10★, Level 3/6/10
  let q = queueGifts(emptyInventory(), p);
  assert.deepEqual(q.queued.map(g => g.id), ['level-3', 'level-6', 'level-10']);
  assert.deepEqual(q.inventory.pending, q.queued);
  assert.equal(q.inventory.hint, 0);                                                      // noch nicht gutgeschrieben
  assert.deepEqual(queueGifts(q.inventory, p).queued, []);                                // nicht doppelt
  const mem = new Map(); const storage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  saveInventory(q.inventory, storage);
  let inv = loadInventory(storage);
  assert.deepEqual(inv.pending.map(g => g.id), ['level-3', 'level-6', 'level-10']);   // bleibt bis zum Einsammeln
  const c = collectGift(inv);
  assert.deepEqual(c.gift, { id: 'level-3', type: 'hint' });
  assert.equal(c.inventory.hint, 1); assert.equal(c.inventory.pending.length, 2);
  const d = collectGift(c.inventory, 'level-10');
  assert.equal(d.inventory.extraMoves, 1); assert.deepEqual(d.inventory.pending.map(g => g.id), ['level-6']);
  assert.equal(collectGift(d.inventory, 'nope'), null);
  assert.equal(collectGift(emptyInventory()), null);
  assert.deepEqual(queueGifts(d.inventory, p).queued, []);                                // eingesammelt = vergeben
  // kaputte Einträge werden beim Laden verworfen
  const bad = loadInventory({ getItem: () => '{"version":3,"gifts":[],"pending":[{"id":"x","type":"hammer"},{"id":"y","type":"wand"},null]}' });
  assert.deepEqual(bad.pending, [{ id: 'y', type: 'wand' }]);
  assert.deepEqual(addToStock(emptyInventory(), { rocket: 3, hammer: 2, wand: -1 }).rocket, 3);
});

test('Shop: eine Preistabelle, Testkauf legt in den Vorrat, Schnittstelle für nativen Store', async () => {
  assert.equal(SHOP_CONFIG.testPurchases, true);
  assert.equal(SHOP_CONFIG.enabled, false);                     // launch-13 Testphase: Shop versteckt
  assert.equal((await purchase('hint-3')).ok, false);           // ausgeschaltet = kein Kauf
  const on = { ...SHOP_CONFIG, enabled: true };
  const ps = shopProducts();
  assert.equal(ps.length, 4 * SHOP_CONFIG.packs.length + SHOP_CONFIG.bundles.length);
  assert.deepEqual(ps.filter(p => p.type === 'rocket').map(p => [p.id, p.items.rocket, p.price]), [['rocket-1', 1, 0.99], ['rocket-3', 3, 2.49], ['rocket-5', 5, 3.99]]);
  assert.match(formatPrice(2.49), /^2,49\s?€$/);
  const r = await purchase('hint-3', { config: on });
  assert.ok(r.ok && r.test); assert.deepEqual(r.items, { hint: 3 });
  assert.equal(addToStock(emptyInventory(), r.items).hint, 3);
  const mix = await purchase('bundle-mix', { config: on });
  assert.deepEqual(mix.items, { extraMoves: 2, hint: 2, rocket: 2, wand: 2 });
  assert.equal((await purchase('gibts-nicht', { config: on })).ok, false);
  // ohne Testkauf und ohne nativen Store: nichts verfügbar
  const off = { ...on, testPurchases: false };
  assert.equal(activeStore(off).kind, 'none');
  assert.equal((await purchase('hint-1', { config: off })).ok, false);
  // nativer Store (später Capacitor): wird bevorzugt, Abbruch gibt nichts
  registerNativeStore({ name: 'fake', purchase: async p => (p.id === 'wand-1' ? { ok: true, transactionId: 't1' } : { ok: false, reason: 'cancelled' }) });
  try {
    assert.equal(activeStore(on).kind, 'native');
    const n = await purchase('wand-1', { config: on });
    assert.ok(n.ok && !n.test && n.transactionId === 't1');
    assert.equal((await purchase('wand-3', { config: on })).ok, false);
  } finally { registerNativeStore(null); }
  assert.equal(activeStore().kind, 'test');
});

import { AD_TOOLS, TOOL_GIFTS, giftLevel, resetStockOnce, TOOL_RESET_KEY, loadInventory as loadInv13 } from '../game/campaign.mjs';
import { loadLog, saveLog, startAttempt, logEvent, endAttempt, reopenAttempt, summarize, exportLog, emptyLog, TOOL_LOG_KEY } from '../game/tool-log.mjs';
const memStore = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m }; };

test('Testphase-Schalter (launch-14): keine Gratis-Ladungen, Werbung an, Level-Geschenke an', () => {
  assert.equal(FREE_TOOLS_PER_LEVEL, 0);
  assert.deepEqual(freeToolCharges(), { extraMoves: 0, rocket: 0, hint: 0, wand: 0 });
  assert.equal(AD_TOOLS, true); assert.equal(TOOL_GIFTS, true);
  assert.deepEqual(toolsAvailable(emptyInventory(), freeToolCharges()), { extraMoves: 0, rocket: 0, hint: 0, wand: 0 });
});

test('launch-13: Vorrat wird einmalig geleert (auch offene Geschenke), vergebene Geschenk-ids bleiben', () => {
  const st = memStore();
  const inv = { ...emptyInventory(), rocket: 4, hint: 2, wand: 1, extraMoves: 3, gifts: ['level-3', 'stars-10'], pending: [{ id: 'stars-10', type: 'wand' }] };
  saveInventory(inv, st);
  const a = resetStockOnce(loadInv13(st), st);
  assert.equal(a.reset, true);
  assert.deepEqual([a.inventory.extraMoves, a.inventory.rocket, a.inventory.hint, a.inventory.wand], [0, 0, 0, 0]);
  assert.deepEqual(a.inventory.pending, []); assert.deepEqual(a.inventory.gifts, ['level-3', 'stars-10']);
  assert.equal(loadInv13(st).rocket, 0);                         // gespeichert
  assert.equal(st.getItem(TOOL_RESET_KEY), 'launch-13');
  // danach per Werbung geholt → bleibt beim nächsten Laden erhalten
  saveInventory(addToStock(a.inventory, { hint: 1 }), st);
  const b = resetStockOnce(loadInv13(st), st);
  assert.equal(b.reset, false); assert.equal(b.inventory.hint, 1);
});

test('launch-13: Werkzeug-Protokoll – Versuche, Werbung, Einsatz mit Kontext, Ausgang nachgetragen', () => {
  const st = memStore();
  const log = loadLog(st);
  assert.deepEqual([log.attempts.length, log.events.length], [0, 0]);
  const a1 = startAttempt(log, 7, { limit: 7, t: 't0' });
  assert.equal(a1.attempt, 1);
  const ctx = { move: 3, movesLeft: 4, progress: [{ type: 'tile', current: 4, target: 5 }], where: 'level' };
  const ad = logEvent(log, a1.id, 'ad', 'wand', ctx, 't1');
  const use = logEvent(log, a1.id, 'use', 'wand', ctx, 't2');
  assert.equal(logEvent(log, a1.id, 'use', 'hammer', ctx), null);  // unbekannt
  assert.deepEqual([ad.level, ad.attempt, ad.move, ad.movesLeft, ad.outcome], [7, 1, 3, 4, null]);
  endAttempt(log, a1.id, { outcome: 'lost', moves: 7, lostReason: 'moves', t: 't3' });
  assert.equal(use.outcome, 'lost'); assert.equal(ad.outcome, 'lost');
  // Weiterspielen mit +3 nach Niederlage: wieder offen, dann gewonnen
  reopenAttempt(log, a1.id);
  assert.equal(use.outcome, null); assert.equal(a1.outcome, null);
  logEvent(log, a1.id, 'ad', 'extraMoves', { ...ctx, where: 'result' });
  logEvent(log, a1.id, 'use', 'extraMoves', ctx);
  endAttempt(log, a1.id, { outcome: 'won', moves: 9, stars: 1 });
  endAttempt(log, a1.id, { outcome: 'lost' });                    // zweites Ende ändert nichts
  assert.equal(a1.outcome, 'won'); assert.ok(log.events.every(e => e.outcome === 'won'));
  const a2 = startAttempt(log, 7); assert.equal(a2.attempt, 2);
  endAttempt(log, a2.id, { outcome: 'quit' });
  const a3 = startAttempt(log, 8); endAttempt(log, a3.id, { outcome: 'won', moves: 4, stars: 3 });
  const sm = summarize(log);
  assert.deepEqual(sm.levels.map(l => [l.level, l.attempts, l.wins, l.losses, l.quits]), [[7, 2, 1, 0, 1], [8, 1, 1, 0, 0]]);
  assert.deepEqual(sm.levels[0].use, { extraMoves: 1, rocket: 0, hint: 0, wand: 1 });
  assert.deepEqual(sm.levels[0].ads, { extraMoves: 1, rocket: 0, hint: 0, wand: 1 });
  assert.equal(sm.total.attempts, 3); assert.equal(sm.levels[1].bestStars, 3);
  assert.deepEqual(a1.tools, ['wand', 'extraMoves']); assert.equal(a1.ads, 2);
  // speichern / laden / exportieren / zurücksetzen
  assert.ok(saveLog(log, st));
  const back = loadLog(st);
  assert.equal(back.events.length, 4); assert.equal(back.attempts.length, 3);
  const ex = JSON.parse(exportLog(back, { build: 'launch-13' }));
  assert.equal(ex.kind, 'tool-log'); assert.equal(ex.build, 'launch-13'); assert.equal(ex.summary.total.attempts, 3); assert.equal(ex.log.events.length, 4);
  saveLog(emptyLog(), st);
  assert.equal(loadLog(st).attempts.length, 0);
  st.setItem(TOOL_LOG_KEY, '{kaputt'); assert.equal(loadLog(st).events.length, 0);
});

test('launch-13: Werkzeuge deckeln weiterhin auf 2 Sterne', () => {
  assert.equal(starsFor({ stars: { three: 3, two: 5 } }, 3, true, { toolsUsed: 1 }), 2);
  assert.equal(starsFor({ stars: { three: 3, two: 5 } }, 3, true, { toolsUsed: 0 }), 3);
});

test('launch-14: Geschenk-Gutschriften im Protokoll mit Quelle „gift“, getrennt von Werbung', () => {
  const log = emptyLog();
  const a = startAttempt(log, 3);
  endAttempt(log, a.id, { outcome: 'won', moves: 2, stars: 3 });
  const g = logEvent(log, a.id, 'gift', 'hint', { where: 'result', giftId: 'level-3', giftLevel: 3 });
  const ad = logEvent(log, null, 'ad', 'rocket', { level: 4, where: 'level' });
  const u = logEvent(log, null, 'use', 'hint', { level: 4 });
  assert.deepEqual([g.kind, g.source, g.level, g.giftId, g.outcome], ['gift', 'gift', 3, 'level-3', 'won']);
  assert.equal(ad.source, 'ad'); assert.equal(u.source, null);
  assert.equal(a.gifts, 1); assert.equal(a.ads, 0);
  // Geschenk aus dem Menü (kein Versuch offen) zählt beim Geschenk-Level
  logEvent(log, null, 'gift', 'wand', { where: 'menu', giftId: 'level-6', giftLevel: 6 });
  const sm = summarize(log);
  assert.deepEqual(sm.total.gifts, { extraMoves: 0, rocket: 0, hint: 1, wand: 1 });
  assert.deepEqual(sm.total.ads, { extraMoves: 0, rocket: 1, hint: 0, wand: 0 });
  assert.deepEqual(sm.levels.map(l => l.level), [3, 4, 6]);
  assert.equal(sm.levels[0].gifts.hint, 1); assert.equal(sm.levels[2].gifts.wand, 1);
});

import { isUnlocked as isUnl14, resetCampaignOnce, CAMPAIGN_RESET_KEY, CAMPAIGN_RESET, PROGRESS_KEY as PK14, loadProgress as loadP14, emptyProgress as emptyP14 } from '../game/campaign.mjs';
test('launch-14: Abenteuer einmalig zurückgesetzt (Fortschritt + Geschenke), Rest bleibt, kein zweites Mal', () => {
  const st = memStore();
  const won = n => ({ version: 1, updatedAt: 5, levels: Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), { stars: 1 + (i % 3), moves: 7, at: 1 }])) });
  st.setItem(PK14, JSON.stringify(won(12)));
  st.setItem('squish-next-run-v1', '{"board":1}'); st.setItem('squish-rank-v1', '{"best":900}'); st.setItem('squish-sound-v1', 'x'); st.setItem(TOOL_LOG_KEY, '{"keep":1}');
  const inv = { ...emptyInventory(), wand: 1, gifts: ['level-3', 'level-6', 'level-10', 'stars-10'], pending: [{ id: 'level-10', type: 'extraMoves' }] };
  saveInventory(inv, st);
  const r = resetCampaignOnce(loadP14(st), loadInventory(st), st);
  assert.equal(r.reset, true);
  assert.deepEqual(r.progress.levels, {});
  assert.deepEqual(loadP14(st).levels, {});
  const li = loadInventory(st);
  assert.deepEqual(li.gifts, []); assert.deepEqual(li.pending, []); assert.equal(li.wand, 1);   // Vorrat bleibt
  assert.equal(st.getItem(CAMPAIGN_RESET_KEY), CAMPAIGN_RESET);
  for (const [k, v] of [['squish-next-run-v1', '{"board":1}'], ['squish-rank-v1', '{"best":900}'], ['squish-sound-v1', 'x'], [TOOL_LOG_KEY, '{"keep":1}']]) assert.equal(st.getItem(k), v, k);
  // Level 1 frei, Level 2 gesperrt
  assert.equal(isUnl14(r.progress, 1), true); assert.equal(isUnl14(r.progress, 2), false);
  // nach Reset: Level 3 geschafft → Geschenk kommt wieder
  const p3 = { ...emptyP14(), levels: { 1: { stars: 3 }, 2: { stars: 3 }, 3: { stars: 3 } } };
  assert.deepEqual(queueGifts(li, p3).queued, [{ id: 'level-3', type: 'hint' }]);
  // Neuladen: kein zweiter Reset
  st.setItem(PK14, JSON.stringify(p3));
  const again = resetCampaignOnce(loadP14(st), li, st);
  assert.equal(again.reset, false); assert.equal(Object.keys(loadP14(st).levels).length, 3);
  // frisches Gerät: nur Merker
  const st2 = memStore(); const f = resetCampaignOnce(emptyP14(), emptyInventory(), st2);
  assert.equal(f.reset, true); assert.equal(st2.getItem(CAMPAIGN_RESET_KEY), CAMPAIGN_RESET);
});

// ---------------- launch-15: neue Missionen, Werkzeug-Level ----------------
import { tally, vanished, goalShort, advanceGoals, toolStars, TOOL_KEYS, GOAL_TYPES } from '../game/campaign.mjs';
import { settle as settle15 } from '../game/game-logic.mjs';
const T15 = v => (v == null ? null : { value: v });
const row15 = r => [r, [E, E, E, E, E], [E, E, E, E, E], [E, E, E, E, E], [E, E, E, E, E]];

test('launch-15: neue Zieltypen empty/long/purge – gültig, Text, Kurztext', () => {
  for (const t of ['empty', 'long', 'purge']) assert.ok(GOAL_TYPES.includes(t));
  assert.ok(!GOAL_TYPES.includes('group'));
  validateLevel(base({ goals: [{ type: 'empty', max: 4 }] }));
  validateLevel(base({ goals: [{ type: 'long', count: 1 }] }));
  validateLevel(base({ goals: [{ type: 'purge', value: 2, tiles: 6 }] }));
  assert.throws(() => validateLevel(base({ goals: [{ type: 'purge', value: 2 }] })));
  assert.throws(() => validateLevel(base({ goals: [{ type: 'empty' }] })));
  assert.match(goalText({ type: 'empty', max: 4 }), /4/);
  assert.match(goalText({ type: 'long', count: 1 }), /4/);
  assert.match(goalText({ type: 'purge', value: 3, tiles: 8 }), /3/);
  // Kurztexte für drei Ziele: knapp (passt in ein Drittel von 375 px)
  for (const g of [{ type: 'empty', max: 4 }, { type: 'long', count: 2 }, { type: 'purge', value: 3, tiles: 8 }, { type: 'score', points: 1200 }, { type: 'make', value: 5, count: 2 }])
    assert.ok(goalShort(g).length <= 18, goalShort(g));
});

test('launch-15: Straße aus 4 zählt als lange Straße; Werte, die verschwinden (purge)', () => {
  const run = createLevelRun(base());
  const s = settle15(row15([1, 2, 3, 4, E]).map(r => r.map(T15)));
  tally(run, s);
  assert.equal(run.streets, 1);
  assert.equal(run.longStreets, 1);
  assert.deepEqual(run.purged, { 1: 1, 2: 1, 3: 1, 4: 1 });      // Zielstein 4 wird zur 5 → auch die 4 verschwindet
  assert.equal(goalProgress({ type: 'long', count: 1 }, run).done, true);
  assert.deepEqual(goalProgress({ type: 'purge', value: 2, tiles: 3 }, run), { current: 1, target: 3, done: false });
  // Straße aus 3: Zielstein bleibt stehen → sein Wert verschwindet nicht
  const s3 = settle15(row15([1, 2, 3, E, E]).map(r => r.map(T15)));
  assert.deepEqual(Object.fromEntries(vanished(s3.passes[0][0])), { 1: 1, 2: 1 });
  const run3 = createLevelRun(base()); tally(run3, s3);
  assert.equal(run3.longStreets, 0);
  // Fusion: alle Steine des Werts verschwinden
  assert.deepEqual(vanished({ street: false, value: 2, cells: [[0, 0], [0, 1], [0, 2]] }), [[2, 3]]);
  // Solver-Zählung = Spiel-Zählung
  const goals = [{ type: 'long', count: 1 }, { type: 'purge', value: 3, tiles: 1 }, { type: 'empty', max: 1 }];
  assert.deepEqual(advanceGoals(goals, [0, 0, 0], s), { vec: [1, 1, 1], win: true });
});

test('launch-15: „höchstens N Steine“ – Stand = Steine auf dem Brett; Rakete kann das Ziel erfüllen', () => {
  const lv = base({ board: row15([1, 3, E, E, 5]), goals: [{ type: 'empty', max: 2 }], stars: { three: 1, two: 2 } });
  const run = createLevelRun(lv);
  assert.deepEqual(goalProgress(lv.goals[0], run), { current: 3, target: 2, done: false });
  assert.ok(useRocket(run, 0, 4));
  assert.equal(run.status, 'won');
  assert.equal(run.moves, 0);
  assert.equal(starsOfRun(run), 2);
});

test('launch-16: Werkzeug-Spitzen – ohne Werkzeug 3★ möglich, mit Hilfsmittel höchstens 2★', () => {
  for (const tool of TOOL_KEYS) {
    const lv = base({ tool, sequence: [1, 2, 3, 4, 5, 6], stars: { three: 1, two: 2 } });
    validateLevel(lv);
    const r = replaySolution(lv, encodeMove('right', 0));
    assert.ok(r.ok);
    assert.equal(r.stars, 3, tool);
    assert.equal(starsFor(lv, 1, true, { toolsUsed: 1 }), 2, tool);
  }
  assert.throws(() => validateLevel(base({ tool: 'hammer' })));
  // +3-Level: 2★-Schwelle darf in den Extra-Zügen liegen, braucht aber Reserve-Steine
  validateLevel(base({ tool: 'extraMoves', moves: 3, sequence: [1, 2, 3, 4, 5, 6], stars: { three: 4, two: 5 } }));
  assert.throws(() => validateLevel(base({ tool: 'extraMoves', moves: 3, sequence: [1, 2, 3, 4], stars: { three: 1, two: 2 } })));
  assert.throws(() => validateLevel(base({ moves: 3, sequence: [1, 2, 3, 4, 5, 6], stars: { three: 4, two: 5 } })));
});

test('launch-15: Sterne-Schwellen für Werkzeug-Level', () => {
  assert.deepEqual(toolStars(7, 5, 'extraMoves'), { three: 7, two: 8 });   // eff 8: Mitte zwischen 7 und 8
  assert.deepEqual(toolStars(3, 7, 'wand'), { three: 3, two: 5 });
  assert.deepEqual(toolStars(5, 5, 'hint'), { three: 5, two: 5 });
});

test('launch-15: 100 Level = 10 Kapitel; Schranke 18★ × (Kapitel − 1) bis Level 91', () => {
  assert.equal(chapterOf(100), 10);
  assert.equal(chapterOf(91), 10);
  assert.equal(chapterOf(90), 9);
  assert.equal(starGate(10), 162);
  const p = emptyProgress();
  for (let n = 1; n <= 90; n++) p.levels[String(n)] = { stars: 2, moves: 5, at: 0 };   // überall 2★ reicht
  assert.equal(lockReason(p, 91), null);
  assert.equal(nextLevel(p, 100), 91);
  p.levels['90'].stars = 1; for (let n = 1; n <= 19; n++) p.levels[String(n)].stars = 1;
  assert.deepEqual(lockReason(p, 91), { reason: 'stars', need: 162, have: 160, chapter: 10 });
});

test('launch-18: Sterne ab Level 11 einmalig zurücksetzen, 1–10 und launch-14-Merker bleiben', () => {
  const st = new Map();
  st.getItem = k => (st.has(k) ? st.get(k) : null);
  st.setItem = (k, v) => st.set(k, v);
  const p0 = emptyProgress();
  for (let n = 1; n <= 20; n++) p0.levels[String(n)] = { stars: 3, moves: 4, at: 0 };
  const a = resetChangedStarsOnce(p0, st);
  assert.equal(a.reset, true);
  assert.equal(STARS_RESET, 'launch-18');
  assert.equal(st.getItem(STARS_RESET_KEY), 'launch-18');
  assert.deepEqual(Object.keys(a.progress.levels).map(Number).sort((x, y) => x - y), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(a.progress.levels['10'].stars, 3);
  const b = resetChangedStarsOnce(a.progress, st);
  assert.equal(b.reset, false);
  assert.equal(Object.keys(b.progress.levels).length, 10);
});

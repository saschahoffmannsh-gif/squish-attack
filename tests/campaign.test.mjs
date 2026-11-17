import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setLang } from '../game/i18n.mjs?v=launch-31';
beforeEach(() => setLang('de', { persist: false }));
import {
  createLevelRun, applyLevelMove, starsFor, replaySolution, goalProgress, queueOf, movesLeft,
  validateLevel, encodeMove, decodeMove, recordResult, mergeProgress, emptyProgress, isUnlocked,
  nextLevel, totalStars, loadProgress, saveProgress, goalText, starThresholds, starsOfRun, addExtraMoves,
  markToolUsed, moveLimit, lockReason, chapterOf, starGate, CHAPTER_SIZE, STARS_PER_CHAPTER_GATE, CHAPTER_QUOTAS_28,
  toolStarCap, tileAt, migrateRules28Once,
  resetChangedStarsOnce, STARS_RESET, STARS_RESET_KEY,
  resetCurveStarsOnce, CURVE_STARS_RESET, CURVE_STARS_RESET_KEY, CURVE_STARS_RESET_IDS, PROGRESS_EPOCH,
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

test('launch-28: ohne Hilfe bis 3★, 1 Hilfe höchstens 2★, mehr als 1 Hilfe 1★ – gelöst nie 0★; Gold ist sternneutral', () => {
  const lv = base({ moves: 6, stars: starThresholds(3, 6) });
  assert.equal(toolStarCap(0), 3);
  assert.equal(toolStarCap(1), 2);
  assert.equal(toolStarCap(2), 1);
  assert.equal(toolStarCap(3), 1);
  assert.equal(toolStarCap(9), 1);
  assert.equal(starsFor(lv, 3, true, { toolsUsed: 0 }), 3);
  assert.equal(starsFor(lv, 3, true, { toolsUsed: 1 }), 2);
  assert.equal(starsFor(lv, 5, true, { toolsUsed: 1 }), 2);
  assert.equal(starsFor(lv, 6, true, { toolsUsed: 1 }), 1);
  assert.equal(starsFor(lv, 6, true, { toolsUsed: 2 }), 1);
  assert.equal(starsFor(lv, 3, true, { toolsUsed: 2 }), 1);
  assert.equal(starsFor(lv, 3, true, { toolsUsed: 3 }), 1);
  assert.equal(starsFor(lv, 3, true, { toolsUsed: 7 }), 1);
  assert.equal(starsFor(lv, 3, false, { toolsUsed: 0 }), 0);
  // +3 verschiebt die Zug-Schwellen mit: 1 Hilfe kann noch 2★ geben
  assert.equal(starsFor(lv, 8, true, { toolsUsed: 1, extraMoves: 3 }), 2);
  const gold = createLevelRun(base());
  markToolUsed(gold, 'rocket', { gift: true });
  applyLevelMove(gold, 'right', 0);
  assert.equal(gold.status, 'won');
  assert.deepEqual(gold.giftsUsed, ['rocket']); assert.deepEqual(gold.toolsUsed, []);
  assert.equal(starsOfRun(gold), 3);
  const run = createLevelRun(base());
  markToolUsed(run, 'rocket');
  applyLevelMove(run, 'right', 0);
  assert.equal(run.status, 'won');
  assert.equal(starsOfRun(run), 2);
});

test('alt (launch-26): 0★-Eintrag wird gespeichert und schaltet das nächste Level (und Modi nach L5) frei', () => {
  let p = emptyProgress();
  p = recordResult(p, 1, { stars: 0, moves: 5, now: 1 });
  assert.equal(p.levels['1'].stars, 0);
  assert.equal(isUnlocked(p, 2), true);
  assert.equal(modesUnlocked(p), false);
  p = recordResult(p, 5, { stars: 0, moves: 8, now: 2 });
  assert.equal(p.levels['5'].stars, 0);
  assert.equal(modesUnlocked(p), true);
  // besserer Lauf überschreibt 0★
  p = recordResult(p, 1, { stars: 2, moves: 4, now: 3 });
  assert.equal(p.levels['1'].stars, 2);
});

test('+3 Züge (launch-28): beliebig oft, Folge läuft weiter, rettet eine Niederlage, 1 Hilfe = max. 2★', () => {
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
  assert.equal(starsOfRun(run), 2);                    // Schwellen + 3 Züge, 1 Hilfe → 2★
  assert.equal(addExtraMoves(run, 3), 0);               // nach dem Sieg nicht mehr
  const run2 = createLevelRun({ ...lv, sequence: [1, 2] });
  assert.equal(addExtraMoves(run2, 3), 3);              // kein Reserve-Limit mehr: die Folge wiederholt sich
  assert.equal(addExtraMoves(run2, 3), 3);
  assert.equal(moveLimit(run2), 7);
  assert.deepEqual(Array.from({ length: 5 }, (_, i) => tileAt(run2.level, i)), [1, 2, 1, 2, 1]);
  assert.equal(run2.toolsUsed.length, 2);
  assert.equal(starsFor(run2.level, 2, true, { toolsUsed: 2, extraMoves: 6 }), 1);
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
  assert.equal(recordResult(p, 2, { stars: -1, moves: 4 }), p); // ungültig: kein Eintrag
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

test('Kapitel (launch-30): 10 Level, Schranke 24★ je Kapitel (kumuliert 24/48/…/216)', () => {
  assert.equal(CHAPTER_SIZE, 10); assert.equal(STARS_PER_CHAPTER_GATE, 18);   // historisch (bis launch-27)
  assert.deepEqual([1, 10, 11, 20, 21, 25, 100].map(chapterOf), [1, 1, 2, 2, 3, 3, 10]);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(starGate), [0, 24, 48, 72, 96, 120, 144, 168, 192, 216]);
  assert.deepEqual([...CHAPTER_QUOTAS_28], [21, 22, 22, 23, 23, 24, 24, 25, 25]);   // historisch
  for (let k = 3; k <= 10; k++) assert.ok(starGate(k) / (k - 1) > starGate(k - 1) / Math.max(1, k - 2) - 1e-9, `Kapitel ${k}: Schnitt fällt nie`);
  for (let k = 2; k <= 10; k++) assert.ok(starGate(k) > 2 * (k - 1) * CHAPTER_SIZE, `Kapitel ${k}: überall 2★ reicht nicht`);
});

test('Freischalten: der Reihe nach', () => {
  const p = withStars([3, 2]);
  assert.ok(isUnlocked(p, 1)); assert.ok(isUnlocked(p, 2)); assert.ok(isUnlocked(p, 3));
  assert.deepEqual(lockReason(p, 4), { reason: 'previous' });
  assert.equal(nextLevel(p, 25), 3);
  assert.equal(nextLevel(emptyProgress(), 25), 1);
});

test('Freischalten (launch-30): Sterne-Schranke am Kapitelanfang; offene Kapitel bleiben offen', () => {
  const low = withStars([3, 3, 3, 2, 2, 2, 2, 2, 2, 2]);   // 23★ < 24★: überall 2★ reicht nicht
  assert.deepEqual(lockReason(low, 11), { reason: 'stars', need: 24, have: 23, chapter: 2 });
  assert.equal(nextLevel(low, 25), 10);                     // alles geschafft, Kapitel 2 noch zu
  const ok = withStars([3, 3, 3, 3, 2, 2, 2, 2, 2, 2]);     // 24★: mindestens vier Level ohne Hilfe
  assert.ok(isUnlocked(ok, 11));
  assert.ok(!isUnlocked(ok, 12));                           // innerhalb des Kapitels weiter der Reihe nach
  const ch3 = withStars([...Array(8).fill(3), ...Array(12).fill(2)]);   // 48★
  assert.ok(isUnlocked(ch3, 21));
  const ch3low = withStars([...Array(10).fill(3), ...Array(10).fill(1)]); // 40★ < 48★
  assert.equal(lockReason(ch3low, 21).reason, 'stars');
  assert.ok(isUnlocked(ch3low, 20));                        // gesperrt wird nur der Kapitelanfang
  // schon gespielt bzw. vor launch-28 offen (openChapters): keine neue Sperre
  assert.equal(lockReason({ ...ch3low, openChapters: [3] }, 21), null);
  const played = withStars([...Array(10).fill(1), 1]);      // Level 11 schon gespielt, 11★
  assert.equal(lockReason(played, 11), null);
});

import { FREE_TOOLS_PER_LEVEL, TOOL_STOCK, goldStock, spendGold, ADVENTURE_TOOLS, LEVEL_GIFTS, queueGifts, collectGift, addToStock } from '../game/campaign.mjs';
import { SHOP_CONFIG, shopProducts, formatPrice, purchase, activeStore, registerNativeStore, productById } from '../game/shop.mjs';
import { useRocket, progressVector, emptyInventory, loadInventory, saveInventory, spendTool, grantGifts, toolName } from '../game/campaign.mjs';
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
  assert.equal(toolName('rocket'), 'Rakete'); assert.equal(toolName('extraMoves'), '+3 Züge');
});

test('Gold-Geschenke (launch-28): nur nach Level 3, 10, 20, 30, 50, 75, 100 – je einmal, nur Rakete/+3', () => {
  assert.deepEqual(LEVEL_GIFTS.map(([n]) => n), [3, 10, 20, 30, 50, 75, 100]);
  assert.ok(LEVEL_GIFTS.every(([, ty]) => ADVENTURE_TOOLS.includes(ty)));
  let p = emptyProgress();
  for (let n = 1; n <= 9; n++) p = recordResult(p, n, { stars: 3, moves: 5, now: 1 });   // 27★
  let r = grantGifts(emptyInventory(), p);
  assert.deepEqual(r.granted.map(g => g.id), ['gold-3']);                                 // kein Sterne-Geschenk, kein Level 6 mehr
  assert.equal(r.inventory.rocket, 1);
  p = recordResult(p, 10, { stars: 3, moves: 5, now: 1 });
  r = grantGifts(r.inventory, p);
  assert.deepEqual(r.granted.map(g => g.id), ['gold-10']);
  assert.equal(r.inventory.extraMoves, 1);
  assert.deepEqual(grantGifts(r.inventory, p).granted, []);                               // nicht doppelt (auch nicht beim Wiederholen)
  p = recordResult(p, 10, { stars: 3, moves: 4, now: 3 });
  assert.deepEqual(grantGifts(r.inventory, p).granted, []);
  for (let n = 11; n <= 25; n++) p = recordResult(p, n, { stars: 3, moves: 4, now: 2 });
  r = grantGifts(r.inventory, p);
  assert.deepEqual(r.granted, [{ id: 'gold-20', type: 'rocket' }]);
  // alte Merker (level-3 …) blockieren die neuen Gold-Geschenke nicht
  const old = loadInventory({ getItem: () => '{"version":3,"extraMoves":0,"rocket":0,"hint":0,"wand":0,"gifts":["level-3","level-6","level-10"],"pending":[]}' });
  assert.deepEqual(grantGifts(old, p).granted.map(g => g.id), ['gold-3', 'gold-10', 'gold-20']);
  assert.equal(giftLevel('gold-20'), 20); assert.equal(giftLevel('level-20'), 20); assert.equal(giftLevel('stars-10'), null);
  // Gold-Vorrat: nur Rakete/+3, Verbrauch einzeln
  assert.deepEqual(goldStock({ ...emptyInventory(), rocket: 2, hint: 5 }), { extraMoves: 0, rocket: 2 });
  assert.equal(spendGold({ ...emptyInventory(), rocket: 1 }, 'rocket').rocket, 0);
  assert.equal(spendGold({ ...emptyInventory(), hint: 1 }, 'hint'), null);
  assert.equal(spendGold(emptyInventory(), 'rocket'), null);
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

test('launch-28: Hilfsmittel unbegrenzt – keine Ladungen mehr, nur +3 Züge und Rakete im Abenteuer', () => {
  assert.equal(FREE_TOOLS_PER_LEVEL, Infinity);
  assert.equal(TOOL_STOCK, false);
  assert.deepEqual([...ADVENTURE_TOOLS], ['extraMoves', 'rocket']);
  const run = createLevelRun(base({ moves: 3 }));
  for (let i = 0; i < 4; i++) { run.board[0][0] ||= { value: 1 }; assert.ok(useRocket(run, 0, 0)); }
  assert.equal(run.toolsUsed.length, 4);                          // beliebig oft
  assert.equal(starsFor(run.level, 1, true, { toolsUsed: run.toolsUsed.length }), 1);
});

test('Gold-Geschenke als offene Pakete: einreihen, einzeln einsammeln, gespeichert, nie doppelt', () => {
  let p = emptyProgress();
  for (let n = 1; n <= 10; n++) p = recordResult(p, n, { stars: 1, moves: 5, now: 1 });   // Level 3 und 10
  let q = queueGifts(emptyInventory(), p);
  assert.deepEqual(q.queued.map(g => g.id), ['gold-3', 'gold-10']);
  assert.deepEqual(q.inventory.pending, q.queued);
  assert.equal(q.inventory.rocket, 0);                                                    // noch nicht gutgeschrieben
  assert.deepEqual(queueGifts(q.inventory, p).queued, []);                                // nicht doppelt
  const mem = new Map(); const storage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  saveInventory(q.inventory, storage);
  let inv = loadInventory(storage);
  assert.deepEqual(inv.pending.map(g => g.id), ['gold-3', 'gold-10']);   // bleibt bis zum Einsammeln
  const c = collectGift(inv);
  assert.deepEqual(c.gift, { id: 'gold-3', type: 'rocket' });
  assert.equal(c.inventory.rocket, 1); assert.equal(c.inventory.pending.length, 1);
  const d = collectGift(c.inventory, 'gold-10');
  assert.equal(d.inventory.extraMoves, 1); assert.deepEqual(d.inventory.pending, []);
  assert.equal(collectGift(d.inventory, 'nope'), null);
  assert.equal(collectGift(emptyInventory()), null);
  assert.equal(collectGift({ ...emptyInventory(), pending: [{ id: 'level-6', type: 'wand' }] }), null);   // alte Typen nicht mehr
  assert.deepEqual(queueGifts(d.inventory, p).queued, []);                                // eingesammelt = vergeben
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
  assert.equal(ps.length, 2 * SHOP_CONFIG.packs.length + SHOP_CONFIG.bundles.length);
  assert.deepEqual(ps.filter(p => p.type === 'rocket').map(p => [p.id, p.items.rocket, p.price]), [['rocket-1', 1, 0.99], ['rocket-3', 3, 2.49], ['rocket-5', 5, 3.99]]);
  assert.match(formatPrice(2.49), /^2,49\s?€$/);
  const r = await purchase('extraMoves-3', { config: on });
  assert.ok(r.ok && r.test); assert.deepEqual(r.items, { extraMoves: 3 });
  assert.equal(addToStock(emptyInventory(), r.items).extraMoves, 3);
  assert.equal(productById('hint-1'), null); assert.equal(productById('wand-1'), null);   // launch-29: keine Hinweis-/Zauberstab-Pakete
  const mix = await purchase('bundle-mix', { config: on });
  assert.deepEqual(mix.items, { extraMoves: 3, rocket: 3 });
  assert.equal((await purchase('gibts-nicht', { config: on })).ok, false);
  // ohne Testkauf und ohne nativen Store: nichts verfügbar
  const off = { ...on, testPurchases: false };
  assert.equal(activeStore(off).kind, 'none');
  assert.equal((await purchase('rocket-1', { config: off })).ok, false);
  // nativer Store (später Capacitor): wird bevorzugt, Abbruch gibt nichts
  registerNativeStore({ name: 'fake', purchase: async p => (p.id === 'rocket-1' ? { ok: true, transactionId: 't1' } : { ok: false, reason: 'cancelled' }) });
  try {
    assert.equal(activeStore(on).kind, 'native');
    const n = await purchase('rocket-1', { config: on });
    assert.ok(n.ok && !n.test && n.transactionId === 't1');
    assert.equal((await purchase('rocket-3', { config: on })).ok, false);
  } finally { registerNativeStore(null); }
  assert.equal(activeStore().kind, 'test');
});

import { AD_TOOLS, TOOL_GIFTS, giftLevel, resetStockOnce, TOOL_RESET_KEY, loadInventory as loadInv13 } from '../game/campaign.mjs';
import { loadLog, saveLog, startAttempt, logEvent, endAttempt, reopenAttempt, summarize, exportLog, emptyLog, TOOL_LOG_KEY } from '../game/tool-log.mjs';
const memStore = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m }; };

test('launch-28: Hilfsmittel unbegrenzt, Gold-Geschenke an, kein Vorrats-Shop, keine Vorrats-Werbung', () => {
  assert.equal(FREE_TOOLS_PER_LEVEL, Infinity);
  assert.equal(TOOL_STOCK, false);
  assert.equal(AD_TOOLS, false);
  assert.equal(TOOL_GIFTS, true);
  const leftover = { ...emptyInventory(), rocket: 9, hint: 9, wand: 9, extraMoves: 9 };
  assert.deepEqual(goldStock(leftover), { extraMoves: 9, rocket: 9 });   // Vorrat-Felder tragen jetzt den Gold-Vorrat
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

test('launch-13/26: ein Hilfsmittel deckelt auf 2 Sterne, keines lässt 3★ zu', () => {
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
  assert.deepEqual(queueGifts(li, p3).queued, [{ id: 'gold-3', type: 'rocket' }]);   // launch-28: Gold-Geschenk
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
  for (const t of ['empty', 'long', 'purge', 'fuse']) assert.ok(GOAL_TYPES.includes(t));
  assert.ok(!GOAL_TYPES.includes('group'));
  validateLevel(base({ goals: [{ type: 'fuse', size: 3 }] }));
  validateLevel(base({ goals: [{ type: 'fuse', size: 4, shape: 't' }] }));
  assert.throws(() => validateLevel(base({ goals: [{ type: 'fuse', size: 2 }] })));
  assert.throws(() => validateLevel(base({ goals: [{ type: 'fuse', size: 4, shape: 'L' }] })));
  assert.match(goalText({ type: 'fuse', size: 3 }), /3 gleiche/);
  assert.match(goalText({ type: 'fuse', size: 4, shape: 't' }), /T-Form/);
  assert.ok(goalShort({ type: 'fuse', size: 4, shape: 't' }).length <= 18);
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

test('launch-30: 100 Level = 10 Kapitel; Schranke 216★ bis Level 91 – überall 2★ reicht nicht mehr', () => {
  assert.equal(chapterOf(100), 10);
  assert.equal(chapterOf(91), 10);
  assert.equal(chapterOf(90), 9);
  assert.equal(starGate(10), 216);
  const p = emptyProgress();
  for (let n = 1; n <= 90; n++) p.levels[String(n)] = { stars: 2, moves: 5, at: 0 };
  assert.deepEqual(lockReason(p, 91), { reason: 'stars', need: 216, have: 180, chapter: 10 });
  for (let n = 1; n <= 35; n++) p.levels[String(n)].stars = 3;                          // 215★
  assert.equal(lockReason(p, 91).need, 216);
  p.levels['36'].stars = 3;                                                              // 216★
  assert.equal(lockReason(p, 91), null);
  assert.equal(nextLevel(p, 100), 91);
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


test('launch-27: nur Sterne der umgearbeiteten Level einmalig löschen, Rest und Tutorials bleiben', () => {
  const st = new Map();
  st.getItem = k => (st.has(k) ? st.get(k) : null);
  st.setItem = (k, v) => st.set(k, v);
  const p0 = emptyProgress();
  for (let n = 1; n <= 100; n++) p0.levels[String(n)] = { stars: 3, moves: 5, at: 0 };
  const a = resetCurveStarsOnce(p0, st);
  assert.equal(a.reset, true);
  assert.equal(CURVE_STARS_RESET, 'launch-27');
  assert.equal(st.getItem(CURVE_STARS_RESET_KEY), 'launch-27');
  for (const id of CURVE_STARS_RESET_IDS) assert.equal(a.progress.levels[String(id)], undefined, `L${id} zurückgesetzt`);
  for (const id of [1, 2, 3, 4, 5, 10, 11, 25, 50, 90, 99]) {
    assert.equal(a.progress.levels[String(id)].stars, 3, `L${id} bleibt`);
  }
  assert.equal(Object.keys(a.progress.levels).length, 100 - CURVE_STARS_RESET_IDS.length);
  const b = resetCurveStarsOnce(a.progress, st);
  assert.equal(b.reset, false);
  assert.equal(Object.keys(b.progress.levels).length, 100 - CURVE_STARS_RESET_IDS.length);
});

test('launch-28: Regel-Umstellung – Sterne neu bewertet (nie gelöscht, mind. 1★), offene Kapitel bleiben offen, alter Vorrat weg', () => {
  const st = new Map(); st.getItem = k => (st.has(k) ? st.get(k) : null); st.setItem = (k, v) => st.set(k, v);
  const p0 = emptyProgress();
  for (let n = 1; n <= 30; n++) p0.levels[String(n)] = { stars: 2, moves: 9, at: 0 };   // 60★: alt Kapitel 2–4 offen (18/36/54)
  p0.levels['12'] = { stars: 3, moves: 6, at: 0 };                                      // neu: 3★ erst bei ≤ 5 Zügen
  p0.levels['13'] = { stars: 3, moves: 6, at: 0 };                                      // neu: 3★ bei ≤ 6 → bleibt
  const inv = { ...emptyInventory(), rocket: 4, hint: 2, wand: 1, extraMoves: 3, gifts: ['level-3', 'gold-3'], pending: [{ id: 'level-6', type: 'wand' }, { id: 'gold-10', type: 'extraMoves' }] };
  const thresholds = { 12: [5, 8], 13: [6, 9], 20: [3, 5] };
  const m = migrateRules28Once(p0, inv, st, { thresholds });
  assert.equal(m.migrated, true);
  assert.equal(Object.keys(m.progress.levels).length, 30);                              // nichts gelöscht
  assert.equal(m.progress.levels['12'].stars, 2);
  assert.equal(m.progress.levels['13'].stars, 3);
  assert.equal(m.progress.levels['20'].stars, 1);                                       // 9 Züge > 2★-Schwelle 5 → 1★, nie 0
  assert.ok(Object.values(m.progress.levels).every(l => l.stars >= 1));
  assert.deepEqual([...m.progress.openChapters].sort((x, y) => x - y), [2, 3, 4]);
  assert.equal(lockReason(m.progress, 31), null);                                       // trotz neuer Schranke offen
  assert.deepEqual({ ...goldStock(m.inventory) }, { extraMoves: 0, rocket: 0 });
  assert.equal(m.inventory.hint, 0); assert.equal(m.inventory.wand, 0);
  assert.deepEqual(m.inventory.gifts, ['level-3', 'gold-3']);
  assert.deepEqual(m.inventory.pending, [{ id: 'gold-10', type: 'extraMoves' }]);
  const again = migrateRules28Once(m.progress, m.inventory, st, { thresholds });
  assert.equal(again.migrated, false);
  // Zusammenführen behält offene Kapitel beider Seiten
  assert.deepEqual(mergeProgress({ ...emptyProgress(), openChapters: [2] }, { ...emptyProgress(), openChapters: [3] }).openChapters.sort(), [2, 3]);
});

// ---------------- launch-22/24: Tutorials, Reset, Freischaltung ----------------
import {
  modesUnlocked, MODES_UNLOCK_LEVEL, resetAdventureForTutorialsOnce, TUTORIAL_RESET, TUTORIAL_RESET_KEY,
  tutorialHintMove, fuseMatch, isStraightGroup, encodeMove as enc22, PROGRESS_KEY as PK22,
  MODES_UNLOCK_SEEN_KEY, TOOLS_KEY as TK22,
} from '../game/campaign.mjs';
import { SYNC_STATE_KEY } from '../game/progress-sync.mjs';

test('launch-22: fuse-Ziel zählt nur die passende Fusion (Größe / T-Form)', () => {
  const run = createLevelRun(base({
    board: [[E, 1, 1, E, E], [E, E, E, E, E], [E, E, E, E, E], [E, E, E, E, E], [E, E, E, E, E]],
    sequence: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], moves: 5,
    goals: [{ type: 'fuse', size: 3 }], stars: { three: 2, two: 4 },
  }));
  assert.equal(applyLevelMove(run, 'right', 0).ok, true);
  assert.equal(run.status, 'won');
  assert.equal(goalProgress({ type: 'fuse', size: 3 }, run).done, true);
  assert.equal(goalProgress({ type: 'fuse', size: 4, shape: 'line' }, run).done, false);
  assert.equal(isStraightGroup([[0, 1], [0, 2], [0, 3]]), true);
  assert.equal(isStraightGroup([[0, 1], [0, 2], [0, 3], [1, 2]]), false);
  assert.equal(fuseMatch({ size: 4, line: false }, { size: 4, shape: 't' }), true);
  assert.equal(fuseMatch({ size: 4, line: true }, { size: 4, shape: 't' }), false);
});

test('launch-22: Endlos und 2 Spieler erst nach Level 5 frei', () => {
  assert.equal(MODES_UNLOCK_LEVEL, 5);
  assert.equal(modesUnlocked(emptyProgress()), false);
  assert.equal(modesUnlocked({ version: 1, levels: { 1: { stars: 3 }, 4: { stars: 3 } }, updatedAt: 1 }), false);
  const p = recordResult(emptyProgress(), 5, { stars: 1, moves: 1, now: 1 });
  assert.equal(modesUnlocked(p), true);
  assert.equal(modesUnlocked(recordResult(emptyProgress(), 6, { stars: 2, moves: 8, now: 1 })), false);
});

test('launch-22: Geisterfinger zeigt einen sofort gewinnenden Zug', () => {
  const run = createLevelRun(base({
    board: [[E, 1, 1, E, E], [E, E, E, E, E], [E, E, E, E, E], [E, E, E, E, E], [E, E, E, E, E]],
    sequence: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], moves: 5,
    goals: [{ type: 'fuse', size: 3 }], stars: { three: 2, two: 4 }, solution: 'f',
  }));
  const m = tutorialHintMove(run);
  assert.ok(m);
  assert.equal(enc22(m.direction, m.line), 'f');
  applyLevelMove(run, 'left', 0);   // falscher Zug, keine Fusion
  assert.equal(run.status, 'playing');
  const again = tutorialHintMove(run);
  assert.ok(again);
  const r2 = applyLevelMove(run, again.direction, again.line);
  assert.equal(r2.ok, true);
  assert.equal(run.status, 'won');
});

test('launch-22: Abenteuer einmalig komplett zurücksetzen, Endlos-Schlüssel bleiben, Cloud-Merker weg', () => {
  const st = memStore();
  const won = n => ({ version: 1, updatedAt: 5, levels: Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), { stars: 1 + (i % 3), moves: 7, at: 1 }])) });
  st.setItem(PK22, JSON.stringify(won(20)));
  st.setItem('shift3-play-v1', '{"score":900,"best":1200,"board":1}');
  st.setItem('squish-sound-v1', 'x');
  st.setItem(SYNC_STATE_KEY, '{"key":"old"}');
  st.setItem(MODES_UNLOCK_SEEN_KEY, '1');
  const inv = { ...emptyInventory(), wand: 2, hint: 3, gifts: ['level-3', 'level-6'], pending: [{ id: 'level-10', type: 'extraMoves' }], at: 99 };
  saveInventory(inv, st);
  const r = resetAdventureForTutorialsOnce(loadP14(st), loadInventory(st), st);
  assert.equal(r.reset, true);
  assert.deepEqual(r.progress.levels, {});
  assert.deepEqual(loadP14(st).levels, {});
  const li = loadInventory(st);
  assert.equal(li.wand, 0); assert.equal(li.hint, 0);
  assert.deepEqual(li.gifts, []); assert.deepEqual(li.pending, []);
  assert.equal(st.getItem(TUTORIAL_RESET_KEY), TUTORIAL_RESET);
  assert.equal(st.getItem(SYNC_STATE_KEY), null);
  assert.equal(st.getItem(MODES_UNLOCK_SEEN_KEY), null);
  assert.equal(st.getItem('shift3-play-v1'), '{"score":900,"best":1200,"board":1}');
  assert.equal(st.getItem('squish-sound-v1'), 'x');
  assert.equal(modesUnlocked(r.progress), false);
  // kein zweites Mal
  st.setItem(PK22, JSON.stringify(won(5)));
  const again = resetAdventureForTutorialsOnce(loadP14(st), li, st);
  assert.equal(again.reset, false);
  assert.equal(Object.keys(loadP14(st).levels).length, 5);
});

test('launch-24: Merker launch-22 löst noch einmal den Reset aus; Sprache, Einstellungen und Endlos bleiben', () => {
  const st = memStore();
  const won = n => ({ version: 1, updatedAt: 5, levels: Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), { stars: 1 + (i % 3), moves: 7, at: 1 }])) });
  st.setItem(PK22, JSON.stringify(won(20)));
  st.setItem(TUTORIAL_RESET_KEY, 'launch-22');
  st.setItem('squish-lang-v1', 'en');
  st.setItem('shift3-play-v1', '{"score":900,"best":1200,"board":1}');
  st.setItem('squish-sound-v1', 'x');
  st.setItem('squish-haptics-v1', '0');
  st.setItem('squish-phone-motion-v1', '1');
  const inv = { ...emptyInventory(), wand: 2, hint: 1, gifts: ['level-3'], pending: [{ id: 'level-10', type: 'extraMoves' }], at: 99 };
  saveInventory(inv, st);
  const r = resetAdventureForTutorialsOnce(loadP14(st), loadInventory(st), st);
  assert.equal(r.reset, true);
  assert.deepEqual(r.progress.levels, {});
  assert.equal(loadInventory(st).wand, 0);
  assert.deepEqual(loadInventory(st).gifts, []);
  assert.equal(st.getItem(TUTORIAL_RESET_KEY), TUTORIAL_RESET);
  assert.equal(st.getItem('squish-lang-v1'), 'en');
  assert.equal(st.getItem('shift3-play-v1'), '{"score":900,"best":1200,"board":1}');
  assert.equal(st.getItem('squish-sound-v1'), 'x');
  assert.equal(st.getItem('squish-haptics-v1'), '0');
  assert.equal(st.getItem('squish-phone-motion-v1'), '1');
  assert.equal(modesUnlocked(r.progress), false);
  const again = resetAdventureForTutorialsOnce(loadP14(st), loadInventory(st), st);
  assert.equal(again.reset, false);
});

test('launch-30: Neustart für alle – Merker launch-24/29-Stand löst den Reset aus, Start bei Level 1 mit Tutorials', () => {
  assert.equal(TUTORIAL_RESET, 'launch-30');
  assert.equal(PROGRESS_EPOCH, 'launch-30');
  const st = memStore();
  const won = n => ({ version: 1, updatedAt: 5, openChapters: [2, 3], levels: Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), { stars: 3, moves: 7, at: 1 }])) });
  st.setItem(PK22, JSON.stringify(won(40)));
  st.setItem(TUTORIAL_RESET_KEY, 'launch-24');
  st.setItem('squish-explain-seen-v1', '["merge","merge5","street","tools","gifts","gates","tool-cost","gold-used"]');
  st.setItem('squish-lang-v1', 'en');
  st.setItem('shift3-play-v1', '{"score":900,"best":1200,"board":1}');
  st.setItem('squish-sound-v1', 'x');
  st.setItem('squish-adfree-v1', '1');   // Werbefrei-Kauf (App)
  st.setItem(SYNC_STATE_KEY, '{"key":"old"}');
  st.setItem(MODES_UNLOCK_SEEN_KEY, '1');
  saveInventory({ ...emptyInventory(), rocket: 1, gifts: ['gold-3', 'gold-10'], pending: [{ id: 'gold-20', type: 'rocket' }], at: 99 }, st);
  const r = resetAdventureForTutorialsOnce(loadP14(st), loadInventory(st), st);
  assert.equal(r.reset, true);
  assert.deepEqual(loadP14(st).levels, {});
  assert.equal(loadP14(st).openChapters, undefined, 'Kapitel-Freischaltungen weg');
  assert.equal(nextLevel(loadP14(st), 100), 1, 'Start bei Level 1');
  assert.deepEqual(lockReason(loadP14(st), 2), { reason: 'previous' });
  assert.deepEqual(loadInventory(st).gifts, []); assert.deepEqual(loadInventory(st).pending, []);
  assert.equal(st.getItem('squish-explain-seen-v1'), null, 'Tutorial-Fenster kommen wieder');
  assert.equal(st.getItem(SYNC_STATE_KEY), null);
  assert.equal(st.getItem(MODES_UNLOCK_SEEN_KEY), null);
  assert.equal(modesUnlocked(r.progress), false);
  assert.equal(st.getItem('squish-lang-v1'), 'en');
  assert.equal(st.getItem('shift3-play-v1'), '{"score":900,"best":1200,"board":1}');
  assert.equal(st.getItem('squish-sound-v1'), 'x');
  assert.equal(st.getItem('squish-adfree-v1'), '1', 'Werbefrei bleibt');
  assert.equal(st.getItem(TUTORIAL_RESET_KEY), 'launch-30');
  assert.equal(resetAdventureForTutorialsOnce(loadP14(st), loadInventory(st), st).reset, false, 'nur einmal');
});

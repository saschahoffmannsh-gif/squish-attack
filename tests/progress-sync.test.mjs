import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWire, mergeWire, epochOf, wireKey } from '../game/progress-merge.mjs';
import { toWire, applyWire, createProgressSync, SYNC_STATE_KEY } from '../game/progress-sync.mjs';
import { emptyProgress, emptyInventory, recordResult, saveInventory, loadInventory, resetStockOnce, TOOLS_KEY } from '../game/campaign.mjs';

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m }; };
const W = (over = {}) => normalizeWire({ v: 1, epoch: 18, levels: {}, inv: null, invAt: 0, ...over });

test('epochOf: launch-18 → 18, launch-22 → 22, launch-24 → 24, launch-27 → 27', () => {
  assert.equal(epochOf('launch-18'), 18); assert.equal(epochOf('launch-22'), 22); assert.equal(epochOf('launch-24'), 24); assert.equal(epochOf('launch-27'), 27);
  assert.equal(epochOf(7), 7); assert.equal(epochOf(null), 0);
});

test('toWire/applyWire: 0★-Sieg (launch-26) bleibt erhalten und schaltet weiter', () => {
  const p = recordResult(emptyProgress(), 1, { stars: 0, moves: 7, now: 1 });
  const w = toWire(p, emptyInventory(), 24);
  assert.equal(w.levels['1'].s, 0);
  const r = applyWire(emptyProgress(), emptyInventory(), w, 24, 1000);
  assert.equal(r.progress.levels['1'].stars, 0);
  assert.equal(r.changed, true);
});

test('merge: Epoche 24 ersetzt Level und Abenteuer-Vorrat von Epoche 22', () => {
  const old = W({ epoch: 22, levels: { 8: { s: 3, m: 4 } }, inv: { extraMoves: 2, rocket: 1, hint: 3, wand: 1, gifts: ['level-3'], pending: [] }, invAt: 99 });
  const neu = W({ epoch: 24, levels: {}, inv: { extraMoves: 0, rocket: 0, hint: 0, wand: 0, gifts: [], pending: [] }, invAt: 0 });
  const ab = mergeWire(old, neu), ba = mergeWire(neu, old);
  assert.equal(ab.epoch, 24);
  assert.deepEqual(ab.levels, {});
  assert.equal(ab.inv.rocket, 0);
  assert.deepEqual(ab.inv.gifts, []);
  assert.equal(wireKey(ab), wireKey(ba), 'kommutativ');
});

test('merge: max Sterne pro Level, bei Gleichstand weniger Züge, Vereinigung der Level', () => {
  const a = W({ levels: { 1: { s: 3, m: 9 }, 2: { s: 1, m: 5 } } });
  const b = W({ levels: { 1: { s: 2, m: 3 }, 2: { s: 1, m: 4 }, 3: { s: 2, m: 8 } } });
  const ab = mergeWire(a, b), ba = mergeWire(b, a);
  assert.deepEqual(ab.levels, { 1: { s: 3, m: 9 }, 2: { s: 1, m: 4 }, 3: { s: 2, m: 8 } });
  assert.equal(wireKey(ab), wireKey(ba), 'kommutativ');
});

test('merge: höhere Epoche ersetzt die Level (Sterne-Reset kommt nicht zurück)', () => {
  const old = W({ epoch: 17, levels: { 40: { s: 3, m: 9 } } });
  const now = W({ epoch: 18, levels: { 1: { s: 1, m: 9 } } });
  assert.deepEqual(mergeWire(old, now).levels, { 1: { s: 1, m: 9 } });
  assert.deepEqual(mergeWire(now, old).levels, { 1: { s: 1, m: 9 } });
});

test('merge: höhere Epoche ersetzt auch den Abenteuer-Vorrat (Tutorial-Reset kommt nicht zurück)', () => {
  const inv = (o) => ({ extraMoves: 0, rocket: 0, hint: 0, wand: 0, gifts: [], pending: [], ...o });
  const old = W({ epoch: 18, levels: { 20: { s: 3, m: 9 } }, inv: inv({ hint: 4, gifts: ['level-3', 'level-6'], pending: [{ id: 'level-10', type: 'extraMoves' }] }), invAt: 500 });
  const now = W({ epoch: 22, levels: {}, inv: inv(), invAt: 0 });
  const m = mergeWire(old, now), n = mergeWire(now, old);
  assert.deepEqual(m.levels, {});
  assert.equal(m.epoch, 22);
  assert.equal(m.inv.hint, 0);
  assert.deepEqual(m.inv.gifts, []);
  assert.deepEqual(m.inv.pending, []);
  assert.equal(wireKey(m), wireKey(n), 'kommutativ');
});

test('merge: neuerer Vorrat gewinnt, Geschenk-ids vereinigt, offene Geschenke gehen nicht verloren', () => {
  const inv = (o) => ({ extraMoves: 0, rocket: 0, hint: 0, wand: 0, gifts: [], pending: [], ...o });
  const a = W({ inv: inv({ hint: 5, gifts: ['level-3', 'level-6'], pending: [{ id: 'level-6', type: 'wand' }] }), invAt: 100 });
  const b = W({ inv: inv({ hint: 1, rocket: 2, gifts: ['level-3', 'level-10'], pending: [] }), invAt: 200 });
  const m = mergeWire(a, b);
  assert.equal(m.inv.hint, 1); assert.equal(m.inv.rocket, 2); assert.equal(m.invAt, 200);
  assert.deepEqual([...m.inv.gifts].sort(), ['level-10', 'level-3', 'level-6']);
  assert.deepEqual(m.inv.pending, [{ id: 'level-6', type: 'wand' }]);
});

test('normalize: kaputte Werte fallen weg, Zukunfts-Zeit wird begrenzt', () => {
  const w = normalizeWire({ v: 1, epoch: 18, levels: { 1: { s: 4, m: 2 }, 2: { s: 2, m: 0 }, x: { s: 1, m: 1 }, 3: { s: 2, m: 7 } },
    inv: { hint: -3, rocket: 1e9, gifts: ['level-3', 'bad id', 5], pending: [{ id: 'level-6', type: 'nope' }] }, invAt: 9e15 }, 1000);
  assert.deepEqual(w.levels, { 3: { s: 2, m: 7 } });
  assert.equal(w.inv.hint, 0); assert.equal(w.inv.rocket, 0); assert.deepEqual(w.inv.gifts, ['level-3']); assert.deepEqual(w.inv.pending, []);
  assert.ok(w.invAt <= 1000 + 5 * 60 * 1000);
  assert.equal(normalizeWire({ v: 2 }), null); assert.equal(normalizeWire(null), null);
});

test('toWire/applyWire: Cloud-Stand füllt ein leeres Gerät, Lokales wird nie schlechter', () => {
  let p = recordResult(emptyProgress(), 1, { stars: 2, moves: 7, now: 1 });
  const inv = { ...emptyInventory(), hint: 2, at: 50 };
  const remote = W({ levels: { 1: { s: 3, m: 8 }, 2: { s: 1, m: 4 } }, inv: { extraMoves: 0, rocket: 3, hint: 0, wand: 0, gifts: ['level-3'], pending: [] }, invAt: 99 });
  const r = applyWire(p, inv, remote, 18, 1000);
  assert.equal(r.changed, true);
  assert.equal(r.progress.levels['1'].stars, 3); assert.equal(r.progress.levels['2'].stars, 1);
  assert.equal(r.inventory.rocket, 3); assert.equal(r.inventory.at, 99);
  // fremde Epoche: Level werden ignoriert
  const r2 = applyWire(emptyProgress(), emptyInventory(), W({ epoch: 17, levels: { 5: { s: 3, m: 1 } } }), 18, 1000);
  assert.deepEqual(r2.progress.levels, {});
  // launch-22: alter Vorrat einer niedrigeren Epoche wird nicht übernommen
  const fresh = emptyInventory();
  const stale = W({ epoch: 18, levels: { 8: { s: 3, m: 4 } }, inv: { extraMoves: 2, rocket: 1, hint: 3, wand: 1, gifts: ['level-3'], pending: [] }, invAt: 99 });
  const r3 = applyWire(emptyProgress(), fresh, stale, 22, 1000);
  assert.deepEqual(r3.progress.levels, {});
  assert.equal(r3.inventory, fresh);
  assert.equal(r3.changed, false);
  // nichts Neues → unverändert
  const w = toWire(r.progress, r.inventory, 18);
  assert.equal(applyWire(r.progress, r.inventory, w, 18, 1000).changed, false);
});

test('applyWire: Epoche 24 übernimmt keinen Abenteuer-Stand aus Epoche 22', () => {
  const stale = W({ epoch: 22, levels: { 8: { s: 3, m: 4 } }, inv: { extraMoves: 2, rocket: 1, hint: 3, wand: 1, gifts: ['level-3'], pending: [] }, invAt: 99 });
  const fresh = emptyInventory();
  const r = applyWire(emptyProgress(), fresh, stale, 24, 1000);
  assert.deepEqual(r.progress.levels, {});
  assert.equal(r.inventory, fresh);
  assert.equal(r.changed, false);
});

test('Vorrat: echte Änderungen setzen at, einmalige Resets nicht (frisches Gerät überschreibt Cloud nicht)', () => {
  const s = mem();
  const fresh = loadInventory(s);
  const { inventory } = resetStockOnce(fresh, s, 'launch-13');
  assert.equal(inventory.at || 0, 0);
  assert.equal(JSON.parse(s.getItem(TOOLS_KEY)).at, 0);
  const inv = { ...inventory, hint: 1 };
  saveInventory(inv, s);
  assert.ok(loadInventory(s).at > 0);
});

function harness({ status = 200, server = null, online = true } = {}) {
  const storage = mem();
  let state = { progress: emptyProgress(), inventory: emptyInventory() };
  const calls = [];
  let stored = server;
  const fetch = async (path, opts) => {
    calls.push({ path, opts });
    if (status === 'throw') throw new Error('offline');
    if (status !== 200) return { ok: false, status, json: async () => ({}) };
    const merged = mergeWire(stored, normalizeWire(JSON.parse(opts.body)));
    stored = merged;
    return { ok: true, status: 200, json: async () => ({ ok: true, progress: merged }) };
  };
  const timers = [];
  const sync = createProgressSync({ fetch, epoch: 18, storage, online: () => online, hasToken: () => true,
    getLocal: () => state, setLocal: (p, inv) => { state = { progress: p, inventory: inv }; },
    setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => {} });
  return { sync, calls, storage, timers, get state() { return state; }, set state(v) { state = v; }, get stored() { return stored; } };
}

test('Sync: sendet nur bei Änderung, übernimmt die Server-Antwort, Fehler bleiben still', async () => {
  const h = harness({ server: W({ levels: { 4: { s: 3, m: 9 } } }) });
  h.state = { progress: recordResult(emptyProgress(), 1, { stars: 3, moves: 5 }), inventory: emptyInventory() };
  assert.equal(await h.sync.flush(), true);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].path, '/progress'); assert.equal(h.calls[0].opts.method, 'PUT');
  assert.equal(h.state.progress.levels['4'].stars, 3, 'Server-Level übernommen');
  assert.equal(await h.sync.flush(), false, 'unverändert → kein Aufruf');
  assert.equal(h.calls.length, 1);
  h.state = { ...h.state, progress: recordResult(h.state.progress, 2, { stars: 1, moves: 9 }) };
  assert.equal(await h.sync.flush(), true);
  assert.equal(h.stored.levels['2'].s, 1);
  assert.ok(JSON.parse(h.storage.getItem(SYNC_STATE_KEY)).key);
});

test('Sync: offline → kein Aufruf; Netzfehler / 500 / 429 → still, lokal unverändert', async () => {
  const off = harness({ online: false });
  off.state = { progress: recordResult(emptyProgress(), 1, { stars: 3, moves: 5 }), inventory: emptyInventory() };
  assert.equal(await off.sync.flush(), false); assert.equal(off.calls.length, 0);
  for (const status of ['throw', 500, 429]) {
    const h = harness({ status });
    const before = recordResult(emptyProgress(), 1, { stars: 3, moves: 5 });
    h.state = { progress: before, inventory: emptyInventory() };
    assert.equal(await h.sync.flush(), false);
    assert.equal(h.state.progress, before);
    assert.equal(h.storage.getItem(SYNC_STATE_KEY), null, 'nicht als abgeglichen gemerkt');
    if (status === 429) assert.equal(h.timers.length, 1, 'später erneut');
  }
});

test('Sync: schedule bündelt mehrere Änderungen zu einem Aufruf', async () => {
  const h = harness();
  h.state = { progress: recordResult(emptyProgress(), 1, { stars: 3, moves: 5 }), inventory: emptyInventory() };
  h.sync.schedule(); h.sync.schedule(); h.sync.schedule();
  await h.timers.at(-1)();
  assert.equal(h.calls.length, 1);
});

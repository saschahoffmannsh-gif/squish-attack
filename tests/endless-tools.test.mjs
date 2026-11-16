// App-Hülle: eigener Endlos-Werkzeug-Vorrat (Rakete/Zauberstab), Endlos-Werbung (ad-endless), Cloud-Feld einv.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ENDLESS_TOOLS, loadEndlessInv, saveEndlessInv, changeEndlessInv, endlessTotal } from '../game/endless-tool.mjs';
import { createAdPacing } from '../game/ad-pacing.mjs';
import { normalizeWire, mergeWire, wireKey, ENDLESS_TOOL_TYPES } from '../game/progress-merge.mjs';
import { toWire, applyWire } from '../game/progress-sync.mjs';
import { emptyProgress, emptyInventory } from '../game/campaign.mjs';
import { emptyLog, logEvent, summarize } from '../game/tool-log.mjs';

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
const base = (extra = {}) => ({ v: 1, epoch: 18, levels: {}, inv: null, invAt: 0, ...extra });

test('Endlos-Werkzeuge: nur Rakete und Zauberstab (kein Extra-Zug/Tipp – ohne Ziel und Zuglimit sinnlos)', () => {
  assert.deepEqual([...ENDLESS_TOOLS], ['rocket', 'wand']);
  assert.deepEqual([...ENDLESS_TOOL_TYPES], ['rocket', 'wand']);
});

test('Endlos-Vorrat: lokal gespeichert, geklemmt, Zeitstempel wächst', () => {
  const s = mem();
  assert.deepEqual(loadEndlessInv(s), { rocket: 0, wand: 0, at: 0 });
  let inv = changeEndlessInv(loadEndlessInv(s), 'rocket', 1, 1000);
  inv = changeEndlessInv(inv, 'wand', 2, 1000);
  assert.equal(inv.at, 1001, 'gleiche Uhrzeit → trotzdem neuer Stand');
  saveEndlessInv(inv, s);
  assert.deepEqual(loadEndlessInv(s), { rocket: 1, wand: 2, at: 1001 });
  assert.equal(endlessTotal(inv), 3);
  assert.equal(changeEndlessInv(inv, 'rocket', -5, 2000).rocket, 0, 'nie negativ');
  assert.equal(changeEndlessInv(inv, 'hint', 1, 2000), inv, 'fremde Werkzeuge ignoriert');
  s.setItem('squish-endless-tools-v1', '{"rocket":-3,"wand":"x","at":"y"}');
  assert.deepEqual(loadEndlessInv(s), { rocket: 0, wand: 0, at: 0 });
  s.setItem('squish-endless-tools-v1', 'kaputt');
  assert.deepEqual(loadEndlessInv(s), { rocket: 0, wand: 0, at: 0 });
});

test('Endlos-Werbung: Belohnung reihum Rakete → Zauberstab → Rakete, weggedrückt zählt nicht', () => {
  const storage = mem();
  const p = createAdPacing({ storage });
  assert.equal(p.peekEndlessReward(ENDLESS_TOOLS), 'rocket');
  assert.equal(p.peekEndlessReward(ENDLESS_TOOLS), 'rocket');
  assert.equal(p.takeEndlessReward(ENDLESS_TOOLS), 'rocket');
  assert.equal(createAdPacing({ storage }).takeEndlessReward(ENDLESS_TOOLS), 'wand');
  assert.equal(createAdPacing({ storage }).peekEndlessReward(ENDLESS_TOOLS), 'rocket');
});

test('Werkzeug-Protokoll: Quelle ad-endless, zählt als Werbung, nicht als Einsatz', () => {
  const log = emptyLog();
  const e = logEvent(log, null, 'ad-endless', 'wand', { where: 'endless' });
  assert.equal(e.source, 'ad-endless');
  assert.equal(e.kind, 'ad-endless');
  assert.equal(logEvent(log, null, 'ad-bogus', 'wand'), null);
  assert.doesNotThrow(() => summarize(log));
});

test('Wire: einv optional – ohne Feld bleibt das Format exakt wie bisher (Rückwärtskompatibilität)', () => {
  const w = normalizeWire(base());
  assert.equal('einv' in w, false);
  assert.equal('einvAt' in w, false);
  assert.equal(wireKey(w), wireKey(normalizeWire(base())));
  const e = normalizeWire(base({ einv: { rocket: 2, wand: -4, hint: 9 }, einvAt: 500 }));
  assert.deepEqual(e.einv, { rocket: 2, wand: 0 });
  assert.equal(e.einvAt, 500);
  assert.notEqual(wireKey(e), wireKey(w));
  assert.equal(normalizeWire(base({ einv: [1, 2] })).einv, undefined);
});

test('Merge: neuerer Endlos-Vorrat gewinnt; alter Client ohne einv löscht nichts', () => {
  const now = 10_000_000;
  const older = normalizeWire(base({ einv: { rocket: 3, wand: 1 }, einvAt: 100 }), now);
  const newer = normalizeWire(base({ einv: { rocket: 0, wand: 1 }, einvAt: 200 }), now);
  const legacy = normalizeWire(base(), now);
  assert.deepEqual(mergeWire(older, newer).einv, { rocket: 0, wand: 1 });
  assert.deepEqual(mergeWire(newer, older).einv, { rocket: 0, wand: 1 });
  assert.equal(mergeWire(newer, older).einvAt, 200);
  assert.deepEqual(mergeWire(older, legacy).einv, { rocket: 3, wand: 1 }, 'gespeicherter Stand bleibt bei PUT ohne einv');
  assert.deepEqual(mergeWire(legacy, older).einv, { rocket: 3, wand: 1 });
  assert.equal('einv' in mergeWire(legacy, legacy), false);
});

test('Merge: Epoche 22 ersetzt Abenteuer-Vorrat, Endlos-Vorrat bleibt', () => {
  const inv = (o = {}) => ({ extraMoves: 0, rocket: 0, hint: 0, wand: 0, gifts: [], pending: [], ...o });
  const old = normalizeWire(base({
    epoch: 18, levels: { 20: { s: 3, m: 9 } },
    inv: inv({ hint: 4, gifts: ['level-3'] }), invAt: 500,
    einv: { rocket: 2, wand: 1 }, einvAt: 3000,
  }));
  const now = normalizeWire(base({ epoch: 22, levels: {}, inv: inv(), invAt: 0 }));
  const m = mergeWire(old, now), n = mergeWire(now, old);
  assert.equal(m.epoch, 22);
  assert.deepEqual(m.levels, {});
  assert.equal(m.inv.hint, 0);
  assert.deepEqual(m.inv.gifts, []);
  assert.deepEqual(m.einv, { rocket: 2, wand: 1 });
  assert.equal(m.einvAt, 3000);
  assert.equal(wireKey(m), wireKey(n), 'kommutativ');
});

test('Sync: toWire/applyWire tragen den Endlos-Vorrat, neuerer Server-Stand wird übernommen', () => {
  const progress = emptyProgress(), inv = emptyInventory();
  const local = { rocket: 1, wand: 0, at: 1000 };
  const w = toWire(progress, inv, 18, local);
  assert.deepEqual(w.einv, { rocket: 1, wand: 0 });
  assert.equal(w.einvAt, 1000);
  assert.equal('einv' in toWire(progress, inv, 18), false, 'ohne Endlos-Vorrat (Web) kein Feld');
  const server = { ...w, einv: { rocket: 4, wand: 2 }, einvAt: 2000 };
  const r = applyWire(progress, inv, server, 18, 5000, local);
  assert.equal(r.changed, true);
  assert.deepEqual(r.endless, { rocket: 4, wand: 2, at: 2000 });
  const stale = applyWire(progress, inv, { ...w, einv: { rocket: 9, wand: 9 }, einvAt: 10 }, 18, 5000, local);
  assert.equal(stale.endless, local, 'älterer Server-Stand überschreibt nichts');
  const fresh = applyWire(progress, inv, server, 18, 5000, null);
  assert.deepEqual(fresh.endless, { rocket: 4, wand: 2, at: 2000 }, 'neues Gerät holt den Vorrat aus der Cloud');
});

// launch-28: Endlos-Werkzeuge kommen nur noch über Meilensteine (Rekord-Squish 10, 20, …), nicht aus Werbung.
import { readFileSync as readSrc28 } from 'node:fs';
test('launch-28: Meilenstein-Werkzeuge, 10-Minuten-Werbung ohne Belohnung', () => {
  const src = readSrc28(new URL('../game/game.mjs', import.meta.url), 'utf8');
  assert.ok(/const ENDLESS_MILESTONE=10;/.test(src));
  assert.ok(/function endlessMilestones\(prev\)/.test(src));
  const offer = src.slice(src.indexOf('function maybeEndlessOffer'), src.indexOf('const ENDLESS_MILESTONE'));
  assert.ok(offer.includes("playInterstitial('endless')") && !offer.includes('changeEndlessInv') && !offer.includes('adUI.open'));
  assert.ok(!src.includes("where==='endless'"), 'kein Belohnungs-Zweig mehr');
});

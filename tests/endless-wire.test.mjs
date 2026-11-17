// App-Hülle: Endlos-Werbung (ad-endless) und Cloud-Feld einv. launch-29: Endlos hat keine Werkzeuge mehr –
// das Feld einv bleibt im Wire-Format lesbar und wird vom Server nicht gelöscht (Rückwärtskompatibilität).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeWire, mergeWire, wireKey, ENDLESS_TOOL_TYPES } from '../game/progress-merge.mjs';
import { toWire, applyWire } from '../game/progress-sync.mjs';
import { emptyProgress, emptyInventory } from '../game/campaign.mjs';
import { emptyLog, logEvent, summarize } from '../game/tool-log.mjs';
import { createAdPacing } from '../game/ad-pacing.mjs';

const base = (extra = {}) => ({ v: 1, epoch: 18, levels: {}, inv: null, invAt: 0, ...extra });

test('launch-29: Endlos ohne Werkzeuge – keine Meilensteine, keine Leiste, keine Endlos-Belohnung', () => {
  const src = readFileSync(new URL('../game/game.mjs', import.meta.url), 'utf8');
  for (const s of ['ENDLESS_MILESTONE', 'endlessMilestones', 'endless-tool.mjs', 'endlessRocketAt', 'applyEndlessWand', 'endlessWandChoices', 'takeEndlessReward', "register('endless'"])
    assert.ok(!src.includes(s), s);
  const offer = src.slice(src.indexOf('function maybeEndlessOffer'), src.indexOf('function maybeEndlessOffer') + 400);
  assert.ok(offer.includes("playInterstitial('endless')"), '10-Minuten-Werbung bleibt, ohne Belohnung');
  assert.ok(/getLocal:\(\)=>\(\{progress:campaignProgress,inventory,endless:null\}\)/.test(src), 'alter Endlos-Vorrat wird nicht mehr gesendet');
  assert.equal(typeof createAdPacing({}).takeEndlessReward, 'undefined');
  assert.deepEqual([...ENDLESS_TOOL_TYPES], ['rocket', 'wand'], 'Wire-Format unverändert');
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

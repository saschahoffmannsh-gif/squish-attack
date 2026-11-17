import test from 'node:test';
import assert from 'node:assert/strict';
import { AD_PACING, createAdPacing } from '../game/ad-pacing.mjs';

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };

test('launch-28: Zwischenwerbung alle 10 gewonnenen Abenteuer-Level', () => {
  assert.equal(AD_PACING.interstitialEvery, 10);
  assert.equal(AD_PACING.endlessOfferMs, 10 * 60 * 1000);
  const s = mem();
  const p = createAdPacing({ storage: s });
  for (let i = 1; i <= 9; i++) {
    assert.equal(p.levelWon(), false, `win ${i} noch nicht fällig`);
  }
  assert.equal(p.levelWon(), true);
  assert.equal(p.interstitialDue, true);
  assert.equal(p.takeInterstitial(), true);
  assert.equal(p.interstitialDue, false);
  assert.equal(p.takeInterstitial(), false);
  for (let i = 1; i <= 9; i++) assert.equal(p.levelWon(), false);
  assert.equal(p.levelWon(), true);
});

test('Zähler und fälliger Merker überleben einen Neustart', () => {
  const storage = mem();
  const a = createAdPacing({ storage });
  for (let i = 0; i < 10; i++) a.levelWon();
  const b = createAdPacing({ storage });
  assert.equal(b.wins, 10);
  assert.equal(b.takeInterstitial(), true);
});

test('Endlos-Angebot nach 10 Minuten aktiver Spielzeit, Pausen zählen nicht', () => {
  let now = 1_000_000;
  const p = createAdPacing({ now: () => now, storage: mem() });
  const step = (ms) => { now += ms; return p.endlessMove(); };
  assert.equal(p.endlessMove(), false);
  for (let i = 0; i < 19; i++) assert.equal(step(30_000), false, `step ${i}`);
  assert.equal(step(30_000), true);
  p.endlessOffered();
  for (let i = 0; i < 5; i++) assert.equal(step(30_000), false);
  p.endlessPause();
  now += 20 * 60 * 1000;
  assert.equal(p.endlessMove(), false);
  for (let i = 0; i < 14; i++) assert.equal(step(30_000), false, `rest ${i}`);
  assert.equal(step(30_000), true);
});

test('Werbefrei unterdrückt Zwischenwerbung und Endlos-Angebot, Siege zählen weiter', () => {
  let owned = true;
  const p = createAdPacing({ storage: mem(), isAdFree: () => owned });
  for (let i = 1; i <= 10; i++) assert.equal(p.levelWon(), false, `win ${i}`);
  assert.equal(p.wins, 10);
  assert.equal(p.interstitialDue, false);
  assert.equal(p.takeInterstitial(), false);
  let now = 1_000_000;
  const e = createAdPacing({ now: () => now, storage: mem(), isAdFree: () => true });
  e.endlessMove();
  now += 30_000;
  for (let i = 0; i < 25; i++) { now += 30_000; assert.equal(e.endlessMove(), false); }
  owned = false;
  const later = createAdPacing({ storage: mem(), isAdFree: () => false });
  assert.equal(later.interstitialDue, false);
});

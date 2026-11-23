import test from 'node:test';
import assert from 'node:assert/strict';
import { AD_PACING, createAdPacing, interstitialAfterWin } from '../game/ad-pacing.mjs';

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };

test('launch-42: Zwischenwerbung erst nach Level 8, dann nach jedem 3. gelösten Level', () => {
  assert.equal(AD_PACING.interstitialEvery, 3);
  assert.equal(AD_PACING.interstitialFreeLevels, 5);
  assert.equal(AD_PACING.endlessOfferMs, 15 * 60 * 1000);
  for (const n of [1, 2, 3, 4, 5, 6, 7, 9, 10, 12]) assert.equal(interstitialAfterWin(n), false, `kein Slot nach ${n}`);
  for (const n of [8, 11, 14, 17, 20, 23, 26, 29, 32, 98]) assert.equal(interstitialAfterWin(n), true, `Slot nach ${n}`);
  const s = mem();
  const p = createAdPacing({ storage: s });
  for (const n of [1, 2, 3, 4, 5, 6, 7]) assert.equal(p.levelWon(n), false, `win ${n} noch nicht fällig`);
  assert.equal(p.levelWon(8), true);
  assert.equal(p.interstitialDue, true);
  assert.equal(p.takeInterstitial(), true);
  assert.equal(p.interstitialDue, false);
  assert.equal(p.takeInterstitial(), false);
  assert.equal(p.levelWon(9), false);
  assert.equal(p.levelWon(10), false);
  assert.equal(p.levelWon(11), true);
});

test('Zähler und fälliger Merker überleben einen Neustart', () => {
  const storage = mem();
  const a = createAdPacing({ storage });
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) a.levelWon(n);
  const b = createAdPacing({ storage });
  assert.equal(b.wins, 8);
  assert.equal(b.takeInterstitial(), true);
});

test('Endlos-Angebot nach 15 Minuten aktiver Spielzeit (launch-32), Pausen zählen nicht', () => {
  let now = 1_000_000;
  const p = createAdPacing({ now: () => now, storage: mem() });
  const step = (ms) => { now += ms; return p.endlessMove(); };
  assert.equal(p.endlessMove(), false);
  // Lange Sprünge zählen nur bis maxGapMs (30 s). 30 × 30 s = 15 min.
  for (let i = 0; i < 29; i++) assert.equal(step(30_000), false, `step ${i}`);
  assert.equal(step(30_000), true);
  p.endlessOffered();
  for (let i = 0; i < 5; i++) assert.equal(step(30_000), false);
  p.endlessPause();
  now += 20 * 60 * 1000;
  assert.equal(p.endlessMove(), false);
  // noch 12,5 min bis zur nächsten Schwelle (25 × 30 s)
  for (let i = 0; i < 24; i++) assert.equal(step(30_000), false, `rest ${i}`);
  assert.equal(step(30_000), true);
});

test('Werbefrei unterdrückt Zwischenwerbung und Endlos-Angebot, Siege zählen weiter', () => {
  let owned = true;
  const p = createAdPacing({ storage: mem(), isAdFree: () => owned });
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) assert.equal(p.levelWon(n), false, `win ${n}`);
  assert.equal(p.wins, 11);
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

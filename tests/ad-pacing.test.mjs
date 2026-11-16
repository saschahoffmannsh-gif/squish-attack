import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdPacing, AD_PACING } from '../game/ad-pacing.mjs';

const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };

test('Zwischenwerbung nach jedem 10. Sieg, erst beim nächsten Levelstart', () => {
  const p = createAdPacing({ storage: mem() });
  for (let i = 1; i < 10; i++) assert.equal(p.levelWon(), false);
  assert.equal(p.takeInterstitial(), false);
  assert.equal(p.levelWon(), true);
  assert.equal(p.takeInterstitial(), true);
  assert.equal(p.takeInterstitial(), false, 'nur einmal');
  for (let i = 0; i < 9; i++) p.levelWon();
  assert.equal(p.interstitialDue, false);
  p.levelWon(); assert.equal(p.interstitialDue, true);
});

test('Zähler und fälliger Merker überleben einen Neustart', () => {
  const storage = mem();
  const a = createAdPacing({ storage });
  for (let i = 0; i < 10; i++) a.levelWon();
  const b = createAdPacing({ storage });
  assert.equal(b.wins, 10);
  assert.equal(b.takeInterstitial(), true);
});

test('Endlos-Angebot nach 10 Minuten aktiver Spielzeit; Pausen zählen nicht', () => {
  let t = 0;
  const p = createAdPacing({ storage: mem(), now: () => t });
  assert.equal(p.endlessMove(), false);
  // 1 Stunde Pause zählt höchstens maxGapMs
  t += 60 * 60 * 1000; assert.equal(p.endlessMove(), false);
  assert.equal(p.endlessMs, AD_PACING.maxGapMs);
  p.endlessPause(); t += 10 * 60 * 1000; p.endlessMove();
  assert.equal(p.endlessMs, AD_PACING.maxGapMs, 'Pause zählt gar nicht');
  // ein Zug alle 5 s → nach knapp 10 Minuten fällig
  let due = false, moves = 0;
  while (!due) { t += 5000; due = p.endlessMove(); moves++; }
  assert.ok(p.endlessMs >= AD_PACING.endlessOfferMs);
  assert.equal(moves, Math.ceil((AD_PACING.endlessOfferMs - AD_PACING.maxGapMs) / 5000));
  p.endlessOffered();
  t += 5000; assert.equal(p.endlessMove(), false);
});

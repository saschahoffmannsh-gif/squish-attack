import test from 'node:test';
import assert from 'node:assert/strict';
import {SOFT_GEL_MOTION,WOBBLE_DECAY_STRETCH,wobbleDecayFactor} from '../game/gel-softness.mjs';

// Frames until a kicked wobble falls below the adapter's live threshold (.045).
function settleSeconds(character, stretch, start = .5, dt = 1 / 60) {
  let a = start, t = 0; const ws = SOFT_GEL_MOTION.wobbleSpeed;
  while (a > .045 && t < 10) { a *= Math.exp(-dt * 2.5 * ws); a *= wobbleDecayFactor(dt, ws, character, stretch); t += dt; }
  return t;
}
test('Nachwackeln klingt ~1,5–2x länger aus und kommt sicher zur Ruhe', () => {
  for (const character of [.82, 1, 1.26]) {
    const before = settleSeconds(character, 1), after = settleSeconds(character, WOBBLE_DECAY_STRETCH);
    const ratio = after / before;
    assert.ok(ratio > 1.5 && ratio < 2.05, `ratio ${ratio}`);
    assert.ok(after < 2.2, `settles in ${after}s`);
  }
  // Variation between stones stays.
  assert.ok(settleSeconds(.82, WOBBLE_DECAY_STRETCH) > settleSeconds(1.26, WOBBLE_DECAY_STRETCH) * 1.3);
});

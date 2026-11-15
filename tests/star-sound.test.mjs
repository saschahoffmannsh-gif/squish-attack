import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {STAR_RATES,STAR_VOLUMES} from '../game/sound.mjs';

test('Sterne: Schiebe-Sound, Tonhöhe steigt pro Stern', () => {
  assert.equal(STAR_RATES.length, 3);
  assert.ok(STAR_RATES[0] < STAR_RATES[1] && STAR_RATES[1] < STAR_RATES[2]);
  assert.ok(STAR_RATES.every(r => r >= 1 && r < 1.4) && STAR_VOLUMES.every(v => v > .3 && v < .6));
  const game = readFileSync(new URL('../game/game.mjs', import.meta.url), 'utf8');
  const onStar = game.match(/onStar:i=>\{([^}]*)\}/)[1];
  assert.match(onStar, /sound\.play\('star',i\+1\)/);
  assert.doesNotMatch(onStar, /sound\.play\('(merge|pop|flow)'/, 'kein Knall mehr bei den Sternen');
});

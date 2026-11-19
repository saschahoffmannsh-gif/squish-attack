import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { LANGS, LANG_KEY, detectLang, loadLang, saveLang, t, setLang, getLang, hasKey, fmtNum } from '../game/i18n.mjs?v=launch-33';
import { STRINGS } from '../game/locales.mjs?v=launch-33';
import * as Camp from '../game/campaign.mjs';

test('Sprachen de und en, Schlüssel vollständig', () => {
  assert.deepEqual([...LANGS], ['de', 'en']);
  for (const [key, entry] of Object.entries(STRINGS)) {
    assert.ok(entry.de, key + ' fehlt de');
    assert.ok(entry.en, key + ' fehlt en');
    for (const lang of LANGS) {
      const v = entry[lang];
      if (typeof v === 'object') {
        assert.ok(v.one && v.other, key + ' ' + lang + ' braucht one/other');
      } else assert.ok(String(v).length, key + ' ' + lang + ' leer');
    }
  }
  assert.ok(Object.keys(STRINGS).length >= 200);
});

test('detectLang: de* → Deutsch, sonst Englisch', () => {
  assert.equal(detectLang({ language: 'de-DE' }), 'de');
  assert.equal(detectLang({ language: 'de' }), 'de');
  assert.equal(detectLang({ languages: ['de-AT', 'en'] }), 'de');
  assert.equal(detectLang({ language: 'en-US' }), 'en');
  assert.equal(detectLang({ language: 'fr-FR' }), 'en');
  assert.equal(detectLang({ languages: ['en-GB'] }), 'en');
  assert.equal(detectLang({}), 'en');
  assert.equal(detectLang(undefined), 'en');
});

test('Wahl bleibt in localStorage (LANG_KEY), Standard aus navigator', () => {
  const mem = new Map();
  const storage = { getItem: k => mem.has(k) ? mem.get(k) : null, setItem: (k, v) => mem.set(k, v), removeItem: k => mem.delete(k) };
  assert.equal(loadLang(storage, { language: 'de-CH' }), 'de');
  assert.equal(loadLang(storage, { language: 'en-US' }), 'en');
  saveLang('en', storage);
  assert.equal(storage.getItem(LANG_KEY), 'en');
  assert.equal(loadLang(storage, { language: 'de-DE' }), 'en', 'gespeicherte Wahl schlägt navigator');
  saveLang('de', storage);
  assert.equal(loadLang(storage, { language: 'en' }), 'de');
});

describe('Texte folgen der Sprache', { concurrency: false }, () => {
test('t: Interpolation und Mehrzahl, Wechsel der Sprache', () => {
  setLang('de', { persist: false });
  assert.equal(t('menu.adventure'), 'Abenteuer');
  assert.equal(t('menu.playLevel', { n: 7 }), 'Level 7 spielen');
  assert.equal(t('result.giftAria', { n: 1 }), '1 Geschenk öffnen');
  assert.equal(t('result.giftAria', { n: 3 }), '3 Geschenke öffnen');
  setLang('en', { persist: false });
  assert.equal(getLang(), 'en');
  assert.equal(t('menu.adventure'), 'Adventure');
  assert.equal(t('menu.playLevel', { n: 7 }), 'Play Level 7');
  assert.equal(t('result.giftAria', { n: 1 }), 'Open 1 gift');
  assert.equal(t('result.giftAria', { n: 3 }), 'Open 3 gifts');
  assert.equal(t('lock.hint'), 'Unlock: clear Adventure 1–5');
  assert.equal(hasKey('no.such'), false);
  assert.equal(t('no.such'), 'no.such');
});

test('goalShort bleibt in beiden Sprachen kurz (drei Ziele auf 375 px)', () => {
  const samples = [
    { type: 'tile', value: 12 }, { type: 'make', count: 3, value: 8 },
    { type: 'score', points: 12000 }, { type: 'clear', tiles: 20 },
    { type: 'street', count: 1 }, { type: 'street', count: 3 },
    { type: 'combo', chain: 5 }, { type: 'empty', max: 4 },
    { type: 'long', count: 1 }, { type: 'long', count: 2 },
    { type: 'purge', tiles: 8, value: 3 }, { type: 'fuse', size: 5 },
    { type: 'fuse', size: 4, shape: 't' },
  ];
  for (const lang of LANGS) {
    setLang(lang, { persist: false });
    for (const g of samples) {
      const s = Camp.goalShort(g);
      assert.ok(s.length <= 18, `${lang} ${JSON.stringify(g)} → "${s}" (${s.length})`);
    }
  }
});

test('toolName und goalText folgen der Sprache', () => {
  setLang('de', { persist: false });
  assert.equal(Camp.toolName('rocket'), 'Rakete');
  assert.match(Camp.goalText({ type: 'fuse', size: 4, shape: 't' }), /T-Form/);
  setLang('en', { persist: false });
  assert.equal(Camp.toolName('rocket'), 'Rocket');
  assert.equal(Camp.toolName('extraMoves'), '+3 Moves');
  assert.match(Camp.goalText({ type: 'fuse', size: 4, shape: 't' }), /T/);
  assert.match(Camp.goalText({ type: 'street', count: 1 }), /straight/i);
});

test('Sprachwahl überlebt den Tutorial-Reset (Epoche 24, auch nach Merker launch-22)', () => {
  const mem = new Map([
    ['squish-campaign-v1', JSON.stringify({ version: 1, updatedAt: 1, levels: { 1: { stars: 3, moves: 5, at: 1 } } })],
    ['squish-campaign-tools-v1', JSON.stringify({ version: 3, extraMoves: 1, rocket: 0, hint: 0, wand: 0, gifts: [], pending: [] })],
    ['squish-campaign-tutorial-reset', 'launch-22'],
    [LANG_KEY, 'en'],
    ['shift3-play-v1', '{"score":9}'],
  ]);
  const storage = { getItem: k => mem.has(k) ? mem.get(k) : null, setItem: (k, v) => mem.set(k, v), removeItem: k => mem.delete(k) };
  const prog = Camp.loadProgress(storage);
  const inv = Camp.loadInventory(storage);
  const r = Camp.resetAdventureForTutorialsOnce(prog, inv, storage);
  assert.equal(r.reset, true);
  assert.equal(storage.getItem(LANG_KEY), 'en');
  assert.equal(storage.getItem('shift3-play-v1'), '{"score":9}');
  assert.equal(storage.getItem('squish-campaign-tutorial-reset'), Camp.TUTORIAL_RESET);
});

test('fmtNum folgt der Locale', () => {
  setLang('de', { persist: false });
  assert.match(fmtNum(12000), /12/);
  setLang('en', { persist: false });
  assert.equal(fmtNum(12000), '12,000');
});
});

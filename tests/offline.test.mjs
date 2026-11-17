// launch-31: Web-Spiel offline (Service Worker game/offline-sw.js, angemeldet von sw-register.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerOfflineCache, SW_URL } from '../game/sw-register.mjs';

const build = readFileSync(new URL('../game/build.txt', import.meta.url), 'utf8').trim();
const html = readFileSync(new URL('../game/index.html', import.meta.url), 'utf8');

test('Offline-Cache: Adresse trägt den aktuellen Build-Tag', () => {
  assert.equal(SW_URL, `offline-sw.js?v=${build}`);
});

test('Offline-Cache: nur im Web über http(s), nicht in der App-Hülle', () => {
  const calls = [];
  const nav = { serviceWorker: { register: (u, o) => { calls.push([u, o]); return Promise.resolve(); } } };
  const doc = { readyState: 'complete', documentElement: { dataset: {} } };
  assert.equal(registerOfflineCache({ nav: {}, doc, loc: { protocol: 'https:' } }), false, 'ohne serviceWorker');
  assert.equal(registerOfflineCache({ nav, doc, loc: { protocol: 'capacitor:' } }), false, 'App-Protokoll');
  assert.equal(registerOfflineCache({ nav, doc: { ...doc, documentElement: { dataset: { appShell: 'ios' } } }, loc: { protocol: 'https:' } }), false, 'App-Hülle');
  assert.equal(registerOfflineCache({ nav, doc, loc: { protocol: 'https:' } }), true);
});

test('Start blockiert nie auf dem Netz: Build-Check ohne festen alten Tag, keine fremden Skripte', () => {
  assert.ok(!/var BUILD='launch-\d+'/.test(html), 'kein fest eingetragener Build mehr');
  assert.ok(/script\[src\^="config\.js"\]/.test(html));
  assert.ok(!/<script[^>]+src="https?:/i.test(html) && !/<link[^>]+href="https?:/i.test(html), 'keine Skripte/Stile aus dem Netz');
  const sw = readFileSync(new URL('../game/offline-sw.js', import.meta.url), 'utf8');
  assert.ok(/timeout\(fetch\(req\), 4000\)/.test(sw), 'Navigation wartet höchstens 4 s aufs Netz');
  assert.ok(/searchParams\.has\('t'\)/.test(sw), 'build.txt?t=… geht unverändert durchs Netz');
});

test('Werbung offline: Zwischenwerbung still übersprungen, Belohnungsclip „nicht verfügbar“ (Hilfe bleibt dann gesperrt)', async () => {
  const na = await import('../game/native-ads.mjs');
  const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let calls = 0;
  na.registerNativeAds({ name: 'mock', showRewarded: async () => (calls++, { ok: true }), showInterstitial: async () => (calls++, { ok: true }) });
  try {
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
    assert.deepEqual(await na.showRewarded({}), { ok: false, unavailable: true });
    assert.equal((await na.showInterstitial({})).skipped, true);
    assert.equal(calls, 0, 'Adapter wird offline gar nicht gefragt');
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
    assert.deepEqual(await na.showRewarded({}), { ok: true });
    na.registerNativeAds({ name: 'mock', showRewarded: async () => { throw new Error('load'); } });
    assert.deepEqual(await na.showRewarded({}), { ok: false, unavailable: true }, 'Ladefehler = nicht verfügbar');
    na.registerNativeAds({ name: 'mock', showRewarded: async () => ({ ok: false }) });
    assert.deepEqual(await na.showRewarded({}), { ok: false }, 'Abbruch = keine Hilfe');
  } finally {
    na.registerNativeAds(null);
    if (nav) Object.defineProperty(globalThis, 'navigator', nav); else delete globalThis.navigator;
  }
});

test('launch-31: Hilfe ohne Clip gesperrt – kurzer Hinweis DE/EN, Werbefrei/Gold/Tutorial bleiben frei', async () => {
  const { STRINGS } = await import('../game/locales.mjs');
  assert.equal(STRINGS['tool.offline'].de, 'Keine Verbindung – Hilfe gerade nicht verfügbar');
  assert.ok(STRINGS['tool.offline'].en && STRINGS['tool.noAd'].de && STRINGS['tool.noAd'].en && STRINGS['tool.offlineAria'].en);
  const src = readFileSync(new URL('../game/game.mjs', import.meta.url), 'utf8');
  const req = src.slice(src.indexOf('function requestToolAd'), src.indexOf('function requestToolAd') + 260);
  assert.ok(req.indexOf('if(!toolAdRequired())return Promise.resolve(true);') < req.indexOf("if(isOffline()){helpUnavailable('offline');return Promise.resolve(false);}"), 'Werbefrei zuerst frei, sonst offline gesperrt');
  const ui = readFileSync(new URL('../game/ad-ui.mjs', import.meta.url), 'utf8');
  assert.ok(/if \(!res\.ok\) \{ if \(res\.unavailable\)[^}]*onUnavailable\?\.\(type\); \} onClose\?\.\(\); return; \}/.test(ui), 'kein Clip → keine Hilfe, Hinweis');
});

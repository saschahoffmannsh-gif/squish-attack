import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreToken, persistToken } from '../src/token-keychain.mjs';
import { setupConsent, createAdMobAdapter, EVENTS } from '../src/admob-adapter.mjs';
import { createStoreKitAdapter, createAdFreeAdapter } from '../src/store-adapter.mjs';
import { APP_CONFIG, resolveAdMob, storeProductId, shopIdFromProductId } from '../src/app-config.mjs';
import { createAttFlow, ATT_ASKED_KEY, ATT_TEXT } from '../src/att-prompt.mjs';
import { readFileSync } from 'node:fs';

const T1 = 'a'.repeat(64), T2 = 'b'.repeat(64), KEY = 'squish-save-token-v1';
const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { m, getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };
const keychain = (init = {}) => {
  const m = new Map(Object.entries(init)); const calls = [];
  return { m, calls,
    async get({ key }) { calls.push(['get', key]); if (!m.has(key)) throw new Error('Item with given key does not exist'); return { value: m.get(key) }; },
    async set({ key, value }) { calls.push(['set', key]); m.set(key, value); return { value: true }; } };
};

// ---------- Schlüsselbund ----------
test('Neuinstallation: localStorage leer → Token aus dem Schlüsselbund', async () => {
  const storage = mem(), secure = keychain({ [KEY]: T1 });
  const r = await restoreToken({ secure, storage, key: KEY });
  assert.deepEqual(r, { token: T1, source: 'keychain', wrote: false });
  assert.equal(storage.getItem(KEY), T1);
});
test('Vorhandener localStorage-Token gewinnt und landet im Schlüsselbund', async () => {
  const storage = mem({ [KEY]: T2 }), secure = keychain({ [KEY]: T1 });
  const r = await restoreToken({ secure, storage, key: KEY });
  assert.equal(r.source, 'local'); assert.equal(r.wrote, true);
  assert.equal(secure.m.get(KEY), T2);
});
test('Ohne Plugin oder bei Fehlern/Timeout: weiter mit localStorage, nichts kaputt', async () => {
  assert.equal((await restoreToken({ secure: null, storage: mem(), key: KEY })).source, 'none');
  const broken = { get: () => new Promise(() => {}), set: () => new Promise(() => {}) };
  const t0 = Date.now();
  const r = await restoreToken({ secure: broken, storage: mem({ [KEY]: T1 }), key: KEY, timeoutMs: 50 });
  assert.equal(r.token, T1); assert.ok(Date.now() - t0 < 1000);
  assert.equal((await restoreToken({ secure: keychain({ [KEY]: 'kaputt' }), storage: mem(), key: KEY })).source, 'none');
});
test('persistToken schreibt einen neu erzeugten Token genau einmal', async () => {
  const storage = mem(), secure = keychain();
  assert.equal(await persistToken({ secure, storage, key: KEY }), null);
  storage.setItem(KEY, T1);
  const last = await persistToken({ secure, storage, key: KEY });
  assert.equal(last, T1); assert.equal(secure.m.get(KEY), T1);
  const n = secure.calls.length;
  await persistToken({ secure, storage, key: KEY, last });
  assert.equal(secure.calls.length, n, 'kein zweites Schreiben');
});

// ---------- AdMob ----------
function admobMock({ consent = { status: 'REQUIRED', isConsentFormAvailable: true, canRequestAds: true }, att = 'notDetermined', reward = true, failLoad = false } = {}) {
  const calls = [], listeners = new Map();
  let attStatus = att;
  const emit = name => setTimeout(() => (listeners.get(name) || []).forEach(f => f()), 5);
  return { calls, listeners,
    async initialize(o) { calls.push(['initialize', o]); },
    async requestConsentInfo() { calls.push(['requestConsentInfo']); return consent; },
    async showConsentForm() { calls.push(['showConsentForm']); return { ...consent, status: 'OBTAINED' }; },
    async trackingAuthorizationStatus() { calls.push(['trackingStatus']); return { status: attStatus }; },
    async requestTrackingAuthorization() { calls.push(['requestTracking']); attStatus = 'authorized'; },
    async addListener(name, fn) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(fn); return { remove() { const l = listeners.get(name); l.splice(l.indexOf(fn), 1); } }; },
    async prepareRewardVideoAd(o) { calls.push(['prepareReward', o]); if (failLoad) throw new Error('no fill'); return {}; },
    async showRewardVideoAd() { calls.push(['showReward']); emit(EVENTS.rewardDismissed); if (!reward) throw new Error('Rewarded ad dismissed before earning a reward.'); return { type: 'coins', amount: 1 }; },
    async prepareInterstitial(o) { calls.push(['prepareInterstitial', o]); return {}; },
    async showInterstitial() { calls.push(['showInterstitial']); emit(EVENTS.interstitialDismissed); },
    async showPrivacyOptionsForm() {} };
}

test('AdMob: Debug-Test-IDs standard, Release-IDs bei __SQUISH_ADMOB_TESTING__=false; kein rewardedId', () => {
  assert.equal(APP_CONFIG.admob.testing, true);
  assert.equal(APP_CONFIG.admob.interstitialId, 'ca-app-pub-3940256099942544/4411468910');
  assert.equal('rewardedId' in APP_CONFIG.admob, false);
  const prev = globalThis.__SQUISH_ADMOB_TESTING__;
  try {
    globalThis.__SQUISH_ADMOB_TESTING__ = false;
    const live = resolveAdMob();
    assert.equal(live.testing, false);
    assert.equal(live.appId, 'ca-app-pub-3147947530766307~6450785208');
    assert.equal(live.interstitialId, 'ca-app-pub-3147947530766307/3361587432');
    assert.equal('rewardedId' in live, false);
    globalThis.__SQUISH_ADMOB_TESTING__ = true;
    const testIds = resolveAdMob();
    assert.equal(testIds.testing, true);
    assert.equal(testIds.appId, 'ca-app-pub-3940256099942544~1458002511');
    assert.equal(testIds.interstitialId, 'ca-app-pub-3940256099942544/4411468910');
  } finally {
    if (prev === undefined) delete globalThis.__SQUISH_ADMOB_TESTING__;
    else globalThis.__SQUISH_ADMOB_TESTING__ = prev;
  }
});
test('Reihenfolge: initialize → UMP → Formular → ATT', async () => {
  const A = admobMock();
  const s = await setupConsent(A, { askTracking: true, testing: true });
  assert.deepEqual(A.calls.map(c => c[0]), ['initialize', 'requestConsentInfo', 'showConsentForm', 'trackingStatus', 'requestTracking', 'trackingStatus']);
  assert.equal(A.calls[0][1].initializeForTesting, true);
  assert.equal(s.canRequestAds, true); assert.equal(s.consent, 'OBTAINED'); assert.equal(s.tracking, 'authorized');
});
test('ATT nur einmal fragen und abschaltbar; kein Formular wenn nicht nötig', async () => {
  const A = admobMock({ consent: { status: 'NOT_REQUIRED', canRequestAds: true }, att: 'denied' });
  await setupConsent(A, {});
  assert.ok(!A.calls.some(c => c[0] === 'showConsentForm' || c[0] === 'requestTracking'));
  const B = admobMock();
  await setupConsent(B, { askTracking: false });
  assert.ok(!B.calls.some(c => c[0].startsWith('tracking') || c[0] === 'requestTracking'));
});
test('launch-42: showRewarded ist ein No-Op und lädt keine Rewarded-Einheit', async () => {
  const A = admobMock();
  const ad = createAdMobAdapter({ AdMob: A, ids: APP_CONFIG.admob, testing: true });
  assert.deepEqual(await ad.showRewarded({ placement: 'tool' }), { ok: false, unavailable: true });
  assert.ok(!A.calls.some(c => c[0] === 'prepareReward' || c[0] === 'showReward'), 'kein SDK-Aufruf');
});
test('Keine Werbung ohne Einwilligung (canRequestAds=false); nie zwei gleichzeitig', async () => {
  const A = admobMock();
  const no = createAdMobAdapter({ AdMob: A, ids: APP_CONFIG.admob, ready: Promise.resolve({ canRequestAds: false }) });
  assert.deepEqual(await no.showRewarded(), { ok: false, unavailable: true });
  assert.deepEqual(await no.showInterstitial(), { ok: false, unavailable: true });
  assert.equal(A.calls.length, 0);
  const ad = createAdMobAdapter({ AdMob: admobMock(), ids: APP_CONFIG.admob });
  const [a, b] = await Promise.all([ad.showInterstitial(), ad.showRewarded()]);
  assert.deepEqual([a.ok, b.ok], [true, false]);
});
test('Zwischenwerbung wartet, bis sie geschlossen ist', async () => {
  const A = admobMock();
  let closed = false;
  A.showInterstitial = async () => { A.calls.push(['showInterstitial']); setTimeout(() => { closed = true; (A.listeners.get(EVENTS.interstitialDismissed) || []).forEach(f => f()); }, 30); };
  const r = await createAdMobAdapter({ AdMob: A, ids: APP_CONFIG.admob }).showInterstitial();
  assert.equal(r.ok, true); assert.equal(closed, true);
  assert.equal(A.calls.find(c => c[0] === 'prepareInterstitial')[1].adId, 'ca-app-pub-3940256099942544/4411468910');
});

test('launch-31 offline: nie hängen – Einwilligung/Laden mit Zeitlimit, ohne Netz gar kein Aufruf', async () => {
  const never = new Promise(() => {});
  const A = admobMock(); A.prepareRewardVideoAd = () => never; A.prepareInterstitial = () => never;
  const ad = createAdMobAdapter({ AdMob: A, ids: APP_CONFIG.admob, loadTimeoutMs: 60 });
  let t0 = Date.now();
  assert.deepEqual(await ad.showRewarded(), { ok: false, unavailable: true });
  assert.deepEqual(await ad.showInterstitial(), { ok: false, unavailable: true });
  assert.ok(Date.now() - t0 < 1000, 'Zeitlimit greift');
  const B = admobMock();
  t0 = Date.now();
  assert.deepEqual(await createAdMobAdapter({ AdMob: B, ids: APP_CONFIG.admob, ready: never, readyTimeoutMs: 60 }).showInterstitial(), { ok: false, unavailable: true });
  assert.ok(Date.now() - t0 < 1000); assert.equal(B.calls.length, 0, 'ohne Einwilligung nichts geladen');
  const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  try {
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
    const C = admobMock();
    assert.deepEqual(await createAdMobAdapter({ AdMob: C, ids: APP_CONFIG.admob }).showRewarded(), { ok: false, unavailable: true });
    assert.equal(C.calls.length, 0, 'offline: kein SDK-Aufruf');
  } finally { if (nav) Object.defineProperty(globalThis, 'navigator', nav); else delete globalThis.navigator; }
});

// ---------- StoreKit ----------
test('Produkt-IDs: Präfix + Shop-ID, hin und zurück', () => {
  assert.equal(storeProductId('rocket-3'), 'de.hoffmann.squishattack.rocket_3');
  assert.equal(storeProductId('bundle-mix'), 'de.hoffmann.squishattack.bundle_mix');
  assert.equal(shopIdFromProductId('de.hoffmann.squishattack.extraMoves_5'), 'extraMoves-5');
  assert.equal(shopIdFromProductId('com.other.x'), null);
});
test('Kauf: ok nur mit Transaktion; Abbruch/Fehler ergeben kein Werkzeug', async () => {
  const calls = [];
  const NP = { async purchaseProduct(o) { calls.push(o); return { transactionId: '2000000123' }; },
    async getProducts({ productIdentifiers }) { return { products: productIdentifiers.slice(0, 1).map(id => ({ identifier: id, priceString: '0,99 €', title: 'x', price: 0.99 })) }; } };
  const s = createStoreKitAdapter({ NativePurchases: NP, prefix: APP_CONFIG.store.productPrefix });
  assert.deepEqual(await s.purchase({ id: 'hint-3' }), { ok: true, transactionId: '2000000123' });
  assert.equal(calls[0].productIdentifier, 'de.hoffmann.squishattack.hint_3');
  assert.equal(calls[0].productType, 'inapp'); assert.equal(calls[0].isConsumable, true);
  const prices = await s.products([{ id: 'hint-1' }, { id: 'hint-3' }]);
  assert.equal(prices.get('hint-1').priceLabel, '0,99 €'); assert.equal(prices.has('hint-3'), false);
  const cancel = createStoreKitAdapter({ NativePurchases: { purchaseProduct: async () => { throw new Error('User cancelled'); } } });
  assert.equal((await cancel.purchase({ id: 'hint-1' })).reason, 'cancelled');
  const empty = createStoreKitAdapter({ NativePurchases: { purchaseProduct: async () => ({}) } });
  assert.equal((await empty.purchase({ id: 'hint-1' })).ok, false);
});
test('Ende-zu-Ende mit game/shop.mjs: nativer Store wird genutzt, Shop bleibt ausgeblendet', async () => {
  const shop = await import('../../game/shop.mjs');
  assert.equal(shop.SHOP_CONFIG.enabled, false, 'Shop bleibt aus');
  const NP = { async purchaseProduct() { return { transactionId: 't1' }; } };
  shop.registerNativeStore(createStoreKitAdapter({ NativePurchases: NP, prefix: APP_CONFIG.store.productPrefix }));
  assert.equal(shop.activeStore().kind, 'native');
  assert.equal((await shop.purchase('rocket-3')).ok, false, 'ausgeblendeter Shop verkauft nichts');
  const r = await shop.purchase('rocket-3', { config: { ...shop.SHOP_CONFIG, enabled: true } });
  assert.deepEqual([r.ok, r.test, r.transactionId, r.items], [true, false, 't1', { rocket: 3 }]);
  shop.registerNativeStore(null);
});

test('Werbefrei-Produkt-ID ist fest squish.adfree, ohne Shop-Präfix', () => {
  assert.equal(APP_CONFIG.store.adFreeProductId, 'squish.adfree');
  assert.equal(storeProductId('adfree'), 'de.hoffmann.squishattack.adfree');
  assert.notEqual(APP_CONFIG.store.adFreeProductId, storeProductId('adfree'));
});
test('Werbefrei: Nicht-Verbrauch-Kauf, Restore, lokales Entitlement', async () => {
  const storage = mem();
  const calls = [];
  let purchases = [];
  const NP = {
    async purchaseProduct(o) { calls.push(['purchase', o]); return { transactionId: 'af1' }; },
    async restorePurchases() { calls.push(['restore']); },
    async getPurchases() { calls.push(['get']); return { purchases }; },
    async getProducts({ productIdentifiers }) {
      return { products: productIdentifiers.map(id => ({ identifier: id, priceString: '4,99 €', title: 'Werbefrei', price: 4.99 })) };
    },
  };
  const a = createAdFreeAdapter({ NativePurchases: NP, productId: 'squish.adfree', storage, log() {} });
  assert.equal(a.isAdFree(), false);
  assert.equal(await a.loadPrice(), '4,99 €');
  const buy = await a.purchase();
  assert.equal(buy.ok, true);
  assert.equal(buy.transactionId, 'af1');
  assert.equal(calls[calls.length - 1][1].productIdentifier, 'squish.adfree');
  assert.equal(calls[calls.length - 1][1].isConsumable, false);
  assert.equal(a.isAdFree(), true);
  assert.equal(storage.getItem('squish-adfree-v1'), '1');

  const again = createAdFreeAdapter({ NativePurchases: NP, productId: 'squish.adfree', storage, log() {} });
  assert.equal(again.isAdFree(), true, 'Entitlement überlebt einen Neustart lokal');

  const freshStore = mem();
  purchases = [{ productIdentifier: 'squish.adfree' }];
  const rest = createAdFreeAdapter({ NativePurchases: NP, productId: 'squish.adfree', storage: freshStore, log() {} });
  const r = await rest.restore();
  assert.equal(r.ok, true);
  assert.equal(r.owned, true);
  assert.equal(rest.isAdFree(), true);
  assert.deepEqual(calls.filter(c => c[0] === 'restore').length > 0, true);
  assert.equal(freshStore.getItem('squish-adfree-v1'), '1');

  purchases = [];
  const missStore = mem();
  const miss = createAdFreeAdapter({ NativePurchases: NP, productId: 'squish.adfree', storage: missStore, log() {} });
  const none = await miss.restore();
  assert.equal(none.ok, true);
  assert.equal(none.owned, false);
  assert.equal(miss.isAdFree(), false);

  const cancel = createAdFreeAdapter({
    NativePurchases: { purchaseProduct: async () => { throw new Error('User cancelled the purchase'); } },
    storage: mem(), log() {},
  });
  assert.equal((await cancel.purchase()).reason, 'cancelled');
});

// ---------- launch-32: ATT erst nach dem ersten gelösten Level, mit Vorfrage ----------
const tick = (ms = 5) => new Promise(r => setTimeout(r, ms));
test('launch-32: App-Start fragt nur UMP, kein ATT (native-boot: askTracking:false)', async () => {
  const A = admobMock();
  await setupConsent(A, { askTracking: false, testing: true });
  assert.deepEqual(A.calls.map(c => c[0]), ['initialize', 'requestConsentInfo', 'showConsentForm']);
  const boot = readFileSync(new URL('../src/native-boot.mjs', import.meta.url), 'utf8');
  assert.match(boot, /setupConsent\(AdMob, \{ askTracking: false/);
  assert.match(boot, /createAttFlow\(/);
});
test('launch-32: erst nach dem ersten gelösten Level: Einwilligung → Vorfrage → ATT, nur einmal', async () => {
  const A = admobMock(), target = new EventTarget(), storage = mem(), order = [];
  let consentDone = false;
  const ready = new Promise(r => setTimeout(() => { consentDone = true; order.push('consent'); r({ canRequestAds: true }); }, 10));
  const prompt = async ({ lang }) => { order.push('pre:' + lang); assert.ok(consentDone, 'Einwilligung vor der Vorfrage'); };
  const orig = A.requestTrackingAuthorization; A.requestTrackingAuthorization = async () => { order.push('att'); return orig(); };
  const flow = createAttFlow({ AdMob: A, ready, storage, target, prompt, lang: () => 'de', delayMs: 0 });
  await tick(30);
  assert.ok(!A.calls.some(c => c[0] === 'requestTracking'), 'kein ATT vor dem ersten Sieg');
  target.dispatchEvent(new Event('squish:level-won')); await tick(30);
  assert.deepEqual(order, ['consent', 'pre:de', 'att']);
  assert.equal(flow.stats.status, 'authorized'); assert.equal(storage.getItem(ATT_ASKED_KEY), 'authorized');
  target.dispatchEvent(new Event('squish:level-won')); await tick(30);
  assert.equal(order.filter(x => x === 'att').length, 1, 'nur einmal');
});
test('launch-32: schon entschieden → keine Vorfrage; Einwilligung hängt → später erneut', async () => {
  const A = admobMock({ att: 'denied' }), target = new EventTarget(), storage = mem(); let shown = 0;
  createAttFlow({ AdMob: A, storage, target, prompt: async () => { shown++; }, delayMs: 0 });
  target.dispatchEvent(new Event('squish:level-won')); await tick(20);
  assert.equal(shown, 0); assert.ok(!A.calls.some(c => c[0] === 'requestTracking')); assert.equal(storage.getItem(ATT_ASKED_KEY), 'denied');
  const B = admobMock(), t2 = new EventTarget(), s2 = mem(); let shown2 = 0;
  const f = createAttFlow({ AdMob: B, ready: new Promise(() => {}), storage: s2, target: t2, prompt: async () => { shown2++; }, delayMs: 0, readyMs: 20 });
  t2.dispatchEvent(new Event('squish:level-won')); await tick(60);
  assert.equal(shown2, 0); assert.equal(f.stats.skipped, 'consent-pending'); assert.equal(s2.getItem(ATT_ASKED_KEY), null);
});
test('launch-32: Vorfrage-Texte DE/EN kurz', () => {
  assert.equal(ATT_TEXT.de.title, 'Hilf uns, das Spiel kostenlos zu halten');
  assert.equal(ATT_TEXT.en.title, 'Help us keep the game free');
  for (const l of ['de', 'en']) assert.ok(ATT_TEXT[l].line.length < 110 && ATT_TEXT[l].ok, l);
});
test('launch-32: Werbefrei 4,99 € in der StoreKit-Testdatei', () => {
  const sk = JSON.parse(readFileSync(new URL('../ios/App/App/Squish.storekit', import.meta.url), 'utf8'));
  const p = sk.products.find(x => x.productID === 'squish.adfree');
  assert.equal(p.displayPrice, '4.99'); assert.equal(p.type, 'NonConsumable');
});

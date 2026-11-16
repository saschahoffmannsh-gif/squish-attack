// App-Hülle e2e (Linux, Chrome): Web-Version unverändert + App-Bundle mit gemocktem Capacitor.
// Supabase wird blockiert (offline-Test, keine Testdaten im Live-Backend).
// node e2e-app.mjs <webBase> <appBase>
import { launch, open, sleep, IPHONE, IPHONE_UA } from '../../tests/e2e/lib.mjs';
const [web = 'http://127.0.0.1:8731/game/', app = 'http://127.0.0.1:8732/index.html'] = process.argv.slice(2);
let fails = 0; const check = (n, ok, info = '') => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}${info ? ' · ' + info : ''}`); if (!ok) fails++; };
const T = 'c'.repeat(64);

function mockCapacitor(token) {
  window.__calls = [];
  const C = (...a) => window.__calls.push(a);
  const L = new Map();
  const emit = n => setTimeout(() => (L.get(n) || []).forEach(f => f()), 30);
  const plugins = {
    Haptics: { impact: async o => C('impact', o.style), notification: async o => C('notify', o.type) },
    App: { addListener: async () => ({ remove() {} }) },
    StatusBar: { hide: async () => C('statusbar-hide') },
    SplashScreen: { hide: async () => C('splash-hide') },
    KeepAwake: { keepAwake: async () => C('awake'), allowSleep: async () => C('sleep') },
    SecureStoragePlugin: {
      get: async ({ key }) => { const v = localStorage.getItem('__kc_' + key); if (!v) throw new Error('missing'); return { value: v }; },
      set: async ({ key, value }) => { C('kc-set'); localStorage.setItem('__kc_' + key, value); return { value: true }; } },
    AdMob: {
      initialize: async o => C('admob-init', o.initializeForTesting),
      requestConsentInfo: async () => (C('consent'), { status: 'REQUIRED', isConsentFormAvailable: true, canRequestAds: true }),
      showConsentForm: async () => (C('consent-form'), { status: 'OBTAINED', canRequestAds: true }),
      trackingAuthorizationStatus: async () => ({ status: window.__att || 'notDetermined' }),
      requestTrackingAuthorization: async () => { C('att'); window.__att = 'denied'; },
      addListener: async (n, f) => { if (!L.has(n)) L.set(n, []); L.get(n).push(f); return { remove() { const l = L.get(n); l.splice(l.indexOf(f), 1); } }; },
      prepareRewardVideoAd: async o => C('prep-reward', o.adId),
      showRewardVideoAd: async () => { C('show-reward'); emit('onRewardedVideoAdDismissed'); return { type: 'x', amount: 1 }; },
      prepareInterstitial: async o => C('prep-inter', o.adId),
      showInterstitial: async () => { C('show-inter'); emit('interstitialAdDismissed'); },
      showPrivacyOptionsForm: async () => {} },
    NativePurchases: {
      getProducts: async ({ productIdentifiers }) => ({ products: productIdentifiers.map(id => ({ identifier: id, priceString: '1,09 €', title: id, price: 1.09 })) }),
      purchaseProduct: async o => (C('buy', o.productIdentifier), { transactionId: 'tx-1' }) },
  };
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', isPluginAvailable: n => n in plugins, Plugins: plugins, registerPlugin: n => plugins[n] };
  // "Neuinstallation": Token nur im Schlüsselbund
  if (!sessionStorage.getItem('seeded')) { localStorage.clear(); localStorage.setItem('__kc_squish-save-token-v1', token); localStorage.setItem('squish-mode-v1', 'endless'); sessionStorage.setItem('seeded', '1'); }
}

const helpers = page => ({
  waitButtons: (l, timeout = 60000) => page.waitForFunction(l => { const t = [...document.querySelectorAll('#home-screen button')].map(b => b.dataset.label); return l.every(x => t.some(y => y === x || y?.startsWith(x))) && !window.SquishGame?.menu?.busy; }, { timeout, polling: 200 }, l),
  press: l => page.$$eval('#home-screen button', (bs, l) => bs.find(b => b.dataset.label === l || b.dataset.label?.startsWith(l)).click(), l),
  idle: (timeout = 60000) => page.waitForFunction(() => { const s = window.SquishGame?.state; return s && s.started && !s.busy && !s.booting; }, { timeout, polling: 100 }),
});
async function blockBackend(page) {
  await page.setRequestInterception(true);
  page.on('request', r => /supabase\.co/.test(r.url()) ? r.abort() : r.continue());
}
async function startEndless(page, H) {
  await H.waitButtons(['Endlos']).catch(() => {});
  if (!(await page.$$eval('#home-screen button', bs => bs.some(b => b.dataset.label === 'Endlos')))) { await page.$$eval('#home-screen button', bs => bs.find(b => b.dataset.label === 'Zurück')?.click()); await sleep(600); }
  await H.waitButtons(['Endlos']); await H.press('Endlos'); await H.waitButtons(['Neues Spiel']); await H.press('Neues Spiel'); await H.idle(); await sleep(600);
}

const browser = await launch();
try {
  // ---------- 1. Web-Version (wie GitHub Pages) ----------
  {
    const page = await browser.newPage(); const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setViewport(IPHONE); await page.setUserAgent(IPHONE_UA); await blockBackend(page);
    await page.goto(web, { waitUntil: 'load' });
    const H = helpers(page);
    await startEndless(page, H);
    const s = await page.evaluate(() => ({ native: window.SquishNative?.isNative, ads: window.SquishGame.appAds.native, btn: !document.getElementById('endless-tool') || document.getElementById('endless-tool').hidden, app: !!window.SquishApp }));
    check('Web: kein nativer Modus, keine App-Brücke', s.native === false && !s.ads && !s.app, JSON.stringify(s));
    check('Web: Endlos-Raketen-Knopf unsichtbar', s.btn);
    for (let i = 0; i < 4; i++) { await page.evaluate(i => window.SquishGame.move(['left', 'up', 'right', 'down'][i], i), i); await sleep(200); await H.idle(); }
    // Auch bei "fälligem" Angebot: im Web ohne Adapter kein Angebot
    await page.evaluate(() => { const p = window.SquishGame.appAds.pacing; p.endlessMove = () => true; });
    await page.evaluate(() => window.SquishGame.move('left', 2)); await sleep(300); await H.idle(); await sleep(300);
    check('Web: kein Endlos-Werbeangebot', !(await page.evaluate(() => window.SquishGame.appAds.adOpen)));
    check('Web: keine JS-Fehler', errors.length === 0, errors.join(' | '));
    await page.close();
  }
  // ---------- 2. App-Bundle mit gemocktem Capacitor ----------
  {
    const page = await browser.newPage(); const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/supabase|Failed to load resource|ERR_FAILED/i.test(m.text())) errors.push('console: ' + m.text()); });
    await page.setViewport(IPHONE); await page.setUserAgent(IPHONE_UA); await blockBackend(page);
    await page.evaluateOnNewDocument(mockCapacitor, T);
    await page.goto(app, { waitUntil: 'load' });
    await page.waitForFunction(() => location.pathname.endsWith('/game/index.html') && window.SquishGame, { timeout: 60000 });
    const H = helpers(page);
    await page.waitForFunction(() => window.SquishApp?.store === 'storekit' && window.SquishApp?.ads, { timeout: 30000 });
    const a = await page.evaluate(() => ({ app: window.SquishApp, tok: localStorage.getItem('squish-save-token-v1'), calls: window.__calls.map(c => c[0]), native: window.SquishGame.appAds.native, hapt: window.SquishNative.hasNativeHaptics, cls: document.documentElement.className, vp: document.querySelector('meta[name=viewport]').content }));
    check('App: Token nach "Neuinstallation" aus dem Schlüsselbund', a.tok === T && a.app.token === 'keychain', a.app.token);
    check('App: UMP vor ATT, Test-Modus', JSON.stringify(a.calls.filter(c => ['admob-init', 'consent', 'consent-form', 'att'].includes(c))) === JSON.stringify(['admob-init', 'consent', 'consent-form', 'att']), a.calls.join(','));
    check('App: Werbe-Adapter und StoreKit angemeldet, native Haptik', a.native && a.app.store === 'storekit' && a.hapt, JSON.stringify(a.app.ads));
    check('App: is-native-app, Splash ausgeblendet, Viewport ohne Zoom', /is-native-app/.test(a.cls) && a.calls.includes('splash-hide') && /user-scalable=no/.test(a.vp));
    const price = await page.evaluate(async () => (await import('../game/shop.mjs?v=launch-19')).productById('rocket-3').priceLabel);
    check('App: StoreKit-Preise im Shop', price === '1,09 €', String(price));
    const buy = await page.evaluate(() => window.SquishApp.testPurchase('rocket-3'));
    check('App: Testkauf über StoreKit-Adapter', buy.ok && !buy.test && buy.transactionId === 'tx-1' && buy.items.rocket === 3, JSON.stringify(buy));

    await startEndless(page, H);
    for (let i = 0; i < 3; i++) { await page.evaluate(i => window.SquishGame.move(['left', 'up', 'right'][i], i + 1), i); await sleep(200); await H.idle(); }
    const hap = await page.evaluate(() => window.__calls.filter(c => c[0] === 'impact').length);
    check('App: Taptic-Haptik bei Zügen/Merges', hap > 0, String(hap));
    check('App: kein Angebot vor 10 Minuten', !(await page.evaluate(() => window.SquishGame.appAds.adOpen)));
    await page.evaluate(() => { const p = window.SquishGame.appAds.pacing; const o = p.endlessMove; p.endlessMove = () => (o(), true); });
    await page.evaluate(() => window.SquishGame.move('down', 3)); await sleep(300); await H.idle(); await sleep(400);
    const offer = await page.evaluate(() => ({ open: window.SquishGame.appAds.adOpen, type: window.SquishGame.appAds.adType, busy: window.SquishGame.state.busy, title: document.getElementById('ad-title')?.textContent, badge: document.querySelector('.ad-badge')?.textContent }));
    check('App: Endlos-Angebot nach einem Zug, wenn alles ruhig ist', offer.open && offer.type === 'rocket' && !offer.busy && offer.title === 'Bonus-Rakete' && offer.badge === 'Werbeclip', JSON.stringify(offer));
    await page.click('#ad-watch'); await sleep(800);
    const got = await page.evaluate(() => ({ stock: window.SquishGame.appAds.endlessStock, btn: !document.getElementById('endless-tool').hidden, calls: window.__calls.map(c => c[0]) }));
    check('App: Clip angesehen → +1 Rakete im Endlos-Vorrat, Knopf sichtbar', got.stock === 1 && got.btn && got.calls.includes('show-reward'), JSON.stringify({ stock: got.stock, btn: got.btn }));
    const before = await page.evaluate(() => window.SquishGame.state.board?.flat?.().filter(Boolean).length ?? null);
    await page.click('#endless-tool'); await sleep(200);
    const armed = await page.evaluate(() => window.SquishGame.appAds.endlessArmed);
    const id = await page.evaluate(() => { const b = window.SquishGame.state.board; for (const row of b) for (const t of row) if (t) return t.id; return null; });
    await page.evaluate(id => window.SquishGame.appAds.rocketAt(id), id); await sleep(300); await H.idle();
    const after = await page.evaluate(() => ({ n: window.SquishGame.state.board?.flat?.().filter(Boolean).length ?? null, stock: window.SquishGame.appAds.endlessStock }));
    check('App: Rakete einsetzen entfernt einen Stein, Vorrat 0', armed && after.stock === 0 && (before == null || after.n === before - 1), JSON.stringify({ armed, before, after }));
    // Weggedrückt: kein Werkzeug
    await page.evaluate(() => { const p = window.SquishGame.appAds.pacing; p.endlessMove = () => true; });
    await page.evaluate(() => window.SquishGame.move('up', 0)); await sleep(300); await H.idle(); await sleep(300);
    if (await page.evaluate(() => window.SquishGame.appAds.adOpen)) { await page.click('.ad-later'); await sleep(300); }
    check('App: Angebot wegdrücken gibt nichts', (await page.evaluate(() => window.SquishGame.appAds.endlessStock)) === 0);
    await page.evaluate(() => { const p = window.SquishGame.appAds.pacing; delete p.endlessMove; });

    // Zwischenwerbung: nach 10 Siegen beim nächsten Levelstart
    await page.evaluate(() => { const p = window.SquishGame.appAds.pacing; for (let i = 0; i < 10; i++) p.levelWon(); });
    const n0 = await page.evaluate(() => window.__calls.filter(c => c[0] === 'show-inter').length);
    await page.click('#pause').catch(() => {}); await sleep(400);
    await page.evaluate(() => document.getElementById('to-menu')?.click()); await sleep(1200);
    await H.waitButtons(['Zurück']).catch(() => {});
    if (!(await page.$$eval('#home-screen button', bs => bs.some(b => b.dataset.label === 'Abenteuer')))) { await page.$$eval('#home-screen button', bs => bs.find(b => b.dataset.label === 'Zurück')?.click()); await sleep(800); }
    await H.waitButtons(['Abenteuer']); await H.press('Abenteuer'); await H.waitButtons(['Levelauswahl']); await H.press('Levelauswahl');
    await page.waitForFunction(() => !document.getElementById('campaign-screen').hidden, { timeout: 15000 }); await sleep(300);
    await page.$eval('#campaign-chapters button[data-level="1"]', b => b.click());
    await page.waitForFunction(() => window.SquishGame.campaign.level === 1 && window.SquishGame.campaign.status === 'playing', { timeout: 30000, polling: 100 });
    const n1 = await page.evaluate(() => window.__calls.filter(c => c[0] === 'show-inter').length);
    const due = await page.evaluate(() => window.SquishGame.appAds.pacing.interstitialDue);
    check('App: Zwischenwerbung vor dem Level nach dem 10. Sieg', n1 === n0 + 1 && !due, `${n0}→${n1}`);
    check('App: keine JS-Fehler', errors.length === 0, errors.join(' | '));
    await page.close();
  }
} finally { await browser.close(); }
console.log(fails ? `\n${fails} FEHLER` : '\nalles grün');
process.exit(fails ? 1 : 0);

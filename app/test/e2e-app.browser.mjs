// App-Hülle e2e (Linux, Chrome): Web-Version unverändert + App-Bundle mit gemocktem Capacitor.
// Supabase wird blockiert (offline-Test, keine Testdaten im Live-Backend).
// node e2e-app.mjs <webBase> <appBase>
// launch-28: Fortschritt über Level 5 vorbelegt (Endlos freigeschaltet), 10-Minuten-Werbung ohne Belohnung.
// launch-29: Endlos ohne Werkzeuge – Zehnerstufen bringen nichts, alter Endlos-Vorrat wird ignoriert, Spielstand bleibt.
// Braucht puppeteer-core und Google Chrome (wie die übrigen e2e-Skripte, nicht Teil von npm test).
// Zwei lokale Server: Repo-Wurzel (Web) und app/www (App-Bundle), z. B. python3 -m http.server.
import puppeteer from 'puppeteer-core';
const IPHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const launch = () => puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
const [web = 'http://127.0.0.1:8731/game/', app = 'http://127.0.0.1:8732/index.html'] = process.argv.slice(2);
let fails = 0; const check = (n, ok, info = '') => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}${info ? ' · ' + info : ''}`); if (!ok) fails++; };
const T = 'c'.repeat(64);

// Fortschritt über Level 5 hinaus (Endlos wird erst danach freigeschaltet) + alle Reset-Marker gesetzt
function seedProgress() {
  if (sessionStorage.getItem('seededP')) return; sessionStorage.setItem('seededP', '1');
  const levels = {}; for (let i = 1; i <= 6; i++) levels[i] = { stars: 3, moves: 3, at: 1 };
  const s = { 'squish-campaign-v1': JSON.stringify({ version: 1, levels, updatedAt: 1 }), 'squish-campaign-tutorial-reset': 'launch-30', 'squish-campaign-curve-stars-reset': 'launch-27', 'squish-campaign-progress-reset': 'launch-14', 'squish-campaign-stars-reset': 'launch-18', 'squish-campaign-tools-reset': 'launch-13', 'squish-lang-v1': 'de' };
  for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
}
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
    await page.evaluateOnNewDocument(seedProgress);
    await page.goto(web, { waitUntil: 'load' });
    const H = helpers(page);
    await startEndless(page, H);
    const s = await page.evaluate(() => ({ native: window.SquishNative?.isNative, ads: window.SquishGame.appAds.native, btn: !document.getElementById('endless-tools') && !document.querySelector('.endless-tool'), app: !!window.SquishApp,
      lb: !document.getElementById('board-screen') && ![...document.querySelectorAll('button,a')].some(b => /Bestenliste/i.test(b.textContent + (b.dataset.label || ''))) && !/Bestenliste/.test(document.body.innerHTML) }));
    check('Web: keine Bestenliste mehr (kein Knopf, kein Bildschirm)', s.lb);
    check('Web: kein nativer Modus, keine App-Brücke', s.native === false && !s.ads && !s.app, JSON.stringify(s));
    check('Web: kein zusätzlicher Knopf im Endlos-Modus', s.btn);
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
    await page.evaluateOnNewDocument(mockCapacitor, T); await page.evaluateOnNewDocument(seedProgress);
    // Spielstand-Patch vor dem Laden anwenden (beim Verlassen speichert das Spiel seinen Stand neu)
    await page.evaluateOnNewDocument(() => { const v = +sessionStorage.getItem('patchPeak'); if (!v) return; sessionStorage.removeItem('patchPeak'); const k = 'shift3-play-v1'; const st = JSON.parse(localStorage.getItem(k)); const base = Math.max(0, ...st.board.flat().filter(Boolean).map(t => t.id)) + 1000; st.peak = v; st.board = st.board.map(r => r.map(() => null)); st.board[0][0] = { id: base, value: v }; st.board[0][1] = { id: base + 1, value: v }; st.board[3][3] = { id: base + 2, value: 1 }; st.queue[0] = v; localStorage.setItem(k, JSON.stringify(st)); });
    await page.goto(app, { waitUntil: 'load' });
    await page.waitForFunction(() => location.pathname.endsWith('/game/index.html') && window.SquishGame, { timeout: 60000 });
    const H = helpers(page);
    await page.waitForFunction(() => window.SquishApp?.store === 'storekit' && window.SquishApp?.ads, { timeout: 30000 });
    const a = await page.evaluate(() => ({ app: window.SquishApp, tok: localStorage.getItem('squish-save-token-v1'), calls: window.__calls.map(c => c[0]), native: window.SquishGame.appAds.native, hapt: window.SquishNative.hasNativeHaptics, cls: document.documentElement.className, vp: document.querySelector('meta[name=viewport]').content }));
    check('App: Token nach "Neuinstallation" aus dem Schlüsselbund', a.tok === T && a.app.token === 'keychain', a.app.token);
    check('App: UMP vor ATT, Test-Modus', JSON.stringify(a.calls.filter(c => ['admob-init', 'consent', 'consent-form', 'att'].includes(c))) === JSON.stringify(['admob-init', 'consent', 'consent-form', 'att']), a.calls.join(','));
    check('App: Werbe-Adapter und StoreKit angemeldet, native Haptik', a.native && a.app.store === 'storekit' && a.hapt, JSON.stringify(a.app.ads));
    check('App: is-native-app, Splash ausgeblendet, Viewport ohne Zoom', /is-native-app/.test(a.cls) && a.calls.includes('splash-hide') && /user-scalable=no/.test(a.vp));
    const price = await page.evaluate(async () => (await import(performance.getEntriesByType('resource').map(e => e.name).find(n => /\/shop\.mjs/.test(n)))).productById('rocket-3').priceLabel);
    check('App: StoreKit-Preise im Shop', price === '1,09 €', String(price));
    const buy = await page.evaluate(() => window.SquishApp.testPurchase('rocket-3'));
    check('App: Testkauf über StoreKit-Adapter', buy.ok && !buy.test && buy.transactionId === 'tx-1' && buy.items.rocket === 3, JSON.stringify(buy));

    await startEndless(page, H);
    for (let i = 0; i < 3; i++) { await page.evaluate(i => window.SquishGame.move(['left', 'up', 'right'][i], i + 1), i); await sleep(200); await H.idle(); }
    const hap = await page.evaluate(() => window.__calls.filter(c => c[0] === 'impact').length);
    check('App: Taptic-Haptik bei Zügen/Merges', hap > 0, String(hap));
    check('App: kein Angebot vor 10 Minuten', !(await page.evaluate(() => window.SquishGame.appAds.adOpen)));
    // launch-28: 10-Minuten-Werbung = normale Zwischenwerbung ohne Belohnung
    const before = await page.evaluate(() => ({ inv: (({ at, ...r }) => r)(window.SquishGame.campaign.inventory), inter: window.__calls.filter(c => c[0] === 'show-inter').length }));
    await page.evaluate(() => { const p = window.SquishGame.appAds.pacing; const o = p.endlessMove; p.endlessMove = () => (o(), true); });
    await page.evaluate(() => window.SquishGame.move('down', 3)); await sleep(300); await H.idle(); await sleep(1200);
    await page.evaluate(() => { delete window.SquishGame.appAds.pacing.endlessMove; });
    const plain = await page.evaluate(() => { const log = JSON.parse(localStorage.getItem('squish-tool-log-v1') || '{"events":[]}'); return { inter: window.__calls.filter(c => c[0] === 'show-inter').length, reward: window.__calls.filter(c => c[0] === 'show-reward').length, open: window.SquishGame.appAds.adOpen, ev: log.events.filter(e => e.source === 'ad-endless').at(-1) }; });
    check('App: 10-Minuten-Werbung ist eine Zwischenwerbung ohne Angebot und ohne Werkzeug', plain.inter === before.inter + 1 && plain.reward === 0 && !plain.open, JSON.stringify(plain));
    // launch-29: Zehnerstufen bringen in Endlos nichts mehr; Spielstand bleibt über Neuladen erhalten
    const continueEndless = async () => {
      await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.SquishGame, { timeout: 60000 });
      await H.waitButtons(['Endlos']).catch(() => {});
      if (!(await page.$$eval('#home-screen button', bs => bs.some(b => b.dataset.label === 'Endlos')))) { await page.$$eval('#home-screen button', bs => bs.find(b => b.dataset.label === 'Zurück')?.click()); await sleep(600); }
      await H.waitButtons(['Endlos']); await H.press('Endlos'); await H.waitButtons(['Weiterspielen']); await H.press('Weiterspielen'); await H.idle(20000).catch(async e => { await page.screenshot({ path: '/tmp/app28-stuck.png' }); console.log('STUCK', JSON.stringify(await page.evaluate(() => { const s = window.SquishGame.state; return { started: s.started, busy: s.busy, booting: s.booting, peak: s.peak, board: s.board.map(r => r.map(t => t?.value ?? 0)) }; }))); throw e; }); await sleep(600);
    };
    // Rekord v, zwei v-Steine in Reihe 0, nächster Stein v ⇒ Squish zu v+1 über die Zehnerstufe
    const milestone = async v => {
      await page.evaluate(v => sessionStorage.setItem('patchPeak', String(v)), v);
      await continueEndless();
      const p0 = await page.evaluate(() => window.SquishGame.state.peak);
      for (const d of ['right']) { const mv = await page.evaluate(() => window.SquishGame.state.moves); await page.evaluate(d => window.SquishGame.move(d, 0), d); await sleep(300); await H.idle(); if (await page.evaluate(m => window.SquishGame.state.moves > m, mv)) break; }
      await sleep(900);
      return { p0, ...(await page.evaluate(() => ({ peak: window.SquishGame.state.peak, moves: window.SquishGame.state.moves, stored: JSON.parse(localStorage.getItem('squish-endless-tools-v1') || 'null'),
        saved: JSON.parse(localStorage.getItem('shift3-play-v1') || 'null'), ex: !!document.querySelector('.ex-panel') && !document.getElementById('explain-dialog')?.hidden,
        bar: !!document.getElementById('endless-tools') || !!document.querySelector('.endless-tool'), note: document.getElementById('note')?.hidden ? '' : document.getElementById('note')?.textContent || '' }))) };
    };
    // Alter Endlos-Vorrat aus launch-28 liegt noch im Speicher – wird ignoriert, nicht angezeigt
    await page.evaluate(() => localStorage.setItem('squish-endless-tools-v1', JSON.stringify({ rocket: 2, wand: 1, at: 1 })));
    const m1 = await milestone(9);
    check('App: Squish über 10 ⇒ kein Werkzeug, keine Leiste, kein Endlos-Erklärfenster', m1.p0 === 9 && m1.peak === 10 && !m1.bar && !m1.ex && !/Rekord-Squish|Record Squish/.test(m1.note), JSON.stringify({ ...m1, saved: !!m1.saved }));
    check('App: Endlos-Spielstand gespeichert (Rekord 10)', !!m1.saved && Math.max(...m1.saved.board.flat().filter(Boolean).map(t => t.value)) >= 10, JSON.stringify(m1.saved?.board?.map(r => r.map(t => t?.value ?? 0))));
    { const ia = await page.evaluate(() => (({ at, ...r }) => r)(window.SquishGame.campaign.inventory)); check('App: Abenteuer-Vorrat unverändert', JSON.stringify(ia) === JSON.stringify(before.inv), JSON.stringify({ b: before.inv, a: ia })); }
    const m2 = await milestone(19);
    check('App: Squish über 20 ⇒ ebenfalls nichts', m2.peak === 20 && !m2.bar && !m2.ex, JSON.stringify({ ...m2, saved: !!m2.saved }));
    // Neuladen: Spielstand kommt zurück, weiterspielen geht
    await continueEndless();
    const r = await page.evaluate(() => ({ peak: window.SquishGame.state.peak, started: window.SquishGame.state.started, moves: window.SquishGame.state.moves, campaign: window.SquishGame.campaign.mode }));
    let moved = false;
    for (const d of ['up', 'left', 'right', 'down']) { const mv = await page.evaluate(() => window.SquishGame.state.moves); await page.evaluate(d => window.SquishGame.move(d, 2), d); await sleep(300); await H.idle(); if (await page.evaluate(m => window.SquishGame.state.moves > m, mv)) { moved = true; break; } }
    check('App: nach Neuladen Endlos-Stand da und spielbar', r.started && r.peak >= 20 && !r.campaign && moved, JSON.stringify({ ...r, moved }));

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

// App-Hülle e2e (Linux, Chrome): Web-Version unverändert + App-Bundle mit gemocktem Capacitor.
// Supabase wird blockiert (offline-Test, keine Testdaten im Live-Backend).
// node e2e-app.mjs <webBase> <appBase>
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
    const s = await page.evaluate(() => ({ native: window.SquishNative?.isNative, ads: window.SquishGame.appAds.native, btn: !!document.getElementById('endless-tools')?.hidden, app: !!window.SquishApp,
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
    const price = await page.evaluate(async () => (await import('../game/shop.mjs?v=launch-22')).productById('rocket-3').priceLabel);
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
    const before = await page.evaluate(() => { const s = window.SquishGame.state; return { board: JSON.stringify(s.board), score: s.score, moves: s.moves, inv: { ...window.SquishGame.campaign.inventory }, einv: window.SquishGame.appAds.endless }; });
    const offer = await page.evaluate(() => ({ open: window.SquishGame.appAds.adOpen, type: window.SquishGame.appAds.adType, busy: window.SquishGame.state.busy, title: document.getElementById('ad-title')?.textContent, desc: document.querySelector('.ad-reward-text small')?.textContent, foot: document.querySelector('.ad-foot')?.textContent, badge: document.querySelector('.ad-badge')?.textContent, bar: !!document.getElementById('endless-tools')?.hidden }));
    check('App: Endlos-Angebot nach einem ruhigen Zug, Belohnung = Rakete für Endlos', offer.open && offer.type === 'rocket' && !offer.busy && offer.title === 'Werkzeug für Endlos' && /Endlos-Vorrat/.test(offer.foot) && offer.badge === 'Werbeclip' && offer.bar && before.einv.rocket === 0, JSON.stringify(offer));
    await page.click('#ad-watch'); await sleep(800);
    const after = await page.evaluate(() => { const s = window.SquishGame.state; const log = JSON.parse(localStorage.getItem('squish-tool-log-v1') || '{"events":[]}'); const bar = document.getElementById('endless-tools'); return { board: JSON.stringify(s.board), score: s.score, moves: s.moves, inv: { ...window.SquishGame.campaign.inventory }, einv: window.SquishGame.appAds.endless, stored: JSON.parse(localStorage.getItem('squish-endless-tools-v1') || 'null'), ev: log.events.at(-1), calls: window.__calls.map(c => c[0]), bar: bar && !bar.hidden, rocketBtn: bar && !bar.querySelector('[data-tool=rocket]').hidden, wandBtn: bar && !bar.querySelector('[data-tool=wand]').hidden }; });
    check('App: Clip angesehen → +1 Rakete im Endlos-Vorrat (lokal gespeichert), Quelle "ad-endless"', after.einv.rocket === 1 && after.stored?.rocket === 1 && after.ev?.source === 'ad-endless' && after.ev?.tool === 'rocket' && after.calls.includes('show-reward'), JSON.stringify({ einv: after.einv, ev: after.ev }));
    check('App: Abenteuer-Vorrat unverändert', JSON.stringify(after.inv) === JSON.stringify(before.inv), JSON.stringify({ b: before.inv, a: after.inv }));
    check('App: Endlos-Brett unverändert, Raketen-Knopf sichtbar (Zauberstab nicht)', after.board === before.board && after.score === before.score && after.bar && after.rocketBtn && !after.wandBtn);
    // Nächstes Angebot: Zauberstab (reihum); erst wegdrücken (gibt nichts), dann ansehen
    await page.evaluate(() => { const p = window.SquishGame.appAds.pacing; p.endlessMove = () => true; });
    await page.evaluate(() => window.SquishGame.move('up', 0)); await sleep(300); await H.idle(); await sleep(300);
    const t2 = await page.evaluate(() => window.SquishGame.appAds.adType);
    if (await page.evaluate(() => window.SquishGame.appAds.adOpen)) { await page.click('.ad-later'); await sleep(300); }
    const e2 = await page.evaluate(() => window.SquishGame.appAds.endless);
    check('App: nächstes Angebot = Zauberstab; wegdrücken gibt nichts', t2 === 'wand' && e2.wand === 0 && e2.rocket === 1, JSON.stringify({ t2, e2 }));
    await page.evaluate(() => window.SquishGame.move('right', 1)); await sleep(300); await H.idle(); await sleep(300);
    const t3 = await page.evaluate(() => window.SquishGame.appAds.adType);
    if (await page.evaluate(() => window.SquishGame.appAds.adOpen)) { await page.click('#ad-watch'); await sleep(800); }
    await page.evaluate(() => { const p = window.SquishGame.appAds.pacing; delete p.endlessMove; });
    const e3 = await page.evaluate(() => window.SquishGame.appAds.endless);
    check('App: Zauberstab angesehen → +1 Zauberstab im Endlos-Vorrat', t3 === 'wand' && e3.wand === 1, JSON.stringify({ t3, e3 }));
    // Rakete einsetzen: Knopf antippen (scharf), Stein wählen → Stein weg
    await H.idle();
    await page.click('.endless-tool[data-tool=rocket]'); await sleep(200);
    const armed = await page.evaluate(() => window.SquishGame.appAds.armed);
    const r0 = await page.evaluate(() => { const b = window.SquishGame.state.board; const t = b.flat().find(Boolean); return { id: t.id, n: b.flat().filter(Boolean).length }; });
    const fired = await page.evaluate(id => window.SquishGame.appAds.rocketAt(id), r0.id); await sleep(300); await H.idle();
    const r1 = await page.evaluate(id => { const b = window.SquishGame.state.board; return { n: b.flat().filter(Boolean).length, gone: !b.flat().some(t => t && t.id === id), einv: window.SquishGame.appAds.endless, armed: window.SquishGame.appAds.armed, rocketBtn: !document.querySelector('.endless-tool[data-tool=rocket]').hidden }; }, r0.id);
    check('App: Endlos-Rakete sprengt einen Stein weg, Vorrat −1, Knopf weg', armed === 'rocket' && fired && r1.gone && r1.n === r0.n - 1 && r1.einv.rocket === 0 && !r1.armed && !r1.rocketBtn, JSON.stringify({ armed, fired, r0, r1 }));
    // Zauberstab: Wert innerhalb der Spanne setzen
    await page.click('.endless-tool[data-tool=wand]'); await sleep(200);
    const w0 = await page.evaluate(() => { const b = window.SquishGame.state.board; const t = b.flat().find(Boolean); const ch = window.SquishGame.appAds.wandChoices(t.value); return { id: t.id, value: t.value, ch, armed: window.SquishGame.appAds.armed }; });
    const pick = w0.ch.find(v => v !== w0.value);
    const ok = await page.evaluate((id, v) => window.SquishGame.appAds.wand(id, v), w0.id, pick); await sleep(400); await H.idle();
    const w1 = await page.evaluate(() => ({ einv: window.SquishGame.appAds.endless, board: JSON.stringify(window.SquishGame.state.board), stored: JSON.parse(localStorage.getItem('squish-endless-tools-v1') || 'null'), bar: !!document.getElementById('endless-tools').hidden }));
    check('App: Endlos-Zauberstab setzt eine Zahl der Spanne, Vorrat −1, Leiste leer → ausgeblendet', w0.armed === 'wand' && ok && !w0.ch.includes(w0.value) && Math.max(...w0.ch) <= 12 && w1.einv.wand === 0 && w1.stored?.wand === 0 && w1.bar, JSON.stringify({ w0, pick, w1: w1.einv }));
    const inv3 = await page.evaluate(() => ({ ...window.SquishGame.campaign.inventory }));
    check('App: Abenteuer-Vorrat nach Endlos-Einsätzen unverändert', JSON.stringify(inv3) === JSON.stringify(before.inv));

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

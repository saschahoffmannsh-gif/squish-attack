// App-Hülle offline (launch-31): gebündeltes Spiel (app/www) mit gemocktem Capacitor, kein Internet.
//  A „Funkloch“: navigator.onLine = true, aber jeder SDK-Netzaufruf (AdMob, StoreKit) hängt für immer.
//  B „Flugmodus“: navigator.onLine = false.
// Erwartung: Start ohne Hänger, Zwischenwerbung blockiert den Levelstart nicht, Level spielbar.
// Hilfe (Rakete/+3) braucht einen Clip: ohne Clip gesperrt, kurzer Hinweis, kein Werkzeug (Werbefrei wäre frei).
// node e2e-app-offline.browser.mjs [appBase] [WxH]   (Server auf app/www, z. B. python3 -m http.server 8732)
import puppeteer from 'puppeteer-core';
const [app = 'http://127.0.0.1:8732/index.html', vp = '390x844'] = process.argv.slice(2);
const [W, H] = vp.split('x').map(Number);
const IPHONE = { width: W, height: H, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const check = (n, ok, info = '') => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}${info ? ' · ' + info : ''}`); if (!ok) fails++; };
const origin = new URL(app).origin;

function mock(airplane) {
  if (airplane) Object.defineProperty(Navigator.prototype, 'onLine', { get: () => false, configurable: true });
  window.__calls = []; const C = (...a) => window.__calls.push(a); const never = () => new Promise(() => {});
  const plugins = {
    Haptics: { impact: async () => {}, notification: async () => {} },
    App: { addListener: async () => ({ remove() {} }) },
    StatusBar: { hide: async () => {} }, SplashScreen: { hide: async () => C('splash-hide') },
    KeepAwake: { keepAwake: async () => {}, allowSleep: async () => {} },
    SecureStoragePlugin: { get: async ({ key }) => { const v = localStorage.getItem('__kc_' + key); if (!v) throw new Error('missing'); return { value: v }; },
      set: async ({ key, value }) => { localStorage.setItem('__kc_' + key, value); return { value: true }; } },
    AdMob: { initialize: async () => C('admob-init'), requestConsentInfo: () => (C('consent'), never()), showConsentForm: never,
      trackingAuthorizationStatus: async () => ({ status: 'denied' }), requestTrackingAuthorization: async () => {},
      addListener: async () => ({ remove() {} }),
      prepareRewardVideoAd: () => (C('prep-reward'), never()), showRewardVideoAd: never,
      prepareInterstitial: () => (C('prep-inter'), never()), showInterstitial: never, showPrivacyOptionsForm: never },
    NativePurchases: { getProducts: () => (C('products'), never()), purchaseProduct: never, restorePurchases: never, getPurchases: never },
  };
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', isPluginAvailable: n => n in plugins, Plugins: plugins, registerPlugin: n => plugins[n] };
  if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
  localStorage.clear();
  const levels = {}; for (let i = 1; i <= 5; i++) levels[i] = { stars: 3, moves: 3, at: 1 };
  const s = { 'squish-campaign-v1': JSON.stringify({ version: 1, levels, updatedAt: 1 }), 'squish-lang-v1': 'de',
    'squish-campaign-tutorial-reset': 'launch-30', 'squish-campaign-curve-stars-reset': 'launch-27', 'squish-campaign-progress-reset': 'launch-14',
    'squish-campaign-stars-reset': 'launch-18', 'squish-campaign-tools-reset': 'launch-13', 'squish-campaign-rules28': 'launch-28',
    'squish-explain-seen-v1': JSON.stringify(['merge', 'merge5', 'street', 'tools', 'gifts', 'gates', 'ads', 'tool-cost', 'gold-used']),
    'squish-ad-pacing-v1': JSON.stringify({ wins: 0, due: true, reward: 0 }), '__kc_squish-save-token-v1': 'c'.repeat(64) };
  for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
}

const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
try {
  for (const airplane of [false, true]) {
    const tag = airplane ? 'Flugmodus' : 'Funkloch';
    const ctx = await browser.createBrowserContext(); const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/i.test(m.text())) errors.push('console: ' + m.text()); });
    await page.setRequestInterception(true);
    page.on('request', r => r.url().startsWith(origin) ? r.continue() : r.abort('internetdisconnected'));   // kein Internet, App-Dateien lokal
    await page.setViewport(IPHONE); await page.setUserAgent(UA);
    await page.evaluateOnNewDocument(mock, airplane);
    const t0 = Date.now();
    await page.goto(app, { waitUntil: 'load' });
    const up = await page.waitForFunction(() => location.pathname.endsWith('/game/index.html') && [...document.querySelectorAll('#home-screen button')].some(b => b.dataset.nav === 'adventure') && !window.SquishGame?.menu?.busy, { timeout: 30000, polling: 200 }).then(() => true, () => false);
    check(`${tag}: App startet (kein schwarzer Bildschirm)`, up, (Date.now() - t0) + ' ms');
    check(`${tag}: Start unter 8 s`, Date.now() - t0 < 8000, (Date.now() - t0) + ' ms');
    check(`${tag}: kein Service Worker in der App`, !(await page.evaluate(async () => (await navigator.serviceWorker?.getRegistrations?.() || []).length)));
    // Level 4 (Rakete, kein Tutorial-Level mit freier Hilfe) mit fälliger Zwischenwerbung
    await page.$$eval('[data-nav]', bs => bs.find(b => b.dataset.nav === 'levels').click());
    await page.waitForFunction(() => !document.getElementById('campaign-screen').hidden, { timeout: 20000 }); await sleep(400);
    const t1 = Date.now();
    await page.click('.campaign-level-btn[data-level="4"]');
    const started = await page.waitForFunction(() => window.SquishGame.campaign.status === 'playing' && window.SquishGame.state.started && !window.SquishGame.state.busy, { timeout: 30000, polling: 100 }).then(() => true, () => false);
    const ls = Date.now() - t1;
    check(`${tag}: Levelstart trotz fälliger Zwischenwerbung`, started, ls + ' ms');
    check(`${tag}: Zwischenwerbung hält höchstens kurz auf`, ls < (airplane ? 3000 : 7000), ls + ' ms');
    await sleep(1200);
    if (await page.evaluate(() => !!document.getElementById('explain-dialog') && !document.getElementById('explain-dialog').hidden)) { await page.click('#explain-ok'); await sleep(400); }
    // Hilfe: Rakete – ohne Clip gesperrt
    const badge = await page.evaluate(() => ['tool-rocket', 'tool-extra'].map(id => document.getElementById(id)?.dataset.offline));
    if (airplane) check('Flugmodus: Rakete und +3 mit Kein-Netz-Abzeichen', badge[0] === '1' && badge[1] === '1', JSON.stringify(badge));
    else check('Funkloch: kein Abzeichen (onLine = true, Clip wird versucht)', badge[0] === '' && badge[1] === '', JSON.stringify(badge));
    await page.click('#tool-rocket'); await sleep(500);
    let dialog = !!(await page.$('#ad-watch'));
    if (!airplane && !dialog && await page.evaluate(() => window.SquishGame.campaign.armedTool === 'rocket')) {
      // Rakete wird zuerst scharf geschaltet, der Clip kommt beim Tipp aufs Ziel
      const p0 = await page.evaluate(() => { const b = window.SquishGame.state.board; for (let r = 4; r >= 0; r--) for (let q = 0; q < 5; q++) if (b[r][q] && !b[r][q].bound) return window.SquishGame.cellPoint(r, q); });
      await page.mouse.click(p0.x, p0.y); await sleep(600); dialog = !!(await page.$('#ad-watch'));
    }
    if (airplane) check('Flugmodus: kein Werbe-Dialog', !dialog);
    else { check('Funkloch: Werbe-Dialog angeboten', dialog); if (dialog) await page.click('#ad-watch'); }
    const re = airplane ? /Keine Verbindung – Hilfe gerade nicht verfügbar/ : /Gerade kein Clip da – Hilfe kurz nicht verfügbar/;
    const t2 = Date.now();
    const noted = await page.waitForFunction(r => { const n = document.getElementById('note'); return n && !n.hidden && new RegExp(r).test(n.textContent); }, { timeout: 12000, polling: 100 }, re.source).then(() => true, () => false);
    check(`${tag}: kurzer Hinweis „Hilfe nicht verfügbar“`, noted, (Date.now() - t2) + ' ms');
    await sleep(600);
    const c = await page.evaluate(() => ({ used: window.SquishGame.campaign.toolsUsed.length, armed: window.SquishGame.campaign.armedTool || null, ad: !!document.getElementById('ad-watch'), status: window.SquishGame.campaign.status, busy: window.SquishGame.state.busy }));
    // Funkloch: Rakete bleibt scharf wie nach einem Abbruch – jeder weitere Tipp fragt erneut einen Clip an.
    check(`${tag}: keine Hilfe ohne Clip, Spiel läuft weiter`, !c.used && (!airplane || !c.armed) && !c.ad && c.status === 'playing' && !c.busy, JSON.stringify(c));
    const mv = await page.evaluate(() => window.SquishGame.state.moves);
    for (const [d, l] of [['left', 0], ['up', 1]]) { await page.evaluate((d, l) => window.SquishGame.move(d, l), d, l); await sleep(400); await page.waitForFunction(() => !window.SquishGame.state.busy, { timeout: 15000 }).catch(() => {}); }
    check(`${tag}: Züge laufen`, await page.evaluate(m => window.SquishGame.state.moves > m || window.SquishGame.campaign.status !== 'playing', mv));
    check(`${tag}: keine JS-Fehler`, errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(fails ? `\n${fails} FEHLER` : '\nalles grün'); process.exit(fails ? 1 : 0);

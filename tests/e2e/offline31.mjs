// launch-31 offline: Web-Spiel einmal online laden (Service Worker + Cache), dann Server stoppen und neu laden.
// node offline31.mjs <root-dir|url> <port> <de|en> <WxH>   (url: live, Offline per Netz-Emulation, Backend blockiert)
import { launch, sleep, IPHONE, IPHONE_UA } from './lib.mjs';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
const [root = '/workspace/squish-l30', port = '8771', lang = 'de', vp = '390x844'] = process.argv.slice(2);
const [W, H] = vp.split('x').map(Number);
const remote = /^https?:/.test(root);
const base = remote ? root : `http://127.0.0.1:${port}/game/`;
const own = remote ? new URL(root).origin + '/' : `http://127.0.0.1:${port}/`;
const levels = JSON.parse(readFileSync((remote ? '/workspace/squish-l30' : root) + '/levels/levels-001-100.json', 'utf8')).levels;
let fail = 0; const ok = (n, c, x = '') => { if (!c) fail++; console.log(c ? 'OK  ' : 'FAIL', n, x); };
const startServer = () => remote ? Promise.resolve({ kill() {} }) : new Promise(res => { const p = spawn('python3', ['-m', 'http.server', port, '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' }); setTimeout(() => res(p), 900); });
let srv = await startServer();
const browser = await launch();
const ctx = await browser.createBrowserContext(); const page = await ctx.newPage(); const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) errors.push('console: ' + m.text()); });
await page.setRequestInterception(true);
page.on('request', r => r.url().startsWith(own) ? r.continue() : r.abort('internetdisconnected'));   // kein Backend
await page.setViewport({ ...IPHONE, width: W, height: H }); await page.setUserAgent(IPHONE_UA);
await page.evaluateOnNewDocument(lang => { if (!localStorage.getItem('squish-lang-v1')) localStorage.setItem('squish-lang-v1', lang); }, lang);
const ready = () => page.waitForFunction(() => [...document.querySelectorAll('#home-screen button')].some(b => b.dataset.nav === 'adventure') && !window.SquishGame?.menu?.busy, { timeout: 25000, polling: 200 }).then(() => true, () => false);
// 1. online
await page.goto(base, { waitUntil: 'load' });
{ const r0 = await ready(); ok('Online: Start', r0, r0 ? '' : JSON.stringify(await page.evaluate(() => ({ b: document.body?.innerText.slice(0, 200), sg: !!window.SquishGame, busy: window.SquishGame?.menu?.busy })))+' '+JSON.stringify(errors.slice(0,3))); }
const sw = await page.waitForFunction(async () => { const r = await navigator.serviceWorker.getRegistration('./'); return !!(r?.active) && (await caches.keys()).some(k => k.startsWith('squish-game-')); }, { timeout: 60000, polling: 500 }).then(() => true, () => false);
ok('Online: Service Worker aktiv, Cache angelegt', sw);
const files = await page.evaluate(async () => { const k = (await caches.keys()).find(k => k.startsWith('squish-game-')); return k ? (await (await caches.open(k)).keys()).length : 0; });
ok('Cache vorgeladen (index + Module + Grafik)', files > 60, String(files));
await sleep(1500);
// 2. offline: Server weg
srv.kill(); if (remote) await page.setOfflineMode(true); await sleep(800);
const t0 = Date.now();
await page.reload({ waitUntil: 'load' }).catch(e => errors.push('reload ' + e.message));
const r1 = await ready(); const ms = Date.now() - t0;
ok('Offline: Spiel startet (kein schwarzer Bildschirm)', r1, ms + ' ms');
ok('Offline: Start schneller als 8 s', ms < 8000, ms + ' ms');
ok('Offline: Startbild sichtbar (Menü-Knöpfe, Build)', await page.evaluate(() => document.querySelectorAll('#home-screen button').length >= 4 && /launch-/.test(document.getElementById('home-build')?.textContent || '')));
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
// Level 1 spielen
await page.$$eval('#home-screen button, [data-nav]', bs => bs.find(b => b.dataset.nav === 'levels').click());
await page.waitForFunction(() => !document.getElementById('campaign-screen').hidden, { timeout: 20000 }).catch(() => {}); await sleep(500);
await page.click('.campaign-level-btn[data-level="1"]');
await page.waitForFunction(() => window.SquishGame.campaign.status === 'playing' && window.SquishGame.state.started && !window.SquishGame.state.busy, { timeout: 30000, polling: 100 }).catch(() => {});
await sleep(1200);
if (await page.evaluate(() => !!document.getElementById('explain-dialog') && !document.getElementById('explain-dialog').hidden)) { await page.click('#explain-ok'); await sleep(500); }
const sol = levels[0].solution || '';
for (const ch of sol) { const k = ch.charCodeAt(0) - 97; await page.evaluate((d, l) => window.SquishGame.move(d, l), ['left', 'right', 'up', 'down'][Math.floor(k / 5)], k % 5); await sleep(350); await page.waitForFunction(() => !window.SquishGame.state.busy, { timeout: 20000 }).catch(() => {}); }
const won = await page.waitForFunction(() => window.SquishGame.campaign.resultOpen, { timeout: 20000 }).then(() => true, () => false);
const c = await page.evaluate(() => window.SquishGame.campaign);
ok('Offline: Level 1 gespielt und gewonnen, Sterne lokal gespeichert', won && c.progress.levels['1']?.stars >= 1, JSON.stringify({ l1: c.progress.levels['1'], st: c.status, lv: c.level, sol, ex: await page.evaluate(() => document.getElementById('explain-dialog')?.dataset.topic), mv: await page.evaluate(() => window.SquishGame.state.moves) }));
// launch-31: Hilfe offline gesperrt (Clip nötig) – Hinweis, kein Dialog; online wieder mit Clip
{
  await page.evaluate(() => { const lv = {}; for (let i = 1; i <= 5; i++) lv[i] = { stars: 3, moves: 3, at: 1 };
    localStorage.setItem('squish-campaign-v1', JSON.stringify({ version: 1, levels: lv, updatedAt: 1 }));
    localStorage.setItem('squish-explain-seen-v1', JSON.stringify(['merge', 'merge5', 'street', 'tools', 'gifts', 'gates', 'ads', 'tool-cost', 'gold-used'])); });
  await page.setOfflineMode(true);
  await page.reload({ waitUntil: 'load' }); await ready();
  ok('Offline: navigator.onLine = false', await page.evaluate(() => navigator.onLine === false));
  await page.$$eval('[data-nav]', bs => bs.find(b => b.dataset.nav === 'levels').click());
  await page.waitForFunction(() => !document.getElementById('campaign-screen').hidden, { timeout: 20000 }); await sleep(400);
  await page.click('.campaign-level-btn[data-level="4"]');
  await page.waitForFunction(() => window.SquishGame.campaign.status === 'playing' && !window.SquishGame.state.busy, { timeout: 30000, polling: 100 }); await sleep(1200);
  if (await page.evaluate(() => !!document.getElementById('explain-dialog') && !document.getElementById('explain-dialog').hidden)) { await page.click('#explain-ok'); await sleep(400); }
  const b = await page.evaluate(() => ['tool-rocket', 'tool-extra'].map(id => document.getElementById(id)?.dataset.offline));
  ok('Offline: Rakete und +3 mit Sperr-Abzeichen', b[0] === '1' && b[1] === '1', JSON.stringify(b));
  await page.click('#tool-rocket'); await sleep(500);
  const st = await page.evaluate(() => ({ note: document.getElementById('note')?.hidden ? '' : document.getElementById('note')?.textContent, ad: !!document.getElementById('ad-watch'), armed: document.getElementById('tool-rocket').classList.contains('is-armed'), used: window.SquishGame.campaign.toolsUsed.length }));
  ok('Offline: Tippen → kurzer Hinweis, kein Werbe-Dialog, keine Hilfe', (lang === 'de' ? /Keine Verbindung – Hilfe gerade nicht verfügbar/ : /No connection/).test(st.note || '') && !st.ad && !st.armed && !st.used, JSON.stringify(st));
  if (process.env.SHOT_LOCK) { await sleep(200); await page.screenshot({ path: process.env.SHOT_LOCK }); }
  await page.setOfflineMode(false); await sleep(600);
  const on = await page.evaluate(() => document.getElementById('tool-rocket')?.dataset.offline);
  ok('Wieder online: Abzeichen weg', on === '', String(on));
}
// Regeln (Erklär-Fenster, lazy Bilder)
await page.evaluate(() => { document.querySelector('#campaign-menu, #campaign-home, [data-nav="home"]')?.click(); });
ok('Keine JS-Fehler offline', errors.length === 0, JSON.stringify(errors.slice(0, 4)));
// 3. wieder online: neue Version wird geholt
srv = await startServer(); await page.setOfflineMode(false);
await page.reload({ waitUntil: 'load' }); ok('Wieder online: Start', await ready());
srv.kill();
await browser.close();
console.log(fail ? `\n${fail} FEHLER` : '\nALLES OK'); process.exit(fail ? 1 : 0);

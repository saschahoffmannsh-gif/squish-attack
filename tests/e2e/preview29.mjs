// Vorschau launch-29: Erklär-Szenen (Standbilder) + Ergebnis-Fenster mit Gold-Geschenk-Kachel. 390×844, Backend blockiert.
import { launch, sleep, IPHONE, IPHONE_UA } from './lib.mjs';
import { readFileSync } from 'node:fs';
const base = process.argv[2] || 'http://127.0.0.1:8741/game/';
const OUT = '/workspace/previews/launch29/';
const ROOT = '/workspace/squish-l29/';
const levels = JSON.parse(readFileSync(ROOT + 'levels/levels-001-100.json', 'utf8')).levels;
const only = process.argv[3] || 'all';
const RESETS = { 'squish-campaign-tutorial-reset': 'launch-24', 'squish-campaign-curve-stars-reset': 'launch-27', 'squish-campaign-progress-reset': 'launch-14', 'squish-campaign-stars-reset': 'launch-18', 'squish-campaign-tools-reset': 'launch-13', 'squish-campaign-rules28': 'launch-28' };
const SEEN = JSON.stringify(['merge', 'merge5', 'street', 'tools', 'gifts', 'gates', 'ads']);
const prog = n => JSON.stringify({ version: 1, updatedAt: 5, levels: Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), { stars: 3, moves: 3, at: 1 }])) });
const browser = await launch();
const errors = [];
async function newPage(storage, lang) {
  const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', r => { const u = r.url(); if (u.includes('/functions/v1/') || (u.includes('/rest/v1/') && !['GET', 'OPTIONS', 'HEAD'].includes(r.method()))) return r.abort('failed'); r.continue(); });
  await page.setViewport(IPHONE); await page.setUserAgent(IPHONE_UA);
  await page.evaluateOnNewDocument((s, lang) => {
    if (sessionStorage.getItem('pv')) return; sessionStorage.setItem('pv', '1');
    Object.defineProperty(navigator, 'language', { get: () => lang === 'de' ? 'de-DE' : 'en-US' });
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
  }, { ...RESETS, 'squish-lang-v1': lang, ...storage }, lang);
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForFunction(() => [...document.querySelectorAll('#home-screen button')].some(b => b.dataset.nav === 'adventure') && !window.SquishGame.menu.busy, { timeout: 60000, polling: 200 });
  await sleep(800);
  return { ctx, page };
}
const freeze = (page, frac) => page.evaluate(frac => {
  for (const a of document.getAnimations()) {
    const tg = a.effect?.target; const tm = a.effect?.getTiming?.();
    if (tg?.closest?.('.ex-stage')) { a.pause(); const d = Number(tm.duration) || 0; const delay = Number(tm.delay) || 0; a.currentTime = delay + frac * d; }
    else if (tm && tm.iterations !== Infinity) a.finish();
  }
}, frac);
// ---------- Erklär-Fenster ----------
const FRAMES = { merge: [.22, .56], merge5: [.22, .56], street: [.22, .56], tools: [.34, .80], gifts: [.22, .58], gates: [.18, .64], ads: [.24, .74], endless: [.27, .84] };
const NAMES = { merge: '01-verschmelzen', merge5: '02-fuenfer', street: '03-strasse', tools: '04-hilfen-sterne', gifts: '05-gold-geschenke', gates: '06-kapitel-sterne', ads: '07-werbung', endless: '08-endlos' };
if (only === 'all' || only === 'ex') for (const lang of ['de', 'en']) {
  const { ctx, page } = await newPage({ 'squish-campaign-v1': prog(12), 'squish-explain-seen-v1': SEEN }, lang);
  await page.evaluate(async () => {
    const src = [...document.querySelectorAll('script[type=module]')].map(s => s.src).find(Boolean);
    const url = new URL('explain.mjs?v=launch-29', src || location.href).href;
    const m = await import(url); window.__ex = m.createExplainer({}); window.__ex.register('endless', m.ENDLESS_TOPIC, { after: 'gates' });
  });
  for (const topic of Object.keys(FRAMES)) {
    const frames = lang === 'de' ? FRAMES[topic] : [FRAMES[topic][1]];
    for (const [i, f] of frames.entries()) {
      await page.evaluate(t => { window.__ex.show(t); }, topic); await sleep(700);
      await freeze(page, f); await sleep(120);
      const file = `${OUT}${NAMES[topic]}-${lang}${lang === 'de' ? (i ? '-b' : '-a') : ''}.png`;
      await page.screenshot({ path: file });
      const of = await page.evaluate(() => { const p = document.querySelector('.ex-panel'); return { sh: p.scrollHeight, ch: p.clientHeight, say: document.querySelector('.ex-say')?.firstChild?.textContent }; });
      console.log(file, JSON.stringify(of));
      await page.evaluate(() => window.__ex.close({ silent: true }));
    }
  }
  if (lang === 'de') { // Kapitel gesperrt (Kontext)
    await page.evaluate(() => { window.__ex.show('gates', { chapter: 4, need: 65, have: 58 }); }); await sleep(700); await freeze(page, .5); await sleep(120);
    await page.screenshot({ path: OUT + '06-kapitel-sterne-de-gesperrt.png' }); console.log(OUT + '06-kapitel-sterne-de-gesperrt.png');
    await page.evaluate(() => window.__ex.close({ silent: true }));
  }
  await ctx.close();
}
// ---------- Ergebnis-Fenster mit Gold-Geschenk ----------
async function result(lang, pending, file, { badge = false, got = [] } = {}) {
  const inv = { version: 3, extraMoves: 0, rocket: 0, hint: 0, wand: 0, gifts: [...got, ...pending.map(g => g.id)], pending, at: 1 };
  const { ctx, page } = await newPage({ 'squish-campaign-v1': prog(9), 'squish-explain-seen-v1': SEEN, 'squish-campaign-tools-v1': JSON.stringify(inv) }, lang);
  await page.$$eval('#home-screen button, [data-nav]', bs => bs.find(b => b.dataset.nav === 'levels').click());
  await page.waitForFunction(() => !document.getElementById('campaign-screen').hidden, { timeout: 20000 }); await sleep(400);
  await page.click('.campaign-level-btn[data-level="10"]');
  await page.waitForFunction(() => window.SquishGame.campaign.status === 'playing' && window.SquishGame.state.started && !window.SquishGame.state.busy, { timeout: 60000, polling: 100 }); await sleep(1200);
  for (const ch of levels[9].solution) { const k = ch.charCodeAt(0) - 97; await page.evaluate((d, l) => window.SquishGame.move(d, l), ['left', 'right', 'up', 'down'][Math.floor(k / 5)], k % 5); await sleep(300); await page.waitForFunction(() => !window.SquishGame.state.busy, { timeout: 30000, polling: 100 }); }
  await page.waitForFunction(() => window.SquishGame.campaign.resultOpen, { timeout: 20000 }); await sleep(3200);
  if (badge) await page.evaluate(() => { document.getElementById('campaign-result-goldbadge').hidden = false; });   // simuliert: Gold im Level eingesetzt
  await page.screenshot({ path: file });
  console.log(file, JSON.stringify(await page.evaluate(() => ({ gift: document.getElementById('campaign-result-gift').textContent, msg: document.getElementById('campaign-result-message').textContent }))));
  await ctx.close();
}
if (only === 'all' || only === 'result' || only === 'result1') {
  if (only !== 'result1') await result('de', [{ id: 'gold-3', type: 'rocket' }], OUT + '00-ergebnis-geschenke-de.png');
  await result('de', [], OUT + '00-ergebnis-geschenk-plus3-goldabzeichen-de.png', { badge: true, got: ['gold-3'] });
  if (only !== 'result1') await result('en', [{ id: 'gold-3', type: 'rocket' }], OUT + '00-ergebnis-geschenke-en.png');
}
console.log('errors', JSON.stringify(errors));
await browser.close();

// Live-Check launch-28: neue Regeln – nur +3 Züge und Rakete (beliebig oft, Clip vor jedem Einsatz, Web = Dummy),
// Sterne 3/2/1 nach Hilfen, Gold-Geschenke (sternneutral, ohne Clip), Erklär-Fenster, Tutorial Level 6,
// strengere Kapitel-Hürden mit Bestandsschutz, einmalige Neubewertung (nichts gelöscht), Epoche 28.
// Backend-Schreibzugriffe blockiert (functions/v1 und REST-Schreibzugriffe). VP=375x667 für kleines iPhone.
//   node tests/e2e/live-check28.mjs [url]
import { launch, sleep, IPHONE as IPHONE0, IPHONE_UA } from './lib.mjs';
import { readFileSync } from 'node:fs';
const VP = (process.env.VP || '390x844').split('x').map(Number);
const IPHONE = { ...IPHONE0, width: VP[0], height: VP[1] };
const ROOT = (process.env.ROOT || '/workspace/squish-l28') + '/';   // Repo-Stand für Level-Lösungen; Skript läuft aus squish-e2e/campaign (lib.mjs)
const levels = JSON.parse(readFileSync(ROOT + 'levels/levels-001-100.json', 'utf8')).levels;
const base = process.argv[2] || ('https://saschahoffmannsh-gif.github.io/squish-attack/game/?t=' + Date.now());
console.log('Viewport', IPHONE.width + 'x' + IPHONE.height, base);
let fail = 0; const ok = (n, c, x = '') => { if (!c) fail++; console.log(c ? 'OK  ' : 'FAIL', n, x); };
const browser = await launch();
const RESETS = { 'squish-campaign-tutorial-reset': 'launch-24', 'squish-campaign-curve-stars-reset': 'launch-27', 'squish-campaign-progress-reset': 'launch-14', 'squish-campaign-stars-reset': 'launch-18', 'squish-campaign-tools-reset': 'launch-13' };
const prog = (n, stars = 3, moves = 3) => JSON.stringify({ version: 1, updatedAt: 5, levels: Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), { stars, moves, at: 1 }])) });
async function newPage(storage, locale = 'de') {
  const context = await browser.createBrowserContext();
  const page = await context.newPage(); const errors = [], blocked = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.setRequestInterception(true);
  page.on('request', r => { const u = r.url();
    if (u.includes('/functions/v1/')) { blocked.push(r.method() + ' ' + u.split('?')[0]); return r.abort('failed'); }
    if (u.includes('/rest/v1/') && !['GET', 'OPTIONS', 'HEAD'].includes(r.method())) { blocked.push(r.method() + ' ' + u.split('?')[0]); return r.abort('failed'); }
    r.continue(); });
  await page.setViewport(IPHONE); await page.setUserAgent(IPHONE_UA);
  await page.evaluateOnNewDocument((s, locale) => {
    if (sessionStorage.getItem('lc28')) return; sessionStorage.setItem('lc28', '1');
    Object.defineProperty(navigator, 'language', { get: () => locale === 'de' ? 'de-DE' : 'en-US' });
    Object.defineProperty(navigator, 'languages', { get: () => locale === 'de' ? ['de-DE', 'de'] : ['en-US', 'en'] });
    if (s) for (const [k, v] of Object.entries(s)) { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); }
  }, storage || null, locale);
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForFunction(() => [...document.querySelectorAll('#home-screen button')].some(b => b.dataset.nav === 'adventure') && !window.SquishGame.menu.busy, { timeout: 60000, polling: 200 }); await sleep(600);
  const C = () => page.evaluate(() => window.SquishGame.campaign);
  const idle = () => page.waitForFunction(() => !window.SquishGame.state.busy, { timeout: 30000, polling: 100 });
  const press = l => page.$$eval('#home-screen button, [data-nav]', (bs, l) => { const b = bs.find(b => b.dataset.nav === l); if (!b) throw new Error('kein Knopf ' + l); b.click(); }, l);
  const open = async n => {
    await press('levels'); await page.waitForFunction(() => !document.getElementById('campaign-screen').hidden, { timeout: 20000 }); await sleep(400);
    await page.click(`.campaign-level-btn[data-level="${n}"]`);
    await page.waitForFunction(() => window.SquishGame.campaign.status === 'playing' && window.SquishGame.state.started && !window.SquishGame.state.busy, { timeout: 60000, polling: 100 }); await sleep(1500);
  };
  const play = async sol => { for (const ch of sol) { const k = ch.charCodeAt(0) - 97; await page.evaluate((d, l) => window.SquishGame.move(d, l), ['left', 'right', 'up', 'down'][Math.floor(k / 5)], k % 5); await sleep(300); await idle(); } };
  const topic = () => page.evaluate(() => document.getElementById('explain-dialog')?.dataset.topic || null);
  const closeEx = async () => { await page.click('#explain-ok'); await sleep(500); };
  const waitEx = t => page.waitForFunction(t => document.getElementById('explain-dialog')?.dataset.topic === t, { timeout: 15000, polling: 100 }, t).then(() => true, () => false);
  const overflow = () => page.evaluate(() => { const p = document.querySelector('.ex-panel') || document.querySelector('.aw-result:not([hidden])'); return p ? { sh: p.scrollHeight, ch: p.clientHeight, w: p.getBoundingClientRect().right <= innerWidth + 1 } : null; });
  return { page, context, errors, blocked, C, idle, press, open, play, topic, closeEx, waitEx, overflow };
}

// ---------- 1. Frisches Profil (DE): Build, nur 2 Werkzeuge, Erklärung Level 1, Sieg 3★ ----------
{
  const P = await newPage({ 'squish-lang-v1': 'de' });
  const build = await P.page.evaluate(() => document.getElementById('home-build')?.textContent || '');
  ok('Build launch-28', build.includes('launch-28'), build);
  await P.open(1);
  ok('Level 1: Erklärung „Verschmelzen“', await P.waitEx('merge'));
  const of = await P.overflow(); ok('Erklärung passt (kein Scrollen, nicht breiter als der Schirm)', of && of.sh <= of.ch + 1 && of.w, JSON.stringify(of));
  await P.closeEx();
  const tools = await P.page.evaluate(() => [...document.querySelectorAll('.campaign-tool')].map(b => b.id));
  ok('Nur +3 Züge und Rakete in der Leiste', JSON.stringify(tools) === '["tool-extra","tool-rocket"]', JSON.stringify(tools));
  const hud = await P.page.$eval('#campaign-level', e => e.textContent);
  ok('HUD ohne Test-Titel', !/TEST/i.test(hud), hud);
  await P.play(levels[0].solution);
  await P.page.waitForFunction(() => window.SquishGame.campaign.resultOpen, { timeout: 20000 }); await sleep(1500);
  const c = await P.C();
  ok('Level 1 ohne Hilfe: 3★', c.progress.levels['1']?.stars === 3, JSON.stringify(c.progress.levels['1']));
  ok('Neubewertung-Merker gesetzt', await P.page.evaluate(() => localStorage.getItem('squish-campaign-rules28') === 'launch-28'));
  ok('Keine JS-Fehler (frisch)', P.errors.length === 0, JSON.stringify(P.errors.slice(0, 4)));
  console.log('Blockiert:', JSON.stringify([...new Set(P.blocked)]));
  await P.context.close();
}

// ---------- 2. Tutorial Level 6 (EN): erst Werkzeug, gratis ohne Clip, Ergebnis 2★ mit Erklärung ----------
{
  const P = await newPage({ ...RESETS, 'squish-campaign-v1': prog(5), 'squish-lang-v1': 'en', 'squish-explain-seen-v1': '["merge","merge5","street"]' }, 'en');
  await P.open(6);
  ok('Level 6: Erklärung „Tools & stars“', await P.waitEx('tools'));
  const txt = await P.page.$eval('.ex-panel', e => e.textContent);
  ok('Erklärung nennt 2★ bei einer Hilfe', /at most 2/.test(txt), txt.slice(0, 120));
  await P.closeEx();
  await P.play('a');
  let c = await P.C();
  ok('Zug gesperrt, bis ein Werkzeug probiert ist', c.moves === 0 && c.tutorialTool === true, `moves ${c.moves}`);
  await P.page.click('#tool-rocket'); await sleep(400);
  const pt = await P.page.evaluate(() => window.SquishGame.cellPoint(2, 0)); await P.page.mouse.click(pt.x, pt.y); await sleep(2200); await P.idle();
  c = await P.C();
  ok('Tutorial-Rakete: gratis, kein Clip, zählt als Hilfe', c.toolsUsed.length === 1 && !c.adOpen && !c.adStats?.opens, JSON.stringify({ t: c.toolsUsed, ad: c.adOpen, s: c.adStats }));
  await P.play('ata');
  await P.page.waitForFunction(() => window.SquishGame.campaign.resultOpen, { timeout: 20000 }); await sleep(2500);
  c = await P.C();
  const msg = await P.page.$eval('#campaign-result-message', e => e.textContent);
  ok('Level 6 mit 1 Hilfe: 2★, nächstes Level frei', c.progress.levels['6']?.stars === 2, JSON.stringify(c.progress.levels['6']));
  ok('Ergebnis erklärt den 2★-Deckel', /at most 2/.test(msg), msg);
  const of = await P.overflow(); ok('Ergebnis passt', !of || of.w, JSON.stringify(of));
  ok('Keine JS-Fehler (Tutorial)', P.errors.length === 0, JSON.stringify(P.errors.slice(0, 4)));
  await P.context.close();
}

// ---------- 3. Gold-Geschenk nach Level 3 (DE): Erklärung, goldene Blase, sternneutral ohne Clip ----------
{
  const P = await newPage({ ...RESETS, 'squish-campaign-v1': prog(2), 'squish-lang-v1': 'de', 'squish-explain-seen-v1': '["merge","merge5","street","tools"]' });
  await P.open(3);
  await P.play(levels[2].solution);
  await P.page.waitForFunction(() => window.SquishGame.campaign.resultOpen, { timeout: 20000 }); await sleep(2000);
  let c = await P.C();
  ok('Gold-Geschenk gold-3 wartet', c.inventory.pending.some(g => g.id === 'gold-3' && g.type === 'rocket'), JSON.stringify(c.inventory.pending));
  await P.page.click('#campaign-result-gift');
  ok('Erklärung „Gold-Geschenke“ beim ersten Geschenk', await P.waitEx('gifts'));
  await P.closeEx(); await sleep(900);
  ok('Goldene Blase', await P.page.evaluate(() => !!document.querySelector('.gift-fx.is-gold')));
  await P.page.click('.gfx-bubble').catch(() => {}); await sleep(1800);
  c = await P.C();
  ok('Gold-Rakete im Vorrat', c.gold.rocket === 1 && c.inventory.pending.length === 0, JSON.stringify(c.gold));
  await P.page.click('#campaign-next');
  await P.page.waitForFunction(() => window.SquishGame.campaign.level === 4 && window.SquishGame.campaign.status === 'playing' && !window.SquishGame.state.busy, { timeout: 30000 }); await sleep(1500);
  if (await P.topic()) await P.closeEx();
  ok('Rakete-Knopf golden', await P.page.$eval('#tool-rocket', b => b.classList.contains('is-gold')));
  await P.page.click('#tool-rocket'); await sleep(400);
  const pt = await P.page.evaluate(() => { const b = window.SquishGame.state.board; for (let r = 0; r < 5; r++) for (let q = 0; q < 5; q++) if (b[r][q]) return window.SquishGame.cellPoint(r, q); });
  await P.page.mouse.click(pt.x, pt.y); await sleep(2200); await P.idle();
  c = await P.C();
  ok('Gold-Rakete: kein Clip, keine Hilfe gezählt', c.toolsUsed.length === 0 && c.giftsUsed.length === 1 && !c.adOpen && c.gold.rocket === 0, JSON.stringify({ t: c.toolsUsed, g: c.giftsUsed, ad: c.adOpen }));
  ok('Keine JS-Fehler (Geschenk)', P.errors.length === 0, JSON.stringify(P.errors.slice(0, 4)));
  await P.context.close();
}

// ---------- 4. Normale Hilfe (DE): Erklärung Werbung, Dummy-Clip, +3 beliebig oft, Deckel 2★ → 1★ ----------
{
  const P = await newPage({ ...RESETS, 'squish-campaign-v1': prog(6), 'squish-lang-v1': 'de', 'squish-explain-seen-v1': '["merge","merge5","street","tools"]' });
  await P.open(7);
  await P.page.click('#tool-extra');
  ok('Erste Hilfe: Erklärung „Werbung & Werbefrei“', await P.waitEx('ads'));
  const txt = await P.page.$eval('.ex-panel', e => e.textContent);
  ok('Erklärung nennt 2,99 € und alle 10 Level', /2,99/.test(txt) && /10/.test(txt));
  await P.closeEx();
  await P.page.waitForSelector('#ad-watch', { timeout: 10000 }); await P.page.click('#ad-watch'); await sleep(2500); await P.idle();
  let c = await P.C();
  ok('Nach dem Clip: +3 Züge, 1 Hilfe', c.toolsUsed.length === 1 && c.movesLeft === levels[6].moves + 3, JSON.stringify({ t: c.toolsUsed, left: c.movesLeft }));
  const cap1 = await P.page.$eval('#campaign-tool-cap', e => e.hidden ? '' : e.textContent);
  ok('Hinweis 1 Hilfe: höchstens 2★', /2/.test(cap1), cap1);
  await P.page.click('#tool-extra'); await P.page.waitForSelector('#ad-watch', { timeout: 10000 }); await P.page.click('#ad-watch'); await sleep(2500); await P.idle();
  c = await P.C();
  const cap2 = await P.page.$eval('#campaign-tool-cap', e => e.hidden ? '' : e.textContent);
  ok('Zweite Hilfe möglich (kein 1×-Limit), Deckel 1★', c.toolsUsed.length === 2 && /1/.test(cap2), cap2);
  ok('Keine JS-Fehler (Hilfe)', P.errors.length === 0, JSON.stringify(P.errors.slice(0, 4)));
  await P.context.close();
}

// ---------- 5. Bestand: alter Stand wird neu bewertet, nichts gelöscht, Kapitel bleiben offen ----------
{
  const oldInv = JSON.stringify({ version: 3, extraMoves: 2, rocket: 1, hint: 3, wand: 1, gifts: ['level-3', 'level-6', 'level-10'], pending: [{ id: 'level-20', type: 'rocket' }], at: 99 });
  const P = await newPage({ ...RESETS, 'squish-campaign-v1': prog(30, 2, 40), 'squish-campaign-tools-v1': oldInv, 'squish-lang-v1': 'de' });
  const c = await P.C();
  const lv = c.progress.levels;
  ok('Alle 30 Level-Einträge erhalten', Object.keys(lv).length === 30);
  ok('Sterne nie 0, höchstens alt', Object.values(lv).every(l => l.stars >= 1 && l.stars <= 2));
  ok('Kapitel 2–4 bleiben offen (alte 18★-Regel)', [2, 3, 4].every(k => (c.progress.openChapters || []).includes(k)), JSON.stringify(c.progress.openChapters));
  ok('Alter Vorrat leer, Hinweis/Zauber weg', (c.inventory.hint | 0) === 0 && (c.inventory.wand | 0) === 0, JSON.stringify(c.inventory));
  await P.open(31);
  ok('Level 31 spielbar trotz neuer 65★-Hürde', (await P.C()).level === 31);
  ok('Keine JS-Fehler (Bestand)', P.errors.length === 0, JSON.stringify(P.errors.slice(0, 4)));
  console.log('Blockiert:', JSON.stringify([...new Set(P.blocked)]));
  await P.context.close();
}

// ---------- 6. Regeln-Bildschirm (EN): alle Themen nachlesbar, kein Überlauf ----------
{
  const P = await newPage({ ...RESETS, 'squish-lang-v1': 'en' }, 'en');
  await P.press('rules'); await sleep(1500);
  const topics = await P.page.$$eval('.aw-ex-btn', bs => bs.map(b => b.dataset.topic));
  ok('Regeln: 7 Erklär-Themen', JSON.stringify(topics) === '["merge","merge5","street","tools","gifts","gates","ads"]', JSON.stringify(topics));
  const bad = [];
  for (const t of topics) {
    await P.page.click(`.aw-ex-btn[data-topic="${t}"]`); await sleep(500);
    const of = await P.overflow(); if (!of || of.sh > of.ch + 1 || !of.w) bad.push(t + JSON.stringify(of));
    if (t === 'street') { const s = await P.page.$eval('.ex-panel', e => e.textContent); ok('Straßen-Erklärung: 1-2-3-4 → 5 (+1)', /1-2-3-4 becomes a 5/.test(s)); }
    if (t === 'merge5') { const s = await P.page.$eval('.ex-panel', e => e.textContent); ok('5er-Erklärung: +2', /\+2/.test(s)); }
    await P.closeEx();
  }
  ok('Alle Erklärungen passen', bad.length === 0, bad.join(' '));
  ok('Keine JS-Fehler (Regeln)', P.errors.length === 0, JSON.stringify(P.errors.slice(0, 4)));
  await P.context.close();
}

// ---------- 7. Endlos läuft (keine Abenteuer-Werkzeuge) ----------
{
  const P = await newPage({ ...RESETS, 'squish-campaign-v1': prog(6), 'squish-lang-v1': 'de' });
  await P.press('endless'); await sleep(1500);
  await P.page.$$eval('#home-screen button', bs => bs.find(b => b.dataset.nav === 'new-game' || b.dataset.nav === 'continue')?.click()); await sleep(2000); await P.idle();
  for (let i = 0; i < 6; i++) { await P.page.evaluate(i => window.SquishGame.move(['left', 'up', 'right', 'down'][i % 4], (i * 2) % 5), i); await sleep(250); await P.idle(); }
  const s = await P.page.evaluate(() => ({ moves: window.SquishGame.state.moves, mode: window.SquishGame.campaign.mode }));
  ok('Endlos: Züge gespielt, kein Abenteuer-Modus', s.moves >= 3 && !s.mode, JSON.stringify(s));
  ok('Keine JS-Fehler (Endlos)', P.errors.length === 0, JSON.stringify(P.errors.slice(0, 4)));
  await P.context.close();
}

await browser.close();
console.log(fail ? `FEHLER: ${fail}` : 'ALLES OK');
process.exit(fail ? 1 : 0);

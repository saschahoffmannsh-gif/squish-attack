// Live-Check launch-32 (Backend-Schreibzugriffe blockiert: functions/v1 + REST-Schreiben). node live-check32.mjs [url] [de|en] [WxH]
// Wie flow32 (Sterne aus übrigen Zügen, Rakete zählt als 1 Zug, L6/L7-Lektionen, Ergebnis ÜBRIG, Regeln, Endlos, Neustart launch-30), dazu Build/Cache-Tags launch-32.
// Regeln (7 Themen, keine Endlos/Zauberstab), Endlos spielt. node flow29.mjs <url> <de|en> <WxH> [shots]
import { launch, sleep, IPHONE, IPHONE_UA } from './lib.mjs';
import { readFileSync } from 'node:fs';
const [base0, lang = 'de', vp = '390x844'] = process.argv.slice(2); const shots = '';
const base = base0 || ('https://saschahoffmannsh-gif.github.io/squish-attack/game/?t=' + Date.now());
console.log('Live-Check', lang, vp, base);
const [W, H] = vp.split('x').map(Number);
const OUT = '/workspace/previews/launch32/';
const levels = JSON.parse(readFileSync('/workspace/squish-l30/levels/levels-001-100.json', 'utf8')).levels;
const RESETS = { 'squish-campaign-tutorial-reset': 'launch-30', 'squish-campaign-curve-stars-reset': 'launch-27', 'squish-campaign-progress-reset': 'launch-14', 'squish-campaign-stars-reset': 'launch-18', 'squish-campaign-tools-reset': 'launch-13', 'squish-campaign-rules28': 'launch-28' };
const prog = n => JSON.stringify({ version: 1, updatedAt: 5, levels: Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), { stars: 3, moves: 3, at: 1 }])) });
let fail = 0; const ok = (n, c, x = '') => { if (!c) fail++; console.log(c ? 'OK  ' : 'FAIL', n, x); };
const browser = await launch();
async function newPage(storage) {
  const ctx = await browser.createBrowserContext(); const page = await ctx.newPage(); const errors = [], blocked = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.setRequestInterception(true);
  page.on('request', r => { const u = r.url(); if (u.includes('/functions/v1/') || (u.includes('/rest/v1/') && !['GET', 'OPTIONS', 'HEAD'].includes(r.method()))) { blocked.push(r.method()); return r.abort('failed'); } r.continue(); });
  await page.setViewport({ ...IPHONE, width: W, height: H }); await page.setUserAgent(IPHONE_UA);
  await page.evaluateOnNewDocument((s, lang) => { if (sessionStorage.getItem('f29')) return; sessionStorage.setItem('f29', '1');
    Object.defineProperty(navigator, 'language', { get: () => lang === 'de' ? 'de-DE' : 'en-US' });
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, { ...RESETS, 'squish-lang-v1': lang, ...storage }, lang);
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForFunction(() => [...document.querySelectorAll('#home-screen button')].some(b => b.dataset.nav === 'adventure') && !window.SquishGame.menu.busy, { timeout: 60000, polling: 200 }); await sleep(600);
  const C = () => page.evaluate(() => window.SquishGame.campaign);
  const idle = () => page.waitForFunction(() => !window.SquishGame.state.busy, { timeout: 30000, polling: 100 });
  const press = l => page.$$eval('#home-screen button, [data-nav]', (bs, l) => bs.find(b => b.dataset.nav === l).click(), l);
  const topic = () => page.evaluate(() => document.getElementById('explain-dialog')?.dataset.topic || null);
  const waitEx = t => page.waitForFunction(t => document.getElementById('explain-dialog')?.dataset.topic === t, { timeout: 15000, polling: 100 }, t).then(() => true, () => false);
  const say = () => page.evaluate(() => document.querySelector('.ex-say')?.firstChild?.textContent || '');
  const fit = () => page.evaluate(() => { const p = document.querySelector('.ex-panel'); return p.scrollHeight <= p.clientHeight + 1; });
  const freeze = frac => page.evaluate(frac => { for (const a of document.getAnimations()) { const tg = a.effect?.target, tm = a.effect?.getTiming?.();
    if (tg?.closest?.('.ex-stage')) { a.pause(); a.currentTime = (Number(tm.delay) || 0) + frac * (Number(tm.duration) || 0); } else if (tm && tm.iterations !== Infinity) a.finish(); } }, frac);
  const open = async n => { await press('levels'); await page.waitForFunction(() => !document.getElementById('campaign-screen').hidden, { timeout: 20000 }); await sleep(400);
    await page.click(`.campaign-level-btn[data-level="${n}"]`);
    await page.waitForFunction(() => window.SquishGame.campaign.status === 'playing' && window.SquishGame.state.started && !window.SquishGame.state.busy, { timeout: 60000, polling: 100 }); await sleep(1500); };
  const play = async sol => { for (const ch of sol) { const k = ch.charCodeAt(0) - 97; await page.evaluate((d, l) => window.SquishGame.move(d, l), ['left', 'right', 'up', 'down'][Math.floor(k / 5)], k % 5); await sleep(300); await idle(); } };
  return { ctx, page, errors, blocked, C, idle, press, topic, waitEx, say, fit, freeze, open, play };
}
{ const P = await newPage({});
  const build = await P.page.evaluate(() => document.getElementById('home-build')?.textContent || '');
  ok('Build launch-32', build.includes('launch-32'), build);
  const v = await P.page.evaluate(() => [...document.querySelectorAll('script[src],link[href]')].map(e => e.src || e.href).filter(u => /[?]v=launch-/.test(u) && !/v=launch-32/.test(u)));
  ok('Cache-Tags alle launch-32', v.length === 0, v.slice(0, 3).join(' '));
  const price = await P.page.evaluate(() => /4,99\s*€|€\s*4\.99/.test(document.body.textContent + document.body.innerHTML) && !/2,99\s*(€|&nbsp;€)|€\s*2\.99/.test(document.body.innerHTML));
  ok('Werbefrei-Preis 4,99 € / €4.99 im Spiel, kein 2,99', price);
  ok('Keine JS-Fehler (Start)', P.errors.length === 0, JSON.stringify(P.errors.slice(0, 3)));
  await P.ctx.close(); }
const SEEN = JSON.stringify(['merge', 'merge5', 'street', 'gates']);
const goldInv = JSON.stringify({ version: 3, extraMoves: 0, rocket: 1, hint: 0, wand: 0, gifts: ['gold-3'], pending: [], at: 1 });
// ---------- 1. Tutorial L6 mit Gold im Vorrat ----------
{
  const P = await newPage({ 'squish-campaign-v1': prog(5), 'squish-explain-seen-v1': SEEN, 'squish-campaign-tools-v1': goldInv });
  await P.open(6);
  ok('L6: kein Erklär-Fenster vor dem Einsatz', !(await P.topic()));
  let c = await P.C();
  ok('L6: Rakete-Knopf nicht golden (Gold gesperrt im Tutorial)', !(await P.page.$eval('#tool-rocket', b => b.classList.contains('is-gold'))) && c.tutorialTool);
  await P.page.click('#tool-rocket'); await sleep(400);
  const pt = await P.page.evaluate(() => window.SquishGame.cellPoint(2, 0)); await P.page.mouse.click(pt.x, pt.y);
  ok('L6: nach der Rakete Bild-Lektion „Hilfe ist okay, Sterne bleiben“', await P.waitEx('tools'));
  const s1 = await P.say(); ok('L6: Zeile', lang === 'de' ? /Die Sterne bleiben/.test(s1) : /stars stay/.test(s1), s1);
  ok('L6: passt', await P.fit());
  ok('L6: Szene mit Rakete, 3 bleibenden Sternen und Zug-Pille, kein Stern fällt', await P.page.evaluate(() => document.querySelectorAll('.sx-help-free .sx-keep').length === 3 && !document.querySelector('.sx-lose') && !!document.querySelector('.sx-help-free .sx-moves') && document.querySelectorAll('.sx-help-free .sx-help').length === 1 && !document.querySelector('.sx-help-free .ex-tile')));
  if (shots) { await sleep(300); await P.freeze(.4); await sleep(150); await P.page.screenshot({ path: OUT + '01-l6-hilfe-ok-sterne-bleiben-' + lang + '.png' }); }
  await P.page.click('#explain-ok'); await sleep(600); await P.idle();
  c = await P.C();
  ok('L6: Gold nicht verbraucht, 1 Hilfe gezählt, kein Clip', c.gold.rocket === 1 && c.toolsUsed.length === 1 && !c.giftsUsed.length && !c.adStats?.opens, JSON.stringify({ g: c.gold, t: c.toolsUsed, ad: c.adStats }));
  await P.play('ata');
  await P.page.waitForFunction(() => window.SquishGame.campaign.resultOpen, { timeout: 20000 }); await sleep(2500);
  c = await P.C(); ok('L6: 3★ trotz Rakete (3 Züge + 1 Rakete, 3★ ab 2 übrig)', c.progress.levels['6']?.stars === 3, JSON.stringify(c.progress.levels['6']));
  const res = await P.page.evaluate(() => ({ left: document.getElementById('campaign-result-moves').textContent, label: document.querySelector('#campaign-result-stats [data-i18n]').textContent,
    msg: document.getElementById('campaign-result-message').textContent, stars: document.getElementById('campaign-result-stars').dataset.stars }));
  ok('Ergebnis: ÜBRIG 2 (6 − 3 Züge − 1 Rakete) statt Züge', res.left === '2' && (lang === 'de' ? res.label === 'ÜBRIG' : res.label === 'LEFT'), JSON.stringify(res));
  ok('Ergebnis: Tutorial-Satz „Hilfe ist okay“', lang === 'de' ? /Hilfe ist okay/.test(res.msg) : /Helping is fine/.test(res.msg), res.msg);
  if (shots) await P.page.screenshot({ path: OUT + '03-ergebnis-sterne-uebrig-' + lang + '.png' });
  // ---------- 2. L7: Gold-Rakete → „Hilfe gratis, ohne Werbung“ ----------
  await P.page.click('#campaign-next');
  await P.page.waitForFunction(() => window.SquishGame.campaign.level === 7 && window.SquishGame.campaign.status === 'playing' && !window.SquishGame.state.busy, { timeout: 30000 }); await sleep(1500);
  if (await P.topic()) { await P.page.click('#explain-ok'); await sleep(500); }
  ok('L7: Rakete-Knopf golden', await P.page.$eval('#tool-rocket', b => b.classList.contains('is-gold')));
  await P.page.click('#tool-rocket'); await sleep(400);
  const pt2 = await P.page.evaluate(() => { const b = window.SquishGame.state.board; for (let r = 4; r >= 0; r--) for (let q = 0; q < 5; q++) if (b[r][q] && !b[r][q].bound) return window.SquishGame.cellPoint(r, q); });
  await P.page.mouse.click(pt2.x, pt2.y);
  ok('L7: Gold-Lektion „gratis, ohne Werbung“', await P.waitEx('gifts'));
  const s2 = await P.say(); ok('L7: Zeile', lang === 'de' ? /ohne Werbung/.test(s2) : /no ad/.test(s2), s2);
  ok('L7: Szene Gold-Hilfe → Werbung durchgestrichen + GRATIS', await P.page.evaluate(() => !!document.querySelector('.sx-help-gold .sx-help.is-gold') && !!document.querySelector('.sx-help-gold .sx-tv.is-noad .sx-noad-slash') && !!document.querySelector('.sx-help-gold .sx-free-stamp') && !document.querySelector('.sx-lose')));
  ok('L7: passt', await P.fit());
  if (shots) { await sleep(300); await P.freeze(.8); await sleep(150); await P.page.screenshot({ path: OUT + '02-l7-gold-ohne-werbung-' + lang + '.png' }); }
  await P.page.click('#explain-ok'); await sleep(600); await P.idle();
  c = await P.C(); ok('L7: Gold verbraucht, keine Hilfe gezählt', c.gold.rocket === 0 && !c.toolsUsed.length && c.giftsUsed.length === 1, JSON.stringify({ g: c.gold, t: c.toolsUsed, gu: c.giftsUsed }));
  ok('Keine JS-Fehler (Tutorial/Gold)', P.errors.length === 0, JSON.stringify(P.errors.slice(0, 3)));
  await P.ctx.close();
}
// ---------- 3. Neuer Spieler: Gold aus L3, Hilfe in L4 → erst Stern-Lektion, Gold bleibt ----------
{
  const P = await newPage({ 'squish-campaign-v1': prog(3), 'squish-explain-seen-v1': JSON.stringify(['merge', 'merge5', 'street', 'gates', 'ads']), 'squish-campaign-tools-v1': goldInv });
  await P.open(4);
  if (await P.topic()) { await P.page.click('#explain-ok'); await sleep(500); }
  ok('L4: Gold noch gesperrt (vor der Stern-Lektion)', !(await P.page.$eval('#tool-rocket', b => b.classList.contains('is-gold'))));
  await P.page.click('#tool-rocket'); await sleep(400);
  if (await P.page.$('#ad-watch')) { await P.page.click('#ad-watch'); }
  await sleep(600);
  const pt = await P.page.evaluate(() => { const b = window.SquishGame.state.board; for (let r = 4; r >= 0; r--) for (let q = 0; q < 5; q++) if (b[r][q] && !b[r][q].bound) return window.SquishGame.cellPoint(r, q); });
  if (!(await P.topic())) await P.page.mouse.click(pt.x, pt.y);
  await sleep(500); if (await P.page.$('#ad-watch')) { await P.page.click('#ad-watch'); await sleep(2500); }
  ok('L4: erste normale Hilfe → Lektion „Hilfe ist okay“', await P.waitEx('tools'), String(await P.topic()));
  await P.page.click('#explain-ok').catch(() => {}); await sleep(600);
  const c = await P.C(); ok('L4: Gold bleibt im Vorrat', c.gold.rocket === 1 && c.toolsUsed.length === 1, JSON.stringify({ g: c.gold, t: c.toolsUsed }));
  const meter = await P.page.evaluate(() => document.querySelector('.campaign-starmeter')?.dataset.stars);
  ok('L4: Sterne-Leiste im HUD zeigt nach der Hilfe weiter 3★', meter === '3', String(meter));
  if (shots) await P.page.screenshot({ path: OUT + '05-hud-sterne-leiste-' + lang + '.png' });
  ok('Keine JS-Fehler (L4)', P.errors.length === 0, JSON.stringify(P.errors.slice(0, 3)));
  await P.ctx.close();
}
// ---------- 4. Regeln: 7 Themen, keine Endlos-/Zauberstab-Texte; Hilfen-&-Sterne-Szene ----------
{
  const P = await newPage({ 'squish-campaign-v1': prog(12), 'squish-explain-seen-v1': SEEN });
  await P.press('rules'); await sleep(1500);
  const topics = await P.page.$$eval('.aw-ex-btn', bs => bs.map(b => b.dataset.topic));
  ok('Regeln: 7 Themen ohne Endlos', JSON.stringify(topics) === '["merge","merge5","street","tools","gifts","gates","ads"]', JSON.stringify(topics));
  const body = await P.page.evaluate(() => document.body.innerText);
  { const m = body.match(/.{0,40}(Zauberstab|\bthe wand\b|Hinweis-|Endlos-Werkzeug|Endless tool|Zauber\b|\bWand\b(?=s? (do|does|work|turns))|\bHints?\b).{0,40}/); ok('Regeln: kein Zauberstab/Hinweis/Endlos-Werkzeug', !m, m?.[0]); }
  const bad = [];
  for (const t of topics) { await P.page.click(`.aw-ex-btn[data-topic="${t}"]`); await sleep(500);
    const txt = await P.page.$eval('.ex-panel', e => e.textContent);
    if (!(await P.fit()) || /Zauberstab|Wand|Hinweis|Endlos-Werkzeug/.test(txt)) bad.push(t);
    if (t === 'tools' && shots) { await P.freeze(.4); await sleep(150); await P.page.screenshot({ path: OUT + '06-regeln-hilfen-sterne-' + lang + '.png' }); }
    if (t === 'tools') ok('Regeln: Hilfen & Sterne (2 Hilfe-Knöpfe, Pfeil, 3 bleibende Sterne, Zug-Pille, kein Brett)', await P.page.evaluate(() => document.querySelectorAll('.sx-help').length === 2 && !!document.querySelector('.sx-help-arrow') && document.querySelectorAll('.sx-keep').length === 3 && !document.querySelector('.sx-lose') && !!document.querySelector('.sx-moves') && !document.querySelector('.ex-stage .ex-tile')));
    if (t === 'ads') { const tx = await P.page.$eval('.ex-panel', e => e.textContent); ok('Regeln: Werbefrei 4,99 €, keine Sterne-Deckel', /4[,.]99/.test(tx) && !/2[,.]99|deckel|cap your stars/i.test(tx), tx.slice(0, 120)); }
    await P.page.click('#explain-ok'); await sleep(400); }
  ok('Regeln: alle passen, keine Altbegriffe', !bad.length, bad.join(','));
  ok('Keine JS-Fehler (Regeln)', P.errors.length === 0, JSON.stringify(P.errors.slice(0, 3)));
  await P.ctx.close();
}
// ---------- 5. Endlos spielt weiter (Stand, Punkte), keine Werkzeug-Leiste ----------
{
  const P = await newPage({ 'squish-campaign-v1': prog(6), 'squish-explain-seen-v1': SEEN, 'squish-endless-tools-v1': JSON.stringify({ rocket: 2, wand: 1, at: 1 }) });
  await P.page.$$eval('#home-screen button', bs => bs.find(b => b.dataset.nav === 'endless' || /Endlos|Endless/.test(b.dataset.label || '')).click()); await sleep(900);
  await P.page.$$eval('#home-screen button', bs => (bs.find(b => /Neues Spiel|New game/i.test(b.dataset.label || b.textContent)) || {}).click?.()); 
  await P.page.waitForFunction(() => window.SquishGame.state.started && !window.SquishGame.state.busy && !window.SquishGame.campaign?.active, { timeout: 30000, polling: 100 }).catch(() => {});
  await sleep(800);
  const m0 = await P.page.evaluate(() => window.SquishGame.state.moves);
  for (const [d, l] of [['left', 0], ['right', 1], ['up', 2], ['down', 3], ['left', 4]]) { await P.page.evaluate((d, l) => window.SquishGame.move(d, l), d, l); await sleep(300); await P.idle(); }
  const s = await P.page.evaluate(() => ({ moves: window.SquishGame.state.moves, started: window.SquishGame.state.started, bar: !!document.getElementById('endless-tools') && !document.getElementById('endless-tools').hidden }));
  ok('Endlos: Züge laufen, keine Werkzeug-Leiste', s.started && s.moves >= m0 + 4 && !s.bar, JSON.stringify(s));
  await P.page.reload({ waitUntil: 'load' }); await sleep(4000);
  const saved = await P.page.evaluate(() => JSON.parse(localStorage.getItem('shift3-play-v1') || 'null'));
  ok('Endlos: Stand gespeichert', saved && saved.moves >= m0 + 4, String(saved?.moves));
  ok('Keine JS-Fehler (Endlos)', P.errors.length === 0, JSON.stringify(P.errors.slice(0, 3)));
  await P.ctx.close();
}
// ---------- 6. Neustart launch-30: alter Spieler (Merker launch-24, 40 Level, Kapitel offen, alle Fenster gesehen) ----------
{
  const A = await newPage({ 'squish-campaign-v1': prog(6), 'squish-explain-seen-v1': SEEN });
  await A.page.$$eval('#home-screen button', bs => bs.find(b => b.dataset.nav === 'endless').click()); await sleep(900);
  await A.page.$$eval('#home-screen button', bs => (bs.find(b => /Neues Spiel|New game/i.test(b.dataset.label || b.textContent)) || {}).click?.());
  await A.page.waitForFunction(() => window.SquishGame.state.started && !window.SquishGame.state.busy, { timeout: 30000, polling: 100 }).catch(() => {}); await sleep(800);
  for (const [d, l] of [['left', 0], ['right', 1], ['up', 2]]) { await A.page.evaluate((d, l) => window.SquishGame.move(d, l), d, l); await sleep(300); await A.idle(); }
  await A.page.evaluate(() => window.SquishGame.saveNow?.()); await sleep(300);
  const endlessSave = await A.page.evaluate(() => localStorage.getItem('shift3-play-v1')); await A.ctx.close();
  const old = JSON.parse(prog(40)); old.openChapters = [2, 3, 4];
  const P = await newPage({ 'squish-campaign-tutorial-reset': 'launch-24', 'squish-campaign-v1': JSON.stringify(old), 'shift3-play-v1': endlessSave || '',
    'squish-explain-seen-v1': JSON.stringify(['merge', 'merge5', 'street', 'tools', 'gifts', 'gates', 'ads', 'tool-cost', 'gold-used']),
    'squish-campaign-tools-v1': JSON.stringify({ version: 3, extraMoves: 1, rocket: 1, hint: 0, wand: 0, gifts: ['gold-3', 'gold-10', 'gold-20', 'gold-30'], pending: [], at: 1 }) });
  const st = await P.page.evaluate(() => ({ marker: localStorage.getItem('squish-campaign-tutorial-reset'), seen: localStorage.getItem('squish-explain-seen-v1'),
    lang: localStorage.getItem('squish-lang-v1'), endless: localStorage.getItem('shift3-play-v1'), c: window.SquishGame.campaign,
    endlessDim: document.querySelector('#home-screen [data-nav="endless"]')?.classList.contains('is-dim') || document.querySelector('#home-screen [data-nav="endless"]')?.getAttribute('aria-disabled') === 'true' }));
  ok('Neustart: Merker launch-30, Abenteuer leer, keine Kapitel offen', st.marker === 'launch-30' && Object.keys(st.c.progress.levels).length === 0 && !(st.c.progress.openChapters || []).length, JSON.stringify({ m: st.marker, n: Object.keys(st.c.progress.levels).length, oc: st.c.progress.openChapters }));
  ok('Neustart: Gold-Geschenke und Vorrat leer', !(st.c.inventory.gifts || []).length && st.c.gold.rocket === 0 && st.c.gold.extraMoves === 0, JSON.stringify({ g: st.c.inventory.gifts, gold: st.c.gold }));
  ok('Neustart: Tutorials vergessen', !st.seen || !JSON.parse(st.seen).includes('merge'), st.seen);
  ok('Neustart: Sprache bleibt', st.lang === lang, st.lang);
  ok('Neustart: Endlos-Spielstand bleibt', !!endlessSave && st.endless === endlessSave, String(endlessSave && st.endless && JSON.parse(st.endless).moves));
  ok('Neustart: Endlos wieder erst nach Level 5 (gesperrt)', st.endlessDim === true, String(st.endlessDim));
  await P.press('levels'); await P.page.waitForFunction(() => !document.getElementById('campaign-screen').hidden, { timeout: 20000 }); await sleep(500);
  const grid = await P.page.evaluate(() => ({ free: [...document.querySelectorAll('.campaign-level-btn:not(.is-locked)')].map(b => +b.dataset.level), gate2: document.querySelectorAll('.campaign-chapter h3 small')[0]?.textContent || '' }));
  ok('Neustart: nur Level 1 frei', JSON.stringify(grid.free) === '[1]', JSON.stringify(grid.free));
  ok('Kapitel 2 braucht 24 ★', /\b24\b/.test(grid.gate2), grid.gate2);
  await P.page.click('.campaign-level-btn[data-level="1"]');
  ok('Neustart: L1 startet mit dem Verschmelz-Tutorial', await P.waitEx('merge'), String(await P.topic()));
  ok('Keine JS-Fehler (Neustart)', P.errors.length === 0, JSON.stringify(P.errors.slice(0, 3)));
  await P.ctx.close();
}
console.log(fail ? `\n${fail} FEHLER` : '\nALLES OK');
await browser.close(); process.exit(fail ? 1 : 0);

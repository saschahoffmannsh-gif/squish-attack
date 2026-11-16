// Live-Check launch-26: Abenteuer-Hilfsmittel 1× je Versuch, Sterne-Deckel,
// Werbeclip vor dem Einsatz, keine Testseite, keine Geschenke, Kapitel-Schranke 18★.
// Plus Regression launch-22..24 (Tutorials, Geisterfinger, Overflow, Reset Epoche 24,
// Sprache, 0 fps, reduzierte Bewegung). Backend-Schreibzugriffe blockiert; Duell mit Attrappe.
// Kein api-check. Fortschritts-Epoche bleibt launch-24 (kein neuer Reset).
import { launch, sleep, IPHONE as IPHONE0, IPHONE_UA } from './lib.mjs';
const VP = (process.env.VP || '390x844').split('x').map(Number);
const IPHONE = { ...IPHONE0, width: VP[0], height: VP[1] };
console.log('Viewport', IPHONE.width + 'x' + IPHONE.height);
import { readFileSync } from 'node:fs';
import * as Camp from '/workspace/squish-l26/game/campaign.mjs';
const ROOT = '/workspace/squish-l26';
const levels = JSON.parse(readFileSync(ROOT + '/levels/levels-001-100.json', 'utf8')).levels;
const base = process.argv[2] || ('https://saschahoffmannsh-gif.github.io/squish-attack/game/?t=' + Date.now());
let fail = 0; const ok = (n, c, x = '') => { if (!c) fail++; console.log(c ? 'OK  ' : 'FAIL', n, x); };
const browser = await launch();
const contexts = [];
async function newPage(reduced, storage, locale = 'de') {
  const context = await browser.createBrowserContext();
  contexts.push(context);
  const page = await context.newPage(); const errors = [], blocked = [], duel = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.setRequestInterception(true);
  page.on('request', r => { const u = r.url();
    if (/functions\/v1\/squish\/duel/.test(u)) { if (r.method() === 'OPTIONS') return r.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } });
      duel.push(JSON.parse(r.postData() || '{}').action); return r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ room: '482915', status: 'waiting', serverNow: Date.now(), you: 1 }) }); }
    if (u.includes('/functions/v1/')) { blocked.push(r.method() + ' ' + u.split('?')[0]); return r.abort('failed'); }
    if (u.includes('/rest/v1/') && !['GET', 'OPTIONS', 'HEAD'].includes(r.method())) { blocked.push(r.method() + ' ' + u.split('?')[0]); return r.abort('failed'); }
    r.continue(); });
  await page.setViewport(IPHONE); await page.setUserAgent(IPHONE_UA);
  if (reduced) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.evaluateOnNewDocument((s, locale) => {
    const tag = locale === 'de' ? 'de-DE' : 'en-US';
    Object.defineProperty(navigator, 'language', { get: () => tag });
    Object.defineProperty(navigator, 'languages', { get: () => locale === 'de' ? ['de-DE', 'de'] : ['en-US', 'en'] });
    if (s) for (const [k, v] of Object.entries(s)) { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); }
  }, storage || null, locale);
  await page.goto(base, { waitUntil: 'load' });
  return { page, context, errors, blocked, duel };
}
const H = page => ({
  waitBtn: (l, t = 60000) => page.waitForFunction(l => [...document.querySelectorAll('#home-screen button')].some(b => b.dataset.nav === l || b.dataset.label === l || (b.dataset.label||'').startsWith(l)) && !window.SquishGame.menu.busy, { timeout: t, polling: 200 }, l).then(() => sleep(400)),
  press: l => page.$$eval('#home-screen button, [data-nav]', (bs, l) => { const b = bs.find(b => b.dataset.nav === l || b.dataset.label === l || (b.dataset.label||'').startsWith(l)); if (!b) throw new Error('kein Knopf ' + l); b.click(); }, l),
  idle: () => page.waitForFunction(() => { const s = window.SquishGame?.state; return s && s.started && !s.busy && !s.booting && !window.SquishGame.graphics.scene?.userData?.entryAnimation; }, { timeout: 90000, polling: 100 }),
  state: () => page.evaluate(() => ({ ...window.SquishGame.state, campaign: window.SquishGame.campaign })),
  rate: (ms = 3000) => page.evaluate(async ms => { const g = window.SquishGame.graphics; let n = 0; const orig = g.render; g.render = (...a) => { n++; return orig.apply(g, a); };
    await new Promise(r => setTimeout(r, ms)); g.render = orig; return +(n / (ms / 1000)).toFixed(1); }, ms),
  goHome: async () => {
    await page.evaluate(() => window.SquishGame.menu.open?.({ screen: 'home' })).catch(() => {});
    await sleep(600);
    if (!(await page.$$eval('#home-screen button', bs => bs.some(b => b.dataset.nav === 'endless' || b.dataset.nav === 'adventure' || b.dataset.label === 'Endlos' || b.dataset.label === 'Abenteuer' || b.dataset.label === 'Endless' || b.dataset.label === 'Adventure')))) {
      await page.$$eval('#home-screen button', bs => bs.find(b => b.dataset.nav === 'back' || b.dataset.label === 'Zurück' || b.dataset.label === 'Back')?.click()); await sleep(500);
    }
  },
  locks: () => page.evaluate(() => {
    const find = l => [...document.querySelectorAll('#home-screen button')].find(b => b.dataset.nav === l || b.dataset.label === l);
    const info = b => b ? { locked: b.classList.contains('is-locked'), lock: !!b.querySelector('.aw-lock'), dim: b.classList.contains('is-dim'), label: b.dataset.label } : null;
    return { endlos: info(find('endless')||find('Endlos')||find('Endless')), duo: info(find('duel')||find('2 Spieler')||find('2 Players')) };
  }),
  finger: () => page.evaluate(() => {
    const el = document.querySelector('.ghost-hint');
    if (!el || el.hidden) return { visible: false };
    const hand = el.querySelector('.ghost-hand');
    const lane = el.querySelector('.ghost-lane');
    const arrow = el.querySelector('.ghost-arrow');
    const st = hand ? getComputedStyle(hand) : getComputedStyle(el);
    const dx = parseFloat(el.style.getPropertyValue('--dx')) || 0;
    const dy = parseFloat(el.style.getPropertyValue('--dy')) || 0;
    const arrowOn = !!(arrow && getComputedStyle(arrow).display !== 'none' && arrow.getClientRects().length);
    return {
      visible: true,
      static: el.classList.contains('is-static'),
      on: el.classList.contains('is-on'),
      opacity: parseFloat(st.opacity),
      anim: st.animationName,
      travel: Math.hypot(dx, dy),
      hasLane: !!(lane && lane.getClientRects().length),
      hasArrow: arrowOn,
      trail: el.querySelectorAll('.ghost-trail').length,
    };
  }),
  waitFinger: (t = 5000) => page.waitForFunction(() => { const el = document.querySelector('.ghost-hint'); return el && !el.hidden && el.classList.contains('is-on'); }, { timeout: t, polling: 100 }),
  waitZero: async (tries = 3) => { let r = -1; for (let i = 0; i < tries; i++) { await sleep(400); r = await page.evaluate(async ms => { const g = window.SquishGame.graphics; let n = 0; const orig = g.render; g.render = (...a) => { n++; return orig.apply(g, a); }; await new Promise(r => setTimeout(r, ms)); g.render = orig; return +(n / (ms / 1000)).toFixed(1); }, 2500); if (r === 0) return r; } return r; },
});

const EMPTY_INV = { version: 3, extraMoves: 0, rocket: 0, hint: 0, wand: 0, gifts: [], pending: [] };
const ENDLESS_SAVE = { version: 1, board: [[1,2,null,3,null],[null,null,null,null,1],[3,null,null,4,null],[null,2,null,null,null],[null,null,null,null,null]], queue: [1, 2, 1], score: 990, best: 990, bestTile: 4, moves: 33, nextId: 20 };

// ---------- frisches Profil ----------
{
  const { page, errors, blocked, duel } = await newPage(false); const h = H(page);
  await h.waitBtn('endless');
  ok('Build launch-26 (Einstellungen + Sound-Build)', /launch-26/.test(await page.evaluate(() => document.getElementById('settings-build')?.textContent || '')) && await page.evaluate(() => window.SquishGame.sound.build) === 'launch-26');
  const resList = await page.evaluate(() => performance.getEntriesByType('resource').map(r => r.name));
  const changed = (await import('node:child_process')).execSync('git -C /workspace/squish-l26 diff --name-only f9d0b53 HEAD -- game').toString().trim().split('\n').filter(f => /\.(mjs|js|css|json|html)$/.test(f));
  const loaded = changed.map(f => ({ f, urls: resList.filter(u => { try { return new URL(u).pathname.endsWith('/' + f); } catch { return false; } }) })).filter(x => x.urls.length);
  const stale = loaded.filter(x => !x.urls.every(u => /build\.txt/.test(u) || /[?&]v=launch-26/.test(u))).map(x => x.urls[0]);
  ok(`Geänderte Dateien mit ?v=launch-26 geladen (${loaded.length} von ${changed.length} geändert beim Start geladen)`, loaded.length >= 4 && stale.length === 0, JSON.stringify({ loaded: loaded.map(x => x.f), stale: stale.slice(0, 6) }));
  ok('levels-001-100.json mit ?v=launch-26 geladen', resList.some(u => /levels-001-100.json\?v=launch-26/.test(u)));
  await sleep(1200);
  ok('Menü in Ruhe: 0 Renders/s (3D pausiert)', (await h.rate()) === 0);

  const lk = await h.locks();
  ok('Frisches Profil: Endlos und 2 Spieler gesperrt (Schloss, gedimmt)', lk.endlos?.locked && lk.endlos?.lock && lk.duo?.locked && lk.duo?.lock, JSON.stringify(lk));
  await h.press('endless'); await sleep(500);
  const hint = await page.evaluate(() => document.getElementById('home-status')?.textContent || '');
  const wobble = await page.$eval('#home-endless', b => b.classList.contains('aw-wobble')).catch(() => false);
  const stayedHome = await page.evaluate(() => { const home = document.getElementById('home-screen'); return !!(home && !home.hidden && (home.dataset.screen === 'home' || [...home.querySelectorAll('button')].some(b => b.dataset.nav === 'adventure'))); });
  ok('Tippen auf Endlos: Hinweis und Wackeln, bleibt im Startmenü', /Schalte frei: Abenteuer Level 1–5/.test(hint) && wobble && stayedHome, hint + ' wobble=' + wobble + ' home=' + stayedHome);
  ok('Endlos-Menü öffnet sich nicht', await page.evaluate(() => document.getElementById('home-screen')?.dataset.screen === 'home' || [...document.querySelectorAll('#home-screen button')].some(b => b.dataset.nav === 'adventure')));
  await h.press('duel'); await sleep(500);
  ok('Tippen auf 2 Spieler: Duell öffnet nicht', await page.evaluate(() => { const d = document.getElementById('duel-screen'); return !d || d.hidden; }));
  ok('Hinweis nach 2 Spieler', /Schalte frei: Abenteuer Level 1–5/.test(await page.evaluate(() => document.getElementById('home-status')?.textContent || '')));

  // Tutorials L1–5
  await h.press('adventure'); await h.waitBtn('play-level');
  await h.press('play-level'); await h.idle();
  const advSpecials = await page.evaluate(() => window.SquishGame.campaign.specials);
  ok('Abenteuer L1: keine Sonder-Squishes', (advSpecials || []).length === 0 && !(await page.evaluate(() => window.SquishGame.campaign.lab)), JSON.stringify(advSpecials));
  await h.waitFinger().catch(() => {});
  const tip1 = await page.$eval('#campaign-tip', e => ({ hidden: e.hidden, text: e.textContent }));
  ok('L1: Tutorial-Tipp sichtbar', !tip1.hidden && /Drei gleiche/.test(tip1.text), JSON.stringify(tip1));
  const f1 = await h.finger();
  ok('L1: Geisterfinger sichtbar und animiert (CSS)', f1.visible && f1.on && f1.anim && f1.anim !== 'none', JSON.stringify(f1));
  ok('L1: Finger wischt die ganze Reihe (Spur + Hervorhebung)', f1.travel > 140 && f1.hasLane && f1.trail >= 3, JSON.stringify(f1));
  const fingerRate = await h.waitZero();
  ok('L1 in Ruhe: 0 Renders/s obwohl der Finger per CSS läuft', fingerRate === 0, String(fingerRate));
  for (const ch of levels[0].solution) { const m = Camp.decodeMove(ch); await page.evaluate(m => window.SquishGame.move(m.direction, m.line), m); await sleep(200); }
  await page.waitForFunction(() => window.SquishGame.campaign.resultOpen, { timeout: 20000 }); await sleep(1800);
  ok('L1 gewonnen, 3 Sterne', await page.evaluate(() => /geschafft|Perfekt/.test(document.getElementById('campaign-result-title')?.textContent || '') && document.querySelectorAll('#campaign-result-stars .is-earned').length === 3));
  const resOverflow = await page.evaluate(overflowHits);
  ok('Ergebnis-Dialog L1: keine beschnittenen Knöpfe', resOverflow.length === 0, JSON.stringify(resOverflow));
  ok('L1: Finger nach dem Zug weg', !(await h.finger()).visible);

  for (const n of [2, 3, 4, 5]) {
    await page.click('#campaign-next');
    await page.waitForFunction(() => !window.SquishGame.campaign.resultOpen && window.SquishGame.campaign.status === 'playing', { timeout: 20000 });
    await h.idle(); await sleep(800);
    const lv = levels[n - 1];
    const tip = await page.$eval('#campaign-tip', e => e.hidden ? '' : e.textContent);
    ok(`L${n}: Tipp sichtbar`, tip.length > 10, tip);
    const f = await h.finger();
    ok(`L${n}: Geisterfinger sichtbar, ganze Linie`, f.visible && f.travel > 140 && f.hasLane, JSON.stringify(f));
    const dir = Camp.decodeMove(lv.solution)?.direction;
    if (n === 2 || n === 3 || n === 5) ok(`L${n}: Einschub von oben oder unten (${dir})`, dir === 'up' || dir === 'down', dir);
    for (const ch of lv.solution) { const m = Camp.decodeMove(ch); await page.evaluate(m => window.SquishGame.move(m.direction, m.line), m); await sleep(200); }
    await page.waitForFunction(() => window.SquishGame.campaign.resultOpen, { timeout: 20000 }); await sleep(1800);
    const res = await page.evaluate(() => ({ title: document.getElementById('campaign-result-title')?.textContent, stars: document.querySelectorAll('#campaign-result-stars .is-earned').length, msg: document.getElementById('campaign-result-message')?.textContent }));
    ok(`L${n} gewonnen, 3 Sterne`, /geschafft|Perfekt/.test(res.title) && res.stars === 3, JSON.stringify(res));
    if (n === 3) {
      const gifts = await page.evaluate(() => ({ pending: (window.SquishGame.campaign.inventory?.pending || []).length, gift: window.SquishGame.campaign.gift?.active, vis: !document.getElementById('campaign-gift')?.hidden }));
      ok('L3: keine Geschenke (auch nicht als offenes Paket)', gifts.pending === 0 && !gifts.gift && !gifts.vis, JSON.stringify(gifts));
    }
    if (n === 5) ok('L5: Freischalt-Hinweis im Ergebnis', /Endlos und 2 Spieler/.test(res.msg), res.msg);
  }

  await page.click('#campaign-menu'); await sleep(1200);
  await h.goHome();
  await h.waitBtn('endless');
  await page.waitForFunction(() => {
    const find = l => [...document.querySelectorAll('#home-screen button')].find(b => b.dataset.nav === l || b.dataset.label === l);
    const e = find('endless')||find('Endlos')||find('Endless'), d = find('duel')||find('2 Spieler')||find('2 Players');
    return e && d && !e.classList.contains('is-locked') && !e.querySelector('.aw-lock') && !d.classList.contains('is-locked') && !d.querySelector('.aw-lock');
  }, { timeout: 4000 }).catch(() => {});
  const lk2 = await h.locks();
  ok('Nach L5: Endlos und 2 Spieler frei (kein Schloss)', !lk2.endlos?.locked && !lk2.endlos?.lock && !lk2.duo?.locked && !lk2.duo?.lock, JSON.stringify(lk2));

  // Duell jetzt möglich
  await h.press('duel');
  await page.waitForFunction(() => !document.getElementById('duel-screen').hidden && document.getElementById('duel-code').textContent === '482915', { timeout: 15000 }).catch(() => {});
  ok('Duell-Lobby öffnet nach Freischaltung', await page.evaluate(() => !document.getElementById('duel-screen').hidden && document.getElementById('duel-code').textContent === '482915'), JSON.stringify(duel));
  await page.click('#duel-close'); await page.waitForFunction(() => document.getElementById('duel-screen').hidden, { timeout: 10000 }); await sleep(400);

  // Endlos speichern + Reload
  await h.waitBtn('endless'); await h.press('endless'); await h.waitBtn('new-game'); await h.press('new-game'); await h.idle(); await sleep(800);
  for (let i = 0; i < 10; i++) { await page.evaluate(i => window.SquishGame.move(['left', 'up', 'right', 'down'][i % 4], (i * 2) % 5), i); await sleep(250); await h.idle(); }
  await sleep(1500);
  const before = await h.state();
  ok('Endlos: Züge gespielt', before.moves >= 5 && !before.campaign.mode, `Züge ${before.moves}, Punkte ${before.score}`);
  const r1 = await h.rate(); await sleep(8000); const r2 = await h.rate();
  ok('Endlos in Ruhe: 0 Renders/s', r2 === 0, `${r1} → ${r2}`);
  await page.reload({ waitUntil: 'load' });
  await h.waitBtn('endless'); await h.press('endless'); await h.waitBtn('continue');
  ok('Nach Reload: „Weiterspielen“ angeboten', true);
  await h.press('continue'); await h.idle(); await sleep(800);
  const after = await h.state();
  const sameBoard = JSON.stringify(after.board.map(r => r.map(t => t?.value ?? 0))) === JSON.stringify(before.board.map(r => r.map(t => t?.value ?? 0)));
  ok('Endlos-Spielstand nach Reload erhalten (Punkte, Züge, Brett)', after.score === before.score && after.moves === before.moves && sameBoard && !after.campaign.mode, `${before.score}/${before.moves} → ${after.score}/${after.moves} Brett ${sameBoard}`);
  ok('Keine JS-Fehler (frisches Profil)', errors.length === 0, JSON.stringify(errors.slice(0, 4)));
  console.log('Blockiert:', JSON.stringify([...new Set(blocked)]));
  await page.close();
}

// ---------- Reset: alter Abenteuer-Stand + Endlos-Spielstand ----------
{
  const oldProg = { version: 1, updatedAt: 5, levels: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [String(i + 1), { stars: 3, moves: 5, at: 1 }])) };
  const oldInv = { version: 3, extraMoves: 2, rocket: 1, hint: 3, wand: 1, gifts: ['level-3', 'level-6'], pending: [{ id: 'level-10', type: 'extraMoves' }], at: 99 };
  const { page, errors } = await newPage(false, {
    'squish-campaign-v1': JSON.stringify(oldProg),
    'squish-campaign-tools-v1': JSON.stringify(oldInv),
    'shift3-play-v1': JSON.stringify(ENDLESS_SAVE),
    'squish-campaign-tools-reset': 'launch-13',
    'squish-campaign-progress-reset': 'launch-14',
    'squish-campaign-stars-reset': 'launch-18',
    'squish-sound-v1': 'keep-me',
    'squish-lang-v1': 'en',
    'squish-campaign-tutorial-reset': 'launch-22',
  }); const h = H(page);
  await h.waitBtn('endless'); await sleep(600);
  const after = await page.evaluate(() => ({
    prog: JSON.parse(localStorage.getItem('squish-campaign-v1') || 'null'),
    inv: JSON.parse(localStorage.getItem('squish-campaign-tools-v1') || 'null'),
    save: JSON.parse(localStorage.getItem('shift3-play-v1') || 'null'),
    tag: localStorage.getItem('squish-campaign-tutorial-reset'),
    sync: localStorage.getItem('squish-progress-sync-v1'),
    sound: localStorage.getItem('squish-sound-v1'),
    seen: localStorage.getItem('squish-modes-unlock-seen'),
    lang: localStorage.getItem('squish-lang-v1'),
  }));
  ok('Reset: Abenteuer-Fortschritt leer, Merker launch-24, Sync-Merker weg', after.tag === 'launch-24' && Object.keys(after.prog?.levels || { x: 1 }).length === 0 && after.sync == null, JSON.stringify({ tag: after.tag, levels: after.prog?.levels, sync: after.sync }));
  ok('Reset: Abenteuer-Vorrat und Geschenke leer', (after.inv?.hint | 0) === 0 && (after.inv?.wand | 0) === 0 && (after.inv?.gifts || []).length === 0 && (after.inv?.pending || []).length === 0, JSON.stringify(after.inv));
  ok('Reset: Endlos-Spielstand, Einstellungen und Sprache bleiben', after.save?.score === 990 && after.save?.moves === 33 && after.sound === 'keep-me' && after.lang === 'en', JSON.stringify({ score: after.save?.score, moves: after.save?.moves, sound: after.sound, lang: after.lang }));
  const lk = await h.locks();
  ok('Reset: Endlos und 2 Spieler wieder gesperrt', lk.endlos?.locked && lk.duo?.locked, JSON.stringify(lk));
  ok('Keine JS-Fehler (Reset-Pfad)', errors.length === 0, JSON.stringify(errors.slice(0, 4)));
  await page.close();
}

// ---------- Level 11 und 50 (Fortschritt lokal vorbelegt, Reset-Merker schon gesetzt) ----------
{
  const prog = { version: 1, levels: Object.fromEntries(Array.from({ length: 49 }, (_, i) => [String(i + 1), { stars: 3, moves: 5, at: 1 }])), updatedAt: 1 };
  const { page, errors } = await newPage(false, {
    'squish-campaign-v1': JSON.stringify(prog),
    'squish-campaign-tools-reset': 'launch-13',
    'squish-campaign-progress-reset': 'launch-14',
    'squish-campaign-stars-reset': 'launch-18',
    'squish-campaign-tutorial-reset': 'launch-24',
    'squish-modes-unlock-seen': '1',
  }); const h = H(page);
  await h.waitBtn('endless');
  const lk = await h.locks();
  ok('Mit Fortschritt über L5: Modi frei', !lk.endlos?.locked && !lk.duo?.locked, JSON.stringify(lk));
  for (const n of [11, 50]) {
    if (!(await page.$$eval('#home-screen button', bs => bs.some(b => b.dataset.nav === 'select' || b.dataset.label === 'Levelauswahl' || b.dataset.label === 'Level Select')))) { await h.press('adventure'); await h.waitBtn('select'); }
    await h.press('select'); await page.waitForFunction(() => !document.getElementById('campaign-screen').hidden, { timeout: 15000 }); await sleep(300);
    await page.$eval(`#campaign-chapters button[data-level="${n}"]`, b => b.click());
    await page.waitForFunction(n => window.SquishGame.campaign.level === n && window.SquishGame.campaign.status === 'playing', { timeout: 30000, polling: 100 }, n);
    await h.idle(); await sleep(800);
    const lv = levels[n - 1]; const sol = n === 11 ? lv.solution : lv.solution.slice(0, 4);
    for (const ch of sol) { const m = Camp.decodeMove(ch); await page.evaluate(m => window.SquishGame.move(m.direction, m.line), m); await sleep(150); await h.idle(); }
    const st = await h.state();
    if (n === 11) { await page.waitForFunction(() => window.SquishGame.campaign.resultOpen, { timeout: 20000 }); ok('Level 11 lädt, Lösung gewinnt', (await h.state()).campaign.status === 'won'); await page.click('#campaign-menu'); await sleep(1200); }
    else ok(`Level 50 lädt (${lv.moves} Züge) und ist spielbar`, st.campaign.status === 'playing' && st.moves === 4, JSON.stringify({ st: st.campaign.status, mv: st.moves }));
    await h.goHome();
  }
  ok('Keine JS-Fehler (Level 11/50)', errors.length === 0, JSON.stringify(errors.slice(0, 4)));
  await page.close();
}

// ---------- reduzierte Bewegung ----------
{
  const { page, errors } = await newPage(true); const h = H(page);
  await h.waitBtn('endless');
  ok('Reduzierte Bewegung aktiv', await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches));
  // Tutorials sichtbar machen: L1 starten (kein Unlock nötig)
  await h.press('adventure'); await h.waitBtn('play-level'); await h.press('play-level'); await h.idle();
  await h.waitFinger().catch(() => {});
  const f = await h.finger();
  ok('Reduzierte Bewegung: Finger sichtbar und still, Pfeil entlang der Linie', f.visible && (f.static || f.anim === 'none') && f.hasArrow && f.hasLane, JSON.stringify(f));
  for (const ch of levels[0].solution) { const m = Camp.decodeMove(ch); await page.evaluate(m => window.SquishGame.move(m.direction, m.line), m); await sleep(200); }
  await page.waitForFunction(() => window.SquishGame.campaign.resultOpen, { timeout: 20000 });
  ok('Reduzierte Bewegung: L1 gewinnt', (await h.state()).campaign.status === 'won');
  await page.click('#campaign-menu'); await sleep(800); await h.goHome();
  // Endlos erst nach L5 – hier nur prüfen, dass der Start nicht crasht
  ok('Keine JS-Fehler (reduziert)', errors.length === 0, JSON.stringify(errors.slice(0, 4)));
}


async function auditScreens(page, h, tag) {
  const all = {};
  const rec = async (name) => {
    await sleep(280);
    const hits = await page.evaluate(overflowHits);
    if (hits.length) all[name] = hits;
  };
  await h.goHome();
  await h.waitBtn('endless');
  await rec('home');
  await page.click('#home-settings');
  await page.waitForFunction(() => { const s = document.getElementById('settings-screen'); return s && !s.hidden; }, { timeout: 8000 });
  await rec('settings');
  await page.click('#settings-close');
  await page.waitForFunction(() => document.getElementById('settings-screen')?.hidden, { timeout: 8000 });
  await sleep(200);
  await h.press('adventure');
  await h.waitBtn('play-level');
  await rec('campaign');
  await h.goHome();
  await h.waitBtn('rules');
  await h.press('rules');
  await sleep(400);
  await rec('rules');
  await h.goHome();
  await h.waitBtn('endless');
  ok(`${tag}: keine beschnittenen Knöpfe auf Start, Einstellungen, Abenteuer, Regeln`, Object.keys(all).length === 0, JSON.stringify(all));
}

// ---------- Sprache ----------
function overflowHits() {
  const vis = el => {
    if (!el || !el.getClientRects().length) return false;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
    let n = el.parentElement;
    while (n && n !== document.body) {
      const ps = getComputedStyle(n);
      if (n.hidden || ps.display === 'none' || ps.visibility === 'hidden') return false;
      n = n.parentElement;
    }
    return true;
  };
  const hits = [];
  const seen = new Set();
  const sel = '.aw-btn, .aw-tile, .aw-lang-btn, .gift-btn, .shop-pill, button.menu-button, #campaign-extra, #campaign-next, #campaign-retry, #campaign-menu, #home-play-level';
  const openOverlay = document.querySelector('.campaign-result:not([hidden]), .settings-screen:not([hidden]), .duel-screen:not([hidden]), .ad-veil, .shop-veil');
  for (const el of document.querySelectorAll(sel)) {
    if (!vis(el) || seen.has(el)) continue;
    if (openOverlay && !openOverlay.contains(el) && !el.closest('.aw-lang, .aw-topbar')) continue;
    seen.add(el);
    const labels = [...el.querySelectorAll('.aw-label>span, .aw-label small, .aw-tile-label')];
    if (!labels.length && /[A-Za-zÄÖÜäöüß]/.test(el.textContent || '')) labels.push(el);
    for (const node of labels) {
      if (node !== el && !vis(node)) continue;
      const ls = getComputedStyle(node);
      const clipped = node.scrollWidth > node.clientWidth + 1;
      const ellipsis = /\bellipsis\b/.test(ls.textOverflow);
      if (clipped || ellipsis) {
        hits.push({ nav: el.dataset.nav || el.id, text: (node.textContent||'').replace(/\s+/g,' ').trim().slice(0,48), sw: node.scrollWidth, cw: node.clientWidth, ellipsis: ls.textOverflow });
        break;
      }
    }
  }
  return hits;
}
{
  const { page, errors } = await newPage(false, null, 'en'); const h = H(page);
  await h.waitBtn('endless');
  const boot = await page.evaluate(() => ({ lang: document.documentElement.lang, adventure: document.querySelector('[data-nav="adventure"]')?.dataset.label, enOn: document.querySelector('[data-nav="lang-en"]')?.getAttribute('aria-pressed'), title: document.title, saved: localStorage.getItem('squish-lang-v1') }));
  ok('navigator en* → English (Adventure, html lang=en)', boot.lang === 'en' && boot.adventure === 'Adventure' && boot.enOn === 'true', JSON.stringify(boot));
  const overflowEn = await page.evaluate(overflowHits);
  ok('375/390 English: keine überlaufenden Knöpfe auf dem Startbildschirm', overflowEn.length === 0, JSON.stringify(overflowEn));
  await auditScreens(page, h, 'English');
  await h.press('lang-de'); await sleep(400);
  const afterDe = await page.evaluate(() => ({ lang: document.documentElement.lang, adventure: document.querySelector('[data-nav="adventure"]')?.dataset.label, deOn: document.querySelector('[data-nav="lang-de"]')?.getAttribute('aria-pressed'), saved: localStorage.getItem('squish-lang-v1') }));
  ok('Umschalten auf Deutsch: Abenteuer, lang=de, gespeichert', afterDe.lang === 'de' && afterDe.adventure === 'Abenteuer' && afterDe.saved === 'de' && afterDe.deOn === 'true', JSON.stringify(afterDe));
  await page.reload({ waitUntil: 'load' });
  await h.waitBtn('endless');
  const persisted = await page.evaluate(() => ({ lang: document.documentElement.lang, adventure: document.querySelector('[data-nav="adventure"]')?.dataset.label, saved: localStorage.getItem('squish-lang-v1') }));
  ok('Deutsch bleibt nach Reload', persisted.lang === 'de' && persisted.adventure === 'Abenteuer' && persisted.saved === 'de', JSON.stringify(persisted));
  const overflowDe = await page.evaluate(overflowHits);
  ok('Startbildschirm Deutsch: keine überlaufenden Knöpfe', overflowDe.length === 0, JSON.stringify(overflowDe));
  await auditScreens(page, h, 'Deutsch');
  await h.press('lang-en'); await sleep(300);
  await page.reload({ waitUntil: 'load' });
  await h.waitBtn('endless');
  const persistedEn = await page.evaluate(() => ({ lang: document.documentElement.lang, adventure: document.querySelector('[data-nav="adventure"]')?.dataset.label, saved: localStorage.getItem('squish-lang-v1') }));
  ok('Englisch bleibt nach Reload', persistedEn.lang === 'en' && persistedEn.adventure === 'Adventure' && persistedEn.saved === 'en', JSON.stringify(persistedEn));
  ok('Keine JS-Fehler (Sprache)', errors.length === 0, JSON.stringify(errors.slice(0, 4)));
}
{
  const { page } = await newPage(false, { 'squish-lang-v1': 'en' }, 'de'); const h = H(page);
  await h.waitBtn('endless');
  const savedWins = await page.evaluate(() => ({ lang: document.documentElement.lang, adventure: document.querySelector('[data-nav="adventure"]')?.dataset.label, saved: localStorage.getItem('squish-lang-v1') }));
  ok('Gespeicherte Sprache schlägt navigator (en trotz de-Gerät)', savedWins.lang === 'en' && savedWins.adventure === 'Adventure' && savedWins.saved === 'en', JSON.stringify(savedWins));
}

// ---------- langes Label „Level 100 spielen“ / „Play Level 100“ ----------
{
  const prog = { version: 1, levels: Object.fromEntries(Array.from({ length: 99 }, (_, i) => [String(i + 1), { stars: 3, moves: 5, at: 1 }])), updatedAt: 1 };
  for (const [locale, want] of [['de', 'Level 100 spielen'], ['en', 'Play Level 100']]) {
    const { page, errors } = await newPage(false, {
      'squish-campaign-v1': JSON.stringify(prog),
      'squish-campaign-tools-reset': 'launch-13',
      'squish-campaign-progress-reset': 'launch-14',
      'squish-campaign-stars-reset': 'launch-18',
      'squish-campaign-tutorial-reset': 'launch-24',
      'squish-modes-unlock-seen': '1',
      'squish-lang-v1': locale,
    }, locale);
    const h = H(page);
    await h.waitBtn('endless');
    await h.press('adventure');
    await h.waitBtn('play-level');
    await sleep(500);
    const info = await page.evaluate(() => {
      const b = document.getElementById('home-play-level');
      const span = b?.querySelector('.aw-label>span');
      const ls = span ? getComputedStyle(span) : null;
      return {
        text: span?.textContent,
        label: b?.dataset.label,
        sw: span?.scrollWidth, cw: span?.clientWidth,
        ellipsis: ls?.textOverflow,
        btnSw: b?.scrollWidth, btnCw: b?.clientWidth,
      };
    });
    ok(`${locale}: „${want}“ vollständig, ohne Ellipsis`, info.text === want && info.sw <= info.cw + 1 && !/ellipsis/.test(info.ellipsis || ''), JSON.stringify(info));
    const hits = await page.evaluate(overflowHits);
    ok(`${locale}: Abenteuer-Bildschirm ohne beschnittene Knöpfe (Level 100)`, hits.length === 0, JSON.stringify(hits));
    await h.press('select');
    await page.waitForFunction(() => !document.getElementById('campaign-screen').hidden, { timeout: 15000 });
    await sleep(300);
    const selHits = await page.evaluate(overflowHits);
    ok(`${locale}: Levelauswahl ohne beschnittene Knöpfe`, selHits.length === 0, JSON.stringify(selHits));
    ok(`Keine JS-Fehler (Level 100 ${locale})`, errors.length === 0, JSON.stringify(errors.slice(0, 4)));
    await page.close();
  }
}


// ---------- launch-26: Hilfsmittel 1×, Werbeclip, Sterne-Deckel, kein Lab, kein Werbefrei-Knopf im Web ----------
{
  const leftover = { version: 3, extraMoves: 9, rocket: 9, hint: 9, wand: 9, gifts: ['level-3'], pending: [{ id: 'level-6', type: 'hint' }], at: 1 };
  const { page, errors } = await newPage(false, {
    'squish-campaign-tools-v1': JSON.stringify(leftover),
    'squish-campaign-tools-reset': 'launch-13',
    'squish-campaign-progress-reset': 'launch-14',
    'squish-campaign-stars-reset': 'launch-18',
    'squish-campaign-tutorial-reset': 'launch-24',
  }); const h = H(page);
  await h.waitBtn('endless');
  await h.press('adventure'); await h.waitBtn('play-level'); await h.press('play-level'); await h.idle(); await sleep(400);
  const tools1 = await page.evaluate(() => {
    const count = id => document.getElementById(id)?.querySelector('[data-count]')?.textContent;
    const ad = id => document.getElementById(id)?.dataset.ad;
    return {
      available: window.SquishGame.campaign.available,
      free: window.SquishGame.campaign.freeTools,
      extra: count('tool-extra'), hint: count('tool-hint'), rocket: count('tool-rocket'), wand: count('tool-wand'),
      adExtra: ad('tool-extra'), adHint: ad('tool-hint'),
      capHidden: document.getElementById('campaign-tool-cap')?.hidden,
      adFree: window.SquishGame.campaign.adFree,
      adFreeOffer: window.SquishGame.campaign.adFreeOffer,
      pending: (window.SquishGame.campaign.inventory?.pending || []).length,
    };
  });
  ok('L1: jedes Hilfsmittel 1× (alter Vorrat zählt nicht), AD-Kennzeichnung, Deckel aus, kein Werbefrei',
    tools1.available?.extraMoves === 1 && tools1.available?.hint === 1 && tools1.available?.rocket === 1 && tools1.available?.wand === 1
    && tools1.extra === '1' && tools1.hint === '1' && tools1.adExtra === '1' && tools1.adHint === '1' && tools1.capHidden
    && tools1.adFree === false && tools1.adFreeOffer === false, JSON.stringify(tools1));
  await page.click('#tool-extra');
  await page.waitForFunction(() => window.SquishGame.campaign.adOpen, { timeout: 8000 });
  ok('L1: +3 Züge öffnet Dummy-Werbung', await page.evaluate(() => window.SquishGame.campaign.adOpen && window.SquishGame.campaign.adType === 'extraMoves'));
  await page.click('.ad-later');
  await page.waitForFunction(() => !window.SquishGame.campaign.adOpen, { timeout: 8000 });
  ok('L1: Werbeabbruch lässt die Ladung', await page.evaluate(() => window.SquishGame.campaign.available?.extraMoves === 1 && (window.SquishGame.campaign.toolsUsed || []).length === 0));
  await page.click('#tool-extra');
  await page.waitForFunction(() => window.SquishGame.campaign.adOpen, { timeout: 8000 });
  await page.click('#ad-watch');
  await page.waitForFunction(() => !window.SquishGame.campaign.adOpen && (window.SquishGame.campaign.toolsUsed || []).includes('extraMoves'), { timeout: 8000 });
  const afterAd = await page.evaluate(() => ({
    used: window.SquishGame.campaign.toolsUsed,
    extra: window.SquishGame.campaign.available?.extraMoves,
    capHidden: document.getElementById('campaign-tool-cap')?.hidden,
    cap: document.getElementById('campaign-tool-cap')?.textContent,
  }));
  ok('L1: nach angesehenem Clip wird +3 eingesetzt, Deckel max. 2★, andere Ladungen bleiben',
    afterAd.used?.includes('extraMoves') && afterAd.extra === 0 && afterAd.capHidden === false && /2/.test(afterAd.cap || ''), JSON.stringify(afterAd));
  for (const ch of levels[0].solution) { const m = Camp.decodeMove(ch); await page.evaluate(m => window.SquishGame.move(m.direction, m.line), m); await sleep(200); }
  await page.waitForFunction(() => window.SquishGame.campaign.resultOpen, { timeout: 20000 }); await sleep(1800);
  const resCap = await page.evaluate(() => ({
    stars: document.querySelectorAll('#campaign-result-stars .is-earned').length,
    msg: document.getElementById('campaign-result-message')?.textContent || '',
    saved: window.SquishGame.campaign.progress?.levels?.['1']?.stars,
  }));
  ok('L1 mit 1 Hilfsmittel: höchstens 2★, Hinweis im Ergebnis', resCap.stars === 2 && resCap.saved === 2 && /2/.test(resCap.msg), JSON.stringify(resCap));
  await page.click('#campaign-retry');
  await page.waitForFunction(() => !window.SquishGame.campaign.resultOpen && window.SquishGame.campaign.status === 'playing' && (window.SquishGame.campaign.toolsUsed || []).length === 0, { timeout: 20000 });
  await h.idle(); await sleep(400);
  const retry = await page.evaluate(() => ({ available: window.SquishGame.campaign.available, used: window.SquishGame.campaign.toolsUsed, capHidden: document.getElementById('campaign-tool-cap')?.hidden }));
  ok('Nochmal: alle Hilfsmittel wieder 1×, Deckel aus', retry.available?.extraMoves === 1 && retry.available?.hint === 1 && retry.available?.rocket === 1 && retry.available?.wand === 1 && (retry.used || []).length === 0 && retry.capHidden, JSON.stringify(retry));
  await page.click('#campaign-menu').catch(async () => { await page.evaluate(() => document.getElementById('campaign-menu')?.click()); });
  await sleep(800); await h.goHome(); await h.waitBtn('endless');
  // Einstellungen: Werbefrei-Knopf nur in der App
  await page.click('[data-open-settings]');
  await page.waitForFunction(() => !document.getElementById('settings-screen')?.hidden, { timeout: 8000 });
  const adFreeUi = await page.evaluate(() => ({ buyHidden: document.getElementById('adfree-buy')?.hidden, descHidden: document.getElementById('adfree-desc')?.hidden, ownedHidden: document.getElementById('adfree-owned')?.hidden }));
  ok('Web: kein Werbefrei-Kauf in den Einstellungen', adFreeUi.buyHidden && adFreeUi.descHidden && adFreeUi.ownedHidden, JSON.stringify(adFreeUi));
  await page.click('#settings-close');
  await page.waitForFunction(() => document.getElementById('settings-screen')?.hidden, { timeout: 8000 });
  await h.waitBtn('rules'); await h.press('rules'); await sleep(400);
  const labBtn = await page.evaluate(() => {
    const b = [...document.querySelectorAll('#home-screen button')].find(b => b.dataset.nav === 'lab' || /Neue Squishes|Try the new Squishes/i.test((b.dataset.label || b.textContent || '')));
    return b ? { nav: b.dataset.nav, label: b.dataset.label || (b.querySelector('.aw-label>span')?.textContent || b.textContent).trim() } : null;
  });
  ok('Regeln (de): kein Eintrag „Neue Squishes testen“', !labBtn, JSON.stringify(labBtn));
  const rulesOverflow = await page.evaluate(overflowHits);
  ok('Regeln (de): keine beschnittenen Knöpfe', rulesOverflow.length === 0, JSON.stringify(rulesOverflow));
  ok('Keine JS-Fehler (Hilfsmittel/Werbung/Lab)', errors.length === 0, JSON.stringify(errors.slice(0, 4)));
  await page.close();
}

// ---------- Kapitel-Schranke 18★ bleibt, Level 11 zu ----------
{
  const prog = { version: 1, updatedAt: 1, levels: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i + 1), { stars: i < 7 ? 2 : 1, moves: 6, at: 1 }])) };
  // 7×2 + 3×1 = 17★ < 18
  const { page, errors } = await newPage(false, {
    'squish-campaign-v1': JSON.stringify(prog),
    'squish-campaign-tools-reset': 'launch-13',
    'squish-campaign-progress-reset': 'launch-14',
    'squish-campaign-stars-reset': 'launch-18',
    'squish-campaign-tutorial-reset': 'launch-24',
    'squish-modes-unlock-seen': '1',
  }); const h = H(page);
  await h.waitBtn('endless');
  await h.press('adventure'); await h.waitBtn('select'); await h.press('select');
  await page.waitForFunction(() => !document.getElementById('campaign-screen').hidden, { timeout: 15000 }); await sleep(300);
  const lock = await page.evaluate(() => {
    const b = document.querySelector('#campaign-chapters button[data-level="11"]');
    b?.click();
    return {
      stars: window.SquishGame.campaign.progress ? Object.values(window.SquishGame.campaign.progress.levels || {}).reduce((s, r) => s + (r.stars || 0), 0) : 0,
      locked: b?.classList.contains('is-locked'),
      level: window.SquishGame.campaign.level,
      note: document.getElementById('campaign-lock-note')?.textContent || '',
    };
  });
  ok('Kapitel 2 bei 17★ gesperrt (Schranke 18★)', lock.stars === 17 && lock.locked && lock.level !== 11 && /18/.test(lock.note), JSON.stringify(lock));
  ok('Keine JS-Fehler (Kapitel-Schranke)', errors.length === 0, JSON.stringify(errors.slice(0, 4)));
  await page.close();
}

{
  const { page, errors } = await newPage(false, { 'squish-lang-v1': 'en' }, 'en'); const h = H(page);
  await h.waitBtn('endless');
  await h.waitBtn('rules'); await h.press('rules'); await sleep(400);
  const labBtn = await page.evaluate(() => {
    const b = [...document.querySelectorAll('#home-screen button')].find(b => b.dataset.nav === 'lab' || /Neue Squishes|Try the new Squishes/i.test((b.dataset.label || b.textContent || '')));
    return b ? { nav: b.dataset.nav, label: b.dataset.label || (b.querySelector('.aw-label>span')?.textContent || b.textContent).trim() } : null;
  });
  ok('Rules (en): no “Try the new Squishes” entry', !labBtn, JSON.stringify(labBtn));
  const rulesOverflow = await page.evaluate(overflowHits);
  ok('English rules: keine beschnittenen Knöpfe', rulesOverflow.length === 0, JSON.stringify(rulesOverflow));
  ok('Keine JS-Fehler (Regeln en)', errors.length === 0, JSON.stringify(errors.slice(0, 4)));
  await page.close();
}

for (const c of contexts) await c.close().catch(() => {}); await browser.close(); console.log(JSON.stringify({ fail })); process.exit(fail ? 1 : 0);

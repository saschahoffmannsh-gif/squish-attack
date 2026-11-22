// Live-Check launch-41 (Backend-Schreibzugriffe blockiert: functions/v1 + REST-Schreiben).
// Wie live-check40 (Anmeldestreak), dazu: Build/Cache-Tags, Aufgabenkarte bis zum Tipp, HUD nur Aufgabe/Goal.
// node live-check41.mjs [url] [de|en] [WxH]
import { launch, sleep, IPHONE, IPHONE_UA } from './lib.mjs';

function localDateISO(date = new Date()) {
  const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, '0'), d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function addDaysISO(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return localDateISO(dt);
}
/** State so the next check-in on `today` is login day N (1..28). */
function prepareForDay(n, today) {
  const day = Math.max(1, Math.min(28, n | 0));
  if (day === 1) return { v: 2, title: 'noob', week: 1, dayInWeek: 0, totalDays: 0, lastCheckIn: null, gifted: [], complete: false };
  const yesterday = addDaysISO(today, -1);
  const totalDays = day - 1;
  const week = totalDays % 7 === 0 ? totalDays / 7 + 1 : Math.floor((totalDays - 1) / 7) + 1;
  const dayInWeek = totalDays % 7 === 0 ? 0 : ((totalDays - 1) % 7) + 1;
  const titles = ['noob', 'kneader', 'pro', 'master', 'legend'];
  const title = totalDays % 7 === 0 ? titles[totalDays / 7] : titles[week - 1];
  const gifted = [];
  for (let w = 1; w <= Math.floor(totalDays / 7); w++) gifted.push('streak-' + w);
  return { v: 2, title, week, dayInWeek, totalDays, lastCheckIn: yesterday, gifted, complete: totalDays >= 28 };
}
const [base0, lang = 'de', vp = '390x844'] = process.argv.slice(2);
const base = base0 || ('https://saschahoffmannsh-gif.github.io/squish-attack/game/?t=' + Date.now());
console.log('Live-Check', lang, vp, base);
const [W, H] = vp.split('x').map(Number);
const RESETS = { 'squish-campaign-tutorial-reset': 'launch-30', 'squish-campaign-curve-stars-reset': 'launch-27', 'squish-campaign-progress-reset': 'launch-14', 'squish-campaign-stars-reset': 'launch-18', 'squish-campaign-tools-reset': 'launch-13', 'squish-campaign-rules28': 'launch-28' };
let fail = 0; const ok = (n, c, x = '') => { if (!c) fail++; console.log(c ? 'OK  ' : 'FAIL', n, x); };
const dayWord = lang === 'en' ? 'Day' : 'Tag';
const browser = await launch();

async function newPage(storage, query = '') {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errors = [], blocked = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.setRequestInterception(true);
  page.on('request', r => {
    const u = r.url();
    if (u.includes('/functions/v1/') || (u.includes('/rest/v1/') && !['GET', 'OPTIONS', 'HEAD'].includes(r.method()))) {
      blocked.push(r.method()); return r.abort('failed');
    }
    r.continue();
  });
  await page.setViewport({ ...IPHONE, width: W, height: H, deviceScaleFactor: (W <= 375 && H <= 667) ? 2 : 3, isMobile: true, hasTouch: true });
  await page.setUserAgent(IPHONE_UA);
  await page.evaluateOnNewDocument((s, lang) => {
    if (sessionStorage.getItem('f41')) return; sessionStorage.setItem('f41', '1');
    Object.defineProperty(navigator, 'language', { get: () => lang === 'de' ? 'de-DE' : 'en-US' });
    Object.defineProperty(navigator, 'languages', { get: () => lang === 'de' ? ['de-DE', 'de'] : ['en-US', 'en'] });
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
  }, { ...RESETS, 'squish-lang-v1': lang, ...storage }, lang);
  const url = base.replace(/(\?|#).*$/, '') + (query || '?t=' + Date.now());
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => [...document.querySelectorAll('#home-screen button')].some(b => b.dataset.nav === 'adventure') && window.SquishGame && !window.SquishGame.menu.busy, { timeout: 60000, polling: 200 });
  const langBtn = await page.$(`[data-lang="${lang}"]`);
  if (langBtn) {
    const on = await page.evaluate(el => el.classList.contains('is-on') || el.getAttribute('aria-pressed') === 'true', langBtn);
    if (!on) { await langBtn.click(); await sleep(300); }
  }
  return { ctx, page, errors, blocked };
}

async function popMetrics(page) {
  return page.evaluate((W, H, lang) => {
    const pop = document.getElementById('streak-pop');
    const card = document.querySelector('#streak-pop .sp-card');
    const days = [...document.querySelectorAll('#streak-pop .sp-day')];
    const vals = days.map(d => {
      const r = d.querySelector('.sp-val')?.getBoundingClientRect();
      return {
        text: (d.querySelector('.sp-val text')?.textContent || '').trim(),
        hasCheck: !!d.querySelector('.sp-check'),
        isGift: d.classList.contains('is-gift'),
        fit: r ? r.left >= -2 && r.right <= W + 2 && r.top >= -2 && r.bottom <= H + 2 && r.width >= 14 && r.height >= 14 : false,
      };
    });
    const cr = card?.getBoundingClientRect();
    return {
      open: !!pop,
      debug: !!document.getElementById('streak-debug'),
      previewTag: !!document.getElementById('streak-preview-tag'),
      count: document.querySelector('#streak-pop .sp-count')?.textContent?.trim() || '',
      numbers: vals.map(v => v.text).join(''),
      vals,
      title: document.querySelector('#streak-pop .sp-title')?.textContent?.trim() || '',
      r1: pop ? getComputedStyle(document.querySelector('.sp-banner')).getPropertyValue('--r1').trim().toLowerCase() : '',
      cardFit: cr ? cr.left >= -2 && cr.right <= W + 2 && cr.top >= -2 && cr.bottom <= H + 2 : false,
      cardClip: card ? card.scrollHeight > card.clientHeight + 2 : true,
      reward: !!document.querySelector('#streak-pop .sp-reward:not(.is-empty)'),
      build: document.getElementById('home-build')?.textContent || '',
      badge: document.getElementById('streak-badge')?.textContent?.trim() || '',
    };
  }, W, H, lang);
}

// --- fresh day 1 ---
{
  const P = await newPage({});
  await P.page.waitForSelector('#streak-pop', { timeout: 20000 });
  await sleep(700);
  const m = await popMetrics(P.page);
  ok(`${lang} Build launch-40`, /launch-40/.test(m.build), m.build);
  ok(`${lang} Tag 1: Fenster offen`, m.open);
  ok(`${lang} kein Debug / keine Vorschau-Markierung`, !m.debug && !m.previewTag);
  ok(`${lang} Zähler ${dayWord} 1`, m.count === `${dayWord} 1`, m.count);
  ok(`${lang} Zahlen 1–7`, m.numbers === '1234567', m.numbers);
  ok(`${lang} Tag 1 Haken, Tag 7 Geschenk`, m.vals[0]?.hasCheck && m.vals[6]?.isGift && m.vals[6]?.text === '7' && !m.vals[6]?.hasCheck, JSON.stringify(m.vals[0]) + JSON.stringify(m.vals[6]));
  ok(`${lang} Zahlen lesbar`, m.vals.every(v => v.fit), JSON.stringify(m.vals));
  ok(`${lang} Fenster passt`, m.cardFit && !m.cardClip, JSON.stringify({ fit: m.cardFit, clip: m.cardClip }));
  ok(`${lang} Abzeichen sichtbar`, !!m.badge, m.badge);
  await P.page.click('#streak-pop .sp-card');
  await sleep(300);
  ok(`${lang} Tippen schließt`, await P.page.evaluate(() => !document.getElementById('streak-pop')));
  // ?day / ?reset ignored: already tested on a fresh account below
  const inv = await P.page.evaluate(() => window.SquishGame.streak.inventory);
  ok(`${lang} Tag 1 ohne Geschenk im Vorrat`, (inv?.extraMoves | 0) === 0 && (inv?.rocket | 0) === 0 && !(inv?.gifts || []).some(id => String(id).startsWith('streak-')), JSON.stringify(inv));
  // tutorial: enter L1, no streak overlay
  await P.page.$$eval('#home-screen button, [data-nav]', bs => bs.find(b => b.dataset.nav === 'adventure').click());
  await P.page.waitForFunction(() => window.SquishGame.state.started || window.SquishGame.campaign?.status === 'playing' || document.getElementById('explain-dialog'), { timeout: 60000, polling: 200 }).catch(() => {});
  await sleep(800);
  const over = await P.page.evaluate(() => !!document.getElementById('streak-pop'));
  ok(`${lang} kein Streak-Fenster über dem Tutorial`, !over);
  ok(`${lang} keine JS-Fehler (Tag 1)`, P.errors.length === 0, JSON.stringify(P.errors.slice(0, 2)));
  await P.ctx.close();
}

// --- URL params ignored ---
{
  const P = await newPage({}, '?reset=1&day=28&t=' + Date.now());
  await P.page.waitForSelector('#streak-pop', { timeout: 20000 });
  await sleep(700);
  const m = await popMetrics(P.page);
  ok(`${lang} ?day/?reset werden ignoriert (Tag 1, nicht 28)`, m.count === `${dayWord} 1` && m.title.toLowerCase().includes('noob'), `${m.count} ${m.title}`);
  await P.ctx.close();
}

// --- day 7 ceremony + inventory ---
{
  const today = localDateISO();
  const pre = prepareForDay(7, today);
  const P = await newPage({ 'squish-streak-v1': JSON.stringify(pre) });
  await P.page.waitForSelector('#streak-pop', { timeout: 20000 });
  await sleep(700);
  const m = await popMetrics(P.page);
  ok(`${lang} Tag 7: Zähler`, m.count === `${dayWord} 7`, m.count);
  ok(`${lang} Tag 7: Zahlen 1–7, 1–6 mit Haken, Geschenk`, m.numbers === '1234567' && m.vals.slice(0, 6).every(v => v.hasCheck) && m.vals[6].isGift && m.vals[6].text === '7', JSON.stringify(m.vals.map(v => [v.text, v.hasCheck, v.isGift])));
  ok(`${lang} Tag 7: Titel Kneter/Kneader und Belohnung`, /kneter|kneader/i.test(m.title) && m.reward, m.title);
  const mid = await P.page.evaluate(() => { document.getElementById('streak-pop')?.click(); return !!document.getElementById('streak-pop'); });
  ok(`${lang} Tippen während Belohnung bleibt offen`, mid);
  await sleep(2200);
  const inv = await P.page.evaluate(() => {
    const i = window.SquishGame.streak.inventory || window.SquishGame.campaign.inventory;
    return { extraMoves: i.extraMoves | 0, rocket: i.rocket | 0, gifts: (i.gifts || []).slice() };
  });
  ok(`${lang} +3 Züge im Vorrat (streak-1)`, inv.extraMoves >= 1 && inv.gifts.includes('streak-1') && inv.rocket === 0, JSON.stringify(inv));
  await P.page.click('#streak-pop .sp-card');
  await sleep(300);
  ok(`${lang} Tippen nach Belohnung schließt`, await P.page.evaluate(() => !document.getElementById('streak-pop')));
  ok(`${lang} keine JS-Fehler (Tag 7)`, P.errors.length === 0, JSON.stringify(P.errors.slice(0, 2)));
  await P.ctx.close();
}


// --- launch-41: Build, Cache-Tags, Aufgabenkarte ---
{
  const today = localDateISO();
  const P = await newPage({
    'squish-campaign-v1': JSON.stringify({ version: 1, updatedAt: 5, levels: Object.fromEntries(Array.from({ length: 100 }, (_, i) => [String(i + 1), { stars: 3, moves: 3, at: 1 }])) }),
    'squish-explain-seen-v1': JSON.stringify(['merge', 'merge5', 'street', 'tools', 'gifts', 'gates', 'ads', 'tool-cost', 'gold-used']),
    'squish-streak-v1': JSON.stringify({ v: 2, title: 'noob', week: 1, dayInWeek: 1, totalDays: 1, lastCheckIn: today, gifted: [], complete: false }),
  });
  const build = await P.page.evaluate(() => document.getElementById('home-build')?.textContent || '');
  ok(`${lang} Build launch-41`, build.includes('launch-41'), build);
  const tags = await P.page.evaluate(() => [...document.querySelectorAll('script[src],link[href]')].map(e => e.src || e.href).filter(u => /[?]v=launch-/.test(u) && !/v=launch-41/.test(u)));
  ok(`${lang} Cache-Tags alle launch-41`, tags.length === 0, tags.slice(0, 3).join(' '));
  await P.page.$$eval('#home-screen button, [data-nav]', bs => (bs.find(b => b.dataset.nav === 'levels') || bs.find(b => b.dataset.nav === 'adventure')).click());
  await P.page.waitForFunction(() => document.getElementById('campaign-screen') && !document.getElementById('campaign-screen').hidden, { timeout: 20000 }).catch(() => {});
  if (await P.page.evaluate(() => document.getElementById('campaign-screen')?.hidden !== false)) {
    await P.page.$$eval('#home-screen button, [data-nav]', bs => (bs.find(b => b.dataset.nav === 'levels') || {}).click?.());
    await P.page.waitForFunction(() => document.getElementById('campaign-screen') && !document.getElementById('campaign-screen').hidden, { timeout: 20000 });
  }
  await sleep(400);
  await P.page.click('.campaign-level-btn[data-level="71"]');
  await P.page.waitForFunction(() => window.SquishGame.state?.started && !window.SquishGame.state?.busy, { timeout: 60000, polling: 100 });
  await P.page.waitForSelector('#goal-intro:not([hidden])', { timeout: 20000 });
  await sleep(2600);
  const still = await P.page.evaluate(() => !document.querySelector('#goal-intro')?.hidden);
  ok(`${lang} Aufgabenkarte bleibt bis zum Tipp`, still);
  const mid = await P.page.evaluate(() => {
    const slot = document.querySelector('.board-slot').getBoundingClientRect();
    const el = document.elementFromPoint(slot.left + slot.width / 2, slot.top + slot.height / 2);
    return !!el?.closest('#goal-intro');
  });
  ok(`${lang} Brett ist gesperrt, solange die Karte offen ist`, mid);
  const chips = await P.page.evaluate(() => [...document.querySelectorAll('.goal-intro-progress .goal-count')].map(e => e.textContent));
  ok(`${lang} Fortschritt in der Karte`, chips.length >= 3 && chips.includes('3/5'), JSON.stringify(chips));
  await P.page.click('.goal-intro-card');
  await P.page.waitForFunction(() => document.querySelector('#goal-intro')?.hidden, { timeout: 4000 });
  await sleep(400);
  const hud = await P.page.evaluate(() => {
    const box = el => { if (!el || el.hidden || getComputedStyle(el).display === 'none') return null; const r = el.getBoundingClientRect(); return { t: r.top, b: r.bottom, l: r.left, r: r.right }; };
    const inter = (a, b) => a && b && !(a.r <= b.l + 0.5 || b.r <= a.l + 0.5 || a.b <= b.t + 0.5 || b.b <= a.t + 0.5);
    const slot = box(document.querySelector('.board-slot'));
    const goal = box(document.querySelector('.campaign-goal'));
    const moves = box(document.querySelector('.campaign-moves'));
    const hint = box(document.querySelector('#goal-hint'));
    const label = (document.querySelector('.goal-task-label')?.textContent || '').trim();
    const bang = !!document.querySelector('.goal-task-bang');
    const hudChips = [...document.querySelectorAll('.campaign-goal > ul .goal-chip')].filter(e => e.offsetParent).length;
    return { label, bang, hudChips, overlap: !!(inter(goal, slot) || inter(moves, slot) || inter(hint, slot)), hidden: !!document.querySelector('#goal-intro')?.hidden };
  });
  const expect = lang === 'en' ? 'Goal' : 'Aufgabe';
  ok(`${lang} HUD nur ${expect} mit Ausrufezeichen, keine Chips`, hud.label === expect && hud.bang && hud.hudChips === 0 && hud.hidden, JSON.stringify(hud));
  ok(`${lang} HUD überlappt das Brett nicht`, !hud.overlap, JSON.stringify(hud));
  await P.page.click('#goal-hint');
  await P.page.waitForFunction(() => document.querySelector('#goal-intro') && !document.querySelector('#goal-intro').hidden, { timeout: 4000 });
  const again = await P.page.evaluate(() => document.querySelectorAll('.goal-intro-progress .goal-chip').length);
  ok(`${lang} Tipp auf Aufgabe öffnet die Karte wieder`, again >= 3, String(again));
  ok(`${lang} keine JS-Fehler (Aufgabe)`, P.errors.length === 0, JSON.stringify(P.errors.slice(0, 2)));
  await P.ctx.close();
}

await browser.close();
console.log(fail ? `\nFEHLER ${fail}` : `\nALLES OK ${lang} ${W}x${H}`);
process.exit(fail ? 1 : 0);

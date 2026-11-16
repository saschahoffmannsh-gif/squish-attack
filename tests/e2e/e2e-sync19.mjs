// E2E launch-19: Cloud-Abgleich des Abenteuer-Fortschritts. Server = Attrappe im Browser-Abfang
// (gleiche Merge-Logik wie die Edge Function), alle anderen Backend-Aufrufe blockiert. Keine Screenshots.
// A online: Server-Stand wird übernommen, neues Level wird gesendet, Reload ohne Änderung sendet nichts.
// B Netzfehler → still, lokal gespeichert; wieder online → nachgereicht.  C echt offline → kein Aufruf.
// Aufruf: node e2e-sync19.mjs <baseUrl> [--small]
import { launch, sleep, IPHONE, IPHONE_UA } from './lib.mjs';
import { readFileSync } from 'node:fs';
import * as Camp from '/workspace/squish-campaign/game/campaign.mjs';
import { mergeWire, normalizeWire } from '/workspace/squish-campaign/game/progress-merge.mjs';

const base = process.argv[2] || 'http://127.0.0.1:8771/game/';
const VP = process.argv.includes('--small') ? { ...IPHONE, width: 375, height: 667 } : IPHONE;
const tag = `${VP.width}×${VP.height}`;
const levels = JSON.parse(readFileSync('/workspace/squish-campaign/levels/levels-001-100.json', 'utf8')).levels;
let failed = 0, total = 0;
const check = (name, ok, extra = '') => { total++; if (!ok) failed++; console.log(`[${tag}]`, ok ? 'OK  ' : 'FAIL', name, extra); };
const browser = await launch();
const errors = [];
const resets = { 'squish-campaign-tools-reset': 'launch-13', 'squish-campaign-progress-reset': 'launch-14', 'squish-campaign-stars-reset': 'launch-18' };
const TOKEN = 'ab'.repeat(32);

async function newPage(seed, net) {
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.setViewport(VP); await page.setUserAgent(IPHONE_UA);
  await page.setRequestInterception(true);
  page.on('request', r => {
    const u = r.url(), m = r.method();
    if (/functions\/v1\/squish\/progress/.test(u) && net.mode === 'up') {
      if (m === 'OPTIONS') return r.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS' } });
      const h = r.headers();
      net.puts.push({ auth: /^Bearer [a-f0-9]{64}$/.test(h.authorization || ''), access: !!h['x-sq-access'], apikey: !!h.apikey, body: r.postData() });
      net.server = mergeWire(net.server, normalizeWire(JSON.parse(r.postData() || 'null')));
      return r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ ok: true, progress: net.server }) });
    }
    if (u.includes('/functions/v1/') || (u.includes('/rest/v1/') && !['GET', 'OPTIONS', 'HEAD'].includes(m))) { net.blocked.push(m + ' ' + u.split('?')[0]); return r.abort('failed'); }
    r.continue();
  });
  await page.evaluateOnNewDocument(s => { if (!sessionStorage.getItem('seeded')) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, seed);
  await page.goto(base, { waitUntil: 'load' });
  const H = { page,
    waitButtons: async (list, timeout = 60000) => { await page.waitForFunction(l => { const t = [...document.querySelectorAll('#home-screen button')].map(b => b.dataset.label); return l.every(x => t.some(y => y === x || y?.startsWith(x))) && !window.SquishGame.menu.busy; }, { timeout, polling: 200 }, list); await sleep(400); },
    press: l => page.$$eval('#home-screen button', (bs, l) => bs.find(b => b.dataset.label === l || b.dataset.label?.startsWith(l)).click(), l),
    state: () => page.evaluate(() => ({ ...window.SquishGame.state, campaign: window.SquishGame.campaign })),
    idle: (timeout = 60000) => page.waitForFunction(() => { const s = window.SquishGame?.state; return s && s.started && !s.busy && !s.booting; }, { timeout, polling: 100 }),
    sync: () => page.evaluate(() => ({ ...window.SquishGame.campaign.sync })),
  };
  H.mv = async ch => { const mm = Camp.decodeMove(ch); await page.evaluate(mm => window.SquishGame.move(mm.direction, mm.line), mm); await sleep(150); await H.idle(); };
  H.play = async n => {
    await H.press('Levelauswahl'); await page.waitForFunction(() => !document.getElementById('campaign-screen').hidden, { timeout: 15000 }); await sleep(300);
    await page.$eval(`#campaign-chapters button[data-level="${n}"]`, b => b.click());
    await page.waitForFunction(n => window.SquishGame.campaign.level === n && window.SquishGame.campaign.status === 'playing', { timeout: 30000, polling: 100 }, n);
    await H.idle(); await sleep(900);
  };
  H.solve = async lv => { for (const t of lv.solution.match(/[a-t]/g)) { await H.mv(t); if ((await H.state()).campaign.status !== 'playing') break; } };
  H.result = async () => { await page.waitForFunction(() => window.SquishGame.campaign.resultOpen, { timeout: 20000 }); await sleep(1500); return H.state(); };
  H.leave = async () => { await page.click('#campaign-menu').catch(() => {}); await sleep(600); await H.waitButtons(['Levelauswahl']).catch(() => {}); };
  return H;
}
const prog = n => ({ version: 1, levels: Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), { stars: 1, moves: 30, at: 1 }])), updatedAt: 1 });
const inv = { version: 3, extraMoves: 0, rocket: 0, hint: 1, wand: 0, gifts: ['level-3'], pending: [], at: 1000 };

try {
  // ---------- A: online (Attrappe) ----------
  const netA = { mode: 'up', puts: [], blocked: [], server: normalizeWire({ v: 1, epoch: 18, levels: { 1: { s: 3, m: 4 }, 4: { s: 2, m: 9 }, 5: { s: 1, m: 20 } },
    inv: { extraMoves: 2, rocket: 1, hint: 0, wand: 0, gifts: ['level-3', 'level-6'], pending: [] }, invAt: 5000 }) };
  const A = await newPage({ 'squish-campaign-v1': JSON.stringify(prog(3)), 'squish-campaign-tools-v1': JSON.stringify(inv), 'squish-save-token-v1': TOKEN, ...resets }, netA);
  await A.waitButtons(['Abenteuer', 'Endlos']);
  await A.page.waitForFunction(() => window.SquishGame.campaign.sync?.ok >= 1, { timeout: 20000, polling: 200 });
  let s = await A.state();
  const L = s.campaign.progress.levels;
  check('Start: ein Abgleich, Header (Token, Zugang, apikey) gesetzt', netA.puts.length === 1 && netA.puts[0].auth && netA.puts[0].access && netA.puts[0].apikey, JSON.stringify(netA.puts.map(p => ({ ...p, body: undefined }))));
  check('Server-Stand übernommen: L1 3★, L4/L5 da, L2/L3 bleiben', L['1']?.stars === 3 && L['4']?.stars === 2 && L['5']?.stars === 1 && L['2'] && L['3'], JSON.stringify(Object.keys(L)));
  check('Vorrat: neuerer Cloud-Vorrat übernommen, Geschenke vereinigt', s.campaign.inventory.extraMoves === 2 && s.campaign.inventory.rocket === 1 && s.campaign.inventory.gifts.includes('level-6'), JSON.stringify(s.campaign.inventory));
  check('Lokal gespeichert (localStorage)', await A.page.evaluate(() => JSON.parse(localStorage.getItem('squish-campaign-v1')).levels['4']?.stars === 2));
  await A.press('Abenteuer'); await A.waitButtons(['Levelauswahl']);
  await A.play(6); await A.solve(levels[5]); s = await A.result();
  check('L6 gewonnen', s.campaign.status === 'won' && s.campaign.progress.levels['6']?.stars >= 1, JSON.stringify(s.campaign.progress.levels['6']));
  await A.page.waitForFunction(() => window.SquishGame.campaign.sync?.ok >= 2, { timeout: 20000, polling: 200 }).catch(() => {});
  check('Nach dem Level: Ergebnis an den Server geschickt', netA.server.levels['6']?.s >= 1 && netA.puts.length >= 2, `puts ${netA.puts.length}`);
  await A.leave();
  const putsBefore = netA.puts.length;
  await A.page.reload({ waitUntil: 'load' }); await A.waitButtons(['Abenteuer']); await sleep(5000);
  check('Reload ohne Änderung: kein weiterer Aufruf', netA.puts.length === putsBefore, `${putsBefore} → ${netA.puts.length}`);
  s = await A.state();
  check('Reload: Fortschritt inkl. Cloud-Leveln erhalten', ['1', '4', '5', '6'].every(k => s.campaign.progress.levels[k]));
  await A.page.close();

  // ---------- B: Netzfehler → still; wieder online → nachgereicht ----------
  const netB = { mode: 'down', puts: [], blocked: [], server: null };
  const B = await newPage({ 'squish-campaign-v1': JSON.stringify(prog(0)), 'squish-campaign-tools-v1': JSON.stringify({ ...inv, at: 0 }), 'squish-save-token-v1': TOKEN, ...resets }, netB);
  await B.waitButtons(['Abenteuer']); await B.press('Abenteuer'); await B.waitButtons(['Levelauswahl']);
  await B.play(1); await B.solve(levels[0]); s = await B.result();
  await sleep(5500);
  const sb = await B.sync();
  const noteShown = await B.page.evaluate(() => { const n = document.getElementById('note'); return n && !n.hidden ? n.textContent : ''; });
  check('Netzfehler: Level trotzdem gewonnen + lokal gespeichert, Abgleich still gescheitert', s.campaign.status === 'won' && sb.failed >= 1 && sb.ok === 0 &&
    await B.page.evaluate(() => !!JSON.parse(localStorage.getItem('squish-campaign-v1')).levels['1']), JSON.stringify({ sb, noteShown }));
  netB.mode = 'up';
  await B.page.evaluate(() => window.dispatchEvent(new Event('online')));
  await B.page.waitForFunction(() => window.SquishGame.campaign.sync?.ok >= 1, { timeout: 15000, polling: 200 }).catch(() => {});
  check('Wieder online: Stand nachgereicht', netB.server?.levels['1']?.s >= 1, JSON.stringify(netB.server?.levels));
  await B.page.close();

  // ---------- C: echt offline (kein Netz) → kein Aufruf, kein Fehler ----------
  const netC = { mode: 'up', puts: [], blocked: [], server: null };
  const C = await newPage({ 'squish-campaign-v1': JSON.stringify(prog(0)), 'squish-campaign-tools-v1': JSON.stringify({ ...inv, at: 0 }), 'squish-save-token-v1': TOKEN, ...resets }, netC);
  await C.waitButtons(['Abenteuer']); await sleep(3500);
  const putsBoot = netC.puts.length;
  await C.page.setOfflineMode(true);
  await C.press('Abenteuer'); await C.waitButtons(['Levelauswahl']);
  await C.play(1); await C.solve(levels[0]); s = await C.result(); await sleep(5500);
  const sc = await C.sync();
  check('Offline: Level gewonnen, kein Abgleich versucht', s.campaign.status === 'won' && netC.puts.length === putsBoot && sc.skipped >= 1, JSON.stringify({ sc, puts: netC.puts.length }));
  await C.page.setOfflineMode(false);
  await C.page.close();
} catch (e) {
  check('Ablauf ohne Ausnahme', false, e.stack?.split('\n').slice(0, 3).join(' | '));
}
const relevant = errors.filter(e => !/favicon|ERR_ABORTED|ERR_INTERNET_DISCONNECTED|net::ERR_BLOCKED|ERR_FAILED|Failed to load resource/.test(e));
check('Keine JS-Fehler', relevant.length === 0, JSON.stringify(relevant.slice(0, 5)));
console.log(JSON.stringify({ viewport: tag, failed, total }));
await browser.close();
process.exit(failed ? 1 : 0);

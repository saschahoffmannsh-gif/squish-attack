// Live-Check launch-21: Bestenliste entfernt; dazu weiter launch-20-Grafikfixes (+3-Züge-Knopf, Levelauswahl-Rahmen), Level 1, Duell-Lobby (Server abgefangen), Endlos speichern + Reload, 0 fps in Ruhe, reduzierte Bewegung.
// Backend-Schreibzugriffe blockiert; Duell-Aufrufe mit Attrappe beantwortet (kein echter Raum). Kein api-check (keine Testzeile).
import { launch, sleep, IPHONE as IPHONE0, IPHONE_UA } from './lib.mjs';
const VP = (process.env.VP || '390x844').split('x').map(Number);
const IPHONE = { ...IPHONE0, width: VP[0], height: VP[1] };
console.log('Viewport', IPHONE.width + 'x' + IPHONE.height);
import { readFileSync } from 'node:fs';
import * as Camp from '/workspace/squish-campaign/game/campaign.mjs';
const levels = JSON.parse(readFileSync('/workspace/squish-campaign/levels/levels-001-100.json', 'utf8')).levels;
const lab = JSON.parse(readFileSync('/workspace/squish-campaign/levels/levels-lab.json', 'utf8')).levels;
const levels18 = readFileSync('/workspace/squish-campaign/levels/levels-001-100.json', 'utf8');
const base = process.argv[2] || ('https://saschahoffmannsh-gif.github.io/squish-attack/game/?t=' + Date.now());
let fail = 0; const ok = (n, c, x = '') => { if (!c) fail++; console.log(c ? 'OK  ' : 'FAIL', n, x); };
const browser = await launch();
async function newPage(reduced) {
  const page = await browser.newPage(); const errors = [], blocked = [], duel = [];
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
  await page.goto(base, { waitUntil: 'load' });
  return { page, errors, blocked, duel };
}
const H = page => ({
  waitBtn: (l, t = 60000) => page.waitForFunction(l => [...document.querySelectorAll('#home-screen button')].some(b => b.dataset.label === l || b.dataset.label.startsWith(l)) && !window.SquishGame.menu.busy, { timeout: t, polling: 200 }, l).then(() => sleep(400)),
  press: l => page.$$eval('#home-screen button', (bs, l) => bs.find(b => b.dataset.label === l || b.dataset.label.startsWith(l)).click(), l),
  idle: () => page.waitForFunction(() => { const s = window.SquishGame?.state; return s && s.started && !s.busy && !s.booting && !window.SquishGame.graphics.scene?.userData?.entryAnimation; }, { timeout: 90000, polling: 100 }),
  state: () => page.evaluate(() => ({ ...window.SquishGame.state, campaign: window.SquishGame.campaign })),
  rate: (ms = 3000) => page.evaluate(async ms => { const g = window.SquishGame.graphics; let n = 0; const orig = g.render; g.render = (...a) => { n++; return orig.apply(g, a); };
    await new Promise(r => setTimeout(r, ms)); g.render = orig; return +(n / (ms / 1000)).toFixed(1); }, ms),
});

// ---------- normaler Lauf ----------
if (!process.argv.includes("--only-levels")) 
{
  const { page, errors, blocked, duel } = await newPage(false); const h = H(page);
  await h.waitBtn('Endlos');
  ok('Build launch-21 (Einstellungen + Sound-Build)', /launch-21/.test(await page.evaluate(() => document.getElementById('settings-build')?.textContent || '')) && await page.evaluate(() => window.SquishGame.sound.build) === 'launch-21');
  const resList = await page.evaluate(() => performance.getEntriesByType('resource').map(r => r.name));
  // geänderte Dateien in launch-21: geladene müssen ?v=launch-21 tragen (build.txt hat ?t=)
  const changed = (await import('node:child_process')).execSync('git -C /workspace/squish-l21 diff --name-only 76411cb HEAD -- game').toString().trim().split('\n').filter(f => /\.(mjs|js|css|json|html)$/.test(f));
  const loaded = changed.map(f => ({ f, urls: resList.filter(u => new URL(u).pathname.endsWith('/' + f)) })).filter(x => x.urls.length);
  const stale = loaded.filter(x => !x.urls.every(u => /build\.txt/.test(u) || /[?&]v=launch-21/.test(u))).map(x => x.urls[0]);
  ok(`Geänderte Dateien mit ?v=launch-21 geladen (${loaded.length} von ${changed.length} geändert beim Start geladen)`, loaded.length >= 4 && stale.length === 0, JSON.stringify({changed, loaded: loaded.map(x=>x.f), stale: stale.slice(0, 6)}));
  ok("levels-001-100.json geladen", resList.some(u => /levels-001-100.json\?v=launch-21/.test(u)));
  await sleep(1500);
  ok('Menü in Ruhe: 0 Renders/s (3D pausiert)', (await h.rate()) === 0);
  const noLb = async where => page.evaluate(() => ({ btn: [...document.querySelectorAll('button,a,[data-label]')].filter(b => /bestenliste|rangliste|leaderboard/i.test((b.textContent || '') + ' ' + (b.dataset?.label || '') + ' ' + (b.getAttribute('aria-label') || ''))).length,
    screen: !!document.getElementById('board-screen') || !!document.querySelector('[class*=leaderboard]'), text: /Bestenliste/i.test(document.body.innerText), html: /Bestenliste|leaderboard/i.test(document.body.innerHTML),
    name: [...document.querySelectorAll('input')].filter(i => /name|spitz/i.test(i.id + i.name + i.placeholder + (i.getAttribute('aria-label') || ''))).length }));
  const lb0 = await noLb();
  ok('Keine Bestenliste im Startmenü (kein Knopf, kein Bildschirm, kein Namensfeld, nicht im DOM)', !lb0.btn && !lb0.screen && !lb0.text && !lb0.html && !lb0.name, JSON.stringify(lb0));
  ok('leaderboard.mjs/names.mjs nicht geladen', !resList.some(u => /leaderboard|names\.mjs/.test(u)));

  // Grafikfixes launch-21: Levelauswahl-Rahmen + „+3 Züge (Werbung)“-Knopf
  await h.press('Abenteuer'); await h.waitBtn('Levelauswahl');
  await h.press('Levelauswahl'); await page.waitForFunction(() => !document.getElementById('campaign-screen').hidden, { timeout: 15000 }); await sleep(400);
  const sel = await page.evaluate(() => {
    const box = el => { const r = el.getBoundingClientRect(); return { top:r.top,left:r.left,bottom:r.bottom,right:r.right,width:r.width,height:r.height }; };
    const inside = (a,b,t=2) => a.left>=b.left-t && a.right<=b.right+t && a.top>=b.top-t && a.bottom<=b.bottom+t;
    const vis = el => {
      let r = el.getBoundingClientRect();
      for (let n=el.parentElement; n && n!==document.documentElement; n=n.parentElement) {
        const st=getComputedStyle(n);
        if (/(auto|scroll|hidden|clip|overlay)/.test(st.overflowY)||/(auto|scroll|hidden|clip|overlay)/.test(st.overflowX)) {
          const c=n.getBoundingClientRect();
          r={top:Math.max(r.top,c.top),left:Math.max(r.left,c.left),bottom:Math.min(r.bottom,c.bottom),right:Math.min(r.right,c.right)};
        }
      }
      r={top:Math.max(r.top,0),left:Math.max(r.left,0),bottom:Math.min(r.bottom,innerHeight),right:Math.min(r.right,innerWidth)};
      return {...r,width:r.right-r.left,height:r.bottom-r.top};
    };
    const panel=document.getElementById('campaign-panel'), chapters=document.getElementById('campaign-chapters');
    const p=box(panel), ch=box(chapters), oy=getComputedStyle(chapters).overflowY;
    let outside=0;
    for (const el of chapters.querySelectorAll('.campaign-chapter h3, .campaign-level-btn')) {
      const v=vis(el); if (v.width<2||v.height<2) continue; if (!inside(v,p,2)) outside++;
    }
    chapters.scrollTop=chapters.scrollHeight;
    return {chaptersInside:inside(ch,p,2), overflowY:oy, scrollable:chapters.scrollHeight>chapters.clientHeight+4, outside, chapterCount:chapters.querySelectorAll('.campaign-chapter').length, scrollH:chapters.scrollHeight, clientH:chapters.clientHeight};
  });
  // after evaluate scroll already at bottom — check kap 10
  const selBottom = await page.evaluate(() => {
    const box = el => { const r = el.getBoundingClientRect(); return { top:r.top,left:r.left,bottom:r.bottom,right:r.right,width:r.width,height:r.height }; };
    const inside = (a,b,t=2) => a.width>0 && a.height>0 && a.left>=b.left-t && a.right<=b.right+t && a.top>=b.top-t && a.bottom<=b.bottom+t;
    const vis = el => {
      let r = el.getBoundingClientRect();
      for (let n=el.parentElement; n && n!==document.documentElement; n=n.parentElement) {
        const st=getComputedStyle(n);
        if (/(auto|scroll|hidden|clip|overlay)/.test(st.overflowY)||/(auto|scroll|hidden|clip|overlay)/.test(st.overflowX)) {
          const c=n.getBoundingClientRect();
          r={top:Math.max(r.top,c.top),left:Math.max(r.left,c.left),bottom:Math.min(r.bottom,c.bottom),right:Math.min(r.right,c.right)};
        }
      }
      r={top:Math.max(r.top,0),left:Math.max(r.left,0),bottom:Math.min(r.bottom,innerHeight),right:Math.min(r.right,innerWidth)};
      return {...r,width:r.right-r.left,height:r.bottom-r.top};
    };
    const p=box(document.getElementById('campaign-panel'));
    let outside=0, visibleKap10=false;
    for (const el of document.querySelectorAll('#campaign-chapters .campaign-chapter h3, #campaign-chapters .campaign-level-btn')) {
      const v=vis(el); if (v.width<2||v.height<2) continue;
      if ((el.textContent||'').includes('Kapitel 10')||el.dataset.level==='100') visibleKap10=true;
      if (!inside(v,p,2)) outside++;
    }
    return {outside, visibleKap10};
  });
  ok('Levelauswahl: Kapitel-Liste liegt im Goldrahmen und scrollt innen', sel.chaptersInside && /auto|scroll|overlay/.test(sel.overflowY) && sel.scrollable && sel.outside===0 && sel.chapterCount===10, JSON.stringify(sel));
  ok('Levelauswahl nach Scroll: Kapitel 10 im Rahmen', selBottom.visibleKap10 && selBottom.outside===0, JSON.stringify(selBottom));
  await page.click('#campaign-close'); await page.waitForFunction(() => document.getElementById('campaign-screen').hidden, { timeout: 8000 }); await sleep(200);
  await page.$$eval('#home-screen button', bs => bs.find(b => (b.dataset.label||'').startsWith('Level 1'))?.click());
  await h.idle(); await sleep(600);
  const extraGeom = await page.evaluate(() => {
    const result=document.getElementById('campaign-result'), panel=result.querySelector('.aw-panel'), extra=document.getElementById('campaign-extra');
    const next=document.getElementById('campaign-next'), retry=document.getElementById('campaign-retry'), pair=document.getElementById('campaign-result-pair');
    result.hidden=false; result.dataset.outcome='lost';
    document.getElementById('campaign-result-title').textContent='Keine Züge mehr';
    document.getElementById('campaign-result-stars').hidden=true;
    next.hidden=true; extra.hidden=false; extra.dataset.refill='ad';
    const lab=extra.querySelector('.aw-label>span'); if (lab) lab.textContent='+3 Züge (Werbung)';
    retry.classList.remove('aw-big','aw-green'); retry.classList.add('aw-purple'); pair.append(retry); pair.classList.remove('is-single');
    const box=el=>{const r=el.getBoundingClientRect();return {top:r.top,left:r.left,bottom:r.bottom,right:r.right,width:r.width,height:r.height};};
    const p=box(panel), b=box(extra), lb=lab?box(extra.querySelector('.aw-label')):null;
    const ico=extra.querySelector('.aw-ico'), st=ico&&getComputedStyle(ico);
    const iconVisible=!!(ico && st.display!=='none' && st.visibility!=='hidden' && parseFloat(st.width)>0);
    const label=(lab?.textContent||'').replace(/\s+/g,' ').trim();
    const contentRight=Math.max(b.right, lb?lb.right:0), contentLeft=Math.min(b.left, lb?lb.left:b.left);
    const fits=contentLeft>=p.left-0.5 && contentRight<=p.right+0.5 && b.top>=p.top-0.5 && b.bottom<=p.bottom+8 && contentRight<=innerWidth+0.5;
    result.hidden=true;
    return {fits,label,iconVisible,font:getComputedStyle(extra).fontSize,p,b};
  });
  ok('„Keine Züge mehr“: +3-Züge-Knopf im Dialog, ein Plus, „+3 Züge (Werbung)“', extraGeom.fits && extraGeom.label==='+3 Züge (Werbung)' && !extraGeom.iconVisible, JSON.stringify(extraGeom));
  await page.click('#pause').catch(()=>{}); await sleep(200);
  await page.click('#to-menu').catch(()=>{});
  await h.waitBtn('Zurück').catch(async()=>{ await page.evaluate(()=>window.SquishGame.menu.open?.({screen:'home'})); });
  await sleep(400);
  if (await page.$$eval('#home-screen button', bs => bs.some(b => b.dataset.label==='Zurück'))) { await page.$$eval('#home-screen button', bs => bs.find(b => b.dataset.label==='Zurück')?.click()); await sleep(500); }
  await h.waitBtn('Endlos');

  // Duell-Lobby
  await h.press('2 Spieler');
  await page.waitForFunction(() => !document.getElementById('duel-screen').hidden && document.getElementById('duel-code').textContent === '482915', { timeout: 15000 }).catch(() => {});
  ok('Duell-Lobby öffnet mit Code (Server abgefangen)', await page.evaluate(() => !document.getElementById('duel-screen').hidden && document.getElementById('duel-code').textContent === '482915'), JSON.stringify(duel));
  await page.click('#duel-close'); await page.waitForFunction(() => document.getElementById('duel-screen').hidden, { timeout: 10000 }); await sleep(400);
  ok('Lobby schließen → Startbildschirm', await page.$$eval('#home-screen button', bs => bs.some(b => b.dataset.label === 'Endlos')), JSON.stringify(duel));
  // Level 1
  await h.press('Abenteuer'); await h.waitBtn('Level 1');
  await h.press('Level 1'); await h.idle(); await sleep(800);
  for (const ch of levels[0].solution) { const m = Camp.decodeMove(ch); await page.evaluate(m => window.SquishGame.move(m.direction, m.line), m); await sleep(150); }
  await page.waitForFunction(() => window.SquishGame.campaign.resultOpen, { timeout: 20000 }); await sleep(2500);
  const res = await page.evaluate(() => ({ title: document.getElementById('campaign-result-title').textContent, stars: document.querySelectorAll('#campaign-result-stars .is-earned').length }));
  ok('Level 1 gewonnen, 3 Sterne', /geschafft|Perfekt/.test(res.title) && res.stars === 3, JSON.stringify(res));
  ok('Werkzeug-Protokoll: Sieg Level 1 lokal gespeichert', await page.evaluate(() => { const l = JSON.parse(localStorage.getItem('squish-tool-log-v1')); return l.attempts.some(a => a.level === 1 && a.outcome === 'won'); }));
  await page.click('#campaign-menu'); await sleep(1200);
  await page.evaluate(() => window.SquishGame.menu.open?.({ screen: 'home' })).catch(() => {});
  await sleep(600);
  if (!(await page.$$eval('#home-screen button', bs => bs.some(b => b.dataset.label === 'Endlos')))) { await page.$$eval('#home-screen button', bs => bs.find(b => b.dataset.label === 'Zurück')?.click()); await sleep(600); }
  // Abenteuer-Level live identisch zu launch-15/16
  const liveLevels = await page.evaluate(async () => { const r = await fetch(new URL('../levels/levels-001-100.json?v=launch-19&x=' + Date.now(), location.href), { cache: 'no-store' }); return r.text(); });
  ok('Abenteuer-Level live byte-gleich mit launch-18 (unverändert) (lokal)', liveLevels === levels18, `${liveLevels.length}/${levels18.length}`);
  // Test-Level: Regeln → Neue Squishes testen
  await h.waitBtn('Regeln'); await h.press('Regeln'); await h.waitBtn('Neue Squishes testen');
  ok('Regeln erklären die neuen Squishes', /Eis-Squish/.test(await page.$eval('#home-screen .aw-rules', e => e.textContent)) && /Schloss-Symbol/.test(await page.$eval('#home-screen .aw-rules', e => e.textContent)) && /Bomben-Squish/.test(await page.$eval('#home-screen .aw-rules', e => e.textContent)));
  await h.press('Neue Squishes testen');
  await page.waitForFunction(() => window.SquishGame.campaign.lab && window.SquishGame.campaign.status === 'playing', { timeout: 30000 }); await h.idle(); await sleep(900);
  const progBefore = JSON.stringify((await h.state()).campaign.progress.levels);
  for (let i = 0; i < 3; i++) {
    const c = (await h.state()).campaign;
    const kind = ['ice', 'bound', 'bomb'][i], sp = c.specials.find(x => x.kind === kind);
    const look = sp ? await page.evaluate(id => { const t = window.SquishGame.graphics.getTile(id); return t.special + ':' + !!t.specialDecor; }, sp.id) : null;
    ok(`Test ${i + 1}: ${kind} auf dem Brett mit Comic-Deko`, look === kind + ':true', look);
    if (kind === 'bomb') ok('Bombe: Abzeichen 20, Uhr wartet auf ersten Zug', c.bombBadges[0] === '20' && !c.bombClock);
    if (i < 2) { await sleep(1500); ok(`Test ${i + 1} in Ruhe: 0 Renders/s`, (await h.rate()) === 0); }
    for (const ch of lab[i].solution) { const m = Camp.decodeMove(ch); await page.evaluate(m => window.SquishGame.move(m.direction, m.line), m); await sleep(200); await h.idle(); }
    if (kind === 'bomb') { const b = (await h.state()).campaign; ok('Bombe: Countdown lief, Level gewonnen', b.bombClock && b.status === 'won', JSON.stringify({ ms: b.bombMs, st: b.status })); }
    await page.waitForFunction(() => window.SquishGame.campaign.resultOpen, { timeout: 20000 }); await sleep(1800);
    ok(`Test ${i + 1} gewonnen, 3★`, await page.$eval('#campaign-result-stars', e => e.dataset.stars) === '3');
    if (i < 2) { await page.click('#campaign-next'); await page.waitForFunction(() => !window.SquishGame.campaign.resultOpen && window.SquishGame.campaign.status === 'playing', { timeout: 20000 }); await h.idle(); await sleep(1200); }
  }
  ok('Test-Level speichern keinen Abenteuer-Fortschritt', JSON.stringify((await h.state()).campaign.progress.levels) === progBefore);
  await page.click('#campaign-menu'); await sleep(1200);
  await page.evaluate(() => window.SquishGame.menu.open?.({ screen: 'home' })).catch(() => {});
  await sleep(600);
  if (!(await page.$$eval('#home-screen button', bs => bs.some(b => b.dataset.label === 'Endlos')))) { await page.$$eval('#home-screen button', bs => bs.find(b => b.dataset.label === 'Zurück')?.click()); await sleep(600); }
  // Endlos: neues Spiel, Züge, Reload, Weiterspielen
  await h.waitBtn('Endlos'); await h.press('Endlos'); await h.waitBtn('Neues Spiel'); await h.press('Neues Spiel'); await h.idle(); await sleep(800);
  for (let i = 0; i < 10; i++) { await page.evaluate(i => window.SquishGame.move(['left', 'up', 'right', 'down'][i % 4], (i * 2) % 5), i); await sleep(250); await h.idle(); }
  await sleep(1500);
  const before = await h.state();
  ok('Endlos: Züge gespielt', before.moves >= 5 && !before.campaign.mode, `Züge ${before.moves}, Punkte ${before.score}`);
  const r1 = await h.rate(); await sleep(8000); const r2 = await h.rate();
  const dbg = await page.evaluate(() => ({ best: window.SquishGame.state.bestTile, fx: Object.keys(window.SquishGame.effects || {}), ud: Object.keys(window.SquishGame.graphics.scene?.userData || {}), act: window.SquishGame.graphics.activeReasons?.() ?? window.SquishGame.graphics.debugActive?.() }));
  console.log('rates', r1, r2, JSON.stringify(dbg));
  ok('Endlos in Ruhe: 0 Renders/s', r2 === 0, `${r1} → ${r2}`);
  const savedBefore = await page.evaluate(() => Object.keys(localStorage).filter(k => /squish/.test(k)));
  await page.reload({ waitUntil: 'load' });
  await h.waitBtn('Endlos'); await h.press('Endlos'); await h.waitBtn('Weiterspielen');
  ok('Nach Reload: „Weiterspielen“ angeboten', true);
  await h.press('Weiterspielen'); await h.idle(); await sleep(800);
  const after = await h.state();
  const sameBoard = JSON.stringify(after.board.map(r => r.map(t => t?.value ?? 0))) === JSON.stringify(before.board.map(r => r.map(t => t?.value ?? 0)));
  ok('Endlos-Spielstand nach Reload erhalten (Punkte, Züge, Brett)', after.score === before.score && after.moves === before.moves && sameBoard && !after.campaign.mode, `${before.score}/${before.moves} → ${after.score}/${after.moves} Brett ${sameBoard}`);
  { await h.press('Endlos').catch(() => {}); await sleep(600); const lb1 = await noLb(); ok('Keine Bestenliste im Endlos-Menü', !lb1.btn && !lb1.text && !lb1.name, JSON.stringify(lb1)); }
  const scoreCalls = [...new Set(blocked)].filter(u => /leaderboard|\/score|\/run\b|\/ticket/i.test(u));
  ok('Keine Punkte-/Bestenlisten-Anfragen ans Backend', scoreCalls.length === 0, JSON.stringify(scoreCalls));
  ok('Keine JS-Fehler (normal)', errors.length === 0, JSON.stringify(errors.slice(0, 4)));
  console.log('Blockiert:', JSON.stringify([...new Set(blocked)]), 'Speicher-Schlüssel:', JSON.stringify(savedBefore));
  await page.close();
}
// ---------- Level 11 und 50 (Fortschritt lokal vorbelegt) ----------
{
  const { page, errors } = await newPage(false); const h = H(page);
  await h.waitBtn('Endlos');
  const prog = { version: 1, levels: Object.fromEntries(Array.from({ length: 49 }, (_, i) => [String(i + 1), { stars: 3, moves: 5, at: 1 }])), updatedAt: 1 };
  await page.evaluate(p => { localStorage.setItem('squish-campaign-v1', JSON.stringify(p)); localStorage.setItem('squish-campaign-tools-reset', 'launch-13'); localStorage.setItem('squish-campaign-progress-reset', 'launch-14'); localStorage.setItem('squish-campaign-stars-reset', 'launch-18'); }, prog);
  await page.reload({ waitUntil: 'load' }); await h.waitBtn('Endlos');
  for (const n of [11, 50]) {
    if (!(await page.$$eval('#home-screen button', bs => bs.some(b => b.dataset.label === 'Levelauswahl')))) { await h.press('Abenteuer'); await h.waitBtn('Levelauswahl'); }
    await h.press('Levelauswahl'); await page.waitForFunction(() => !document.getElementById('campaign-screen').hidden, { timeout: 15000 }); await sleep(300);
    await page.$eval(`#campaign-chapters button[data-level="${n}"]`, b => b.click());
    await page.waitForFunction(n => window.SquishGame.campaign.level === n && window.SquishGame.campaign.status === 'playing', { timeout: 30000, polling: 100 }, n);
    await h.idle(); await sleep(800);
    const lv = levels[n - 1]; const sol = n === 11 ? lv.solution : lv.solution.slice(0, 4);
    for (const ch of sol) { const m = Camp.decodeMove(ch); await page.evaluate(m => window.SquishGame.move(m.direction, m.line), m); await sleep(150); await h.idle(); }
    const st = await h.state();
    if (n === 11) { await page.waitForFunction(() => window.SquishGame.campaign.resultOpen, { timeout: 20000 }); ok('Level 11 lädt, Lösung gewinnt', (await h.state()).campaign.status === 'won'); await page.click('#campaign-menu'); await sleep(1200); }
    else ok(`Level 50 lädt (${lv.moves} Züge) und ist spielbar`, st.campaign.status === 'playing' && st.moves === 4, JSON.stringify({ st: st.campaign.status, mv: st.moves }));
    await page.evaluate(() => window.SquishGame.menu.open?.({ screen: 'home' })).catch(() => {}); await sleep(600);
    if (!(await page.$$eval('#home-screen button', bs => bs.some(b => b.dataset.label === 'Levelauswahl' || b.dataset.label === 'Abenteuer')))) { await page.$$eval('#home-screen button', bs => bs.find(b => b.dataset.label === 'Zurück')?.click()); await sleep(600); }
  }
  ok('Keine JS-Fehler (Level 11/50)', errors.length === 0, JSON.stringify(errors.slice(0, 4)));
  await page.close();
}
// ---------- reduzierte Bewegung ----------
{
  const { page, errors } = await newPage(true); const h = H(page);
  await h.waitBtn('Endlos');
  ok('Reduzierte Bewegung aktiv', await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches));
  await h.press('Endlos'); await h.waitBtn('Neues Spiel'); await h.press('Neues Spiel'); await h.idle(); await sleep(600);
  const m0 = (await h.state()).moves;
  for (let i = 0; i < 4; i++) { await page.evaluate(i => window.SquishGame.move(['left', 'up', 'right', 'down'][i % 4], (i * 3) % 5), i); await sleep(200); await h.idle(); }
  ok('Reduzierte Bewegung: Züge laufen', (await h.state()).moves > m0);
  await sleep(1500);
  const q1 = await h.rate(); await sleep(8000); const q2 = await h.rate();
  ok('Reduzierte Bewegung: 0 Renders/s in Ruhe', q2 === 0, `${q1} → ${q2}`);
  await page.click('#pause'); await sleep(300); await page.click('#to-menu'); await h.waitBtn('Zurück'); await h.press('Zurück'); await h.waitBtn('Abenteuer');
  await h.press('Abenteuer'); await h.waitBtn('Level');
  await page.$$eval('#home-screen button', bs => bs.find(b => /^Level \d+ spielen/.test(b.dataset.label || ''))?.click()); await h.idle(); await sleep(600);
  await page.click('#tool-hint'); await sleep(400);
  ok('Reduzierte Bewegung: Werbe-Dialog ohne Animation', await page.$eval('#ad-dialog .ad-panel', e => getComputedStyle(e).animationName === 'none').catch(() => false));
  await page.click('#ad-dialog .ad-later').catch(() => {});
  ok('Keine JS-Fehler (reduziert)', errors.length === 0, JSON.stringify(errors.slice(0, 4)));
}
await browser.close(); console.log(JSON.stringify({ fail })); process.exit(fail ? 1 : 0);

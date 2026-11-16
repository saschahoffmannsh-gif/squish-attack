// Headless iPhone previews (390x844, dpr 3) of the new special-squish art.
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {extname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import puppeteer from '/workspace/squish-e2e/campaign/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const OUT = process.env.OUT || '/workspace/squish-art-preview/v2';
const PORT = Number(process.env.PORT || 8891);
const IPHONE = {width:390, height:844, deviceScaleFactor:3, isMobile:true, hasTouch:true};
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const MIME = {'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.woff2':'font/woff2','.svg':'image/svg+xml','.txt':'text/plain'};
const sleep = ms => new Promise(r => setTimeout(r, ms));

function serve(root, port) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      let file = join(root, decodeURIComponent(url.pathname));
      if (file.endsWith('/')) file = join(file, 'index.html');
      const data = await readFile(file);
      res.writeHead(200, {'Content-Type':MIME[extname(file)]||'application/octet-stream', 'Cache-Control':'no-store'});
      res.end(data);
    } catch {
      res.writeHead(404); res.end('not found');
    }
  });
  return new Promise((resolve, reject) => server.listen(port, '127.0.0.1', () => resolve(server)).on('error', reject));
}

const errors = [];
const browser = await puppeteer.launch({
  executablePath:'/usr/bin/google-chrome', headless:'new',
  args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required','--mute-audio'],
});
const server = await serve(ROOT, PORT);
await mkdir(OUT, {recursive:true});
const page = await browser.newPage();
page.on('pageerror', e => errors.push('pageerror: '+e.message));
page.on('console', m => { if (m.type()==='error') errors.push('console: '+m.text()); });
await page.setViewport(IPHONE);
await page.setUserAgent(UA);
await page.evaluateOnNewDocument(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });

async function waitReady() {
  await page.waitForFunction(() => [...document.querySelectorAll('#home-screen button')].length >= 3 && window.SquishGame?.menu && !window.SquishGame.menu.busy, {timeout:90000});
  await sleep(400);
}
async function startLab(n) {
  await page.evaluate(async n => {
    const app = await import(new URL('game.mjs?v=launch-21', location.href).href);
    await app.menuActions.world.play({campaign:n, lab:true});
  }, n);
  await page.waitForFunction(() => window.SquishGame?.campaign?.lab && window.SquishGame.campaign.status === 'playing' && !window.SquishGame.state.busy, {timeout:60000});
  await sleep(1800);
  await page.evaluate(() => { const n = document.getElementById('note'); if (n) { n.hidden = true; n.textContent = ''; } });
  await sleep(400);
}
async function startEndlessDemo(board) {
  // vfxdemo hook is installed only when the page is opened with ?vfxdemo=1
  await page.evaluateOnNewDocument(() => {}); // no-op; hook comes from the URL
}

// 1) Test page, lab level 4 ("Alles zusammen") – all three types on the board.
await page.goto(`http://127.0.0.1:${PORT}/game/`, {waitUntil:'load', timeout:90000});
console.log('loaded', page.url(), 'title', await page.title());
try { await waitReady(); }
catch (e) {
  const info = await page.evaluate(() => ({
    buttons:[...document.querySelectorAll('#home-screen button')].map(b=>b.dataset.label||b.textContent.slice(0,40)),
    hasGame:!!window.SquishGame,
    menu:window.SquishGame?.menu||null,
    body:document.body?.innerText?.slice(0,400),
  })).catch(err=>({evalError:String(err)}));
  console.log('waitReady failed', JSON.stringify(info), 'errors', errors);
  throw e;
}
await startLab(4);
const specials = await page.evaluate(() => window.SquishGame.campaign.specials);
const shot1 = join(OUT, '01-test-page-lab4.png');
await page.screenshot({path:shot1, type:'png'});
console.log('lab4 specials', JSON.stringify(specials));
console.log('wrote', shot1);

// 2) Close-up strip of ice, lock, bomb cropped from the test board (plus a staged row).
const cells = await page.evaluate(() => {
  const list = window.SquishGame.campaign.specials || [];
  const host = document.getElementById('graphics')?.getBoundingClientRect();
  const by = {};
  for (const s of list) {
    if (by[s.kind]) continue; // first of each kind
    const p = window.SquishGame.cellPoint(s.r, s.c);
    by[s.kind] = {kind:s.kind, r:s.r, c:s.c, value:s.value, x:p.x, y:p.y, host:{x:host.x, y:host.y, w:host.width, h:host.height}};
  }
  return by;
});
console.log('cells', JSON.stringify(cells));

// Estimate tile size from board width / 5, then crop with padding.
const raw = await page.screenshot({type:'png', encoding:'binary'});
await writeFile(join(OUT, '_lab4-full.png'), raw);

// Staged close-up: reopen with vfxdemo, three specials in a row, then a freed row.
await page.goto(`http://127.0.0.1:${PORT}/game/?vfxdemo=1`, {waitUntil:'load', timeout:90000});
await waitReady();
await page.evaluate(async () => {
  const btn = [...document.querySelectorAll('#home-screen button')].find(b => b.dataset.label === 'Endlos');
  btn?.click();
});
await sleep(500);
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('#home-screen button')].find(b => b.dataset.label === 'Neues Spiel' || b.dataset.label === 'Endlos spielen' || b.dataset.label === 'Spielen');
  if (btn) btn.click();
  else {
    // Some builds go Endlos → Neues Spiel / Weiterspielen
    const btns = [...document.querySelectorAll('#home-screen button')].map(b => b.dataset.label);
    console.error('endless buttons', btns.join(','));
  }
});
await page.waitForFunction(() => window.SquishGame?.state?.started && !window.SquishGame.state.busy && window.SquishVFX, {timeout:60000}).catch(async () => {
  const labels = await page.$$eval('#home-screen button', bs => bs.map(b => b.dataset.label||b.textContent));
  console.log('buttons after Endlos', labels);
  throw new Error('endless did not start');
});
await sleep(1200);
await page.evaluate(() => {
  window.SquishVFX.setBoard([
    [null, null, null, null, null],
    [{value:4, ice:true}, {value:4, bound:true}, {value:4, bomb:20000}, 4, null],
    [null, null, null, null, null],
    [null, null, null, null, null],
    [null, null, null, null, null],
  ]);
  const n = document.getElementById('note'); if (n) { n.hidden = true; n.textContent = ''; }
});
await sleep(2000);
const shotDemo = join(OUT, '03-frozen-vs-freed.png');
await page.screenshot({path:shotDemo, type:'png'});
console.log('wrote', shotDemo);

const rowCells = await page.evaluate(() => {
  const host = document.getElementById('graphics').getBoundingClientRect();
  const pts = [];
  for (const [r, cols] of [[1, [0, 1, 2]], [2, [0, 1, 2]]]) {
    for (const c of cols) {
      const p = window.SquishGame.cellPoint(r, c);
      pts.push({r, c, x:p.x, y:p.y});
    }
  }
  return {host:{x:host.x, y:host.y, w:host.width, h:host.height}, pts};
});
await writeFile(join(OUT, '_cells.json'), JSON.stringify({specials, cells, rowCells}, null, 2));

console.log('errors', JSON.stringify(errors));
await browser.close();
server.close();

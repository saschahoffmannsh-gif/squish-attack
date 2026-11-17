// Offline-Cache für das Web-Spiel (Scope: game/). Registriert von sw-register.mjs, nie in der App-Hülle.
// Version kommt aus der Register-URL (offline-sw.js?v=launch-NN): neue Version → neuer Cache, alte Caches weg.
// - Navigation (index.html): erst Netz (max. 4 s), sonst Cache → Spiel startet auch ohne Internet.
// - Dateien mit ?v=…: Cache zuerst (pro Build unveränderlich).
// - Andere eigene Dateien (Level, Bilder ohne Tag): erst Netz, sonst Cache.
// - Fremde Adressen (Supabase usw.), Nicht-GET und ?t=… (build.txt-Check) laufen unverändert durchs Netz.
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = 'squish-game-' + VERSION;
const PREFIX = 'squish-game-';
const SCOPE = new URL('./', self.location.href).href;          // …/game/
const SITE = new URL('../', self.location.href).href;          // …/squish-attack/
const INDEX = new URL('index.html', SCOPE).href;
const ASSET = /^(?:\.{1,2}\/|\/)?[\w@%+.\-\/]+\.(?:mjs|js|css|json|png|webp|svg|jpe?g|gif|woff2?|ttf|otf|mp3|ogg|wav|m4a|webmanifest)(?:\?v=[\w.\-]+)?$/i;
const MAX_FILES = 800;

const sameSite = u => u.startsWith(SITE);
const isText = u => /\.(?:html|mjs|js|css|webmanifest)(?:\?|$)/i.test(u);

/** Alle referenzierten eigenen Dateien ab index.html einsammeln (HTML, Module, CSS) – pflegt sich selbst. */
function refsOf(text, base) {
  const out = new Set();
  const add = s => { if (!s || !ASSET.test(s)) return; try { const u = new URL(s, base).href; if (sameSite(u)) out.add(u); } catch {} };
  for (const m of text.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)) add(m[1]);
  for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) add(m[1]);
  for (const m of text.matchAll(/["'`]([^"'`\s$]+?)["'`]/g)) add(m[1]);
  return out;
}

async function precache() {
  const cache = await caches.open(CACHE);
  const seen = new Set(), queue = [INDEX];
  while (queue.length && seen.size < MAX_FILES) {
    const url = queue.shift();
    if (seen.has(url)) continue; seen.add(url);
    try {
      const res = await fetch(url, { cache: 'reload', credentials: 'same-origin' });
      if (!res.ok) continue;
      await cache.put(url === INDEX ? INDEX : url, res.clone());
      if (isText(url)) for (const r of refsOf(await res.text(), url)) if (!seen.has(r)) queue.push(r);
    } catch {}
  }
}

self.addEventListener('install', event => {
  event.waitUntil(precache().catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try { for (const k of await caches.keys()) if (k.startsWith(PREFIX) && k !== CACHE) await caches.delete(k); } catch {}
    await self.clients.claim();
  })());
});

const timeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

async function fromCache(req, opts) {
  for (const k of await caches.keys()) {
    if (!k.startsWith(PREFIX)) continue;
    const hit = await (await caches.open(k)).match(req, opts);
    if (hit) return hit;
  }
  return null;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!sameSite(url.href) || url.searchParams.has('t')) return;
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await timeout(fetch(req), 4000);
        if (res.ok && url.href.startsWith(SCOPE)) { const c = await caches.open(CACHE); await c.put(INDEX, res.clone()); }
        return res;
      } catch {
        return (await fromCache(INDEX)) || (await fromCache(req, { ignoreSearch: true })) || Response.error();
      }
    })());
    return;
  }
  if (url.searchParams.has('v')) {
    event.respondWith((async () => {
      const hit = await fromCache(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) { const c = await caches.open(CACHE); await c.put(req, res.clone()); }
      return res;
    })());
    return;
  }
  event.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok) { const c = await caches.open(CACHE); await c.put(req, res.clone()); }
      return res;
    } catch {
      return (await fromCache(req)) || (await fromCache(req, { ignoreSearch: true })) || Response.error();
    }
  })());
});

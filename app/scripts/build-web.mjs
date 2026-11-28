#!/usr/bin/env node
// Baut den Web-Ordner der App (app/www) aus dem unveränderten Spiel im Repo.
// - kopiert index.html, game/, levels/, squish/ (keine lab/, tools/, tests/, docs/, sw.js)
// - legt die App-Brücke (app/src) nach www/game/app/ und setzt die Build-Kennung ein
// - ändert NUR die Kopie von game/index.html: App-Viewport (kein Zoom), app.css, native-boot
//   statt loading-screen (native-boot stellt zuerst den Spieler-Token aus dem Schlüsselbund her),
//   und ein frühes Inline-Skript, das requestFullscreen im WKWebView abschaltet
// Alles bleibt relativ und lokal: kein Code aus dem Netz (App-Store-Richtlinie 2.5.2).
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(APP, '..');
const WWW = join(APP, 'www');
const COPY = ['index.html', 'game', 'levels', 'squish'];
const SKIP = new Set(['.DS_Store']);

export const ROOT_INDEX = `<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
    <title>Squish Attack</title>
    <style>html,body{margin:0;height:100%;background:#08080a}</style>
    <script>location.replace("game/index.html");</script>
  </head>
  <body></body>
</html>
`;

export function buildId(root = ROOT) {
  return readFileSync(join(root, 'game', 'build.txt'), 'utf8').trim();
}

/** Frühes Inline-Skript (App-Kopie von index.html): Fullscreen-API aus, bevor Module laufen. */
export const FULLSCREEN_STUB_SCRIPT = `<script data-app-no-fullscreen>
(function(){
  function n(){return Promise.resolve()}
  try{var p=Element.prototype;p.requestFullscreen=n;p.webkitRequestFullscreen=n;p.webkitRequestFullScreen=n}catch(e){}
  function hide(k,v){try{Object.defineProperty(Document.prototype,k,{configurable:true,get:function(){return v}})}catch(e){}}
  hide('fullscreenEnabled',false);hide('webkitFullscreenEnabled',false);
  hide('fullscreenElement',null);hide('webkitFullscreenElement',null);
})();
</script>`;

/** Ändert die App-Kopie von game/index.html. Wirft, wenn ein erwarteter Anker fehlt. */
export function patchIndexHtml(html, build) {
  const must = (cond, what) => { if (!cond) throw new Error(`game/index.html: ${what} nicht gefunden`); };
  const viewport = /<meta name="viewport"[^>]*>/;
  must(viewport.test(html), 'viewport-Meta');
  html = html.replace(viewport,
    '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />');
  const loader = new RegExp(`<script type="module" src="loading-screen\\.mjs\\?v=${build.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"></script>`);
  must(loader.test(html), `loading-screen.mjs?v=${build}`);
  html = html.replace(loader, `<script type="module" src="app/native-boot.mjs?v=${build}"></script>`);
  must(html.includes('</head>'), '</head>');
  html = html.replace('</head>', `    <link rel="stylesheet" href="app/app.css?v=${build}" />\n  </head>`);
  html = html.replace('<html', '<html data-app-shell="ios"');
  must(html.includes('<head>'), '<head>');
  if (!html.includes('data-app-no-fullscreen')) {
    html = html.replace('<head>', `<head>\n    ${FULLSCREEN_STUB_SCRIPT}`);
  }
  return html;
}

/** Prüft, dass im Bundle keine absoluten Netz-Skripte oder absoluten Pfade stecken. */
export function auditBundle(dir) {
  const problems = [];
  const walk = d => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!/\.(html|mjs|js|css)$/.test(name)) continue;
      const text = readFileSync(p, 'utf8');
      const rel = relative(dir, p);
      if (/<script[^>]+src=["']https?:/i.test(text)) problems.push(`${rel}: externes <script src>`);
      if (/\bimport\s*(?:[^'"]*from\s*)?["']https?:/.test(text) || /\bimport\(\s*["']https?:/.test(text)) problems.push(`${rel}: Import aus dem Netz`);
      if (/(?:src|href)=["']\/(?!\/)/.test(text)) problems.push(`${rel}: absoluter Pfad`);
    }
  };
  walk(dir);
  return problems;
}

export function build({ root = ROOT, out = WWW, log = console.log } = {}) {
  const build = buildId(root);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const item of COPY) {
    const src = join(root, item);
    if (!existsSync(src)) throw new Error(`fehlt: ${item}`);
    cpSync(src, join(out, item), { recursive: true, filter: s => !SKIP.has(s.split(/[\\/]/).pop()) });
  }
  // App-Brücke
  const appOut = join(out, 'game', 'app');
  mkdirSync(appOut, { recursive: true });
  for (const name of readdirSync(join(APP, 'src'))) {
    const text = readFileSync(join(APP, 'src', name), 'utf8').replaceAll('__BUILD__', build);
    writeFileSync(join(appOut, name), text);
  }
  // Start-Seite der App: Capacitor liefert Pfade ohne Dateiendung (z. B. "game/") als
  // www/index.html aus. Deshalb ausdrücklich auf game/index.html weiterleiten.
  writeFileSync(join(out, 'index.html'), ROOT_INDEX);
  const indexPath = join(out, 'game', 'index.html');
  writeFileSync(indexPath, patchIndexHtml(readFileSync(indexPath, 'utf8'), build));
  // Im App-Paket überflüssig: der Service Worker (wird nie registriert) und die Web-Manifest-Icons bleiben, schaden nicht.
  const problems = auditBundle(out);
  if (problems.length) throw new Error('Bundle-Prüfung fehlgeschlagen:\n' + problems.join('\n'));
  log(`www gebaut (${build}) → ${relative(process.cwd(), out) || out}`);
  return { build, out };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { build(); } catch (e) { console.error(String(e.message || e)); process.exit(1); }
}

// Live-API-Check launch-19: Rückwärtskompatibilität der Edge Function + /progress-Rundreise.
// Liest die öffentlichen Werte aus game/config.js. Schreibt genau EINE Testzeile in sq_progress
// (fester Test-Token, wird bei jedem Lauf wiederverwendet, also kein Wachstum).
import { readFileSync } from 'node:fs';
const cfgSrc = readFileSync('/workspace/squish-campaign/game/config.js', 'utf8');
const pick = k => new RegExp(k + ':\\s*"([^"]+)"').exec(cfgSrc)[1];
const URLF = `${pick('supabaseUrl')}/functions/v1/${pick('functionName')}`;
const H = { apikey: pick('anonKey'), 'x-sq-access': pick('accessToken'), Origin: 'https://saschahoffmannsh-gif.github.io', 'content-type': 'application/json' };
const TEST = 'e2e0' + '19'.repeat(30);           // fester Test-Token
const fresh = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
let fail = 0; const ok = (n, c, x = '') => { if (!c) fail++; console.log(c ? 'OK  ' : 'FAIL', n, x); };
const call = (p, { method = 'GET', token = fresh, body, origin } = {}) => fetch(URLF + p, { method, headers: { ...H, ...(origin ? { Origin: origin } : {}), Authorization: 'Bearer ' + token }, body: body && JSON.stringify(body) });

let r = await call('/save'); ok('GET /save (alter Weg) → 200 null für neuen Token', r.status === 200 && (await r.json()) === null, r.status);
r = await call('/nope'); ok('Unbekannter Pfad → 404', r.status === 404);
r = await call('/display-report', { method: 'POST', body: {} }); ok('/display-report → 204', r.status === 204);
r = await call('/score', { method: 'POST', body: {} }); ok('/score ohne Run → 4xx, kein 5xx', r.status >= 400 && r.status < 500, r.status);
r = await fetch(URLF + '/progress', { method: 'OPTIONS', headers: { Origin: 'capacitor://localhost', 'Access-Control-Request-Method': 'PUT' } });
ok('CORS iOS-App (capacitor://localhost)', r.headers.get('access-control-allow-origin') === 'capacitor://localhost');
r = await fetch(URLF + '/save', { method: 'OPTIONS', headers: { Origin: 'https://saschahoffmannsh-gif.github.io', 'Access-Control-Request-Method': 'PUT' } });
ok('CORS GitHub Pages', r.headers.get('access-control-allow-origin') === 'https://saschahoffmannsh-gif.github.io');
r = await call('/progress'); ok('GET /progress neuer Token → null', r.status === 200 && (await r.json()) === null, r.status);
r = await call('/progress', { method: 'PUT', token: TEST, body: { v: 1, epoch: 18, levels: { 1: { s: 2, m: 6 } }, inv: null, invAt: 0 } });
const a = await r.json().catch(() => ({}));
r = await call('/progress', { method: 'PUT', token: TEST, body: { v: 1, epoch: 18, levels: { 1: { s: 1, m: 3 }, 2: { s: 3, m: 9 } }, inv: null, invAt: 0 } });
const b = await r.json().catch(() => ({}));
ok('PUT /progress Rundreise: Merge (L1 bleibt 2★, L2 dazu)', r.status === 200 && b.progress?.levels?.['1']?.s >= 2 && b.progress?.levels?.['2']?.s === 3, JSON.stringify(b).slice(0, 160));
r = await call('/progress', { token: TEST }); const g = await r.json();
ok('GET /progress liefert gespeicherten Stand', g?.levels?.['2']?.s === 3);
r = await call('/progress', { method: 'PUT', body: { v: 9 } }); ok('Ungültig → 400', r.status === 400);
r = await fetch(`${pick('supabaseUrl')}/rest/v1/sq_progress?select=token_hash&limit=1`, { headers: { apikey: pick('anonKey') } });
ok('sq_progress per anon-Key NICHT lesbar', r.status === 401 || r.status === 403 || r.status === 404, r.status);
r = await fetch(`${pick('supabaseUrl')}/rest/v1/sq_leaderboard?select=kind&kind=eq.week`, { headers: { apikey: pick('anonKey') } });
ok('Bestenliste weiter öffentlich lesbar', r.status === 200);
console.log(JSON.stringify({ fail }));
process.exit(fail ? 1 : 0);

// Thin client for the app Edge Function. Player tokens stay in localStorage;
// only the publishable/anon key and a bundle access token are used from SQ_CONFIG
// (never the service role).
const cfg = globalThis.SQ_CONFIG || {};
const DEFAULT_LOCAL = '/api';

export function apiBase() {
  if (cfg.apiUrl) return String(cfg.apiUrl).replace(/\/$/, '');
  if (cfg.supabaseUrl && cfg.functionName) {
    return `${String(cfg.supabaseUrl).replace(/\/$/, '')}/functions/v1/${cfg.functionName}`;
  }
  return DEFAULT_LOCAL;
}

const SAVE_KEY = 'squish-save-token-v1';

export function hasSaveToken() {
  try { return /^[a-f0-9]{64}$/.test(globalThis.localStorage?.getItem(SAVE_KEY) || ''); } catch { return false; }
}

export function saveToken() {
  try {
    let token = globalThis.localStorage?.getItem(SAVE_KEY);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) {
      token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (v) => v.toString(16).padStart(2, '0')).join('');
      globalThis.localStorage?.setItem(SAVE_KEY, token);
    }
    return token;
  } catch {
    return Array.from(crypto.getRandomValues(new Uint8Array(32)), (v) => v.toString(16).padStart(2, '0')).join('');
  }
}

export function apiFetch(path, opts = {}) {
  const headers = new Headers(opts.headers || {});
  if (cfg.anonKey && !headers.has('apikey')) headers.set('apikey', cfg.anonKey);
  if (cfg.accessToken && !headers.has('x-sq-access')) headers.set('x-sq-access', cfg.accessToken);
  const auth = headers.get('Authorization') || headers.get('authorization');
  if (!auth) headers.set('Authorization', `Bearer ${saveToken()}`);
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return fetch(`${apiBase()}${suffix}`, { ...opts, headers, credentials: 'omit' });
}

async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (v) => v.toString(16).padStart(2, '0')).join('');
}

/** Public leaderboard id of this device (same derivation as the server). */
export async function publicId() {
  return (await sha256hex((await sha256hex(saveToken())) + ':pub')).slice(0, 12);
}

/**
 * Leaderboard snapshot. Read straight from the public, read-only table via
 * PostgREST (no Edge Function call per viewer). `leaderboardUrl` in SQ_CONFIG
 * can point somewhere else (e.g. a local test server or a CDN copy).
 */
export async function fetchLeaderboard(kind) {
  const k = kind === 'week' ? 'week' : 'alltime';
  let url;
  if (cfg.leaderboardUrl) url = String(cfg.leaderboardUrl).replace('{kind}', k);
  else if (cfg.supabaseUrl) url = `${String(cfg.supabaseUrl).replace(/\/$/, '')}/rest/v1/sq_leaderboard?select=body,updated_at&kind=eq.${k}`;
  else throw new Error('Keine Bestenliste konfiguriert');
  const headers = { Accept: 'application/json' };
  if (cfg.anonKey) {
    headers.apikey = cfg.anonKey;
    // Legacy anon keys are JWTs and also go in Authorization; new sb_publishable_ keys must not.
    if (/^eyJ/.test(cfg.anonKey)) headers.Authorization = `Bearer ${cfg.anonKey}`;
  }
  const r = await fetch(url, { headers, credentials: 'omit' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const rows = await r.json();
  const row = Array.isArray(rows) ? rows[0] : rows;
  return { entries: row?.body?.entries || [], updatedAt: row?.updated_at || row?.body?.generated_at || null, weekStart: row?.body?.week_start || null };
}

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

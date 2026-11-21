// Preview is local-only: no cloud reads or writes. Live progress, leaderboard
// and duel APIs must not be touched from this tree.
const cfg = globalThis.SQ_CONFIG || {};

export function apiBase() {
  return '';
}

const SAVE_KEY = 'squish-save-token-preview-gel-v1';

export function hasSaveToken() {
  return false;
}

export function saveToken() {
  return '';
}

export function apiFetch(path, opts = {}) {
  const method = String(opts.method || 'GET').toUpperCase();
  // Always block. A 404 JSON body is what the live client already treats as "no cloud copy".
  return Promise.resolve(new Response('null', {
    status: 404,
    statusText: 'Preview local only',
    headers: { 'Content-Type': 'application/json', 'X-Squish-Preview': 'gel' },
  }));
}

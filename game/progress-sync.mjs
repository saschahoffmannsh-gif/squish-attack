// Cloud-Sicherung des Abenteuer-Fortschritts (launch-19). Offline zuerst:
//  - Gespielt und gespeichert wird immer lokal (localStorage), wie bisher.
//  - Diese Datei schickt den Stand gelegentlich an PUT /progress. Der Server führt ihn mit
//    seinem Stand zusammen (max. Sterne pro Level, neuerer Vorrat) und schickt das Ergebnis
//    zurück; das wird lokal übernommen. Ein Aufruf = sichern + wiederherstellen.
//  - Nie blockierend, Fehler werden still geschluckt, offline wird nichts versucht.
//  - Identität = derselbe anonyme Geräte-Token wie Spielstand und Rangliste (kein Login).
//    Später (App): Token im Schlüsselbund / Konto über Sign in with Apple, siehe docs/app-shell.md.
import { normalizeWire, mergeWire, wireKey, PROGRESS_WIRE_VERSION } from './progress-merge.mjs?v=launch-32';

export const SYNC_STATE_KEY = 'squish-progress-sync-v1';
export const SYNC_DEBOUNCE_MS = 4000;
export const SYNC_REFRESH_MS = 24 * 60 * 60 * 1000;

/** Lokalen Stand (campaign.mjs-Format) ins Wire-Format bringen. */
export function toWire(progress, inventory, epoch, endless = null) {
  const levels = {};
  for (const [k, r] of Object.entries(progress?.levels || {})) {
    if (r && Number.isInteger(r.stars) && r.stars >= 0) levels[k] = { s: r.stars | 0, m: Math.max(1, r.moves | 0) };
  }
  const inv = inventory ? { extraMoves: inventory.extraMoves, rocket: inventory.rocket, hint: inventory.hint, wand: inventory.wand,
    gifts: inventory.gifts || [], pending: inventory.pending || [] } : null;
  const einv = endless ? { rocket: endless.rocket, wand: endless.wand } : undefined;
  return normalizeWire({ v: PROGRESS_WIRE_VERSION, epoch, levels, inv, invAt: inventory?.at || 0, einv, einvAt: endless?.at || 0 });
}

/**
 * Zusammengeführten Server-Stand in den lokalen übernehmen. Gibt {progress, inventory, changed}
 * zurück. Level und Vorrat anderer Epochen (vor dem letzten Fortschritts-Reset) werden ignoriert.
 */
export function applyWire(local, inventory, wire, epoch, now = Date.now(), endless = null) {
  const w = normalizeWire(wire, now);
  if (!w) return { progress: local, inventory, endless, changed: false };
  let changed = false;
  let progress = local;
  let inv = inventory;
  if (w.epoch === epoch) {
    const levels = { ...local.levels };
    for (const [k, r] of Object.entries(w.levels)) {
      const o = levels[k];
      if (!o || r.s > o.stars || (r.s === o.stars && r.m < o.moves)) { levels[k] = { stars: r.s, moves: r.m, at: o?.at || now }; changed = true; }
    }
    progress = changed ? { ...local, levels, updatedAt: Math.max(local.updatedAt || 0, now) } : local;
    const mine = toWire({ levels: {} }, inventory, epoch);
    const merged = mergeWire(mine, { ...w, levels: {} });
    if (merged?.inv && wireKey({ ...merged, epoch: 0 }) !== wireKey({ ...mine, epoch: 0 })) {
      inv = { ...inventory, ...merged.inv, gifts: [...merged.inv.gifts], pending: merged.inv.pending.map(g => ({ ...g })) };
      if (merged.invAt > 0) inv.at = merged.invAt; else delete inv.at;
      changed = true;
    }
  }
  // Endlos-Vorrat (App): neuerer Stand gewinnt
  let einv = endless;
  if (w.einv && (!endless || (w.einvAt || 0) > (endless.at || 0))) {
    const next = { ...w.einv, at: w.einvAt || 0 };
    if (!endless || ['rocket', 'wand'].some(t => next[t] !== endless[t]) || next.at !== endless.at) { einv = next; changed = true; }
  }
  return { progress, inventory: inv, endless: einv, changed };
}

function readState(storage) {
  try { const s = JSON.parse(storage?.getItem(SYNC_STATE_KEY) ?? 'null'); if (s && typeof s === 'object') return s; } catch {}
  return { key: '', at: 0 };
}
function writeState(storage, s) { try { storage?.setItem(SYNC_STATE_KEY, JSON.stringify(s)); } catch {} }

/**
 * @param {object} o
 * @param {() => {progress, inventory, endless?}} o.getLocal   endless = Endlos-Vorrat {rocket, wand, at} (App)
 * @param {(progress, inventory, endless) => void} o.setLocal   speichert lokal (Vorrat mit touch=false) und rendert neu
 * @param {(path, opts) => Promise<Response>} o.fetch    apiFetch
 * @param {number} o.epoch
 * @param {() => boolean} [o.hasToken]
 */
export function createProgressSync({ getLocal, setLocal, fetch: apiFetch, epoch, storage = globalThis.localStorage,
  hasToken = () => true, online = () => globalThis.navigator?.onLine !== false, now = () => Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = id => clearTimeout(id) }) {
  let timer = 0, running = null, again = false;
  const stats = { sent: 0, ok: 0, failed: 0, skipped: 0, applied: 0, last: null };

  function current() { const { progress, inventory, endless } = getLocal(); return toWire(progress, inventory, epoch, endless); }

  /** Muss gesendet werden? Geändert seit dem letzten Abgleich, oder lange nicht abgeglichen. */
  function due(force = false) {
    const w = current();
    const st = readState(storage);
    const empty = !Object.keys(w.levels).length && !(w.inv && (w.invAt || w.inv.gifts.length)) && !w.einvAt;
    if (force) return w;
    if (st.key === wireKey(w) && now() - (st.at || 0) < SYNC_REFRESH_MS) return null;
    // Leerer Stand ohne Token-Vorgeschichte: es gibt nichts zu sichern und nichts wiederherzustellen.
    if (empty && !hasToken()) return null;
    return w;
  }

  async function run({ force = false, keepalive = false } = {}) {
    if (!online()) { stats.skipped++; return false; }
    const w = due(force);
    if (!w) { stats.skipped++; return false; }
    stats.sent++;
    try {
      const r = await apiFetch('/progress', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(w), keepalive, ...(keepalive ? {} : { signal: AbortSignal.timeout?.(8000) }) });
      if (keepalive) return true;
      if (r.status === 429) { stats.failed++; schedule(60000); return false; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const body = await r.json();
      const { progress, inventory, endless = null } = getLocal();
      const res = applyWire(progress, inventory, body?.progress, epoch, now(), endless);
      if (res.changed) { stats.applied++; setLocal(res.progress, res.inventory, res.endless); }
      writeState(storage, { key: wireKey(toWire(res.progress, res.inventory, epoch, res.endless)), at: now() });
      stats.ok++; stats.last = now();
      return true;
    } catch {
      stats.failed++;   // still: lokal bleibt alles, der nächste Anlass versucht es wieder
      return false;
    }
  }

  async function flush(opts = {}) {
    if (timer) { clearTimer(timer); timer = 0; }
    if (opts.keepalive) return run(opts);
    if (running) { again = true; return running; }
    running = (async () => {
      try { let ok = await run(opts); while (again) { again = false; ok = await run(); } return ok; }
      finally { running = null; }
    })();
    return running;
  }

  function schedule(ms = SYNC_DEBOUNCE_MS) {
    if (timer) clearTimer(timer);
    timer = setTimer(() => { timer = 0; void flush(); }, ms);
  }

  function attach(win = globalThis) {
    win.addEventListener?.('online', () => schedule(500));
    win.document?.addEventListener?.('visibilitychange', () => {
      if (win.document.visibilityState === 'hidden' && (timer || due())) void flush({ keepalive: true });
    });
  }

  return { flush, schedule, attach, stats, due: () => !!due() };
}

// Abenteuer-Fortschritt: Wire-Format + Zusammenführen. Identische Kopie im Backend
// (supabase/functions/squish/progress-merge.mjs), ein Test prüft die Gleichheit.
// Reine Funktionen, kein DOM, kein Netz.
//
// Wire-Format v1:
//   { v: 1, epoch: 18, levels: { "12": { s: 3, m: 17 } }, inv: {...} | null, invAt: 1700000000000 }
//   epoch  = Nummer des letzten Sterne-Resets (launch-18 → 18). Höhere Epoche ersetzt die Level.
//   levels = pro Level die besten Sterne (1–3) und die wenigsten Züge dafür.
//   inv    = Werkzeug-Vorrat {extraMoves, rocket, hint, wand, gifts:[ids], pending:[{id,type}]}.
//   invAt  = Zeitpunkt der letzten Vorrats-Änderung (ms). Neuerer Vorrat gewinnt,
//            vergebene Geschenk-ids werden vereinigt (nichts wird doppelt verschenkt).
//   einv   = (optional, App-Hülle) eigener Endlos-Werkzeug-Vorrat {rocket, wand}, einvAt = Zeitpunkt (ms).
//            Neuerer gewinnt. Fehlt das Feld (ältere Clients), bleibt der gespeicherte Endlos-Vorrat erhalten.
// Freischaltungen werden nicht extra gespeichert: sie folgen aus den geschafften Leveln
// (Vereinigung der Level = Vereinigung der Freischaltungen).

export const PROGRESS_WIRE_VERSION = 1;
export const MAX_LEVEL_ID = 1000;
export const MAX_MOVES = 999;
export const MAX_TOOL_COUNT = 999;
export const MAX_GIFTS = 64;
export const MAX_PENDING = 16;
export const WIRE_TOOL_TYPES = Object.freeze(['extraMoves', 'rocket', 'hint', 'wand']);
export const ENDLESS_TOOL_TYPES = Object.freeze(['rocket', 'wand']);
const GIFT_ID_RE = /^[a-z]+-\d{1,4}$/;

const int = (x, lo, hi) => (Number.isSafeInteger(x) && x >= lo && x <= hi ? x : null);

/** 'launch-18' → 18, Zahl bleibt Zahl, sonst 0. */
export function epochOf(tag) {
  if (Number.isSafeInteger(tag) && tag >= 0) return tag;
  const m = /(\d+)\s*$/.exec(String(tag ?? ''));
  return m ? Math.min(Number(m[1]), 1e6) : 0;
}

function normInv(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const t of WIRE_TOOL_TYPES) out[t] = int(raw[t], 0, MAX_TOOL_COUNT) ?? 0;
  const gifts = Array.isArray(raw.gifts) ? raw.gifts : [];
  out.gifts = [...new Set(gifts.filter(g => typeof g === 'string' && GIFT_ID_RE.test(g)))].slice(0, MAX_GIFTS);
  const pending = Array.isArray(raw.pending) ? raw.pending : [];
  const seen = new Set();
  out.pending = [];
  for (const g of pending) {
    if (!g || typeof g.id !== 'string' || !GIFT_ID_RE.test(g.id) || !WIRE_TOOL_TYPES.includes(g.type) || seen.has(g.id)) continue;
    seen.add(g.id); out.pending.push({ id: g.id, type: g.type });
    if (out.pending.length >= MAX_PENDING) break;
  }
  return out;
}

function normEinv(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const t of ENDLESS_TOOL_TYPES) out[t] = int(raw[t], 0, MAX_TOOL_COUNT) ?? 0;
  return out;
}

/**
 * Prüft und säubert ein Wire-Objekt. Unbekannte Felder fallen weg, kaputte Level werden
 * übersprungen. Gibt null zurück, wenn es gar kein Fortschritt ist.
 * `now` begrenzt invAt (Uhr in der Zukunft darf den Vorrat nicht für immer festnageln).
 */
export function normalizeWire(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.v !== PROGRESS_WIRE_VERSION) return null;
  const levels = {};
  const src = raw.levels && typeof raw.levels === 'object' && !Array.isArray(raw.levels) ? raw.levels : {};
  let n = 0;
  for (const [k, r] of Object.entries(src)) {
    if (!/^\d{1,4}$/.test(k)) continue;
    const id = Number(k);
    if (id < 1 || id > MAX_LEVEL_ID || !r || typeof r !== 'object') continue;
    const s = int(r.s, 1, 3), m = int(r.m, 1, MAX_MOVES);
    if (s === null || m === null) continue;
    levels[String(id)] = { s, m };
    if (++n >= MAX_LEVEL_ID) break;
  }
  const inv = normInv(raw.inv);
  const invAt = inv ? Math.min(int(raw.invAt, 0, Number.MAX_SAFE_INTEGER) ?? 0, now + 5 * 60 * 1000) : 0;
  const out = { v: PROGRESS_WIRE_VERSION, epoch: epochOf(raw.epoch), levels, inv, invAt };
  const einv = normEinv(raw.einv);
  if (einv) { out.einv = einv; out.einvAt = Math.min(int(raw.einvAt, 0, Number.MAX_SAFE_INTEGER) ?? 0, now + 5 * 60 * 1000); }
  return out;
}

const better = (a, b) => !b || a.s > b.s || (a.s === b.s && a.m < b.m);

/** Level zweier Stände: pro Level mehr Sterne, bei Gleichstand weniger Züge. */
export function mergeLevels(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, r] of Object.entries(b)) if (better(r, out[k])) out[k] = r;
  return out;
}

/** Vorrat: neuerer gewinnt (Anzahl + offene Geschenke), vergebene Geschenk-ids vereinigt. */
export function mergeInv(a, aAt, b, bAt) {
  if (!a && !b) return { inv: null, invAt: 0 };
  if (!b) return { inv: a, invAt: aAt };
  if (!a) return { inv: b, invAt: bAt };
  const [win, winAt, lose] = (bAt > aAt) ? [b, bAt, a] : [a, aAt, b];
  const gifts = [...new Set([...win.gifts, ...lose.gifts])].slice(0, MAX_GIFTS);
  // Offene Geschenke des Verlierers bleiben erhalten, wenn der Gewinner sie nie bekommen hat.
  const pending = [...win.pending];
  const known = new Set([...win.gifts, ...win.pending.map(g => g.id)]);
  for (const g of lose.pending) if (!known.has(g.id) && pending.length < MAX_PENDING) { pending.push(g); known.add(g.id); }
  return { inv: { ...win, gifts, pending }, invAt: winAt };
}

/** Zwei normalisierte Wire-Stände zusammenführen (kommutativ bis auf exakt gleiche invAt). */
export function mergeWire(a, b) {
  if (!a) return b; if (!b) return a;
  let levels;
  if (a.epoch === b.epoch) levels = mergeLevels(a.levels, b.levels);
  else levels = { ...(a.epoch > b.epoch ? a.levels : b.levels) };
  const { inv, invAt } = mergeInv(a.inv, a.invAt, b.inv, b.invAt);
  const out = { v: PROGRESS_WIRE_VERSION, epoch: Math.max(a.epoch, b.epoch), levels, inv, invAt };
  // Endlos-Vorrat: neuerer gewinnt; fehlt er auf einer Seite, bleibt der andere.
  if (a.einv || b.einv) {
    const useB = b.einv && (!a.einv || (b.einvAt || 0) > (a.einvAt || 0));
    const w = useB ? b : a;
    out.einv = { ...w.einv }; out.einvAt = w.einvAt || 0;
  }
  return out;
}

/** Stabile Darstellung (sortierte Level-Schlüssel) zum Vergleichen „hat sich etwas geändert?“. */
export function wireKey(w) {
  if (!w) return '';
  const levels = Object.keys(w.levels).sort((x, y) => x - y).map(k => `${k}:${w.levels[k].s}:${w.levels[k].m}`).join(',');
  const inv = w.inv ? [...WIRE_TOOL_TYPES.map(t => w.inv[t]), [...w.inv.gifts].sort().join('+'), w.inv.pending.map(g => g.id + '=' + g.type).join('+'), w.invAt].join('|') : '-';
  const e = w.einv ? `#e:${ENDLESS_TOOL_TYPES.map(t => w.einv[t]).join('|')}|${w.einvAt || 0}` : '';
  return `${w.epoch}#${levels}#${inv}${e}`;
}

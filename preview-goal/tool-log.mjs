// Werkzeug-Protokoll (launch-13, Testphase): nur lokal (localStorage), nie ans Backend.
// Hält fest, wann/wo Hilfsmittel gebraucht wurden: Dummy-Werbung, Einsatz, Level-Versuche.
// Reine Logik ohne DOM; storage ist austauschbar (Tests).
export const TOOL_LOG_KEY = 'squish-tool-log-v1';
export const TOOL_LOG_MAX_EVENTS = 4000;
export const TOOL_LOG_MAX_ATTEMPTS = 3000;
const TYPES = ['extraMoves', 'rocket', 'hint', 'wand'];

export const emptyLog = () => ({ version: 1, created: new Date().toISOString(), seq: 0, attempts: [], events: [] });

export function loadLog(storage = globalThis.localStorage) {
  try {
    const v = JSON.parse(storage?.getItem(TOOL_LOG_KEY) ?? 'null');
    if (v && v.version === 1 && Array.isArray(v.attempts) && Array.isArray(v.events)) return { ...emptyLog(), ...v };
  } catch {}
  return emptyLog();
}
export function saveLog(log, storage = globalThis.localStorage) {
  try {
    if (log.events.length > TOOL_LOG_MAX_EVENTS) log.events.splice(0, log.events.length - TOOL_LOG_MAX_EVENTS);
    if (log.attempts.length > TOOL_LOG_MAX_ATTEMPTS) log.attempts.splice(0, log.attempts.length - TOOL_LOG_MAX_ATTEMPTS);
    storage?.setItem(TOOL_LOG_KEY, JSON.stringify(log)); return true;
  } catch { return false; }
}
const now = () => new Date().toISOString();
const openAttempt = (log, id) => log.attempts.find(a => a.id === id);

/** Neuer Versuch eines Levels. attempt = laufende Nummer für dieses Level (1, 2, …). Rückgabe: Versuch. */
export function startAttempt(log, level, { limit = null, t = now() } = {}) {
  const attempt = log.attempts.filter(a => a.level === level).length + 1;
  const a = { id: ++log.seq, level, attempt, start: t, end: null, outcome: null, moves: 0, limit, stars: 0, tools: [], ads: 0 };
  log.attempts.push(a);
  return a;
}
/**
 * Ereignis: kind 'ad' (Dummy-Werbung angesehen → +1), 'gift' (Level-Geschenk eingesammelt → +1)
 * oder 'use' (Hilfsmittel eingesetzt). source: 'ad' | 'gift' bei Gutschriften, null beim Einsatz.
 * ctx = {move, movesLeft, progress:[{type,current,target}]}. Ausgang wird beim Versuchsende nachgetragen.
 */
export function logEvent(log, attemptId, kind, tool, ctx = {}, t = now()) {
  if (!TYPES.includes(tool) || !['ad', 'gift', 'use'].includes(kind)) return null;
  const a = openAttempt(log, attemptId);
  const e = { id: ++log.seq, t, kind, source: kind === 'use' ? null : kind, tool, level: ctx.giftLevel ?? a?.level ?? ctx.level ?? null, giftId: ctx.giftId ?? null, attempt: a?.attempt ?? null, attemptId: a?.id ?? null,
    move: ctx.move ?? null, movesLeft: ctx.movesLeft ?? null, progress: ctx.progress ?? null, outcome: a?.outcome ?? null, where: ctx.where ?? null };
  log.events.push(e);
  if (a) { if (kind === 'ad') a.ads++; else if (kind === 'gift') a.gifts = (a.gifts | 0) + 1; else a.tools.push(tool); }
  return e;
}
/** Versuch beenden: outcome 'won' | 'lost' | 'quit'; trägt den Ausgang an allen Ereignissen des Versuchs nach. */
export function endAttempt(log, attemptId, { outcome, moves = 0, stars = 0, lostReason = null, t = now() } = {}) {
  const a = openAttempt(log, attemptId);
  if (!a || a.outcome) return a ?? null;
  Object.assign(a, { end: t, outcome, moves, stars, lostReason });
  for (const e of log.events) if (e.attemptId === a.id) e.outcome = outcome;
  return a;
}
/** Nach „verloren“ mit +3 Zügen weiterspielen: Versuch wieder öffnen (Ausgang zurücksetzen). */
export function reopenAttempt(log, attemptId) {
  const a = openAttempt(log, attemptId);
  if (!a || a.outcome !== 'lost') return a ?? null;
  a.outcome = null; a.end = null; a.reopened = (a.reopened | 0) + 1;
  for (const e of log.events) if (e.attemptId === a.id) e.outcome = null;
  return a;
}

/** Übersicht je Level + Summen: Versuche, Siege, Niederlagen, Abbrüche, Einsätze, Werbung und Geschenke je Typ. */
export function summarize(log) {
  const zero = () => Object.fromEntries(TYPES.map(t => [t, 0]));
  const blank = () => ({ attempts: 0, wins: 0, losses: 0, quits: 0, use: zero(), ads: zero(), gifts: zero(), bestStars: 0 });
  const levels = new Map(), total = blank();
  const get = n => { if (!levels.has(n)) levels.set(n, blank()); return levels.get(n); };
  for (const a of log.attempts) {
    const s = get(a.level);
    for (const x of [s, total]) {
      x.attempts++;
      if (a.outcome === 'won') x.wins++; else if (a.outcome === 'lost') x.losses++; else if (a.outcome === 'quit') x.quits++;
      if (a.outcome === 'won') x.bestStars = Math.max(x.bestStars, a.stars | 0);
    }
  }
  for (const e of log.events) {
    if (e.level == null) continue;
    const s = get(e.level), key = e.kind === 'ad' ? 'ads' : e.kind === 'gift' ? 'gifts' : 'use';
    s[key][e.tool]++; total[key][e.tool]++;
  }
  return { levels: [...levels.entries()].sort((a, b) => a[0] - b[0]).map(([level, s]) => ({ level, ...s })), total };
}
/** Export-Datei (JSON-Text) mit Zusammenfassung vorneweg. */
export function exportLog(log, meta = {}) {
  return JSON.stringify({ app: 'squish-attack', kind: 'tool-log', exported: now(), ...meta, summary: summarize(log), log }, null, 1);
}

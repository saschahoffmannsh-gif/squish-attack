// Kampagne: feste Rätsel-Level auf Basis der unveränderten Spielregeln.
// Ein Level = feste Startaufstellung + feste Steinfolge + Ziele + Zuglimit.
// Dieses Modul ist reine Logik (kein DOM). Es wird von der UI, dem Solver,
// dem Generator und den Tests gemeinsam benutzt, damit alle exakt gleich zählen.
import { SIZE, insertTile, settle, isGameOver } from './game-logic.mjs';

export const DIRECTIONS = ['left', 'right', 'up', 'down'];
export const QUEUE_PREVIEW = 3;
export const GOAL_TYPES = ['tile', 'make', 'score', 'clear', 'street', 'combo'];

/** Ein Zug als Buchstabe, identisch zu ranked.mjs: 'a'..'t'. */
export function encodeMove(direction, line) {
  const d = DIRECTIONS.indexOf(direction);
  if (d < 0 || !Number.isInteger(line) || line < 0 || line >= SIZE) throw new RangeError('Ungültiger Zug');
  return String.fromCharCode(97 + d * SIZE + line);
}
export function decodeMove(ch) {
  const n = typeof ch === 'string' ? ch.charCodeAt(0) - 97 : -1;
  if (!(n >= 0 && n < DIRECTIONS.length * SIZE)) return null;
  return { direction: DIRECTIONS[Math.floor(n / SIZE)], line: n % SIZE };
}
export const ALL_MOVES = Array.from({ length: DIRECTIONS.length * SIZE }, (_, i) => decodeMove(String.fromCharCode(97 + i)));

const cellOk = v => v === null || (Number.isInteger(v) && v >= 1 && v <= 30);

/** Prüft ein Level-Objekt und wirft bei Fehlern. Gibt das Level zurück. */
export function validateLevel(level) {
  const fail = msg => { throw new TypeError(`Level ${level?.id ?? '?'}: ${msg}`); };
  if (!level || typeof level !== 'object') fail('kein Objekt');
  if (!Array.isArray(level.board) || level.board.length !== SIZE || level.board.some(r => !Array.isArray(r) || r.length !== SIZE || !r.every(cellOk))) fail('board muss 5×5 sein');
  if (!Number.isInteger(level.moves) || level.moves < 1) fail('moves fehlt');
  if (!Array.isArray(level.sequence) || level.sequence.length < level.moves || !level.sequence.every(v => v !== null && cellOk(v))) fail('sequence muss mindestens moves Steine haben');
  if (!Array.isArray(level.goals) || !level.goals.length) fail('goals fehlt');
  for (const g of level.goals) {
    if (!GOAL_TYPES.includes(g.type)) fail(`unbekanntes Ziel ${g.type}`);
    const need = { tile: ['value'], make: ['value', 'count'], score: ['points'], clear: ['tiles'], street: ['count'], combo: ['chain'] }[g.type];
    for (const k of need) if (!Number.isInteger(g[k]) || g[k] < 1) fail(`Ziel ${g.type}: ${k} fehlt`);
  }
  const s = level.stars;
  if (!s || !Number.isInteger(s.three) || !Number.isInteger(s.two) || !(s.three >= 1 && s.three <= s.two && s.two <= level.moves)) fail('stars ungültig');
  return level;
}

const toTile = (v, ctx) => ({ id: ctx.nextId++, value: v });

/** Neuer Spielzustand für ein Level. */
export function createLevelRun(level) {
  validateLevel(level);
  const ctx = { nextId: 1 };
  const board = level.board.map(row => row.map(v => (v === null ? null : toTile(v, ctx))));
  return {
    level, board, ctx,
    index: 0,                 // Position in level.sequence
    moves: 0,                 // gemachte Züge
    score: 0, cleared: 0, merges: 0, streets: 0, bestCombo: 0,
    created: {},              // Wert -> Anzahl durch Fusion erzeugter Steine
    extraMoves: 0,            // durch Hilfsmittel gewonnene Züge
    toolsUsed: [],            // eingesetzte Hilfsmittel (Typen)
    status: 'playing',        // 'playing' | 'won' | 'lost'
    lostReason: null,
    log: '',
  };
}

/** Aktuelles Zuglimit inkl. Hilfsmittel „+Züge“. */
export const moveLimit = run => run.level.moves + run.extraMoves;
export const movesLeft = run => moveLimit(run) - run.moves;
/** Die nächsten Steine (Vorschau), höchstens bis zum Zuglimit. */
export function queueOf(run, n = QUEUE_PREVIEW) {
  return run.level.sequence.slice(run.index, Math.min(moveLimit(run), run.index + n));
}

/** Ein Hilfsmittel als benutzt markieren (deckelt das Ergebnis auf 2 Sterne). */
export function markToolUsed(run, type) { run.toolsUsed.push(type); }

/**
 * Hilfsmittel „+N Züge“: nutzt die Reserve-Steine hinter dem Zuglimit.
 * Darf auch nach einer Niederlage durch Zugmangel eingesetzt werden („Weiterspielen“).
 */
export function addExtraMoves(run, n = 3) {
  const room = run.level.sequence.length - moveLimit(run);
  const add = Math.min(n, room);
  if (add <= 0 || run.status === 'won' || (run.status === 'lost' && run.lostReason !== 'moves')) return 0;
  run.extraMoves += add;
  markToolUsed(run, 'extraMoves');
  if (run.status === 'lost') { run.status = 'playing'; run.lostReason = null; }
  return add;
}

/** Zählt die Fortschritts-Werte eines settle()-Ergebnisses in den Zustand. */
export function tally(run, settled) {
  run.score += settled.points;
  run.bestCombo = Math.max(run.bestCombo, settled.passes.length);
  for (const pass of settled.passes) for (const g of pass) {
    run.cleared += g.cells.length - 1;
    if (g.street) run.streets += 1; else run.merges += 1;
    run.created[g.nextValue] = (run.created[g.nextValue] ?? 0) + 1;
  }
}

/** Fortschritt eines Ziels: {current, target, done}. */
export function goalProgress(goal, run) {
  let current, target;
  switch (goal.type) {
    case 'tile': {
      target = goal.value;
      current = Math.max(0, ...Object.keys(run.created).map(Number));
      return { current: Math.min(current, target), target, done: current >= target };
    }
    case 'make': {
      target = goal.count;
      current = Object.entries(run.created).reduce((n, [v, c]) => n + (Number(v) >= goal.value ? c : 0), 0);
      break;
    }
    case 'score': target = goal.points; current = run.score; break;
    case 'clear': target = goal.tiles; current = run.cleared; break;
    case 'street': target = goal.count; current = run.streets; break;
    case 'combo': target = goal.chain; current = run.bestCombo; break;
  }
  return { current: Math.min(current, target), target, done: current >= target };
}

export const goalsDone = run => run.level.goals.every(g => goalProgress(g, run).done);

/** Kann der nächste Stein überhaupt irgendwo eingeschoben werden? */
export function hasLegalMove(run) {
  if (run.status !== 'playing' || run.index >= moveLimit(run)) return false;
  return ALL_MOVES.some(({ direction, line }) => insertTile(run.board, direction, line, { value: 0 }).accepted);
}

/**
 * Einen Zug spielen. Rückgabe: {ok, reason?, settled?, entry?}.
 * Gleiche Schritte wie move() im Endlosmodus, nur ohne Zufall: der nächste
 * Stein kommt aus level.sequence.
 */
export function applyLevelMove(run, direction, line) {
  if (run.status !== 'playing') return { ok: false, reason: 'finished' };
  if (run.index >= moveLimit(run)) return { ok: false, reason: 'no-moves' };
  const value = run.level.sequence[run.index];
  const probe = insertTile(run.board, direction, line, { value: 0 });
  if (!probe.accepted) return { ok: false, reason: 'full-line' };
  const tile = toTile(value, run.ctx);
  const inserted = insertTile(run.board, direction, line, tile);
  const settled = settle(inserted.board);
  run.board = settled.board;
  run.index += 1;
  run.moves += 1;
  run.log += encodeMove(direction, line);
  tally(run, settled);
  if (goalsDone(run)) run.status = 'won';
  else if (run.moves >= moveLimit(run)) { run.status = 'lost'; run.lostReason = 'moves'; }
  else if (isGameOver(run.board) || !hasLegalMove(run)) { run.status = 'lost'; run.lostReason = 'board-full'; }
  return { ok: true, settled, entry: inserted.entry, tile };
}

/**
 * Sterne für einen Lauf. Schwellen stehen im Level (`stars.three`, `stars.two`):
 *   3★: Züge ≤ three (= Optimum + 1)   2★: Züge ≤ two   1★: gewonnen innerhalb des Zuglimits
 * Mit Hilfsmittel höchstens 2★; gewonnen erst mit Extra-Zügen = 1★.
 */
export function starsFor(level, movesUsed, won = true, { toolsUsed = 0 } = {}) {
  if (!won) return 0;
  let stars = movesUsed <= level.stars.three ? 3 : movesUsed <= level.stars.two ? 2 : 1;
  if (toolsUsed > 0) stars = Math.min(stars, MAX_STARS_WITH_TOOLS);
  return stars;
}
export const MAX_STARS_WITH_TOOLS = 2;
/** Sterne für einen fertigen Lauf (berücksichtigt Hilfsmittel). */
export const starsOfRun = run => starsFor(run.level, run.moves, run.status === 'won', { toolsUsed: run.toolsUsed.length });

/** Sterne-Schwellen aus Optimum und Zuglimit: 3★ = Optimum + 1, 2★ = Mitte bis zum Limit. */
export function starThresholds(minMoves, limit) {
  const three = Math.min(limit, minMoves + 1);
  return { three, two: Math.min(limit, three + Math.ceil((limit - three) / 2)) };
}

/** Spielt eine Lösung (Zug-String) komplett durch. */
export function replaySolution(level, log) {
  const run = createLevelRun(level);
  for (let i = 0; i < log.length; i++) {
    const m = decodeMove(log[i]);
    if (!m) return { ok: false, reason: 'bad-move', at: i, run };
    const r = applyLevelMove(run, m.direction, m.line);
    if (!r.ok) return { ok: false, reason: r.reason, at: i, run };
  }
  return { ok: run.status === 'won', run, stars: starsOfRun(run) };
}

/** Kurzer deutscher Zieltext für die UI. */
export function goalText(goal) {
  switch (goal.type) {
    case 'tile': return `Erzeuge einen ${goal.value}er`;
    case 'make': return `Erzeuge ${goal.count}× einen ${goal.value}er oder höher`;
    case 'score': return `Erreiche ${goal.points.toLocaleString('de-DE')} Punkte`;
    case 'clear': return `Löse ${goal.tiles} Steine auf`;
    case 'street': return goal.count === 1 ? 'Bilde eine Straße' : `Bilde ${goal.count} Straßen`;
    case 'combo': return `Kettenreaktion: ${goal.chain} Fusionen in einem Zug`;
  }
  return '';
}

// ---------------- Fortschritt (lokal) ----------------
export const PROGRESS_KEY = 'squish-campaign-v1';
export const emptyProgress = () => ({ version: 1, levels: {}, updatedAt: 0 });

export function loadProgress(storage = globalThis.localStorage) {
  try {
    const p = JSON.parse(storage?.getItem(PROGRESS_KEY) ?? 'null');
    if (p && p.version === 1 && p.levels && typeof p.levels === 'object') return p;
  } catch {}
  return emptyProgress();
}
export function saveProgress(progress, storage = globalThis.localStorage) {
  try { storage?.setItem(PROGRESS_KEY, JSON.stringify(progress)); return true; } catch { return false; }
}

/** Ergebnis eintragen; behält jeweils das Beste (Sterne, dann Züge). */
export function recordResult(progress, levelId, { stars, moves, now = Date.now() }) {
  if (!(stars >= 1)) return progress;
  const key = String(levelId), old = progress.levels[key];
  const better = !old || stars > old.stars || (stars === old.stars && moves < old.moves);
  if (!better) return progress;
  return { ...progress, levels: { ...progress.levels, [key]: { stars, moves, at: now } }, updatedAt: now };
}

/** Zusammenführen (z. B. lokal + Server): pro Level das Bessere. */
export function mergeProgress(a, b) {
  const out = { ...emptyProgress(), levels: { ...a.levels }, updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0) };
  for (const [k, r] of Object.entries(b.levels || {})) {
    const o = out.levels[k];
    if (!o || r.stars > o.stars || (r.stars === o.stars && r.moves < o.moves)) out.levels[k] = r;
  }
  return out;
}

export const totalStars = progress => Object.values(progress.levels).reduce((n, r) => n + r.stars, 0);

// ---------------- Kapitel und Sterne-Schranken ----------------
// Kapitel à 10 Level. Für Kapitel k ≥ 2 braucht man insgesamt
// STARS_PER_CHAPTER_GATE × (k − 1) Sterne (= Ø 1,8★ pro bisherigem Level,
// also 60 % der möglichen Sterne; mit Hilfsmitteln (max. 2★) erreichbar).
export const CHAPTER_SIZE = 10;
export const STARS_PER_CHAPTER_GATE = 18;
export const chapterOf = n => Math.floor((n - 1) / CHAPTER_SIZE) + 1;
export const chapterStart = k => (k - 1) * CHAPTER_SIZE + 1;
export const starGate = k => (k <= 1 ? 0 : STARS_PER_CHAPTER_GATE * (k - 1));

/**
 * Warum ist Level n gesperrt? null = frei.
 * {reason:'previous'} – Vorgänger noch nicht geschafft
 * {reason:'stars', need, have, chapter} – Sterne-Schranke am Kapitelanfang
 */
export function lockReason(progress, n) {
  if (n <= 1) return null;
  if (!progress.levels[String(n - 1)]) return { reason: 'previous' };
  const k = chapterOf(n);
  if (n === chapterStart(k)) {
    const need = starGate(k), have = totalStars(progress);
    if (have < need) return { reason: 'stars', need, have, chapter: k };
  }
  return null;
}
/** Level n ist frei: Vorgänger geschafft und ggf. Sterne-Schranke erreicht. Einmal frei = bleibt frei (Bestwerte sinken nie). */
export const isUnlocked = (progress, n) => lockReason(progress, n) === null;
/** Erstes freies, noch nicht geschafftes Level (für „Weiterspielen“); sonst das letzte freie. */
export function nextLevel(progress, count) {
  let lastFree = 1;
  for (let n = 1; n <= count; n++) {
    if (!isUnlocked(progress, n)) break;
    lastFree = n;
    if (!progress.levels[String(n)]) return n;
  }
  return lastFree;
}

// ---------------- Hilfsmittel ----------------
/** Hammer: entfernt einen Stein (kein Zug). Gibt true zurück, wenn etwas entfernt wurde. */
export function useHammer(run, row, col) {
  if (run.status !== 'playing' || !run.board[row]?.[col]) return false;
  run.board = run.board.map(r => r.slice());
  run.board[row][col] = null;
  markToolUsed(run, 'hammer');
  return true;
}

export const TOOLS_KEY = 'squish-campaign-tools-v1';
export const TOOL_TYPES = ['extraMoves', 'hammer'];
export const emptyInventory = () => ({ version: 1, extraMoves: 0, hammer: 0, gifts: [] });

export function loadInventory(storage = globalThis.localStorage) {
  try {
    const v = JSON.parse(storage?.getItem(TOOLS_KEY) ?? 'null');
    if (v && v.version === 1 && Array.isArray(v.gifts)) {
      return { ...emptyInventory(), ...v, extraMoves: Math.max(0, v.extraMoves | 0), hammer: Math.max(0, v.hammer | 0) };
    }
  } catch {}
  return emptyInventory();
}
export function saveInventory(inv, storage = globalThis.localStorage) {
  try { storage?.setItem(TOOLS_KEY, JSON.stringify(inv)); return true; } catch { return false; }
}
/** Ein Hilfsmittel verbrauchen. Gibt das neue Inventar zurück oder null, wenn keins da ist. */
export function spendTool(inv, type) {
  if (!TOOL_TYPES.includes(type) || !(inv[type] > 0)) return null;
  return { ...inv, [type]: inv[type] - 1 };
}

/**
 * Gratis-Geschenke (docs/kampagne.md): 1× „+3 Züge“ nach Level 10, 1× Hammer nach Level 20,
 * dazu je 10 Sterne ein Hilfsmittel (abwechselnd +3 Züge, Hammer). Jedes Geschenk nur einmal.
 * Rückgabe: {inventory, granted:[{id, type}]}.
 */
export const STARS_PER_GIFT = 10;
export function grantGifts(inv, progress) {
  const out = { ...inv, gifts: [...inv.gifts] }, granted = [];
  const give = (id, type) => { if (out.gifts.includes(id)) return; out.gifts.push(id); out[type] += 1; granted.push({ id, type }); };
  if (progress.levels['10']) give('level-10', 'extraMoves');
  if (progress.levels['20']) give('level-20', 'hammer');
  const blocks = Math.floor(totalStars(progress) / STARS_PER_GIFT);
  for (let b = 1; b <= blocks; b++) give(`stars-${b * STARS_PER_GIFT}`, b % 2 ? 'extraMoves' : 'hammer');
  return { inventory: out, granted };
}
export const toolName = type => ({ extraMoves: '+3 Züge', hammer: 'Hammer' })[type] ?? type;

// Kampagne: feste Rätsel-Level auf Basis der unveränderten Spielregeln.
// Ein Level = feste Startaufstellung + feste Steinfolge + Ziele + Zuglimit.
// Dieses Modul ist reine Logik (kein DOM). Es wird von der UI, dem Solver,
// dem Generator und den Tests gemeinsam benutzt, damit alle exakt gleich zählen.
import { SIZE, insertTile, settle, isGameOver, tickBombs, BOMB_MS, BOMB_UNIT_MS } from './game-logic.mjs?v=launch-16';

export const DIRECTIONS = ['left', 'right', 'up', 'down'];
export const QUEUE_PREVIEW = 3;
export const GOAL_TYPES = ['tile', 'make', 'score', 'clear', 'street', 'combo', 'empty', 'long', 'purge'];
/** launch-15: neue Missionen – empty: höchstens `max` Steine auf dem Brett; long: `count` Straßen aus ≥ 4 Steinen;
 *  purge: `tiles` Steine mit dem Wert `value` auflösen. Werkzeug-Level: level.tool = 'extraMoves'|'hint'|'rocket'|'wand'. */
export const TOOL_KEYS = ['extraMoves', 'hint', 'rocket', 'wand'];
export const LONG_STREET = 4;

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
    const need = { tile: ['value'], make: ['value', 'count'], score: ['points'], clear: ['tiles'], street: ['count'], combo: ['chain'], empty: ['max'], long: ['count'], purge: ['value', 'tiles'] }[g.type];
    for (const k of need) if (!Number.isInteger(g[k]) || g[k] < 1) fail(`Ziel ${g.type}: ${k} fehlt`);
  }
  if (level.tool != null && !TOOL_KEYS.includes(level.tool)) fail('tool ungültig');
  if (level.specials != null) {   // launch-16: besondere Squishes auf dem Startbrett
    const sp = level.specials, seen = new Set();
    if (typeof sp !== 'object') fail('specials ungültig');
    for (const k of Object.keys(sp)) if (!SPECIAL_KINDS.includes(k) && k !== 'bombSeconds') fail(`specials: unbekannt ${k}`);
    if (sp.bombSeconds != null && !(Number.isInteger(sp.bombSeconds) && sp.bombSeconds >= 5 && sp.bombSeconds <= 120)) fail('specials: bombSeconds');
    for (const kind of SPECIAL_KINDS) for (const cell of sp[kind] ?? []) {
      const [r, c] = Array.isArray(cell) ? cell : [];
      if (!(Number.isInteger(r) && Number.isInteger(c) && r >= 0 && r < SIZE && c >= 0 && c < SIZE)) fail(`specials ${kind}: Zelle ungültig`);
      if (seen.has(r * SIZE + c)) fail(`specials: Zelle ${r},${c} doppelt`);
      seen.add(r * SIZE + c);
      if (level.board[r][c] === null) fail(`specials ${kind}: braucht einen Stein (${r},${c})`);   // launch-17: auch Ketten tragen eine Zahl
    }
  }
  const s = level.stars, room = level.tool === 'extraMoves' ? 3 : 0;   // +3-Level: 2★ auch mit den 3 Extra-Zügen
  if (!s || !Number.isInteger(s.three) || !Number.isInteger(s.two) || !(s.three >= 1 && s.three <= s.two && s.two <= level.moves + room)) fail('stars ungültig');
  if (room && level.sequence.length < level.moves + 3) fail('Reserve-Steine für +3 fehlen');
  return level;
}

const toTile = (v, ctx) => ({ id: ctx.nextId++, value: v });
/** launch-16: besondere Squishes. ice = gefroren, bound = angekettet (Wand, launch-17: befreibar), bomb = 20-s-Countdown. */
export const SPECIAL_KINDS = ['ice', 'bomb', 'bound'];
export { BOMB_MS };
/** Solver/Hinweis/Simulation: so viel Bomben-Zeit vergeht pro Zug (Modell eines zügigen Spielers). */
export const BOMB_MS_PER_MOVE = BOMB_UNIT_MS;
/** Art eines Steins: 'ice' | 'bomb' | 'bound' | null. */
export const specialOf = t => (!t ? null : t.bound ? 'bound' : t.ice ? 'ice' : t.bomb != null ? 'bomb' : null);
function placeSpecials(level, board, ctx) {
  const sp = level.specials;
  if (!sp) return;
  const ms = (sp.bombSeconds ?? BOMB_MS / 1000) * 1000;
  for (const [r, c] of sp.ice ?? []) board[r][c] = { ...board[r][c], ice: true };
  for (const [r, c] of sp.bomb ?? []) board[r][c] = { ...board[r][c], bomb: ms };
  for (const [r, c] of sp.bound ?? []) board[r][c] = { ...board[r][c], bound: true };
}
/**
 * Ein Zug auf einem reinen Brett (Solver, Hinweis, Simulation): einschieben, fusionieren, dann vergeht
 * BOMB_MS_PER_MOVE Bomben-Zeit (Modell). Rückgabe wie settle() (+ exploded) oder null, wenn die Reihe voll ist.
 */
export function stepBoard(board, direction, line, tile, { bombMs = BOMB_MS_PER_MOVE } = {}) {
  const ins = insertTile(board, direction, line, tile);
  if (!ins.accepted) return null;
  const settled = settle(ins.board);
  if (!bombMs || !hasBomb(settled.board)) return settled;
  const t = tickBombs(settled.board, bombMs);
  return t.exploded.length ? { ...settled, board: t.board, exploded: t.exploded } : { ...settled, board: t.board };
}
export const hasBomb = board => board.some(row => row.some(t => t && t.bomb != null));

/** Neuer Spielzustand für ein Level. */
export function createLevelRun(level) {
  validateLevel(level);
  const ctx = { nextId: 1 };
  const board = level.board.map(row => row.map(v => (v === null ? null : toTile(v, ctx))));
  placeSpecials(level, board, ctx);
  return {
    level, board, ctx,
    bombClock: false,         // launch-16: Bomben-Countdown läuft ab dem ersten Zug
    exploded: 0,              // explodierte Bomben
    index: 0,                 // Position in level.sequence
    moves: 0,                 // gemachte Züge
    score: 0, cleared: 0, merges: 0, streets: 0, bestCombo: 0, longStreets: 0,
    purged: {},               // Wert -> Anzahl aufgelöster Steine dieses Werts
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
  run.purged ??= {}; run.longStreets ??= 0;
  for (const pass of settled.passes) for (const g of pass) {
    run.cleared += g.cells.length - 1;
    if (g.street) { run.streets += 1; if (g.cells.length >= LONG_STREET) run.longStreets += 1; } else run.merges += 1;
    run.created[g.nextValue] = (run.created[g.nextValue] ?? 0) + 1;
    for (const [v, n] of vanished(g)) run.purged[v] = (run.purged[v] ?? 0) + n;
  }
}
/**
 * Welche Werte verschwinden durch eine Gruppe? → [[Wert, Anzahl]].
 * Fusion: alle Steine des Werts (einer wird zum höheren Wert). Straße: die Werte steigen
 * entlang der Straße um 1, der Zielstein ist der höchste; er bleibt bei Länge 3 stehen.
 */
export function vanished(g) {
  if (!g.street) return [[g.value, g.cells.length]];
  const ti = g.cells.findIndex(([r, c]) => r === g.target[0] && c === g.target[1]);
  const out = new Map();
  g.cells.forEach((_, i) => {
    if (i === ti && g.nextValue === g.value) return;
    const v = g.value - Math.abs(i - ti);
    out.set(v, (out.get(v) ?? 0) + 1);
  });
  return [...out];
}
// Angekettete Steine zählen nicht (solange angekettet); befreit zählen sie normal.
export const tilesOn = board => { let n = 0; for (const row of board) for (const t of row) if (t && !t.bound) n++; return n; };
/** Zielwert in Einheiten des Fortschritts-Vektors (Solver/Hinweis). */
export const goalTarget = g => ({ tile: g.value, make: g.count, score: g.points, clear: g.tiles, street: g.count, combo: g.chain, empty: 1, long: g.count, purge: g.tiles })[g.type];
/**
 * Fortschritts-Vektor nach einem settle()-Ergebnis weiterrechnen (gedeckelt). Gleiche Zählung wie
 * tally()/goalProgress(); genutzt von Solver, Generator und Hinweis. „empty“ hängt nur vom Brett ab (0/1).
 */
export function advanceGoals(goals, vec, settled) {
  const out = vec.slice();
  let done = true;
  for (let i = 0; i < goals.length; i++) {
    const g = goals[i];
    let v = out[i];
    switch (g.type) {
      case 'tile': for (const pass of settled.passes) for (const x of pass) if (x.nextValue > v) v = x.nextValue; v = Math.min(v, g.value); break;
      case 'make': for (const pass of settled.passes) for (const x of pass) if (x.nextValue >= g.value) v++; v = Math.min(v, g.count); break;
      case 'score': v = Math.min(v + settled.points, g.points); break;
      case 'clear': for (const pass of settled.passes) for (const x of pass) v += x.cells.length - 1; v = Math.min(v, g.tiles); break;
      case 'street': for (const pass of settled.passes) for (const x of pass) if (x.street) v++; v = Math.min(v, g.count); break;
      case 'combo': v = Math.min(Math.max(v, settled.passes.length), g.chain); break;
      case 'long': for (const pass of settled.passes) for (const x of pass) if (x.street && x.cells.length >= LONG_STREET) v++; v = Math.min(v, g.count); break;
      case 'purge': for (const pass of settled.passes) for (const x of pass) for (const [val, n] of vanished(x)) if (val === g.value) v += n; v = Math.min(v, g.tiles); break;
      case 'empty': v = tilesOn(settled.board) <= g.max ? 1 : 0; break;
    }
    out[i] = v;
    if (v < goalTarget(g)) done = false;
  }
  return { vec: out, win: done };
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
    case 'long': target = goal.count; current = run.longStreets ?? 0; break;
    case 'purge': target = goal.tiles; current = run.purged?.[goal.value] ?? 0; break;
    case 'empty': {   // Stand: Steine auf dem Brett, Ziel: höchstens max
      const n = tilesOn(run.board);
      return { current: n, target: goal.max, done: n <= goal.max };
    }
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
  run.bombClock = true;
  tally(run, settled);
  if (goalsDone(run)) run.status = 'won';
  else if (run.moves >= moveLimit(run)) { run.status = 'lost'; run.lostReason = 'moves'; }
  else if (isGameOver(run.board) || !hasLegalMove(run)) { run.status = 'lost'; run.lostReason = 'board-full'; }
  return { ok: true, settled, entry: inserted.entry, tile };
}

/**
 * launch-16: Bomben-Uhr im echten Spiel (Echtzeit, ms). Läuft erst ab dem ersten Zug und nur solange
 * gespielt wird; die UI ruft das nur auf, wenn nicht pausiert, kein Dialog offen und die Seite sichtbar ist.
 * Rückgabe: Liste der Explosionen [{at, id, removed}] (leer = nichts passiert).
 */
export function tickLevelBombs(run, ms) {
  if (run.status !== 'playing' || !run.bombClock || !(ms > 0)) return [];
  const t = tickBombs(run.board, ms);
  run.board = t.board;
  if (!t.exploded.length) return [];
  run.exploded = (run.exploded ?? 0) + t.exploded.length;
  if (goalsDone(run)) run.status = 'won';
  else if (isGameOver(run.board) || !hasLegalMove(run)) { run.status = 'lost'; run.lostReason = 'board-full'; }
  return t.exploded;
}
/** Kleinste Restzeit (ms) aller Bomben auf dem Brett, sonst null. */
export function nextBombMs(run) {
  let m = null;
  for (const row of run.board) for (const t of row) if (t && t.bomb != null && (m === null || t.bomb < m)) m = t.bomb;
  return m;
}

/**
 * Sterne für einen Lauf. Schwellen stehen im Level (`stars.three`, `stars.two`):
 *   3★: Züge ≤ three (= Optimum + 1)   2★: Züge ≤ two   1★: gewonnen innerhalb des Zuglimits
 * Mit Hilfsmittel höchstens 2★; gewonnen erst mit Extra-Zügen = 1★.
 */
export function starsFor(level, movesUsed, won = true, { toolsUsed = 0 } = {}) {
  if (!won) return 0;
  let stars = movesUsed <= level.stars.three ? 3 : movesUsed <= level.stars.two ? 2 : 1;
  // Werkzeug-Level (launch-15): immer höchstens 2★ – auch wer es ohne Werkzeug schafft.
  if (toolsUsed > 0 || level.tool) stars = Math.min(stars, MAX_STARS_WITH_TOOLS);
  return stars;
}
export const MAX_STARS_WITH_TOOLS = 2;
/** Sterne für einen fertigen Lauf (berücksichtigt Hilfsmittel). */
export const starsOfRun = run => starsFor(run.level, run.moves, run.status === 'won', { toolsUsed: run.toolsUsed.length });

/**
 * Sterne-Schwellen für Werkzeug-Level (launch-15): Ergebnis ist ohnehin auf 2★ gedeckelt.
 * eff = Limit (+3 bei „+3 Züge“); 2★ bis zur Mitte zwischen Werkzeug-Optimum und eff.
 */
export function toolStars(toolMin, limit, tool) {
  const eff = limit + (tool === 'extraMoves' ? 3 : 0);
  const two = Math.min(eff, toolMin + Math.ceil((eff - toolMin) / 2));
  return { three: Math.min(toolMin, two), two };
}
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

/** Sehr kurzer Zieltext für die Ziel-Karte, wenn drei Ziele gleichzeitig gelten (passt auf 375 px). */
export function goalShort(goal) {
  switch (goal.type) {
    case 'tile': return `${goal.value}er bauen`;
    case 'make': return `${goal.count}× ${goal.value}er+`;
    case 'score': return `${goal.points.toLocaleString('de-DE')} Punkte`;
    case 'clear': return `${goal.tiles} Steine lösen`;
    case 'street': return goal.count === 1 ? '1 Straße' : `${goal.count} Straßen`;
    case 'combo': return `Kette ${goal.chain}`;
    case 'empty': return `≤ ${goal.max} Steine`;
    case 'long': return goal.count === 1 ? `Straße aus ${LONG_STREET}` : `${goal.count}× Straße aus ${LONG_STREET}`;
    case 'purge': return `${goal.tiles}× die ${goal.value}`;
  }
  return '';
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
    case 'empty': return `Höchstens ${goal.max} Steine übrig`;
    case 'long': return goal.count === 1 ? `Bilde eine Straße aus ${LONG_STREET} Steinen` : `Bilde ${goal.count} Straßen aus ${LONG_STREET} Steinen`;
    case 'purge': return `Löse ${goal.tiles}× die ${goal.value} auf`;
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
// launch-12: Rakete (ersetzt den Hammer), Hinweis, Zauberstab, +3 Züge.
// Jedes Hilfsmittel deckelt das Ergebnis auf höchstens 2 Sterne.

/** Rakete: entfernt einen Stein (kein Zug, keine Fusion). true, wenn etwas entfernt wurde. */
export function useRocket(run, row, col) {
  if (run.status !== 'playing' || !run.board[row]?.[col] || run.board[row][col].bound) return false;   // Ketten halten auch der Rakete stand
  run.board = run.board.map(r => r.slice());
  run.board[row][col] = null;
  markToolUsed(run, 'rocket');
  if (goalsDone(run)) run.status = 'won';   // z. B. „höchstens N Steine übrig“
  return true;
}

/**
 * Zauberstab – erlaubte Zahlen für einen Stein:
 *  - 1 … Obergrenze, ohne den aktuellen Wert
 *  - Obergrenze = kleinster Zielwert eines „Erzeuge“-Ziels (tile/make), einschließlich;
 *    gibt es kein solches Ziel: der größte Wert auf Brett/Vorschau (mind. 2)
 *  - ohne Werte, die durch die anschließenden Fusionen sofort alle Ziele erfüllen würden
 */
export function wandCap(run) {
  const targets = run.level.goals.filter(g => g.type === 'tile' || g.type === 'make').map(g => g.value);
  if (targets.length) return Math.min(...targets);   // bis einschließlich Zielwert (Sofort-Sieg wird in wandChoices ausgeschlossen)
  const seen = [...run.board.flat().filter(Boolean).map(t => t.value), ...queueOf(run)];
  return Math.max(2, ...seen);
}
export function wandChoices(run, row, col) {
  const tile = run.board[row]?.[col];
  if (run.status !== 'playing' || !tile || tile.bound) return [];
  const out = [];
  for (let v = 1; v <= wandCap(run); v++) {
    if (v === tile.value) continue;
    if (wandPreview(run, row, col, v).win) continue;
    out.push(v);
  }
  return out;
}
function wandPreview(run, row, col, value) {
  const board = run.board.map(r => r.map(t => (t ? { ...t } : null)));
  board[row][col] = { ...board[row][col], value };
  const settled = settle(board);
  const probe = { ...run, created: { ...run.created }, board: settled.board };
  tally(probe, settled);
  return { settled, probe, win: goalsDone(probe) };
}
/**
 * Zauberstab: Stein bekommt einen neuen Wert (gleiche id, kein Zug). Danach gelten
 * die normalen Regeln: entstehen Gruppen, wird wie nach einem Zug fusioniert und
 * gezählt (Punkte, Fusionen, Ketten). Rückgabe {ok, settled}.
 */
export function useWand(run, row, col, value) {
  if (!wandChoices(run, row, col).includes(value)) return { ok: false };
  const { settled } = wandPreview(run, row, col, value);
  run.board = settled.board;
  tally(run, settled);
  markToolUsed(run, 'wand');
  if (goalsDone(run)) run.status = 'won';
  else if (isGameOver(run.board) || !hasLegalMove(run)) { run.status = 'lost'; run.lostReason = 'board-full'; }
  return { ok: true, settled };
}

/** Zielfortschritt als (gedeckelter) Vektor – Startpunkt für die Hinweis-Suche. */
export const progressVector = run => run.level.goals.map(g => (g.type === 'empty' ? (goalProgress(g, run).done ? 1 : 0) : goalProgress(g, run).current));

export const TOOLS_KEY = 'squish-campaign-tools-v1';
export const TOOL_TYPES = ['extraMoves', 'rocket', 'hint', 'wand'];
/** Vorrat (v3): Anzahl je Hilfsmittel, vergebene Geschenk-ids, noch nicht geöffnete Geschenke. */
export const emptyInventory = () => ({ version: 3, extraMoves: 0, rocket: 0, hint: 0, wand: 0, gifts: [], pending: [] });

/** Lädt den Vorrat; alte Stände werden übernommen: v1 Hammer → Rakete, v1/v2 ohne offene Geschenke. */
export function loadInventory(storage = globalThis.localStorage) {
  try {
    const v = JSON.parse(storage?.getItem(TOOLS_KEY) ?? 'null');
    if (v && [1, 2, 3].includes(v.version) && Array.isArray(v.gifts)) {
      const n = x => Math.max(0, x | 0);
      const pending = Array.isArray(v.pending) ? v.pending.filter(g => g && typeof g.id === 'string' && TOOL_TYPES.includes(g.type) && !g.id.startsWith('stars-')).map(g => ({ id: g.id, type: g.type })) : [];
      return { ...emptyInventory(), gifts: v.gifts.slice(), pending, extraMoves: n(v.extraMoves),
        rocket: n(v.rocket) + (v.version === 1 ? n(v.hammer) : 0), hint: n(v.hint), wand: n(v.wand) };
    }
  } catch {}
  return emptyInventory();
}
export function saveInventory(inv, storage = globalThis.localStorage) {
  try { storage?.setItem(TOOLS_KEY, JSON.stringify(inv)); return true; } catch { return false; }
}
/**
 * Hilfsmittel-Einstellungen:
 *  - FREE_TOOLS_PER_LEVEL (launch-12, Test): jeder Level-Versuch (auch Neustart/Nochmal)
 *    hat so viele Gratis-Ladungen pro Hilfsmittel; sie werden zuerst verbraucht, nie gespeichert.
 *  - TOOL_STOCK (launch-12 wieder an): gespeicherter Vorrat, gefüllt nur durch Geschenke
 *    und Shop-Käufe. Aus = kein Vorrat, keine Geschenke, kein Shop.
 * Altes Verhalten (launch-10): FREE_TOOLS_PER_LEVEL = 0, TOOL_STOCK = true.
 *  - AD_TOOLS (launch-13, Testphase): leeres Hilfsmittel → Dummy-Werbung „Ansehen“ gibt 1 Stück.
 *  - TOOL_GIFTS (launch-13 aus, launch-14 wieder an): Level-Geschenke (3/6/10/20). Sterne-Geschenke gibt es nicht mehr.
 *  - TOOL_STOCK_RESET (launch-13): einmalig beim Laden Vorrat + offene Geschenke leeren.
 * Zurück zu launch-12 (ohne Sterne-Geschenke): FREE_TOOLS_PER_LEVEL = 1, AD_TOOLS = false, SHOP_CONFIG.enabled = true.
 */
export const FREE_TOOLS_PER_LEVEL = 0;
export const TOOL_STOCK = true;
export const AD_TOOLS = true;
export const TOOL_GIFTS = true;
export const TOOL_STOCK_RESET = 'launch-13';
export const TOOL_RESET_KEY = 'squish-campaign-tools-reset';
/**
 * Einmalige Leerung (launch-13): Anzahl aller Hilfsmittel = 0, offene Geschenke weg.
 * Bereits vergebene Geschenk-ids bleiben gemerkt (nichts wird später doppelt verschenkt).
 * Rückgabe {inventory, reset:boolean}; ein zweiter Aufruf ändert nichts mehr.
 */
export function resetStockOnce(inv, storage = globalThis.localStorage, tag = TOOL_STOCK_RESET) {
  let done = null;
  try { done = storage?.getItem(TOOL_RESET_KEY); } catch {}
  if (!tag || done === tag) return { inventory: inv, reset: false };
  const out = { ...emptyInventory(), gifts: [...(inv?.gifts || [])], pending: [] };
  saveInventory(out, storage);
  try { storage?.setItem(TOOL_RESET_KEY, tag); } catch {}
  return { inventory: out, reset: true };
}
export function freeToolCharges(count = FREE_TOOLS_PER_LEVEL) {
  return Object.fromEntries(TOOL_TYPES.map(t => [t, Math.max(0, count | 0)]));
}
/** Verfügbare Anzahl je Hilfsmittel = Ladungen des Versuchs (+ Vorrat, wenn TOOL_STOCK). */
export function toolsAvailable(inv, free, stock = TOOL_STOCK) {
  return Object.fromEntries(TOOL_TYPES.map(t => [t, (stock ? Math.max(0, inv?.[t] | 0) : 0) + Math.max(0, free?.[t] | 0)]));
}
/** Verbraucht eine Ladung: zuerst die des Versuchs, dann (nur mit TOOL_STOCK) den Vorrat. → {inventory, free, fromFree} oder null. */
export function spendCharge(inv, free, type, stock = TOOL_STOCK) {
  if (!TOOL_TYPES.includes(type)) return null;
  if (free?.[type] > 0) return { inventory: inv, free: { ...free, [type]: free[type] - 1 }, fromFree: true };
  const next = stock ? spendTool(inv, type) : null;
  return next ? { inventory: next, free, fromFree: false } : null;
}
/** Ein Hilfsmittel aus dem Vorrat verbrauchen. Gibt den neuen Vorrat zurück oder null. */
export function spendTool(inv, type) {
  if (!TOOL_TYPES.includes(type) || !(inv[type] > 0)) return null;
  return { ...inv, [type]: inv[type] - 1 };
}
/** Hilfsmittel zum Vorrat hinzufügen (Shop/Geschenk), items = {rocket: 3, …}. Unbekanntes wird ignoriert. */
export function addToStock(inv, items) {
  const out = { ...emptyInventory(), ...inv, gifts: [...(inv.gifts || [])], pending: [...(inv.pending || [])] };
  for (const [t, k] of Object.entries(items || {})) if (TOOL_TYPES.includes(t) && k > 0) out[t] = (out[t] | 0) + (k | 0);
  return out;
}

/**
 * Gratis-Geschenke (docs/kampagne.md), jedes nur einmal:
 *  Level 3 → Hinweis, Level 6 → Zauberstab, Level 10 → +3 Züge, Level 20 → Rakete.
 * (Die früheren Sterne-Geschenke „je 10 Sterne ein Hilfsmittel“ sind seit launch-14 entfernt.)
 */
export const LEVEL_GIFTS = Object.freeze([[3, 'hint'], [6, 'wand'], [10, 'extraMoves'], [20, 'rocket']]);
/** Level, für das ein Geschenk vergeben wird ('level-3' → 3), sonst null. */
export const giftLevel = id => { const m = /^level-(\d+)$/.exec(String(id)); return m ? Number(m[1]) : null; };
function dueGifts(inv, progress) {
  const due = [], seen = new Set(inv.gifts || []);
  const add = (id, type) => { if (!seen.has(id)) { seen.add(id); due.push({ id, type }); } };
  for (const [n, type] of LEVEL_GIFTS) if (progress.levels[String(n)]) add(`level-${n}`, type);
  return due;
}
/** Sofort gutschreiben (alt, launch-10). Rückgabe {inventory, granted:[{id, type}]}. */
export function grantGifts(inv, progress) {
  const granted = dueGifts(inv, progress);
  let out = addToStock(inv, {});
  for (const g of granted) { out.gifts.push(g.id); out[g.type] += 1; }
  return { inventory: out, granted };
}
/**
 * launch-12: fällige Geschenke werden als „offene Geschenke“ gemerkt (inv.pending) und erst
 * beim Antippen (Blase platzen lassen) gutgeschrieben. Rückgabe {inventory, queued:[{id, type}]}.
 */
export function queueGifts(inv, progress) {
  const queued = dueGifts(inv, progress);
  const out = addToStock(inv, {});
  for (const g of queued) { out.gifts.push(g.id); out.pending.push(g); }
  return { inventory: out, queued };
}
/**
 * Einmaliger Abenteuer-Reset (launch-14, Saschas Entscheidung): Fortschritt aller Level
 * (freigeschaltete Level, Sterne, beste Züge, Kapitel-Sperren) sowie vergebene und offene
 * Geschenke werden einmal auf jedem Gerät gelöscht, damit die Level-Geschenke 3/6/10/20 beim
 * Nachspielen wieder kommen. Die Anzahl der Werkzeuge im Vorrat bleibt. Endlos, Highscores,
 * Rangliste, Duell, Einstellungen und Werkzeug-Protokoll werden NICHT angefasst.
 * Ein Merker (CAMPAIGN_RESET_KEY) verhindert Wiederholungen, auch nach Neuladen.
 * Läuft NACH resetStockOnce. Rückgabe {progress, inventory, reset:boolean}.
 */
export const CAMPAIGN_RESET = 'launch-14';
export const CAMPAIGN_RESET_KEY = 'squish-campaign-progress-reset';
export function resetCampaignOnce(progress, inv, storage = globalThis.localStorage, tag = CAMPAIGN_RESET) {
  let done = null;
  try { done = storage?.getItem(CAMPAIGN_RESET_KEY); } catch {}
  if (!tag || done === tag) return { progress, inventory: inv, reset: false };
  const p = emptyProgress();
  const out = { ...addToStock(inv || emptyInventory(), {}), gifts: [], pending: [] };
  saveProgress(p, storage); saveInventory(out, storage);
  try { storage?.setItem(CAMPAIGN_RESET_KEY, tag); } catch {}
  return { progress: p, inventory: out, reset: true };
}
/** Offenes Geschenk einsammeln → {inventory, gift} oder null. Ohne id: das älteste. */
export function collectGift(inv, id) {
  const i = (inv.pending || []).findIndex(g => id == null || g.id === id);
  if (i < 0) return null;
  const gift = inv.pending[i];
  const out = addToStock(inv, { [gift.type]: 1 });
  out.pending.splice(i, 1);
  return { inventory: out, gift };
}
export const toolName = type => ({ extraMoves: '+3 Züge', rocket: 'Rakete', hint: 'Hinweis', wand: 'Zauberstab', hammer: 'Rakete' })[type] ?? type;

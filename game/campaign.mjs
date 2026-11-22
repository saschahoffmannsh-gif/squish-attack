// Kampagne: feste Rätsel-Level auf Basis der unveränderten Spielregeln.
// Ein Level = feste Startaufstellung + feste Steinfolge + Ziele + Zuglimit.
// Dieses Modul ist reine Logik (kein DOM). Es wird von der UI, dem Solver,
// dem Generator und den Tests gemeinsam benutzt, damit alle exakt gleich zählen.
import { SIZE, insertTile, settle, isGameOver, tickBombs, BOMB_MS, BOMB_UNIT_MS } from './game-logic.mjs?v=launch-41';
import { t, fmtNum } from './i18n.mjs?v=launch-41';

export const DIRECTIONS = ['left', 'right', 'up', 'down'];
export const QUEUE_PREVIEW = 3;
export const GOAL_TYPES = ['tile', 'make', 'score', 'clear', 'street', 'combo', 'empty', 'long', 'purge', 'fuse'];
export const FUSE_SIZES = [3, 4, 5];
export const FUSE_SHAPES = ['line', 't'];
/** launch-15: neue Missionen – empty: höchstens `max` Steine auf dem Brett; long: `count` Straßen aus ≥ 4 Steinen;
 *  purge: `tiles` Steine mit dem Wert `value` auflösen. Werkzeug-Level: level.tool = 'extraMoves'|'rocket' (launch-29: Hinweis/Zauberstab entfernt). */
export const TOOL_KEYS = ['extraMoves', 'rocket'];
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
    const need = { tile: ['value'], make: ['value', 'count'], score: ['points'], clear: ['tiles'], street: ['count'], combo: ['chain'], empty: ['max'], long: ['count'], purge: ['value', 'tiles'], fuse: ['size'] }[g.type];
    for (const k of need) if (!Number.isInteger(g[k]) || g[k] < 1) fail(`Ziel ${g.type}: ${k} fehlt`);
    if (g.type === 'fuse') {
      if (!FUSE_SIZES.includes(g.size)) fail('Ziel fuse: size muss 3, 4 oder 5 sein');
      if (g.shape != null && !FUSE_SHAPES.includes(g.shape)) fail('Ziel fuse: shape ungültig');
    }
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
  const s = level.stars, room = level.tool === 'extraMoves' ? 3 : 0;   // +3-Level: 2★ auch mit den 3 Extra-Zügen (Schwellen wandern mit, siehe starsFor)
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
export const specialOf = t => (!t ? null : t.bound ? 'bound' : t.ice ? 'ice' : t.bomb != null ? 'bomb' : t.joker ? 'joker' : null);
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
    fuseMarks: [],            // launch-22: {size, line} je Fusion (kein Straßen-Eintrag)
    extraMoves: 0,            // durch Hilfsmittel gewonnene Züge
    toolsUsed: [],            // eingesetzte Hilfsmittel (Typen) – launch-32: sternneutral
    giftsUsed: [],            // launch-28: eingesetzte Gold-Geschenke (Typen) – sternneutral
    status: 'playing',        // 'playing' | 'won' | 'lost'
    lostReason: null,
    log: '',
  };
}

/** Aktuelles Zuglimit inkl. Hilfsmittel „+Züge“. */
export const moveLimit = run => run.level.moves + run.extraMoves;
export const movesLeft = run => moveLimit(run) - run.moves;
/**
 * launch-28: Stein Nummer i der festen Folge. „+3 Züge“ ist beliebig oft erlaubt; hinter dem
 * Ende der gespeicherten Folge geht es reproduzierbar von vorn weiter (gleiche Steine, gleiche Reihenfolge).
 */
export function tileAt(level, i) {
  const seq = level.sequence;
  return i < seq.length ? seq[i] : seq[i % seq.length];
}
/** Die nächsten Steine (Vorschau), höchstens bis zum Zuglimit. */
export function queueOf(run, n = QUEUE_PREVIEW) {
  const out = [];
  for (let i = run.index; i < Math.min(moveLimit(run), run.index + n); i++) out.push(tileAt(run.level, i));
  return out;
}

/** Ein Hilfsmittel als benutzt markieren (launch-32: sternneutral, nur fürs Protokoll). gift = Gold-Geschenk. */
export function markToolUsed(run, type, { gift = false } = {}) {
  if (gift) (run.giftsUsed ??= []).push(type);
  else run.toolsUsed.push(type);
}

/**
 * Hilfsmittel „+N Züge“ (launch-28: beliebig oft). Die Folge läuft über tileAt() weiter.
 * Darf auch nach einer Niederlage durch Zugmangel eingesetzt werden („Weiterspielen“).
 */
export function addExtraMoves(run, n = 3, { gift = false } = {}) {
  const add = Math.max(0, n | 0);
  if (add <= 0 || run.status === 'won' || (run.status === 'lost' && run.lostReason !== 'moves')) return 0;
  run.extraMoves += add;
  markToolUsed(run, 'extraMoves', { gift });
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
    if (g.street) { run.streets += 1; if (g.cells.length >= LONG_STREET) run.longStreets += 1; } else { run.merges += 1; const m = fuseMarkOf(g); if (m) (run.fuseMarks ??= []).push(m); }
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
/** Gerade Fusion (eine Reihe oder Spalte)? Sonst T-Form (Ast an einer Innenzelle). */
export function isStraightGroup(cells) {
  return cells.every(([r]) => r === cells[0][0]) || cells.every(([, c]) => c === cells[0][1]);
}
/** Passt eine Fusion zum fuse-Ziel (Größe, optional line/T)? Straßen zählen nicht. */
export function fuseMatch(mark, goal) {
  if (!mark || mark.size !== goal.size) return false;
  if (goal.shape === 't') return !mark.line;
  if (goal.shape === 'line') return !!mark.line;
  return true;
}
export function fuseMarkOf(g) {
  if (!g || g.street) return null;
  return { size: g.cells.length, line: isStraightGroup(g.cells) };
}
// Angekettete Steine zählen nicht (solange angekettet); befreit zählen sie normal.
export const tilesOn = board => { let n = 0; for (const row of board) for (const t of row) if (t && !t.bound) n++; return n; };
/** Zielwert in Einheiten des Fortschritts-Vektors (Solver/Hinweis). */
export const goalTarget = g => ({ tile: g.value, make: g.count, score: g.points, clear: g.tiles, street: g.count, combo: g.chain, empty: 1, long: g.count, purge: g.tiles, fuse: 1 })[g.type];
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
      case 'fuse': for (const pass of settled.passes) for (const x of pass) { const m = fuseMarkOf(x); if (m && fuseMatch(m, g)) v = 1; } break;
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
    case 'fuse': {
      target = 1;
      current = (run.fuseMarks || []).some(m => fuseMatch(m, goal)) ? 1 : 0;
      break;
    }
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
  const value = tileAt(run.level, run.index);
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
 * launch-32 (Saschas Regel): Sterne kommen aus den **übrigen Zügen** am Ende, gemessen am ursprünglichen
 * Zuglimit des Levels. Hilfen (Rakete, +3) kosten keine Sterne mehr – weder per Clip noch mit Werbefrei.
 *   übrig = level.moves − gemachte Züge   (durch „+3“ gewonnene Züge zählen NIE als übrig:
 *                                          wer über das Limit hinaus spielt, hat weniger als 0 übrig)
 *   3★: übrig ≥ need.three   2★: übrig ≥ need.two   1★: sonst gelöst. Ein gelöstes Level hat immer mind. 1★.
 * Die Schwellen kommen aus den kalibrierten Leveldaten (`stars.three`/`stars.two` = höchstens so viele Züge),
 * damit 3★ weiter effizientes Spiel braucht (Optimum + 1 bzw. nach Spielermodell verschärft).
 * Spitzen-Level ohne eigene 2★-Stufe (three = two = Limit): 3★ im Limit, 2★ mit höchstens 3 Zügen darüber
 * (also mit einem „+3“), mehr → 1★.
 */
export const STAR_PLUS3_BAND = 3;
export function starNeeds(level) {
  const L = level.moves, three = L - level.stars.three, two = L - level.stars.two;
  return { three, two: two < three ? two : three - STAR_PLUS3_BAND };
}
export function starsFor(level, movesUsed, won = true) {
  if (!won) return 0;
  const left = level.moves - movesUsed, need = starNeeds(level);
  return left >= need.three ? 3 : left >= need.two ? 2 : 1;
}
/** launch-32 (Entscheidung Sascha): jede Rakete (Clip, Werbefrei, Gold, Tutorial) zählt für die Sterne wie ein Zug. */
export const rocketsUsed = run => [...(run.toolsUsed || []), ...(run.giftsUsed || [])].filter(x => x === 'rocket').length;
/** Für die Sterne verbrauchte Züge: echte Züge + Raketen. „+3“ bringt nie etwas dazu. */
export const starMovesUsed = run => run.moves + rocketsUsed(run);
/** Übrige Züge für die Sterne (Limit − Züge − Raketen, ohne „+3“-Züge, nie unter 0 angezeigt). */
export const starMovesLeft = run => Math.max(0, run.level.moves - starMovesUsed(run));
/** Sterne für einen fertigen Lauf: übrige Züge, jede Rakete zählt als ein Zug; +3 und Gold sonst sternneutral. */
export const starsOfRun = run => starsFor(run.level, starMovesUsed(run), run.status === 'won');

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
    case 'tile': return t('goalShort.tile', { value: goal.value });
    case 'make': return t('goalShort.make', { count: goal.count, value: goal.value });
    case 'score': return t('goalShort.score', { points: fmtNum(goal.points) });
    case 'clear': return t('goalShort.clear', { tiles: goal.tiles });
    case 'street': return goal.count === 1 ? t('goalShort.street.one') : t('goalShort.street.other', { count: goal.count });
    case 'combo': return t('goalShort.combo', { chain: goal.chain });
    case 'empty': return t('goalShort.empty', { max: goal.max });
    case 'long': return goal.count === 1 ? t('goalShort.long.one', { n: LONG_STREET }) : t('goalShort.long.other', { count: goal.count, n: LONG_STREET });
    case 'purge': return t('goalShort.purge', { tiles: goal.tiles, value: goal.value });
    case 'fuse': return goal.shape === 't' ? t('goalShort.fuseT', { size: goal.size }) : goal.shape === 'line' ? t('goalShort.fuseLine', { size: goal.size }) : t('goalShort.fuse', { size: goal.size });
  }
  return '';
}
/** Kurzer Zieltext für die UI (folgt der eingestellten Sprache). */
export function goalText(goal) {
  switch (goal.type) {
    case 'tile': return t('goal.tile', { value: goal.value });
    case 'make': return t('goal.make', { count: goal.count, value: goal.value });
    case 'score': return t('goal.score', { points: fmtNum(goal.points) });
    case 'clear': return t('goal.clear', { tiles: goal.tiles });
    case 'street': return goal.count === 1 ? t('goal.street.one') : t('goal.street.other', { count: goal.count });
    case 'combo': return t('goal.combo', { chain: goal.chain });
    case 'empty': return t('goal.empty', { max: goal.max });
    case 'long': return goal.count === 1 ? t('goal.long.one', { n: LONG_STREET }) : t('goal.long.other', { count: goal.count, n: LONG_STREET });
    case 'purge': return t('goal.purge', { tiles: goal.tiles, value: goal.value });
    case 'fuse':
      if (goal.shape === 't') return t('goal.fuseT', { size: goal.size });
      if (goal.shape === 'line') return t('goal.fuseLine', { size: goal.size });
      if (goal.size === 5) return t('goal.fuse5');
      return t('goal.fuse', { size: goal.size });
  }
  return '';
}

/** Alle Ziele eines Levels als ein klarer Satz (für Start und Karte). */
function asClause(s, first) {
  let out = String(s || '').trim().replace(/\.+$/, '');
  if (!first && out && !/^[0-9]/.test(out)) out = out.charAt(0).toLowerCase() + out.slice(1);
  return out;
}
export function goalIntro(goals = []) {
  const raw = (goals || []).map(goalText).filter(Boolean);
  if (!raw.length) return '';
  if (raw.length === 1) {
    const one = raw[0].trim();
    return /[.!?]$/.test(one) ? one : `${one}.`;
  }
  const parts = raw.map((s, i) => asClause(s, i === 0));
  const and = t('goal.and');
  const body = parts.length === 2 ? `${parts[0]} ${and} ${parts[1]}` : `${parts.slice(0, -1).join(', ')} ${and} ${parts[parts.length - 1]}`;
  return `${body}.`;
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

/** Ergebnis eintragen; behält jeweils das Beste (Sterne, dann Züge). Alte 0★-Einträge (launch-26) zählen als geschafft. */
export function recordResult(progress, levelId, { stars, moves, now = Date.now() }) {
  if (!Number.isInteger(stars) || stars < 0 || stars > 3) return progress;
  const key = String(levelId), old = progress.levels[key];
  const better = !old || stars > old.stars || (stars === old.stars && moves < old.moves);
  if (!better) return progress;
  return { ...progress, levels: { ...progress.levels, [key]: { stars, moves, at: now } }, updatedAt: now };
}

/** Zusammenführen (z. B. lokal + Server): pro Level das Bessere. Offene Kapitel (launch-28) werden vereinigt. */
export function mergeProgress(a, b) {
  const out = { ...emptyProgress(), levels: { ...a.levels }, updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0) };
  const open = [...new Set([...(a.openChapters || []), ...(b.openChapters || [])])].sort((x, y) => x - y);
  if (open.length) out.openChapters = open;
  for (const [k, r] of Object.entries(b.levels || {})) {
    const o = out.levels[k];
    if (!o || r.stars > o.stars || (r.stars === o.stars && r.moves < o.moves)) out.levels[k] = r;
  }
  return out;
}

export const totalStars = progress => Object.values(progress.levels).reduce((n, r) => n + r.stars, 0);

// ---------------- Kapitel und Sterne-Schranken ----------------
// Kapitel à 10 Level (max. 30★ je Kapitel). launch-30: 24★ je Kapitel (80 %), kumuliert
// 24/48/72/96/120/144/168/192/216★. Bis launch-29: 21, 22, 22, 23, 23, 24, 24, 25, 25 (CHAPTER_QUOTAS_28).
// launch-28: deutlich strenger und steigend.
// CHAPTER_QUOTAS[j] = Sterne, die Kapitel j+1 zur Schranke beiträgt; für Kapitel k braucht man
// die Summe der Quoten aller Kapitel davor (insgesamt, Überschuss früherer Kapitel zählt mit).
//   Kapitel 1→2: 21 (70 %) … Kapitel 9→10: 25 (83 %). Ø ≈ 2,3★ je Level: die meisten Level
//   brauchen 3★ ohne Hilfe; die Werkzeug-Spitzen dürfen mit einer Hilfe (2★) gespielt werden.
// Alte Regel bis launch-27: 18★ je Kapitel (60 %).
export const CHAPTER_SIZE = 10;
export const CHAPTER_QUOTAS = Object.freeze([24, 24, 24, 24, 24, 24, 24, 24, 24]);
export const CHAPTER_QUOTAS_28 = Object.freeze([21, 22, 22, 23, 23, 24, 24, 25, 25]);   // historisch (launch-28/29)
export const STARS_PER_CHAPTER_GATE = 18;   // historisch (bis launch-27)
export const chapterOf = n => Math.floor((n - 1) / CHAPTER_SIZE) + 1;
export const chapterStart = k => (k - 1) * CHAPTER_SIZE + 1;
export const starGate = k => {
  if (k <= 1) return 0;
  let n = 0;
  for (let j = 0; j < k - 1; j++) n += CHAPTER_QUOTAS[Math.min(j, CHAPTER_QUOTAS.length - 1)];
  return n;
};

/**
 * Warum ist Level n gesperrt? null = frei.
 * {reason:'previous'} – Vorgänger noch nicht geschafft
 * {reason:'stars', need, have, chapter} – Sterne-Schranke am Kapitelanfang
 */
export function lockReason(progress, n) {
  if (n <= 1) return null;
  if (!progress.levels[String(n - 1)]) return { reason: 'previous' };
  const k = chapterOf(n);
  // launch-28: ein schon gespieltes Kapitel bleibt offen (die Schranke ist strenger geworden,
  // niemand verliert dadurch ein Level, das er schon erreicht hatte).
  if (n === chapterStart(k) && !progress.levels[String(n)] && !(progress.openChapters || []).includes(k)) {
    const need = starGate(k), have = totalStars(progress);
    if (have < need) return { reason: 'stars', need, have, chapter: k };
  }
  return null;
}
/** Level n ist frei: Vorgänger geschafft und ggf. Sterne-Schranke erreicht. Einmal frei = bleibt frei (Bestwerte sinken nie). */
export const isUnlocked = (progress, n) => lockReason(progress, n) === null;
/** launch-22: Endlos und 2 Spieler sind frei, sobald Level 5 geschafft ist (auch mit 0★). */
export const MODES_UNLOCK_LEVEL = 5;
export const modesUnlocked = progress => progress?.levels?.[String(MODES_UNLOCK_LEVEL)] != null;

/**
 * Zug, den der Geisterfinger im Tutorial zeigen soll: zuerst ein Zug, der sofort gewinnt
 * (bevorzugt die gespeicherte Lösung), sonst null (dann bleibt der Finger weg).
 */
export function tutorialHintMove(run) {
  if (run.status !== 'playing' || run.index >= moveLimit(run)) return null;
  const value = tileAt(run.level, run.index);
  if (value == null) return null;
  const tile = { id: 0, value };
  const vec = progressVector(run);
  const wins = [];
  for (const { direction, line } of ALL_MOVES) {
    const settled = stepBoard(run.board, direction, line, tile);
    if (!settled) continue;
    if (advanceGoals(run.level.goals, vec, settled).win) wins.push({ direction, line });
  }
  if (!wins.length) return null;
  const preferred = run.level.solution?.[run.moves] ?? run.level.solution?.[0];
  const want = preferred ? decodeMove(preferred) : null;
  return (want && wins.find(w => w.direction === want.direction && w.line === want.line)) || wins[0];
}

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
// launch-12: Rakete (ersetzt den Hammer) und +3 Züge.
// launch-28: im Abenteuer nur noch Rakete und +3 Züge, beliebig oft (siehe ADVENTURE_TOOLS).
//   Ohne Werbefrei kostet jeder Einsatz einen Belohnungsclip (game.mjs), mit Werbefrei ist er frei.
//   Sterne: launch-32 nur aus übrigen Zügen (starsFor). Gold-Geschenke (Vorrat inv.extraMoves / inv.rocket) brauchen keine Werbung.

/** Rakete: entfernt einen Stein (kein Zug, keine Fusion). true, wenn etwas entfernt wurde. */
export function useRocket(run, row, col, { gift = false } = {}) {
  if (run.status !== 'playing' || !run.board[row]?.[col] || run.board[row][col].bound) return false;   // Ketten halten auch der Rakete stand
  run.board = run.board.map(r => r.slice());
  run.board[row][col] = null;
  markToolUsed(run, 'rocket', { gift });
  if (goalsDone(run)) run.status = 'won';   // z. B. „höchstens N Steine übrig“
  return true;
}

/** Zielfortschritt als (gedeckelter) Vektor – Startpunkt für die Hinweis-Suche. */
export const progressVector = run => run.level.goals.map(g => (g.type === 'empty' ? (goalProgress(g, run).done ? 1 : 0) : goalProgress(g, run).current));

export const TOOLS_KEY = 'squish-campaign-tools-v1';
export const TOOL_TYPES = ['extraMoves', 'rocket', 'hint', 'wand'];   // Speicher-/Wire-Format (alte Typen hint/wand bleiben nur lesbar, launch-29: nicht mehr im Spiel)
/** launch-28: Hilfsmittel im Abenteuer. Hinweis und Zauberstab gibt es dort nicht mehr. */
export const ADVENTURE_TOOLS = Object.freeze(['extraMoves', 'rocket']);
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
        rocket: n(v.rocket) + (v.version === 1 ? n(v.hammer) : 0), hint: n(v.hint), wand: n(v.wand),
        ...(Number.isSafeInteger(v.at) && v.at > 0 ? { at: v.at } : {}) };
    }
  } catch {}
  return emptyInventory();
}
/**
 * Speichert den Vorrat. `touch` (Standard) setzt `at` = jetzt: der Zeitpunkt der letzten echten
 * Änderung, mit dem die Cloud-Synchronisierung entscheidet, welcher Vorrat neuer ist (launch-19).
 * Einmalige Resets und übernommene Cloud-Stände speichern mit touch=false, damit ein frisches
 * Gerät den Cloud-Vorrat nicht mit einem leeren überschreibt.
 */
export function saveInventory(inv, storage = globalThis.localStorage, touch = true) {
  if (touch && inv && typeof inv === 'object') inv.at = Date.now();
  try { storage?.setItem(TOOLS_KEY, JSON.stringify(inv)); return true; } catch { return false; }
}
/**
 * Hilfsmittel-Einstellungen (launch-28):
 *  - UNLIMITED_TOOLS: Rakete und +3 Züge beliebig oft je Versuch (kein 1×-Limit mehr).
 *    Ohne Werbefrei verlangt jeder Einsatz einen Belohnungsclip (game.mjs), mit Werbefrei nicht.
 *  - TOOL_STOCK = false: kein gekaufter Abenteuer-Vorrat, kein Shop.
 *  - TOOL_GIFTS = true: seltene Gold-Geschenke (LEVEL_GIFTS). Sie liegen als Gold-Vorrat in
 *    inv.extraMoves / inv.rocket, sind in jedem Abenteuer-Level nutzbar und kosten keine Sterne.
 * Der Endlos-Vorrat (App-Hülle) ist unabhängig.
 */
export const UNLIMITED_TOOLS = true;
export const FREE_TOOLS_PER_LEVEL = Infinity;   // historisch 1 (launch-26)
export const TOOL_STOCK = false;
export const AD_TOOLS = false;
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
  const out = { ...emptyInventory(), gifts: [...(inv?.gifts || [])], pending: [], at: inv?.at || 0 };
  saveInventory(out, storage, false);
  try { storage?.setItem(TOOL_RESET_KEY, tag); } catch {}
  return { inventory: out, reset: true };
}
/** Gold-Vorrat (Geschenke) je Abenteuer-Werkzeug. */
export const goldStock = inv => Object.fromEntries(ADVENTURE_TOOLS.map(t => [t, Math.max(0, inv?.[t] | 0)]));
/** Ein Gold-Geschenk verbrauchen → neuer Vorrat oder null. */
export function spendGold(inv, type) {
  if (!ADVENTURE_TOOLS.includes(type)) return null;
  return spendTool(inv, type);
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
 * launch-28: Gold-Geschenke, sehr selten und nur im Abenteuer, jedes nur einmal (auch nicht beim
 * Nachspielen): nach Level 3, 10, 20, 30, 50, 75 und 100. Neue ids `gold-<n>`, damit alte
 * Geschenk-Merker (level-3 …) nicht stören. Ein Gold-Werkzeug kostet keine Sterne.
 */
export const LEVEL_GIFTS = Object.freeze([[3, 'rocket'], [10, 'extraMoves'], [20, 'rocket'], [30, 'extraMoves'], [50, 'rocket'], [75, 'extraMoves'], [100, 'rocket']]);
export const GIFT_PREFIX = 'gold';
/** Level, für das ein Geschenk vergeben wird ('level-3' → 3), sonst null. */
export const giftLevel = id => { const m = /^(?:level|gold)-(\d+)$/.exec(String(id)); return m ? Number(m[1]) : null; };
function dueGifts(inv, progress) {
  const due = [], seen = new Set(inv.gifts || []);
  const add = (id, type) => { if (!seen.has(id)) { seen.add(id); due.push({ id, type }); } };
  for (const [n, type] of LEVEL_GIFTS) if (progress.levels[String(n)]) add(`${GIFT_PREFIX}-${n}`, type);
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
  saveProgress(p, storage); saveInventory(out, storage, false);
  try { storage?.setItem(CAMPAIGN_RESET_KEY, tag); } catch {}
  return { progress: p, inventory: out, reset: true };
}
/**
 * launch-18: Sterne und beste Züge der umgebauten Level (ab 11) einmalig löschen.
 * Level 1–10 bleiben, damit Kapitel 2 frei bleibt, wenn es schon offen war.
 * Eigener Merker, CAMPAIGN_RESET bleibt 'launch-14'.
 */
export const STARS_RESET = 'launch-18';
export const STARS_RESET_KEY = 'squish-campaign-stars-reset';
export const STARS_RESET_FROM = 11;
export function resetChangedStarsOnce(progress, storage = globalThis.localStorage, { tag = STARS_RESET, fromId = STARS_RESET_FROM } = {}) {
  let done = null;
  try { done = storage?.getItem(STARS_RESET_KEY); } catch {}
  if (!tag || done === tag) return { progress, reset: false };
  const levels = { ...progress.levels };
  for (const k of Object.keys(levels)) if (Number(k) >= fromId) delete levels[k];
  const p = { ...progress, levels, updatedAt: Date.now() };
  saveProgress(p, storage);
  try { storage?.setItem(STARS_RESET_KEY, tag); } catch {}
  return { progress: p, reset: true };
}
/**
 * launch-27: Sterne nur der umgearbeiteten Level einmalig löschen.
 * Unveränderte Level, Tutorials (1–5), Freischaltungen und Vorrat bleiben.
 * Eigener Merker; TUTORIAL_RESET bleibt launch-24 (kein neuer Abenteuer-Reset).
 * PROGRESS_EPOCH ist launch-27, damit die Cloud die alten Sterne der umgearbeiteten
 * Level nicht per Max-Merge der Epoche 24 zurückbringt.
 */
export const CURVE_STARS_RESET = 'launch-27';
export const CURVE_STARS_RESET_KEY = 'squish-campaign-curve-stars-reset';
export const CURVE_STARS_RESET_IDS = Object.freeze([26, 51, 52, 54, 58, 80, 81, 84, 91, 100]);
export function resetCurveStarsOnce(progress, storage = globalThis.localStorage, { tag = CURVE_STARS_RESET, ids = CURVE_STARS_RESET_IDS } = {}) {
  let done = null;
  try { done = storage?.getItem(CURVE_STARS_RESET_KEY); } catch {}
  if (!tag || done === tag) return { progress, reset: false };
  const levels = { ...progress.levels };
  for (const id of ids) delete levels[String(id)];
  const p = { ...progress, levels, updatedAt: Date.now() };
  saveProgress(p, storage);
  try { storage?.setItem(CURVE_STARS_RESET_KEY, tag); } catch {}
  return { progress: p, reset: true };
}
/**
 * launch-24: Abenteuer einmalig komplett zurücksetzen (Sterne, Freischaltungen, Vorrat, Geschenke,
 * Tutorial-Merker). Endlos-Spielstand, Endlos-Rekord und Endlos-Vorrat bleiben unberührt.
 * Sprache und Einstellungen ebenfalls. Geräte mit Merker launch-22 setzen erneut zurück,
 * weil der Merker jetzt launch-24 ist. Epoche PROGRESS_EPOCH, damit die Cloud den alten
 * Stand nicht zurückbringt. Ein Merker verhindert Wiederholungen. Rückgabe {progress, inventory, reset}.
 * launch-30: noch einmal für alle (neue Kapitel-Hürden 24★ je Kapitel, Neustart ab Level 1):
 * Merker und Epoche launch-30; zusätzlich werden die gesehenen Erklär-Fenster (Tutorials) vergessen.
 */
export const PROGRESS_EPOCH = 'launch-30';
export const TUTORIAL_RESET = 'launch-30';
export const TUTORIAL_RESET_KEY = 'squish-campaign-tutorial-reset';
export const MODES_UNLOCK_SEEN_KEY = 'squish-modes-unlock-seen';
export function resetAdventureForTutorialsOnce(progress, inv, storage = globalThis.localStorage, {
  tag = TUTORIAL_RESET, syncKey = 'squish-progress-sync-v1', unlockSeenKey = MODES_UNLOCK_SEEN_KEY,
  explainKey = 'squish-explain-seen-v1',
} = {}) {
  let done = null;
  try { done = storage?.getItem(TUTORIAL_RESET_KEY); } catch {}
  if (!tag || done === tag) return { progress, inventory: inv, reset: false };
  const p = emptyProgress();
  const out = emptyInventory();
  saveProgress(p, storage);
  saveInventory(out, storage, false);
  try { storage?.setItem(TUTORIAL_RESET_KEY, tag); } catch {}
  try { storage?.removeItem(syncKey); } catch {}
  try { storage?.removeItem(unlockSeenKey); } catch {}
  try { if (explainKey) storage?.removeItem(explainKey); } catch {}
  return { progress: p, inventory: out, reset: true };
}
/** Offenes Geschenk einsammeln → {inventory, gift} oder null. Ohne id: das älteste. */
export function collectGift(inv, id) {
  const i = (inv.pending || []).findIndex(g => id == null || g.id === id);
  if (i >= 0 && !ADVENTURE_TOOLS.includes(inv.pending[i].type)) return null;
  if (i < 0) return null;
  const gift = inv.pending[i];
  const out = addToStock(inv, { [gift.type]: 1 });
  out.pending.splice(i, 1);
  return { inventory: out, gift };
}
export const toolName = type => ({ extraMoves: t('tool.extraMoves'), rocket: t('tool.rocket'), hammer: t('tool.rocket') })[type] ?? type;

/**
 * launch-28: neue Sterne-Regeln einmalig auf den alten Spielstand anwenden – ohne etwas zu löschen.
 *  1. Kapitel, die nach der alten Regel (18★ je Kapitel) schon offen waren, bleiben offen
 *     (progress.openChapters), obwohl die Schranken jetzt strenger sind.
 *  2. Neubewertung: Level mit neuen (strengeren) Zug-Schwellen bekommen min(alte Sterne,
 *     Sterne für die gespeicherten besten Züge). Jedes gelöste Level hat mindestens 1★
 *     (alte 0★-Einträge mit 3+ Hilfsmitteln werden 1★). Kein Level verliert „gelöst“.
 *  3. Der alte Abenteuer-Vorrat (Zähler aus Testphasen) wird geleert; er ist jetzt der
 *     Gold-Geschenk-Vorrat. Vergebene Geschenk-ids bleiben, offene alte Geschenke fallen weg.
 * PROGRESS_EPOCH ist launch-28, damit die Cloud den alten Stand nicht per Max-Merge zurückbringt.
 * Ein Merker verhindert Wiederholungen. Rückgabe {progress, inventory, migrated}.
 */
export const RULES28 = 'launch-28';
export const RULES28_KEY = 'squish-campaign-rules28';
/** Neue Zug-Schwellen (launch-28) der nachgeschärften Level: id → [three, two]. Erzeugt von tools/campaign/apply28.mjs. */
export const REGRADE28 = Object.freeze({"12":[5,8],"13":[6,9],"16":[5,7],"21":[5,8],"23":[8,12],"24":[6,8],"26":[6,9],"29":[10,12],"30":[16,17],"36":[7,11],"38":[10,13],"39":[14,17],"48":[10,14],"60":[18,21],"66":[12,17],"68":[12,15],"71":[16,22],"77":[14,17],"80":[19,21],"81":[17,23],"86":[12,16],"92":[11,13],"96":[13,23],"98":[10,14]});
export function migrateRules28Once(progress, inv, storage = globalThis.localStorage, { tag = RULES28, thresholds = REGRADE28 } = {}) {
  let done = null;
  try { done = storage?.getItem(RULES28_KEY); } catch {}
  if (!tag || done === tag) return { progress, inventory: inv, migrated: false };
  const oldTotal = totalStars(progress);
  const open = new Set(progress.openChapters || []);
  for (let k = 2; k <= 100; k++) {
    const n = chapterStart(k);
    if (progress.levels[String(n - 1)] && oldTotal >= STARS_PER_CHAPTER_GATE * (k - 1)) open.add(k);
  }
  const levels = {};
  for (const [id, r] of Object.entries(progress.levels || {})) {
    let stars = Math.max(0, Math.min(3, r?.stars | 0));
    const th = thresholds[id];
    if (th && Number.isInteger(r?.moves)) stars = Math.min(stars, r.moves <= th[0] ? 3 : r.moves <= th[1] ? 2 : 1);
    levels[id] = { ...r, stars: Math.max(1, stars) };
  }
  const p = { ...progress, levels, updatedAt: Date.now() };
  if (open.size) p.openChapters = [...open].sort((a, b) => a - b);
  const out = { ...emptyInventory(), gifts: [...(inv?.gifts || [])], pending: (inv?.pending || []).filter(g => g && String(g.id).startsWith(GIFT_PREFIX + '-') && ADVENTURE_TOOLS.includes(g.type)), at: inv?.at || 0 };
  saveProgress(p, storage);
  saveInventory(out, storage, false);
  try { storage?.setItem(RULES28_KEY, tag); } catch {}
  return { progress: p, inventory: out, migrated: true };
}


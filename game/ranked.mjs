// Ranked runs: deterministic, server-verifiable solo games.
// Shared verbatim between the client (game/ranked.mjs) and the Edge Function.
// A run = server-issued seed + compact move log. Replaying the log with the
// same seed reproduces board, queue, score, moves and peak exactly.
import { SIZE, createStartValues, insertTile, settle, isGameOver } from "./game-logic.mjs";
import { nextSpawn } from "./balance.mjs";

export const DIRECTIONS = ["left", "right", "up", "down"];
export const MAX_LOG = 20000;

/** One character per move: 'a'..'t' = direction index * SIZE + line. */
export function encodeMove(direction, line) {
  const d = DIRECTIONS.indexOf(direction);
  if (d < 0 || !Number.isInteger(line) || line < 0 || line >= SIZE) throw new RangeError("Ungültiger Zug");
  return String.fromCharCode(97 + d * SIZE + line);
}
export function decodeMove(ch) {
  const n = ch.charCodeAt(0) - 97;
  if (!(n >= 0 && n < DIRECTIONS.length * SIZE)) return null;
  return { direction: DIRECTIONS[Math.floor(n / SIZE)], line: n % SIZE };
}
export const LOG_RE = /^[a-t]*$/;

/** mulberry32 with exposed state, so a preview can be drawn from a clone. */
export function createRng(seed) {
  const rng = () => {
    rng.state = (rng.state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(rng.state ^ (rng.state >>> 15), 1 | rng.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.state = seed >>> 0;
  rng.clone = () => createRng(rng.state);
  return rng;
}

const maxValue = (board) => Math.max(0, ...board.flat().filter(Boolean).map((t) => t.value));

/** Same steps as the client's freshState(). */
export function createRun(seed) {
  const random = createRng(seed);
  const values = createStartValues(random);
  let nextId = 1;
  const board = values.map((row) => row.map((value) => (value === null ? null : { id: nextId++, value })));
  const queue = Array.from({ length: 3 }, () => nextSpawn({ board, moves: 0, highest: 4, random }));
  const peak = Math.max(...values.flat().filter((v) => v !== null));
  return { state: { board, queue, score: 0, moves: 0, peak, nextId }, random };
}

/** Same steps as the client's move(). Returns false if the row is full. */
export function applyMove(run, direction, line) {
  const s = run.state;
  const tile = { id: s.nextId, value: s.queue[0] };
  const inserted = insertTile(s.board, direction, line, tile);
  if (!inserted.accepted) return false;
  s.nextId += 1;
  s.queue = s.queue.slice(1);
  const settled = settle(inserted.board);
  s.board = settled.board;
  s.score += settled.points;
  s.moves += 1;
  s.peak = Math.max(s.peak, maxValue(s.board));
  s.queue.push(nextSpawn({ board: s.board, moves: s.moves, highest: s.peak, random: run.random }));
  return true;
}

/**
 * Replays a whole run. Any impossible move (bad character, full row, move
 * after game over) makes the run invalid.
 */
export function replayRun(seed, log) {
  if (typeof log !== "string" || !LOG_RE.test(log) || log.length > MAX_LOG) return { ok: false, reason: "log" };
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) return { ok: false, reason: "seed" };
  const run = createRun(seed);
  for (let i = 0; i < log.length; i++) {
    if (isGameOver(run.state.board)) return { ok: false, reason: "after-game-over", at: i };
    const m = decodeMove(log[i]);
    if (!m || !applyMove(run, m.direction, m.line)) return { ok: false, reason: "illegal-move", at: i };
  }
  return { ok: true, run, state: run.state, over: isGameOver(run.state.board) };
}

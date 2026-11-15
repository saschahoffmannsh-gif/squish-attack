// Hinweis-Suche (launch-12): kürzester Gewinnweg ab dem aktuellen Kampagnen-
// Zustand, gleiche Regeln wie tools/campaign/solver.mjs (Breitensuche über die
// Zugtiefe mit Transpositionstabelle; Zustand = Brett + gedeckelter
// Zielfortschritt, Steinfolge-Position = Tiefe). Liefert nur die ersten
// Züge (Standard 2). Reine Logik ohne DOM – läuft im Worker oder direkt.
import { SIZE, insertTile, settle } from './game-logic.mjs';
import { ALL_MOVES, encodeMove } from './campaign.mjs?v=launch-13';

const MOVE_CHARS = ALL_MOVES.map(m => encodeMove(m.direction, m.line));
export const targetOf = g => ({ tile: g.value, make: g.count, score: g.points, clear: g.tiles, street: g.count, combo: g.chain })[g.type];

function keyOf(board) {
  let s = '';
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) { const t = board[r][c]; s += t === null ? '.' : t.value.toString(36); }
  return s;
}
function boardOf(key) {
  const b = [];
  for (let r = 0; r < SIZE; r++) { const row = []; for (let c = 0; c < SIZE; c++) { const ch = key[r * SIZE + c]; row.push(ch === '.' ? null : { value: parseInt(ch, 36) }); } b.push(row); }
  return b;
}
function advance(goals, vec, settled) {
  const out = vec.slice(); let done = true;
  for (let i = 0; i < goals.length; i++) {
    const g = goals[i]; let v = out[i];
    switch (g.type) {
      case 'tile': for (const p of settled.passes) for (const x of p) if (x.nextValue > v) v = x.nextValue; v = Math.min(v, g.value); break;
      case 'make': for (const p of settled.passes) for (const x of p) if (x.nextValue >= g.value) v++; v = Math.min(v, g.count); break;
      case 'score': v = Math.min(v + settled.points, g.points); break;
      case 'clear': for (const p of settled.passes) for (const x of p) v += x.cells.length - 1; v = Math.min(v, g.tiles); break;
      case 'street': for (const p of settled.passes) for (const x of p) if (x.street) v++; v = Math.min(v, g.count); break;
      case 'combo': v = Math.min(Math.max(v, settled.passes.length), g.chain); break;
    }
    out[i] = v; if (v < targetOf(g)) done = false;
  }
  return { vec: out, win: done };
}

/**
 * state: {board: Zahlen/null 5×5, goals, sequence, index, movesLeft, vec}
 * Rückgabe: {found, moves:'ab' (1–2 Züge), minMoves, exact, states, ms, reason?}
 * Budget: maxStates (Summe aller Schichten) und maxMs; danach Beam-Suche
 * (beamWidth beste Zustände nach Zielfortschritt) – dann exact:false.
 */
export function findHint(state, { want = 2, maxStates = 160000, maxMs = 2500, beamWidth = 12000, now = () => performance.now() } = {}) {
  const t0 = now(), { goals, sequence } = state;
  const startBoard = state.board.map(row => row.map(v => (v == null ? null : { value: v })));
  let layer = new Map([[keyOf(startBoard) + '|' + state.vec.join(','), { prefix: '', vec: state.vec.slice() }]]);
  let states = 1, exact = true;
  const score = vec => vec.reduce((s, v, i) => s + v / targetOf(goals[i]), 0);
  for (let d = 0; d < state.movesLeft; d++) {
    const raw = sequence[state.index + d];
    if (raw == null) break;
    const next = new Map();
    for (const [key, node] of layer) {
      const board = boardOf(key.slice(0, SIZE * SIZE));
      for (let i = 0; i < ALL_MOVES.length; i++) {
        const { direction, line } = ALL_MOVES[i];
        const ins = insertTile(board, direction, line, { value: raw });
        if (!ins.accepted) continue;
        const settled = settle(ins.board);
        const a = advance(goals, node.vec, settled);
        const prefix = node.prefix.length < want ? node.prefix + MOVE_CHARS[i] : node.prefix;
        if (a.win) return { found: true, moves: prefix, minMoves: d + 1, exact, states, ms: now() - t0 };
        if (d + 1 >= state.movesLeft) continue;
        const ck = keyOf(settled.board) + '|' + a.vec.join(',');
        if (!next.has(ck)) next.set(ck, { prefix, vec: a.vec });
      }
    }
    if (!next.size) break;
    states += next.size;
    if (states > maxStates || now() - t0 > maxMs) {
      exact = false;
      layer = next.size > beamWidth ? new Map([...next].sort((a, b) => score(b[1].vec) - score(a[1].vec)).slice(0, beamWidth)) : next;
      if (now() - t0 > maxMs * 2) return { found: false, exact, states, ms: now() - t0, reason: 'budget' };
    } else layer = next;
  }
  return { found: false, exact, states, ms: now() - t0, reason: exact ? 'none' : 'budget' };
}

/** Zustand aus einem laufenden Kampagnen-Lauf (game/campaign.mjs createLevelRun). */
export function hintState(run, { movesLeft, vec }) {
  return { board: run.board.map(row => row.map(t => (t ? t.value : null))), goals: run.level.goals,
    sequence: run.level.sequence, index: run.index, movesLeft, vec };
}

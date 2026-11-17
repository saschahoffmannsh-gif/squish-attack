// Hinweis-Suche (launch-12): kürzester Gewinnweg ab dem aktuellen Kampagnen-
// Zustand, gleiche Regeln wie tools/campaign/solver.mjs (Breitensuche über die
// Zugtiefe mit Transpositionstabelle; Zustand = Brett + gedeckelter
// Zielfortschritt, Steinfolge-Position = Tiefe). Liefert nur die ersten
// Züge (Standard 2). Reine Logik ohne DOM – läuft im Worker oder direkt.
import { SIZE, boardCode, boardFromCode } from './game-logic.mjs?v=launch-29';
import { ALL_MOVES, encodeMove, advanceGoals, goalTarget, stepBoard } from './campaign.mjs?v=launch-29';

const MOVE_CHARS = ALL_MOVES.map(m => encodeMove(m.direction, m.line));
export const targetOf = goalTarget;

// launch-16: Schlüssel inkl. besonderer Squishes (Eis, Kette, Bombe).
const keyOf = boardCode;
const boardOf = boardFromCode;
const advance = advanceGoals;

/**
 * state: {board: Zahlen/null 5×5, goals, sequence, index, movesLeft, vec}
 * Rückgabe: {found, moves:'ab' (1–2 Züge), minMoves, exact, states, ms, reason?}
 * Budget: maxStates (Summe aller Schichten) und maxMs; danach Beam-Suche
 * (beamWidth beste Zustände nach Zielfortschritt) – dann exact:false.
 */
export function findHint(state, { want = 2, maxStates = 160000, maxMs = 2500, beamWidth = 12000, now = () => performance.now() } = {}) {
  const t0 = now(), { goals, sequence } = state;
  const startBoard = state.board.map(row => row.map(v => (v == null ? null : typeof v === 'number' ? { value: v } : { ...v })));
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
        const settled = stepBoard(board, direction, line, { value: raw });
        if (!settled) continue;
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
  return { board: run.board.map(row => row.map(t => (t ? (t.ice || t.bound || t.bomb != null ? { value: t.value, ice: t.ice || undefined, bound: t.bound || undefined, bomb: t.bomb ?? undefined } : t.value) : null))), goals: run.level.goals,
    sequence: run.level.sequence, index: run.index, movesLeft, vec };
}

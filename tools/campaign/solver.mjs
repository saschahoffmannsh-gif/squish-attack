// Solver für Kampagnen-Level. Nutzt die echte Spiellogik (insertTile/settle
// aus game/game-logic.mjs) und die Zählregeln aus game/campaign.mjs.
//
// Verfahren: schichtweise Breitensuche (BFS) über die Zugtiefe mit
// Transpositionstabelle. Ein Zustand = Brett + (gedeckelter) Zielfortschritt;
// die Position in der Steinfolge ist gleich der Tiefe. Gleiche Zustände werden
// zusammengelegt, ihre Pfadanzahlen addiert. Dadurch erhalten wir exakt:
//  - die minimale Zugzahl,
//  - eine optimale Lösung,
//  - die Anzahl optimaler Zugfolgen und den Anteil an allen Zugfolgen dieser Länge.
// Wird eine Schicht zu groß, bricht die exakte Suche ab (oder läuft als
// Beam-Suche weiter, dann ist das Ergebnis als ungenau markiert).
import { SIZE, insertTile, settle } from '../../game/game-logic.mjs';
import { ALL_MOVES, encodeMove, createLevelRun, applyLevelMove } from '../../game/campaign.mjs';
import { createRng } from '../../game/ranked.mjs';

const MOVE_CHARS = ALL_MOVES.map(m => encodeMove(m.direction, m.line));

export function boardKey(board) {
  let s = '';
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const t = board[r][c];
    s += t === null ? '.' : t.value.toString(36);
  }
  return s;
}
export function boardFromKey(key) {
  const board = [];
  for (let r = 0; r < SIZE; r++) {
    const row = [];
    for (let c = 0; c < SIZE; c++) {
      const ch = key[r * SIZE + c];
      row.push(ch === '.' ? null : { value: parseInt(ch, 36) });
    }
    board.push(row);
  }
  return { board };
}

const freshProgress = () => ({ score: 0, cleared: 0, merges: 0, streets: 0, bestCombo: 0, created: {} });

/**
 * Schnelle Fortschrittsrechnung direkt auf dem gedeckelten Zielvektor.
 * Muss exakt goalProgress()/tally() aus campaign.mjs entsprechen; das prüft
 * tests/solver.test.mjs gegen echte Partien.
 */
export function advanceVec(goals, vec, settled) {
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
    }
    out[i] = v;
    if (v < targetOf(g)) done = false;
  }
  return { vec: out, win: done };
}

/** Alle Nachfolger eines Zustands. Gibt [{move, board, vec, win}] zurück. */
export function expand(level, board, vec, depth) {
  const raw = level.sequence[depth];
  const out = [];
  for (let i = 0; i < ALL_MOVES.length; i++) {
    const { direction, line } = ALL_MOVES[i];
    const tile = { value: raw };
    const ins = insertTile(board, direction, line, tile);
    if (!ins.accepted) continue;
    const settled = settle(ins.board);
    const a = advanceVec(level.goals, vec, settled);
    out.push({ move: MOVE_CHARS[i], board: settled.board, vec: a.vec, win: a.win });
  }
  return out;
}

/**
 * Exakte Lösung per BFS. Optionen:
 *  maxDepth  – Suchtiefe (Standard: Zuglimit)
 *  maxLayer  – max. Zustände pro Schicht; darüber Abbruch (exact) bzw. Beam
 *  beam      – true: bei Überlauf die besten maxLayer Zustände behalten
 */
export function solveLevel(level, { maxDepth = level.moves, maxLayer = 400000, beam = false } = {}) {
  const t0 = performance.now();
  const goals = level.goals;
  const startRun = createLevelRun(level);
  let layer = new Map();
  const startVec = goals.map(() => 0);
  layer.set(boardKey(startRun.board) + '|' + startVec.join(','), { count: 1, parent: null, move: '', vec: startVec });
  const layers = [1];
  let states = 1, edges = 0, expanded = 0, approximate = false;
  for (let depth = 0; depth < maxDepth; depth++) {
    const next = new Map();
    let wins = null, winPaths = 0, totalPaths = 0, winStates = 0, firstMoves = new Set();
    for (const [key, node] of layer) {
      const { board } = boardFromKey(key.slice(0, SIZE * SIZE));
      const kids = expand(level, board, node.vec, depth);
      expanded++; edges += kids.length;
      for (const k of kids) {
        totalPaths += node.count;
        if (k.win) {
          winPaths += node.count; winStates++;
          if (!wins) wins = { node, move: k.move };
          continue;
        }
        const ck = boardKey(k.board) + '|' + k.vec.join(',');
        const ex = next.get(ck);
        if (ex) ex.count += node.count;
        else next.set(ck, { count: node.count, parent: node, move: k.move, vec: k.vec });
      }
    }
    if (wins) {
      let sol = wins.move;
      for (let n = wins.node; n && n.parent; n = n.parent) sol = n.move + sol;
      return {
        solvable: true, exact: !approximate, minMoves: depth + 1, solution: sol,
        optimalSolutions: winPaths, pathsAtMin: totalPaths, pOpt: winPaths / totalPaths,
        winStates, states, layers, avgBranching: edges / Math.max(1, expanded), ms: performance.now() - t0,
      };
    }
    if (!next.size) return { solvable: false, exact: !approximate, reason: 'dead-end', states, layers, ms: performance.now() - t0 };
    if (next.size > maxLayer) {
      if (!beam) return { solvable: false, exact: false, reason: 'too-large', depth: depth + 1, states, layers: [...layers, next.size], ms: performance.now() - t0 };
      approximate = true;
      const ranked = [...next].sort((a, b) => score(b[1].vec) - score(a[1].vec)).slice(0, maxLayer);
      layer = new Map(ranked);
    } else layer = next;
    states += layer.size; layers.push(layer.size);
    function score(vec) { return vec.reduce((s, v, i) => s + v / targetOf(goals[i]), 0); }
  }
  return { solvable: false, exact: !approximate, reason: 'limit', states, layers, ms: performance.now() - t0 };
}
const targetOf = g => ({ tile: g.value, make: g.count, score: g.points, clear: g.tiles, street: g.count, combo: g.chain })[g.type];

/**
 * Zufallsspieler (feste Saat): Anteil gewonnener Partien je Zuglimit.
 * winsBy[d] = Partien, die nach spätestens d Zügen gewonnen waren.
 */
export function randomPlayouts(level, { n = 400, seed = 1, depth = level.sequence.length } = {}) {
  const rng = createRng(seed);
  const lv = { ...level, moves: depth };
  const winsBy = Array(depth + 1).fill(0);
  for (let k = 0; k < n; k++) {
    const run = createLevelRun(lv);
    while (run.status === 'playing') {
      const legal = ALL_MOVES.filter(m => insertTile(run.board, m.direction, m.line, { value: 0 }).accepted);
      if (!legal.length) break;
      const m = legal[Math.floor(rng() * legal.length)];
      applyLevelMove(run, m.direction, m.line);
    }
    if (run.status === 'won') for (let d = run.moves; d <= depth; d++) winsBy[d]++;
  }
  return { n, winsBy, rate: d => winsBy[Math.min(d, depth)] / n };
}

/** Gieriger Spieler: nimmt immer den Zug mit dem größten Zielfortschritt (1 Zug Vorausschau). */
export function greedy(level, limit = level.moves) {
  let board = createLevelRun(level).board, vec = level.goals.map(() => 0);
  for (let d = 0; d < limit; d++) {
    const kids = expand(level, board, vec, d);
    if (!kids.length) return { won: false, moves: d };
    const win = kids.find(k => k.win);
    if (win) return { won: true, moves: d + 1 };
    const val = k => k.vec.reduce((s, v, i) => s + v / targetOf(level.goals[i]), 0) - k.board.flat().filter(Boolean).length * 1e-3;
    let best = kids[0];
    for (const k of kids) if (val(k) > val(best)) best = k;
    board = best.board; vec = best.vec;
  }
  return { won: false, moves: limit };
}

/**
 * Modell eines menschlichen, nicht perfekten Spielers: schaut einen Zug voraus,
 * bewertet Zielfortschritt und Brettqualität (Paare, Straßen-Ansätze, Platz) und
 * wählt per Softmax mit Rauschen. skill 0 = zufällig, skill 1 = sehr gut.
 * Liefert winsBy wie randomPlayouts; daraus lässt sich die erwartete Zahl an
 * Versuchen (1 / Gewinnrate) und später der Effekt von Hilfsmitteln schätzen.
 */
export function playerModel(level, { n = 100, seed = 7, skill = 0.6, depth = level.sequence.length, temperature } = {}) {
  const rng = createRng(seed);
  const temp = temperature ?? (0.05 + (1 - skill) * 1.5);
  const winsBy = Array(depth + 1).fill(0);
  for (let k = 0; k < n; k++) {
    let board = createLevelRun(level).board, vec = level.goals.map(() => 0);
    for (let d = 0; d < depth; d++) {
      const kids = expand(level, board, vec, d);
      if (!kids.length) break;
      const win = kids.find(x => x.win);
      if (win && rng() < 0.5 + skill / 2) { for (let j = d + 1; j <= depth; j++) winsBy[j]++; board = null; break; }
      const vals = kids.map(x => (x.win ? 3 : 0) + 3 * x.vec.reduce((s, v, i) => s + v / targetOf(level.goals[i]), 0) + boardShape(x.board));
      const m = Math.max(...vals), w = vals.map(v => Math.exp((v - m) / temp)), sum = w.reduce((a, b) => a + b);
      let r = rng() * sum, pickI = 0;
      for (; pickI < w.length - 1; pickI++) { r -= w[pickI]; if (r < 0) break; }
      const ch = kids[pickI];
      if (ch.win) { for (let j = d + 1; j <= depth; j++) winsBy[j]++; board = null; break; }
      board = ch.board; vec = ch.vec;
    }
  }
  return { n, skill, winsBy, rate: d => winsBy[Math.min(d, depth)] / n };
}

/** Grobe Brettqualität: gleiche/aufeinanderfolgende Nachbarn gut, volle Bretter schlecht. */
export function boardShape(board) {
  let pairs = 0, tiles = 0;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const t = board[r][c]; if (!t) continue; tiles++;
    for (const [dr, dc] of [[0, 1], [1, 0]]) {
      const u = board[r + dr]?.[c + dc]; if (!u) continue;
      if (u.value === t.value) pairs += 1; else if (Math.abs(u.value - t.value) === 1) pairs += 0.4;
    }
  }
  return 0.15 * pairs - 0.04 * tiles - (tiles >= 22 ? 1 : 0);
}

/**
 * Vorbereitung für Hilfsmittel (Booster). Heute umgesetzt: „+N Züge“, weil das
 * nur das Zuglimit verschiebt (die Steinfolge enthält dafür Reserve-Steine).
 * Liefert die geschätzte Gewinnrate eines Spielermodells ohne/mit Hilfsmittel
 * und die daraus folgende erwartete Zahl an Versuchen.
 * Weitere Hilfsmittel (Hammer, Tausch, Wunschstein, ...) werden später als
 * zusätzliche Aktionen in expand() modelliert, siehe docs/kampagne.md.
 */
export function toolEffect(level, tool, { n = 200, seed = 11, skill = 0.4 } = {}) {
  if (tool.type !== 'extraMoves') throw new Error(`Hilfsmittel ${tool.type} noch nicht modelliert`);
  const depth = Math.min(level.sequence.length, level.moves + tool.count);
  const pm = playerModel(level, { n, seed, skill, depth });
  const before = pm.rate(level.moves), after = pm.rate(depth);
  return { before, after, attemptsBefore: before ? 1 / before : Infinity, attemptsAfter: after ? 1 / after : Infinity };
}

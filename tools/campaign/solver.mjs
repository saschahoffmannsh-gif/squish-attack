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
import { SIZE, insertTile, settle, boardCode, boardFromCode } from '../../game/game-logic.mjs';
import { ALL_MOVES, encodeMove, createLevelRun, applyLevelMove, advanceGoals, goalTarget, stepBoard, tickLevelBombs, progressVector } from '../../game/campaign.mjs';
import { createRng } from '../../game/ranked.mjs';

const MOVE_CHARS = ALL_MOVES.map(m => encodeMove(m.direction, m.line));

// launch-16: ein Zeichen je Zelle inkl. besonderer Squishes (Eis, Kette, Bombe) – siehe game-logic.mjs.
export const boardKey = boardCode;
export function boardFromKey(key) { return { board: boardFromCode(key) }; }

/** Fortschritt weiterrechnen – gemeinsame Zählung aus campaign.mjs (advanceGoals). */
export const advanceVec = advanceGoals;

/** Alle Nachfolger eines Zustands. Gibt [{move, board, vec, win}] zurück. */
export function expand(level, board, vec, depth) {
  const raw = level.sequence[depth];
  const out = [];
  for (let i = 0; i < ALL_MOVES.length; i++) {
    const { direction, line } = ALL_MOVES[i];
    const settled = stepBoard(board, direction, line, { value: raw });
    if (!settled) continue;
    const a = advanceVec(level.goals, vec, settled);
    let createdMax = 0, merges = 0;
    for (const pass of settled.passes || []) for (const g of pass) { merges++; if (g.nextValue > createdMax) createdMax = g.nextValue; }
    out.push({ move: MOVE_CHARS[i], board: settled.board, vec: a.vec, win: a.win, points: settled.points || 0, createdMax, merges });
  }
  return out;
}

/** Längste aufsteigende Nachbar-Kette (für Straßen-Ziele). */
function streetPotential(board) {
  let best = 1;
  for (const [dr, dc] of [[0, 1], [1, 0]]) {
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      const t = board[r][c]; if (!t) continue;
      let n = 1, v = t.value, rr = r + dr, cc = c + dc;
      while (board[rr]?.[cc] && board[rr][cc].value === v + 1) { n++; v++; rr += dr; cc += dc; }
      if (n > best) best = n;
    }
  }
  return best;
}

/**
 * Brett-Potenzial zusätzlich zum Zielfortschritt. Wichtig für lange Aufbau-Ziele
 * (z. B. eine 8 bauen): der reine vec bleibt 0, bis der Zielwert entsteht.
 */
export function potential(board, goals, vec = goals.map(() => 0)) {
  const counts = Object.create(null);
  let tiles = 0, mass = 0;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const t = board[r][c]; if (!t) continue;
    const v = t.value; tiles++; counts[v] = (counts[v] || 0) + 1; mass += 2 ** Math.min(16, v);
  }
  let s = 0;
  for (let i = 0; i < goals.length; i++) {
    const g = goals[i], tgt = targetOf(g), have = vec[i] || 0, done = have / Math.max(1, tgt);
    s += 2 * done;
    if (done >= 1) continue;
    if (g.type === 'tile' || g.type === 'make') {
      const V = g.value;
      for (let v = 1; v <= V; v++) s += (counts[v] || 0) * (2 ** (v - V));
    } else if (g.type === 'score') {
      s += Math.min(1.2, have / g.points + 0.0004 * mass);
    } else if (g.type === 'clear') {
      s += have / g.tiles + 0.03 * tiles;
    } else if (g.type === 'street' || g.type === 'long') {
      s += streetPotential(board) / (g.type === 'long' ? 5 : 4);
    } else if (g.type === 'empty') {
      s += (25 - tiles) / 25;
      if (tiles <= g.max) s += 1;
    } else if (g.type === 'purge') {
      s += 0.3 * (counts[g.value] || 0);
    }
  }
  return s;
}

const kidScore = (level, k) => (k.win ? 8 : 0) + 3 * k.vec.reduce((s, v, i) => s + v / targetOf(level.goals[i]), 0) + 1.4 * potential(k.board, level.goals, k.vec) + boardShape(k.board) + 0.9 * (k.createdMax || 0) + 0.25 * (k.merges || 0) + 0.008 * (k.points || 0);

/**
 * Exakte Lösung per BFS. Optionen:
 *  maxDepth  – Suchtiefe (Standard: Zuglimit)
 *  maxLayer  – max. Zustände pro Schicht; darüber Abbruch (exact) bzw. Beam
 *  beam      – true: bei Überlauf die besten maxLayer Zustände behalten
 *  maxMs     – Zeitbudget (danach Abbruch, bei beam: bisher bestes Ergebnis oder unlösbar)
 */
export function solveLevel(level, { maxDepth = level.moves, maxLayer = 400000, beam = false, maxMs = Infinity, jitter = 0 } = {}) {
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
    let timedOut = false;
    for (const [key, node] of layer) {
      if ((expanded & 255) === 0 && performance.now() - t0 > maxMs) { timedOut = true; break; }
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
        else next.set(ck, { count: node.count, parent: node, move: k.move, vec: k.vec, pot: potential(k.board, goals, k.vec) + (jitter ? Math.sin((depth + 1) * 12.9898 + jitter * 78.233) * 0.15 : 0) });
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
    if (timedOut && !next.size) return { solvable: false, exact: !approximate, reason: 'budget', depth, states, layers, ms: performance.now() - t0 };
    if (!next.size) return { solvable: false, exact: !approximate, reason: 'dead-end', states, layers, ms: performance.now() - t0 };
    if (timedOut) {
      if (!beam) return { solvable: false, exact: false, reason: 'budget', depth: depth + 1, states, layers: [...layers, next.size], ms: performance.now() - t0 };
      approximate = true;
    }
    if (next.size > maxLayer) {
      if (!beam) return { solvable: false, exact: false, reason: 'too-large', depth: depth + 1, states, layers: [...layers, next.size], ms: performance.now() - t0 };
      approximate = true;
      const ranked = [...next].sort((a, b) => (b[1].pot ?? 0) - (a[1].pot ?? 0)).slice(0, maxLayer);
      layer = new Map(ranked);
    } else layer = next;
    states += layer.size; layers.push(layer.size);
    if (performance.now() - t0 > maxMs) return { solvable: false, exact: !approximate, reason: 'budget', depth: depth + 1, states, layers, ms: performance.now() - t0 };
  }
  return { solvable: false, exact: !approximate, reason: 'limit', states, layers, ms: performance.now() - t0 };
}
const targetOf = goalTarget;

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
    const val = k => kidScore(level, k);
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
      const vals = kids.map(x => kidScore(level, x));
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

/**
 * launch-16: Echtzeit-Simulation für Bomben-Level (der Solver kann die Uhr nur grob modellieren).
 * Spielermodell wie playerModel (1 Zug Vorausschau, Softmax), dazu Bedenkzeit je Zug gleichverteilt
 * in [secMin, secMax] Sekunden; die Bomben-Uhr läuft mit dieser Zeit (tickLevelBombs, wie im Spiel).
 * Liefert Gewinnrate im Zuglimit und Anteil Partien mit Explosion.
 */
export function simulateRealtime(level, { n = 200, seed = 5, skill = 0.6, secMin = 1.5, secMax = 5 } = {}) {
  const rng = createRng(seed);
  const temp = 0.05 + (1 - skill) * 1.5;
  let wins = 0, boom = 0;
  for (let k = 0; k < n; k++) {
    const run = createLevelRun(level);
    let vec = level.goals.map(() => 0);
    while (run.status === 'playing') {
      const kids = expand(level, run.board, vec, run.index).map((x, i) => ({ ...x, i }));
      if (!kids.length) break;
      const vals = kids.map(x => kidScore(level, x));
      const m = Math.max(...vals), w = vals.map(v => Math.exp((v - m) / temp)), sum = w.reduce((a, b) => a + b);
      let r = rng() * sum, pick = 0;
      for (; pick < w.length - 1; pick++) { r -= w[pick]; if (r < 0) break; }
      const mv = ALL_MOVES[MOVE_CHARS.indexOf(kids[pick].move)];
      if (run.bombClock) { if (tickLevelBombs(run, (secMin + rng() * (secMax - secMin)) * 1000).length) boom++; if (run.status !== 'playing') break; }
      applyLevelMove(run, mv.direction, mv.line);
      vec = progressVector(run);
    }
    if (run.status === 'won') wins++;
  }
  return { n, winRate: wins / n, explodedRate: boom / n };
}

/**
 * Mehrere geleitete Partien (wie playerModel, aber mit Pfad). Liefert die kürzeste
 * gefundene Gewinnfolge oder {won:false}. Gut als schnelle Oberschranke für lange Level.
 */
export function bestPlay(level, { n = 8, seed = 1, skill = 0.95, depth = level.moves, ply = 1 } = {}) {
  const rng = createRng(seed);
  const temp = 0.05 + (1 - skill) * 1.5;
  let best = null;
  for (let k = 0; k < n; k++) {
    let board = createLevelRun(level).board, vec = level.goals.map(() => 0), path = '';
    for (let d = 0; d < depth; d++) {
      const kids = expand(level, board, vec, d);
      if (!kids.length) break;
      const win = kids.find(x => x.win);
      if (win) {
        const moves = d + 1, solution = path + win.move;
        if (!best || moves < best.minMoves) best = { won: true, solvable: true, exact: false, approximate: true, minMoves: moves, solution };
        break;
      }
      const vals = kids.map((x, i) => {
        let s = kidScore(level, x);
        if (ply >= 2 && d + 1 < depth && !x.win) {
          const grand = expand(level, x.board, x.vec, d + 1);
          if (grand.some(g => g.win)) s += 6;
          else if (grand.length) s += 0.55 * Math.max(...grand.map(g => kidScore(level, g)));
        }
        return s;
      });
      const m = Math.max(...vals), w = vals.map(v => Math.exp((v - m) / temp)), sum = w.reduce((a, b) => a + b);
      let r = rng() * sum, pickI = 0;
      for (; pickI < w.length - 1; pickI++) { r -= w[pickI]; if (r < 0) break; }
      const ch = kids[pickI];
      path += ch.move; board = ch.board; vec = ch.vec;
    }
  }
  return best || { won: false, solvable: false, reason: 'play' };
}

// Kandidaten für die Level 11–100 (launch-15) erzeugen und bewerten.
// Alles hängt nur von (Level-Id, Saat) ab → reproduzierbar (siehe tests/levels.test.mjs).
import { settle, insertTile } from '../../game/game-logic.mjs';
import { createRng } from '../../game/ranked.mjs';
import { validateLevel, starThresholds, tilesOn, goalTarget } from '../../game/campaign.mjs';
import { findHint } from '../../game/hint-solver.mjs';
import { solveLevel, randomPlayouts, playerModel, greedy, expand, bestPlay } from './solver.mjs';
import { solveWithTool, playerFrom, startBoard, toolVariants, stateAfter } from './tools-solver.mjs';
import { MISSIONS, TOOL_LEVELS, GEN, VARIETY, targetD, roleOf, RETIRED_GOALS, moveWindow, minMovesWanted } from './plan100.mjs';

export const RESERVE = 5;
export const STATS = {};
const why = r => { STATS[r] = (STATS[r] || 0) + 1; return null; };
const N_MODEL = 160, N_RAND = 2500;
// Mit dem Schlüssel-Werkzeug „bequem“: Gelegenheitsspieler gewinnt mindestens so oft.
export const CAS_TOOL = 0.4;
const int = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const weighted = (rng, max, focus) => {
  const w = Array.from({ length: max }, (_, i) => (max - i + 1) * (focus === i + 1 ? 3 : 1)), sum = w.reduce((a, b) => a + b);
  let x = rng() * sum; for (let i = 0; i < max; i++) { x -= w[i]; if (x < 0) return i + 1; } return max;
};
const log2 = x => Math.log2(x);
/** Schwierigkeit D (wie Planungsseite): 12·log2(1/pGel)+6·log2(1/pGut)+2·log2(1/pZufall)+3·(Min−1)+5·[gierig scheitert]+4·(Ziele−1). */
export function difficulty({ pCas, pGood, pRand, min, greedyFails, goals, window }, n = 400) {
  const sm = p => (p * n + 0.5) / (n + 1);
  const length = window ? 40 * (min / window) : 3 * (min - 1);
  const att = p => Math.min(16, 1 / sm(p));
  const d = 8 * log2(att(pCas)) + 4 * log2(att(pGood)) + 1.5 * log2(1 / Math.max(2e-5, pRand)) + length + (greedyFails ? 5 : 0) + 4 * (goals - 1);
  return Math.max(0, Math.min(100, Math.round(d)));
}

// Brett-Parameter je Zielart; bei mehreren Zielen wird der Bereich vereinigt.
function params(goals, id) {
  const P = [];
  for (const g of goals) switch (g.type) {
    case 'tile': case 'make': {
      const cap = Math.max(2, Math.min(4, (g.value ?? 4) - 2));
      const many = (g.value ?? 4) >= 5;
      P.push({ tiles: many ? [8, 16] : [6, 14], maxV: [2, cap], seq: [2, Math.min(4, cap)] }); break;
    }
    case 'score': P.push({ tiles: [6, 14], maxV: [2, 4], seq: [2, 4] }); break;
    case 'clear': P.push({ tiles: [6, 16], maxV: [2, 4], seq: [2, 3] }); break;
    case 'street': case 'long': P.push({ tiles: [6, 14], maxV: [2, 4], seq: [2, 4] }); break;
    case 'combo': P.push({ tiles: [7, 16], maxV: [2, 4], seq: [2, 3] }); break;
    case 'empty': P.push({ tiles: [g.max + 4, g.max + 10], maxV: [2, 3], seq: [2, 3] }); break;
    case 'purge': P.push({ tiles: [6, 13], maxV: [g.value, g.value + 1], seq: [Math.max(2, g.value), g.value + 1], focus: g.value }); break;
  }
  const lo = k => Math.min(...P.map(p => p[k][0])), hi = k => Math.max(...P.map(p => p[k][1]));
  return { tiles: [lo('tiles'), hi('tiles')], maxV: [lo('maxV'), hi('maxV')], seq: [lo('seq'), hi('seq')], focus: P.find(p => p.focus)?.focus };
}
export const seedFor = (id, k) => ((id * 1000003) ^ (k * 2654435761)) >>> 0;

const LINES = (() => { const out = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) for (const [dr, dc] of [[0, 1], [1, 0]]) out.push([[r, c], [r + dr, c + dc], [r + 2 * dr, c + 2 * dc]]);
  return out.filter(l => l.every(([r, c]) => r < 5 && c < 5)); })();
const K = ([r, c]) => r * 5 + c;
/**
 * Vorbereitete Muster am Einschub-Feld eines Randzugs:
 *  chain – len Fusionen hintereinander; long – Straße aus 4; pairs – je ein fertiges Paar für die nächsten Steine.
 * Rückgabe {board, trigger, move, taken, E} oder null.
 */
function entryOf(direction, line) { return direction === 'right' ? [line, 0] : direction === 'left' ? [line, 4] : direction === 'down' ? [0, line] : [4, line]; }
function lineCells(direction, line) { return [0, 1, 2, 3, 4].map(i => direction === 'right' ? [line, i] : direction === 'left' ? [line, 4 - i] : direction === 'down' ? [i, line] : [4 - i, line]); }
function plant(rng, spec, maxV, sequence) {
  const dirs = ['left', 'right', 'up', 'down'];
  const board = Array.from({ length: 5 }, () => Array(5).fill(null)), taken = new Set();
  if (spec.kind === 'pairs') {
    const n = int(rng, ...spec.n);
    for (let t = 0; t < n; t++) {
      let ok = false;
      for (let tries = 0; tries < 30 && !ok; tries++) {
        const E = entryOf(dirs[int(rng, 0, 3)], int(rng, 0, 4));
        if (taken.has(K(E))) continue;
        const opts = LINES.filter(l => l.some(c => K(c) === K(E)) && l.every(c => K(c) === K(E) || !taken.has(K(c))));
        if (!opts.length) continue;
        const l = opts[int(rng, 0, opts.length - 1)];
        taken.add(K(E));
        for (const c of l) if (K(c) !== K(E)) { board[c[0]][c[1]] = sequence[t]; taken.add(K(c)); }
        ok = true;
      }
      if (!ok) return null;
    }
    return { board, taken, trigger: null };
  }
  const direction = dirs[int(rng, 0, 3)], line = int(rng, 0, 4), E = entryOf(direction, line);
  taken.add(K(E));
  let trigger;
  if (spec.kind === 'chain') {
    const a = int(rng, 1, 2); trigger = a;
    let X = E, cur = a;
    for (let step = 0; step < spec.len; step++) {
      const opts = LINES.filter(l => l.some(c => K(c) === K(X)) && l.every(c => K(c) === K(X) || !taken.has(K(c))));
      if (!opts.length) return null;
      const l = opts[int(rng, 0, opts.length - 1)];
      for (const c of l) if (K(c) !== K(X)) { board[c[0]][c[1]] = cur; taken.add(K(c)); }
      X = l[1]; cur++;
    }
  } else if (spec.kind === 'long5') {
    // Fast fertige Straße aus 5 entlang der ganzen Reihe, eine Lücke für den Auslöser.
    const order = lineCells(direction, line);
    const up = rng() < 0.5, s0 = int(rng, 1, Math.max(1, maxV - 3)), f = [0, 1, 2, 3, 4].map(i => s0 + (up ? i : 4 - i));
    const g = int(rng, 1, 3);
    trigger = f[g];
    for (let i = 0; i < 5; i++) {
      if (i === g) { taken.add(K(order[i])); continue; }
      const [r, c] = order[i]; board[r][c] = f[i]; taken.add(K([r, c]));
    }
  } else {
    // Straße aus 4 entlang der Einschub-Reihe: der Auslöser schiebt die Steine bis zur Lücke (g = 1 oder 2) weiter.
    const order = lineCells(direction, line);
    const up = rng() < 0.5, s0 = int(rng, 1, Math.max(1, maxV - 2)), f = [0, 1, 2, 3].map(i => s0 + (up ? i : 3 - i));
    const g = int(rng, 1, 2);
    trigger = f[0];
    for (let i = 0; i < 4; i++) { if (i === g) continue; const v = i < g ? f[i + 1] : f[i]; const [r, c] = order[i]; board[r][c] = v; taken.add(K([r, c])); }
    taken.add(K(order[g]));
  }
  return { board, trigger, move: { direction, line }, taken, E };
}
/** Kandidat (Brett + Steinfolge) für Level id aus Saat k. */
export function makeLevel(id, k, seqLen) {
  if (seqLen == null) seqLen = (moveWindow(id) ?? 12) + RESERVE;
  if (MISSIONS[id].goals.some(g => RETIRED_GOALS.includes(g.type))) throw new Error(`L${id}: Zielart nicht mehr im Pool`);
  const goals = MISSIONS[id].goals, rng = createRng(seedFor(id, k)), p = params(goals, id), gen = GEN[id] || {}, variety = VARIETY[id] || {};
  if (variety.climb) {
    const top = Math.max(5, ...goals.filter(g => g.type === 'tile' || g.type === 'make').map(g => g.value || 5));
    p.maxV = [3, 4]; p.seq = [3, 4];
    p.tiles = top >= 7 ? [12, 16] : top === 6 ? [8, 13] : [8, 12];
    p.climbTop = top;
  }

  const tilesR = gen.tiles || p.tiles, P = gen.plant;
  for (let attempt = 0; attempt < 400; attempt++) {
    const maxV = int(rng, ...p.maxV), seqMax = int(rng, ...p.seq);
    const top = variety.climb ? (p.climbTop || 5) : 0;
    const climbSeq = () => top >= 7 ? (rng() < 0.1 ? 2 : rng() < 0.6 ? 3 : 4) : (rng() < 0.2 ? 2 : rng() < 0.8 ? 3 : 4);
    const climbTile = () => top >= 7 ? (rng() < 0.06 ? 2 : rng() < 0.62 ? 3 : 4) : (rng() < 0.15 ? 2 : rng() < 0.82 ? 3 : 4);
    const sequence = Array.from({ length: seqLen }, () => variety.climb ? climbSeq() : weighted(rng, seqMax, p.focus));
    let board = Array.from({ length: 5 }, () => Array(5).fill(null)), planted = null, missingVals = [];
    const protect = new Set();
    if (P) {
      planted = plant(rng, P, Math.max(4, maxV), sequence);
      if (!planted) continue;
      board = planted.board;
      if (P.kind !== 'pairs') {
        const probe = insertTile(board.map(r => r.map(v => (v == null ? null : { value: v }))), planted.move.direction, planted.move.line, { value: planted.trigger });
        const st = settle(probe.board);
        const longOk = st.passes.some(ps => ps.some(g => g.street && g.cells.length >= (P.kind === 'long5' ? 5 : 4)));
        if (P.kind === 'chain' ? st.passes.length < P.len : !longOk) continue;
        const cells = [...planted.taken].filter(x => board[Math.floor(x / 5)][x % 5] != null);
        const miss = int(rng, ...(P.missing || [0, 0]));
        for (let m = 0; m < miss && cells.length; m++) { const x = cells.splice(int(rng, 0, cells.length - 1), 1)[0]; missingVals.push(board[Math.floor(x / 5)][x % 5]); board[Math.floor(x / 5)][x % 5] = null; }
        // falscher Stein (für den Zauberstab): ein vorbereiteter Stein bekommt einen anderen Wert
        for (let w = 0; w < (P.wrong || 0) && cells.length; w++) {
          const x = cells.splice(int(rng, 0, cells.length - 1), 1)[0], r = Math.floor(x / 5), c = x % 5, v = board[r][c];
          board[r][c] = v + (rng() < 0.5 && v > 1 ? -1 : 1) * int(rng, 1, 2) || v + 1;
          if (board[r][c] < 1) board[r][c] = v + 2;
        }
        // Blocker (für die Rakete): Einschub-Feld besetzt und die Einschub-Reihe voll
        if (P.block) for (const [r, c] of lineCells(planted.move.direction, planted.move.line)) {
          if (board[r][c] == null) { board[r][c] = weighted(rng, Math.max(3, maxV)); protect.add(r * 5 + c); }
        }
      }
    }
    const n = int(rng, ...tilesR) - tilesOn(board);
    const free = Array.from({ length: 25 }, (_, i) => i).filter(i => board[Math.floor(i / 5)][i % 5] == null && !(planted && planted.taken.has(i)));
    for (let i = free.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [free[i], free[j]] = [free[j], free[i]]; }
    free.slice(0, Math.max(0, n)).forEach(i => { board[Math.floor(i / 5)][i % 5] = variety.climb ? climbTile() : weighted(rng, maxV, p.focus); });
    if (variety.climb) {
      for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
        if (board[r][c] == null) continue;
        if (board[r][c] > 4) board[r][c] = 4;
        if (board[r][c] === 1) board[r][c] = climbTile();
      }
    }
    const free2 = () => Array.from({ length: 25 }, (_, i) => i).filter(i => board[Math.floor(i / 5)][i % 5] == null);
    if (variety.has5 && !board.some(r => r.includes(5))) {
      const spots = free2();
      if (spots.length) { const i = spots[int(rng, 0, spots.length - 1)]; board[Math.floor(i / 5)][i % 5] = 5; }
      else {
        const lows = Array.from({ length: 25 }, (_, i) => i).filter(i => { const v = board[Math.floor(i / 5)][i % 5]; return v && v <= 4; });
        if (lows.length) { const i = lows[int(rng, 0, lows.length - 1)]; board[Math.floor(i / 5)][i % 5] = 5; }
      }
    }
    // Ziel 8: ein 6er und ein 7er als Zwischenstufen, sonst ist 40 Züge oft zu knapp.
    // Weit auseinander setzen, damit sie nicht in wenigen Zügen zur 8 ketten.
    if (variety.climb && (p.climbTop || 0) >= 8) {
      const placeFar = (v, avoid) => {
        if (board.some(r => r.includes(v))) return;
        const score = i => {
          const r = Math.floor(i / 5), c = i % 5;
          return avoid.reduce((s, j) => s + Math.abs(r - Math.floor(j / 5)) + Math.abs(c - (j % 5)), 0);
        };
        let spots = free2();
        if (!spots.length) spots = Array.from({ length: 25 }, (_, i) => i).filter(i => { const x = board[Math.floor(i / 5)][i % 5]; return x && x <= 4; });
        if (!spots.length) return;
        spots.sort((a, b) => score(b) - score(a));
        const i = spots[0];
        board[Math.floor(i / 5)][i % 5] = v;
        return i;
      };
      const a5 = board.flat().findIndex((v, i) => v === 5);
      const i6 = placeFar(6, a5 >= 0 ? [a5] : []);
      placeFar(7, [a5, i6].filter(x => x != null && x >= 0));
    }
    if (variety.high) {
      const [lo, hi] = variety.high, hv = int(rng, lo, hi);
      const spots = free2();
      const i = spots.length ? spots[int(rng, 0, spots.length - 1)] : int(rng, 0, 24);
      board[Math.floor(i / 5)][i % 5] = hv;
    }
    const tiles = board.map(r => r.map(v => (v == null ? null : { value: v })));
    if (settle(tiles).passes.length) continue;
    if (goals.some(g => g.type === 'empty' && tilesOn(tiles) <= g.max + 1)) continue;
    if (variety.has5 && !board.some(r => r.includes(5))) continue;
    if (variety.high && !board.some(r => r.some(v => v >= 20))) continue;
    if (planted && P.kind !== 'pairs') {
      const at = int(rng, ...(P.at || [0, 0]));
      missingVals.forEach((v, i) => { sequence[i] = v; });
      sequence[Math.max(at, missingVals.length)] = planted.trigger;
    }
    return { board, sequence, goals: goals.map(g => ({ ...g })), variety };
  }
  return null;
}

function minRange(id, role) {
  if (GEN[id]?.min) return GEN[id].min;
  if (role === 'relief') return id < 40 ? [2, 3] : id < 70 ? [2, 4] : [2, 5];
  if (role === 'milestone') return id < 50 ? [3, 5] : [3, 6];
  return id < 40 ? [2, 4] : id < 70 ? [2, 5] : [3, 6];
}
const asLevel = (id, c, moves) => ({ id, board: c.board, sequence: c.sequence, goals: c.goals, moves, stars: { three: 1, two: moves } });

/** Kennzahlen eines (Teil-)Levels ab einem Zustand: Gelegenheits-/Gut-/Zufallsspieler + Gieriger, je Zuglimit. */
export function metricsFrom(lv, board, vec, depth0, maxDepth, seed, { nModel = N_MODEL, nRand = N_RAND } = {}) {
  const cas = playerFrom(lv, board, vec, depth0, maxDepth, { n: nModel, seed: seed ^ 0xca5, skill: 0.4 });
  const good = playerFrom(lv, board, vec, depth0, maxDepth, { n: nModel, seed: seed ^ 0x600d, skill: 0.8 });
  const sub = { ...lv, board: board.map(r => r.map(t => (t ? t.value : null))), sequence: lv.sequence.slice(depth0), moves: maxDepth - depth0, stars: { three: 1, two: maxDepth - depth0 } };
  const rnd = randomPlayouts(sub, { n: nRand, seed: seed ^ 0x5eed, depth: maxDepth - depth0 });
  const gr = L => greedy(sub, L - depth0).won;
  return { cas: L => cas.rate(L), good: L => good.rate(L), rnd: L => { const r = rnd.rate(L - depth0); return r > 0 ? r : 0.5 / nRand; }, greedy: gr, nModel };
}
export const Dat = (m, L, min, goals, window) => difficulty({ pCas: m.cas(L), pGood: m.good(L), pRand: m.rnd(L), min, greedyFails: !m.greedy(L), goals, window }, m.nModel || N_MODEL);
const metricOpts = W => W > 24 ? { nModel: 24, nRand: 80 } : W > 16 ? { nModel: 36, nRand: 120 } : {};
const toolCasMin = (role, W) => role === 'boss' || W > 20 ? 0.15 : 0.2;


function bestOf(cands) {
  const ok = cands.filter(s => s && s.solvable && s.solution);
  if (!ok.length) return cands.find(s => s) || { solvable: false, reason: 'none' };
  ok.sort((a, b) => a.minMoves - b.minMoves);
  const best = ok[0];
  return { ...best, exact: !!best.exact, approximate: !best.exact, solvable: true };
}

/** Lösung im Zugfenster: kurze Level exakt (BFS), lange per geleitetem Spiel + Beam. */
export function solveCandidate(lv, maxDepth, { minLo = 0 } = {}) {
  if (maxDepth <= 12) return solveLevel(lv, { maxDepth, maxLayer: 200000, maxMs: 4000 });
  const shortCap = Math.min(12, maxDepth);
  const short = solveLevel(lv, { maxDepth: shortCap, maxLayer: 40000, beam: true, maxMs: 1600 });
  if (short.solvable && short.minMoves < Math.max(4, minLo - 3)) return { ...short, tooEasy: true };
  const plays = [];
  const seeds = maxDepth >= 24 ? [0x51f0, 7, 99, 4242, 13, 111] : [0x51f0, 7, 99];
  const nPlay = maxDepth >= 24 ? 4 : 8, ply = maxDepth >= 20 ? 2 : 1;
  for (const seed of seeds) {
    const p = bestPlay(lv, { n: nPlay, seed, skill: 0.99, depth: maxDepth, ply });
    plays.push(p);
    if (p.solvable) break;
  }
  const playHit = plays.find(p => p.solvable);
  if (playHit) {
    const beam = solveLevel(lv, { maxDepth: Math.min(maxDepth, playHit.minMoves), maxLayer: 7000, beam: true, maxMs: 1800 });
    return bestOf([short, playHit, beam]);
  }
  const b1 = solveLevel(lv, { maxDepth, maxLayer: 7000, beam: true, maxMs: 2000 });
  const b2 = solveLevel(lv, { maxDepth, maxLayer: 7000, beam: true, maxMs: 1600, jitter: 3 });
  return bestOf([short, ...plays, b1, b2]);
}

/**
 * Bewertet Kandidat k für Level id (launch-18). Ohne Werkzeug immer lösbar im Zugfenster.
 * Werkzeug-Spitzen: Limit = Optimum (sehr eng), mit dem Schlüssel-Werkzeug deutlich leichter.
 */
export function evaluate(id, k) {
  const role = roleOf(id), tool = TOOL_LEVELS[id], target = targetD(id), seed = seedFor(id, k);
  const W = moveWindow(id);
  if (!W) return why('r0');
  const [mlo, mhi] = minMovesWanted(id);
  const c = makeLevel(id, k, W + RESERVE);
  if (!c) return why('r1');
  const G = c.goals.length, lv = asLevel(id, c, W);
  const sol = solveCandidate(lv, W, { minLo: mlo });
  const hardLo = Math.max(4, mlo - 5);
  if (!sol.solvable || !sol.solution) return why('r2n');
  if (sol.tooEasy || sol.minMoves < hardLo) return why('r2e');
  if (sol.minMoves > W) return why('r2l');
  const m = sol.minMoves;
  const midWant = Math.round((mlo + mhi) / 2);
  const lengthCost = Math.abs(m - midWant) * 1.2 + Math.max(0, mlo - m) * 3;
  const opts = metricOpts(W);
  if (!tool) {
    const L = W;
    const M = metricsFrom(lv, startBoard(lv), lv.goals.map(() => 0), 0, L, seed, opts);
    const D = Dat(M, L, m, G, W);
    return { id, k, seed, role, tool: null, limit: L, min: m, D, Dfelt: D, cost: Math.abs(D - target) + lengthCost,
      solution: sol.solution, exact: !!sol.exact, approximate: !sol.exact,
      optimal: sol.optimalSolutions ?? null, pOpt: sol.pOpt ?? null,
      cas: M.cas(L), good: M.good(L), rnd: M.rnd(L), greedy: M.greedy(L) };
  }
  // Werkzeug-Spitze: ohne Werkzeug lösbar, Limit = Optimum (höchstens 1 Zug Luft, falls Optimum unter der Wunsch-Untergrenze + 1).
  const L = m;
  const top = tool === 'extraMoves' ? m + 3 : m;
  const full = asLevel(id, c, top);
  const M = metricsFrom(full, startBoard(full), full.goals.map(() => 0), 0, top, seed, opts);
  const Dno = Dat(M, L, m, G, W);
  let Dfelt, casTool, goodTool, toolMin = m, toolSolution = sol.solution, goodStarts = null, hintMoves = null;
  if (tool === 'extraMoves') {
    Dfelt = Dat(M, L + 3, m, G, W); casTool = M.cas(L + 3); goodTool = M.good(L + 3);
    if (casTool < toolCasMin(role, W)) return why('t1');
  } else if (tool === 'hint') {
    const h = findHint({ board: c.board, goals: c.goals, sequence: c.sequence, index: 0, movesLeft: L, vec: c.goals.map(() => 0) }, { want: 2, maxMs: 4000, now: () => 0 });
    if (!h.found || h.moves.length < 2) return why('t2');
    const st = stateAfter(asLevel(id, c, L), h.moves, L);
    if (!st || st.win) return why('t3');
    const H = metricsFrom(asLevel(id, c, L), st.board, st.vec, 2, L, seed ^ 0x41, opts);
    casTool = H.cas(L); goodTool = H.good(L); Dfelt = Dat(H, L, Math.max(1, m - 2), G, W); hintMoves = h.moves;
    if (casTool < toolCasMin(role, W)) return why('t4');
  } else {
    const T = tool === 'rocket' ? 'rocket' : 'wand', probe = asLevel(id, c, L);
    const cap = Math.max(1, m - 2);
    const wt = solveWithTool(probe, cap, T, { startOnly: true, maxLayer: 40000 });
    if (wt.min == null || wt.min < 1 || wt.min > cap) return why('t5');
    toolMin = wt.min; toolSolution = wt.path.trim();
    const act = toolSolution.split(' ')[0];
    const after = toolVariants(probe, startBoard(probe), probe.goals.map(() => 0), 0, L, T).find(v => v.act === act);
    if (!after) return why('t6');
    const Mt = metricsFrom(probe, after.board, after.vec, 0, L, seed ^ 0x70, opts);
    Dfelt = Dat(Mt, L, toolMin, G, W); casTool = Mt.cas(L); goodTool = Mt.good(L);
    if (casTool < toolCasMin(role, W)) return why('t7');
    goodStarts = 0;
    for (const v of toolVariants(probe, startBoard(probe), probe.goals.map(() => 0), 0, L, T)) {
      if (v.win) { goodStarts++; continue; }
      const s = solveCandidate({ ...probe, board: v.board.map(r => r.map(t => (t ? t.value : null))) }, L);
      if (s.solvable) goodStarts++;
      if (goodStarts >= 8) break;
    }
    if (goodStarts < 2) return why('t8');
  }
  const cost = Math.abs(Dfelt - target) + Math.max(0, target + 10 - Dno) * 0.4 + lengthCost;
  return { id, k, seed, role, tool, limit: L, min: m, toolMin, D: Dno, Dfelt, cost,
    solution: sol.solution, toolSolution, exact: !!sol.exact, approximate: !sol.exact,
    optimal: sol.optimalSolutions ?? null, pOpt: sol.pOpt ?? null,
    cas: M.cas(L), good: M.good(L), rnd: M.rnd(L), greedy: M.greedy(L), casTool, goodTool,
    ...(goodStarts != null ? { goodStarts } : {}), ...(hintMoves ? { hintMoves } : {}) };
}

/** Wie evaluate() – in launch-18 gelten dieselben Werkzeug-Regeln. */
export function evaluatePeak(id, k) { return evaluate(id, k); }

// Kandidaten für die Level 11–100 (launch-15) erzeugen und bewerten.
// Alles hängt nur von (Level-Id, Saat) ab → reproduzierbar (siehe tests/levels.test.mjs).
import { settle, insertTile } from '../../game/game-logic.mjs';
import { createRng } from '../../game/ranked.mjs';
import { validateLevel, starThresholds, tilesOn, goalTarget } from '../../game/campaign.mjs';
import { findHint } from '../../game/hint-solver.mjs';
import { solveLevel, randomPlayouts, playerModel, greedy, expand } from './solver.mjs';
import { solveWithTool, playerFrom, startBoard, toolVariants, stateAfter } from './tools-solver.mjs';
import { MISSIONS, TOOL_LEVELS, GEN, targetD, roleOf } from './plan100.mjs';

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
export function difficulty({ pCas, pGood, pRand, min, greedyFails, goals }, n = 400) {
  const sm = p => (p * n + 0.5) / (n + 1);
  const d = 12 * log2(1 / sm(pCas)) + 6 * log2(1 / sm(pGood)) + 2 * log2(1 / Math.max(2e-5, pRand)) + 3 * (min - 1) + (greedyFails ? 5 : 0) + 4 * (goals - 1);
  return Math.max(0, Math.min(100, Math.round(d)));
}

// Brett-Parameter je Zielart; bei mehreren Zielen wird der Bereich vereinigt.
function params(goals, id) {
  const P = [];
  for (const g of goals) switch (g.type) {
    case 'tile': case 'make': P.push({ tiles: [5, 12], maxV: [Math.max(2, g.value - 2), g.value - 1], seq: [2, Math.min(4, g.value - 1)] }); break;
    case 'score': P.push({ tiles: [5, 13], maxV: [2, 5], seq: [2, 4] }); break;
    case 'clear': P.push({ tiles: [6, 14], maxV: [2, 4], seq: [2, 3] }); break;
    case 'street': case 'long': P.push({ tiles: [5, 12], maxV: [3, 5], seq: [3, 4] }); break;
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
export function makeLevel(id, k, seqLen = 18) {
  const goals = MISSIONS[id].goals, rng = createRng(seedFor(id, k)), p = params(goals, id), gen = GEN[id] || {};
  const tilesR = gen.tiles || p.tiles, P = gen.plant;
  for (let attempt = 0; attempt < 400; attempt++) {
    const maxV = int(rng, ...p.maxV), seqMax = int(rng, ...p.seq);
    const sequence = Array.from({ length: seqLen }, () => weighted(rng, seqMax, p.focus));
    let board = Array.from({ length: 5 }, () => Array(5).fill(null)), planted = null, missingVals = [];
    const protect = new Set();
    if (P) {
      planted = plant(rng, P, Math.max(4, maxV), sequence);
      if (!planted) continue;
      board = planted.board;
      if (P.kind !== 'pairs') {
        const probe = insertTile(board.map(r => r.map(v => (v == null ? null : { value: v }))), planted.move.direction, planted.move.line, { value: planted.trigger });
        const st = settle(probe.board);
        if (P.kind === 'chain' ? st.passes.length < P.len : !st.passes.some(ps => ps.some(g => g.street && g.cells.length >= 4))) continue;
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
    free.slice(0, Math.max(0, n)).forEach(i => { board[Math.floor(i / 5)][i % 5] = weighted(rng, maxV, p.focus); });
    const tiles = board.map(r => r.map(v => (v == null ? null : { value: v })));
    if (settle(tiles).passes.length) continue;
    if (goals.some(g => g.type === 'empty' && tilesOn(tiles) <= g.max + 1)) continue;
    if (planted && P.kind !== 'pairs') {
      const at = int(rng, ...(P.at || [0, 0]));
      missingVals.forEach((v, i) => { sequence[i] = v; });
      sequence[Math.max(at, missingVals.length)] = planted.trigger;
    }
    return { board, sequence, goals: goals.map(g => ({ ...g })) };
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
export function metricsFrom(lv, board, vec, depth0, maxDepth, seed) {
  const cas = playerFrom(lv, board, vec, depth0, maxDepth, { n: N_MODEL, seed: seed ^ 0xca5, skill: 0.4 });
  const good = playerFrom(lv, board, vec, depth0, maxDepth, { n: N_MODEL, seed: seed ^ 0x600d, skill: 0.8 });
  const sub = { ...lv, board: board.map(r => r.map(t => (t ? t.value : null))), sequence: lv.sequence.slice(depth0), moves: maxDepth - depth0, stars: { three: 1, two: maxDepth - depth0 } };
  const rnd = randomPlayouts(sub, { n: N_RAND, seed: seed ^ 0x5eed, depth: maxDepth - depth0 });
  const gr = L => greedy(sub, L - depth0).won;
  return { cas: L => cas.rate(L), good: L => good.rate(L), rnd: L => { const r = rnd.rate(L - depth0); return r > 0 ? r : 0.5 / N_RAND; }, greedy: gr };
}
export const Dat = (m, L, min, goals) => difficulty({ pCas: m.cas(L), pGood: m.good(L), pRand: m.rnd(L), min, greedyFails: !m.greedy(L), goals }, N_MODEL);

/**
 * Bewertet Kandidat k für Level id. Rückgabe null (unbrauchbar) oder
 * {k, limit, D, Dfelt, raw, ...} – D = ohne Werkzeug, Dfelt = mit Schlüssel-Werkzeug (sonst = D).
 */
export function evaluate(id, k) {
  const role = roleOf(id), tool = TOOL_LEVELS[id], target = targetD(id), seed = seedFor(id, k);
  const c = makeLevel(id, k);
  if (!c) return why('r1');
  const G = c.goals.length;
  if (!tool) {
    const [mlo, mhi] = minRange(id, role);
    const sol = solveLevel(asLevel(id, c, mhi), { maxDepth: mhi, maxLayer: 120000 });
    if (!sol.solvable || !sol.exact || sol.minMoves < mlo) return why('r2');
    const m = sol.minMoves, top = m + 6;
    const lv = asLevel(id, c, top), M = metricsFrom(lv, startBoard(lv), lv.goals.map(() => 0), 0, top, seed);
    let best = null;
    for (let slack = 3; slack <= 6; slack++) {
      const L = m + slack, D = Dat(M, L, m, G);
      const cost = Math.abs(D - target) + (slack - 3) * 0.15;
      if (!best || cost < best.cost) best = { cost, L, D };
    }
    const L = best.L;
    return { id, k, seed, role, tool: null, limit: L, min: m, D: best.D, Dfelt: best.D, cost: best.cost, solution: sol.solution,
      optimal: sol.optimalSolutions, pOpt: sol.pOpt, cas: M.cas(L), good: M.good(L), rnd: M.rnd(L), greedy: M.greedy(L) };
  }
  if (tool === 'extraMoves') {
    // Ohne Werkzeug unlösbar im Limit (Min = Limit + 1 … + 2), mit +3 bequem.
    const hi = id >= 60 ? 7 : 6;
    const sol = solveLevel(asLevel(id, c, hi), { maxDepth: hi, maxLayer: 120000 });
    if (!sol.solvable || !sol.exact || sol.minMoves < 4) return why('r3');
    const m = sol.minMoves, lv = asLevel(id, c, m + 4), M = metricsFrom(lv, startBoard(lv), lv.goals.map(() => 0), 0, m + 4, seed);
    let best = null;
    for (const L of [m - 1, m - 2]) {
      if (L < 3) continue;
      const Dfelt = Dat(M, L + 3, m, G), casTool = M.cas(L + 3);
      if (casTool < CAS_TOOL) continue;
      const cost = Math.abs(Dfelt - target) + (m - L - 1) * 0.5;
      if (!best || cost < best.cost) best = { cost, L, Dfelt, casTool };
    }
    if (!best) return why('r4');
    const L = best.L;
    return { id, k, seed, role, tool, limit: L, min: m, toolMin: m, D: Dat(M, L, m, G), Dfelt: best.Dfelt, cost: best.cost, solution: sol.solution,
      toolSolution: sol.solution, optimal: sol.optimalSolutions, pOpt: sol.pOpt, cas: M.cas(L), good: M.good(L), rnd: M.rnd(L), greedy: M.greedy(L),
      casTool: best.casTool, goodTool: M.good(L + 3) };
  }
  if (tool === 'hint') {
    // Lösbar, aber eng: Gelegenheitsspieler ≤ 12 %; der Hinweis (2 Züge, wie im Spiel) macht es bequem.
    const sol = solveLevel(asLevel(id, c, 6), { maxDepth: 6, maxLayer: 150000 });
    if (!sol.solvable || !sol.exact || sol.minMoves < 4) return why('r5');
    const m = sol.minMoves;
    let best = null;
    for (const L of [m, m + 1]) {
      const lv = asLevel(id, c, L);
      const M = metricsFrom(lv, startBoard(lv), lv.goals.map(() => 0), 0, L, seed);
      if (M.cas(L) > 0.2 || M.good(L) > 0.6) continue;
      const h = findHint({ board: c.board, goals: c.goals, sequence: c.sequence, index: 0, movesLeft: L, vec: c.goals.map(() => 0) }, { want: 2, maxMs: 4000, now: () => 0 });
      if (!h.found || h.moves.length < 2) continue;
      const st = stateAfter(lv, h.moves, L);
      if (!st || st.win) continue;
      const H = metricsFrom(lv, st.board, st.vec, 2, L, seed ^ 0x41);
      const casTool = H.cas(L);
      if (casTool < CAS_TOOL) continue;
      const Dfelt = Dat(H, L, Math.max(1, m - 2), G);
      const cost = Math.abs(Dfelt - target) + (L - m) * 0.3;
      if (!best || cost < best.cost) best = { cost, L, Dfelt, casTool, goodTool: H.good(L), hint: h.moves, M };
    }
    if (!best) return why('r6');
    const L = best.L, M = best.M;
    return { id, k, seed, role, tool, limit: L, min: m, toolMin: m, D: Dat(M, L, m, G), Dfelt: best.Dfelt, cost: best.cost, solution: sol.solution,
      toolSolution: sol.solution, hintMoves: best.hint, optimal: sol.optimalSolutions, pOpt: sol.pOpt, cas: M.cas(L), good: M.good(L), rnd: M.rnd(L), greedy: M.greedy(L),
      casTool: best.casTool, goodTool: best.goodTool };
  }
  // Rakete / Zauberstab: Werkzeug am Anfang → lösbar mit Min tm; ohne Werkzeug nicht im Limit.
  const T = tool === 'rocket' ? 'rocket' : 'wand';
  const Lmax = 7;
  const probe = asLevel(id, c, Lmax);
  const raw = solveLevel(probe, { maxDepth: Lmax, maxLayer: 150000 });
  if (!raw.exact || (raw.solvable && raw.minMoves < 3)) return why('r7');
  const noToolMin = raw.solvable ? raw.minMoves : Infinity;
  const wt = solveWithTool(probe, Math.min(Lmax - 1, noToolMin - 2), T, { startOnly: true, maxLayer: 60000 });
  if (wt.min == null || wt.min < 1) return why('r8');
  const tm = wt.min;
  const act = wt.path.trim().split(' ')[0];
  const after = toolVariants(probe, startBoard(probe), probe.goals.map(() => 0), 0, Lmax, T).find(v => v.act === act);
  let best = null;
  for (let L = Math.max(3, tm + 1); L <= tm + 4; L++) {
    if (L >= noToolMin || L > Lmax) continue;
    const lv = asLevel(id, c, L);
    const Mt = metricsFrom(lv, after.board, after.vec, 0, L, seed ^ 0x70);
    const casTool = Mt.cas(L);
    if (casTool < CAS_TOOL) continue;
    const Dfelt = Dat(Mt, L, tm, G);
    const cost = Math.abs(Dfelt - target);
    if (!best || cost < best.cost) best = { cost, L, Dfelt, casTool, goodTool: Mt.good(L) };
  }
  if (!best) return why('r9');
  const L = best.L, lv = asLevel(id, c, L);
  // Wie viele Start-Einsätze führen zum Ziel im Limit? (Fairness: nicht nur ein einziger Trick)
  let goodStarts = 0;
  for (const v of toolVariants(lv, startBoard(lv), lv.goals.map(() => 0), 0, L, T)) {
    if (v.win) { goodStarts++; continue; }
    const s = solveLevel({ ...lv, board: v.board.map(r => r.map(t => (t ? t.value : null))) }, { maxDepth: L, maxLayer: 8000, beam: true });
    if (s.solvable) goodStarts++;
    if (goodStarts >= 12) break;
  }
  if (goodStarts < 2) return why('r10');
  const M = metricsFrom(lv, startBoard(lv), lv.goals.map(() => 0), 0, L, seed);
  return { id, k, seed, role, tool, limit: L, min: Number.isFinite(noToolMin) ? noToolMin : null, toolMin: tm, D: Dat(M, L, Number.isFinite(noToolMin) ? noToolMin : L + 1, G),
    Dfelt: best.Dfelt, cost: best.cost + (goodStarts < 4 ? 2 : 0), solution: null, toolSolution: wt.path.trim().replace(' ', ' '), goodStarts,
    cas: M.cas(L), good: M.good(L), rnd: M.rnd(L), greedy: M.greedy(L), casTool: best.casTool, goodTool: best.goodTool };
}

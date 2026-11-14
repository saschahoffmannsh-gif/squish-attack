#!/usr/bin/env node
// Level-Generator für die Kampagne.
//   node tools/campaign/generate.mjs [--count 25] [--candidates 3000] [--seed 20261114] [--workers 6]
// 1. Erzeugt Kandidaten mit fester Saat (reproduzierbar) und bewertet sie parallel
//    mit dem Solver (exakte Minimalzüge, Anzahl optimaler Lösungen, Spielermodelle).
// 2. Wählt 100 Level entlang einer Schwierigkeitskurve aus und schreibt
//    levels/levels-001-<count>.json (sortiert, mit verifizierter Lösung je Level).
//    Die Kurve ist auf 100 Level ausgelegt; --count 25 liefert die ersten 25 davon.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cpus } from 'node:os';
import { evaluateCandidate, SEQ_LEN } from './candidates.mjs';
import { replaySolution, validateLevel, ROCK } from '../../game/campaign.mjs';
import { createRng } from '../../game/ranked.mjs';

export const RESERVE = 5; // Reserve-Steine hinter dem Zuglimit (für ein späteres „+Züge“-Hilfsmittel)

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');

if (!isMainThread) {
  for (const seed of workerData.seeds) {
    let r;
    try { r = evaluateCandidate(seed); } catch (e) { r = { seed, ok: false, reason: 'error:' + e.message }; }
    parentPort.postMessage(r);
  }
  parentPort.postMessage({ done: true });
}

function arg(name, def) { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; }

async function main() {
  const N = Number(arg('candidates', 3000)), base = Number(arg('seed', 20261114)) >>> 0;
  const workers = Number(arg('workers', Math.max(1, Math.min(6, cpus().length - 1))));
  const cacheDir = join(here, '.cache'); mkdirSync(cacheDir, { recursive: true });
  const cacheFile = join(cacheDir, `pool-${base}-${N}.json`);
  let pool;
  if (existsSync(cacheFile) && !process.argv.includes('--fresh')) {
    pool = JSON.parse(readFileSync(cacheFile, 'utf8'));
    console.log(`Pool aus Cache: ${pool.length} Kandidaten`);
  } else {
    const seeds = Array.from({ length: N }, (_, i) => (base + i * 7919) >>> 0);
    const results = []; const t0 = Date.now();
    await Promise.all(Array.from({ length: workers }, (_, w) => new Promise((res, rej) => {
      const mine = seeds.filter((_, i) => i % workers === w);
      const wk = new Worker(fileURLToPath(import.meta.url), { workerData: { seeds: mine } });
      wk.on('message', m => {
        if (m.done) return res();
        results.push(m);
        if (results.length % 100 === 0) console.log(`${results.length}/${N} bewertet, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      });
      wk.on('error', rej);
    })));
    pool = results.sort((a, b) => a.seed - b.seed);
    writeFileSync(cacheFile, JSON.stringify(pool));
    const ok = pool.filter(r => r.ok);
    const ms = pool.map(r => r.ms || 0).sort((a, b) => a - b);
    console.log(`Bewertet: ${pool.length}, brauchbar: ${ok.length}, Zeit ${((Date.now() - t0) / 1000).toFixed(0)} s, Solver Median ${ms[ms.length >> 1].toFixed(0)} ms, p95 ${ms[Math.floor(ms.length * .95)].toFixed(0)} ms`);
  }
  const count = Number(arg('count', 25));
  const levels = select(pool.filter(r => r.ok), count);
  const outDir = join(root, 'levels'); mkdirSync(outDir, { recursive: true });
  const out = { version: 1, generator: { seed: base, candidates: N, seqLen: SEQ_LEN, reserve: RESERVE }, count: levels.length, levels };
  const file = `levels-001-${String(count).padStart(3, '0')}.json`;
  writeFileSync(join(outDir, file), JSON.stringify(out, null, 1) + '\n');
  console.log(`Geschrieben: levels/${file} (${levels.length} Level)`);
}

// ---------------- Auswahl ----------------
// Einführung der Zielarten: [ab Level, Zielart]. Kurze Kampagne (≤ 40 Level) komprimiert.
const SCHEDULE_LONG = [[1, 'tile'], [7, 'make'], [13, 'clear'], [19, 'street'], [25, 'score'], [31, 'combo'], [37, 'rocks'], [45, 'duo']];
const SCHEDULE_SHORT = [[1, 'tile'], [5, 'make'], [9, 'clear'], [13, 'street'], [17, 'score'], [21, 'combo'], [23, 'rocks']];
let SCHEDULE = SCHEDULE_LONG, COUNT = 100;
const smooth = (wins, n) => (wins + 0.5) / (n + 1);
const lg = x => -Math.log10(x);
const tOf = i => (i - 1) / Math.max(1, COUNT - 1);   // 0 = erstes, 1 = letztes Level

// Ziel-Gewinnrate des Gelegenheitsspielers (Spielermodell, skill 0.4) beim Zuglimit.
export function targetRate(i) {
  const t = tOf(i);
  let p = 0.95 - 0.83 * Math.pow(t, 0.9);               // Level 1 ≈ 95 % → letztes Level ≈ 12 %
  if (i % 10 === 1 && i > 1) p += 0.12;                // Verschnaufpause nach jedem 10er-Block
  if (i % 10 === 0) p -= 0.04;                          // Block-Boss
  if (SCHEDULE.some(([at]) => at === i || at + 1 === i) && i > 1) p += 0.12; // neue Zielart erst sanft
  return Math.min(0.97, Math.max(0.05, p));
}
function slackRange(i) { const t = tOf(i); return t < 0.2 ? [3, 4] : t < 0.45 ? [2, 3] : t < 0.75 ? [1, 3] : [1, 2]; }
function minMovesRange(i) { const t = tOf(i); return i === 1 ? [1, 1] : i === 2 ? [1, 2] : t < 0.3 ? [2, 4] : t < 0.6 ? [2, 5] : t < 0.8 ? [3, 6] : [4, 7]; }
function segmentOf(i) {
  const starts = SCHEDULE.map(([at]) => at), last = starts[starts.length - 1];
  if (i < last + 8) return starts.filter(a => a <= i).pop();
  return last + 8 + Math.floor((i - last - 8) / 10) * 10;
}

export function difficultyOf(c, limit) {
  const pR = smooth(c.winsBy[limit], c.playouts), pC = smooth(c.casualBy[limit], c.models), pG = smooth(c.goodBy[limit], c.models);
  const greedyWins = c.greedyBy[Math.min(4, limit - c.minMoves)];
  return 2 * c.minMoves + 2 * lg(c.pOpt) + 4 * lg(pR) + 12 * lg(pC) + 6 * lg(pG) + (greedyWins ? 0 : 3) + (c.level.goals.length - 1) * 2;
}

function select(pool, count = 100) {
  COUNT = count; SCHEDULE = count <= 40 ? SCHEDULE_SHORT : SCHEDULE_LONG;
  const seen = new Set(), unique = [];
  for (const c of pool) if (!seen.has(c.key)) { seen.add(c.key); unique.push(c); }
  const used = new Set(), chosen = [];
  const introduced = [];
  for (let i = 1; i <= count; i++) {
    const intro = SCHEDULE.find(([at]) => at === i || at + 1 === i);
    for (const [at, k] of SCHEDULE) if (at <= i && !introduced.includes(k)) introduced.push(k);
    const recent = chosen.slice(-4).map(c => c.kind);
    const kinds = intro ? [intro[1]] : introduced;
    const [mlo, mhi] = minMovesRange(i), [slo, shi] = slackRange(i), target = targetRate(i);
    let best = null;
    for (let relax = 0; relax < 3 && !best; relax++)
    for (const c of unique) {
      if (used.has(c.seed)) continue;
      if (relax < 2 && !kinds.includes(c.level.kind)) continue;
      if (relax < 1 && (c.minMoves < mlo || c.minMoves > mhi)) continue;
      // Tutorial: kleine Zielwerte, übersichtliches Brett.
      if (relax < 1 && i <= 2 && (c.level.goals[0].value > 3 || c.level.board.flat().filter(v => v !== null).length > 8)) continue;
      for (let slack = slo; slack <= shi; slack++) {
        const limit = c.minMoves + slack;
        if (limit > SEQ_LEN) continue;
        if (relax < 2 && tOf(i) > 0.2 && c.greedyBy[Math.min(4, slack)]) continue;          // gieriges Spiel darf es später nicht lösen
        const pC = smooth(c.casualBy[limit], c.models);
        let cost = Math.abs(Math.log(pC) - Math.log(target));
        cost += recent.filter(k => k === c.level.kind).length * 0.25;     // Abwechslung
        if (!best || cost < best.cost) best = { c, slack, limit, cost, kind: c.level.kind };
      }
    }
    if (!best) throw new Error(`Kein Kandidat für Level ${i}`);
    used.add(best.c.seed); chosen.push(best);
  }
  // Innerhalb eines Abschnitts nach Schwierigkeit sortieren. Abschnitte = Einführung
  // einer neuen Zielart (1–6, 7–12, …, 37–44), ab Level 45 Blöcke à 10 Level.
  const scored = chosen.map((b, idx) => ({ ...b, segment: segmentOf(idx + 1), d: difficultyOf(b.c, b.limit) }));
  const ordered = [];
  const introSlot = idx => SCHEDULE.some(([at]) => at > 1 && (at === idx + 1 || at + 1 === idx + 1));
  scored.forEach((s, idx) => { s.intro = introSlot(idx); });
  // Einführungs-Level einer neuen Zielart bleiben vorn im Abschnitt.
  for (const seg of [...new Set(scored.map(s => s.segment))]) ordered.push(...scored.filter(s => s.segment === seg).sort((a, b) => (b.intro - a.intro) || (a.d - b.d)));
  ordered.forEach((s, idx) => { s.chapter = Math.floor(idx / 10) + 1; });
  // Normierung auf die 100er-Skala (fest), damit Werte bei 25 und 100 Leveln vergleichbar bleiben.
  const dMin = 0, dMax = 60;
  return ordered.map((s, idx) => {
    const c = s.c, limit = s.limit;
    const level = {
      id: idx + 1,
      chapter: s.chapter,
      kind: c.level.kind,
      board: c.level.board,
      sequence: withReserve(c, limit),
      moves: limit,
      goals: c.level.goals,
      stars: { three: c.minMoves, two: c.minMoves + Math.ceil((limit - c.minMoves) / 2) },
      solution: c.solution,
      meta: {
        seed: c.seed,
        difficulty: Math.max(0, Math.min(100, Math.round((s.d - dMin) / (dMax - dMin) * 100))),
        difficultyRaw: +s.d.toFixed(2),
        minMoves: c.minMoves,
        slack: limit - c.minMoves,
        optimalSolutions: c.optimalSolutions,
        pathsAtMin: Math.round(c.pOpt ? c.optimalSolutions / c.pOpt : 0),
        pOptimal: +c.pOpt.toPrecision(3),
        statesExplored: c.states,
        avgBranching: +c.avgBranching.toFixed(2),
        winRate: {
          random: +(c.winsBy[limit] / c.playouts).toFixed(3),
          casual: +(c.casualBy[limit] / c.models).toFixed(2),
          good: +(c.goodBy[limit] / c.models).toFixed(2),
        },
        // Effekt des Hilfsmittels „+3 Züge“ (Reserve-Steine) auf den Gelegenheitsspieler.
        withExtraMoves3: { casual: +(c.casualBy[Math.min(SEQ_LEN, limit + 3)] / c.models).toFixed(2), good: +(c.goodBy[Math.min(SEQ_LEN, limit + 3)] / c.models).toFixed(2) },
        expectedAttempts: { casual: +(1 / smooth(c.casualBy[limit], c.models)).toFixed(1), casualWithExtraMoves3: +(1 / smooth(c.casualBy[Math.min(SEQ_LEN, limit + 3)], c.models)).toFixed(1) },
        greedySolves: !!c.greedyBy[Math.min(4, limit - c.minMoves)],
        solverMs: Math.round(c.ms),
      },
    };
    validateLevel(level);
    const rep = replaySolution(level, level.solution);
    if (!rep.ok || rep.stars !== 3) throw new Error(`Level ${level.id}: gespeicherte Lösung ungültig`);
    return level;
  });
}

// Steinfolge = die bewerteten ersten `limit` Steine + RESERVE weitere. Reicht die
// Pool-Folge nicht, wird deterministisch (Saat des Kandidaten) verlängert.
function withReserve(c, limit) {
  const seq = c.level.sequence.slice(0, limit + RESERVE);
  const rng = createRng((c.seed ^ 0xb005) >>> 0);
  const values = c.level.sequence.filter(v => v !== ROCK);
  while (seq.length < limit + RESERVE) seq.push(values[Math.floor(rng() * values.length)]);
  return seq;
}

if (isMainThread) main();

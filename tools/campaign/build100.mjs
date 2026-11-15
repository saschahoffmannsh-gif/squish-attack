#!/usr/bin/env node
// Baut levels/levels-001-100.json (launch-15).
//   node tools/campaign/build100.mjs [--workers 7] [--only 26,27] [--assemble]
// Phase 1 (Suche, parallel, mit Cache je Level in tools/campaign/.cache/build100/):
//   für jedes neu zu bauende Level Kandidaten k = 0, 1, 2 … bewerten (evaluate100.mjs) und den
//   besten zur Zielkurve (plan100.mjs) behalten.
// Phase 2 (Zusammenbau): 1–10, 13, 14 unverändert; 11/12/16/17/18/20/24 mit mehr Zügen; Rest aus der Suche.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { evaluate, makeLevel, RESERVE } from './evaluate100.mjs';
import { MISSIONS, RETUNE, TOOL_LEVELS, targetD, roleOf } from './plan100.mjs';
import { validateLevel, starThresholds, replaySolution, chapterOf, toolStars } from '../../game/campaign.mjs';
import { solveLevel } from './solver.mjs';
import { createRng } from '../../game/ranked.mjs';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..', '..');
const cacheDir = join(here, '.cache', 'build100');
const BUILD = Object.keys(MISSIONS).map(Number).sort((a, b) => a - b);

function search(id, { budgetMs, kMax }) {
  const file = join(cacheDir, `L${id}.json`);
  let st = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { id, next: 0, best: null, tried: 0, ok: 0, spentMs: 0 };
  const role = roleOf(id), t0 = Date.now(), good = role === 'tool' || role === 'boss' ? 1.5 : 1.5;
  while (st.next < kMax && Date.now() - t0 < budgetMs) {
    if (st.best && st.best.cost <= good && st.tried >= 30) break;
    let r = null;
    try { r = evaluate(id, st.next); } catch (e) { r = null; }
    st.next++; st.tried++;
    if (r) { st.ok++; if (!st.best || r.cost < st.best.cost) st.best = r; }
    if (st.tried % 10 === 0) { st.spentMs += 0; writeFileSync(file, JSON.stringify(st)); }
  }
  st.spentMs += Date.now() - t0;
  writeFileSync(file, JSON.stringify(st));
  return st;
}

if (!isMainThread) {
  for (const id of workerData.ids) {
    const tool = !!TOOL_LEVELS[id];
    const st = search(id, { budgetMs: workerData.budget * (tool ? 2 : 1), kMax: tool ? 3000 : 1500 });
    parentPort.postMessage({ id, best: st.best, tried: st.tried, ok: st.ok });
  }
  parentPort.postMessage({ done: true });
}

function arg(name, def) { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; }

async function main() {
  mkdirSync(cacheDir, { recursive: true });
  if (!process.argv.includes('--assemble')) {
    const only = arg('only', null), ids = only ? only.split(',').map(Number) : BUILD;
    const workers = Number(arg('workers', 7)), budget = Number(arg('budget', 240)) * 1000;
    // teure Level (Werkzeug, Kette 3, spät) zuerst verteilen
    const order = [...ids].sort((a, b) => (!!TOOL_LEVELS[b] - !!TOOL_LEVELS[a]) || b - a);
    const buckets = Array.from({ length: workers }, () => []);
    order.forEach((id, i) => buckets[i % workers].push(id));
    await Promise.all(buckets.filter(b => b.length).map(b => new Promise((res, rej) => {
      const w = new Worker(fileURLToPath(import.meta.url), { workerData: { ids: b, budget } });
      w.on('message', m => { if (m.done) return res(); const b = m.best; console.log(`L${m.id} ${roleOf(m.id)} Ziel ${targetD(m.id)}: ${b ? `D ${b.D} gefühlt ${b.Dfelt} min ${b.min} wkz ${b.toolMin ?? '-'} Limit ${b.limit} (k ${b.k})` : 'KEIN KANDIDAT'} – ${m.ok}/${m.tried}`); });
      w.on('error', rej);
    })));
  }
  assemble();
}

function extendSequence(seq, len, seed) {
  const out = seq.slice(0, len), rng = createRng((seed ^ 0xb005) >>> 0);
  while (out.length < len) out.push(seq[Math.floor(rng() * seq.length)]);
  return out;
}

function assemble() {
  const old = JSON.parse(readFileSync(join(root, 'levels', 'levels-001-025.json'), 'utf8')).levels;
  const levels = [];
  for (let id = 1; id <= 100; id++) {
    const kindOf = goals => goals.length === 1 ? goals[0].type : goals.length === 2 ? 'duo' : 'trio';
    if (id <= 25 && !MISSIONS[id]) {
      const lv = structuredClone(old[id - 1]);
      if (RETUNE[id]) {
        const m = lv.meta.minMoves, L = RETUNE[id];
        lv.sequence = extendSequence(lv.sequence, L + RESERVE, lv.meta.seed);
        lv.moves = L; lv.stars = starThresholds(m, L);
        lv.meta.slack = L - m; lv.meta.retuned = { from: old[id - 1].moves, to: L };
      }
      lv.chapter = chapterOf(id);
      lv.meta.generator = 'v1';
      levels.push(lv);
      continue;
    }
    const file = join(cacheDir, `L${id}.json`);
    if (!existsSync(file)) throw new Error(`L${id}: keine Suche gelaufen`);
    const st = JSON.parse(readFileSync(file, 'utf8')), b = st.best;
    if (!b) throw new Error(`L${id}: kein Kandidat`);
    const c = makeLevel(id, b.k), L = b.limit, tool = TOOL_LEVELS[id] || null;
    const lv = {
      id, chapter: chapterOf(id), kind: kindOf(c.goals), board: c.board, sequence: c.sequence.slice(0, L + RESERVE), moves: L, goals: c.goals,
      stars: tool ? toolStars(b.toolMin, L, tool) : starThresholds(b.min, L),
      solution: tool ? b.toolSolution : b.solution,
    };
    if (tool) lv.tool = tool;
    lv.meta = {
      generator: 'build100', k: b.k, seed: b.seed, role: roleOf(id), note: MISSIONS[id].note || null,
      minMoves: b.min, slack: b.min != null ? L - b.min : null, toolMin: b.toolMin ?? null,
      optimalSolutions: b.optimal ?? null, pOptimal: b.pOpt != null ? +b.pOpt.toPrecision(3) : null,
      target: targetD(id), estimate: { D: b.D, Dfelt: b.Dfelt, casual: +b.cas.toFixed(3), good: +b.good.toFixed(3), random: +b.rnd.toPrecision(3), greedy: !!b.greedy,
        ...(tool ? { casualTool: +b.casTool.toFixed(3), goodTool: +b.goodTool.toFixed(3) } : {}), ...(b.goodStarts != null ? { goodStarts: b.goodStarts } : {}) },
      ...(b.hintMoves ? { hintMoves: b.hintMoves } : {}),
      searched: { tried: st.tried, usable: st.ok },
    };
    validateLevel(lv);
    if (!tool) {
      const rep = replaySolution(lv, lv.solution);
      if (!rep.ok || rep.stars !== 3 || rep.run.moves !== b.min) throw new Error(`L${id}: Lösung ungültig`);
    }
    levels.push(lv);
  }
  const out = { version: 2, generator: { tool: 'tools/campaign/build100.mjs', plan: 'tools/campaign/plan100.mjs', reserve: RESERVE, v1: 'Level 1–25 aus Generator v1 (Saat 20261114)' }, count: levels.length, levels };
  writeFileSync(join(root, 'levels', 'levels-001-100.json'), JSON.stringify(out, null, 1) + '\n');
  console.log(`Geschrieben: levels/levels-001-100.json (${levels.length} Level)`);
}

if (isMainThread && process.argv[1] && fileURLToPath(import.meta.url) === (await import('node:path')).resolve(process.argv[1])) main();

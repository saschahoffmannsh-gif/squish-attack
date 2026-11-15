#!/usr/bin/env node
// Ersetzt einzelne Level in levels/levels-001-100.json durch einen Kandidaten aus search-one.mjs
// (gleicher Aufbau wie build100.mjs/assemble).  node tools/campaign/replace-level.mjs <id>[:<k>] …
//   <id>:<k> = Kandidat k aus search-one.mjs, <id> allein = bester Kandidat aus build100.mjs --only
import { readFileSync, writeFileSync } from 'node:fs';
import { makeLevel, RESERVE } from './evaluate100.mjs';
import { MISSIONS, TOOL_LEVELS, targetD, roleOf } from './plan100.mjs';
import { validateLevel, starThresholds, replaySolution, chapterOf, toolStars } from '../../game/campaign.mjs';
const file = new URL('../../levels/levels-001-100.json', import.meta.url);
const data = JSON.parse(readFileSync(file, 'utf8'));
for (const spec of process.argv.slice(2)) {
  const [id, k] = spec.split(':').map(Number);
  let res, b;
  if (Number.isFinite(k)) {   // Kandidat aus search-one.mjs
    res = JSON.parse(readFileSync(new URL(`.cache/search-L${id}.json`, import.meta.url), 'utf8'));
    b = res.found.find(r => r.k === k);
  } else {                    // bester Kandidat aus build100.mjs (--only)
    res = JSON.parse(readFileSync(new URL(`.cache/build100/L${id}.json`, import.meta.url), 'utf8'));
    b = res.best;
  }
  if (!b) throw new Error(`L${id}: kein Kandidat ${k ?? ''}`);
  const c = makeLevel(id, b.k), L = b.limit, tool = TOOL_LEVELS[id] || null;
  const kindOf = g => g.length === 1 ? g[0].type : g.length === 2 ? 'duo' : 'trio';
  const lv = { id, chapter: chapterOf(id), kind: kindOf(c.goals), board: c.board, sequence: c.sequence.slice(0, L + RESERVE), moves: L, goals: c.goals,
    stars: tool ? toolStars(b.toolMin, L, tool) : starThresholds(b.min, L), solution: tool ? b.toolSolution : b.solution };
  if (tool) lv.tool = tool;
  lv.meta = { generator: 'build100', k: b.k, seed: b.seed, role: roleOf(id), note: MISSIONS[id].note || null,
    minMoves: b.min, slack: b.min != null ? L - b.min : null, toolMin: b.toolMin ?? null,
    optimalSolutions: b.optimal ?? null, pOptimal: b.pOpt != null ? +b.pOpt.toPrecision(3) : null,
    target: targetD(id), estimate: { D: b.D, Dfelt: b.Dfelt, casual: +b.cas.toFixed(3), good: +b.good.toFixed(3), random: +b.rnd.toPrecision(3), greedy: !!b.greedy,
      ...(tool ? { casualTool: +b.casTool.toFixed(3), goodTool: +b.goodTool.toFixed(3) } : {}), ...(b.goodStarts != null ? { goodStarts: b.goodStarts } : {}) },
    ...(b.hintMoves ? { hintMoves: b.hintMoves } : {}), searched: { tried: res.tried, via: Number.isFinite(k) ? 'search-one.mjs' : 'build100.mjs' } };
  validateLevel(lv);
  if (!tool) { const rep = replaySolution(lv, lv.solution); if (!rep.ok || rep.stars !== 3) throw new Error(`L${id}: Lösung ungültig`); }
  data.levels[id - 1] = lv; console.log(`L${id} ← k ${k}: Limit ${L}, gefühlt ${b.Dfelt}, Soll ${targetD(id)}`);
}
writeFileSync(file, JSON.stringify(data, null, 1) + '\n');

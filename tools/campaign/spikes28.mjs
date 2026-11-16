#!/usr/bin/env node
// launch-28: Hinweis und Zauberstab gibt es nicht mehr. Ihre Werkzeug-Spitzen (25 45 50 59 69 79 89 99)
// werden zu „+3 Züge“-Spitzen (gleiches Brett, gleiches Limit, Sterne unverändert: jeder Sieg ohne Hilfe = 3★).
// Zusätzlich übernimmt jede Spitze das echte (kürzere) Optimum der Beam-Suche aus .cache/cal28 – minMoves war
// bei langen Leveln nur eine Schätzung. Die alten Werte stehen in meta.cal28.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const root = new URL('../../', import.meta.url);
const file = new URL('levels/levels-001-100.json', root);
const data = JSON.parse(readFileSync(file, 'utf8'));
const dry = process.argv.includes('--dry');
for (const lv of data.levels) {
  if (!lv.tool) continue;
  const f = new URL(`tools/campaign/.cache/cal28/L${lv.id}.json`, root);
  const c = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
  const old = { tool: lv.tool, minMoves: lv.meta.minMoves, solution: lv.solution, toolSolution: lv.meta.toolSolution, toolMin: lv.meta.toolMin };
  let changed = false;
  if (lv.tool === 'hint' || lv.tool === 'wand') { lv.tool = 'extraMoves'; delete lv.meta.toolMin; changed = true; }
  if (c && c.min < lv.meta.minMoves && c.solution && c.solution.length === c.min) {
    lv.meta.minMoves = c.min; lv.solution = c.solution; lv.meta.exact = false; changed = true;
  }
  if (lv.tool === 'extraMoves') lv.meta.toolSolution = lv.solution;
  if (changed) { lv.meta.cal28 = { ...(lv.meta.cal28 || {}), spike: old }; console.log(lv.id, old.tool, '→', lv.tool, 'min', old.minMoves, '→', lv.meta.minMoves); }
}
if (!dry) writeFileSync(file, JSON.stringify(data, null, 1) + '\n');

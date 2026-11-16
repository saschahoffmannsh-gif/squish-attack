#!/usr/bin/env node
// launch-28 Teil 1: misst je Level (11–100, ohne Werkzeug-Spitzen) das echte Optimum per Beam-Suche
// und die Gewinnraten des Spielermodells je Zugzahl. Ergebnis: .cache/cal28/L<id>.json
//   node tools/campaign/calibrate28.mjs <ids…>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { solveLevel } from './solver.mjs';
import { playerFrom, startBoard } from './tools-solver.mjs';
const root = new URL('../../', import.meta.url);
const levels = JSON.parse(readFileSync(new URL('levels/levels-001-100.json', root), 'utf8')).levels;
const dir = new URL('tools/campaign/.cache/cal28/', root); mkdirSync(dir, { recursive: true });
for (const id of process.argv.slice(2).map(Number)) {
  const lv = levels[id - 1], L = lv.moves, t0 = Date.now();
  let min = lv.meta.minMoves, solution = lv.solution;
  if (lv.meta.exact === false || lv.meta.exact == null) {
    const s = solveLevel(lv, { maxDepth: min, maxLayer: 30000, beam: true, maxMs: 30000 });
    if (s.solvable && s.solution && s.minMoves < min) { min = s.minMoves; solution = s.solution; }
  }
  const asLv = { ...lv, tool: undefined, stars: { three: 1, two: L } }, v0 = lv.goals.map(() => 0);
  const rates = {};
  for (const [name, skill] of [['cas', 0.4], ['good', 0.8]]) {
    const p = playerFrom(asLv, startBoard(lv), v0, 0, L, { n: 100, seed: 0x28c0 + id * 7 + (skill * 10 | 0), skill });
    rates[name] = Array.from({ length: L + 1 }, (_, d) => +p.rate(d).toFixed(3));
  }
  writeFileSync(new URL(`L${id}.json`, dir), JSON.stringify({ id, moves: L, oldMin: lv.meta.minMoves, min, solution, rates, ms: Date.now() - t0 }));
  console.log(id, 'min', lv.meta.minMoves, '→', min, 'ms', Date.now() - t0);
}

#!/usr/bin/env node
// launch-16: Werkzeug-Spitzen ohne Werkzeug lösbar machen (Saschas Regel: kein Level darf ohne Werkzeug unlösbar sein).
//   node tools/campaign/untool.mjs [--slack 0] [--only 15,25]
// Für jedes Level mit level.tool: exaktes Optimum ohne Werkzeug per Solver (vollständige Suche), Zuglimit = max(Limit, Optimum + slack),
// Steinfolge verlängern (gleiches Verfahren wie build100 RETUNE), Sterne-Schwellen wie normale Level (3★ = Optimum + 1, gedeckelt aufs Limit).
// Das Brett bleibt; mit dem Schlüssel-Werkzeug bleibt es deutlich leichter (+3 Züge / weniger Züge mit Rakete/Zauberstab / Hinweis).
import { readFileSync, writeFileSync } from 'node:fs';
import { solveLevel } from './solver.mjs';
import { RESERVE } from './evaluate100.mjs';
import { starThresholds, validateLevel, replaySolution } from '../../game/campaign.mjs';
import { createRng } from '../../game/ranked.mjs';
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const slack = Number(arg('slack', 0)), only = arg('only', null)?.split(',').map(Number);
const file = new URL('../../levels/levels-001-100.json', import.meta.url);
const data = JSON.parse(readFileSync(file, 'utf8'));
function extendSequence(seq, len, seed) { const out = seq.slice(0, len), rng = createRng((seed ^ 0xb005) >>> 0); while (out.length < len) out.push(seq[Math.floor(rng() * seq.length)]); return out; }
for (const lv of data.levels) {
  if (!lv.tool || (only && !only.includes(lv.id))) continue;
  // Optimum ohne Werkzeug: Steinfolge erst großzügig verlängern, dann exakt suchen
  const probe = { ...lv, tool: undefined, sequence: extendSequence(lv.sequence, 14 + RESERVE, lv.meta.seed), moves: 12 };
  const s = solveLevel(probe, { maxDepth: 12, maxLayer: 4_000_000 });
  if (!s.exact || !s.solvable) throw new Error(`L${lv.id}: Optimum ohne Werkzeug nicht gefunden (${JSON.stringify({ exact: s.exact, solvable: s.solvable })})`);
  const min = s.minMoves, L = Math.max(lv.moves, min + slack);
  const from = { moves: lv.moves, stars: lv.stars };
  lv.sequence = extendSequence(lv.sequence, L + RESERVE, lv.meta.seed);
  lv.moves = L; lv.stars = starThresholds(min, L);
  if (lv.meta.toolSolution == null) lv.meta.toolSolution = lv.solution;   // Lösung mit dem Schlüssel-Werkzeug (R12 = Rakete, W33=3 = Zauberstab)
  lv.solution = s.solution;                                              // Lösung ohne Werkzeug (Optimum)
  lv.meta.minMoves = min; lv.meta.slack = L - min;
  lv.meta.untooled = { launch: 'launch-16', from };
  validateLevel(lv);
  const rep = replaySolution(lv, s.solution);
  if (!rep.ok || rep.stars !== 3) throw new Error(`L${lv.id}: Lösung ohne Werkzeug ungültig`);
  console.log(`L${lv.id} ${lv.tool}: Optimum ohne Werkzeug ${min}, Limit ${from.moves} → ${L}, Werkzeug-Optimum ${lv.meta.toolMin}`);
}
writeFileSync(file, JSON.stringify(data, null, 1) + '\n');

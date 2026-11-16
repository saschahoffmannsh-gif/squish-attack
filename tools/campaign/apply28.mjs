#!/usr/bin/env node
// launch-28 Teil 2: Level nachschärfen aus den Messungen von calibrate28.mjs (.cache/cal28).
// Regeln (nie lockerer als vorher):
//  - Optimum: kürzere Beam-Lösung übernehmen (meta.minMoves/solution), alte Zahl in meta.cal28.oldMin.
//  - 3★: war 3★ zu leicht (gutes Modell schafft die alte Schwelle in ≥ 45 %), Schwelle auf den
//    kleinsten Zug senken, bei dem das gute Modell ≥ 35 % schafft (mind. Optimum + 1).
//  - Zuglimit: gewinnt das Gelegenheitsmodell ≥ 90 %, Limit auf den kleinsten Zug senken, bei dem
//    es ≥ 80 % (Erholungs-Level ≥ 85 %) gewinnt, mind. 3★-Schwelle + 4.
//  - 2★: Mitte zwischen 3★ und Limit, nie über der alten 2★-Schwelle.
//   node tools/campaign/apply28.mjs [--dry]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { validateLevel, replaySolution } from '../../game/campaign.mjs';
const root = new URL('../../', import.meta.url);
const file = new URL('levels/levels-001-100.json', root);
const data = JSON.parse(readFileSync(file, 'utf8'));
const dry = process.argv.includes('--dry');
const regrade = {};
const first = (arr, x) => { for (let d = 0; d < arr.length; d++) if (arr[d] >= x) return d; return null; };
for (const lv of data.levels) {
  if (lv.id <= 10 || lv.tool) continue;
  const f = new URL(`tools/campaign/.cache/cal28/L${lv.id}.json`, root);
  if (!existsSync(f)) continue;
  const c = JSON.parse(readFileSync(f, 'utf8'));
  const g = c.rates.good, ca = c.rates.cas, M = lv.moves, old = { ...lv.stars, moves: M, min: lv.meta.minMoves };
  if (lv.moves - c.min <= 1) continue;   // enge Level bleiben
  let three = lv.stars.three;
  if (g[three] >= 0.45) three = Math.max(c.min + 1, Math.min(three, first(g, 0.35) ?? three));
  let moves = M;
  const want = lv.meta.role === 'relief' ? 0.85 : 0.8;
  if (ca[M] >= 0.9) moves = Math.min(M, Math.max(three + 4, first(ca, want) ?? M));
  let two = Math.min(lv.stars.two, three + Math.ceil((moves - three) / 2));
  if (two >= moves) two = moves - 1;
  if (two <= three) two = Math.min(moves - 1, three + 1);
  const changed = three !== old.three || two !== old.two || moves !== M;
  const shorter = c.min < lv.meta.minMoves;
  if (!changed && !shorter) continue;
  const next = { ...lv, moves, stars: { three, two }, solution: shorter ? c.solution : lv.solution,
    meta: { ...lv.meta, minMoves: c.min, slack: moves - c.min, cal28: { oldMin: old.min, oldStars: { three: old.three, two: old.two }, oldMoves: M,
      good3: g[three], cas: ca[moves], casOld: ca[M] } } };
  validateLevel(next);
  const rep = replaySolution(next, next.solution);
  if (!rep.ok || rep.stars !== 3) throw new Error(`L${lv.id}: Lösung ungültig`);
  if (changed) regrade[lv.id] = [three, two];
  console.log(String(lv.id).padStart(3), lv.meta.role.padEnd(9), `min ${old.min}→${c.min}`.padEnd(11), `${old.three}/${old.two}/${M} → ${three}/${two}/${moves}`.padEnd(24), `gut@3★ ${g[old.three]}→${g[three]}  gel@Limit ${ca[M]}→${ca[moves]}`, changed ? 'SCHÄRFER' : '');
  data.levels[lv.id - 1] = next;
}
console.log('REGRADE28', JSON.stringify(regrade));
if (!dry) {
  writeFileSync(file, JSON.stringify(data, null, 1) + '\n');
  const camp = new URL('game/campaign.mjs', root); let src = readFileSync(camp, 'utf8');
  src = src.replace(/export const REGRADE28 = Object\.freeze\(\{[^}]*\}\);/, `export const REGRADE28 = Object.freeze(${JSON.stringify(regrade)});`);
  writeFileSync(camp, src);
}

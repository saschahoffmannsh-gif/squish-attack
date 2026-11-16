#!/usr/bin/env node
// launch-28: erwartete Sterne je Level ohne Werkzeug (Spielermodell gelegentlich 0.4 / gut 0.8).
//   node tools/campaign/stars28.mjs [--only 1,2] → tools/campaign/stars-001-100.json
import { readFileSync, writeFileSync } from 'node:fs';
import { playerFrom, startBoard } from './tools-solver.mjs';
const root = new URL('../../', import.meta.url);
const levels = JSON.parse(readFileSync(new URL('levels/levels-001-100.json', root), 'utf8')).levels;
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',').map(Number) : null;
const N = Number(process.env.N || 60);
const out = [];
for (const lv of levels) {
  if (only && !only.includes(lv.id)) continue;
  const L = lv.moves, asLv = { ...lv, tool: undefined, stars: { three: 1, two: L } };
  const v0 = lv.goals.map(() => 0), b0 = startBoard(lv);
  const row = { id: lv.id, moves: L, three: lv.stars.three, two: lv.stars.two, min: lv.meta?.minMoves };
  for (const [name, skill] of [['cas', 0.4], ['good', 0.8]]) {
    const p = playerFrom(asLv, b0, v0, 0, L, { n: N, seed: 0x28000 + lv.id + (skill * 1000 | 0), skill });
    const r3 = p.rate(lv.stars.three), r2 = p.rate(lv.stars.two), r1 = p.rate(L);
    row[name] = { win: +r1.toFixed(3), p3: +r3.toFixed(3), E: +(3 * r3 + 2 * (r2 - r3) + (r1 - r2)).toFixed(2) };
  }
  out.push(row);
  console.log(lv.id, L, `3★≤${lv.stars.three} 2★≤${lv.stars.two}`, 'cas', JSON.stringify(row.cas), 'good', JSON.stringify(row.good));
}
if (!only) writeFileSync(new URL('tools/campaign/stars-001-100.json', root), JSON.stringify(out, null, 1));

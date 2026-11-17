#!/usr/bin/env node
// launch-32: Sterne aus übrigen Zügen – Spielermodell (gelegentlich 0.4 / gut 0.8) bis Limit + 3 (ein „+3“).
//   node tools/campaign/stars32.mjs [--only 1,2] → tools/campaign/stars32-001-100.json
import { readFileSync, writeFileSync } from 'node:fs';
import { playerFrom, startBoard } from './tools-solver.mjs';
import { tileAt } from '../../game/campaign.mjs';
const root = new URL('../../', import.meta.url);
const levels = JSON.parse(readFileSync(new URL('levels/levels-001-100.json', root), 'utf8')).levels;
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',').map(Number) : null;
const N = Number(process.env.N || 60);
const out = [];
for (const lv of levels) {
  if (only && !only.includes(lv.id)) continue;
  const L = lv.moves, D = L + 3;
  const seq = Array.from({ length: D + 2 }, (_, i) => tileAt(lv, i));
  const asLv = { ...lv, sequence: seq, tool: undefined, stars: { three: 1, two: D } };
  const v0 = lv.goals.map(() => 0), b0 = startBoard(lv);
  const row = { id: lv.id, moves: L, three: lv.stars.three, two: lv.stars.two, tool: lv.tool || null };
  for (const [name, skill] of [['cas', 0.4], ['good', 0.8]]) {
    const p = playerFrom(asLv, b0, v0, 0, D, { n: N, seed: 0x32000 + lv.id + (skill * 1000 | 0), skill });
    row[name] = { by: p.winsBy.map(w => +(w / N).toFixed(3)) };
  }
  out.push(row);
  console.log(lv.id, L, 'cas', row.cas.by[L], row.cas.by[D], 'good', row.good.by[L], row.good.by[D]);
}
if (!only) writeFileSync(new URL('tools/campaign/stars32-001-100.json', root), JSON.stringify(out));

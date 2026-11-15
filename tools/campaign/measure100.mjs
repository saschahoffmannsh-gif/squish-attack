#!/usr/bin/env node
// Misst die ausgelieferten 100 Level mit demselben Spielermodell wie die Planung (D-Formel der Planungsseite).
//   node tools/campaign/measure100.mjs  → tools/campaign/measure-001-100.json (+ Tabelle auf stdout)
// D = ohne Werkzeug im echten Limit; gefühlt = mit dem Schlüssel-Werkzeug (+3: Limit+3; Hinweis: nach den 2 Hinweis-Zügen;
// Rakete/Zauberstab: nach dem Werkzeug-Einsatz der gespeicherten Lösung). Normale Level: gefühlt = D.
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { metricsFrom, Dat } from './evaluate100.mjs';
import { startBoard, stateAfter } from './tools-solver.mjs';
import { findHint } from '../../game/hint-solver.mjs';
import { targetD, roleOf } from './plan100.mjs';

const root = new URL('../../', import.meta.url);
const levels = JSON.parse(readFileSync(new URL('levels/levels-001-100.json', root), 'utf8')).levels;
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',').map(Number) : null;
// Zwischenstand je Level (fortsetzbar): tools/campaign/.cache/measure100.jsonl
const part = new URL('tools/campaign/.cache/measure100.jsonl', root);
const done = new Map(existsSync(part) ? readFileSync(part, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)).map(r => [r.id, r]) : []);
const out = [];
for (const lv of levels) {
  if (only && !only.includes(lv.id)) continue;
  if (!only && done.has(lv.id) && done.get(lv.id).moves === lv.moves && JSON.stringify(done.get(lv.id).goals) === JSON.stringify(lv.goals)) { out.push(done.get(lv.id)); continue; }
  const G = lv.goals.length, seed = 0x5eed0000 + lv.id, v0 = lv.goals.map(() => 0);
  const L = lv.moves, top = L + (lv.tool === 'extraMoves' ? 3 : 0);
  const asLv = { ...lv, tool: undefined, moves: top, stars: { three: 1, two: top } };
  const M = metricsFrom(asLv, startBoard(lv), v0, 0, top, seed);
  const min = lv.meta.minMoves ?? L + 1;
  const D = Dat(M, L, min, G);
  let felt = D, casTool = null;
  if (lv.tool === 'extraMoves') { felt = Dat(M, L + 3, min, G); casTool = M.cas(L + 3); }
  else if (lv.tool === 'hint') {
    const h = findHint({ board: lv.board, goals: lv.goals, sequence: lv.sequence, index: 0, movesLeft: L, vec: v0 }, { want: 2, maxMs: 8000, now: () => 0 });
    const st = h.found ? stateAfter(asLv, h.moves, L) : null;
    if (st && !st.win) { const H = metricsFrom(asLv, st.board, st.vec, st.depth, L, seed ^ 0x41); felt = Dat(H, L, Math.max(1, min - 2), G); casTool = H.cas(L); }
  } else if (lv.tool) {
    const act = lv.solution.match(/^(R\d\d|W\d\d=\d+)/)?.[1];
    const st = act ? stateAfter(asLv, act, L) : null;
    if (st) { const H = metricsFrom(asLv, st.board, st.vec, 0, L, seed ^ 0x70); felt = Dat(H, L, lv.meta.toolMin, G); casTool = H.cas(L); }
  }
  const row = { id: lv.id, role: lv.id <= 10 ? (lv.id === 10 ? 'milestone' : 'normal') : roleOf(lv.id), tool: lv.tool ?? null, goals: lv.goals, moves: L, min: lv.meta.minMoves ?? null, toolMin: lv.meta.toolMin ?? null,
    D, felt, target: targetD(lv.id), cas: +M.cas(L).toFixed(3), good: +M.good(L).toFixed(3), casTool: casTool == null ? null : +casTool.toFixed(3) };
  out.push(row);
  if (!only) appendFileSync(part, JSON.stringify(row) + '\n');
  console.log([row.id, row.role, row.tool ?? '-', `D ${D}`, `gefühlt ${felt}`, `Soll ${row.target}`, `min ${row.min}`, `Limit ${L}`, `gel ${row.cas}`].join('\t'));
}
if (!only) writeFileSync(new URL('tools/campaign/measure-001-100.json', root), JSON.stringify({ measuredWith: 'metricsFrom N=160 Modellspiele + 2500 Zufall, D-Formel der Planungsseite', levels: out }, null, 1) + '\n');

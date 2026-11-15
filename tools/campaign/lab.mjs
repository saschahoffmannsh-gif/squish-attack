// launch-16/17: Test-Level für die neuen Squishes (Eis, Kette, Bombe) → levels/levels-lab.json.
// launch-17: Ketten tragen eine Zahl und werden durch eine Fusion daneben befreit; die Lösung von
// Level 1/2 muss das Befreien zeigen (geprüft unten).
// Nicht Teil der 100 Kampagnen-Level. Je Level: Solver (exakt, Bombe = 2,5 s pro Zug) bestimmt
// das Optimum ohne Werkzeug, Zuglimit = Optimum + slack, Sterne wie in der Kampagne.
//   node tools/campaign/lab.mjs
import { writeFileSync } from 'node:fs';
import { solveLevel, simulateRealtime } from './solver.mjs';
import { validateLevel, starThresholds, replaySolution, createLevelRun, applyLevelMove, decodeMove, specialOf } from '../../game/campaign.mjs';

const _ = null;
const DEFS = [
  { id: 1, title: 'Eis', note: 'Der gefrorene 3er rutscht mit, verschmilzt aber nicht. Verschmilz etwas direkt daneben – das Eis zerspringt und der 3er ist frei.',
    board: [[_, _, _, _, _], [3, _, 3, _, _], [_, 2, 2, _, _], [_, _, _, _, _], [_, _, _, 1, _]],
    specials: { ice: [[1, 2]] }, sequence: [2, 3, 1, 1, 2, 3, 2, 1, 3, 2, 1, 2], goals: [{ type: 'tile', value: 4 }], slack: 3 },
  { id: 2, title: 'Ketten', note: 'Angekettete Squishes bewegen sich nicht – sie sind eine Wand. Verschmilz direkt daneben, dann reißen die Ketten und der Squish ist frei.',
    board: [[_, _, _, _, _], [_, _, 1, 1, _], [_, 4, 4, _, _], [_, _, _, _, _], [_, _, _, _, 2]],
    specials: { bound: [[2, 2], [4, 4]] }, sequence: [1, 4, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2], goals: [{ type: 'tile', value: 5 }], slack: 3 },
  { id: 3, title: 'Bombe', note: 'Die Bombe zählt 20 Sekunden ab dem ersten Zug. Verschmilz sie, dann ist sie entschärft – sonst reißt sie ihre Nachbarn mit.',
    board: [[_, _, _, _, _], [_, 2, 3, _, _], [_, 4, 3, 1, _], [_, _, 4, _, _], [_, _, _, _, _]],
    specials: { bomb: [[2, 2]], bombSeconds: 20 }, sequence: [1, 4, 3, 2, 4, 1, 3, 2, 4, 3, 1, 2, 3, 4], goals: [{ type: 'tile', value: 5 }, { type: 'clear', tiles: 6 }], slack: 5 },
  { id: 4, title: 'Alles zusammen', note: 'Eis, Ketten und eine Bombe auf einem Brett.',
    board: [[1, _, _, _, _], [2, _, _, _, 3], [_, 3, 2, 2, _], [1, _, _, _, 1], [_, _, _, _, _]],
    specials: { ice: [[1, 4]], bound: [[2, 2], [0, 0]], bomb: [[2, 1]], bombSeconds: 25 }, sequence: [3, 2, 1, 2, 3, 1, 2, 3, 3, 1, 2, 2, 1, 3, 2], goals: [{ type: 'clear', tiles: 6 }, { type: 'score', points: 150 }], slack: 5 },
];

/** Wie viele Eis-/Ketten-Squishes die gespeicherte Lösung befreit (und ob der Squish danach noch da ist). */
function freedBy(lv) {
  const run = createLevelRun(lv), kinds = new Map();
  for (const row of run.board) for (const t of row) if (specialOf(t) === 'ice' || specialOf(t) === 'bound') kinds.set(t.id, specialOf(t));
  const out = { ice: 0, bound: 0 };
  for (const ch of lv.solution) {
    const m = decodeMove(ch); applyLevelMove(run, m.direction, m.line);
    for (const row of run.board) for (const t of row) if (t && kinds.has(t.id) && !specialOf(t)) { out[kinds.get(t.id)]++; kinds.delete(t.id); }
  }
  return out;
}
const out = [];
for (const d of DEFS) {
  const base = { id: d.id, board: d.board, specials: d.specials, sequence: d.sequence, goals: d.goals, moves: d.sequence.length - 3, stars: { three: 1, two: 1 } };
  validateLevel(base);
  const s = solveLevel(base, { maxDepth: base.moves });
  if (!s.solvable || !s.exact) throw new Error(`Lab ${d.id}: nicht lösbar (${s.reason})`);
  const moves = Math.min(d.sequence.length - 3, s.minMoves + d.slack);
  const lv = { id: d.id, title: d.title, board: d.board, specials: d.specials, sequence: d.sequence.slice(0, Math.max(moves + 3, d.sequence.length)), goals: d.goals, moves,
    stars: starThresholds(s.minMoves, moves), solution: s.solution, meta: { lab: true, note: d.note, minMoves: s.minMoves, pOpt: s.pOpt } };
  validateLevel(lv);
  const r = replaySolution(lv, lv.solution);
  if (!r.ok || r.stars !== 3) throw new Error(`Lab ${d.id}: Lösung ungültig`);
  const freed = freedBy(lv);
  if ((d.specials.ice && !freed.ice) || (d.id === 2 && !freed.bound)) throw new Error(`Lab ${d.id}: Lösung befreit nichts`);
  lv.meta.freed = freed;
  if (d.specials.bomb) {   // Echtzeit: Bedenkzeit 1,5–5 s (normal) und 3–8 s (langsam) je Zug
    const fast = simulateRealtime(lv, { secMin: 1.5, secMax: 5 }), slow = simulateRealtime(lv, { secMin: 3, secMax: 8, seed: 9 });
    lv.meta.realtime = { normal: fast, slow };
    console.log(`   Echtzeit-Simulation: normal ${(fast.winRate * 100).toFixed(0)} % gewonnen (${(fast.explodedRate * 100).toFixed(0)} % mit Explosion), langsam ${(slow.winRate * 100).toFixed(0)} % (${(slow.explodedRate * 100).toFixed(0)} %)`);
  }
  console.log(`Lab ${d.id} ${d.title}: Optimum ${s.minMoves}, Limit ${moves}, Lösung ${s.solution}, pOpt ${s.pOpt.toFixed(3)}`);
  out.push(lv);
}
writeFileSync(new URL('../../levels/levels-lab.json', import.meta.url), JSON.stringify({ version: 1, note: 'launch-17: Test-Level für Eis, Ketten (befreibar), Bombe (nicht Teil der Kampagne)', levels: out }, null, 1) + '\n');

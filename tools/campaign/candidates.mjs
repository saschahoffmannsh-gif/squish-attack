// Erzeugt und bewertet Level-Kandidaten. Alles hängt nur von der Saat ab,
// damit die Ergebnisse reproduzierbar sind.
import { SIZE, settle } from '../../game/game-logic.mjs';
import { createRng } from '../../game/ranked.mjs';
import { createLevelRun } from '../../game/campaign.mjs';
import { solveLevel, randomPlayouts, greedy, boardKey, playerModel } from './solver.mjs';

export const SEQ_LEN = 12;          // Länge der gespeicherten Steinfolge im Pool
export const SOLVE_DEPTH = 7;       // max. Optimal-Zugzahl, die wir suchen
// Slot 6 war früher „Felsen“ (entfernt). Er bleibt als Lücke stehen, damit die
// Zuordnung Saat → Zielart und damit alle bisherigen Kandidaten reproduzierbar bleiben.
export const KINDS = ['tile', 'make', 'clear', 'street', 'score', 'combo', null, 'duo'];

const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const int = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const weighted = (rng, max) => { // niedrige Werte häufiger
  const w = Array.from({ length: max }, (_, i) => max - i + 1), sum = w.reduce((a, b) => a + b);
  let x = rng() * sum; for (let i = 0; i < max; i++) { x -= w[i]; if (x < 0) return i + 1; } return max;
};

function makeGoal(rng, type, maxBoard, maxV) {
  switch (type) {
    case 'tile': return { type, value: Math.min(8, maxBoard + int(rng, 1, 2)) };
    case 'make': return { type, value: int(rng, 2, Math.min(6, maxBoard + 1)), count: int(rng, 2, 3) };
    case 'clear': return { type, tiles: int(rng, 3, 10) };
    case 'street': return { type, count: int(rng, 1, 3) };
    case 'score': return { type, points: 20 * int(rng, 4, 30) };
    case 'combo': return { type, chain: int(rng, 2, 3) };
  }
}

export function makeCandidate(seed) {
  const rng = createRng(seed);
  const kind = KINDS[seed % KINDS.length];
  if (!kind) return null;
  for (let attempt = 0; attempt < 50; attempt++) {
    const maxV = int(rng, 2, 5);
    const nTiles = int(rng, 3, 14);
    // Früher: 8 % Chance auf einen Fels. Der Zufallswert wird weiter gezogen (gleiche
    // Zufallsfolge wie bisher); solche Kandidaten werden jetzt verworfen.
    if (rng() < 0.08) return null;
    const cells = Array.from({ length: SIZE * SIZE }, (_, i) => i);
    for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
    const board = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    cells.slice(0, nTiles).forEach(i => { board[Math.floor(i / SIZE)][i % SIZE] = weighted(rng, maxV); });
    // Startbrett darf nichts auflösen.
    const tiles = board.map(r => r.map(v => v === null ? null : { value: v }));
    if (settle(tiles).passes.length) continue;
    const seqMax = Math.max(2, Math.min(maxV, int(rng, 2, 4)));
    const sequence = Array.from({ length: SEQ_LEN }, () => weighted(rng, seqMax));
    const maxBoard = Math.max(0, ...board.flat().filter(v => typeof v === 'number'));
    let goals;
    if (kind === 'duo') {
      const a = pick(rng, ['tile', 'make', 'clear', 'score']), b = pick(rng, ['street', 'combo', 'clear', 'tile'].filter(t => t !== a));
      goals = [makeGoal(rng, a, maxBoard, maxV), makeGoal(rng, b, maxBoard, maxV)];
    } else goals = [makeGoal(rng, kind, maxBoard, maxV)];
    return { seed, kind, board, sequence, goals, moves: SEQ_LEN, stars: { three: SEQ_LEN, two: SEQ_LEN } };
  }
  return null;
}

/** Bewertet einen Kandidaten; null, wenn unbrauchbar. */
export function evaluateCandidate(seed, { maxLayer = 60000 } = {}) {
  const lv = makeCandidate(seed);
  if (!lv) return null;
  createLevelRun(lv); // validiert
  const sol = solveLevel(lv, { maxDepth: SOLVE_DEPTH, maxLayer });
  if (!sol.solvable || !sol.exact) return { seed, ok: false, reason: sol.reason, ms: sol.ms };
  const rp = randomPlayouts(lv, { n: 200, seed: seed ^ 0x5eed, depth: SEQ_LEN });
  const casual = playerModel(lv, { n: 100, seed: seed ^ 0xca5, skill: 0.4, depth: SEQ_LEN });
  const good = playerModel(lv, { n: 100, seed: seed ^ 0x600d, skill: 0.8, depth: SEQ_LEN });
  const greedyBy = [];
  for (let slack = 0; slack <= 4; slack++) greedyBy.push(greedy(lv, Math.min(SEQ_LEN, sol.minMoves + slack)).won);
  return {
    seed, ok: true, level: lv,
    key: canonicalKey(lv),
    minMoves: sol.minMoves, solution: sol.solution, optimalSolutions: sol.optimalSolutions,
    pOpt: sol.pOpt, states: sol.states, layers: sol.layers, avgBranching: sol.avgBranching, ms: sol.ms,
    winsBy: rp.winsBy, playouts: rp.n, casualBy: casual.winsBy, goodBy: good.winsBy, models: casual.n, greedyBy,
  };
}

// Gleiche Level bis auf Drehung/Spiegelung erkennen.
export function canonicalKey(lv) {
  const variants = [];
  let b = lv.board;
  const rot = m => m[0].map((_, c) => m.map(row => row[c]).reverse());
  const flip = m => m.map(r => r.slice().reverse());
  for (let k = 0; k < 4; k++) { variants.push(b, flip(b)); b = rot(b); }
  const ks = variants.map(v => boardKey(v.map(r => r.map(x => x === null ? null : { value: x }))));
  return ks.sort()[0] + '|' + lv.sequence.join('') + '|' + JSON.stringify(lv.goals);
}

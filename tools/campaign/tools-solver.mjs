// Solver-Erweiterungen für Werkzeug-Level (launch-15): Rakete/Zauberstab einmal einsetzen,
// Hinweis-Modell, Spielermodell ab beliebigem Zustand. Gleiche Regeln wie das Spiel
// (useRocket/useWand/wandCap aus campaign.mjs).
import { SIZE, settle } from '../../game/game-logic.mjs';
import { advanceGoals, goalTarget, tilesOn, QUEUE_PREVIEW } from '../../game/campaign.mjs';
import { createRng } from '../../game/ranked.mjs';
import { boardKey, boardFromKey, expand, boardShape } from './solver.mjs';

export const startBoard = lv => lv.board.map(r => r.map(v => (v == null ? null : { value: v })));
const cloneBoard = b => b.map(r => r.map(t => (t ? { value: t.value } : null)));
const progressScore = (goals, vec) => vec.reduce((s, v, i) => s + v / goalTarget(goals[i]), 0);
/** Wie der Spieler den Fortschritt sieht: „höchstens N Steine“ zählt anteilig (Anzeige „7 → 4“). */
export const seenProgress = (goals, vec, board) => vec.reduce((s, v, i) => {
  const g = goals[i];
  if (g.type !== 'empty') return s + v / goalTarget(g);
  const n = tilesOn(board); return s + (n <= g.max ? 1 : Math.max(0, 1 - (n - g.max) / 8));
}, 0);

/** Zauberstab-Obergrenze wie wandCap(): kleinster tile/make-Zielwert, sonst größter Wert auf Brett + Vorschau (mind. 2). */
export function wandCapAt(lv, board, depth, limit) {
  const t = lv.goals.filter(g => g.type === 'tile' || g.type === 'make').map(g => g.value);
  if (t.length) return Math.min(...t);
  const seen = [...board.flat().filter(Boolean).map(x => x.value), ...lv.sequence.slice(depth, Math.min(limit, depth + QUEUE_PREVIEW))];
  return Math.max(2, ...seen);
}
/** Alle Werkzeug-Einsätze in einem Zustand → [{board, vec, win, act}] (Zauberstab: Sofort-Sieg verboten, wie im Spiel). */
export function toolVariants(lv, board, vec, depth, limit, tool) {
  const out = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const t = board[r][c]; if (!t) continue;
    if (tool === 'rocket') {
      const b = cloneBoard(board); b[r][c] = null;
      const a = advanceGoals(lv.goals, vec, { board: b, passes: [], points: 0 });   // Rakete: kein Fusionieren, nur „empty“ kann sich ändern
      out.push({ board: b, vec: a.vec, win: a.win, act: `R${r}${c}` });
      continue;
    }
    const cap = wandCapAt(lv, board, depth, limit);
    for (let v = 1; v <= cap; v++) {
      if (v === t.value) continue;
      const b = cloneBoard(board); b[r][c] = { value: v };
      const s = settle(b), a = advanceGoals(lv.goals, vec, s);
      if (a.win) continue;
      out.push({ board: s.board, vec: a.vec, win: false, act: `W${r}${c}=${v}` });
    }
  }
  return out;
}
/**
 * Kürzeste Lösung mit höchstens einem Werkzeug-Einsatz (Rakete/Zauberstab), kostet keinen Zug.
 * startOnly: Werkzeug nur vor dem ersten Zug. Rückgabe {min, path, approx} (min null = keine Lösung bis limit).
 */
export function solveWithTool(lv, limit, tool, { maxLayer = 400000, startOnly = false } = {}) {
  const key = (b, v, f) => boardKey(b) + '|' + v.join(',') + '|' + f;
  const v0 = lv.goals.map(() => 0);
  let layer = new Map([[key(startBoard(lv), v0, 0), { vec: v0, f: 0, path: '' }]]);
  let approx = false;
  for (let d = 0; d < limit; d++) {
    if (!startOnly || d === 0) for (const [k, n] of [...layer]) if (!n.f) {
      const { board } = boardFromKey(k.slice(0, SIZE * SIZE));
      for (const v of toolVariants(lv, board, n.vec, d, limit, tool)) {
        if (v.win) return { min: d, path: n.path + v.act + ' ', approx };
        const kk = key(v.board, v.vec, 1); if (!layer.has(kk)) layer.set(kk, { vec: v.vec, f: 1, path: n.path + v.act + ' ' });
      }
    }
    const next = new Map();
    for (const [k, n] of layer) {
      if (startOnly && !n.f) continue;
      const { board } = boardFromKey(k.slice(0, SIZE * SIZE));
      for (const c of expand(lv, board, n.vec, d)) {
        if (c.win) return { min: d + 1, path: n.path + c.move, approx };
        const kk = key(c.board, c.vec, n.f); if (!next.has(kk)) next.set(kk, { vec: c.vec, f: n.f, path: n.path + c.move });
      }
    }
    if (!next.size) return { min: null, approx };
    if (next.size > maxLayer) {
      approx = true;
      layer = new Map([...next].sort((a, b) => progressScore(lv.goals, b[1].vec) - progressScore(lv.goals, a[1].vec)).slice(0, maxLayer));
    } else layer = next;
  }
  return { min: null, approx };
}
/** Spielermodell (wie solver.playerModel) ab einem beliebigen Zustand; Rückgabe winsBy[d] (kumuliert, d = Gesamtzüge). */
export function playerFrom(lv, board0, vec0, depth0, depth, { n = 200, seed = 7, skill = 0.4 } = {}) {
  const rng = createRng(seed), temp = 0.05 + (1 - skill) * 1.5;
  const winsBy = Array(depth + 1).fill(0);
  for (let k = 0; k < n; k++) {
    let board = board0, vec = vec0;
    for (let d = depth0; d < depth; d++) {
      const kids = expand(lv, board, vec, d);
      if (!kids.length) break;
      const win = kids.find(x => x.win);
      if (win && rng() < 0.5 + skill / 2) { for (let j = d + 1; j <= depth; j++) winsBy[j]++; break; }
      const vals = kids.map(x => (x.win ? 3 : 0) + 3 * seenProgress(lv.goals, x.vec, x.board) + boardShape(x.board));
      const m = Math.max(...vals), w = vals.map(v => Math.exp((v - m) / temp)), sum = w.reduce((a, b) => a + b);
      let r = rng() * sum, i = 0; for (; i < w.length - 1; i++) { r -= w[i]; if (r < 0) break; }
      const ch = kids[i];
      if (ch.win) { for (let j = d + 1; j <= depth; j++) winsBy[j]++; break; }
      board = ch.board; vec = ch.vec;
    }
  }
  return { n, winsBy, rate: d => winsBy[Math.min(d, depth)] / n };
}
/** Zustand nach einer Zugfolge (Buchstaben) und optionalen Werkzeug-Aktionen ('R12', 'W12=3'). */
export function stateAfter(lv, path, limit) {
  let board = startBoard(lv), vec = lv.goals.map(() => 0), d = 0;
  for (const tok of path.match(/R\d\d|W\d\d=\d+|[a-t]/g) || []) {
    if (tok[0] === 'R' || tok[0] === 'W') {
      const v = toolVariants(lv, board, vec, d, limit, tok[0] === 'R' ? 'rocket' : 'wand').find(x => x.act === tok);
      if (!v) return null; board = v.board; vec = v.vec;
    } else {
      const k = expand(lv, board, vec, d).find(x => x.move === tok);
      if (!k) return null; board = k.board; vec = k.vec; d++;
      if (k.win) return { board, vec, depth: d, win: true };
    }
  }
  return { board, vec, depth: d, win: false };
}

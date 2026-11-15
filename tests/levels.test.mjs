// Prüft die ausgelieferten Level. Standard: alle Lösungen nachspielen, Werkzeug-Level vollständig,
// Solver auf einer Stichprobe. FULL=1 node --test tests/levels.test.mjs löst alle Level neu.
//   levels-001-025.json – Generator v1 (Quelle für die unveränderten Level 1–24 von launch-15)
//   levels-001-100.json – launch-15 (tools/campaign/build100.mjs), die Datei, die das Spiel lädt
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  validateLevel, replaySolution, createLevelRun, starThresholds, toolStars, decodeMove, applyLevelMove,
  addExtraMoves, useRocket, useWand, markToolUsed, starsOfRun, chapterOf, starGate, CHAPTER_SIZE,
} from '../game/campaign.mjs';
import { solveLevel } from '../tools/campaign/solver.mjs';
import { canonicalKey, makeCandidate } from '../tools/campaign/candidates.mjs';
import { makeLevel } from '../tools/campaign/evaluate100.mjs';
import { TOOL_LEVELS, BOSSES } from '../tools/campaign/plan100.mjs';
import { findHint } from '../game/hint-solver.mjs';
import { settle } from '../game/game-logic.mjs';

/** Spielt eine Werkzeug-Lösung mit der echten Spiellogik: Buchstaben = Züge, R12 = Rakete, W12=3 = Zauberstab. */
function replayWithTool(lv, path, { extra = false, hint = false } = {}) {
  const run = createLevelRun(lv);
  if (extra) addExtraMoves(run, 3);
  if (hint) markToolUsed(run, 'hint');
  for (const tok of path.match(/R\d\d|W\d\d=\d+|[a-t]/g) || []) {
    if (run.status !== 'playing') break;
    if (tok[0] === 'R') { if (!useRocket(run, +tok[1], +tok[2])) return { ok: false, reason: tok, run }; continue; }
    if (tok[0] === 'W') { if (!useWand(run, +tok[1], +tok[2], +tok.slice(4)).ok) return { ok: false, reason: tok, run }; continue; }
    const m = decodeMove(tok), r = applyLevelMove(run, m.direction, m.line);
    if (!r.ok) return { ok: false, reason: r.reason, run };
  }
  return { ok: run.status === 'won', run, stars: starsOfRun(run) };
}
const toolMoves = path => (path.match(/[a-t]/g) || []).join('');

const dir = new URL('../levels/', import.meta.url);
const files = readdirSync(dir).filter(f => /^levels-001-\d{3}\.json$/.test(f));
test('es gibt die Leveldatei mit 100 Leveln', () => assert.ok(files.includes('levels-001-100.json')));
test('das Spiel lädt die 100er-Datei', () => {
  const src = readFileSync(new URL('../game/game.mjs', import.meta.url), 'utf8');
  assert.match(src, /levels-001-100\.json/);
});

for (const file of files) {
const data = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
const levels = data.levels;
const expected = Number(file.match(/-(\d{3})\.json$/)[1]);
const tool = lv => lv.tool ?? null;

test(`${file}: ${expected} gültige, eindeutige Level mit fortlaufender ID`, () => {
  assert.equal(levels.length, expected);
  assert.equal(data.count, expected);
  levels.forEach((lv, i) => { validateLevel(lv); assert.equal(lv.id, i + 1); assert.ok(lv.sequence.length >= lv.moves); });
  assert.equal(new Set(levels.map(lv => canonicalKey({ ...lv, sequence: lv.sequence.slice(0, lv.moves) }))).size, expected);
  assert.equal(new Set(levels.map(lv => JSON.stringify(lv.board))).size, expected);
});

test(`${file}: keine Felsen; Sterne: normal 3★ = Optimum + 1 / Mitte, Werkzeug-Level eigene Schwellen`, () => {
  for (const lv of levels) {
    assert.ok(lv.board.flat().every(v => v === null || Number.isInteger(v)) && lv.sequence.every(Number.isInteger), `Level ${lv.id}`);
    if (tool(lv)) { assert.deepEqual(lv.stars, toolStars(lv.meta.toolMin, lv.moves, lv.tool), `Level ${lv.id}`); continue; }
    assert.deepEqual(lv.stars, starThresholds(lv.meta.minMoves, lv.moves), `Level ${lv.id}`);
    assert.equal(lv.stars.three, lv.meta.minMoves + 1);
    assert.ok(lv.stars.three < lv.stars.two && lv.stars.two < lv.moves, `Level ${lv.id}: drei Stufen`);
  }
});

test(`${file}: Level sind aus ihrer Saat reproduzierbar`, () => {
  for (const lv of levels) {
    const c = lv.meta.generator === 'build100' ? makeLevel(lv.id, lv.meta.k) : makeCandidate(lv.meta.seed);
    assert.ok(c, `Level ${lv.id}`);
    assert.deepEqual(c.board, lv.board, `Level ${lv.id}`);
    assert.deepEqual(c.goals, lv.goals, `Level ${lv.id}`);
    const n = Math.min(lv.sequence.length, lv.meta.retuned ? lv.meta.retuned.from : lv.sequence.length, c.sequence.length);
    assert.deepEqual(c.sequence.slice(0, n), lv.sequence.slice(0, n), `Level ${lv.id}`);
  }
});

test(`${file}: Startbrett löst nichts von selbst auf`, () => {
  for (const lv of levels) assert.equal(settle(createLevelRun(lv).board).passes.length, 0, `Level ${lv.id}`);
});

test(`${file}: normale Level – gespeicherte Lösung gewinnt mit der echten Spiellogik mit 3 Sternen`, () => {
  for (const lv of levels.filter(l => !tool(l))) {
    const r = replaySolution(lv, lv.solution);
    assert.ok(r.ok, `Level ${lv.id}: ${r.reason ?? r.run.status}`);
    assert.equal(lv.solution.length, lv.meta.minMoves, `Level ${lv.id}`);
    assert.equal(r.stars, 3);
  }
});

test(`${file}: Solver bestätigt Lösbarkeit und Minimalzüge (normale Level)`, () => {
  const full = process.env.FULL === '1' || levels.length <= 25;
  const sample = levels.filter((l, i) => !tool(l) && (full || i % 10 === 0 || i < 3 || i % 10 === 9));
  for (const lv of sample) {
    const s = solveLevel(lv, { maxLayer: 2_000_000 });
    assert.ok(s.solvable && s.exact, `Level ${lv.id}`);
    assert.equal(s.minMoves, lv.meta.minMoves, `Level ${lv.id}`);
    if (lv.meta.optimalSolutions != null) assert.equal(s.optimalSolutions, lv.meta.optimalSolutions, `Level ${lv.id}`);
  }
});
}

// ---------------- launch-15: 100 Level ----------------
const L100 = JSON.parse(readFileSync(new URL('levels-001-100.json', dir), 'utf8')).levels;
const V1 = JSON.parse(readFileSync(new URL('levels-001-025.json', dir), 'utf8')).levels;

test('launch-15: Level 1–10, 13, 14 unverändert; 11/12/16/17/18/20/24 nur mehr Züge', () => {
  const more = { 11: 7, 12: 8, 16: 9, 17: 8, 18: 7, 20: 7, 24: 9 };
  for (const id of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13, 14]) {
    const a = L100[id - 1], b = V1[id - 1];
    assert.deepEqual([a.board, a.goals, a.moves, a.stars, a.solution, a.sequence], [b.board, b.goals, b.moves, b.stars, b.solution, b.sequence], `Level ${id}`);
  }
  for (const [id, L] of Object.entries(more)) {
    const a = L100[id - 1], b = V1[id - 1];
    assert.equal(a.moves, L, `Level ${id}`);
    assert.deepEqual([a.board, a.goals, a.solution], [b.board, b.goals, b.solution], `Level ${id}`);
    assert.deepEqual(a.sequence.slice(0, b.moves), b.sequence.slice(0, b.moves));
  }
});

test('launch-15: Werkzeug-Level genau laut Plan, Bosse 50 und 100 brauchen ein Werkzeug, 1–14 ohne', () => {
  const got = Object.fromEntries(L100.filter(l => l.tool).map(l => [l.id, l.tool]));
  assert.deepEqual(got, Object.fromEntries(Object.entries(TOOL_LEVELS).map(([k, v]) => [Number(k), v])));
  for (const b of BOSSES) assert.ok(L100[b - 1].tool && L100[b - 1].meta.role === 'boss', `Boss ${b}`);
  assert.ok(L100.slice(0, 14).every(l => !l.tool));
  // nach jedem Werkzeug-Peak ein Erholungs-Level (ohne Werkzeug, leichter)
  for (const l of L100.filter(l => l.tool && l.id < 100 && !L100[l.id].tool)) {
    const next = L100[l.id];
    assert.ok(next.meta.estimate == null || next.meta.estimate.D < l.meta.estimate.Dfelt + 12, `nach ${l.id}`);
  }
});

test('launch-15: Werkzeug-Level – ohne Werkzeug kein 3★ (Deckel), mit dem einen Werkzeug 2★', () => {
  for (const lv of L100.filter(l => l.tool)) {
    const id = `Level ${lv.id} (${lv.tool})`;
    if (lv.tool === 'extraMoves') {
      // ohne Werkzeug unlösbar im Limit; mit +3 gewinnt die Lösung mit 2★
      assert.ok(lv.meta.minMoves > lv.moves && lv.meta.minMoves <= lv.moves + 3, id);
      assert.equal(replaySolution(lv, lv.solution).ok, false, id);
      const r = replayWithTool(lv, lv.solution, { extra: true });
      assert.ok(r.ok, id); assert.equal(r.stars, 2, id);
    } else if (lv.tool === 'hint') {
      // lösbar, aber eng; Hinweis findet am Start einen Weg; Ergebnis höchstens 2★
      const h = findHint({ board: lv.board, goals: lv.goals, sequence: lv.sequence, index: 0, movesLeft: lv.moves, vec: lv.goals.map(() => 0) }, { want: 2, maxMs: 8000, now: () => 0 });
      assert.ok(h.found && h.moves.length >= 2, id);
      assert.ok(lv.meta.estimate.casual <= 0.2, id);
      const r = replayWithTool(lv, lv.solution, { hint: true });
      assert.ok(r.ok, id); assert.equal(r.stars, 2, id);
      assert.equal(replaySolution(lv, lv.solution).stars, 2, `${id}: auch ohne Werkzeug nur 2★`);
    } else {
      // Rakete/Zauberstab: dieselben Züge ohne Werkzeug gewinnen nicht; mit Werkzeug 2★
      const r = replayWithTool(lv, lv.solution);
      assert.ok(r.ok, `${id}: ${r.reason ?? r.run.status}`); assert.equal(r.stars, 2, id);
      assert.ok(r.run.moves <= lv.stars.two, id);
      assert.ok(!replaySolution(lv, toolMoves(lv.solution)).ok, id);
      assert.ok(lv.meta.estimate.goodStarts >= 2, `${id}: mehr als ein Trick`);
    }
  }
});

test('launch-15: Rakete/Zauberstab/+3 – Solver bestätigt: ohne Werkzeug nicht im Limit lösbar', () => {
  for (const lv of L100.filter(l => l.tool && l.tool !== 'hint')) {
    const s = solveLevel(lv, { maxDepth: lv.moves, maxLayer: 2_000_000 });
    assert.ok(s.exact, `Level ${lv.id}: Suche vollständig`);
    assert.equal(s.solvable, false, `Level ${lv.id}`);
  }
});

test('launch-15: neue Missionen eingeführt – leer (31), Straße aus 4 (41), Wert räumen (51), drei Ziele (71)', () => {
  const first = pred => L100.find(pred)?.id;
  assert.equal(first(l => l.goals.some(g => g.type === 'empty')), 31);
  assert.equal(first(l => l.goals.some(g => g.type === 'long')), 41);
  assert.equal(first(l => l.goals.some(g => g.type === 'purge')), 51);
  assert.equal(first(l => l.goals.length === 3), 71);
  assert.ok(!L100.some(l => l.goals.some(g => g.type === 'group')));
  for (const id of [31, 41, 51, 71]) assert.ok(!L100[id - 1].tool, `Einführung ${id} ohne Werkzeug`);
  // Abwechslung: jedes Kapitel ab 2 hat mindestens 4 verschiedene Zieltypen
  for (let k = 2; k <= 10; k++) {
    const types = new Set(L100.filter(l => chapterOf(l.id) === k).flatMap(l => l.goals.map(g => g.type)));
    assert.ok(types.size >= 4, `Kapitel ${k}: ${[...types]}`);
  }
});

test('launch-15: Sterne-Schranken bleiben mit 2★-Deckel gut erreichbar', () => {
  for (let k = 2; k <= 10; k++) {
    const before = L100.slice(0, (k - 1) * CHAPTER_SIZE);
    const max = before.reduce((n, l) => n + (l.tool ? 2 : 3), 0);
    assert.ok(starGate(k) <= 0.65 * max, `Kapitel ${k}: ${starGate(k)} von ${max}`);
    assert.ok(starGate(k) <= 2 * before.length, `Kapitel ${k}: überall 2★ reicht`);
  }
});

test('launch-15: Kurve – 1–10 leicht, Meilensteine je Kapitel über dem Schnitt, sanft steigend', () => {
  const D = l => l.meta.estimate?.Dfelt ?? l.meta.estimate?.D ?? null;
  const ch = k => L100.filter(l => chapterOf(l.id) === k).map(D).filter(x => x != null);
  const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
  for (let k = 3; k <= 10; k++) assert.ok(avg(ch(k)) >= avg(ch(k - 2)) - 3, `Kapitel ${k} nicht leichter als ${k - 2}`);
  for (let k = 2; k <= 10; k++) { const m = D(L100[k * 10 - 1]); if (m != null) assert.ok(m >= avg(ch(k)) - 2, `Meilenstein ${k * 10}`); }
});

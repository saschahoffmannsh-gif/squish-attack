// Prüft die ausgelieferten Level. Standard: alle Lösungen nachspielen, Werkzeug-Level vollständig,
// Solver auf einer Stichprobe. FULL=1 node --test tests/levels.test.mjs löst alle Level neu.
//   levels-001-025.json – Generator v1 (Quelle für die unveränderten Level 1–24 von launch-15)
//   levels-001-100.json – launch-15 (tools/campaign/build100.mjs), die Datei, die das Spiel lädt
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import {
  validateLevel, replaySolution, createLevelRun, starThresholds, toolStars, decodeMove, applyLevelMove,
  addExtraMoves, useRocket, markToolUsed, starsOfRun, chapterOf, starGate, CHAPTER_SIZE,
} from '../game/campaign.mjs';
import { solveLevel } from '../tools/campaign/solver.mjs';
import { canonicalKey, makeCandidate } from '../tools/campaign/candidates.mjs';
import { makeLevel, liftAroundHigh, scaleScorePoints } from '../tools/campaign/evaluate100.mjs';
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

test(`${file}: keine Felsen; Sterne: 3★ = Optimum + 1 / Mitte (launch-16 auch für Werkzeug-Spitzen)`, () => {
  for (const lv of levels) {
    assert.ok(lv.board.flat().every(v => v === null || Number.isInteger(v)) && lv.sequence.every(Number.isInteger), `Level ${lv.id}`);
    // launch-28/36: kalibrierte Level (meta.cal28 / meta.cal36) – 3★ nach Spielermodell, nie unter Optimum + 1; sonst Formel
    if (tool(lv)) {   // Spitze: Stufen fallen zusammen – jeder Sieg ohne Hilfe = 3★
      assert.deepEqual(lv.stars, { three: lv.moves, two: lv.moves }, `Level ${lv.id}`);
      assert.ok(lv.meta.minMoves <= lv.moves, `Level ${lv.id}: ohne Werkzeug im Limit`); continue;
    }
    if (lv.meta.cal28 || lv.meta.cal36) {
      assert.ok(lv.stars.three >= Math.min(lv.moves, lv.meta.minMoves + 1) && lv.stars.three <= lv.stars.two && lv.stars.two <= lv.moves, `Level ${lv.id}: ${JSON.stringify(lv.stars)}`);
      continue;
    }
    assert.deepEqual(lv.stars, starThresholds(lv.meta.minMoves, lv.moves), `Level ${lv.id}`);
    // launch-27: bei 0 Luft (Limit = Optimum) ist 3★ = Optimum, nicht Optimum + 1
    if (lv.moves === lv.meta.minMoves) assert.equal(lv.stars.three, lv.moves, `Level ${lv.id}`);
    else assert.equal(lv.stars.three, lv.meta.minMoves + 1, `Level ${lv.id}`);
    // launch-18: enge Meilensteine (Optimum nahe am Limit) dürfen 2★ = Limit haben
    if (lv.moves - lv.meta.minMoves >= 4) assert.ok(lv.stars.three < lv.stars.two && lv.stars.two < lv.moves, `Level ${lv.id}: drei Stufen`);
    else assert.ok(lv.stars.three <= lv.stars.two && lv.stars.two <= lv.moves, `Level ${lv.id}: Stufen`);
  }
});

test(`${file}: Level sind aus ihrer Saat reproduzierbar`, () => {
  for (const lv of levels) {
    if (lv.meta?.generator === 'tutorial') continue;   // launch-22: handgesetzte Tutorials
    const c = lv.meta.generator === 'build100' || lv.meta.generator === 'build18' ? makeLevel(lv.id, lv.meta.k) : makeCandidate(lv.meta.seed);
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

test(`${file}: alle Level – gespeicherte Lösung (ohne Werkzeug) gewinnt mit der echten Spiellogik mit 3 Sternen`, () => {
  for (const lv of levels) {
    const r = replaySolution(lv, lv.solution);
    assert.ok(r.ok, `Level ${lv.id}: ${r.reason ?? r.run.status}`);
    assert.equal(lv.solution.length, lv.meta.minMoves, `Level ${lv.id}`);
    assert.equal(r.stars, 3);
  }
});

test(`${file}: Solver bestätigt Lösbarkeit ohne Werkzeug und Minimalzüge (alle Werkzeug-Spitzen + Stichprobe)`, () => {
  const full = process.env.FULL === '1' || levels.length <= 25;
  // launch-18: lange Level (bis 40 Züge) lassen sich nicht vollständig durchsuchen – dort beweist die
  // gespeicherte Lösung (vorheriger Test) die Lösbarkeit; exakt geprüft wird, was exakt gesucht wurde.
  const sample = levels.filter((l, i) => l.meta?.exact !== false && (tool(l) || full || i % 10 === 0 || i < 3 || i % 10 === 9));
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

test('launch-22: Level 6–10 unverändert (leichter Einstieg nach den Tutorials)', () => {
  for (const id of [6, 7, 8, 9, 10]) {
    const a = L100[id - 1], b = V1[id - 1];
    assert.deepEqual([a.board, a.goals, a.moves, a.stars, a.solution, a.sequence], [b.board, b.goals, b.moves, b.stars, b.solution, b.sequence], `Level ${id}`);
  }
});

test('launch-24: Level 1–5 sind Tutorials – genau 3/4/T/5-Fusion und Straße, 1 Zug, ohne Kette; L2, L3 und L5 von oben oder unten', () => {
  const expect = [
    { size: 3, shape: undefined, sol: 'h', dir: 'right' },
    { size: 4, shape: 'line', sol: 'r', dir: 'down' },
    { size: 4, shape: 't', sol: 'm', dir: 'up' },
    { size: 5, shape: undefined, sol: 'h', dir: 'right' },
  ];
  for (let i = 0; i < 4; i++) {
    const lv = L100[i], g = lv.goals[0], e = expect[i];
    assert.equal(lv.kind, 'tutorial');
    assert.equal(lv.meta.generator, 'tutorial');
    assert.equal(lv.meta.minMoves, 1);
    assert.equal(lv.goals.length, 1);
    assert.equal(g.type, 'fuse');
    assert.equal(g.size, e.size);
    assert.equal(g.shape, e.shape);
    assert.equal(lv.solution, e.sol);
    assert.equal(decodeMove(lv.solution).direction, e.dir);
    assert.ok(lv.tip && lv.tip.length > 10);
    const r = replaySolution(lv, lv.solution);
    assert.ok(r.ok && r.stars === 3, `Level ${lv.id}`);
    assert.equal(r.run.bestCombo, 1, `Level ${lv.id}: keine Kette`);
    assert.equal(r.run.fuseMarks[0].size, e.size);
    assert.equal(r.run.fuseMarks[0].line, e.shape !== 't');
  }
  const lv = L100[4];
  assert.equal(lv.kind, 'tutorial');
  assert.equal(lv.goals[0].type, 'street');
  assert.equal(lv.goals[0].count, 1);
  assert.equal(lv.solution, 'r');
  assert.equal(decodeMove(lv.solution).direction, 'down');
  const r = replaySolution(lv, lv.solution);
  assert.ok(r.ok && r.stars === 3);
  assert.equal(r.run.streets, 1);
  assert.equal(r.run.bestCombo, 1);
  assert.ok(L100.slice(0, 5).every(l => !l.tool && !l.specials));
  const dirs = L100.slice(0, 5).map(l => decodeMove(l.solution).direction);
  assert.ok(dirs.filter(d => d === 'up' || d === 'down').length >= 2);
});

test('launch-15: Werkzeug-Spitzen genau laut Plan, Bosse 50 und 100 sind Werkzeug-Spitzen, 1–14 ohne', () => {
  const got = Object.fromEntries(L100.filter(l => l.tool).map(l => [l.id, l.tool]));
  assert.deepEqual(got, Object.fromEntries(Object.entries(TOOL_LEVELS).map(([k, v]) => [Number(k), v])));
  for (const b of BOSSES) assert.ok(L100[b - 1].tool && L100[b - 1].meta.role === 'boss', `Boss ${b}`);
  assert.ok(L100.slice(0, 14).every(l => !l.tool));
  // Werkzeug-Peak an Position 5 → Position 6 ist ein Erholungs-Level ohne Werkzeug (Peak an 9 → Meilenstein 10)
  for (const l of L100.filter(l => l.tool && l.id % 10 === 5)) assert.ok(!L100[l.id].tool && L100[l.id].meta.role === 'relief', `nach ${l.id}`);
});

test('launch-16: Werkzeug-Spitzen – ohne Werkzeug lösbar, aber sehr eng; mit dem Schlüssel-Werkzeug deutlich leichter (launch-32: Werkzeug kostet keine Sterne)', () => {
  for (const lv of L100.filter(l => l.tool)) {
    const id = `Level ${lv.id} (${lv.tool})`;
    // ohne Werkzeug: lösbar mit 3★. launch-28: das echte Optimum (Beam-Suche) ist oft viel kürzer als die alte
    // Schätzung – eng ist die Spitze dann für Spieler (Modell-Gewinnrate), nicht für den Solver (meta.cal28.spike).
    const plain = replaySolution(lv, lv.solution);
    assert.ok(plain.ok && plain.stars === 3, `${id}: ohne Werkzeug 3★`);
    assert.ok(lv.moves - lv.meta.minMoves <= 1 || lv.meta.cal28?.spike || lv.meta.cal36?.spike, `${id}: eng (Limit ${lv.moves}, Optimum ${lv.meta.minMoves})`);
    const ts = lv.meta.toolSolution;
    if (lv.tool === 'extraMoves') {
      const r = replayWithTool(lv, ts, { extra: true });
      assert.ok(r.ok, id); assert.ok(r.stars >= 2, `${id}: mit Werkzeug mind. 2★ (keine Sterne-Kosten)`);
    } else if (lv.tool === 'hint') {
      const h = findHint({ board: lv.board, goals: lv.goals, sequence: lv.sequence, index: 0, movesLeft: lv.moves, vec: lv.goals.map(() => 0) }, { want: 2, maxMs: 8000, now: () => 0 });
      assert.ok(h.found && h.moves.length >= 2, id);
      const r = replayWithTool(lv, lv.solution, { hint: true });
      assert.ok(r.ok, id); assert.ok(r.stars >= 2, `${id}: mit Hinweis mind. 2★`);
    } else {
      // Rakete/Zauberstab sparen Züge: Werkzeug-Optimum < Optimum ohne Werkzeug
      const r = replayWithTool(lv, ts);
      assert.ok(r.ok, `${id}: ${r.reason ?? r.run.status}`); assert.equal(r.stars, 3, `${id}: Werkzeug spart Züge → 3★`);
      assert.ok(lv.meta.toolMin < lv.meta.minMoves, `${id}: Werkzeug spart Züge`);
    }
  }
});

test('launch-16: kein Level ist ohne Werkzeug unlösbar (Solver im Limit bzw. gespeicherte Lösung bei langen Leveln)', () => {
  for (const lv of L100) {
    const r = replaySolution({ ...lv, tool: undefined }, lv.solution);
    assert.ok(r.ok && lv.solution.length <= lv.moves, `Level ${lv.id}: ohne Werkzeug lösbar`);
  }
  for (const lv of L100.filter(l => l.tool && l.meta.exact !== false)) {
    const s = solveLevel({ ...lv, tool: undefined }, { maxDepth: lv.moves, maxLayer: 2_000_000 });
    assert.ok(s.exact && s.solvable, `Level ${lv.id}`);
    assert.equal(s.minMoves, lv.meta.minMoves, `Level ${lv.id}`);
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

test('launch-28: Sterne-Schranken – strenger und steigend, aber ohne Hilfe erreichbar', () => {
  for (let k = 2; k <= 10; k++) {
    const before = L100.slice(0, (k - 1) * CHAPTER_SIZE);
    const max = before.length * 3;   // 3★ überall möglich (ohne Hilfe)
    assert.ok(starGate(k) <= 0.8 * max, `Kapitel ${k}: ${starGate(k)} von ${max}`);
    assert.ok(starGate(k) > 2 * before.length, `Kapitel ${k}: überall 2★ (je eine Hilfe) reicht nicht`);
    if (k > 2) assert.ok(starGate(k) / before.length >= starGate(k - 1) / (before.length - CHAPTER_SIZE), `Kapitel ${k}: Anteil steigt`);
  }
});

test('launch-15: gemessene Kurve – 1–10 leicht, steigend, Meilensteine oben, Erholung nach Peaks', { skip: !existsSync(new URL('../tools/campaign/measure-001-100.json', import.meta.url)) }, () => {
  const M = JSON.parse(readFileSync(new URL('../tools/campaign/measure-001-100.json', import.meta.url), 'utf8')).levels;
  assert.equal(M.length, 100);
  const felt = id => M[id - 1].felt, avg = a => a.reduce((s, x) => s + x, 0) / a.length;
  const ch = k => Array.from({ length: 10 }, (_, i) => felt((k - 1) * 10 + i + 1));
  assert.ok(M.slice(0, 10).every(r => r.cas >= 0.5), 'Kapitel 1: Gelegenheitsspieler gewinnt jedes Level in mind. 50 %');
  // launch-28: Optimum der langen Level korrigiert (meta.cal28) – die D-Formel bewertet sie seither niedriger,
  // die Kurve ist flacher: kein Kapitel deutlich leichter als das davor (Toleranz 5).
  for (let k = 2; k <= 10; k++) assert.ok(avg(ch(k)) >= avg(ch(k - 1)) - 5, `Kapitel ${k} nicht leichter als ${k - 1}`);
  assert.ok(avg(ch(10)) > avg(ch(2)) + 15, 'Kurve steigt deutlich');
  // Werkzeug-Meilensteine (z. B. L50) vergleichen D ohne Werkzeug: felt rechnet den Schlüssel-Einsatz ein.
  for (let k = 2; k <= 10; k++) {
    const row = M[k * 10 - 1];
    const ms = row.tool ? row.D : row.felt;
    // launch-28: Meilensteine gemessen am Gelegenheitsspieler – höchstens so leicht wie der Kapitelschnitt (+0,15)
    const cas = M.slice((k - 1) * 10, k * 10).map(r => r.cas);
    assert.ok(ms >= avg(ch(k)) || row.cas <= avg(cas) + 0.15, `Meilenstein ${k * 10} nicht leichter als das Kapitel (${row.cas} vs ${avg(cas).toFixed(2)})`);
  }
  for (let k = 2; k <= 10; k++) assert.ok(felt(k * 10 - 4) < felt(k * 10 - 6), `Erholung ${k * 10 - 4}: leichter als der Aufbau davor`);
  // launch-18/27: das Werkzeug hilft spürbar (Gelegenheitsspieler gewinnt damit öfter als ohne)
  for (const r of M.filter(r => r.tool && r.tool !== 'hint')) assert.ok(r.casTool >= r.cas && (r.casTool >= 0.04 || L100[r.id - 1].meta.cal28?.spike), `Level ${r.id}: mit Werkzeug leichter (${r.cas} → ${r.casTool})`);
});

test('launch-16: keine Ketten-Level mehr – kein Level und kein Plan-Eintrag hat ein combo-Ziel', async () => {
  const { MISSIONS, RETIRED_GOALS } = await import('../tools/campaign/plan100.mjs');
  assert.ok(RETIRED_GOALS.includes('combo'));
  assert.deepEqual(L100.filter(l => l.goals.some(g => g.type === 'combo')).map(l => l.id), []);
  assert.deepEqual(Object.entries(MISSIONS).filter(([, m]) => m.goals.some(g => RETIRED_GOALS.includes(g.type))).map(([id]) => id), []);
  // Rollen bleiben: Werkzeug-Level und Bosse wie geplant (s. o.), Kette-Plätze jetzt mit anderen Zielarten
  for (const id of [21, 22, 28, 47, 54, 73, 81, 92]) assert.ok(!L100[id - 1].tool, `Level ${id} ohne Werkzeug`);
});

test('launch-18: längere Level – Zugzahl wächst, ohne Ketten und ohne besondere Squishes, abwechslungsreiche Startbretter', async () => {
  const { moveWindow } = await import('../tools/campaign/plan100.mjs');
  const avg = k => { const a = L100.filter(l => chapterOf(l.id) === k && !l.tool).map(l => l.moves); return a.reduce((x, y) => x + y, 0) / a.length; };
  // launch-28: zu leichte Level wurden gekürzt (meta.cal28) – nie verlängert; die Zugzahl wächst bis Kapitel 9
  for (let k = 3; k <= 9; k++) assert.ok(avg(k) > avg(k - 1), `Kapitel ${k}: mehr Züge als Kapitel ${k - 1}`);
  for (const lv of L100.filter(l => l.id > 10 && !l.tool)) {
    if (lv.meta.cal28 || lv.meta.cal36) assert.ok(lv.moves <= moveWindow(lv.id), `Level ${lv.id}: höchstens Zugfenster`);
    else assert.equal(lv.moves, moveWindow(lv.id), `Level ${lv.id}: Zugfenster laut Plan`);
  }
  assert.ok(L100[99].moves >= 30 || L100[96].moves >= 38, 'späte Level sind lang');
  assert.ok(L100.every(l => !l.specials), 'Eis, Schloss und Bombe nur auf der Testseite');
  assert.ok(L100.every(l => !l.goals.some(g => g.type === 'combo')));
  const has = v => L100.filter(l => l.board.flat().includes(v)).length;
  assert.ok(has(5) >= 10, 'oft liegt schon ein 5er');
  assert.ok(L100.filter(l => l.board.flat().some(v => v >= 20)).length >= 3, 'hohe Werte als Blocker');
  assert.ok(L100.filter(l => l.goals.length >= 2).length >= 30, 'viele Mehrfach-Aufgaben');
  assert.ok(L100.some(l => l.goals.some(g => g.type === 'tile' && g.value === 8)), 'eine 8 bauen');
});

test('launch-36: hoher Stein bleibt, restliches Brett und Folge liegen in einer Bandbreite darunter', () => {
  const board = [
    [1, null, null, null, null],
    [null, null, 1, null, null],
    [30, null, null, null, null],
    [1, null, null, 2, null],
    [2, null, 4, null, 1],
  ];
  const seq = [1, 2, 2, 1];
  assert.equal(liftAroundHigh(board, seq, 30), 25);
  assert.deepEqual(board[0][0], 26);
  assert.deepEqual(board[2][0], 30);
  assert.deepEqual(board[4][2], 29);
  assert.deepEqual(seq, [26, 27, 27, 26]);
  assert.equal(scaleScorePoints(600, 2, 27), 6000);
  for (const lv of L100) {
    const vals = lv.board.flat().filter(v => v != null);
    if (!vals.length) continue;
    const mx = Math.max(...vals);
    const rest = vals.filter(v => v !== mx);
    if (!rest.length || mx < 20) continue;
    assert.ok(mx - Math.max(...rest) <= 4, `Level ${lv.id}: isolierter Hochwert ${mx} neben ${rest}`);
    assert.ok(Math.min(...lv.sequence) >= Math.min(...rest) - 2, `Level ${lv.id}: Folge passt nicht zum Brett`);
  }
  for (const id of [84, 91, 96, 98]) {
    const lv = L100[id - 1];
    const r = replaySolution(lv, lv.solution);
    assert.ok(r.ok && r.stars === 3, `Level ${id}`);
    const vals = lv.board.flat().filter(v => v != null);
    assert.ok(Math.max(...vals) >= 26);
  }
});

test('launch-36: zugeschnittene Limits bleiben ohne Werkzeug mit 3★ lösbar', () => {
  for (const id of [15, 17, 20, 23, 25, 35, 44, 50, 60, 66, 82, 92]) {
    const lv = L100[id - 1];
    assert.ok(lv.meta.cal36, `Level ${id}: cal36`);
    assert.ok(lv.solution.length <= lv.moves, `Level ${id}: Lösung im Limit`);
    const r = replaySolution({ ...lv, tool: undefined }, lv.solution);
    assert.ok(r.ok && r.stars === 3, `Level ${id}: ${r.reason ?? r.run.status}`);
  }
});

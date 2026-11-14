// Prüft die ausgelieferten Level. Standard: alle Lösungen nachspielen + Solver
// auf einer Stichprobe. FULL=1 node --test tests/levels.test.mjs löst alle 100 neu.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { validateLevel, replaySolution, createLevelRun, starThresholds } from '../game/campaign.mjs';
import { solveLevel } from '../tools/campaign/solver.mjs';
import { canonicalKey, makeCandidate } from '../tools/campaign/candidates.mjs';
import { settle } from '../game/game-logic.mjs';

// Prüft jede Leveldatei levels/levels-001-NNN.json (heute 025, später 100).
const dir = new URL('../levels/', import.meta.url);
const files = readdirSync(dir).filter(f => /^levels-001-\d{3}\.json$/.test(f));
test('es gibt mindestens eine Leveldatei', () => assert.ok(files.length > 0));
for (const file of files) {
const data = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
const levels = data.levels;
const expected = Number(file.match(/-(\d{3})\.json$/)[1]);

test(`${file}: ${expected} gültige, eindeutige Level mit fortlaufender ID`, () => {
  assert.equal(levels.length, expected);
  assert.equal(data.count, expected);
  levels.forEach((lv, i) => { validateLevel(lv); assert.equal(lv.id, i + 1); assert.ok(lv.sequence.length >= lv.moves); });
  assert.equal(new Set(levels.map(lv => canonicalKey({ ...lv, sequence: lv.sequence.slice(0, lv.moves) }))).size, expected);
  assert.equal(new Set(levels.map(lv => JSON.stringify(lv.board))).size, expected);
});

test(`${file}: keine Felsen, Sterne-Schwellen = Optimum + 1 / Mitte, alle drei Stufen vorhanden`, () => {
  for (const lv of levels) {
    assert.ok(lv.board.flat().every(v => v === null || Number.isInteger(v)) && lv.sequence.every(Number.isInteger), `Level ${lv.id}`);
    assert.deepEqual(lv.stars, starThresholds(lv.meta.minMoves, lv.moves), `Level ${lv.id}`);
    assert.equal(lv.stars.three, lv.meta.minMoves + 1);
    assert.ok(lv.stars.three < lv.stars.two && lv.stars.two < lv.moves, `Level ${lv.id}: drei Stufen`);
  }
});

test(`${file}: Level sind aus ihrer Saat reproduzierbar`, () => {
  for (const lv of levels) {
    const c = makeCandidate(lv.meta.seed);
    assert.ok(c, `Level ${lv.id}`);
    assert.deepEqual(c.board, lv.board);
    assert.deepEqual(c.goals, lv.goals);
    assert.deepEqual(c.sequence.slice(0, lv.moves), lv.sequence.slice(0, lv.moves));
  }
});

test(`${file}: Startbrett löst nichts von selbst auf`, () => {
  for (const lv of levels) assert.equal(settle(createLevelRun(lv).board).passes.length, 0, `Level ${lv.id}`);
});

test(`${file}: gespeicherte Lösung erreicht das Ziel mit der echten Spiellogik, innerhalb des Limits, mit 3 Sternen`, () => {
  for (const lv of levels) {
    const r = replaySolution(lv, lv.solution);
    assert.ok(r.ok, `Level ${lv.id}: ${r.reason ?? r.run.status}`);
    assert.ok(lv.solution.length <= lv.moves);
    assert.equal(lv.solution.length, lv.meta.minMoves, `Level ${lv.id}`);
    assert.equal(r.stars, 3);
  }
});

test(`${file}: Solver bestätigt Lösbarkeit und Minimalzüge`, () => {
  const full = process.env.FULL === '1' || levels.length <= 25;
  const sample = full ? levels : levels.filter((_, i) => i % 10 === 0 || i < 3);
  for (const lv of sample) {
    const s = solveLevel(lv, { maxLayer: 2_000_000 });
    assert.ok(s.solvable && s.exact, `Level ${lv.id}`);
    assert.ok(s.minMoves <= lv.moves);
    assert.equal(s.minMoves, lv.meta.minMoves, `Level ${lv.id}`);
    assert.equal(s.optimalSolutions, lv.meta.optimalSolutions, `Level ${lv.id}`);
  }
});
}

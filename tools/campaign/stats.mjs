#!/usr/bin/env node
// Übersicht über eine Leveldatei:  node tools/campaign/stats.mjs [levels-001-025.json] [--list]
import { readFileSync } from 'node:fs';
import { goalText } from '../../game/campaign.mjs';
const file = process.argv.find(a => /levels-001-\d{3}\.json$/.test(a)) ?? 'levels-001-025.json';
const data = JSON.parse(readFileSync(new URL('../../levels/' + file.split('/').pop(), import.meta.url), 'utf8'));
const L = data.levels;
const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const summary = (name, arr) => console.log(`${name.padEnd(22)} min ${q(arr, 0)}  median ${q(arr, .5)}  max ${q(arr, 1)}`);
console.log(`${L.length} Level, Generator-Saat ${data.generator.seed}, ${data.generator.candidates} Kandidaten`);
summary('Zuglimit', L.map(l => l.moves));
summary('Minimalzüge', L.map(l => l.meta.minMoves));
summary('Spielraum (Limit-Min)', L.map(l => l.meta.slack));
summary('Schwierigkeit 0-100', L.map(l => l.meta.difficulty));
summary('Optimale Lösungen', L.map(l => l.meta.optimalSolutions));
summary('Solver ms', L.map(l => l.meta.solverMs));
summary('Zustände', L.map(l => l.meta.statesExplored));
const kinds = {}; for (const l of L) kinds[l.kind] = (kinds[l.kind] ?? 0) + 1;
console.log('Zielarten:', kinds);
for (const ch of [...new Set(L.map(l => l.chapter))]) {
  const c = L.filter(l => l.chapter === ch), avg = f => (c.reduce((s, l) => s + f(l), 0) / c.length);
  console.log(`Kapitel ${String(ch).padStart(2)}: Schwierigkeit Ø ${avg(l => l.meta.difficulty).toFixed(0).padStart(3)}, Limit Ø ${avg(l => l.moves).toFixed(1)}, Min Ø ${avg(l => l.meta.minMoves).toFixed(1)}, Gewinnrate gelegentlich Ø ${(avg(l => l.meta.winRate.casual) * 100).toFixed(0)} %, gut Ø ${(avg(l => l.meta.winRate.good) * 100).toFixed(0)} %`);
}
if (process.argv.includes('--list')) for (const l of L)
  console.log(`${String(l.id).padStart(3)} K${l.chapter} ${l.kind.padEnd(6)} D${String(l.meta.difficulty).padStart(3)} min ${l.meta.minMoves}/${l.moves} opt ${l.meta.optimalSolutions} gel ${l.meta.winRate.casual} (+3 Züge ${l.meta.withExtraMoves3.casual}) gut ${l.meta.winRate.good}  ${l.goals.map(goalText).join(' + ')}`);

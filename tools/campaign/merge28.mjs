#!/usr/bin/env node
// launch-28: Messzeilen aus measure100 --only … --rows <datei> in measure-001-100.json übernehmen.
//   node tools/campaign/merge28.mjs /tmp/m28-*.jsonl
import { readFileSync, writeFileSync } from 'node:fs';
const file = new URL('measure-001-100.json', import.meta.url);
const M = JSON.parse(readFileSync(file, 'utf8'));
let n = 0;
for (const f of process.argv.slice(2)) for (const line of readFileSync(f, 'utf8').split('\n').filter(Boolean)) {
  const row = JSON.parse(line); M.levels[row.id - 1] = row; n++;
}
writeFileSync(file, JSON.stringify(M, null, 1) + '\n');
console.log('übernommen', n);

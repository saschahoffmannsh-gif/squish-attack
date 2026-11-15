#!/usr/bin/env node
// Parallele Kandidatensuche für EIN Level (z. B. Boss nachschärfen), ohne den build100-Cache anzufassen.
//   node tools/campaign/search-one.mjs <id> [--workers 6] [--budget 900] [--from 0] [--peak]
//   --peak: Werkzeug-Spitze nach launch-16-Regel (evaluatePeak: ohne Werkzeug lösbar, Limit = Optimum)
// Ergebnis: tools/campaign/.cache/search-L<id>.json (bester Kandidat + alle brauchbaren, nach Kosten sortiert).
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { evaluate, evaluatePeak } from './evaluate100.mjs';
if (!isMainThread) {
  const { id, w, W, from, budget, peak } = workerData, t0 = Date.now(), ev = peak ? evaluatePeak : evaluate;
  for (let k = from + w; Date.now() - t0 < budget; k += W) {
    let r = null; try { r = ev(id, k); } catch { r = null; }
    parentPort.postMessage({ k, r });
  }
  parentPort.postMessage({ done: true });
} else {
  const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? Number(process.argv[i + 1]) : d; };
  const id = Number(process.argv[2]), W = arg('workers', 6), budget = arg('budget', 900) * 1000, from = arg('from', 0);
  const dir = new URL('.cache/', import.meta.url); mkdirSync(dir, { recursive: true });
  const file = new URL(`search-L${id}.json`, dir), found = []; let tried = 0;
  const save = () => { found.sort((a, b) => a.cost - b.cost); writeFileSync(file, JSON.stringify({ id, tried, found: found.slice(0, 20) })); };
  await Promise.all(Array.from({ length: W }, (_, w) => new Promise(res => {
    const wk = new Worker(fileURLToPath(import.meta.url), { workerData: { id, w, W, from, budget, peak: process.argv.includes('--peak') } });
    wk.on('message', m => { if (m.done) return res(); tried++; if (m.r) { found.push(m.r); console.log(`k ${m.k} D ${m.r.D} gefühlt ${m.r.Dfelt} Limit ${m.r.limit} wkz ${m.r.toolMin} cas ${m.r.casTool?.toFixed?.(2)} cost ${m.r.cost.toFixed(1)}`); save(); } });
    wk.on('error', e => { console.error(e); res(); });
  })));
  save(); console.log('fertig', tried);
}

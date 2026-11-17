#!/usr/bin/env node
// launch-32: Kapitel-Hürden prüfen (24★ je Kapitel) mit dem Spielermodell aus stars32-001-100.json.
// Regeln: alt (launch-31: Hilfe deckelt), neu (Sterne aus übrigen Zügen, +3-Züge zählen nicht).
import { readFileSync } from 'node:fs';
import { starsFor } from '../../game/campaign.mjs';
const rows = JSON.parse(readFileSync(new URL('stars32-001-100.json', import.meta.url), 'utf8'));
const levels = JSON.parse(readFileSync(new URL('../../levels/levels-001-100.json', import.meta.url), 'utf8')).levels;
const oldRule = (lv, used, help) => { const x = help ? 3 : 0; const s = used <= lv.stars.three + x ? 3 : used <= lv.stars.two + x ? 2 : 1; return help ? Math.min(2, s) : s; };
const newRule = (lv, used) => starsFor(lv, used, true);
function dist(row, lv, who, rule, help) {
  const by = row[who].by, L = lv.moves, P = [0, 0, 0, 0];
  for (let m = 1; m <= (help ? L + 3 : L); m++) { const p = by[m] - by[m - 1]; if (p > 0) P[rule(lv, m, m > L)] += p; }
  P[0] = 1 - P[1] - P[2] - P[3]; return P;
}
const best = (P, k) => { const ge = s => P.slice(s).reduce((a, b) => a + b, 0); let e = 0; for (let s = 1; s <= 3; s++) e += 1 - (1 - ge(s)) ** k; return e; };
const out = [];
for (const who of ['cas', 'good']) for (const k of [1, 3, 5]) for (const [name, rule, help] of [['alt ohne Hilfe', oldRule, false], ['alt mit +3', oldRule, true], ['neu ohne Hilfe', newRule, false], ['neu mit +3', newRule, true]]) {
  const ch = Array(10).fill(0);
  rows.forEach((row, i) => { ch[Math.floor(i / 10)] += best(dist(row, levels[i], who, rule, help), k); });
  let cum = 0; const gates = ch.map((v, i) => { cum += v; return cum; });
  const firstFail = gates.findIndex((c, i) => i < 9 && c < 24 * (i + 1));
  out.push({ who, k, name, ch: ch.map(v => v.toFixed(1)).join(' '), total: cum.toFixed(0), stuck: firstFail < 0 ? '–' : `K${firstFail + 2}` });
}
for (const o of out) console.log(o.who.padEnd(4), 'k=' + o.k, o.name.padEnd(15), o.ch, '| Σ', o.total, '| hängt vor', o.stuck);

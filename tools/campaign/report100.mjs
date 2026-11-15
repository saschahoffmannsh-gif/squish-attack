#!/usr/bin/env node
// Tabelle der 100 Level für die Doku: node tools/campaign/report100.mjs > docs/levels-100.md
import { readFileSync } from 'node:fs';
import { goalShort, toolName } from '../../game/campaign.mjs';
const root = new URL('../../', import.meta.url);
const L = JSON.parse(readFileSync(new URL('levels/levels-001-100.json', root), 'utf8')).levels;
const M = new Map(JSON.parse(readFileSync(new URL('tools/campaign/measure-001-100.json', root), 'utf8')).levels.map(r => [r.id, r]));
const role = { normal: 'normal', relief: 'Erholung', milestone: 'Meilenstein', tool: 'Werkzeug-Peak', boss: 'Boss' };
const out = ['# Level 1–100 (launch-15)', '', 'Erzeugt mit `tools/campaign/report100.mjs` aus `levels/levels-001-100.json` und der Messung `tools/campaign/measure-001-100.json`.',
  'D = Schwierigkeit ohne Werkzeug (100 = im Limit ohne Werkzeug nicht lösbar), gefühlt = mit dem Schlüssel-Werkzeug, Soll = Zielkurve der Planungsseite.',
  'Gel. = Gewinnrate Gelegenheitsspieler ohne Werkzeug, mit Wkz = mit dem Schlüssel-Werkzeug.', '',
  '| L | Rolle | Ziele | Züge | Min | Werkzeug | D | gefühlt | Soll | Gel. | mit Wkz |', '|---|---|---|---|---|---|---|---|---|---|---|'];
for (const lv of L) {
  const m = M.get(lv.id);
  out.push(`| ${lv.id} | ${role[m.role] ?? m.role} | ${lv.goals.map(goalShort).join(' · ')} | ${lv.moves} | ${lv.meta.minMoves ?? '–'}${lv.meta.toolMin != null && lv.tool !== 'extraMoves' && lv.tool !== 'hint' ? ` (mit Wkz ${lv.meta.toolMin})` : ''} | ${lv.tool ? toolName(lv.tool) : '–'} | ${m.D} | ${m.felt} | ${m.target} | ${Math.round(m.cas * 100)} % | ${m.casTool != null ? Math.round(m.casTool * 100) + ' %' : '–'} |`);
}
console.log(out.join('\n'));

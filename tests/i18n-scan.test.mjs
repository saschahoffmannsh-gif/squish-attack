import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const UI = [
  'game/home-menu.mjs', 'game/campaign-ui.mjs', 'game/game.mjs', 'game/start-menu.mjs',
  'game/loading-screen.mjs', 'game/shop.mjs', 'game/shop-ui.mjs', 'game/ad-ui.mjs',
  'game/gift-fx.mjs', 'game/stats-ui.mjs', 'game/device-motion.mjs', 'game/sound.mjs',
  'game/duel-client.mjs', 'game/settings.mjs', 'game/merge-effects.mjs', 'game/tool-fx.mjs',
  'game/index.html',
];

const GERMAN = /(?:Abenteuer|Einstellungen|Geschenk(?:e)?|Werbung|Hinweis|Rakete|Zauberstab|\bZauber\b|Straßen?|Endlos|Menü|Schließen|Zurück(?:setzen)?|Weiterspielen|Levelauswahl|Spielregeln|Schalte frei|Werkzeugkiste|Werkzeug-Shop|Werkzeug-Statistik|Handybewegung|Kein Platz|Keine Züge|geschafft|gesperrt|Kapitel |Vorrat |Bitte |Wische |Quetschen|Ploppen|Bereit zum|wird geladen|Neues Spiel|Zum Menü|Nochmal|Perfekt!|Unentschieden|Beitreten|Spielcode|Punktestand|[0-9] Punkte\b|pausieren|fortsetzen|Ansehen\b|Nein danke|Testkauf|Freigabe wird|Bewegungssensoren|Protokoll gelöscht|Exportieren|Abbrechen|Zauberstab|PERFEKTE STRASSE|VIER AUF|NEUER REKORD|SÜSS!|FANTASTISCH|KETTE ×)/;

function stripComments(src, isHtml) {
  if (isHtml) return src.replace(/<!--[\s\S]*?-->/g, '');
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function literals(src) {
  const out = [];
  const re = /(['"`])((?:\\.|(?!\1).)*)\1/g;
  let m;
  while ((m = re.exec(src))) out.push({ quote: m[1], value: m[2], index: m.index });
  return out;
}

test('UI-Code enthält keine fest verdrahteten deutschen Spieltexte', () => {
  const hits = [];
  for (const rel of UI) {
    const raw = readFileSync(join(root, rel), 'utf8');
    const isHtml = rel.endsWith('.html');
    const src = stripComments(raw, isHtml);
    if (isHtml) {
      // Statischer Fallback in data-i18n-Knoten und das zweisprachige noscript sind erlaubt.
      const cleaned = src
        .replace(/<noscript>[\s\S]*?<\/noscript>/gi, '')
        .replace(/<[^>]*\sdata-i18n(?:-[a-z]+)?="[^"]*"[^>]*>[\s\S]*?<\/[a-zA-Z0-9-]+>/g, '')
        .replace(/<[^>]*\sdata-i18n(?:-[a-z]+)?="[^"]*"[^>]*\/?>/g, '');
      if (GERMAN.test(cleaned) || /[ÄÖÜäöüß]/.test(cleaned.replace(/[A-Za-z-]+="[^"]*"/g, ''))) {
        // nur Textknoten prüfen
        const text = cleaned.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ');
        if (GERMAN.test(text) || /[ÄÖÜäöüß]/.test(text)) hits.push(`${rel}: HTML-Text ohne data-i18n`);
      }
      continue;
    }
    for (const lit of literals(src)) {
      const v = lit.value;
      if (!GERMAN.test(v) && !/[ÄÖÜäöüß]/.test(v)) continue;
      // Import-Pfade und CSS-Selektoren ignorieren
      if (v.includes('.mjs') || v.includes('.css') || v.startsWith('.') || v.startsWith('#')) continue;
      hits.push(`${rel}: "${v.slice(0, 80)}"`);
    }
  }
  assert.deepEqual(hits, [], hits.join('\n'));
});

test('data-i18n-Schlüssel in index.html existieren', async () => {
  const { STRINGS } = await import('../game/locales.mjs?v=launch-30');
  const html = readFileSync(join(root, 'game/index.html'), 'utf8');
  const keys = [...html.matchAll(/data-i18n(?:-[a-z]+)?="([^"]+)"/g)].map(m => m[1]);
  assert.ok(keys.length > 30, 'zu wenige data-i18n-Attribute');
  const missing = keys.filter(k => !STRINGS[k]);
  assert.deepEqual(missing, [], 'fehlende Schlüssel: ' + missing.join(', '));
});

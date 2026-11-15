// Plan für die Level 1–100 (launch-15): Zielkurve aus der Planungsseite + Saschas Entscheidungen.
//  - 1–10 bleiben, 11–25 wie vorgeschlagen (mehr Züge bzw. neu gebaut), 26–100 neu.
//  - Werkzeug-Level (tool): max. 2★, ohne Werkzeug (fast) unlösbar, mit EINEM Werkzeug bequem.
//  - Neue Missionen: empty (Brett fast leer), long (Straße aus 4), purge (Wert räumen), drei Ziele.
//    „Große Gruppe“ wird nicht gebaut (ersetzt durch bekannte Ziele).
// target = gefühlte Schwierigkeit D (bei Werkzeug-Leveln: mit dem Schlüssel-Werkzeug).
const T = (type, a, b) => ({ tile: { type, value: a }, make: { type, value: a, count: b }, score: { type, points: a }, clear: { type, tiles: a },
  street: { type, count: a }, combo: { type, chain: a }, empty: { type, max: a }, long: { type, count: a }, purge: { type, value: a, tiles: b } })[type];

// Kurve: Basis 14 → 60, Welle je Kapitel (wie Planungsseite).
const base = i => 14 + 46 * (i - 1) / 99;
const OFF = [-8, -4, 0, 4, 8, -8, 0, 4, 6, 16];
const CH1 = [3, 6, 10, 13, 12, 15, 20, 22, 22, 28];
export const TOOL_LEVELS = { 15: 'extraMoves', 25: 'wand', 35: 'rocket', 45: 'hint', 49: 'extraMoves', 50: 'wand', 55: 'rocket', 59: 'hint', 65: 'extraMoves',
  69: 'wand', 75: 'rocket', 79: 'hint', 85: 'extraMoves', 89: 'wand', 95: 'rocket', 99: 'hint', 100: 'extraMoves' };
export const BOSSES = [50, 100];
export function targetD(i) {
  const ch = Math.ceil(i / 10), p = (i - 1) % 10 + 1;
  if (ch === 1) return CH1[p - 1];
  let o = OFF[p - 1];
  if (TOOL_LEVELS[i]) o = p === 10 ? 12 : Math.min(o, 6);
  return Math.round(Math.max(2, base(i) + o));
}
export const roleOf = i => { const p = (i - 1) % 10 + 1;
  if (BOSSES.includes(i)) return 'boss'; if (TOOL_LEVELS[i]) return 'tool'; if (p === 10) return 'milestone'; return OFF[p - 1] < 0 ? 'relief' : 'normal'; };

// Bestehende Level mit mehr Zügen (Brett bleibt): id → neues Zuglimit.
export const RETUNE = { 11: 7, 12: 8, 16: 9, 17: 8, 18: 7, 20: 7, 24: 9 };

// Missionen der neu gebauten Level. note = Absicht (für Doku/Seite).
export const MISSIONS = {
  15: { goals: [T('clear', 8)], note: '1. Werkzeug-Level: +3 Züge' },
  19: { goals: [T('tile', 4)], note: 'leichter 4er' },
  21: { goals: [T('combo', 2)], note: 'Kette 2 offensichtlich (liegt bereit)' },
  22: { goals: [T('combo', 2)], note: 'Kette 2 offensichtlich, etwas mehr Aufbau' },
  23: { goals: [T('tile', 4), T('clear', 5)], note: 'Doppelziel mit bekannten Typen' },
  25: { goals: [T('combo', 2)], note: 'Werkzeug-Level: Zauberstab (ein falscher Stein in der Kette)' },
  26: { goals: [T('tile', 4)], note: 'Erholung' },
  27: { goals: [T('street', 3)] },
  28: { goals: [T('combo', 2)], note: 'Kette 2 mittel' },
  29: { goals: [T('score', 200), T('clear', 6)] },
  30: { goals: [T('make', 4, 2), T('combo', 2)], note: 'Meilenstein' },
  31: { goals: [T('empty', 4)], note: 'NEU Brett fast leer (Einführung, offensichtlich)' },
  32: { goals: [T('make', 3, 3)] },
  33: { goals: [T('clear', 10)] },
  34: { goals: [T('tile', 5)] },
  35: { goals: [T('combo', 2)], note: 'Werkzeug-Level: Rakete, Brett zugestellt' },
  36: { goals: [T('street', 2)], note: 'Erholung' },
  37: { goals: [T('empty', 3)], note: 'Brett fast leer: 3' },
  38: { goals: [T('score', 260)] },
  39: { goals: [T('tile', 4), T('street', 2)] },
  40: { goals: [T('clear', 12), T('combo', 2)], note: 'Meilenstein' },
  41: { goals: [T('long', 1)], note: 'NEU Straße aus 4 (Einführung, offensichtlich)' },
  42: { goals: [T('tile', 4)] },
  43: { goals: [T('combo', 2), T('score', 150)] },
  44: { goals: [T('make', 4, 2)] },
  45: { goals: [T('street', 1), T('clear', 6)], note: 'Werkzeug-Level: Hinweis' },
  46: { goals: [T('clear', 8)], note: 'Erholung' },
  47: { goals: [T('combo', 3)], note: 'Kette 3 Einführung (fertig vorbereitet)' },
  48: { goals: [T('street', 3), T('clear', 6)] },
  49: { goals: [T('street', 2)], note: 'Werkzeug-Level: +3 Züge' },
  50: { goals: [T('combo', 2), T('make', 4, 2)], note: 'Boss: Zauberstab nötig' },
  51: { goals: [T('purge', 2, 6)], note: 'NEU Wert räumen (Einführung, offensichtlich)' },
  52: { goals: [T('score', 220)] },
  53: { goals: [T('tile', 5)] },
  54: { goals: [T('combo', 3)], note: 'Kette 3 mittel' },
  55: { goals: [T('empty', 3)], note: 'Werkzeug-Level: Rakete' },
  56: { goals: [T('street', 2)], note: 'Erholung' },
  57: { goals: [T('make', 4, 2), T('street', 1)] },
  58: { goals: [T('purge', 3, 8)] },
  59: { goals: [T('combo', 3)], note: 'Werkzeug-Level: Hinweis' },
  60: { goals: [T('street', 3), T('score', 300)], note: 'Meilenstein' },
  61: { goals: [T('empty', 4), T('score', 120)], note: 'Erholung (statt Große Gruppe)' },
  62: { goals: [T('tile', 5)] },
  63: { goals: [T('clear', 12)] },
  64: { goals: [T('combo', 2), T('street', 2)] },
  65: { goals: [T('make', 3, 3)], note: 'Werkzeug-Level: +3 Züge' },
  66: { goals: [T('make', 3, 2)], note: 'Erholung' },
  67: { goals: [T('long', 1), T('clear', 8)], note: '(statt Große Gruppe)' },
  68: { goals: [T('street', 2), T('clear', 6)] },
  69: { goals: [T('combo', 3), T('tile', 4)], note: 'Werkzeug-Level: Zauberstab' },
  70: { goals: [T('long', 1), T('combo', 2)], note: 'Meilenstein' },
  71: { goals: [T('tile', 4), T('clear', 6), T('street', 1)], note: 'NEU drei Ziele (Einführung, je leicht)' },
  72: { goals: [T('purge', 3, 6)] },
  73: { goals: [T('combo', 3)] },
  74: { goals: [T('make', 4, 2), T('score', 250)] },
  75: { goals: [T('empty', 3), T('score', 150)], note: 'Werkzeug-Level: Rakete' },
  76: { goals: [T('street', 3)], note: 'Erholung' },
  77: { goals: [T('score', 350), T('purge', 2, 6)], note: '(statt Große Gruppe)' },
  78: { goals: [T('make', 5, 2)] },
  79: { goals: [T('street', 2)], note: 'Werkzeug-Level: Hinweis' },
  80: { goals: [T('tile', 5), T('clear', 10), T('combo', 2)], note: 'Meilenstein: drei Ziele' },
  81: { goals: [T('combo', 2)], note: 'Erholung, offensichtlich' },
  82: { goals: [T('long', 1)] },
  83: { goals: [T('tile', 5), T('clear', 8)] },
  84: { goals: [T('empty', 4), T('score', 300)], note: '(statt Große Gruppe)' },
  85: { goals: [T('make', 4, 2)], note: 'Werkzeug-Level: +3 Züge' },
  86: { goals: [T('clear', 10)], note: 'Erholung' },
  87: { goals: [T('combo', 2), T('street', 2)] },
  88: { goals: [T('purge', 4, 6)] },
  89: { goals: [T('combo', 2), T('make', 4, 2)], note: 'Werkzeug-Level: Zauberstab' },
  90: { goals: [T('tile', 5), T('clear', 10)], note: 'Meilenstein' },
  91: { goals: [T('tile', 5)], note: 'Erholung' },
  92: { goals: [T('combo', 3), T('score', 200)] },
  93: { goals: [T('purge', 3, 6), T('street', 2), T('make', 4, 2)], note: 'drei Ziele' },
  94: { goals: [T('long', 1), T('tile', 5)] },
  95: { goals: [T('empty', 3), T('clear', 8)], note: 'Werkzeug-Level: Rakete' },
  96: { goals: [T('street', 2)], note: 'Erholung' },
  97: { goals: [T('tile', 5), T('clear', 10)] },
  98: { goals: [T('purge', 3, 6), T('combo', 2)], note: '(statt Große Gruppe)' },
  99: { goals: [T('street', 2), T('score', 200)], note: 'Werkzeug-Level: Hinweis' },
  100: { goals: [T('combo', 2), T('score', 250)], note: 'Finale: +3 Züge nötig' },
};
export const FIRST_USE = { empty: 31, long: 41, purge: 51, three: 71 };

// Generator-Hilfen: vorbereitete Ketten/Straßen („plant“) und Brettdichte.
//  plant.kind 'chain' (len Fusionen hintereinander) | 'long' (Straße aus 4); at = Position des Auslöser-Steins
//  in der Steinfolge; missing = so viele vorbereitete Steine fehlen und müssen erst gelegt werden.
export const GEN = {
  21: { plant: { kind: 'chain', len: 2, at: [0, 0], missing: [0, 0] }, min: [1, 2] },
  22: { plant: { kind: 'chain', len: 2, at: [0, 1], missing: [0, 1] }, min: [1, 3] },
  28: { plant: { kind: 'chain', len: 2, at: [0, 2], missing: [1, 1] } },
  30: { plant: { kind: 'chain', len: 2, at: [0, 2], missing: [1, 2] } },
  25: { plant: { kind: 'chain', len: 2, at: [1, 3], missing: [0, 1], wrong: 1 }, tiles: [6, 9] },
  31: { plant: { kind: 'pairs', n: [2, 2] }, tiles: [5, 6] },
  35: { plant: { kind: 'chain', len: 2, at: [1, 3], missing: [0, 1], block: true }, tiles: [9, 12] },
  37: { plant: { kind: 'pairs', n: [2, 3] }, tiles: [6, 8] },
  55: { plant: { kind: 'pairs', n: [3, 4] }, tiles: [7, 9] },
  61: { plant: { kind: 'pairs', n: [2, 3] }, tiles: [6, 8] },
  75: { plant: { kind: 'pairs', n: [3, 4] }, tiles: [8, 10] },
  84: { plant: { kind: 'pairs', n: [3, 4] }, tiles: [8, 10] },
  40: { plant: { kind: 'chain', len: 2, at: [0, 3], missing: [1, 2] } },
  41: { plant: { kind: 'long', at: [0, 1], missing: [0, 0] }, min: [1, 3] },
  43: { plant: { kind: 'chain', len: 2, at: [0, 2], missing: [1, 1] } },
  47: { plant: { kind: 'chain', len: 3, at: [0, 2], missing: [0, 0] }, min: [1, 4] },
  50: { plant: { kind: 'chain', len: 2, at: [0, 2], wrong: 1 } },
  54: { plant: { kind: 'chain', len: 3, at: [0, 2], missing: [1, 1] } },
  59: { plant: { kind: 'chain', len: 3, at: [1, 3], missing: [1, 2] } },
  64: { plant: { kind: 'chain', len: 2, at: [0, 3], missing: [1, 2] } },
  67: { plant: { kind: 'long', at: [0, 3], missing: [1, 1] } },
  69: { plant: { kind: 'chain', len: 3, at: [0, 2], wrong: 1 } },
  70: { plant: { kind: 'long', at: [0, 3], missing: [1, 2] } },
  73: { plant: { kind: 'chain', len: 3, at: [0, 3], missing: [1, 2] } },
  80: { plant: { kind: 'chain', len: 2, at: [0, 3], missing: [1, 2] } },
  81: { plant: { kind: 'chain', len: 2, at: [0, 1], missing: [0, 0] }, min: [1, 3] },
  82: { plant: { kind: 'long', at: [0, 2], missing: [1, 1] } },
  87: { plant: { kind: 'chain', len: 2, at: [0, 3], missing: [1, 2] } },
  89: { plant: { kind: 'chain', len: 2, at: [0, 2], wrong: 1 }, tiles: [6, 9] },
  92: { plant: { kind: 'chain', len: 3, at: [0, 3], missing: [1, 2] } },
  94: { plant: { kind: 'long', at: [0, 3], missing: [1, 2] } },
  95: { plant: { kind: 'pairs', n: [3, 4] }, tiles: [8, 10] },
  98: { plant: { kind: 'chain', len: 2, at: [0, 3], missing: [1, 2] } },
  100: { plant: { kind: 'chain', len: 2, at: [0, 3], missing: [1, 2] } },
};

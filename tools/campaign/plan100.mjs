// Plan für die Level 1–100 (launch-18): längere Level, wachsende Zugzahl, ohne Ketten-Ziele.
//  - 1–10 bleiben leicht und unverändert (Einführung).
//  - 11–100 neu: lösbar ohne Werkzeug (darf sehr schwer sein, nie unmöglich).
//    Werkzeuge helfen nur; wer eines nutzt, bekommt höchstens 2★.
//  - Zugfenster wächst mit dem Fortschritt (Beispiel: 3er/4er und ein 5er auf dem Brett,
//    eine 8 in 40 Zügen). Nach jedem 10er-Meilenstein folgt eine Erholung.
//  - Besondere Squishes (Eis, Schloss, Bombe) kommen in der Kampagne nicht vor.
const T = (type, a, b) => ({ tile: { type, value: a }, make: { type, value: a, count: b }, score: { type, points: a }, clear: { type, tiles: a },
  street: { type, count: a }, combo: { type, chain: a }, empty: { type, max: a }, long: { type, count: a }, purge: { type, value: a, tiles: b } })[type];

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

// launch-18: 1–10 unverändert (kein RETUNE mehr für 11–24).
export const RETUNE = {};
export const KEEP = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** Zugfenster: L11 ≈ 12, L20 ≈ 16, L50 ≈ 28, L100 = 40, plus Rollen-Korrektur. */
export function moveWindow(i) {
  if (i <= 10) return null;
  const mid = 12 + 28 * (i - 11) / 89;
  const adj = { relief: -4, normal: 0, tool: 0, milestone: 3, boss: 4 }[roleOf(i)] ?? 0;
  return Math.round(Math.max(12, Math.min(40, mid + adj)));
}
/** Gewünschtes Optimum (ohne Werkzeug) als Anteil am Fenster. */
function naturalMinCap(i) {
  const goals = MISSIONS[i].goals;
  let cap = 8;
  for (const g of goals) {
    if (g.type === 'tile') cap = Math.max(cap, 6 + Math.max(0, g.value - 3) * 5);
    else if (g.type === 'make') cap = Math.max(cap, 5 + Math.max(0, g.value - 2) * 3 + (g.count || 1) * 2);
    else if (g.type === 'score') cap = Math.max(cap, Math.min(28, Math.ceil(g.points / 35)));
    else if (g.type === 'clear') cap = Math.max(cap, Math.min(20, Math.ceil(g.tiles / 2) + 3));
    else if (g.type === 'street') cap = Math.max(cap, 5 + g.count * 3);
    else if (g.type === 'long') cap = Math.max(cap, 6 + g.count * 4);
    else if (g.type === 'empty') cap = Math.max(cap, 10);
    else if (g.type === 'purge') cap = Math.max(cap, 6 + (g.tiles || 0));
  }
  if (goals.length > 1) cap += 5 * (goals.length - 1);
  return cap;
}
export function minMovesWanted(i) {
  const W = moveWindow(i);
  const frac = { relief: 0.5, normal: 0.68, tool: 0.82, milestone: 0.72, boss: 0.78 }[roleOf(i)];
  const cap = naturalMinCap(i);
  const mid = Math.min(cap, Math.round(W * frac));
  return [Math.max(4, mid - 3), Math.min(W, mid + 3)];
}

// Missionen der neu gebauten Level (11–100). note = Absicht (für Doku/Seite).
export const MISSIONS = {
  11: { goals: [T('tile', 4)], note: 'Einstieg in längere Level, Erholung' },
  12: { goals: [T('make', 3, 3)] },
  13: { goals: [T('clear', 8)] },
  14: { goals: [T('street', 1)] },
  15: { goals: [T('clear', 12), T('score', 160)], note: '1. Werkzeug-Spitze: +3 Züge' },
  16: { goals: [T('score', 180)], note: 'Erholung' },
  17: { goals: [T('tile', 5)] },
  18: { goals: [T('make', 3, 4)] },
  19: { goals: [T('street', 2)] },
  20: { goals: [T('tile', 5), T('clear', 8)], note: 'Meilenstein: ein 5er liegt schon auf dem Brett, dazu räumen' },
  21: { goals: [T('clear', 10)], note: 'Erholung (statt Kette)' },
  22: { goals: [T('score', 220)], note: 'Erholung (statt Kette)' },
  23: { goals: [T('tile', 4), T('clear', 6)], note: 'Doppelziel mit bekannten Typen' },
  24: { goals: [T('score', 200), T('clear', 6)] },
  25: { goals: [T('tile', 5)], note: 'Werkzeug-Spitze: Zauberstab' },
  26: { goals: [T('tile', 5)], note: 'Erholung' },
  27: { goals: [T('street', 3)] },
  28: { goals: [T('make', 4, 2)], note: '(statt Kette)' },
  29: { goals: [T('score', 280), T('clear', 8)] },
  30: { goals: [T('make', 4, 2), T('clear', 10)], note: 'Meilenstein, 5er schon auf dem Brett' },
  31: { goals: [T('empty', 4)], note: 'NEU Brett fast leer (Einführung, offensichtlich)' },
  32: { goals: [T('make', 3, 3)] },
  33: { goals: [T('clear', 14)] },
  34: { goals: [T('tile', 6), T('clear', 8)], note: 'Erste 6 – mit 3ern/4ern und einem 5er, dazu räumen' },
  35: { goals: [T('empty', 4), T('score', 160)], note: 'Werkzeug-Spitze: Rakete' },
  36: { goals: [T('street', 2)], note: 'Erholung' },
  37: { goals: [T('empty', 3)], note: 'Brett fast leer: 3' },
  38: { goals: [T('score', 360)] },
  39: { goals: [T('tile', 5), T('street', 2)], note: '5er schon auf dem Brett' },
  40: { goals: [T('clear', 16), T('street', 2)], note: 'Meilenstein' },
  41: { goals: [T('long', 1)], note: 'NEU Straße aus 4 (Einführung, offensichtlich)' },
  42: { goals: [T('tile', 6)] },
  43: { goals: [T('long', 1), T('score', 200)] },
  44: { goals: [T('make', 5, 2)] },
  45: { goals: [T('street', 2), T('clear', 8)], note: 'Werkzeug-Spitze: Hinweis' },
  46: { goals: [T('clear', 12)], note: 'Erholung' },
  47: { goals: [T('tile', 6), T('clear', 8)], note: '(statt Kette)' },
  48: { goals: [T('street', 3), T('clear', 8)], note: 'fast fertige Straße aus 5' },
  49: { goals: [T('street', 2)], note: 'Werkzeug-Spitze: +3 Züge' },
  50: { goals: [T('tile', 6), T('score', 280)], note: 'Boss: eine 6 und Punkte, Werkzeug-Spitze (Zauberstab)' },
  51: { goals: [T('purge', 2, 6)], note: 'NEU Wert räumen (Einführung, offensichtlich)' },
  52: { goals: [T('score', 320)] },
  53: { goals: [T('tile', 6)] },
  54: { goals: [T('street', 2), T('score', 280)], note: '(statt Kette)' },
  55: { goals: [T('empty', 3)], note: 'Werkzeug-Spitze: Rakete' },
  56: { goals: [T('street', 2)], note: 'Erholung' },
  57: { goals: [T('make', 5, 2), T('street', 1)] },
  58: { goals: [T('purge', 3, 8)] },
  59: { goals: [T('street', 2), T('clear', 10)], note: 'Werkzeug-Spitze: Hinweis' },
  60: { goals: [T('tile', 6), T('score', 360)], note: 'Meilenstein, 5er schon auf dem Brett' },
  61: { goals: [T('empty', 4), T('score', 180)], note: 'Erholung' },
  62: { goals: [T('clear', 16)], note: 'Erholung' },
  63: { goals: [T('tile', 7)], note: 'Erste 7 – langer Aufbau' },
  64: { goals: [T('long', 1), T('street', 2)], note: 'fast fertige Straße aus 5' },
  65: { goals: [T('make', 4, 3)], note: 'Werkzeug-Spitze: +3 Züge' },
  66: { goals: [T('make', 3, 3)], note: 'Erholung' },
  67: { goals: [T('long', 1), T('clear', 10)] },
  68: { goals: [T('street', 2), T('clear', 10)] },
  69: { goals: [T('tile', 6), T('clear', 10)], note: 'Werkzeug-Spitze: Zauberstab' },
  70: { goals: [T('tile', 7), T('make', 5, 2)], note: 'Meilenstein, 5er schon auf dem Brett' },
  71: { goals: [T('tile', 5), T('clear', 8), T('street', 1)], note: 'NEU drei Ziele (Einführung, je leicht)' },
  72: { goals: [T('purge', 3, 8)] },
  73: { goals: [T('tile', 7)], note: '(statt Kette)' },
  74: { goals: [T('make', 5, 2), T('score', 400)] },
  75: { goals: [T('empty', 3), T('score', 220)], note: 'Werkzeug-Spitze: Rakete' },
  76: { goals: [T('street', 3), T('clear', 10)], note: 'Erholung' },
  77: { goals: [T('score', 500), T('purge', 2, 6)] },
  78: { goals: [T('make', 6, 2)] },
  79: { goals: [T('tile', 7), T('street', 2)], note: 'Werkzeug-Spitze: Hinweis' },
  80: { goals: [T('tile', 6), T('clear', 12), T('street', 1)], note: 'Meilenstein: drei Ziele, 5er schon auf dem Brett' },
  81: { goals: [T('clear', 12)], note: 'Erholung' },
  82: { goals: [T('long', 1)], note: 'fast fertige Straße aus 5' },
  83: { goals: [T('tile', 7), T('clear', 10)] },
  84: { goals: [T('score', 600), T('clear', 10)], note: 'hoher Wert (~30) als Blocker auf dem Brett' },
  85: { goals: [T('make', 5, 2), T('clear', 10)], note: 'Werkzeug-Spitze: +3 Züge' },
  86: { goals: [T('clear', 14)], note: 'Erholung' },
  87: { goals: [T('long', 1), T('clear', 10)] },
  88: { goals: [T('purge', 4, 8)] },
  89: { goals: [T('tile', 7), T('score', 360)], note: 'Werkzeug-Spitze: Zauberstab (statt Kette)' },
  90: { goals: [T('tile', 7), T('clear', 12)], note: 'Meilenstein, 5er schon auf dem Brett' },
  91: { goals: [T('score', 500)], note: 'Erholung, hoher Wert (~30) als Blocker auf dem Brett' },
  92: { goals: [T('score', 360), T('clear', 8)], note: 'Erholung' },
  93: { goals: [T('purge', 3, 8), T('street', 2), T('make', 5, 2)], note: 'drei Ziele' },
  94: { goals: [T('long', 1), T('tile', 6)], note: 'fast fertige Straße aus 5, ein 5er liegt schon da' },
  95: { goals: [T('empty', 4), T('score', 260)], note: 'Werkzeug-Spitze: Rakete' },
  96: { goals: [T('street', 2)], note: 'Erholung, hoher Wert als Blocker' },
  97: { goals: [T('tile', 8)], note: 'Erste 8 – langer Aufbau aus 3ern, 4ern und einem 5er' },
  98: { goals: [T('street', 2), T('clear', 10)], note: 'hoher Wert (~30) als Blocker plus Straße' },
  99: { goals: [T('street', 2), T('score', 400)], note: 'Werkzeug-Spitze: Hinweis' },
  100: { goals: [T('tile', 8)], note: 'Finale: 3er, 4er und ein 5er auf dem Brett, eine 8 in 40 Zügen. +3 hilft (höchstens 2★).' },
};
export const RETIRED_GOALS = ['combo', 'group'];
export const FIRST_USE = { empty: 31, long: 41, purge: 51, three: 71 };

// Startbrett-Abwechslung (launch-18). has5 = ein 5er liegt schon da; street5 = fast fertige Straße aus 5;
// high = ein hoher Stein (~28–32); climb = Aufbau aus 3ern/4ern (und oft einem 5er) zu einem hohen Ziel.
export const VARIETY = {
  17: { climb: true, has5: false },
  20: { has5: true },
  30: { has5: true },
  34: { climb: true, has5: true },
  39: { has5: true },
  42: { climb: true, has5: true },
  47: { climb: true, has5: true },
  48: { street5: true },
  50: { climb: true, has5: true },
  53: { climb: true, has5: true },
  60: { has5: true, climb: true },
  63: { climb: true, has5: true },
  64: { street5: true },
  70: { has5: true, climb: true },
  73: { climb: true, has5: true },
  79: { climb: true, has5: true },
  80: { has5: true, climb: true },
  82: { street5: true },
  83: { climb: true, has5: true },
  84: { high: [28, 32] },
  89: { climb: true, has5: true },
  90: { has5: true, climb: true },
  91: { high: [26, 30] },
  94: { street5: true, has5: true },
  96: { high: [28, 32] },
  97: { climb: true, has5: true },
  98: { high: [28, 32] },
  100: { climb: true, has5: true },
};

export const GEN = {
  31: { plant: { kind: 'pairs', n: [2, 3] }, tiles: [8, 10] },
  35: { plant: { kind: 'pairs', n: [3, 4] }, tiles: [8, 10] },
  37: { plant: { kind: 'pairs', n: [2, 3] }, tiles: [6, 8] },
  41: { plant: { kind: 'long', at: [0, 1], missing: [0, 0] }, min: [1, 3] },
  48: { plant: { kind: 'long5', at: [0, 2], missing: [1, 1] } },
  55: { plant: { kind: 'pairs', n: [3, 4] }, tiles: [7, 9] },
  61: { plant: { kind: 'pairs', n: [2, 3] }, tiles: [6, 8] },
  64: { plant: { kind: 'long5', at: [0, 3], missing: [1, 1] } },
  67: { plant: { kind: 'long', at: [0, 3], missing: [1, 1] } },
  75: { plant: { kind: 'pairs', n: [3, 4] }, tiles: [8, 10] },
  82: { plant: { kind: 'long5', at: [0, 2], missing: [1, 1] } },
  84: { plant: { kind: 'pairs', n: [2, 3] }, tiles: [7, 10] },
  94: { plant: { kind: 'long5', at: [0, 3], missing: [1, 2] } },
  95: { plant: { kind: 'pairs', n: [3, 4] }, tiles: [11, 14] },
};

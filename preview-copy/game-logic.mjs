export const SIZE = 5;

export const START_VALUES = [
  [2, 1, null, 3, null],
  [null, null, null, null, 1],
  [3, null, null, 4, null],
  [null, 2, null, null, null],
  [null, null, null, null, null],
];

const copy = board => board.map(row => row.slice());

// ---------- Besondere Squishes (launch-16, Joker squish-art) ----------
// ice:   zieht beim Einschieben normal mit. Ist ein Joker: verschmilzt sofort mit jedem Wert
//        (Fusion oder Straße). Die sichtbare Zahl entfällt. Wird der Eis-Stein verschmolzen,
//        ist das Ergebnis ein normaler Stein (Wert der anderen Steine der Gruppe).
// bound: angekettet – bewegt sich nie, Einschub stoppt davor, verschmilzt nicht. Eine Fusion/Straße
//        direkt daneben sprengt die Ketten → derselbe Squish bleibt als Joker (ohne Zahl, mit jedem
//        Wert verschmelzbar) liegen. Ein befreiter Joker verschmilzt frühestens im nächsten Zug.
// bomb:  Restzeit in ms (Echtzeit-Countdown, Standard 20 s). Ist ein Joker (verschmilzt mit jedem
//        Wert; Ergebnisstein ist normal und entschärft). Läuft die Zeit ab, zerstört die Bombe sich
//        und alle 8 Nachbarn (außer angeketteten).
// Joker-Wert: die nummerierten Steine der Gruppe bestimmen den Wert. Eine reine Joker-Gruppe
//        (mind. 3) gilt als Wert 1 (3 Joker → 2, 5 Joker → 3).
export const BOMB_MS = 20000;
/** Reine Joker-Gruppen verhalten sich wie Steine mit diesem Wert. */
export const JOKER_BASE = 1;
/** Joker: Eis, Bombe, oder ein bereits befreites Schloss. Angekettete sind keine Joker. */
export const isJoker = t => !!(t && !t.bound && (t.ice || t.joker || t.bomb != null));
/**
 * Wert, mit dem ein Stein verschmelzen kann.
 * undefined = leer / angekettet (keine Fusion).
 * null = Joker (passt zu jedem Wert).
 * sonst die Zahl.
 */
export const mergeValue = t => (!t || t.bound ? undefined : isJoker(t) ? null : t.value);
export const isSpecial = t => !!(t && (t.ice || t.bound || t.bomb != null || t.joker));
// Ergebnisstein einer Fusion ist immer normal (Joker/Bombe/Eis sind aufgebraucht).
const plain = (t, value) => ({ id: t.id, value });
/**
 * Ein Zeichen je Zelle (Solver/Hinweis-Schlüssel): '.' leer, Wert base36 normal, U+0100+Wert angekettet
 * (launch-17, '#' = alt, Wert 0), U+00C0+Wert gefroren, U+0400 + Wert·64 + Bomben-Einheiten (à BOMB_UNIT_MS, aufgerundet) Bombe.
 */
export const BOMB_UNIT_MS = 2500;
export function cellCode(t) {
  if (t === null) return '.';
  if (t.bound) return String.fromCharCode(0x100 + t.value);
  if (t.ice) return String.fromCharCode(0xC0 + t.value);
  if (t.joker) return String.fromCharCode(0x200 + (t.value || 1));
  if (t.bomb != null) return String.fromCharCode(0x400 + t.value * 64 + Math.min(63, Math.ceil(t.bomb / BOMB_UNIT_MS)));
  return t.value.toString(36);
}
export function codeCell(ch) {
  if (ch === '.') return null;
  if (ch === '#') return { value: 0, bound: true };
  const n = ch.charCodeAt(0);
  if (n >= 0x400) { const k = n - 0x400; return { value: k >> 6, bomb: (k & 63) * BOMB_UNIT_MS }; }
  if (n >= 0x200) return { value: n - 0x200, joker: true };
  if (n >= 0x100) return { value: n - 0x100, bound: true };
  if (n >= 0xC0) return { value: n - 0xC0, ice: true };
  return { value: parseInt(ch, 36) };
}
export const boardCode = board => { let s = ''; for (const row of board) for (const t of row) s += cellCode(t); return s; };
export const boardFromCode = key => Array.from({ length: SIZE }, (_, r) => Array.from({ length: SIZE }, (_, c) => codeCell(key[r * SIZE + c])));
const ORTHO = [[0, 1], [0, -1], [1, 0], [-1, 0]];
/**
 * Gefrorene und angekettete Steine neben den Zellen der Gruppen befreien (auf `next`): derselbe Stein
 * (id, Wert) bleibt liegen und ist ab jetzt normal. Rückgabe: {thawed, unchained} (Zellen).
 */
function releaseAround(next, groups) {
  const thawed = [], unchained = [];
  for (const g of groups) for (const [r, c] of g.cells) for (const [dr, dc] of ORTHO) {
    const t = next[r + dr]?.[c + dc];
    // Nur die Kette fällt durch eine Fusion daneben – sie wird zum Joker.
    // Eis ist bereits ein Joker und bleibt Eis, bis es selbst verschmilzt.
    if (t && t.bound) { unchained.push([r + dr, c + dc]); next[r + dr][c + dc] = { id: t.id, value: t.value, joker: true }; }
  }
  return { thawed, unchained };
}
/** Wert für die Verschmelz-Prüfung; Zellen in `hold` (gerade befreit) zählen in diesem Zug noch nicht. */
const mv = (board, r, c, hold) => (hold && hold.has(r * SIZE + c) ? undefined : mergeValue(board[r]?.[c]));
/**
 * Bomben-Uhr weiterdrehen (ms). Abgelaufene Bomben explodieren: die Bombe und alle 8 Nachbarn
 * verschwinden (angekettete bleiben). Keine Kettenexplosion: mitgerissene Bomben verschwinden ohne Knall.
 * Rückgabe {board, exploded:[{at:[r,c], id, removed:[[r,c]...]}]} – board unverändert, wenn nichts passiert.
 */
export function tickBombs(board, ms) {
  let next = null; const exploded = [], gone = new Set();
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const t = board[r][c];
    if (!t || t.bomb == null) continue;
    next ||= copy(board);
    next[r][c] = { ...t, bomb: Math.max(0, t.bomb - ms) };
  }
  if (!next) return { board, exploded };
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const t = next[r][c];
    if (!t || t.bomb == null || t.bomb > 0 || gone.has(r * SIZE + c)) continue;
    const removed = [[r, c]];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const n = next[r + dr]?.[c + dc];
      if (n && !n.bound && !gone.has((r + dr) * SIZE + c + dc)) removed.push([r + dr, c + dc]);
    }
    for (const [rr, cc] of removed) gone.add(rr * SIZE + cc);
    exploded.push({ at: [r, c], id: t.id, removed });
  }
  for (const k of gone) next[Math.floor(k / SIZE)][k % SIZE] = null;
  return { board: next, exploded };
}
const key = ([row, col]) => `${row},${col}`;

export function createStartValues(random = Math.random) {
  const shuffle = list => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };
  // Keep the accepted seven-stone difficulty, but vary positions and ordering.
  for (let attempt = 0; attempt < 80; attempt++) {
    const positions = shuffle(Array.from({length:SIZE * SIZE}, (_, i) => i));
    const values = shuffle(START_VALUES.flat().filter(value => value !== null));
    const next = Array.from({length:SIZE}, () => Array(SIZE).fill(null));
    values.forEach((value, i) => { next[Math.floor(positions[i] / SIZE)][positions[i] % SIZE] = value; });
    const tiles = next.map((row, r) => row.map((value, c) => value === null ? null : {id:r * SIZE + c + 1, value}));
    if (!mergePass(tiles).groups.length && !findStreets(tiles).length) return next;
  }
  // A pathological injected random source must never leave initialization stuck.
  return START_VALUES.map(row => row.slice());
}

/** Füllt eine Linie aus Zahlen und Jokern (null) als Straße (±1). Sonst null. */
export function inferStreet(vals) {
  if (!vals || vals.length < 3 || vals.some(v => v === undefined)) return null;
  const known = [];
  for (let i = 0; i < vals.length; i++) if (vals[i] != null) known.push([i, vals[i]]);
  if (known.length === 0) return null; // reine Joker sind eine Fusion, keine Straße
  const apply = (startVal, step) => {
    if (!Number.isInteger(startVal) || !Number.isInteger(step) || Math.abs(step) !== 1) return null;
    const out = vals.map((_, i) => startVal + i * step);
    if (out.some(v => v < 1)) return null;
    for (const [i, v] of known) if (v !== out[i]) return null;
    return out;
  };
  if (known.length >= 2) {
    const [i0, v0] = known[0], [i1, v1] = known[1];
    const di = i1 - i0, dv = v1 - v0;
    if (!di || Math.abs(dv) !== Math.abs(di)) return null;
    const step = dv / di;
    const filled = apply(v0 - i0 * step, step);
    if (!filled) return null;
    for (const [i, v] of known) if (v !== filled[i]) return null;
    return filled;
  }
  const [i, v] = known[0];
  return apply(v - i, 1) || apply(v + i, -1);
}

export function findStreets(board, hold) {
  const streets = [];
  for (const axis of ['row', 'col']) for (let line = 0; line < SIZE; line++) {
    const at = i => axis === 'row' ? [line, i] : [i, line];
    const val = i => mv(board, at(i)[0], at(i)[1], hold);
    for (let start = 0; start < SIZE - 2; start++) {
      if (val(start) === undefined) continue;
      let end = start + 3, filled = inferStreet(Array.from({ length: 3 }, (_, k) => val(start + k)));
      if (!filled) continue;
      while (end < SIZE && val(end) !== undefined) {
        const next = inferStreet(Array.from({ length: end + 1 - start }, (_, k) => val(start + k)));
        if (!next) break;
        filled = next; end++;
      }
      if (end - start < 3) continue;
      if (start > 0 && val(start - 1) !== undefined && inferStreet(Array.from({ length: end - (start - 1) }, (_, k) => val(start - 1 + k)))) continue;
      streets.push({ axis, cells: Array.from({ length: end - start }, (_, i) => at(start + i)), resolved: filled, value: Math.max(...filled) });
    }
  }
  return streets.sort((a, b) => b.cells.length - a.cells.length);
}

export function streetPass(board, hold) {
  const next = copy(board), used = new Set(), groups = [];
  let points = 0;
  for (const street of findStreets(board, hold)) {
    if(street.cells.some(cell=>used.has(key(cell))))continue;
    const resolved=street.resolved||street.cells.map(([rr,cc])=>board[rr][cc].value);
    const target=street.cells.reduce((best,cell,i)=>resolved[i]>(resolved[street.cells.indexOf(best)]??0)?cell:best);
    const [r,c]=target,value=street.value??Math.max(...resolved),nextValue=value+(street.cells.length>=4?1:0);
    for(const cell of street.cells){next[cell[0]][cell[1]]=null;used.add(key(cell));}
    next[r][c]=plain(board[r][c],nextValue);
    groups.push({...street,target,value,nextValue,street:true});
    points+=nextValue*street.cells.length*10;
  }
  if(!groups.length)return {board,groups,points};
  const {thawed,unchained}=releaseAround(next,groups);
  return {board:next,groups,points,thawed,unchained};
}

export function nextMergePass(board, hold) {
  const equal=mergePass(board, hold);
  return equal.groups.length?equal:streetPass(board, hold);
}
/**
 * launch-17: nächster Durchgang innerhalb eines Zugs. `hold` = Set der in diesem Zug befreiten Zellen
 * (r*SIZE+c) – wird hier fortgeschrieben. Spiel (game.mjs) und settle() benutzen beide diese Funktion.
 */
export function settlePass(board, hold) {
  const pass = nextMergePass(board, hold);
  if (pass.groups.length) for (const [r, c] of [...(pass.thawed ?? []), ...(pass.unchained ?? [])]) hold.add(r * SIZE + c);
  return pass;
}

export function insertTile(board, direction, line, tile) {
  if (!['left', 'right', 'up', 'down'].includes(direction) || !Number.isInteger(line) || line < 0 || line >= SIZE) {
    throw new RangeError('Ungültige Einschubrichtung oder Reihe');
  }
  const cells = Array.from({ length: SIZE }, (_, i) => {
    if (direction === 'right') return [line, i];
    if (direction === 'left') return [line, SIZE - 1 - i];
    if (direction === 'down') return [i, line];
    return [SIZE - 1 - i, line];
  });
  // Angekettete Steine sind eine Wand: geschoben wird nur bis davor.
  const wall = cells.findIndex(([row, col]) => board[row][col]?.bound);
  const reach = wall < 0 ? cells.length : wall;
  let gap = -1;
  for (let i = 0; i < reach; i++) { const [row, col] = cells[i]; if (board[row][col] === null) { gap = i; break; } }
  if (gap < 0) return { accepted: false, board };

  const next = copy(board);
  for (let i = gap; i > 0; i--) {
    const [row, col] = cells[i];
    const [previousRow, previousCol] = cells[i - 1];
    next[row][col] = next[previousRow][previousCol];
  }
  const [entryRow, entryCol] = cells[0];
  next[entryRow][entryCol] = tile;
  return { accepted: true, board: next, entry: cells[0] };
}

export function mergePass(board, hold) {
  const parent = new Map();
  const root = k => {
    if (!parent.has(k)) parent.set(k, k);
    if (parent.get(k) !== k) parent.set(k, root(parent.get(k)));
    return parent.get(k);
  };
  const union = (a, b) => parent.set(root(b), root(a));

  for (const axis of ['row', 'col']) {
    for (let line = 0; line < SIZE; line++) {
      let start = 0;
      while (start < SIZE) {
        const at = i => axis === 'row' ? [line, i] : [i, line];
        const [r, c] = at(start);
        const firstVal = mv(board, r, c, hold);
        let end = start + 1;
        let committed = firstVal; // Zahl, null (nur Joker bisher) oder undefined (leer)
        while (committed !== undefined && end < SIZE) {
          const [nr, nc] = at(end);
          const x = mv(board, nr, nc, hold);
          if (x === undefined) break;
          if (x !== null) {
            if (committed === null) committed = x;
            else if (committed !== x) break;
          }
          end++;
        }
        if (firstVal !== undefined && end - start >= 3) {
          const first = key(at(start));
          for (let i = start + 1; i < end; i++) union(first, key(at(i)));
          // A matching tile beside an interior tile joins the same merge (T shape).
          // Only inspect the straight run: branches do not grow recursively.
          // Joker passen immer; eine reine Joker-Reihe übernimmt die Zahl eines T-Zweigs.
          let runVal = committed;
          for (let i = start + 1; i < end - 1; i++) {
            const [mr, mc] = at(i);
            for (const side of [-1, 1]) {
              const nr = axis === 'row' ? mr + side : mr;
              const nc = axis === 'col' ? mc + side : mc;
              const x = mv(board, nr, nc, hold);
              if (x === undefined) continue;
              const sideKey = key([nr, nc]);
              if (parent.has(sideKey)) continue;
              if (x === null || x === runVal || runVal === null) {
                if (runVal === null && x !== null) runVal = x;
                union(first, sideKey);
              }
            }
          }
        }
        // Nach einer gefundenen Gruppe sind deren Joker verbraucht; sonst den nächsten Start versuchen,
        // damit z. B. [3, Joker, 4, 4, 4] die 4er-Fusion inkl. Joker findet.
        start = (firstVal !== undefined && end - start >= 3) ? end : start + 1;
      }
    }
  }

  if (parent.size === 0) return { board, groups: [], points: 0 };
  const components = new Map();
  for (const k of parent.keys()) {
    const id = root(k);
    if (!components.has(id)) components.set(id, []);
    components.get(id).push(k.split(',').map(Number));
  }
  const next = copy(board);
  const groups = [];
  let points = 0;
  for (const cells of components.values()) {
    const centerRow = cells.reduce((sum, [r]) => sum + r, 0) / cells.length;
    const centerCol = cells.reduce((sum, [, c]) => sum + c, 0) / cells.length;
    const target = cells.reduce((best, cell) => {
      const distance = ([r, c]) => (r - centerRow) ** 2 + (c - centerCol) ** 2;
      return distance(cell) < distance(best) ? cell : best;
    });
    const [tr, tc] = target;
    const nums = cells.map(([rr, cc]) => mergeValue(board[rr][cc])).filter(v => v != null);
    const value = nums.length ? nums[0] : JOKER_BASE;
    const nextValue = value + (cells.length >= 5 ? 2 : 1);
    for (const [r, c] of cells) next[r][c] = null;
    next[tr][tc] = plain(board[tr][tc], nextValue);
    groups.push({ cells, target, value, nextValue });
    points += nextValue * cells.length * 10;
  }
  const { thawed, unchained } = releaseAround(next, groups);
  return { board: next, groups, points, thawed, unchained };
}

export function settle(board) {
  const passes = [];
  let next = board;
  let points = 0;
  const hold = new Set();
  for (let i = 0; i < SIZE * SIZE; i++) {
    const pass = settlePass(next, hold);
    if (!pass.groups.length) break;
    passes.push(pass.groups);
    points += pass.points;
    next = pass.board;
  }
  return { board: next, passes, points };
}

export const isGameOver = board => board.every(row => row.every(Boolean)) && !mergePass(board).groups.length && !findStreets(board).length;

export const SIZE = 5;

export const START_VALUES = [
  [2, 1, null, 3, null],
  [null, null, null, null, 1],
  [3, null, null, 4, null],
  [null, 2, null, null, null],
  [null, null, null, null, null],
];

const copy = board => board.map(row => row.slice());

// ---------- Besondere Squishes (launch-16) ----------
// ice:   friert – zieht beim Einschieben normal mit, verschmilzt aber nicht (weder Fusion noch Straße),
//        bis direkt daneben (waagerecht/senkrecht) eine Fusion oder Straße passiert → taut auf und bleibt
//        als derselbe normale Squish (gleiche id, gleicher Wert) liegen.
// bound: angekettet – bewegt sich nie und lässt sich nicht verschieben; wirkt wie eine Wand (Einschub
//        stoppt davor) und verschmilzt nicht. launch-17: trägt eine Zahl; eine Fusion/Straße direkt daneben
//        sprengt die Ketten → derselbe Squish bleibt an seinem Platz, ab jetzt normal (beweglich, verschmelzbar).
// launch-17: Ein befreiter Squish (aufgetaut oder entkettet) verschmilzt frühestens im nächsten Zug – er
//        verschwindet also nie im selben Moment, in dem er befreit wird. (Jede Fusion leert Felder, das Brett
//        ist danach also nie voll – der nächste Zug ist immer möglich, sofern keine Kette die Lücke abriegelt.)
// bomb:  Restzeit in ms (Echtzeit-Countdown, Standard 20 s). Läuft sie ab, zerstört die Bombe sich und
//        alle 8 Nachbarn (außer angeketteten). Wird die Bombe in einer Fusion/Straße verschmolzen,
//        ist sie entschärft (der Ergebnisstein ist normal).
export const BOMB_MS = 20000;
/** Wert, mit dem ein Stein verschmelzen kann – undefined für leer, gefroren oder angekettet. */
export const mergeValue = t => (t && !t.ice && !t.bound ? t.value : undefined);
export const isSpecial = t => !!(t && (t.ice || t.bound || t.bomb != null));
// Ergebnisstein einer Fusion ist immer normal (Bombe entschärft). Normale Steine behalten ihre Felder.
const plain = (t, value) => (t.bomb != null || t.ice ? { id: t.id, value } : { ...t, value });
/**
 * Ein Zeichen je Zelle (Solver/Hinweis-Schlüssel): '.' leer, Wert base36 normal, U+0100+Wert angekettet
 * (launch-17, '#' = alt, Wert 0), U+00C0+Wert gefroren, U+0400 + Wert·64 + Bomben-Einheiten (à BOMB_UNIT_MS, aufgerundet) Bombe.
 */
export const BOMB_UNIT_MS = 2500;
export function cellCode(t) {
  if (t === null) return '.';
  if (t.bound) return String.fromCharCode(0x100 + t.value);
  if (t.ice) return String.fromCharCode(0xC0 + t.value);
  if (t.bomb != null) return String.fromCharCode(0x400 + t.value * 64 + Math.min(63, Math.ceil(t.bomb / BOMB_UNIT_MS)));
  return t.value.toString(36);
}
export function codeCell(ch) {
  if (ch === '.') return null;
  if (ch === '#') return { value: 0, bound: true };
  const n = ch.charCodeAt(0);
  if (n >= 0x400) { const k = n - 0x400; return { value: k >> 6, bomb: (k & 63) * BOMB_UNIT_MS }; }
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
    if (t && (t.ice || t.bound)) { (t.ice ? thawed : unchained).push([r + dr, c + dc]); next[r + dr][c + dc] = { id: t.id, value: t.value }; }
  }
  return { thawed, unchained };
}
/** Wert für die Verschmelz-Prüfung; Zellen in `hold` (gerade befreit) zählen in diesem Zug noch nicht. */
const mv = (board, r, c, hold) => (hold && hold.has(r * SIZE + c) ? undefined : mergeValue(board[r][c]));
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

export function findStreets(board, hold) {
  const streets = [];
  for (const axis of ['row', 'col']) for (let line = 0; line < SIZE; line++) {
    const at = i => axis === 'row' ? [line, i] : [i, line];
    for (let start = 0; start < SIZE - 2; start++) {
      const [r, c] = at(start), [nr, nc] = at(start + 1);
      const value = mv(board, r, c, hold), next = mv(board, nr, nc, hold);
      if (value === undefined || next === undefined || Math.abs(next - value) !== 1) continue;
      const step = next - value;
      // Only emit maximal runs, including a new run after a direction change.
      if (start > 0) { const [pr, pc] = at(start - 1); if (mv(board, pr, pc, hold) === value - step) continue; }
      let end = start + 2;
      while (end < SIZE) { const [er, ec] = at(end); if (mv(board, er, ec, hold) !== value + (end - start) * step) break; end++; }
      if (end - start >= 3) streets.push({axis, cells:Array.from({length:end - start}, (_, i) => at(start + i))});
    }
  }
  // Resolve longer intersecting roads first; row first on ties.
  return streets.sort((a, b) => b.cells.length - a.cells.length);
}

export function streetPass(board, hold) {
  const next = copy(board), used = new Set(), groups = [];
  let points = 0;
  for (const street of findStreets(board, hold)) {
    if(street.cells.some(cell=>used.has(key(cell))))continue;
    const target=street.cells.reduce((best,cell)=>board[cell[0]][cell[1]].value>board[best[0]][best[1]].value?cell:best);
    const [r,c]=target,value=board[r][c].value,nextValue=value+(street.cells.length>=4?1:0);
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
        const value = mv(board, r, c, hold);
        let end = start + 1;
        while (value !== undefined && end < SIZE) {
          const [nr, nc] = at(end);
          if (mv(board, nr, nc, hold) !== value) break;
          end++;
        }
        if (value !== undefined && end - start >= 3) {
          const first = key(at(start));
          for (let i = start + 1; i < end; i++) union(first, key(at(i)));
          // A matching tile beside an interior tile joins the same merge (T shape).
          // Only inspect the straight run: branches do not grow recursively.
          for (let i = start + 1; i < end - 1; i++) {
            const [mr, mc] = at(i);
            for (const side of [-1, 1]) {
              const nr = axis === 'row' ? mr + side : mr;
              const nc = axis === 'col' ? mc + side : mc;
              if (board[nr]?.[nc] !== undefined && mv(board, nr, nc, hold) === value) union(first, key([nr, nc]));
            }
          }
        }
        start = end;
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
    const value = board[tr][tc].value;
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

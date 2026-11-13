export const SIZE = 5;

export const START_VALUES = [
  [2, 1, null, 3, null],
  [null, null, null, null, 1],
  [3, null, null, 4, null],
  [null, 2, null, null, null],
  [null, null, null, null, null],
];

const copy = board => board.map(row => row.slice());
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

export function findStreets(board) {
  const streets = [];
  for (const axis of ['row', 'col']) for (let line = 0; line < SIZE; line++) {
    const at = i => axis === 'row' ? [line, i] : [i, line];
    for (let start = 0; start < SIZE - 2; start++) {
      const [r, c] = at(start), [nr, nc] = at(start + 1);
      const value = board[r][c]?.value, next = board[nr][nc]?.value;
      if (value === undefined || next === undefined || Math.abs(next - value) !== 1) continue;
      const step = next - value;
      // Only emit maximal runs, including a new run after a direction change.
      if (start > 0) { const [pr, pc] = at(start - 1); if (board[pr][pc]?.value === value - step) continue; }
      let end = start + 2;
      while (end < SIZE) { const [er, ec] = at(end); if (board[er][ec]?.value !== value + (end - start) * step) break; end++; }
      if (end - start >= 3) streets.push({axis, cells:Array.from({length:end - start}, (_, i) => at(start + i))});
    }
  }
  // Resolve longer intersecting roads first; row first on ties.
  return streets.sort((a, b) => b.cells.length - a.cells.length);
}

export function streetPass(board) {
  const next = copy(board), used = new Set(), groups = [];
  let points = 0;
  for (const street of findStreets(board)) {
    if(street.cells.some(cell=>used.has(key(cell))))continue;
    const target=street.cells.reduce((best,cell)=>board[cell[0]][cell[1]].value>board[best[0]][best[1]].value?cell:best);
    const [r,c]=target,value=board[r][c].value,nextValue=value+(street.cells.length>=4?1:0);
    for(const cell of street.cells){next[cell[0]][cell[1]]=null;used.add(key(cell));}
    next[r][c]={...board[r][c],value:nextValue};
    groups.push({...street,target,value,nextValue,street:true});
    points+=nextValue*street.cells.length*10;
  }
  return {board:groups.length?next:board,groups,points};
}

export function nextMergePass(board) {
  const equal=mergePass(board);
  return equal.groups.length?equal:streetPass(board);
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
  const gap = cells.findIndex(([row, col]) => board[row][col] === null);
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

export function mergePass(board) {
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
        const value = board[r][c]?.value;
        let end = start + 1;
        while (value !== undefined && end < SIZE) {
          const [nr, nc] = at(end);
          if (board[nr][nc]?.value !== value) break;
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
              if (board[nr]?.[nc]?.value === value) union(first, key([nr, nc]));
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
    next[tr][tc] = { ...board[tr][tc], value: nextValue };
    groups.push({ cells, target, value, nextValue });
    points += nextValue * cells.length * 10;
  }
  return { board: next, groups, points };
}

export function settle(board) {
  const passes = [];
  let next = board;
  let points = 0;
  for (let i = 0; i < SIZE * SIZE; i++) {
    const pass = nextMergePass(next);
    if (!pass.groups.length) break;
    passes.push(pass.groups);
    points += pass.points;
    next = pass.board;
  }
  return { board: next, passes, points };
}

export const isGameOver = board => board.every(row => row.every(Boolean)) && !mergePass(board).groups.length && !findStreets(board).length;

// Start with three possible values. Widen the mix only after the player has
// had time to merge and has actually reached a higher tile.
export function spawnProfile(moves, highest) {
  if (!Number.isInteger(moves) || moves < 0 || !Number.isInteger(highest) || highest < 1) {
    throw new RangeError('Ungültiger Spielfortschritt');
  }
  const floor = Math.min(
    Math.max(1, highest - 4),
    1 + Math.floor(Math.max(0, moves - 20) / 24),
  );
  return { floor, ceiling: floor + (moves >= 72 && highest >= 8 ? 3 : 2), opening: moves < 16 };
}

export function nextSpawn({ board, moves, highest, random = Math.random }) {
  const profile = spawnProfile(moves, highest);
  const values = board.flat().filter(Boolean).map(tile => tile.value);
  // A modest helping hand on crowded boards; the three visible queued tiles
  // stay fixed, so planning ahead still matters. Repeated values get more weight.
  if (values.length >= 15) {
    const counts = new Map();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    const candidates = values.filter(value => counts.get(value) >= 2 && value <= profile.ceiling);
    if (candidates.length && random() < (values.length >= 20 ? .32 : .22)) {
      return candidates[Math.floor(random() * candidates.length)];
    }
  }
  if (profile.opening) {
    const easy = [1, 1, 1, 1, 2, 2, 3];
    return easy[Math.floor(random() * easy.length)];
  }

  // Old low tiles remain mergeable after the main range has moved upward.
  if (moves >= 26 && profile.floor > 1) {
    const older = board.flat().filter(Boolean).map(tile => tile.value).filter(value => value < profile.floor);
    if (older.length && random() < .18) return older[Math.floor(random() * older.length)];
  }
  return profile.floor + Math.floor(random() * (profile.ceiling - profile.floor + 1));
}

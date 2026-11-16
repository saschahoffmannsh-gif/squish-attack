// Game Center (launch-26, nur App-Hülle). Im Web ist alles ein No-Op: kein Dialog,
// kein Score, keine Erfolge. Die App-Hülle meldet sich mit registerGameCenter().
// Spiel startet immer, auch wenn der Spieler Game Center ablehnt.

export const ENDLESS_LEADERBOARD_ID = 'squish.lb.endless';
export const ENDLESS_LEADERBOARD = Object.freeze({
  id: ENDLESS_LEADERBOARD_ID,
  title: { de: 'Endlos-Rekord', en: 'Endless high score' },
  description: {
    de: 'Dein höchster Punktestand im Endlos-Modus.',
    en: 'Your highest score in endless mode.',
  },
  scoreFormat: 'integer',
  sort: 'highToLow',
  recurrence: 'allTime',
});

export const TUTORIAL_LAST_LEVEL = 5;
export const CHAPTER_COUNT = 10;
export const CHAPTER_SIZE = 10;
export const ENDLESS_MILESTONES = Object.freeze([1000, 5000]);
export const GC_FLAGS_KEY = 'squish-gc-flags-v1';

const deEn = (de, en) => Object.freeze({ de, en });

export const ACHIEVEMENTS = Object.freeze([
  {
    id: 'squish.ach.tutorial', points: 5,
    title: deEn('Erste Schritte', 'First steps'),
    description: deEn(
      'Schließe die fünf Tutorial-Level (1–5) ab.',
      'Complete the five tutorial levels (1–5).',
    ),
  },
  {
    id: 'squish.ach.chapter1', points: 5,
    title: deEn('Kapitel 1', 'Chapter 1'),
    description: deEn('Schließe Level 10 ab und beende damit Kapitel 1.', 'Finish level 10 to complete chapter 1.'),
  },
  {
    id: 'squish.ach.chapter2', points: 5,
    title: deEn('Kapitel 2', 'Chapter 2'),
    description: deEn('Schließe Level 20 ab und beende damit Kapitel 2.', 'Finish level 20 to complete chapter 2.'),
  },
  {
    id: 'squish.ach.chapter3', points: 5,
    title: deEn('Kapitel 3', 'Chapter 3'),
    description: deEn('Schließe Level 30 ab und beende damit Kapitel 3.', 'Finish level 30 to complete chapter 3.'),
  },
  {
    id: 'squish.ach.chapter4', points: 5,
    title: deEn('Kapitel 4', 'Chapter 4'),
    description: deEn('Schließe Level 40 ab und beende damit Kapitel 4.', 'Finish level 40 to complete chapter 4.'),
  },
  {
    id: 'squish.ach.chapter5', points: 10,
    title: deEn('Kapitel 5', 'Chapter 5'),
    description: deEn('Schließe Level 50 ab und beende damit Kapitel 5.', 'Finish level 50 to complete chapter 5.'),
  },
  {
    id: 'squish.ach.chapter6', points: 5,
    title: deEn('Kapitel 6', 'Chapter 6'),
    description: deEn('Schließe Level 60 ab und beende damit Kapitel 6.', 'Finish level 60 to complete chapter 6.'),
  },
  {
    id: 'squish.ach.chapter7', points: 5,
    title: deEn('Kapitel 7', 'Chapter 7'),
    description: deEn('Schließe Level 70 ab und beende damit Kapitel 7.', 'Finish level 70 to complete chapter 7.'),
  },
  {
    id: 'squish.ach.chapter8', points: 5,
    title: deEn('Kapitel 8', 'Chapter 8'),
    description: deEn('Schließe Level 80 ab und beende damit Kapitel 8.', 'Finish level 80 to complete chapter 8.'),
  },
  {
    id: 'squish.ach.chapter9', points: 5,
    title: deEn('Kapitel 9', 'Chapter 9'),
    description: deEn('Schließe Level 90 ab und beende damit Kapitel 9.', 'Finish level 90 to complete chapter 9.'),
  },
  {
    id: 'squish.ach.chapter10', points: 15,
    title: deEn('Hundert', 'One hundred'),
    description: deEn('Schließe Level 100 ab und beende alle zehn Kapitel.', 'Finish level 100 to complete all ten chapters.'),
  },
  {
    id: 'squish.ach.first5', points: 5,
    title: deEn('Fünferpack', 'Bunch of five'),
    description: deEn(
      'Verschmilz zum ersten Mal fünf Steine auf einmal (keine Straße).',
      'Merge five tiles at once for the first time (not a straight).',
    ),
  },
  {
    id: 'squish.ach.firstStreet', points: 5,
    title: deEn('Die Straße', 'The straight'),
    description: deEn('Löse zum ersten Mal eine Straße aus.', 'Trigger a straight for the first time.'),
  },
  {
    id: 'squish.ach.perfectChapter', points: 10,
    title: deEn('Perfektes Kapitel', 'Perfect chapter'),
    description: deEn(
      'Hole 3 Sterne auf allen zehn Leveln eines Kapitels (30★, ohne Hilfsmittel).',
      'Earn 3 stars on all ten levels of a chapter (30★, no tools).',
    ),
  },
  {
    id: 'squish.ach.endless1000', points: 5,
    title: deEn('Endlos 1.000', 'Endless 1,000'),
    description: deEn('Erreiche 1.000 Punkte in einer Endlos-Runde.', 'Score 1,000 points in a single endless run.'),
  },
  {
    id: 'squish.ach.endless5000', points: 5,
    title: deEn('Endlos 5.000', 'Endless 5,000'),
    description: deEn('Erreiche 5.000 Punkte in einer Endlos-Runde.', 'Score 5,000 points in a single endless run.'),
  },
]);

export const ACHIEVEMENT_IDS = Object.freeze(ACHIEVEMENTS.map(a => a.id));
export const achievementPointsTotal = () => ACHIEVEMENTS.reduce((n, a) => n + a.points, 0);

const known = new Set(ACHIEVEMENT_IDS);
const won = (progress, n) => progress?.levels?.[String(n)] != null;
const starsOf = (progress, n) => progress?.levels?.[String(n)]?.stars ?? 0;
const wonAtLeast = (progress, n) => Object.keys(progress?.levels || {}).some(k => Number(k) >= n);

/** Welche Erfolge aus Fortschritt, Endlos-Rekord und gesehenen Zügen schon erreicht sind. */
export function earnedAchievements(progress, { bestEndless = 0, sawFiveMerge = false, sawStreet = false } = {}) {
  const ids = [];
  if (wonAtLeast(progress, TUTORIAL_LAST_LEVEL)) ids.push('squish.ach.tutorial');
  for (let k = 1; k <= CHAPTER_COUNT; k++) {
    if (won(progress, k * CHAPTER_SIZE)) ids.push(`squish.ach.chapter${k}`);
  }
  // Tutorial-Level 4 ist die 5er-Fusion, Level 5 die Straße – gilt auch rückwirkend
  // (ein späteres gewonnenes Level setzt voraus, dass diese Schritte schon waren).
  if (sawFiveMerge || wonAtLeast(progress, 4)) ids.push('squish.ach.first5');
  if (sawStreet || wonAtLeast(progress, 5)) ids.push('squish.ach.firstStreet');
  for (let k = 1; k <= CHAPTER_COUNT; k++) {
    const start = (k - 1) * CHAPTER_SIZE + 1;
    let perfect = true;
    for (let i = 0; i < CHAPTER_SIZE; i++) {
      if (starsOf(progress, start + i) !== 3) { perfect = false; break; }
    }
    if (perfect) { ids.push('squish.ach.perfectChapter'); break; }
  }
  const best = Math.max(0, Number(bestEndless) || 0);
  if (best >= 1000) ids.push('squish.ach.endless1000');
  if (best >= 5000) ids.push('squish.ach.endless5000');
  return ids.filter(id => known.has(id));
}

let adapter = null;
let sources = { progress: () => null, bestEndless: () => 0 };
let storage = globalThis.localStorage;
const listeners = new Set();

function flags() {
  try { return { ...JSON.parse(storage?.getItem?.(GC_FLAGS_KEY) || '{}') }; } catch { return {}; }
}
function saveFlags(next) {
  try { storage?.setItem?.(GC_FLAGS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
}

function emit() {
  for (const fn of listeners) { try { fn(); } catch { /* ignore */ } }
}

/** App-Hülle: registerGameCenter({ isAvailable?, isSignedIn, signIn?, submitScore?, reportAchievements?, show? }). */
export function registerGameCenter(a) {
  adapter = a && typeof a.isSignedIn === 'function' ? a : null;
  emit();
}

export function onGameCenterChange(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setGameCenterSources({ progress, bestEndless, storage: st } = {}) {
  if (typeof progress === 'function') sources.progress = progress;
  if (typeof bestEndless === 'function') sources.bestEndless = bestEndless;
  if (st) storage = st;
}

export function isGameCenterAvailable() {
  try { return !!(adapter && (adapter.isAvailable ? adapter.isAvailable() : true)); } catch { return false; }
}

export function isGameCenterSignedIn() {
  try { return !!adapter?.isSignedIn?.(); } catch { return false; }
}

export function canShowGameCenter() {
  return isGameCenterAvailable() && typeof adapter?.show === 'function';
}

export async function signInGameCenter() {
  if (typeof adapter?.signIn !== 'function') return { signedIn: false, reason: 'unavailable' };
  try {
    const r = await adapter.signIn();
    emit();
    return { signedIn: !!r?.signedIn, error: r?.error };
  } catch (e) {
    return { signedIn: false, reason: 'error', error: String(e?.message || e) };
  }
}

export async function showGameCenter(view = 'dashboard', leaderboardId) {
  if (typeof adapter?.show !== 'function') return { ok: false, reason: 'unavailable' };
  try {
    await adapter.show(view, leaderboardId);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'error', error: String(e?.message || e) };
  }
}

export async function submitEndlessScore(score) {
  const value = Math.floor(Number(score) || 0);
  if (value <= 0) return { ok: false, reason: 'skip' };
  if (typeof adapter?.submitScore !== 'function') return { ok: false, reason: 'unavailable' };
  try {
    await adapter.submitScore(ENDLESS_LEADERBOARD_ID, value);
    return { ok: true, value };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

export async function unlockAchievements(ids) {
  const list = [...new Set((ids || []).filter(id => known.has(id)))];
  if (!list.length) return { ok: true, ids: [] };
  if (typeof adapter?.reportAchievements !== 'function') return { ok: false, reason: 'unavailable' };
  try {
    await adapter.reportAchievements(list);
    return { ok: true, ids: list };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

function currentFlags() {
  const f = flags();
  return { sawFiveMerge: !!f.five, sawStreet: !!f.street };
}

export async function syncGameCenter({ progress, bestEndless } = {}) {
  const p = progress !== undefined ? progress : sources.progress();
  const best = bestEndless !== undefined ? bestEndless : sources.bestEndless();
  const ids = earnedAchievements(p, { bestEndless: best, ...currentFlags() });
  const reported = await unlockAchievements(ids);
  return { ids, reported: !!reported.ok };
}

export function noteFiveMerge() {
  const f = flags();
  if (!f.five) saveFlags({ ...f, five: true });
  void syncGameCenter();
}

export function noteStreet() {
  const f = flags();
  if (!f.street) saveFlags({ ...f, street: true });
  void syncGameCenter();
}

export function noteLevelWon(progress) {
  void syncGameCenter({ progress });
}

export function noteEndlessGameOver(score, bestEndless) {
  const run = Math.max(0, Math.floor(Number(score) || 0));
  const best = Math.max(run, Math.floor(Number(bestEndless) || 0));
  void submitEndlessScore(run);
  void syncGameCenter({ bestEndless: best });
}

const api = {
  isAvailable: isGameCenterAvailable,
  isSignedIn: isGameCenterSignedIn,
  signIn: signInGameCenter,
  show: showGameCenter,
  submitEndlessScore,
  unlock: unlockAchievements,
  sync: syncGameCenter,
  leaderboardId: ENDLESS_LEADERBOARD_ID,
};

if (typeof globalThis !== 'undefined') {
  globalThis.SquishNative = Object.assign(globalThis.SquishNative || {}, {
    registerGameCenter,
    gameCenter: api,
  });
}

export { api as gameCenterApi };

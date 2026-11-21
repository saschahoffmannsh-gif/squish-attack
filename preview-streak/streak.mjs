// Daily login streak (4 weeks). Pure logic, no DOM, no network.
// Calendar days are always the device-local date (YYYY-MM-DD).

export const STORAGE_KEY = 'squish-streak-v1';
export const DAYS_PER_WEEK = 7;
export const WEEK_COUNT = 4;

export const TITLES = Object.freeze([
  { id: 'noob', rank: 0, de: 'Squish-Noob', en: 'Squish Noob' },
  { id: 'kneader', rank: 1, de: 'Squish-Kneter', en: 'Squish Kneader', gift: 'extraMoves', giftId: 'streak-1' },
  { id: 'pro', rank: 2, de: 'Squish-Profi', en: 'Squish Pro', gift: 'rocket', giftId: 'streak-2' },
  { id: 'master', rank: 3, de: 'Squish-Meister', en: 'Squish Master', gift: 'extraMoves', giftId: 'streak-3' },
  { id: 'legend', rank: 4, de: 'Squish-Legende', en: 'Squish Legend', gift: 'rocket', giftId: 'streak-4', goldFrame: true },
]);

export const titleById = id => TITLES.find(t => t.id === id) || TITLES[0];
export const titleLabel = (id, lang = 'de') => {
  const t = titleById(id);
  return lang === 'en' ? t.en : t.de;
};
export const titleForWeek = week => TITLES[Math.max(0, Math.min(WEEK_COUNT, week | 0))];

export function emptyState() {
  return { v: 1, title: 'noob', week: 1, dayInWeek: 0, lastCheckIn: null, gifted: [], complete: false };
}

export function localDateISO(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseISO(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return null;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (dt.getFullYear() !== Number(m[1]) || dt.getMonth() !== Number(m[2]) - 1 || dt.getDate() !== Number(m[3])) return null;
  return dt;
}

export function addDaysISO(iso, n) {
  const dt = parseISO(iso);
  if (!dt) return null;
  dt.setDate(dt.getDate() + (n | 0));
  return localDateISO(dt);
}

export function diffDays(fromISO, toISO) {
  const a = parseISO(fromISO), b = parseISO(toISO);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}

function clone(s) {
  return { v: 1, title: s.title, week: s.week, dayInWeek: s.dayInWeek, lastCheckIn: s.lastCheckIn, gifted: [...(s.gifted || [])], complete: !!s.complete };
}

export function normalizeState(raw) {
  const base = emptyState();
  if (!raw || typeof raw !== 'object') return base;
  const title = TITLES.some(t => t.id === raw.title) ? raw.title : 'noob';
  const week = Math.max(1, Math.min(WEEK_COUNT, raw.week | 0 || 1));
  const dayInWeek = Math.max(0, Math.min(DAYS_PER_WEEK, raw.dayInWeek | 0));
  const gifted = Array.isArray(raw.gifted) ? raw.gifted.filter(id => typeof id === 'string') : [];
  const lastCheckIn = parseISO(raw.lastCheckIn) ? raw.lastCheckIn : null;
  const complete = raw.complete === true || title === 'legend' && dayInWeek === 7 && week === 4;
  return { v: 1, title, week, dayInWeek, lastCheckIn, gifted, complete };
}

/**
 * Apply one local-calendar check-in.
 * Missing a day resets only the current week (title stays). After day 28 the
 * streak stays at Legend and no further gifts are granted.
 */
export function checkIn(state, todayISO) {
  const today = parseISO(todayISO) ? todayISO : null;
  if (!today) return { state: normalizeState(state), already: true, missed: false, week: state?.week || 1, poppedDay: 0, titleUp: null, gift: null, complete: !!state?.complete };

  const prev = normalizeState(state);
  if (prev.lastCheckIn === today) {
    return { state: prev, already: true, missed: false, week: displayWeek(prev), poppedDay: displayDay(prev), titleUp: null, gift: null, complete: prev.complete };
  }

  const next = clone(prev);
  let missed = false;

  if (prev.complete) {
    next.lastCheckIn = today;
    return { state: next, already: false, missed: false, week: 4, poppedDay: 7, titleUp: null, gift: null, complete: true };
  }

  if (prev.lastCheckIn) {
    const gap = diffDays(prev.lastCheckIn, today);
    if (gap == null || gap < 0) {
      // Clock moved backwards: ignore, keep state.
      return { state: prev, already: true, missed: false, week: displayWeek(prev), poppedDay: displayDay(prev), titleUp: null, gift: null, complete: prev.complete };
    }
    if (gap > 1) {
      next.dayInWeek = 0;
      missed = true;
    }
  }

  // A title-up leaves week already advanced and dayInWeek = 0 until the next day.
  next.dayInWeek = Math.min(DAYS_PER_WEEK, (next.dayInWeek | 0) + 1);
  next.lastCheckIn = today;

  let titleUp = null, gift = null;
  const showWeek = next.week;
  const poppedDay = next.dayInWeek;

  if (next.dayInWeek === DAYS_PER_WEEK) {
    const earned = titleForWeek(next.week);
    if (earned && earned.rank > 0) {
      next.title = earned.id;
      titleUp = earned;
      if (earned.gift && earned.giftId && !next.gifted.includes(earned.giftId)) {
        gift = { type: earned.gift, id: earned.giftId };
        next.gifted = [...next.gifted, earned.giftId];
      }
    }
    if (next.week >= WEEK_COUNT) {
      next.complete = true;
      next.week = WEEK_COUNT;
      next.dayInWeek = DAYS_PER_WEEK;
      next.title = 'legend';
    } else {
      next.week = next.week + 1;
      next.dayInWeek = 0;
    }
  }

  return { state: next, already: false, missed, week: showWeek, poppedDay, titleUp, gift, complete: next.complete };
}

function displayWeek(s) {
  if (s.complete) return WEEK_COUNT;
  if (s.dayInWeek === 0 && s.week > 1) return s.week; // new week not started; badge uses current week
  return s.week;
}
function displayDay(s) {
  if (s.complete) return DAYS_PER_WEEK;
  return s.dayInWeek;
}

/** Snapshot after n consecutive daily check-ins (n = 0..28+). */
export function stateAfterConsecutive(n, endISO = '2026-01-28') {
  const start = addDaysISO(endISO, 1 - Math.max(0, n | 0)) || endISO;
  let state = emptyState();
  let last = null;
  for (let i = 0; i < Math.max(0, n | 0); i++) {
    const day = addDaysISO(start, i);
    last = checkIn(state, day);
    state = last.state;
  }
  return { state, last };
}

/** Build a state so a check-in on `todayISO` is the Nth consecutive day (1..28). */
export function prepareForDay(n, todayISO) {
  const day = Math.max(1, Math.min(28, n | 0));
  const yesterday = addDaysISO(todayISO, -1);
  const { state } = stateAfterConsecutive(day - 1, yesterday);
  if (day === 1) return emptyState();
  return state;
}

export function loadState(storage = globalThis.localStorage) {
  try { return normalizeState(JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null')); }
  catch { return emptyState(); }
}

export function saveState(state, storage = globalThis.localStorage) {
  try { storage?.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state))); return true; }
  catch { return false; }
}

export function viewOf(state, lang = 'de') {
  const s = normalizeState(state);
  const waitingNextWeek = s.dayInWeek === 0 && s.week > 1 && !s.complete;
  const week = s.complete ? WEEK_COUNT : s.week;
  const filled = s.complete ? DAYS_PER_WEEK : (waitingNextWeek ? 0 : s.dayInWeek);
  const title = titleById(s.title);
  return {
    week,
    filled,
    titleId: s.title,
    title: titleLabel(s.title, lang),
    goldFrame: !!title.goldFrame || s.complete,
    complete: s.complete,
    lastCheckIn: s.lastCheckIn,
    gifted: s.gifted.slice(),
  };
}

export function copyFor(lang = 'de') {
  const de = lang !== 'en';
  return {
    week: de ? 'Woche' : 'Week',
    giftDay: de ? 'Tag 7' : 'Day 7',
    missed: de ? 'Woche von vorn' : 'Week restarts',
    titleUp: de ? 'Neuer Titel!' : 'New title!',
    got: de ? 'Geschenkt' : 'Gifted',
    extraMoves: de ? '+3 Züge' : '+3 moves',
    rocket: de ? 'Rakete' : 'Rocket',
    close: de ? 'Weiter' : 'Continue',
    preview: de ? 'Vorschau · nicht live' : 'Preview · not live',
    debugNext: de ? 'Nächster Tag' : 'Next day',
    debugMiss: de ? 'Tag verpasst' : 'Miss a day',
    debugReset: de ? 'Reset' : 'Reset',
    debugJump: de ? 'Tag' : 'Day',
  };
}

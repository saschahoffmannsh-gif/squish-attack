// Login-day progress (4 × 7 days). Pure logic, no DOM, no network.
// Counts total unique calendar login days — a missed day does not reset progress.
// Calendar days are always the device-local date (YYYY-MM-DD).

export const STORAGE_KEY = 'preview-goal-squish-streak-v1';
export const DAYS_PER_WEEK = 7;
export const WEEK_COUNT = 4;
export const JOURNEY_DAYS = WEEK_COUNT * DAYS_PER_WEEK;

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
  return { v: 2, title: 'noob', week: 1, dayInWeek: 0, totalDays: 0, lastCheckIn: null, gifted: [], complete: false };
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

function totalFromLegacy(raw) {
  const week = Math.max(1, Math.min(WEEK_COUNT, raw.week | 0 || 1));
  const dayInWeek = Math.max(0, Math.min(DAYS_PER_WEEK, raw.dayInWeek | 0));
  const complete = raw.complete === true || (raw.title === 'legend' && dayInWeek === 7 && week === 4);
  if (complete) return JOURNEY_DAYS;
  return (week - 1) * DAYS_PER_WEEK + dayInWeek;
}

function fromTotal(totalDays, gifted, lastCheckIn) {
  const total = Math.max(0, totalDays | 0);
  const complete = total >= JOURNEY_DAYS;
  const track = Math.min(total, JOURNEY_DAYS);
  let week, dayInWeek, titleId;
  if (complete || track >= JOURNEY_DAYS) {
    week = WEEK_COUNT;
    dayInWeek = DAYS_PER_WEEK;
    titleId = 'legend';
  } else if (track === 0) {
    week = 1;
    dayInWeek = 0;
    titleId = 'noob';
  } else if (track % DAYS_PER_WEEK === 0) {
    // Just finished a week: title earned, next week not started yet.
    week = track / DAYS_PER_WEEK + 1;
    dayInWeek = 0;
    titleId = TITLES[track / DAYS_PER_WEEK].id;
  } else {
    week = Math.floor((track - 1) / DAYS_PER_WEEK) + 1;
    dayInWeek = ((track - 1) % DAYS_PER_WEEK) + 1;
    titleId = TITLES[week - 1].id;
  }
  return {
    v: 2,
    title: titleId,
    week,
    dayInWeek,
    totalDays: total,
    lastCheckIn,
    gifted: [...(gifted || [])],
    complete,
  };
}

export function normalizeState(raw) {
  if (!raw || typeof raw !== 'object') return emptyState();
  const gifted = Array.isArray(raw.gifted) ? raw.gifted.filter(id => typeof id === 'string') : [];
  const lastCheckIn = parseISO(raw.lastCheckIn) ? raw.lastCheckIn : null;
  const totalDays = Number.isFinite(raw.totalDays) && raw.totalDays >= 0
    ? raw.totalDays | 0
    : totalFromLegacy(raw);
  return fromTotal(totalDays, gifted, lastCheckIn);
}

function segmentOf(totalDays) {
  const track = Math.min(Math.max(0, totalDays | 0), JOURNEY_DAYS);
  if (track <= 0) return { week: 1, poppedDay: 0 };
  if (track >= JOURNEY_DAYS) return { week: WEEK_COUNT, poppedDay: DAYS_PER_WEEK };
  return {
    week: Math.ceil(track / DAYS_PER_WEEK),
    poppedDay: ((track - 1) % DAYS_PER_WEEK) + 1,
  };
}

function eventOf(state, extra = {}) {
  const seg = segmentOf(state.totalDays);
  return {
    state,
    already: false,
    week: seg.week,
    poppedDay: seg.poppedDay,
    titleUp: null,
    gift: null,
    complete: !!state.complete,
    totalDays: state.totalDays,
    ...extra,
  };
}

/**
 * Apply one local-calendar check-in.
 * Each distinct calendar day counts once toward the total. Gaps do not reset
 * progress. Titles and gifts land at total days 7, 14, 21 and 28. After 28
 * the title stays Legend and no further gifts are granted.
 */
export function checkIn(state, todayISO) {
  const today = parseISO(todayISO) ? todayISO : null;
  if (!today) return eventOf(normalizeState(state), { already: true, week: state?.week || 1, poppedDay: 0 });

  const prev = normalizeState(state);
  if (prev.lastCheckIn === today) return eventOf(prev, { already: true });

  if (prev.lastCheckIn) {
    const gap = diffDays(prev.lastCheckIn, today);
    if (gap == null || gap < 0) return eventOf(prev, { already: true });
  }

  if (prev.complete) {
    const next = fromTotal(prev.totalDays + 1, prev.gifted, today);
    return eventOf(next, { already: false, week: WEEK_COUNT, poppedDay: DAYS_PER_WEEK });
  }

  const totalDays = prev.totalDays + 1;
  let next = fromTotal(totalDays, prev.gifted, today);
  const { week: showWeek, poppedDay } = segmentOf(totalDays);

  let titleUp = null, gift = null;
  if (poppedDay === DAYS_PER_WEEK && totalDays <= JOURNEY_DAYS) {
    const earned = titleForWeek(showWeek);
    if (earned && earned.rank > 0) {
      titleUp = earned;
      if (earned.gift && earned.giftId && !next.gifted.includes(earned.giftId)) {
        gift = { type: earned.gift, id: earned.giftId };
        next = { ...next, gifted: [...next.gifted, earned.giftId] };
      }
    }
  }

  return eventOf(next, { already: false, week: showWeek, poppedDay, titleUp, gift });
}

/** Snapshot after n daily check-ins (n = 0..28+), consecutive dates by default. */
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

/** Build a state so a check-in on `todayISO` is the Nth login day (1..28). */
export function prepareForDay(n, todayISO) {
  const day = Math.max(1, Math.min(JOURNEY_DAYS, n | 0));
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
    totalDays: s.totalDays,
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
    titleUp: de ? 'Neuer Titel' : 'New title',
    got: de ? 'Geschenkt' : 'A gift',
    extraMoves: de ? '+3 Züge' : '+3 moves',
    rocket: de ? 'Rakete' : 'Rocket',
    close: de ? 'Weiter' : 'Continue',
    preview: de ? 'Vorschau · nicht live' : 'Preview · not live',
    dayN: n => (de ? `Tag ${n}` : `Day ${n}`),
  };
}

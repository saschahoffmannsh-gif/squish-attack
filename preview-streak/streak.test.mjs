import { emptyState, checkIn, addDaysISO, diffDays, localDateISO, stateAfterConsecutive, prepareForDay, titleLabel, viewOf, normalizeState } from './streak.mjs';

const assert = (c, msg) => { if (!c) throw new Error(msg); };
let n = 0;
function eq(a, b, msg) {
  n++;
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) throw new Error(`${msg}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
}

// dates
eq(diffDays('2026-01-01', '2026-01-02'), 1, 'adjacent');
eq(diffDays('2026-01-31', '2026-02-01'), 1, 'month');
eq(addDaysISO('2026-02-28', 1), '2026-03-01', 'add');
eq(addDaysISO('2026-03-01', -1), '2026-02-28', 'sub');
// DST-ish local: just don't use UTC
const d = new Date(2026, 2, 29, 23, 30); // Mar 29 2026 is DST start in Berlin
eq(localDateISO(d), '2026-03-29', 'local not UTC');

// first check-in
{
  const r = checkIn(emptyState(), '2026-01-01');
  eq(r.already, false, 'first already');
  eq(r.missed, false, 'first missed');
  eq(r.week, 1, 'first week');
  eq(r.poppedDay, 1, 'first day');
  eq(r.state.title, 'noob', 'starts noob');
  eq(r.gift, null, 'no gift day 1');
  eq(r.titleUp, null, 'no title day 1');
}

// same day is idempotent
{
  const a = checkIn(emptyState(), '2026-01-01');
  const b = checkIn(a.state, '2026-01-01');
  eq(b.already, true, 'same day');
  eq(b.state.dayInWeek, 1, 'no double count');
}

// 7 consecutive → kneader + extraMoves, week advances
{
  const { state, last } = stateAfterConsecutive(7, '2026-01-07');
  eq(last.week, 1, 'ceremony week 1');
  eq(last.poppedDay, 7, 'day 7');
  eq(last.titleUp.id, 'kneader', 'title kneader');
  eq(last.gift, { type: 'extraMoves', id: 'streak-1' }, 'gift week 1');
  eq(state.title, 'kneader', 'saved title');
  eq(state.week, 2, 'advanced to week 2');
  eq(state.dayInWeek, 0, 'new week not started');
  eq(state.gifted, ['streak-1'], 'gifted recorded');
}

// day 8 starts week 2
{
  const { state, last } = stateAfterConsecutive(8, '2026-01-08');
  eq(last.week, 2, 'week 2 shown');
  eq(last.poppedDay, 1, 'w2 d1');
  eq(last.titleUp, null, 'no title on d8');
  eq(state.title, 'kneader', 'keeps kneader');
  eq(state.week, 2, 'still week 2');
  eq(state.dayInWeek, 1, 'day 1');
}

// all four weeks
{
  const expect = [
    [7, 'kneader', 'extraMoves', 'streak-1'],
    [14, 'pro', 'rocket', 'streak-2'],
    [21, 'master', 'extraMoves', 'streak-3'],
    [28, 'legend', 'rocket', 'streak-4'],
  ];
  for (const [day, id, type, gid] of expect) {
    const { state, last } = stateAfterConsecutive(day, addDaysISO('2026-01-01', day - 1));
    eq(last.titleUp.id, id, `title ${id}`);
    eq(last.gift, { type, id: gid }, `gift ${gid}`);
    eq(state.title, id, `state ${id}`);
    if (day === 28) {
      eq(state.complete, true, 'complete');
      eq(state.week, 4, 'stay week 4');
      eq(state.dayInWeek, 7, 'stay day 7');
      eq(titleLabel(state.title, 'de'), 'Squish-Legende', 'de legend');
      eq(titleLabel(state.title, 'en'), 'Squish Legend', 'en legend');
    }
  }
}

// miss mid-week resets only this week, title stays
{
  let { state } = stateAfterConsecutive(10, '2026-01-10'); // week 2 day 3, kneader
  eq(state.title, 'kneader', 'pre miss title');
  eq(state.week, 2, 'pre miss week');
  eq(state.dayInWeek, 3, 'pre miss day');
  const miss = checkIn(state, '2026-01-12'); // skipped 01-11
  eq(miss.missed, true, 'missed flag');
  eq(miss.week, 2, 'same week');
  eq(miss.poppedDay, 1, 'restarted at 1');
  eq(miss.state.title, 'kneader', 'title kept');
  eq(miss.state.week, 2, 'week kept');
  eq(miss.state.dayInWeek, 1, 'day 1');
  eq(miss.state.gifted, ['streak-1'], 'no gift lost or doubled');
  eq(miss.titleUp, null, 'no title on miss restart');
}

// miss after title-up (week 2 not started) still starts week 2 day 1, title kept
{
  const { state } = stateAfterConsecutive(7, '2026-01-07');
  const miss = checkIn(state, '2026-01-10');
  eq(miss.missed, true, 'gap after ceremony');
  eq(miss.week, 2, 'week 2');
  eq(miss.poppedDay, 1, 'w2 starts at 1');
  eq(miss.state.title, 'kneader', 'kept');
}

// after 28, later days stay legend, no gifts
{
  const { state } = stateAfterConsecutive(28, '2026-01-28');
  const later = checkIn(state, '2026-01-29');
  eq(later.complete, true, 'still complete');
  eq(later.gift, null, 'no more gifts');
  eq(later.titleUp, null, 'no more titles');
  eq(later.state.title, 'legend', 'legend');
  eq(later.poppedDay, 7, 'shows full week');
  const miss = checkIn(later.state, '2026-02-04');
  eq(miss.state.title, 'legend', 'miss after 28 keeps title');
  eq(miss.state.complete, true, 'still complete after miss');
  eq(miss.gift, null, 'no gift after miss');
}

// gifts are not granted twice
{
  const { state } = stateAfterConsecutive(7, '2026-01-07');
  // force a fake re-complete? can't re-earn week 1. Manually:
  const hacked = { ...state, week: 1, dayInWeek: 6, complete: false, title: 'noob', lastCheckIn: '2026-01-20' };
  const again = checkIn(hacked, '2026-01-21');
  eq(again.titleUp.id, 'kneader', 'would title again');
  eq(again.gift, null, 'gift already in gifted[]');
  eq(again.state.gifted, ['streak-1'], 'unchanged gifted');
}

// prepareForDay + checkIn today = day N ceremony
{
  const today = '2026-06-15';
  const pre = prepareForDay(7, today);
  eq(pre.title, 'noob', 'not yet titled');
  eq(pre.week, 1, 'still week 1');
  eq(pre.dayInWeek, 6, 'six days done');
  const ev = checkIn(pre, today);
  eq(ev.poppedDay, 7, 'today is day 7');
  eq(ev.titleUp.id, 'kneader', 'title-up fires');
}

{
  const today = '2026-06-15';
  const ev = checkIn(prepareForDay(28, today), today);
  eq(ev.titleUp.id, 'legend', 'day 28 legend');
  eq(ev.gift.id, 'streak-4', 'legend gift');
  eq(ev.state.complete, true, 'done');
}

// view
{
  const { state } = stateAfterConsecutive(7, '2026-01-07');
  const v = viewOf(state, 'de');
  eq(v.title, 'Squish-Kneter', 'view title');
  eq(v.week, 2, 'view next week');
  eq(v.filled, 0, 'new week empty until next day');
  eq(v.goldFrame, false, 'not gold yet');
}

eq(titleLabel('noob', 'en'), 'Squish Noob', 'en noob');
eq(normalizeState(null).title, 'noob', 'norm empty');

console.log(`OK ${n} assertions`);

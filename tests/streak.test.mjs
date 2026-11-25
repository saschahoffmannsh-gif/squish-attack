import { emptyState, checkIn, addDaysISO, diffDays, localDateISO, stateAfterConsecutive, prepareForDay, titleLabel, viewOf, normalizeState } from '../game/streak.mjs?v=launch-43';

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
const d = new Date(2026, 2, 29, 23, 30); // Mar 29 2026 is DST start in Berlin
eq(localDateISO(d), '2026-03-29', 'local not UTC');

// first check-in
{
  const r = checkIn(emptyState(), '2026-01-01');
  eq(r.already, false, 'first already');
  eq(r.week, 1, 'first week');
  eq(r.poppedDay, 1, 'first day');
  eq(r.totalDays, 1, 'first total');
  eq(r.state.title, 'noob', 'starts noob');
  eq(r.state.totalDays, 1, 'state total 1');
  eq(r.gift, null, 'no gift day 1');
  eq(r.titleUp, null, 'no title day 1');
}

// same day is idempotent
{
  const a = checkIn(emptyState(), '2026-01-01');
  const b = checkIn(a.state, '2026-01-01');
  eq(b.already, true, 'same day');
  eq(b.state.dayInWeek, 1, 'no double count');
  eq(b.state.totalDays, 1, 'total stays 1');
  eq(b.totalDays, 1, 'event total stays 1');
}

// 7 login days → kneader + extraMoves, week advances
{
  const { state, last } = stateAfterConsecutive(7, '2026-01-07');
  eq(last.week, 1, 'ceremony week 1');
  eq(last.poppedDay, 7, 'day 7');
  eq(last.totalDays, 7, 'total 7');
  eq(last.titleUp.id, 'kneader', 'title kneader');
  eq(last.gift, { type: 'extraMoves', id: 'streak-1' }, 'gift week 1');
  eq(state.title, 'kneader', 'saved title');
  eq(state.week, 2, 'advanced to week 2');
  eq(state.dayInWeek, 0, 'new week not started');
  eq(state.totalDays, 7, 'saved total 7');
  eq(state.gifted, ['streak-1'], 'gifted recorded');
}

// day 8 starts week 2
{
  const { state, last } = stateAfterConsecutive(8, '2026-01-08');
  eq(last.week, 2, 'week 2 shown');
  eq(last.poppedDay, 1, 'w2 d1');
  eq(last.totalDays, 8, 'total 8');
  eq(last.titleUp, null, 'no title on d8');
  eq(state.title, 'kneader', 'keeps kneader');
  eq(state.week, 2, 'still week 2');
  eq(state.dayInWeek, 1, 'day 1');
  eq(state.totalDays, 8, 'saved total 8');
}

// all four weeks, gifts at 7/14/21/28
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
    eq(last.totalDays, day, `event total ${day}`);
    eq(state.title, id, `state ${id}`);
    eq(state.totalDays, day, `state total ${day}`);
    if (day === 28) {
      eq(state.complete, true, 'complete');
      eq(state.week, 4, 'stay week 4');
      eq(state.dayInWeek, 7, 'stay day 7');
      eq(titleLabel(state.title, 'de'), 'Squish-Legende', 'de legend');
      eq(titleLabel(state.title, 'en'), 'Squish Legend', 'en legend');
    }
  }
}

// a gap does not reset: 3 logins, skip days, 4th login continues
{
  let { state } = stateAfterConsecutive(3, '2026-01-03');
  eq(state.title, 'noob', 'pre gap title');
  eq(state.totalDays, 3, 'pre gap total');
  eq(state.dayInWeek, 3, 'pre gap day');
  const later = checkIn(state, '2026-01-10');
  eq(later.already, false, 'gap counts');
  eq(later.week, 1, 'same week');
  eq(later.poppedDay, 4, 'continues at 4');
  eq(later.totalDays, 4, 'total 4');
  eq(later.state.title, 'noob', 'title kept');
  eq(later.state.dayInWeek, 4, 'day 4');
  eq(later.titleUp, null, 'no title on day 4');
}

// gap after title-up still starts week 2 day 1, title kept
{
  const { state } = stateAfterConsecutive(7, '2026-01-07');
  const later = checkIn(state, '2026-01-10');
  eq(later.week, 2, 'week 2');
  eq(later.poppedDay, 1, 'w2 starts at 1');
  eq(later.totalDays, 8, 'total 8 after gap');
  eq(later.state.title, 'kneader', 'kept');
  eq(later.gift, null, 'no extra gift');
}

// gap mid week 2 does not lose week-1 gift or restart
{
  const { state } = stateAfterConsecutive(10, '2026-01-10'); // week 2 day 3
  const later = checkIn(state, '2026-01-20');
  eq(later.poppedDay, 4, 'continues week 2');
  eq(later.totalDays, 11, 'total 11');
  eq(later.state.title, 'kneader', 'title kept');
  eq(later.state.gifted, ['streak-1'], 'no gift lost or doubled');
}

// after 28, later days stay legend, no gifts, total still grows
{
  const { state } = stateAfterConsecutive(28, '2026-01-28');
  const later = checkIn(state, '2026-01-29');
  eq(later.complete, true, 'still complete');
  eq(later.gift, null, 'no more gifts');
  eq(later.titleUp, null, 'no more titles');
  eq(later.state.title, 'legend', 'legend');
  eq(later.poppedDay, 7, 'shows full week');
  eq(later.totalDays, 29, 'count continues');
  const gap = checkIn(later.state, '2026-02-04');
  eq(gap.state.title, 'legend', 'gap after 28 keeps title');
  eq(gap.state.complete, true, 'still complete after gap');
  eq(gap.gift, null, 'no gift after later login');
  eq(gap.totalDays, 30, 'total keeps growing');
}

// gifts are not granted twice
{
  const { state } = stateAfterConsecutive(7, '2026-01-07');
  const hacked = { ...state, week: 1, dayInWeek: 6, complete: false, title: 'noob', totalDays: 6, lastCheckIn: '2026-01-20' };
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
  eq(pre.totalDays, 6, 'six total');
  const ev = checkIn(pre, today);
  eq(ev.poppedDay, 7, 'today is day 7');
  eq(ev.totalDays, 7, 'total 7');
  eq(ev.titleUp.id, 'kneader', 'title-up fires');
}

{
  const today = '2026-06-15';
  const ev = checkIn(prepareForDay(28, today), today);
  eq(ev.titleUp.id, 'legend', 'day 28 legend');
  eq(ev.gift.id, 'streak-4', 'legend gift');
  eq(ev.state.complete, true, 'done');
  eq(ev.totalDays, 28, 'total 28');
}

// view
{
  const { state } = stateAfterConsecutive(7, '2026-01-07');
  const v = viewOf(state, 'de');
  eq(v.title, 'Squish-Kneter', 'view title');
  eq(v.week, 2, 'view next week');
  eq(v.filled, 0, 'new week empty until next day');
  eq(v.totalDays, 7, 'view total 7');
  eq(v.goldFrame, false, 'not gold yet');
}

// legacy states without totalDays migrate
{
  const mid = normalizeState({ v: 1, title: 'kneader', week: 2, dayInWeek: 3, lastCheckIn: '2026-01-10', gifted: ['streak-1'], complete: false });
  eq(mid.totalDays, 10, 'legacy mid-week 2');
  eq(mid.title, 'kneader', 'legacy title');
  const after = normalizeState({ v: 1, title: 'kneader', week: 2, dayInWeek: 0, lastCheckIn: '2026-01-07', gifted: ['streak-1'], complete: false });
  eq(after.totalDays, 7, 'legacy after ceremony');
  const done = normalizeState({ v: 1, title: 'legend', week: 4, dayInWeek: 7, lastCheckIn: '2026-01-28', gifted: ['streak-1','streak-2','streak-3','streak-4'], complete: true });
  eq(done.totalDays, 28, 'legacy complete');
}

eq(titleLabel('noob', 'en'), 'Squish Noob', 'en noob');
eq(normalizeState(null).title, 'noob', 'norm empty');
eq(normalizeState(null).totalDays, 0, 'norm total 0');

console.log(`OK ${n} assertions`);

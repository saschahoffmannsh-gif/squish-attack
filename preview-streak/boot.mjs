// Wire the streak preview into the launch-38 home menu. Live /game/ is not used.
import { getLang, onLangChange } from '../game/i18n.mjs?v=launch-38';
import { emptyState } from './streak.mjs';
import {
  loadState, saveState, checkIn, prepareForDay, viewOf,
  getClockToday, setClockToday, advanceClock,
  showPopup, closePopup, renderBadge, renderPreviewTag, installDebug, syncGifted,
} from './streak-ui.mjs';

const params = new URLSearchParams(location.search);
let state = loadState();

function waitForHome(timeout = 45000) {
  const t0 = performance.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const menu = document.getElementById('home-menu');
      if (menu && !menu.hidden && window.SquishGame) return resolve(menu);
      if (performance.now() - t0 > timeout) return reject(new Error('home timeout'));
      requestAnimationFrame(tick);
    };
    tick();
  });
}

function paintChrome() {
  renderPreviewTag();
  const badge = renderBadge(state);
  if (badge && !badge.dataset.bound) {
    badge.dataset.bound = '1';
    badge.addEventListener('click', () => {
      const v = viewOf(state, getLang() === 'en' ? 'en' : 'de');
      showPopup({
        state, week: v.week, poppedDay: v.filled || (state.complete ? 7 : 0),
        titleUp: null, gift: null, missed: false, complete: state.complete,
      });
    });
  }
  debug?.paint?.();
}

function applyEvent(ev, { popup = true } = {}) {
  state = ev.state;
  saveState(state);
  syncGifted(state);
  paintChrome();
  if (popup && !ev.already) showPopup(ev, { onClose: paintChrome });
  else if (popup && ev.already) { /* stay quiet */ }
  return ev;
}

function checkToday({ forcePopup = false } = {}) {
  const ev = checkIn(state, getClockToday());
  return applyEvent(ev, { popup: forcePopup || !ev.already });
}

function jumpTo(n) {
  const today = getClockToday();
  state = prepareForDay(n, today);
  saveState(state);
  const ev = checkIn(state, today);
  return applyEvent(ev, { popup: true });
}

function onNext() {
  closePopup();
  advanceClock(1);
  checkToday({ forcePopup: true });
}
function onMiss() {
  closePopup();
  advanceClock(2);
  checkToday({ forcePopup: true });
}
function onReset() {
  closePopup();
  try { sessionStorage.removeItem('shift3-preview-streak-clock'); } catch {}
  setClockToday(getClockToday());
  state = emptyState();
  saveState(state);
  paintChrome();
}

let debug;
async function start() {
  await waitForHome();
  if (params.has('reset')) { state = emptyState(); saveState(state); }
  const dayParam = Number(params.get('day'));
  if (Number.isFinite(dayParam) && dayParam >= 1 && dayParam <= 28) {
    jumpTo(dayParam);
  } else if (params.has('miss')) {
    advanceClock(2);
    checkToday({ forcePopup: true });
  } else {
    checkToday();
  }
  paintChrome();
  debug = installDebug({
    onNext, onMiss, onReset, onJump: jumpTo,
    getState: () => state, getToday: getClockToday,
  });
  onLangChange(paintChrome);
}

window.SquishStreakPreview = {
  get state() { return state; },
  today: getClockToday,
  next: onNext, miss: onMiss, reset: onReset, jump: jumpTo, check: checkToday,
};

void start().catch(err => console.warn('streak preview', err));

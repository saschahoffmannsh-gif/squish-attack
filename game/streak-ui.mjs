import { TOOL_ICONS } from './tool-icons.mjs?v=launch-44';
import { getLang } from './i18n.mjs?v=launch-44';
import { grantTool, saveInventory } from './campaign.mjs?v=launch-44';
import { createConfetti } from './confetti.mjs?v=launch-44';
import { createHaptics } from './haptics.mjs?v=launch-44';
import {
  checkIn, loadState, saveState, viewOf, copyFor, titleLabel,
  localDateISO, titleById, TITLES,
} from './streak.mjs?v=launch-44';

const sprite = name => new URL(`./streak-sprites/${name}.png`, import.meta.url).href;
const GEL = [1, 2, 3, 4, 5, 6, 7].map(v => sprite(`gel-${v}`));
const GEL_GHOST = sprite('gel-ghost');
const GIFT = sprite('gift');
const GIFT_OPEN = sprite('gift-open');

const CHECK_SVG = `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="#2cb500" stroke="#0a3600" stroke-width="2"/><path d="M8.5 16.5 13.5 21.5 23 11.5" fill="none" stroke="#fffbea" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function dayNumSvg(n) {
  return `<svg viewBox="0 0 32 32" aria-hidden="true"><text x="16" y="24" text-anchor="middle" font-family="AW Comic, Fredoka, ui-rounded, sans-serif" font-weight="700" font-size="22" fill="#fff7df" stroke="#1b1030" stroke-width="4.2" stroke-linejoin="round" paint-order="stroke" letter-spacing="-0.5">${n}</text></svg>`;
}

const EMBLEMS = {
  noob: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3.5c0 0-9.5 11.5-9.5 17.5a9.5 9.5 0 0 0 19 0c0-6-9.5-17.5-9.5-17.5z" fill="#7ecbff" stroke="#1a1638" stroke-width="2.2" stroke-linejoin="round"/><path d="M12 20.5c1.6 3.2 6.4 3.2 8 0" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/></svg>`,
  kneader: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M10.5 13c-2 2.2-2.2 5.4 0 8.2 1.8 2.2 4.2 3.3 5.5 3.3s3.7-1.1 5.5-3.3c2.2-2.8 2-6 0-8.2C19.6 10.6 17.2 9.2 16 9.2s-3.6 1.4-5.5 3.8z" fill="#ffe066" stroke="#1a1638" stroke-width="2" stroke-linejoin="round"/><circle cx="13.6" cy="16.2" r="1.15" fill="#1a1638"/><circle cx="18.4" cy="16.2" r="1.15" fill="#1a1638"/><circle cx="8.2" cy="9.2" r="3.3" fill="#fff0d0" stroke="#1a1638" stroke-width="1.8"/><circle cx="23.8" cy="9.2" r="3.3" fill="#fff0d0" stroke="#1a1638" stroke-width="1.8"/></svg>`,
  pro: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3.5 19.6 12.2 29 13.2 22 19.4 24 28.5 16 23.8 8 28.5 10 19.4 3 13.2 12.4 12.2Z" fill="currentColor" stroke="#1a1638" stroke-width="2" stroke-linejoin="round"/></svg>`,
  master: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 20 8.2 8.5 16 15l7.8-6.5L27 20H5z" fill="currentColor" stroke="#1a1638" stroke-width="2" stroke-linejoin="round"/><rect x="5" y="20" width="22" height="5" rx="1.2" fill="currentColor" stroke="#1a1638" stroke-width="2"/></svg>`,
  legend: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 3.2v5.2M3.4 5.8h5.2" stroke="#7ecbff" stroke-width="2" stroke-linecap="round"/><path d="M26 3.2v5.2M23.4 5.8h5.2" stroke="#7ecbff" stroke-width="2" stroke-linecap="round"/><path d="M4 20.4 8.2 8.6 16 15.2 23.8 8.6 28 20.4H4z" fill="currentColor" stroke="#1a1638" stroke-width="2" stroke-linejoin="round"/><rect x="4" y="20" width="24" height="5.4" rx="1.2" fill="currentColor" stroke="#1a1638" stroke-width="2"/><circle cx="16" cy="15.4" r="2" fill="#ff4d4d" stroke="#1a1638" stroke-width="1.3"/></svg>`,
};

const TIER = { noob: 'noob', kneader: 'kneader', pro: 'pro', master: 'master', legend: 'legend' };
const TIER_BADGE = { noob: '', kneader: 'is-bronze', pro: 'is-silver', master: 'is-gold', legend: 'is-legend' };
const GIFT_MAP = { 'streak-1': 'extraMoves', 'streak-2': 'rocket', 'streak-3': 'extraMoves', 'streak-4': 'rocket' };

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const reduced = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
const wait = ms => new Promise(r => setTimeout(r, ms));

let hooks = {
  getInventory: () => window.SquishGame?.campaign?.inventory,
  applyInventory: null,
  isBlocked: () => false,
};

const haptics = createHaptics();
const confetti = createConfetti();

function lang() { try { return getLang() === 'en' ? 'en' : 'de'; } catch { return document.documentElement.lang === 'en' ? 'en' : 'de'; } }

export function grantGold(type, id) {
  const inv = hooks.getInventory?.();
  if (!inv || !type || !id) return false;
  if ((inv.gifts || []).includes(id)) return false;
  const r = grantTool(inv, type);
  const next = { ...r.inventory, gifts: [...(r.inventory.gifts || []), id], at: Date.now() };
  if (hooks.applyInventory) hooks.applyInventory(next);
  else {
    inv.extraMoves = next.extraMoves;
    inv.rocket = next.rocket;
    inv.hint = next.hint;
    inv.wand = next.wand;
    inv.gifts = next.gifts;
    inv.pending = next.pending;
    inv.at = next.at;
    saveInventory(inv);
  }
  return r;
}

export function syncGifted(state) {
  const gifted = state?.gifted || [];
  let n = 0;
  for (const id of gifted) if (GIFT_MAP[id] && grantGold(GIFT_MAP[id], id)) n++;
  return n;
}

function isOnScreen(node) {
  if (!node) return false;
  const r = node.getBoundingClientRect();
  return r.width > 8 && r.height > 8 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
}

function flyIcon(type, fromEl, toEl) {
  if (reduced() || !fromEl || !isOnScreen(toEl)) {
    toEl?.classList.add('is-got');
    return wait(200);
  }
  const a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
  const f = el('i', ''); f.id = 'streak-fly'; f.innerHTML = TOOL_ICONS[type] || '';
  const size = 44;
  f.style.left = `${a.left + a.width / 2 - size / 2}px`;
  f.style.top = `${a.top + a.height / 2 - size / 2}px`;
  document.body.append(f);
  const tx = b.left + b.width / 2 - size / 2 - parseFloat(f.style.left);
  const ty = b.top + b.height / 2 - size / 2 - parseFloat(f.style.top);
  return f.animate([
    { transform: 'translate(0,0) scale(1)', opacity: 1 },
    { transform: `translate(${tx * .45}px,${ty * .45 - 48}px) scale(1.15)`, opacity: 1, offset: .45 },
    { transform: `translate(${tx}px,${ty}px) scale(.5)`, opacity: .9 },
  ], { duration: 620, easing: 'cubic-bezier(.45,0,.3,1)', fill: 'forwards' }).finished.then(() => {
    toEl.classList.add('is-got');
    f.remove();
  }).catch(() => { f.remove(); });
}

function burstConfetti(overlay, card) {
  if (reduced()) return;
  const r = card.getBoundingClientRect();
  const rect = { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
  try {
    void confetti.burst(rect, { reduced: false, burstMs: 1100 });
    const c = document.querySelector('.aw-confetti');
    if (c && overlay) {
      c.style.zIndex = '';
      overlay.insertBefore(c, card);
    }
  } catch {}
}

export function closePopup() {
  try { confetti.stop(); } catch {}
  document.getElementById('streak-fly')?.remove();
  document.getElementById('streak-pop')?.remove();
}

export const isOpen = () => !!document.getElementById('streak-pop');

function pathItems(state, eventWeek) {
  const currentWeek = eventWeek || state?.week || 1;
  const complete = !!state?.complete || !!titleById(state?.title).goldFrame;
  const earnedRank = titleById(state?.title).rank;
  return [1, 2, 3, 4].map(week => {
    const title = (week === 1 && earnedRank < 1 && !complete) ? TITLES[0] : TITLES[week];
    let cls = 'is-todo';
    if (complete || earnedRank > week) cls = 'is-done';
    else if (earnedRank === week || (currentWeek === week && eventWeek === week && earnedRank >= week)) cls = 'is-done';
    else if (currentWeek === week) cls = 'is-now';
    if (currentWeek === week && earnedRank >= week) cls = 'is-done';
    if (currentWeek === week && earnedRank < week && !complete) cls = 'is-now';
    return { week, title, cls };
  });
}

export function showPopup(event, { onClose } = {}) {
  closePopup();
  const L = lang(), copy = copyFor(L);
  const titleId = event.titleUp?.id || event.state?.title || 'noob';
  const tier = TIER[titleId] || 'noob';
  const isUp = !!event.titleUp;
  const overlay = el('div', isUp ? 'is-titleup' : ''); overlay.id = 'streak-pop';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', titleLabel(titleId, L));

  const backdrop = el('div', 'sp-backdrop');
  const rays = el('div', 'sp-rays');
  const card = el('div', 'sp-card classic-panel');

  const banner = el('h2', `sp-banner is-${tier}`);
  const emblem = el('span', 'sp-emblem'); emblem.innerHTML = EMBLEMS[titleId] || EMBLEMS.noob;
  const name = el('span', 'sp-title', titleLabel(titleId, L));
  banner.append(emblem, name);

  const path = el('ol', 'sp-path');
  path.setAttribute('aria-label', L === 'en' ? 'Four-week titles' : 'Titel in 4 Wochen');
  for (const step of pathItems(event.state, event.week)) {
    const li = el('li', step.cls);
    const node = el('span', 'sp-node');
    node.innerHTML = EMBLEMS[step.title.id];
    node.setAttribute('aria-label', titleLabel(step.title.id, L));
    li.append(node);
    path.append(li);
  }

  const totalDays = Number.isFinite(event.totalDays)
    ? event.totalDays
    : (event.state?.totalDays ?? event.poppedDay ?? 0);
  const count = el('p', 'sp-count', copy.dayN(totalDays));

  const days = el('div', 'sp-days');
  let giftImg = null;
  for (let i = 1; i <= 7; i++) {
    const filled = i <= (event.poppedDay || 0);
    const isToday = filled && i === event.poppedDay;
    const isGiftDay = i === 7;
    const col = el('div', 'sp-day');
    if (filled) col.classList.add('is-done');
    else col.classList.add('is-empty');
    if (isToday) col.classList.add('is-today');
    if (isGiftDay) col.classList.add('is-gift');
    if (isGiftDay && !filled) col.classList.add('is-pending');
    col.setAttribute('aria-label', copy.dayN(i));

    const ring = el('div', 'sp-slot-ring');
    const body = el('div', 'sp-body');
    if (isGiftDay && !filled) {
      const g = el('img', 'sp-gift');
      g.src = GIFT; g.alt = '';
      body.append(g);
      giftImg = g;
    } else if (isGiftDay && filled && isUp) {
      const g = el('img', 'sp-gift');
      g.src = GIFT; g.alt = '';
      body.append(g);
      giftImg = g;
    } else {
      const img = el('img', 'sp-gel');
      img.src = filled ? GEL[i - 1] : GEL_GHOST;
      img.alt = '';
      body.append(img);
    }
    const val = el('span', 'sp-val');
    val.innerHTML = dayNumSvg(i);
    body.append(val);
    ring.append(body);
    if (filled && !isGiftDay) {
      const ck = el('span', 'sp-check'); ck.innerHTML = CHECK_SVG; ring.append(ck);
    }
    if (filled && isGiftDay && !isUp) {
      const ck = el('span', 'sp-check'); ck.innerHTML = CHECK_SVG; ring.append(ck);
    }
    col.append(ring);
    days.append(col);
  }

  const reward = el('div', 'sp-reward' + (event.gift ? '' : ' is-empty'));
  const pocket = el('div', 'sp-pocket');
  if (event.gift) pocket.innerHTML = TOOL_ICONS[event.gift.type] || '';
  reward.append(pocket);

  const ok = el('button', 'sp-ok menu-button primary', copy.close);
  ok.type = 'button';

  card.append(banner, count, path, days, reward, ok);
  overlay.append(backdrop, rays, card);
  document.body.append(overlay);

  if (isUp) {
    try { haptics.pulse?.('big'); } catch { try { haptics.pulse?.('merge'); } catch {} }
    burstConfetti(overlay, card);
  } else {
    try { haptics.pulse?.('tap'); } catch {}
  }

  let busy = false;
  const finish = () => { if (busy) return; closePopup(); onClose?.(); };
  ok.addEventListener('click', ev => { ev.stopPropagation(); finish(); });
  overlay.addEventListener('click', finish);

  const playGift = async () => {
    if (!event.gift) return;
    busy = true;
    try {
      const granted = grantGold(event.gift.type, event.gift.id);
      await wait(reduced() ? 80 : 280);
      if (giftImg) giftImg.src = GIFT_OPEN;
      const got = granted && granted.status !== 'full' ? granted.type : event.gift.type;
      const from = giftImg || pocket;
      if (granted && granted.status === 'full') {
        const note = document.createElement('p');
        note.className = 'sp-note';
        note.textContent = lang() === 'en' ? 'Inventory full — you already have both tools.' : 'Vorrat voll — Rakete und +3 Züge hast du schon.';
        reward.append(note);
      } else {
        await flyIcon(got, from, pocket);
        const live = [...document.querySelectorAll(`#home-menu .aw-chip[data-type="${got}"]`)].find(isOnScreen);
        if (live) await flyIcon(got, pocket, live);
        if (granted && granted.status === 'converted') {
          const note = document.createElement('p');
          note.className = 'sp-note';
          const names = { rocket: lang() === 'en' ? 'Rocket' : 'Rakete', extraMoves: lang() === 'en' ? '+3 moves' : '+3 Züge' };
          note.textContent = lang() === 'en'
            ? `You already had ${names[granted.wanted] || granted.wanted}, so you get ${names[got] || got} instead.`
            : `${names[granted.wanted] || granted.wanted} hattest du schon, darum ${names[got] || got}.`;
          reward.append(note);
        }
      }
    } finally {
      busy = false;
    }
  };
  void playGift();
  return overlay;
}

export function renderBadge(state) {
  let b = document.getElementById('streak-badge');
  const menu = document.getElementById('home-menu');
  if (!menu) return null;
  if (!b) {
    b = el('button', ''); b.id = 'streak-badge'; b.type = 'button';
    const wrap = document.querySelector('#home-menu .aw-logo-wrap') || menu.querySelector('.aw-topbar') || menu;
    wrap.after(b);
    b.addEventListener('click', () => {
      if (isOpen() || hooks.isBlocked?.()) return;
      const st = loadState();
      const v = viewOf(st, lang());
      showPopup({
        state: st, week: v.week, poppedDay: v.filled || (st.complete ? 7 : 0),
        titleUp: null, gift: null, complete: st.complete, totalDays: v.totalDays,
      });
    });
  }
  const v = viewOf(state, lang());
  const tier = TIER[v.titleId] || 'noob';
  b.className = TIER_BADGE[tier] || '';
  const name = v.title;
  b.innerHTML = `<span class="sb-emblem">${EMBLEMS[v.titleId] || EMBLEMS.noob}</span><span class="sb-name"></span>`;
  b.querySelector('.sb-name').textContent = name;
  b.setAttribute('aria-label', name);
  return b;
}

export function paintBadge() { return renderBadge(loadState()); }

export function installStreak(opts = {}) {
  hooks = { ...hooks, ...opts };
  let offering = false;

  function paint() { return renderBadge(loadState()); }

  async function offer() {
    if (offering || isOpen()) { paint(); return null; }
    const t0 = Date.now();
    while (hooks.isBlocked?.()) {
      if (Date.now() - t0 > 20000) { paint(); return null; }
      await wait(300);
    }
    if (isOpen()) return null;
    const ev = checkIn(loadState(), localDateISO());
    if (ev.already) { paint(); return ev; }
    offering = true;
    try {
      saveState(ev.state);
      paint();
      await new Promise(resolve => {
        showPopup(ev, { onClose: () => { paint(); resolve(); } });
      });
      return ev;
    } finally { offering = false; }
  }

  paint();
  return {
    offer, paint, close: closePopup,
    get state() { return loadState(); },
    get open() { return isOpen(); },
  };
}

export { lang, loadState, saveState, checkIn, viewOf, localDateISO };

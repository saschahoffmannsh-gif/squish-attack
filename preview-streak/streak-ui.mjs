import { TOOL_ICONS } from '../game/tool-icons.mjs?v=launch-38';
import { getLang, onLangChange } from '../game/i18n.mjs?v=launch-38';
import { addToStock, saveInventory } from '../game/campaign.mjs?v=launch-38';
import { createConfetti } from '../game/confetti.mjs?v=launch-38';
import { createHaptics } from '../game/haptics.mjs?v=launch-38';
import {
  checkIn, loadState, saveState, emptyState, viewOf, copyFor, titleLabel,
  localDateISO, addDaysISO, prepareForDay, titleById, TITLES,
} from './streak.mjs';

const CLOCK_KEY = 'shift3-preview-streak-clock';
const sprite = name => new URL(`./sprites/${name}.png`, import.meta.url).href;
const GEL = [1,2,3,4,5,6,7].map(v => sprite(`gel-${v}`));
const GEL_GHOST = sprite('gel-ghost');
const GIFT = sprite('gift');
const GIFT_OPEN = sprite('gift-open');

const CHECK_SVG = `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="#2cb500" stroke="#0a3600" stroke-width="2"/><path d="M8.5 16.5 13.5 21.5 23 11.5" fill="none" stroke="#fffbea" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// Rank emblems (no emoji). Crowns/star use currentColor so they stay visible on gold or navy.
const EMBLEMS = {
  noob: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3.5c0 0-9.5 11.5-9.5 17.5a9.5 9.5 0 0 0 19 0c0-6-9.5-17.5-9.5-17.5z" fill="#7ecbff" stroke="#1a1638" stroke-width="2.2" stroke-linejoin="round"/><path d="M12 20.5c1.6 3.2 6.4 3.2 8 0" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/></svg>`,
  kneader: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M10.5 13c-2 2.2-2.2 5.4 0 8.2 1.8 2.2 4.2 3.3 5.5 3.3s3.7-1.1 5.5-3.3c2.2-2.8 2-6 0-8.2C19.6 10.6 17.2 9.2 16 9.2s-3.6 1.4-5.5 3.8z" fill="#ffe066" stroke="#1a1638" stroke-width="2" stroke-linejoin="round"/><circle cx="13.6" cy="16.2" r="1.15" fill="#1a1638"/><circle cx="18.4" cy="16.2" r="1.15" fill="#1a1638"/><circle cx="8.2" cy="9.2" r="3.3" fill="#fff0d0" stroke="#1a1638" stroke-width="1.8"/><circle cx="23.8" cy="9.2" r="3.3" fill="#fff0d0" stroke="#1a1638" stroke-width="1.8"/></svg>`,
  pro: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3.5 19.6 12.2 29 13.2 22 19.4 24 28.5 16 23.8 8 28.5 10 19.4 3 13.2 12.4 12.2Z" fill="currentColor" stroke="#1a1638" stroke-width="2" stroke-linejoin="round"/></svg>`,
  master: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 20 8.2 8.5 16 15l7.8-6.5L27 20H5z" fill="currentColor" stroke="#1a1638" stroke-width="2" stroke-linejoin="round"/><rect x="5" y="20" width="22" height="5" rx="1.2" fill="currentColor" stroke="#1a1638" stroke-width="2"/></svg>`,
  legend: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 3.2v5.2M3.4 5.8h5.2" stroke="#7ecbff" stroke-width="2" stroke-linecap="round"/><path d="M26 3.2v5.2M23.4 5.8h5.2" stroke="#7ecbff" stroke-width="2" stroke-linecap="round"/><path d="M4 20.4 8.2 8.6 16 15.2 23.8 8.6 28 20.4H4z" fill="currentColor" stroke="#1a1638" stroke-width="2" stroke-linejoin="round"/><rect x="4" y="20" width="24" height="5.4" rx="1.2" fill="currentColor" stroke="#1a1638" stroke-width="2"/><circle cx="16" cy="15.4" r="2" fill="#ff4d4d" stroke="#1a1638" stroke-width="1.3"/></svg>`,
};

const TIER = { noob: 'noob', kneader: 'kneader', pro: 'pro', master: 'master', legend: 'legend' };
const TIER_BADGE = { noob: '', kneader: 'is-bronze', pro: 'is-silver', master: 'is-gold', legend: 'is-legend' };

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const reduced = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
const wait = ms => new Promise(r => setTimeout(r, ms));

const haptics = createHaptics();
const confetti = createConfetti();

export function getClockToday() {
  try {
    const raw = sessionStorage.getItem(CLOCK_KEY);
    if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  } catch {}
  return localDateISO(new Date());
}
export function setClockToday(iso) {
  try { sessionStorage.setItem(CLOCK_KEY, iso); } catch {}
  return iso;
}
export function advanceClock(days) {
  return setClockToday(addDaysISO(getClockToday(), days));
}

function lang() { try { return getLang() === 'en' ? 'en' : 'de'; } catch { return document.documentElement.lang === 'en' ? 'en' : 'de'; } }

function grantGold(type, id) {
  const inv = window.SquishGame?.campaign?.inventory;
  if (!inv || !type) return false;
  if ((inv.gifts || []).includes(id)) return false;
  const next = addToStock(inv, { [type]: 1 });
  next.gifts = [...(next.gifts || []), id];
  inv.extraMoves = next.extraMoves;
  inv.rocket = next.rocket;
  inv.hint = next.hint;
  inv.wand = next.wand;
  inv.gifts = next.gifts;
  inv.pending = next.pending;
  inv.at = Date.now();
  saveInventory(inv);
  return true;
}

export function syncGifted(state) {
  const gifted = state?.gifted || [];
  const map = { 'streak-1': 'extraMoves', 'streak-2': 'rocket', 'streak-3': 'extraMoves', 'streak-4': 'rocket' };
  let n = 0;
  for (const id of gifted) if (map[id] && grantGold(map[id], id)) n++;
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

function pathItems(state, eventWeek) {
  // 4 earned titles: weeks 1..4 → kneader, pro, master, legend
  const currentWeek = eventWeek || state?.week || 1;
  const complete = !!state?.complete || !!titleById(state?.title).goldFrame;
  const earnedRank = titleById(state?.title).rank;
  return [1, 2, 3, 4].map(week => {
    const title = TITLES[week];
    let cls = 'is-todo';
    if (complete || earnedRank > week) cls = 'is-done';
    else if (earnedRank === week || (currentWeek === week && eventWeek === week && earnedRank >= week)) cls = 'is-done';
    else if (currentWeek === week) cls = 'is-now';
    // During a title-up for this week, the new title is already earned.
    if (currentWeek === week && earnedRank >= week) cls = 'is-done';
    // Current week in progress (not yet day 7)
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

    const ring = el('div', 'sp-slot-ring');
    if (isGiftDay && !filled) {
      const g = el('img', 'sp-gift');
      g.src = GIFT; g.alt = '';
      ring.append(g);
      if (!filled) giftImg = g;
    } else if (isGiftDay && filled && isUp) {
      const g = el('img', 'sp-gift');
      g.src = GIFT; g.alt = '';
      ring.append(g);
      giftImg = g;
    } else {
      const img = el('img', 'sp-gel');
      img.src = filled ? GEL[i - 1] : GEL_GHOST;
      img.alt = '';
      ring.append(img);
    }
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

  card.append(banner, path, days, reward, ok);
  overlay.append(backdrop, rays, card);
  document.body.append(overlay);

  if (isUp) {
    try { haptics.pulse?.('big'); } catch { try { haptics.pulse?.('merge'); } catch {} }
    burstConfetti(overlay, card);
  } else if (event.missed) {
    try { haptics.pulse?.('tap'); } catch {}
  } else {
    try { haptics.pulse?.('tap'); } catch {}
  }

  const finish = () => { closePopup(); onClose?.(); };
  ok.addEventListener('click', finish);
  overlay.addEventListener('click', ev => { if (ev.target === overlay) finish(); });

  const playGift = async () => {
    if (!event.gift) return;
    grantGold(event.gift.type, event.gift.id);
    await wait(reduced() ? 80 : 280);
    if (giftImg) giftImg.src = GIFT_OPEN;
    const from = giftImg || pocket;
    await flyIcon(event.gift.type, from, pocket);
    const live = [...document.querySelectorAll(`#home-menu .aw-chip[data-type="${event.gift.type}"]`)].find(isOnScreen);
    if (live) await flyIcon(event.gift.type, pocket, live);
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
  }
  const v = viewOf(state, lang());
  const tier = TIER[v.titleId] || 'noob';
  b.className = TIER_BADGE[tier] || '';
  b.innerHTML = `<span class="sb-emblem">${EMBLEMS[v.titleId] || EMBLEMS.noob}</span><span class="sb-name"></span>`;
  b.querySelector('.sb-name').textContent = v.title;
  b.setAttribute('aria-label', v.title);
  return b;
}

export function renderPreviewTag() {
  const menu = document.getElementById('home-menu');
  if (!menu) return;
  let tag = document.getElementById('streak-preview-tag');
  if (!tag) { tag = el('span', ''); tag.id = 'streak-preview-tag'; }
  tag.textContent = copyFor(lang()).preview;
  const build = document.getElementById('home-build');
  if (build) build.before(tag);
  else menu.append(tag);
}

export function installDebug({ onNext, onMiss, onReset, onJump, getState, getToday }) {
  let box = document.getElementById('streak-debug');
  if (box) box.remove();
  box = el('div', ''); box.id = 'streak-debug';
  const tab = el('button', 'sd-tab', 'Tage'); tab.type = 'button';
  const panel = el('div', 'sd-panel');
  const meta = el('p', 'sd-meta');
  const row = el('div', 'sd-row');
  const next = el('button', '', copyFor(lang()).debugNext);
  const miss = el('button', '', copyFor(lang()).debugMiss);
  const reset = el('button', 'is-muted', copyFor(lang()).debugReset);
  const row2 = el('div', 'sd-row');
  const jump = el('select'); jump.setAttribute('aria-label', 'Tag');
  jump.innerHTML = Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}">${copyFor(lang()).debugJump} ${i + 1}</option>`).join('');
  const go = el('button', '', 'Go');
  row.append(next, miss, reset);
  row2.append(jump, go);
  panel.append(meta, row, row2);
  box.append(tab, panel);
  document.body.append(box);
  const paint = () => {
    const L = lang(), c = copyFor(L), s = getState(), t = getToday();
    tab.textContent = L === 'en' ? 'Days' : 'Tage';
    next.textContent = c.debugNext; miss.textContent = c.debugMiss; reset.textContent = c.debugReset;
    const v = viewOf(s, L);
    meta.textContent = `${t} · ${v.title} · ${c.week} ${v.week} · ${v.filled}/7`;
  };
  tab.addEventListener('click', () => { box.classList.toggle('is-open'); paint(); });
  next.addEventListener('click', () => onNext());
  miss.addEventListener('click', () => onMiss());
  reset.addEventListener('click', () => onReset());
  go.addEventListener('click', () => onJump(Number(jump.value)));
  paint();
  onLangChange(paint);
  return { paint, el: box };
}

export { grantGold, lang };
export function freshState() { return emptyState(); }
export { loadState, saveState, checkIn, prepareForDay, viewOf };

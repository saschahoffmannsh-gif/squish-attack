import { TOOL_ICONS, GIFT_SVG } from '../game/tool-icons.mjs?v=launch-38';
import { getLang, onLangChange } from '../game/i18n.mjs?v=launch-38';
import { addToStock, saveInventory } from '../game/campaign.mjs?v=launch-38';
import {
  checkIn, loadState, saveState, emptyState, viewOf, copyFor, titleLabel,
  localDateISO, addDaysISO, prepareForDay, titleById,
} from './streak.mjs';

const CLOCK_KEY = 'shift3-preview-streak-clock';
const COLORS = ['#5ad0ff', '#ff8ad2', '#7dff7a', '#ffb347', '#c9a0ff', '#fff16a', '#ff7a6e'];
const CROWN = `<svg class="sb-crown" viewBox="0 0 24 24" aria-hidden="true"><path fill="#ffd25a" stroke="#1a1638" stroke-width="1.6" stroke-linejoin="round" d="M3 16 6 7l6 5 6-5 3 9z"/><rect x="3" y="16" width="18" height="4" rx="1" fill="#ffd25a" stroke="#1a1638" stroke-width="1.6"/></svg>`;

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const reduced = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
const wait = ms => new Promise(r => setTimeout(r, ms));

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

/** Make inventory match gifted[] (used after jumps, and after a title-up). */
export function syncGifted(state) {
  const gifted = state?.gifted || [];
  const map = { 'streak-1': 'extraMoves', 'streak-2': 'rocket', 'streak-3': 'extraMoves', 'streak-4': 'rocket' };
  let n = 0;
  for (const id of gifted) if (map[id] && grantGold(map[id], id)) n++;
  return n;
}

function burst(layer) {
  if (reduced()) return;
  const box = el('div', 'sp-burst');
  const colors = ['#ffd25a', '#fff', '#ff8ad2', '#5ad0ff', '#7dff7a'];
  for (let i = 0; i < 18; i++) {
    const s = el('i', 'sp-spark');
    const a = (i / 18) * Math.PI * 2, d = 70 + (i % 3) * 28;
    s.style.setProperty('--x', `${Math.cos(a) * d}px`);
    s.style.setProperty('--y', `${Math.sin(a) * d - 20}px`);
    s.style.setProperty('--c', colors[i % colors.length]);
    s.style.left = '50%'; s.style.top = '28%';
    box.append(s);
  }
  layer.append(box);
  setTimeout(() => box.remove(), 800);
}

function isOnScreen(el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
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

export function closePopup() {
  document.getElementById('streak-pop')?.remove();
}

export function showPopup(event, { onClose } = {}) {
  closePopup();
  const L = lang(), copy = copyFor(L);
  const titleId = event.titleUp?.id || event.state?.title || 'noob';
  const gold = !!titleById(titleId).goldFrame || !!event.complete;
  const overlay = el('div', ''); overlay.id = 'streak-pop';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', titleLabel(titleId, L));

  const card = el('div', 'sp-card');
  const week = el('div', 'sp-week', `${copy.week} ${event.week}`);
  const badge = el('div', 'sp-badge' + (gold ? ' is-gold' : ''));
  badge.innerHTML = CROWN + `<span></span>`;
  badge.querySelector('span').textContent = titleLabel(titleId, L);

  const days = el('div', 'sp-days');
  let todayBubble = null, giftMark = null;
  for (let i = 1; i <= 7; i++) {
    const col = el('div', 'sp-day');
    const b = el('div', 'sp-bubble');
    b.style.setProperty('--c', COLORS[i - 1]);
    const filled = i <= (event.poppedDay || 0);
    if (filled) {
      b.classList.add('is-done');
      b.innerHTML = `<span class="sp-face"><i class="sp-eye l"></i><i class="sp-eye r"></i><i class="sp-mouth"></i></span>`;
    }
    if (i === 7) {
      const g = el('span', 'sp-gift'); g.innerHTML = GIFT_SVG; b.append(g); giftMark = g;
    }
    if (filled && i === event.poppedDay) { b.classList.add('is-today'); todayBubble = b; }
    col.append(b);
    days.append(col);
  }

  const note = el('p', 'sp-note');
  if (event.missed && !event.titleUp) note.textContent = copy.missed;
  else if (event.titleUp) note.textContent = copy.titleUp;
  else note.textContent = '';

  const slot = el('div', 'sp-slot'+(event.gift?'':' is-empty'));
  const pocket = el('div', 'sp-pocket');
  slot.append(pocket);

  const ok = el('button', 'sp-ok', copy.close); ok.type = 'button';
  card.append(week, badge, days, slot, note, ok);
  overlay.append(card);
  document.body.append(overlay);
  if (event.titleUp) burst(card);

  const finish = () => { closePopup(); onClose?.(); };
  ok.addEventListener('click', finish);
  overlay.addEventListener('click', ev => { if (ev.target === overlay) finish(); });

  const playGift = async () => {
    if (!event.gift) return;
    pocket.innerHTML = TOOL_ICONS[event.gift.type] || '';
    const from = giftMark || todayBubble || pocket;
    note.textContent = `${copy.got}: ${copy[event.gift.type] || event.gift.type}`;
    grantGold(event.gift.type, event.gift.id);
    await wait(reduced() ? 80 : 280);
    await flyIcon(event.gift.type, from, pocket);
    const live = [...document.querySelectorAll(`#home-menu .aw-chip[data-type="${event.gift.type}"], #tool-${event.gift.type === 'extraMoves' ? 'extra' : 'rocket'}`)].find(isOnScreen);
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
  b.classList.toggle('is-gold', v.goldFrame);
  b.innerHTML = CROWN + `<span class="sb-name"></span>`;
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
  const badge = document.getElementById('streak-badge');
  if (badge) badge.after(tag);
  else {
    const build = document.getElementById('home-build');
    if (build) build.before(tag); else menu.append(tag);
  }
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
  const go = el('button', '', '→');
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

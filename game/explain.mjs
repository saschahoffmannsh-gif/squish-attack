// launch-28: Erklär-Fenster mit Bild und kurzem Text (Comic-Stil, Fredoka, Navy/Gold).
// Jedes Thema erscheint einmal von selbst, sobald es wichtig wird (showOnce), und lässt sich
// jederzeit unter „Regeln“ nachlesen (topics()). Reine Darstellung, keine Spiellogik.
// Die Regeln in den Bildern entsprechen game-logic.mjs:
//   Fusion: 3–4 gleiche in Linie (auch T/L/Kreuz) → +1, ab 5 Steinen → +2.
//   Straße: ≥ 3 aufeinanderfolgende Werte in Linie → höchster Wert, ab 4 Steinen → höchster + 1.
//   Gleiche Werte verschmelzen zuerst; neue Treffer danach = Kettenreaktion.
import { t, onLangChange } from './i18n.mjs?v=launch-28';
import { TOOL_ICONS, GIFT_SVG } from './tool-icons.mjs?v=launch-28';
import { starGate, CHAPTER_SIZE, LEVEL_GIFTS } from './campaign.mjs?v=launch-28';

export const EXPLAIN_KEY = 'squish-explain-seen-v1';
const PALETTE = { 1: ['#5cc2ff', '#1f7ff0', '#0d3f9e'], 2: ['#ff7a66', '#e8291f', '#a3101a'], 3: ['#9df25a', '#38b81c', '#1b7a10'],
  4: ['#ffb04a', '#ff7a0c', '#b8460a'], 5: ['#b57cff', '#8a3cf0', '#5418a8'], 6: ['#ffe36b', '#ffc21f', '#c98a06'],
  7: ['#ff8cc6', '#f0459e', '#a8186a'], 8: ['#6ff0e2', '#1fc9bd', '#0e8a84'] };
const CLOSE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>';
const ARROW = '<svg viewBox="0 0 32 24" aria-hidden="true"><path d="M2 9h17V3l11 9-11 9v-6H2z" fill="#ffd25a" stroke="#0b0a16" stroke-width="2.2" stroke-linejoin="round"/></svg>';
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

/** Ein Mini-Squish (gleiche Farben wie im Spiel). */
export function miniTile(v, { gold = false, ghost = false, cls = '' } = {}) {
  const s = el('span', 'ex-tile' + (gold ? ' is-gold' : '') + (ghost ? ' is-ghost' : '') + (cls ? ' ' + cls : ''));
  if (v == null) { s.classList.add('is-empty'); return s; }
  const [hi, mid, lo] = PALETTE[((Math.max(1, v) - 1) % 8) + 1];
  s.style.setProperty('--hi', hi); s.style.setProperty('--mid', mid); s.style.setProperty('--lo', lo);
  s.append(el('b', '', String(v)));
  return s;
}
function line(values, result, { mark = null, note = '' } = {}) {
  const r = el('div', 'ex-line');
  const g = el('span', 'ex-group');
  values.forEach((v, i) => g.append(miniTile(v, { cls: mark?.includes(i) ? 'is-mark' : '' })));
  const a = el('span', 'ex-arrow'); a.innerHTML = ARROW;
  const out = el('span', 'ex-result'); out.append(miniTile(result, { cls: 'is-pop' }));
  r.append(g, a, out);
  if (note) r.append(el('small', 'ex-note', note));
  return r;
}
/** Kleines Gitter (rows: Arrays mit Zahl/null) → Ergebnis. */
function shape(rows, result, note = '') {
  const r = el('div', 'ex-line ex-shape-line');
  const g = el('span', 'ex-grid'); g.style.setProperty('--cols', String(rows[0].length));
  for (const row of rows) for (const v of row) g.append(miniTile(v));
  const a = el('span', 'ex-arrow'); a.innerHTML = ARROW;
  const out = el('span', 'ex-result'); out.append(miniTile(result, { cls: 'is-pop' }));
  r.append(g, a, out);
  if (note) r.append(el('small', 'ex-note', note));
  return r;
}
const stars = n => { const s = el('span', 'ex-stars'); for (let i = 0; i < 3; i++) s.append(el('i', i < n ? 'is-on' : '', '★')); return s; };
function starRow(label, n, cls = '') { const r = el('div', 'ex-starrow ' + cls); r.append(el('span', 'ex-starlabel', label), stars(n)); return r; }
function toolChip(type, label, { gold = false } = {}) {
  const c = el('span', 'ex-tool' + (gold ? ' is-gold' : ''));
  const i = el('span', 'ex-tool-ico'); if (type === 'extraMoves') i.append(el('b', 'ex-plus', '+3')); else i.innerHTML = TOOL_ICONS[type] || '';
  c.append(i, el('small', '', label)); return c;
}

/** Themen. pic(ctx) baut das Bild, lines(ctx) die Textzeilen. */
const TOPICS = {
  merge: {
    icon: () => miniTile(3), title: () => t('ex.merge.title'),
    pic: () => [line([2, 2, 2], 3, { note: t('ex.merge.n3') }), line([2, 2, 2, 2], 3, { note: t('ex.merge.n4') }), shape([[2, 2, 2], [null, 2, null]], 3, t('ex.merge.nT'))],
    lines: () => [t('ex.merge.l1'), t('ex.merge.l2'), t('ex.merge.l3')],
  },
  merge5: {
    icon: () => miniTile(5), title: () => t('ex.merge5.title'),
    pic: () => [line([1, 1, 1, 1, 1], 3, { note: t('ex.merge5.n5') }), shape([[3, 3, 3], [3, null, null], [3, null, null]], 5, t('ex.merge5.nL'))],
    lines: () => [t('ex.merge5.l1'), t('ex.merge5.l2')],
  },
  street: {
    icon: () => miniTile(4), title: () => t('ex.street.title'),
    pic: () => [line([1, 2, 3], 3, { note: t('ex.street.n3') }), line([4, 3, 2], 4, { note: t('ex.street.n3b') }), line([1, 2, 3, 4], 5, { note: t('ex.street.n4') }), line([1, 2, 3, 4, 5], 6, { note: t('ex.street.n5') })],
    lines: () => [t('ex.street.l1'), t('ex.street.l2'), t('ex.street.l3')],
  },
  tools: {
    icon: () => { const s = el('span', 'ex-ico'); s.innerHTML = TOOL_ICONS.rocket || ''; return s; }, title: () => t('ex.tools.title'),
    pic: () => { const box = el('div', 'ex-tools');
      const top = el('div', 'ex-toolrow'); top.append(toolChip('extraMoves', t('ex.tools.extra')), toolChip('rocket', t('ex.tools.rocket'))); box.append(top);
      box.append(starRow(t('ex.tools.s0'), 3), starRow(t('ex.tools.s1'), 2), starRow(t('ex.tools.s2'), 1));
      return [box]; },
    lines: () => [t('ex.tools.l1'), t('ex.tools.l2'), t('ex.tools.l3')],
  },
  gifts: {
    icon: () => { const s = el('span', 'ex-ico is-gold'); s.innerHTML = GIFT_SVG; return s; }, title: () => t('ex.gifts.title'),
    pic: () => { const box = el('div', 'ex-gifts');
      const g = el('span', 'ex-giftbox'); g.innerHTML = GIFT_SVG;
      const row = el('div', 'ex-toolrow'); row.append(toolChip('rocket', t('ex.gifts.rocket'), { gold: true }), toolChip('extraMoves', t('ex.gifts.extra'), { gold: true }));
      const lv = el('div', 'ex-chips'); for (const [n] of LEVEL_GIFTS) lv.append(el('span', 'ex-chip is-gold', String(n)));
      box.append(g, row, starRow(t('ex.gifts.stars'), 3, 'is-gold'), lv); return [box]; },
    lines: () => [t('ex.gifts.l1', { levels: LEVEL_GIFTS.map(([n]) => n).join(', ') }), t('ex.gifts.l2'), t('ex.gifts.l3')],
  },
  gates: {
    icon: () => el('span', 'ex-ico ex-ico-star', '★'), title: () => t('ex.gates.title'),
    pic: ctx => { const box = el('div', 'ex-chips ex-gates');
      for (let k = 2; k <= 10; k++) { const c = el('span', 'ex-chip' + (ctx?.chapter === k ? ' is-now' : ''));
        c.append(el('small', '', t('ex.gates.chapter', { n: k })), el('b', '', `${starGate(k)} ★`)); box.append(c); }
      return [box]; },
    lines: ctx => [t('ex.gates.l1', { size: CHAPTER_SIZE }), ctx?.need ? t('ex.gates.now', { chapter: ctx.chapter, need: ctx.need, have: ctx.have ?? 0 }) : t('ex.gates.l2'), t('ex.gates.l3')],
  },
  ads: {
    icon: () => el('span', 'ex-ico ex-ico-ad', 'AD'), title: () => t('ex.ads.title'),
    pic: () => { const box = el('div', 'ex-ads');
      const a = el('span', 'ex-adcard'); a.append(el('b', '', 'AD'), el('small', '', t('ex.ads.clip')));
      const p = el('span', 'ex-arrow'); p.innerHTML = ARROW;
      const f = el('span', 'ex-adcard is-free'); f.append(el('b', '', t('ex.ads.price')), el('small', '', t('ex.ads.free')));
      box.append(a, p, f); return [box]; },
    lines: () => [t('ex.ads.l1'), t('ex.ads.l2'), t('ex.ads.l3')],
  },
};
export const TOPIC_ORDER = ['merge', 'merge5', 'street', 'tools', 'gifts', 'gates', 'ads'];

export function createExplainer({ sound, haptics, storage = globalThis.localStorage } = {}) {
  const extra = new Map(), order = TOPIC_ORDER.slice();
  let veil = null, lastFocus = null, current = null, done = null, ctxNow = null;
  const stats = { opens: 0, last: null };
  const readSeen = () => { try { const v = JSON.parse(storage?.getItem(EXPLAIN_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
  const markSeen = topic => { const s = new Set(readSeen()); s.add(topic); try { storage?.setItem(EXPLAIN_KEY, JSON.stringify([...s])); } catch {} };
  const def = topic => extra.get(topic) || TOPICS[topic];
  function render(topic, ctx) {
    const d = def(topic);
    const veil = el('div', 'ex-veil'); veil.id = 'explain-dialog'; veil.dataset.topic = topic;
    const panel = el('div', 'ex-panel'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'ex-title'); panel.tabIndex = -1;
    const close = el('button', 'ex-close'); close.type = 'button'; close.setAttribute('aria-label', t('ex.closeAria')); close.innerHTML = CLOSE_SVG;
    close.addEventListener('click', () => api.close());
    const head = el('div', 'ex-head'); const ico = el('span', 'ex-head-ico'); ico.append(d.icon());
    const title = el('h2', 'ex-title', d.title(ctx)); title.id = 'ex-title';
    head.append(ico, title);
    const pic = el('div', 'ex-pic'); pic.append(...d.pic(ctx));
    const body = el('ul', 'ex-lines'); for (const l of d.lines(ctx)) body.append(el('li', '', l));
    const ok = el('button', 'ex-ok'); ok.type = 'button'; ok.id = 'explain-ok'; ok.textContent = t('ex.ok');
    ok.addEventListener('click', () => api.close());
    panel.append(close, head, pic, body, ok);
    veil.append(panel);
    veil.addEventListener('pointerdown', ev => { if (ev.target === veil) { ev.preventDefault(); api.close(); } });
    return veil;
  }
  function key(ev) {
    if (!veil) return;
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); api.close(); }
    if (ev.key === 'Tab') { const items = [...veil.querySelectorAll('button')]; const i = items.indexOf(document.activeElement); ev.preventDefault(); items[(i + (ev.shiftKey ? -1 : 1) + items.length) % items.length]?.focus(); }
  }
  const api = {
    stats,
    get isOpen() { return !!veil; },
    get topic() { return current; },
    seen: topic => readSeen().includes(topic),
    /** Weitere Themen (z. B. Endlos-Werkzeuge der App). def: {icon, title, pic, lines}. */
    register(topic, d, { after = null } = {}) { extra.set(topic, d); if (!order.includes(topic)) { const i = after ? order.indexOf(after) : -1; if (i >= 0) order.splice(i + 1, 0, topic); else order.push(topic); } },
    topics: () => order.filter(k => def(k)).map(k => ({ topic: k, title: def(k).title(), icon: def(k).icon })),
    /** Fenster zeigen; Promise löst beim Schließen auf. */
    show(topic, ctx = null) {
      if (!def(topic)) return Promise.resolve(false);
      if (veil) api.close({ silent: true });
      lastFocus = document.activeElement; current = topic; ctxNow = ctx; stats.opens++; stats.last = topic;
      markSeen(topic);
      veil = render(topic, ctx);
      document.body.append(veil);
      document.addEventListener('keydown', key, true);
      sound?.play?.('gift'); haptics?.pulse?.('tap');
      requestAnimationFrame(() => veil?.querySelector('.ex-ok')?.focus({ preventScroll: true }));
      return new Promise(r => { done = r; });
    },
    /** Nur beim ersten Mal. → Promise<boolean> (true = gezeigt). */
    async showOnce(topic, ctx = null) { if (api.seen(topic)) return false; await api.show(topic, ctx); return true; },
    close({ silent = false } = {}) {
      if (!veil) return;
      document.removeEventListener('keydown', key, true);
      veil.remove(); veil = null; current = null;
      if (!silent) lastFocus?.focus?.({ preventScroll: true });
      const d = done; done = null; d?.(true);
    },
  };
  onLangChange(() => { if (!veil || !current) return; const fresh = render(current, ctxNow); veil.replaceWith(fresh); veil = fresh; fresh.querySelector('.ex-ok')?.focus({ preventScroll: true }); });
  return api;
}

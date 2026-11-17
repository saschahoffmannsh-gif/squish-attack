// launch-28: Erklär-Fenster (Comic-Stil, Fredoka, Navy/Gold). launch-29: animierte Mini-Szenen + eine Zeile.
// Jedes Thema erscheint einmal von selbst, sobald es wichtig wird (showOnce), und lässt sich
// jederzeit unter „Regeln“ nachlesen (topics()). Reine Darstellung, keine Spiellogik.
// Die Regeln in den Bildern entsprechen game-logic.mjs:
//   Fusion: 3–4 gleiche in Linie (auch T/L/Kreuz) → +1, ab 5 Steinen → +2.
//   Straße: ≥ 3 aufeinanderfolgende Werte in Linie → höchster Wert, ab 4 Steinen → höchster + 1.
//   Gleiche Werte verschmelzen zuerst; neue Treffer danach = Kettenreaktion.
import { t, onLangChange } from './i18n.mjs?v=launch-31';
import { TOOL_ICONS, GIFT_SVG } from './tool-icons.mjs?v=launch-31';
import { starGate, CHAPTER_SIZE, LEVEL_GIFTS } from './campaign.mjs?v=launch-31';

export const EXPLAIN_KEY = 'squish-explain-seen-v1';
const PALETTE = { 1: ['#5cc2ff', '#1f7ff0', '#0d3f9e'], 2: ['#ff7a66', '#e8291f', '#a3101a'], 3: ['#9df25a', '#38b81c', '#1b7a10'],
  4: ['#ffb04a', '#ff7a0c', '#b8460a'], 5: ['#b57cff', '#8a3cf0', '#5418a8'], 6: ['#ffe36b', '#ffc21f', '#c98a06'],
  7: ['#ff8cc6', '#f0459e', '#a8186a'], 8: ['#6ff0e2', '#1fc9bd', '#0e8a84'] };
const ARROW = '<svg viewBox="0 0 32 24" aria-hidden="true"><path d="M2 9h17V3l11 9-11 9v-6H2z" fill="#ffd25a" stroke="#0b0a16" stroke-width="2.2" stroke-linejoin="round"/></svg>';
const CLOSE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>';
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
// launch-29: Mini-Szenen statt Listen. Jede Szene ist eine kleine, sich wiederholende Animation im
// echten Squish-Look; dazu genau eine kurze Zeile. Die vollständige Regel steht unsichtbar für
// Screenreader im Fenster (ex-sr). Positionen: --x/--y relativ zur Bühnenmitte, Ziel --mx/--my.
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="exsg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3a0"/><stop offset=".55" stop-color="#ffc21f"/><stop offset="1" stop-color="#e08a00"/></linearGradient></defs><path d="M12 1.8 14.82 8.92 22.46 9.4 16.57 14.28 18.47 21.7 12 17.6 5.53 21.7 7.43 14.28 1.54 9.4 9.18 8.92Z" fill="url(#exsg)" stroke="#6a3304" stroke-width="1.6" stroke-linejoin="round"/><ellipse cx="8.6" cy="9.4" rx="1.4" ry=".85" fill="#fff" opacity=".9" transform="rotate(-25 8.6 9.4)"/></svg>';
const LOCK = '<svg viewBox="0 0 64 72" aria-hidden="true" style="overflow:visible"><g stroke="#1b1030" stroke-width="3.4" stroke-linejoin="round"><path class="sx-shackle" d="M16 34V22a16 16 0 0 1 32 0v12" fill="none" stroke-linecap="round" stroke-width="7"/><path class="sx-shackle" d="M16 34V22a16 16 0 0 1 32 0v12" fill="none" stroke="#c9ced9" stroke-linecap="round" stroke-width="3"/><rect x="6" y="32" width="52" height="36" rx="9" fill="#ffc21f"/><path d="M10 37h44" stroke="#fff3a0" stroke-width="3" opacity=".9"/><circle cx="32" cy="48" r="5" fill="#6a3304" stroke="none"/><path d="M30 50h4l1.5 9h-7z" fill="#6a3304" stroke="none"/></g></svg>';
const put = (node, x, y, cls = '', more = {}) => {
  node.classList.add('sx', ...cls.split(' ').filter(Boolean));
  node.style.setProperty('--x', x + 'px'); node.style.setProperty('--y', y + 'px');
  for (const [k, v] of Object.entries(more)) node.style.setProperty('--' + k, typeof v === 'number' ? v + 'px' : v);
  return node;
};
const tile = (v, x, y, cls = '', more = {}) => put(miniTile(v, { gold: more.gold }), x, y, cls, more);
const star = (x, y, cls = '', more = {}) => { const s = el('span'); s.innerHTML = STAR; return put(s, x, y, 'sx-star ' + cls, more); };
const icon = (svg, x, y, cls = '', more = {}) => { const s = el('span'); s.innerHTML = svg || ''; return put(s, x, y, 'sx-ico ' + cls, more); };
const bubble = (text, x, y, cls = '', more = {}) => put(el('b', 'sx-bubble', text), x, y, cls, more);
const word = (text, x, y, cls = '', more = {}) => put(el('b', 'sx-word', text), x, y, cls, more);
const burst = (x, y, cls = '') => put(el('span', 'sx-burst'), x, y, cls);
const sparks = (x, y, cls = '', n = 6, r = 46) => Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2 - Math.PI / 2;
  const s = el('span'); s.innerHTML = SPARK; return put(s, x, y, 'sx-spark ' + cls, { dx: Math.round(Math.cos(a) * r), dy: Math.round(Math.sin(a) * r) }); });
const SPARK = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1 12 8 19 10 12 12 10 19 8 12 1 10 8 8z" fill="#fff6a8" stroke="#1b1030" stroke-width="1.4" stroke-linejoin="round"/></svg>';
function stage(kind, ...kids) { const s = el('div', 'ex-stage sx-' + kind); s.setAttribute('aria-hidden', 'true'); s.append(...kids.flat()); return s; }
const plus3 = (x, y, cls = '', more = {}) => put(el('b', 'sx-plus3', '+3'), x, y, cls, more);

/** Reihe gleicher/folgender Squishes rutscht zusammen → neuer Squish poppt auf. Leere Spielfeld-Zellen dahinter. */
function mergeScene(kind, values, result, gain, { big = false } = {}) {
  const n = values.length, gap = n > 4 ? 58 : 64, x0 = -gap * (n - 1) / 2, cy = 18;
  const pos = values.map((_, i) => [x0 + gap * i, cy]);
  const cells = pos.map(([x, y]) => put(el('span', 'sx-cell' + (n > 4 ? ' is-sm' : '')), x, y));
  const tiles = values.map((v, i) => tile(v, pos[i][0], pos[i][1], 'sx-slide' + (n > 4 ? ' is-sm' : ''), { mx: 0, my: cy }));
  // Nach dem Squish: kleiner Ausgangs-Squish + Pfeil links neben dem Ergebnis (z. B. 3 → 5), damit der Sprung sofort sichtbar ist.
  const from = Math.max(...values), fx = big ? -96 : -88;
  const arrow = put(el('span', 'sx-from-arrow'), fx + 40, cy); arrow.innerHTML = ARROW;
  return stage(kind, cells, burst(0, cy, big ? 'is-big' : ''), tiles, tile(from, fx, cy, 'sx-from is-mini'), arrow, tile(result, 0, cy, 'sx-pop is-res' + (big ? ' is-big' : '')),
    sparks(0, cy, 'sx-pop-spark', big ? 10 : 7, big ? 76 : 60), bubble(gain, big ? 64 : 56, cy - 34, 'sx-rise' + (big ? ' is-gold' : '')), word('SQUISH!', -34, -66, 'sx-word-pop'));
}
/** launch-29: Hilfe → Pfeil → 3 Sterne. Normal: der dritte Stern wird grau und fällt weg. Gold: alle Sterne bleiben und glänzen. */
function helpScene(kind, used, gold) {
  const types = used ? [used] : ['rocket', 'extraMoves'], ys = types.length > 1 ? [-34, 34] : [0];
  const chips = types.map((ty, i) => { const c = el('span', 'sx-help' + (gold ? ' is-gold' : ''));
    if (ty === 'extraMoves') c.append(el('b', 'sx-help-plus', '+3')); else c.innerHTML = TOOL_ICONS.rocket || '';
    if (gold) { const g = el('span', 'sx-help-gift'); g.innerHTML = GIFT_SVG; c.append(g); }
    return put(c, -108, ys[i], 'sx-help-tap'); });
  const arrow = put(el('span', 'sx-help-arrow'), -46, 0); arrow.innerHTML = ARROW;
  const xs = [14, 66, 118];
  return stage(kind + ' sx-help-' + (gold ? 'gold' : 'cost'), chips, arrow,
    xs.map(x => star(x, 0, 'sx-slot')), xs.map((x, i) => star(x, 0, gold ? 'sx-keep' : i === 2 ? 'sx-lose' : 'sx-stay', { d: gold ? i * .1 + 's' : '0s' })),
    gold ? sparks(66, 0, 'sx-keep-spark', 8, 70) : []);
}
const lvChip = (n, x, y) => { const c = el('span', 'sx-lvchip'); c.append(el('b', '', String(n)), el('i', '', '★★★')); return put(c, x, y, 'sx-lvl'); };
const SCENES = {
  merge: () => mergeScene('merge', [2, 2, 2], 3, '+1'),
  merge5: () => mergeScene('merge5', [3, 3, 3, 3, 3], 5, '+2', { big: true }),
  street: () => mergeScene('street', [1, 2, 3, 4], 5, '+1'),
  tools: ctx => helpScene('tools', ctx?.used, false),
  gifts: ctx => helpScene('gifts', ctx?.used, true),
  gates: ctx => { const shut = ctx?.need && (ctx.have ?? 0) < ctx.need;
    const need = ctx?.need || starGate(2), lock = icon(LOCK, 58, -8, 'sx-lock' + (shut ? ' is-shut' : ''));
    const count = put(el('b', 'sx-count', shut ? `${ctx.have ?? 0}/${need}` : String(need)), 58, 54, '');
    count.append(el('i', '', '★'));
    const ys = [-52, 0, 52];
    const flyers = ys.map((y, i) => star(-96, y - 4, 'sx-flystar', { mx: 58, my: 0, d: i * .3 + 's' }));
    return stage('gates' + (shut ? ' is-shut' : ''), ys.map((y, i) => lvChip(i + 1, -110, y)), flyers, lock, count, sparks(58, -8, 'sx-lock-spark', 8, 64)); },
  ads: () => { const tv = el('span'); tv.append(el('b', 'sx-tv-ad', 'AD'), el('i', 'sx-tv-bar'));
    return stage('ads', put(tv, -58, 6, 'sx-tv'), icon(TOOL_ICONS.rocket, -58, 6, 'sx-adreward', { mx: 160, my: -30 }),
      plus3(-58, 6, 'sx-adreward is-late', { mx: 160, my: 38 }), put(el('b', 'sx-stamp', t('ex.ads.price')), -52, 4, '')); },
};
/** Themen: scene(ctx) baut die Mini-Szene, line(ctx) die eine kurze Zeile, sr(ctx) den Volltext für Screenreader. */
const TOPICS = {
  merge: { icon: () => miniTile(3), title: () => t('ex.merge.title'), scene: SCENES.merge, line: () => t('ex.merge.line'),
    sr: () => [t('ex.merge.l1'), t('ex.merge.l2'), t('ex.merge.l3')] },
  merge5: { icon: () => miniTile(5), title: () => t('ex.merge5.title'), scene: SCENES.merge5, line: () => t('ex.merge5.line'),
    sr: () => [t('ex.merge5.l1'), t('ex.merge5.l2')] },
  street: { icon: () => miniTile(4), title: () => t('ex.street.title'), scene: SCENES.street, line: () => t('ex.street.line'),
    sr: () => [t('ex.street.l1'), t('ex.street.l2'), t('ex.street.l3')] },
  tools: { icon: () => { const s = el('span', 'ex-ico'); s.innerHTML = TOOL_ICONS.rocket || ''; return s; }, title: () => t('ex.tools.title'),
    scene: SCENES.tools, line: ctx => t(ctx?.used ? 'ex.tools.lineNow' : 'ex.tools.line'), sr: () => [t('ex.tools.l1'), t('ex.tools.l2'), t('ex.tools.l3')] },
  gifts: { icon: () => { const s = el('span', 'ex-ico is-gold'); s.innerHTML = GIFT_SVG; return s; }, title: () => t('ex.gifts.title'),
    scene: SCENES.gifts, line: ctx => t(ctx?.used ? 'ex.gifts.lineNow' : 'ex.gifts.line'),
    sr: () => [t('ex.gifts.l1', { levels: LEVEL_GIFTS.map(([n]) => n).join(', ') }), t('ex.gifts.l2'), t('ex.gifts.l3')] },
  gates: { icon: () => el('span', 'ex-ico ex-ico-star', '★'), title: () => t('ex.gates.title'), scene: SCENES.gates,
    line: ctx => ctx?.need && (ctx.have ?? 0) < ctx.need ? t('ex.gates.lineNow', { chapter: ctx.chapter, n: ctx.need - (ctx.have ?? 0) }) : t('ex.gates.line'),
    sr: ctx => [t('ex.gates.l1', { size: CHAPTER_SIZE }), ctx?.need ? t('ex.gates.now', { chapter: ctx.chapter, need: ctx.need, have: ctx.have ?? 0 }) : t('ex.gates.l2'), t('ex.gates.l3')] },
  ads: { icon: () => el('span', 'ex-ico ex-ico-ad', 'AD'), title: () => t('ex.ads.title'), scene: SCENES.ads, line: () => t('ex.ads.line'),
    sr: () => [t('ex.ads.l1'), t('ex.ads.l2'), t('ex.ads.l3')] },
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
    // launch-29: Szene + eine Zeile; ältere Themen mit pic/lines (Liste) werden weiter unterstützt.
    let pic, body;
    if (d.scene) {
      pic = d.scene(ctx);
      body = el('p', 'ex-say', d.line(ctx)); body.id = 'ex-say';
      const sr = el('div', 'ex-sr'); sr.id = 'ex-sr'; for (const l of d.sr?.(ctx) || []) sr.append(el('p', '', l)); body.append(sr);
      panel.setAttribute('aria-describedby', 'ex-say');
    } else {
      pic = el('div', 'ex-pic'); pic.append(...d.pic(ctx));
      body = el('ul', 'ex-lines'); for (const l of d.lines(ctx)) body.append(el('li', '', l));
    }
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
    /** Weitere Themen (z. B. Endlos-Werkzeuge der App). def: {icon, title, scene, line, sr} oder alt {icon, title, pic, lines}. */
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
    mark: key => markSeen(key),
    /** Einmal je Schlüssel (z. B. Lektion „erstes Gold“), auch wenn das Thema schon unter „Regeln“ gesehen wurde. */
    async showOnceAs(key, topic, ctx = null) { if (api.seen(key)) return false; markSeen(key); await api.show(topic, ctx); return true; },
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

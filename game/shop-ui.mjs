// Werkzeug-Shop (launch-12): Comic-Overlay im Stil der Menüs. Darstellung + Bedienung;
// Preise/Angebote/Kauf-Schnittstelle liegen in shop.mjs, Vorrat in campaign.mjs.
import { TOOL_ICONS, SHOP_SVG, SPARK_SVG } from './tool-icons.mjs?v=launch-37';
import { ADVENTURE_TOOLS as TOOL_TYPES, toolName } from './campaign.mjs?v=launch-37';
import { SHOP_CONFIG, shopProducts, formatPrice, activeStore } from './shop.mjs?v=launch-37';
import { t } from './i18n.mjs?v=launch-37';

const DESC = type => t('tool.desc.'+type);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

export function createShopUI({ getStock, onBuy, onClose, sound, haptics, reduceMotion, config = SHOP_CONFIG } = {}) {
  let veil = null, lastFocus = null, toastTimer = 0;
  const stats = { opens: 0, buys: 0, lastFocus: null };
  const products = shopProducts(config);

  function render(focusType) {
    const store = activeStore(config);
    veil = el('div', 'shop-veil'); veil.id = 'shop';
    const panel = el('div', 'shop-panel');
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'shop-title'); panel.tabIndex = -1;
    const close = el('button', 'shop-close'); close.type = 'button'; close.setAttribute('aria-label', t('shop.closeAria'));
    close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>';
    close.addEventListener('click', () => api.close());
    const head = el('div', 'shop-head');
    const ico = el('span', 'shop-head-ico'); ico.innerHTML = SHOP_SVG;
    const title = el('h2', 'shop-title', t('shop.title')); title.id = 'shop-title';
    head.append(ico, title);
    const note = el('p', 'shop-test', store.test ? t('shop.testNote') : store.kind === 'none' ? t('shop.unavailNote') : t('shop.storeNote'));
    note.dataset.store = store.kind;
    const list = el('div', 'shop-list');
    for (const type of TOOL_TYPES) {
      const row = el('section', 'shop-row'); row.dataset.type = type;
      if (type === focusType) row.classList.add('is-focus');
      const top = el('div', 'shop-tool');
      const ti = el('span', 'shop-tool-ico'); ti.innerHTML = TOOL_ICONS[type];
      const txt = el('div', 'shop-tool-text'); txt.append(el('b', '', toolName(type)), el('small', '', DESC(type)));
      const have = el('span', 'shop-have'); have.dataset.have = type;
      top.append(ti, txt, have);
      const packs = el('div', 'shop-packs');
      for (const p of products.filter(p => p.type === type)) packs.append(buyButton(p, `${p.items[type]}×`));
      row.append(top, packs); list.append(row);
    }
    for (const p of products.filter(p => !p.type)) {
      const row = el('section', 'shop-row shop-bundle'); row.dataset.type = 'bundle';
      const top = el('div', 'shop-tool');
      const icons = el('span', 'shop-bundle-ico'); icons.innerHTML = TOOL_TYPES.map(t => `<i>${TOOL_ICONS[t]}</i>`).join('');
      const txt = el('div', 'shop-tool-text');
      txt.append(el('b', '', p.title), el('small', '', TOOL_TYPES.map(t => `${p.items[t] || 0}× ${toolName(t)}`).join(' · ')));
      top.append(icons, txt);
      const packs = el('div', 'shop-packs is-single'); packs.append(buyButton(p, t('shop.pack')));
      row.append(top, packs); list.append(row);
    }
    const toast = el('p', 'shop-toast'); toast.setAttribute('role', 'status'); toast.setAttribute('aria-live', 'polite');
    const foot = el('p', 'shop-foot', t('shop.foot'));
    panel.append(close, head, note, list, toast, foot);
    veil.append(panel);
    veil.addEventListener('pointerdown', ev => { if (ev.target === veil) { ev.preventDefault(); api.close(); } });
    return veil;
  }
  function buyButton(p, big) {
    const b = el('button', 'shop-buy'); b.type = 'button'; b.dataset.product = p.id;
    b.append(el('b', '', big), el('span', '', formatPrice(p.price, p)));
    b.setAttribute('aria-label', t(activeStore(config).test ? 'shop.buyAriaTest' : 'shop.buyAria', { title: p.title, price: formatPrice(p.price, p) }));
    b.addEventListener('click', () => void buy(p, b));
    return b;
  }
  async function buy(p, btn) {
    if (!veil || btn.classList.contains('is-busy')) return;
    btn.classList.add('is-busy'); btn.disabled = true;
    let r;
    try { r = await onBuy?.(p.id); } catch { r = { ok: false }; }
    btn.classList.remove('is-busy'); btn.disabled = false;
    if (!veil) return;
    if (!r?.ok) { showToast(r?.reason === 'unavailable' ? t('shop.unavail') : t('shop.cancelled')); return; }
    stats.buys++;
    sound?.play?.('buy'); haptics?.pulse?.('merge');
    const list = Object.entries(r.items).map(([t, k]) => `${k}× ${toolName(t)}`).join(', ');
    showToast(t(r.test ? 'shop.boughtTest' : 'shop.bought', { list }));
    refresh();
    for (const t of Object.keys(r.items)) {
      const row = veil.querySelector(`.shop-row[data-type="${t}"]`); if (!row) continue;
      row.classList.remove('is-bought'); void row.offsetWidth; row.classList.add('is-bought');
      if (!reduceMotion?.matches) { const s = el('i', 'shop-spark'); s.innerHTML = SPARK_SVG; row.querySelector('.shop-tool-ico')?.append(s); setTimeout(() => s.remove(), 700); }
    }
  }
  function showToast(text) {
    const t = veil?.querySelector('.shop-toast'); if (!t) return;
    t.textContent = text; t.classList.add('is-on'); clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('is-on'), 2600);
  }
  function refresh() {
    if (!veil) return;
    const stock = getStock?.() || {};
    veil.querySelectorAll('[data-have]').forEach(e => { const n = stock[e.dataset.have] | 0; e.textContent = t('shop.have', { n }); e.classList.toggle('is-zero', !n); });
  }
  function key(ev) {
    if (!veil) return;
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); api.close(); }
  }
  const api = {
    get isOpen() { return !!veil; },
    get element() { return veil; },
    stats,
    open({ focus = null } = {}) {
      if (!config.enabled) return false;
      if (veil) api.close({ silent: true });
      lastFocus = document.activeElement;
      stats.opens++; stats.lastFocus = focus;
      document.body.append(render(focus)); refresh();
      document.addEventListener('keydown', key, true);
      const row = focus && veil.querySelector(`.shop-row[data-type="${focus}"]`);
      requestAnimationFrame(() => { row?.scrollIntoView({ block: 'nearest' }); (row?.querySelector('.shop-buy') || veil?.querySelector('.shop-buy'))?.focus({ preventScroll: true }); });
      return true;
    },
    close({ silent = false } = {}) {
      if (!veil) return;
      document.removeEventListener('keydown', key, true);
      veil.remove(); veil = null; clearTimeout(toastTimer);
      lastFocus?.focus?.({ preventScroll: true });
      if (!silent) onClose?.();
    },
    refresh,
  };
  return api;
}

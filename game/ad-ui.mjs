// Dummy-Werbung (launch-13, Testphase): leeres Hilfsmittel → „Werbeclip (Dummy)“ → „Ansehen“ gibt sofort 1 Stück.
// Keine echte Werbung, kein Warten, kein Netz. Comic-Stil wie der Shop.
import { TOOL_ICONS } from './tool-icons.mjs?v=launch-27';
import { toolName } from './campaign.mjs?v=launch-27';
import { showRewarded, hasNativeAds } from './native-ads.mjs?v=launch-27';
import { t } from './i18n.mjs?v=launch-27';

const DESC = type => t('tool.desc.'+type);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const CLOSE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>';
const PLAY_SVG = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="20" fill="#ff5a4e" stroke="#0b0a16" stroke-width="3"/><path d="M19 15v18l15-9z" fill="#fff" stroke="#0b0a16" stroke-width="2.4" stroke-linejoin="round"/></svg>';

export function createAdUI({ onWatch, onClose, onAdStart, onAdEnd, sound, haptics } = {}) {
  let veil = null, lastFocus = null, current = null, currentOpts = {};
  const stats = { opens: 0, watched: 0, lastType: null };
  // opts (App, Endlos-Angebot): {title, desc, foot, placement}
  function render(type, opts = {}) {
    veil = el('div', 'ad-veil'); veil.id = 'ad-dialog';
    const panel = el('div', 'ad-panel');
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'ad-title'); panel.tabIndex = -1;
    const close = el('button', 'ad-close'); close.type = 'button'; close.setAttribute('aria-label', t('ad.closeAria')); close.innerHTML = CLOSE_SVG;
    close.addEventListener('click', () => api.close());
    const title = el('h2', 'ad-title', opts.title || t('ad.title')); title.id = 'ad-title';
    const screen = el('div', 'ad-screen');
    const play = el('span', 'ad-play'); play.innerHTML = PLAY_SVG;
    // App mit echtem Werbe-Adapter: kurzer Clip; im Browser bleibt die Dummy-Werbung.
    const real = hasNativeAds();
    screen.append(el('span', 'ad-badge', real ? t('ad.badgeReal') : t('ad.badge')), play,
      el('small', 'ad-hint', real ? t('ad.hintReal') : t('ad.hint')));
    const reward = el('div', 'ad-reward');
    const ico = el('span', 'ad-reward-ico'); ico.innerHTML = TOOL_ICONS[type] || '';
    const txt = el('div', 'ad-reward-text'); txt.append(el('b', '', t('ad.reward', { tool: toolName(type) })), el('small', '', opts.desc || DESC(type) || ''));
    reward.append(ico, txt);
    const watch = el('button', 'ad-watch'); watch.type = 'button'; watch.id = 'ad-watch';
    watch.append(el('span', '', t('ad.watch')));
    watch.setAttribute('aria-label', t('ad.watchAria', { tool: toolName(type) }));
    watch.addEventListener('click', () => void doWatch());
    const later = el('button', 'ad-later', t('ad.later')); later.type = 'button';
    later.addEventListener('click', () => api.close());
    panel.append(close, title, screen, reward, watch, later, el('p', 'ad-foot', opts.foot ?? t('ad.foot')));
    veil.append(panel);
    veil.addEventListener('pointerdown', ev => { if (ev.target === veil) { ev.preventDefault(); api.close(); } });
    return veil;
  }
  async function doWatch() {
    if (!veil || !current) return;
    const type = current, placement = currentOpts.placement || 'tool';
    api.close({ silent: true, keepOpts: true });
    // App: echter Clip über den nativen Adapter; Werkzeug nur, wenn er zu Ende geschaut wurde.
    onAdStart?.();
    let res;
    try { res = await showRewarded({ placement, tool: type }); } finally { onAdEnd?.(); }
    if (!res.ok) { onClose?.(); return; }
    stats.watched++;
    sound?.play?.('gift'); haptics?.pulse?.('merge');
    await onWatch?.(type);
  }
  function key(ev) {
    if (!veil) return;
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); api.close(); }
    if (ev.key === 'Tab') {   // Fokus im Dialog halten
      const items = [...veil.querySelectorAll('button')];
      const i = items.indexOf(document.activeElement);
      ev.preventDefault();
      items[(i + (ev.shiftKey ? -1 : 1) + items.length) % items.length]?.focus();
    }
  }
  const api = {
    get isOpen() { return !!veil; },
    get type() { return current; },
    stats,
    open(type, opts = {}) {
      if (veil) api.close({ silent: true });
      lastFocus = document.activeElement; current = type; currentOpts = opts || {};
      stats.opens++; stats.lastType = type;
      document.body.append(render(type, currentOpts));
      document.addEventListener('keydown', key, true);
      requestAnimationFrame(() => veil?.querySelector('.ad-watch')?.focus({ preventScroll: true }));
      return true;
    },
    close({ silent = false, keepOpts = false } = {}) {
      if (!veil) return;
      document.removeEventListener('keydown', key, true);
      veil.remove(); veil = null; current = null; if (!keepOpts) currentOpts = {};
      lastFocus?.focus?.({ preventScroll: true });
      if (!silent) onClose?.();
    },
  };
  return api;
}

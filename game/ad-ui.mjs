// Dummy-Werbung (launch-13, Testphase): leeres Hilfsmittel → „Werbeclip (Dummy)“ → „Ansehen“ gibt sofort 1 Stück.
// Keine echte Werbung, kein Warten, kein Netz. Comic-Stil wie der Shop.
import { TOOL_ICONS } from './tool-icons.mjs?v=launch-29';
import { toolName } from './campaign.mjs?v=launch-29';
import { showRewarded } from './native-ads.mjs?v=launch-29';
import { t } from './i18n.mjs?v=launch-29';

const DESC = type => t('tool.desc.'+type);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const CLOSE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>';
const PLAY_SVG = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="20" fill="#ff5a4e" stroke="#0b0a16" stroke-width="3"/><path d="M19 15v18l15-9z" fill="#fff" stroke="#0b0a16" stroke-width="2.4" stroke-linejoin="round"/></svg>';

export function createAdUI({ onWatch, onClose, sound, haptics } = {}) {
  let veil = null, lastFocus = null, current = null;
  const stats = { opens: 0, watched: 0, lastType: null };
  function render(type) {
    veil = el('div', 'ad-veil'); veil.id = 'ad-dialog';
    const panel = el('div', 'ad-panel');
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'ad-title'); panel.tabIndex = -1;
    const close = el('button', 'ad-close'); close.type = 'button'; close.setAttribute('aria-label', t('ad.closeAria')); close.innerHTML = CLOSE_SVG;
    close.addEventListener('click', () => api.close());
    const title = el('h2', 'ad-title', t('ad.title')); title.id = 'ad-title';
    const screen = el('div', 'ad-screen');
    const play = el('span', 'ad-play'); play.innerHTML = PLAY_SVG;
    screen.append(el('span', 'ad-badge', t('ad.badge')), play, el('small', 'ad-hint', t('ad.hint')));
    const reward = el('div', 'ad-reward');
    const ico = el('span', 'ad-reward-ico'); ico.innerHTML = TOOL_ICONS[type] || '';
    const txt = el('div', 'ad-reward-text'); txt.append(el('b', '', t('ad.reward', { tool: toolName(type) })), el('small', '', DESC(type) || ''));
    reward.append(ico, txt);
    const watch = el('button', 'ad-watch'); watch.type = 'button'; watch.id = 'ad-watch';
    watch.append(el('span', '', t('ad.watch')));
    watch.setAttribute('aria-label', t('ad.watchAria', { tool: toolName(type) }));
    watch.addEventListener('click', () => void doWatch());
    const later = el('button', 'ad-later', t('ad.later')); later.type = 'button';
    later.addEventListener('click', () => api.close());
    panel.append(close, title, screen, reward, watch, later, el('p', 'ad-foot', t('ad.foot')));
    veil.append(panel);
    veil.addEventListener('pointerdown', ev => { if (ev.target === veil) { ev.preventDefault(); api.close(); } });
    return veil;
  }
  async function doWatch() {
    if (!veil || !current) return;
    const type = current;
    api.close({ silent: true });
    // App: echter Clip über den nativen Adapter; Werkzeug nur, wenn er zu Ende geschaut wurde.
    const res = await showRewarded({ placement: 'tool', tool: type });
    if (!res.ok) return;
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
    open(type) {
      if (veil) api.close({ silent: true });
      lastFocus = document.activeElement; current = type;
      stats.opens++; stats.lastType = type;
      document.body.append(render(type));
      document.addEventListener('keydown', key, true);
      requestAnimationFrame(() => veil?.querySelector('.ad-watch')?.focus({ preventScroll: true }));
      return true;
    },
    close({ silent = false } = {}) {
      if (!veil) return;
      document.removeEventListener('keydown', key, true);
      veil.remove(); veil = null; current = null;
      lastFocus?.focus?.({ preventScroll: true });
      if (!silent) onClose?.();
    },
  };
  return api;
}

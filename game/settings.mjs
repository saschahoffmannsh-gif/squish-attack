import { getLang } from './i18n.mjs?v=launch-44';

export const LEGAL_URLS = Object.freeze({
  de: Object.freeze({
    privacy: 'https://spoostudio.de/squish-attack/datenschutz/',
    support: 'https://spoostudio.de/squish-attack/support/',
  }),
  en: Object.freeze({
    privacy: 'https://spoostudio.de/en/privacy/',
    support: 'https://spoostudio.de/en/support/',
  }),
});

export function legalUrl(kind, lang = getLang()) {
  const pack = LEGAL_URLS[lang === 'de' ? 'de' : 'en'];
  return pack[kind] || pack.privacy;
}

export function openLegalUrl(kind, open = url => globalThis.open(url, '_blank', 'noopener,noreferrer')) {
  const url = legalUrl(kind);
  if (url) open(url);
  return url;
}

function installLegalLinks() {
  const map = { 'settings-privacy': 'privacy', 'settings-support': 'support' };
  for (const [id, kind] of Object.entries(map)) {
    const button = document.getElementById(id);
    if (!button || button.dataset.ready) continue;
    button.dataset.ready = '1';
    button.addEventListener('click', () => openLegalUrl(kind));
  }
}

export function installSettings() {
  const overlay = document.getElementById('settings-screen');
  const close = document.getElementById('settings-close');
  let opener, underlying;
  function dismiss() {
    overlay.hidden = true;
    if (underlying) underlying.inert = false;
    opener?.focus();
  }
  for (const button of document.querySelectorAll('[data-open-settings]')) {
    button.addEventListener('click', () => {
      opener = button;
      underlying = button.closest('#loading-screen, #veil');
      if (underlying) underlying.inert = true;
      overlay.hidden = false;
      document.getElementById('settings-title').focus({preventScroll:true});
    });
  }
  close.addEventListener('click', dismiss);
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); dismiss(); }
    if (event.key !== 'Tab') return;
    // Closed support details and unsupported controls never enter the tab loop.
    const items = [...overlay.querySelectorAll('button:not(:disabled), summary')]
      .filter(item => !item.hidden && item.getClientRects().length > 0);
    const first = items[0], last = items.at(-1);
    if (!first) return;
    if (event.shiftKey && (document.activeElement === first || document.activeElement.id === 'settings-title')) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  installLegalLinks();
}

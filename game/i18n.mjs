// launch-23: schlanke i18n-Schicht. Texte liegen in locales.mjs (de/en),
// Platzhalter {name}, Mehrzahl als {one, other} (n === 1 → one).
import { STRINGS } from './locales.mjs?v=launch-23';

export const LANGS = Object.freeze(['de', 'en']);
export const LANG_KEY = 'squish-lang-v1';

const listeners = new Set();
let lang = 'en';
let booted = false;

export function detectLang(nav = globalThis.navigator) {
  const found = [];
  try {
    if (Array.isArray(nav?.languages)) found.push(...nav.languages);
    if (nav?.language) found.push(nav.language);
  } catch {}
  for (const item of found) {
    if (String(item || '').toLowerCase().startsWith('de')) return 'de';
  }
  return 'en';
}

export function loadLang(storage = globalThis.localStorage, nav = globalThis.navigator) {
  try {
    const saved = storage?.getItem?.(LANG_KEY);
    if (saved === 'de' || saved === 'en') return saved;
  } catch {}
  return detectLang(nav);
}

export function saveLang(next, storage = globalThis.localStorage) {
  if (next !== 'de' && next !== 'en') return;
  try { storage?.setItem?.(LANG_KEY, next); } catch {}
}

function interpolate(s, vars) {
  if (!vars) return s;
  return String(s).replace(/\{(\w+)\}/g, (_, k) => (vars[k] == null ? '' : String(vars[k])));
}

function pick(form, vars) {
  if (form == null) return null;
  if (typeof form === 'string') return interpolate(form, vars);
  const n = Number(vars?.n);
  const key = n === 1 ? 'one' : 'other';
  return interpolate(form[key] ?? form.other ?? form.one ?? '', vars);
}

export function t(key, vars) {
  const entry = STRINGS[key];
  if (!entry) return key;
  return pick(entry[lang] ?? entry.en ?? entry.de, vars) ?? key;
}

export function hasKey(key) {
  return Object.prototype.hasOwnProperty.call(STRINGS, key);
}

export function getLang() { return lang; }

export function localeTag() { return lang === 'de' ? 'de-DE' : 'en-US'; }

export function fmtNum(n, options) {
  return Number(n || 0).toLocaleString(localeTag(), options);
}

export function fmtPrice(amount, currency = 'EUR') {
  return Number(amount || 0).toLocaleString(localeTag(), { style: 'currency', currency });
}

export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setLang(next, { persist = true, storage = globalThis.localStorage, silent = false } = {}) {
  if (next !== 'de' && next !== 'en') return lang;
  const changed = next !== lang;
  lang = next;
  if (persist) saveLang(next, storage);
  if (changed && !silent) for (const fn of listeners) try { fn(lang); } catch {}
  return lang;
}

export function bootI18n({ storage = globalThis.localStorage, navigator } = {}) {
  lang = loadLang(storage, navigator);
  booted = true;
  return lang;
}

if (!booted) bootI18n();

const ATTRS = [
  ['data-i18n', (el, key) => { el.textContent = t(key); }],
  ['data-i18n-aria', (el, key) => { el.setAttribute('aria-label', t(key)); }],
  ['data-i18n-alt', (el, key) => { el.setAttribute('alt', t(key)); }],
  ['data-i18n-title', (el, key) => { el.setAttribute('title', t(key)); }],
  ['data-i18n-placeholder', (el, key) => { el.setAttribute('placeholder', t(key)); }],
  ['data-i18n-content', (el, key) => { el.setAttribute('content', t(key)); }],
  ['data-i18n-valuetext', (el, key) => { el.setAttribute('aria-valuetext', t(key)); }],
];

export function applyDom(root = globalThis.document) {
  if (!root) return;
  const html = root.documentElement || (root.nodeType === 9 ? root.documentElement : root.ownerDocument?.documentElement);
  if (html) html.setAttribute('lang', lang);
  const doc = root.nodeType === 9 ? root : root.ownerDocument || globalThis.document;
  if (doc) {
    if (doc.title != null) doc.title = t('meta.title');
    const scope = root.body ? root : (root.querySelectorAll ? root : doc);
    for (const [attr, apply] of ATTRS) {
      const nodes = scope.querySelectorAll?.(`[${attr}]`) || [];
      for (const el of nodes) {
        const key = el.getAttribute(attr);
        if (key) apply(el, key);
      }
    }
  }
}

export function bindDocument(root = globalThis.document) {
  applyDom(root);
  return onLangChange(() => applyDom(root));
}

// Werbefrei-Kauf (launch-26). Einmalig, nur in der nativen App (StoreKit-Produkt
// `squish.adfree`, launch-32: 4,99 €). Im Web gibt es keinen Kauf: isAdFree() ist immer false.
//
// launch-42: Der Kauf entfernt die Zwischenwerbung (Abenteuer nach den ersten 5 Leveln
// alle 3 gelösten Level, Endlos alle 15 Minuten). Hilfsmittel kommen aus dem Vorrat
// (Geschenke nach festgelegten Leveln), nicht aus Clips – Werbefrei schaltet sie nicht frei.
//
// 1.0: Angebot aus. Zum späteren Einschalten AD_FREE_OFFER_ENABLED auf true setzen
// (Einstellungen, Erklär-Texte und StoreKit-Anmeldung in native-boot folgen diesem Schalter).
// Tests können window.__SQUISH_AD_FREE_OFFER__ = true setzen.
import { fmtPrice } from './i18n.mjs?v=launch-44';

export const AD_FREE_OFFER_ENABLED = false;

export function isAdFreeOfferEnabled() {
  if (typeof globalThis.__SQUISH_AD_FREE_OFFER__ === 'boolean') return globalThis.__SQUISH_AD_FREE_OFFER__;
  return AD_FREE_OFFER_ENABLED === true;
}

export const AD_FREE_PRODUCT = Object.freeze({
  id: 'squish.adfree',
  price: 4.99,
  currency: 'EUR',
});

let adapter = null;
const listeners = new Set();

/** App-Hülle: registerAdFree({ isAdFree, purchase?, restore?, priceLabel? }). */
export function registerAdFree(a) {
  adapter = a && typeof a.isAdFree === 'function' ? a : null;
  emitAdFreeChange();
}

/** Einstellungen und Tests: nach Adapter-Anmeldung, Kauf oder Restore neu zeichnen. */
export function onAdFreeChange(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emitAdFreeChange() {
  for (const fn of listeners) {
    try { fn(); } catch {}
  }
}

export const hasAdFreeAdapter = () => !!adapter;

export function isAdFree() {
  try { return !!adapter?.isAdFree?.(); } catch { return false; }
}

/** „Werbefrei“-Knopf nur, wenn das Angebot an ist, ein Kauf-Adapter da ist und noch nicht gekauft. */
export function canOfferAdFree() {
  return isAdFreeOfferEnabled() && !isAdFree() && typeof adapter?.purchase === 'function';
}

/** „Käufe wiederherstellen“ nur, wenn das Angebot an ist und ein Restore-Adapter da ist. */
export function canRestoreAdFree() {
  return isAdFreeOfferEnabled() && typeof adapter?.restore === 'function';
}

export function adFreePriceLabel() {
  const label = adapter?.priceLabel;
  if (typeof label === 'string' && label.trim()) return label.trim();
  return fmtPrice(AD_FREE_PRODUCT.price, AD_FREE_PRODUCT.currency);
}

export async function purchaseAdFree() {
  if (isAdFree()) return { ok: true, already: true };
  if (typeof adapter?.purchase !== 'function') return { ok: false, reason: 'unavailable' };
  try {
    const r = await adapter.purchase(AD_FREE_PRODUCT);
    if (!r?.ok) return { ok: false, reason: r?.reason || 'cancelled' };
    emitAdFreeChange();
    return { ok: true, transactionId: r.transactionId || null };
  } catch (e) {
    return { ok: false, reason: 'error', error: String(e?.message || e) };
  }
}

export async function restoreAdFree() {
  if (typeof adapter?.restore !== 'function') return { ok: false, reason: 'unavailable' };
  try {
    const r = await adapter.restore();
    emitAdFreeChange();
    if (!r?.ok) return { ok: false, reason: r?.reason || 'error' };
    return { ok: true, owned: !!r.owned, already: !!r.already };
  } catch (e) {
    return { ok: false, reason: 'error', error: String(e?.message || e) };
  }
}

if (typeof globalThis !== 'undefined') {
  globalThis.SquishNative = Object.assign(globalThis.SquishNative || {}, { registerAdFree });
}

// Werbefrei-Kauf (launch-26). Einmalig, nur in der nativen App (StoreKit-Produkt
// `squish.adfree`, launch-32: 4,99 €). Im Web gibt es keinen Kauf: isAdFree() ist immer false.
//
// launch-42: Der Kauf entfernt die Zwischenwerbung (Abenteuer nach den ersten 5 Leveln
// alle 3 gelösten Level, Endlos alle 15 Minuten). Hilfsmittel kommen aus dem Vorrat
// (Geschenke nach festgelegten Leveln), nicht aus Clips – Werbefrei schaltet sie nicht frei.
import { fmtPrice } from './i18n.mjs?v=preview-goal';

export const AD_FREE_PRODUCT = Object.freeze({
  id: 'squish.adfree',
  price: 4.99,
  currency: 'EUR',
});

let adapter = null;

/** App-Hülle: registerAdFree({ isAdFree, purchase?, priceLabel? }). */
export function registerAdFree(a) {
  adapter = a && typeof a.isAdFree === 'function' ? a : null;
}

export const hasAdFreeAdapter = () => !!adapter;

export function isAdFree() {
  try { return !!adapter?.isAdFree?.(); } catch { return false; }
}

/** „Werbefrei“-Knopf nur in der App, und nur solange noch nicht gekauft. */
export function canOfferAdFree() {
  return !isAdFree() && typeof adapter?.purchase === 'function';
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
    return { ok: true, transactionId: r.transactionId || null };
  } catch (e) {
    return { ok: false, reason: 'error', error: String(e?.message || e) };
  }
}

if (typeof globalThis !== 'undefined') {
  globalThis.SquishNative = Object.assign(globalThis.SquishNative || {}, { registerAdFree });
}

// Werbefrei-Kauf (launch-26). Einmalig, nur in der nativen App (StoreKit-Produkt
// `squish.adfree`, launch-32: 4,99 €). Im Web gibt es keinen Kauf: isAdFree() ist immer false,
// jeder Hilfsmitteleinsatz im Abenteuer verlangt einen Belohnungsclip (Dummy-Werbung).
//
// Der Kauf entfernt nur die Werbung (Clip vor dem Einsatz, Zwischenwerbung alle
// 10 Abenteuer-Siege, Werbung alle 15 Minuten im Endlos-Modus). launch-28: Hilfsmittel sind für alle
// unbegrenzt; launch-32: Hilfen kosten keine Sterne (Sterne = übrige Züge).
import { fmtPrice } from './i18n.mjs?v=launch-32';

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

/** „Werbefrei“-Knopf nur in der App, und nur solange noch nicht gekauft. */
export function canOfferAdFree() {
  return !isAdFree() && typeof adapter?.purchase === 'function';
}

/** „Käufe wiederherstellen“ nur, wenn die App einen Restore-Adapter angemeldet hat. */
export function canRestoreAdFree() {
  return typeof adapter?.restore === 'function';
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

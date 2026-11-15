// Werkzeug-Shop (launch-12): Angebote, Preise und Kauf-Schnittstelle. Reine Logik, kein DOM.
//
// WICHTIG: Im Web gibt es KEINE echte Bezahlung. Solange SHOP_CONFIG.testPurchases an ist,
// ist jeder Kauf ein klar markierter TESTKAUF: Er legt nur Hilfsmittel in den lokalen Vorrat,
// ohne Zahlungsanbieter, ohne Backend, ohne Geld.
// Später (App): ein natives Store-Modul (StoreKit / Play Billing über Capacitor) registriert sich
// mit registerNativeStore({...}) und liefert dieselbe Schnittstelle (products/purchase).
import { TOOL_TYPES, toolName } from './campaign.mjs?v=launch-17';

/** Eine Stelle für alle Angebote und Platzhalter-Preise (EUR). */
export const SHOP_CONFIG = Object.freeze({
  enabled: false,         // Shop überhaupt anzeigen (grünes Plus, Shop-Knopf). launch-13 Testphase: aus (Werbung statt Shop), zurück: true
  testPurchases: true,    // Web: Testkauf ohne Bezahlung. false = nur nativer Store (sonst „nicht verfügbar“)
  currency: 'EUR',
  // Pakete je Hilfsmittel: Anzahl → Preis
  packs: Object.freeze([[1, 0.99], [3, 2.49], [5, 3.99]]),
  // Gemischtes Paket
  bundles: Object.freeze([
    Object.freeze({ id: 'bundle-mix', title: 'Werkzeugkiste', items: Object.freeze({ extraMoves: 2, hint: 2, rocket: 2, wand: 2 }), price: 4.99 }),
  ]),
});

/** Alle Produkte: {id, type|null, title, items, price}. ids sind später die Store-Produkt-ids. */
export function shopProducts(config = SHOP_CONFIG) {
  const out = [];
  for (const type of TOOL_TYPES) for (const [count, price] of config.packs)
    out.push({ id: `${type}-${count}`, type, title: `${count}× ${toolName(type)}`, items: { [type]: count }, price });
  for (const b of config.bundles) out.push({ id: b.id, type: null, title: b.title, items: { ...b.items }, price: b.price });
  return out;
}
export const productById = (id, config = SHOP_CONFIG) => shopProducts(config).find(p => p.id === id) || null;

const fmtEUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
export const formatPrice = (price, product) => product?.priceLabel || fmtEUR.format(price);

let nativeStore = null;
/**
 * Später: natives In-App-Kauf-Modul anmelden, z. B. aus einer Capacitor-Brücke:
 *   registerNativeStore({ name:'storekit', async purchase(product){ …; return {ok:true, transactionId} } })
 * purchase() muss erst nach bestätigter Zahlung {ok:true} liefern; die Gutschrift macht das Spiel.
 */
export function registerNativeStore(adapter) { nativeStore = adapter || null; }

/** Aktiver Store: nativ (falls angemeldet), sonst Testkauf (falls erlaubt), sonst keiner. */
export function activeStore(config = SHOP_CONFIG) {
  if (nativeStore) return { kind: 'native', test: false, name: nativeStore.name || 'native', purchase: p => nativeStore.purchase(p) };
  if (config.testPurchases) return { kind: 'test', test: true, name: 'test',
    purchase: async product => ({ ok: true, test: true, transactionId: `test-${product.id}-${Date.now().toString(36)}` }) };
  return { kind: 'none', test: false, name: 'none', purchase: async () => ({ ok: false, reason: 'unavailable' }) };
}

/** Kaufen: liefert {ok, items, test, transactionId} – das Spiel legt items in den Vorrat. */
export async function purchase(productId, { config = SHOP_CONFIG, store = activeStore(config) } = {}) {
  const product = productById(productId, config);
  if (!config.enabled || !product) return { ok: false, reason: 'unknown-product' };
  let r;
  try { r = await store.purchase(product); } catch (e) { r = { ok: false, reason: 'error', error: String(e?.message || e) }; }
  if (!r?.ok) return { ok: false, reason: r?.reason || 'cancelled', product };
  return { ok: true, product, items: { ...product.items }, test: !!store.test, transactionId: r.transactionId || null };
}

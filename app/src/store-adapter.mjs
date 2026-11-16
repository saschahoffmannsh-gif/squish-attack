// StoreKit-Adapter für game/shop.mjs (registerNativeStore), über @capgo/native-purchases
// (Capacitor.Plugins.NativePurchases, StoreKit 2). Alle Werkzeug-Pakete sind Verbrauchsartikel.
// Gutschrift macht das Spiel erst, wenn purchase() {ok:true} liefert (= Zahlung bestätigt).
import { storeProductId } from './app-config.mjs?v=__BUILD__';

export function createStoreKitAdapter({ NativePurchases, prefix, log = () => {} } = {}) {
  const idOf = p => storeProductId(p.id, prefix);
  let busy = false;
  return {
    name: 'storekit',
    /** Preise/Titel aus App Store Connect (bzw. der .storekit-Testdatei). → Map shopId → {priceLabel,title} */
    async products(shopProducts = []) {
      const ids = shopProducts.map(idOf);
      try {
        const { products = [] } = await NativePurchases.getProducts({ productIdentifiers: ids, productType: 'inapp' });
        const out = new Map();
        for (const sp of shopProducts) {
          const p = products.find(x => x.identifier === idOf(sp));
          if (p) out.set(sp.id, { priceLabel: p.priceString, title: p.title, price: p.price });
        }
        return out;
      } catch (e) { log('products', e); return new Map(); }
    },
    async purchase(product) {
      if (busy) return { ok: false, reason: 'busy' };
      busy = true;
      try {
        const t = await NativePurchases.purchaseProduct({ productIdentifier: idOf(product), productType: 'inapp', quantity: 1, isConsumable: true, autoAcknowledgePurchases: true });
        if (!t?.transactionId) return { ok: false, reason: 'no-transaction' };
        return { ok: true, transactionId: String(t.transactionId) };
      } catch (e) {
        const msg = String(e?.message || e || '');
        log('purchase', e);
        return { ok: false, reason: /cancel/i.test(msg) ? 'cancelled' : 'error', error: msg };
      } finally { busy = false; }
    },
  };
}

const AD_FREE_KEY = 'squish-adfree-v1';

/** Entitlement für das Nicht-Verbrauch-Produkt squish.adfree (isConsumable: false). */
export function createAdFreeAdapter({
  NativePurchases,
  productId = 'squish.adfree',
  storage = globalThis.localStorage,
  log = () => {},
} = {}) {
  const read = () => {
    try { return storage?.getItem?.(AD_FREE_KEY) === '1'; } catch { return false; }
  };
  const write = (owned) => {
    try { storage?.setItem?.(AD_FREE_KEY, owned ? '1' : '0'); } catch {}
  };
  let owned = read();

  const persist = (v) => { owned = !!v; write(owned); };
  const hasEntitlement = (purchases = []) => purchases.some(p =>
    p && p.productIdentifier === productId && !p.revocationDate
  );

  async function refresh() {
    try {
      const { purchases = [] } = await NativePurchases.getPurchases({
        productType: 'inapp',
        onlyCurrentEntitlements: true,
      });
      persist(hasEntitlement(purchases));
    } catch (e) { log('adfree refresh', e); }
    return owned;
  }

  async function loadPrice() {
    try {
      const { products = [] } = await NativePurchases.getProducts({
        productIdentifiers: [productId],
        productType: 'inapp',
      });
      const p = products.find(x => x.identifier === productId);
      if (p?.priceString) adapter.priceLabel = p.priceString;
    } catch (e) { log('adfree price', e); }
    return adapter.priceLabel || null;
  }

  const adapter = {
    name: 'storekit-adfree',
    productId,
    get priceLabel() { return this._priceLabel || null; },
    set priceLabel(v) { this._priceLabel = v; },
    isAdFree: () => owned,
    refresh,
    loadPrice,
    async purchase() {
      try {
        const t = await NativePurchases.purchaseProduct({
          productIdentifier: productId,
          productType: 'inapp',
          quantity: 1,
          isConsumable: false,
          autoAcknowledgePurchases: true,
        });
        if (!t?.transactionId) return { ok: false, reason: 'no-transaction' };
        persist(true);
        return { ok: true, transactionId: String(t.transactionId) };
      } catch (e) {
        const msg = String(e?.message || e || '');
        log('adfree purchase', e);
        return { ok: false, reason: /cancel/i.test(msg) ? 'cancelled' : 'error', error: msg };
      }
    },
    async restore() {
      try { await NativePurchases.restorePurchases(); }
      catch (e) { log('adfree restore', e); }
      const before = owned;
      await refresh();
      return { ok: true, owned, already: owned && before };
    },
  };
  return adapter;
}

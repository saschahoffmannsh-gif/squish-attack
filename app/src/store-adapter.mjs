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

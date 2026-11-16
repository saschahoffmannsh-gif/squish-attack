// Start der App-Hülle (nur im App-Build, eingesetzt von app/scripts/build-web.mjs statt loading-screen.mjs).
// 1. Spieler-Token aus dem iOS-Schlüsselbund zurückholen (vor dem Spiel, max. ~1,5 s)
// 2. das unveränderte Spiel starten (loading-screen.mjs)
// 3. Werbung (AdMob: UMP → ATT) und StoreKit-Käufe an die vorhandenen Spiel-Schnittstellen hängen
// Alles lokal im App-Paket, kein Code aus dem Netz. Im Browser (ohne Capacitor) startet nur das Spiel.
import { APP_CONFIG } from './app-config.mjs?v=__BUILD__';
import { restoreToken, persistToken } from './token-keychain.mjs?v=__BUILD__';
import { setupConsent, createAdMobAdapter } from './admob-adapter.mjs?v=__BUILD__';
import { createStoreKitAdapter, createAdFreeAdapter } from './store-adapter.mjs?v=__BUILD__';

const BUILD = '__BUILD__';
const cap = globalThis.Capacitor;
const isNative = !!cap?.isNativePlatform?.();
const plugin = name => (isNative && cap.isPluginAvailable?.(name)) ? (cap.Plugins?.[name] || cap.registerPlugin(name)) : null;
const log = (what, e) => console.warn('[app]', what, e?.message || e || '');
const status = { build: BUILD, native: isNative, token: null, ads: null, store: null, adFree: null, errors: [] };
globalThis.SquishApp = status;

async function boot() {
  const secure = plugin('SecureStoragePlugin');
  const key = APP_CONFIG.keychainKey;
  try { status.token = (await restoreToken({ secure, key })).source; } catch (e) { log('keychain', e); }

  await import(`../loading-screen.mjs?v=${BUILD}`);
  if (!isNative) return;

  // Ein neuer Token entsteht erst, wenn das Spiel ihn braucht → später nachtragen, und bei jeder App-Pause.
  let last = null;
  const persist = async () => { last = await persistToken({ secure, key, last }); };
  setTimeout(persist, 3000); setTimeout(persist, 30000);
  plugin('App')?.addListener?.('pause', () => void persist());

  const [ads, shop, adFreeMod] = await Promise.all([
    import(`../native-ads.mjs?v=${BUILD}`),
    import(`../shop.mjs?v=${BUILD}`),
    import(`../ad-free.mjs?v=${BUILD}`),
  ]);

  const AdMob = plugin('AdMob');
  if (AdMob) {
    const ready = setupConsent(AdMob, { askTracking: APP_CONFIG.admob.askTracking, testing: APP_CONFIG.admob.testing, log })
      .then(s => { status.ads = s; return s; });
    ads.registerNativeAds(createAdMobAdapter({ AdMob, ids: APP_CONFIG.admob, testing: APP_CONFIG.admob.testing, ready, log }));
    // Einstellungen → „Werbe-Einwilligung ändern“ kann das aufrufen (Pflicht, wenn UMP es verlangt).
    status.showPrivacyOptions = () => AdMob.showPrivacyOptionsForm().catch(e => log('privacy options', e));
    ready.then(s => { if (s.privacyOptions) addPrivacyButton(status.showPrivacyOptions); }).catch(() => {});
  }

  const NativePurchases = plugin('NativePurchases');
  if (NativePurchases) {
    const store = createStoreKitAdapter({ NativePurchases, prefix: APP_CONFIG.store.productPrefix, log });
    shop.registerNativeStore(store);
    status.store = 'storekit';
    // Preise aus dem App Store holen (auch wenn der Shop noch ausgeblendet ist: SHOP_CONFIG.enabled=false)
    store.products(shop.shopProducts({ ...shop.SHOP_CONFIG })).then(m => shop.setNativePrices(m)).catch(e => log('prices', e));
    // Test in Xcode mit Squish.storekit, ohne den Shop einzuschalten (Safari → Entwickler → Web-Inspektor):
    //   await SquishApp.testPurchase('rocket-1')   → StoreKit-Kaufdialog, Ergebnis {ok, items, transactionId}
    status.testPurchase = id => shop.purchase(id, { config: { ...shop.SHOP_CONFIG, enabled: true } });

    const adFree = createAdFreeAdapter({
      NativePurchases,
      productId: APP_CONFIG.store.adFreeProductId,
      log,
    });
    adFreeMod.registerAdFree(adFree);
    status.adFree = () => adFree.isAdFree();
    // Testhilfen (StoreKit-Konfiguration Squish.storekit):
    //   await SquishApp.testAdFreePurchase()  → Kaufdialog für squish.adfree
    //   await SquishApp.testAdFreeRestore()   → restorePurchases + Entitlement
    status.testAdFreePurchase = () => adFreeMod.purchaseAdFree();
    status.testAdFreeRestore = () => adFreeMod.restoreAdFree();
    adFree.refresh()
      .then(() => adFreeMod.emitAdFreeChange())
      .catch(e => log('adfree refresh', e));
    adFree.loadPrice()
      .then(() => adFreeMod.emitAdFreeChange())
      .catch(e => log('adfree price', e));
  }
}

// Einstellungen: „Werbe-Einwilligung ändern“ (Google UMP verlangt den Einstieg, wenn privacyOptions REQUIRED ist).
function addPrivacyButton(onClick) {
  const build = document.getElementById('settings-build');
  if (!build || document.getElementById('ad-privacy')) return;
  const b = document.createElement('button');
  b.type = 'button'; b.id = 'ad-privacy'; b.className = 'setting-toggle setting-stats';
  const label = document.createElement('span'); label.className = 'setting-label'; label.textContent = 'Werbe-Einwilligung ändern';
  b.append(label); b.addEventListener('click', () => void onClick());
  build.before(b);
}

boot().catch(e => { status.errors.push(String(e?.message || e)); log('boot', e); });

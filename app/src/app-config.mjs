// ======================================================================================
//  App-Hülle – IDs und Schalter (siehe docs/app-build.md)
// ======================================================================================
// Die App-ID (Bundle-ID) steht NICHT hier, sondern in app/capacitor.config.json ("appId")
// und im Xcode-Projekt (PRODUCT_BUNDLE_IDENTIFIER). Platzhalter: de.hoffmann.squishattack

import { ADMOB_TESTING as ADMOB_TESTING_DEFAULT } from './admob-runtime.mjs?v=__BUILD__';

// Google-dokumentierte Test-IDs (öffentlich). Xcode ▶ / Debug nutzt diese, damit
// Sascha nie versehentlich auf eigene Live-Werbung klickt.
export const ADMOB_TEST_IDS = Object.freeze({
  appId: 'ca-app-pub-3940256099942544~1458002511',
  interstitialId: 'ca-app-pub-3940256099942544/4411468910',
});
// Echte AdMob-IDs (öffentlich, keine Geheimnisse). Archive / TestFlight / App Store (Release).
export const ADMOB_LIVE_IDS = Object.freeze({
  appId: 'ca-app-pub-3147947530766307~6450785208',
  interstitialId: 'ca-app-pub-3147947530766307/3361587432',
});

/** true = Test-Anzeigen. window.__SQUISH_ADMOB_TESTING__ überschreibt (Tests); sonst admob-runtime.mjs. */
export function isAdMobTesting() {
  if (typeof globalThis.__SQUISH_ADMOB_TESTING__ === 'boolean') return globalThis.__SQUISH_ADMOB_TESTING__;
  return ADMOB_TESTING_DEFAULT !== false;
}

/** Laufzeit-Konfiguration: native-boot ruft das beim Start auf (nicht nur beim Import). */
export function resolveAdMob() {
  const testing = isAdMobTesting();
  const ids = testing ? ADMOB_TEST_IDS : ADMOB_LIVE_IDS;
  return {
    testing,
    appId: ids.appId,
    interstitialId: ids.interstitialId,
    // Personalisierte Werbung: ATT-Abfrage (launch-32: erst nach dem ersten gelösten Level, mit Vorfrage;
    // die UMP-Einwilligung kommt weiter beim Start). false = nie nach ATT fragen.
    askTracking: true,
  };
}

export const APP_CONFIG = Object.freeze({
  // In Tests und ohne Override: Test-IDs. In der App bitte resolveAdMob() verwenden.
  admob: Object.freeze(resolveAdMob()),
  store: Object.freeze({
    // StoreKit-Produkt-IDs = Präfix + Shop-ID (aus SHOP_CONFIG, "-" wird zu "_"),
    // z. B. de.hoffmann.squishattack.rocket_3. Genau so in App Store Connect anlegen
    // (Typ: Verbrauchsartikel / Consumable). Die Testdatei ios/App/App/Squish.storekit nutzt dieselben IDs.
    productPrefix: 'de.hoffmann.squishattack.',
    // Werbefrei (launch-26, launch-32: 4,99 €): einmalig, Nicht-Verbrauch / Non-Consumable.
    // Feste Produkt-ID, ohne das Shop-Präfix. Genau so in App Store Connect und in Squish.storekit.
    adFreeProductId: 'squish.adfree',
  }),
  // Schlüsselbund-Eintrag für den anonymen Spieler-Token (überlebt eine Neuinstallation).
  keychainKey: 'squish-save-token-v1',
});

export const storeProductId = (shopId, prefix = APP_CONFIG.store.productPrefix) => prefix + String(shopId).replace(/-/g, '_');
export const shopIdFromProductId = (productId, prefix = APP_CONFIG.store.productPrefix) =>
  String(productId).startsWith(prefix) ? String(productId).slice(prefix.length).replace(/_/g, '-') : null;

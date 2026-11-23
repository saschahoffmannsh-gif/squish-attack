// ======================================================================================
//  PLATZHALTER der App-Hülle – vor dem Store-Start ersetzen (siehe docs/app-build.md)
// ======================================================================================
// Die App-ID (Bundle-ID) steht NICHT hier, sondern in app/capacitor.config.json ("appId")
// und im Xcode-Projekt (PRODUCT_BUNDLE_IDENTIFIER). Platzhalter: de.hoffmann.squishattack

export const APP_CONFIG = Object.freeze({
  admob: Object.freeze({
    // true = Google-TEST-Anzeigen. Erst auf false stellen, wenn die echten IDs unten stehen!
    testing: true,
    // Google-TEST-Anzeigenblöcke für iOS (öffentlich, von Google dokumentiert).
    // Echte IDs aus AdMob → Apps → Squish Attack → Anzeigenblöcke eintragen.
    // launch-42: rewardedId ungenutzt (Hilfen kommen aus dem Vorrat, nicht aus Clips). Darf in AdMob entfallen.
    rewardedId: 'ca-app-pub-3940256099942544/1712485313',
    interstitialId: 'ca-app-pub-3940256099942544/4411468910',
    // Die AdMob-App-ID steht in ios/App/App/Info.plist (GADApplicationIdentifier), ebenfalls TEST.
    // Personalisierte Werbung: ATT-Abfrage (launch-32: erst nach dem ersten gelösten Level, mit Vorfrage;
    // die UMP-Einwilligung kommt weiter beim Start). false = nie nach ATT fragen.
    askTracking: true,
  }),
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

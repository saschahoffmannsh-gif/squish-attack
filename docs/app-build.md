# Squish Attack als iPhone-App bauen (Anleitung für den Mac)

Stand: 16.11.2026, Branch `app-shell`, Spiel-Stand `launch-19`.
Die App ist eine Hülle (Capacitor 8) um das unveränderte Spiel aus `game/`. Das Spiel liegt **im
App-Paket**, es wird nichts aus dem Netz nachgeladen. Das Netz braucht die App nur für Cloud-Sicherung,
Duell und Werbung. Eine Bestenliste gibt es im Spiel nicht mehr (auf `app-shell` entfernt). Die Web-Version auf GitHub Pages bleibt, wie sie ist.

Alles, was zur App gehört, liegt im Ordner `app/`.

---

## Einmalig einrichten

1. **Xcode installieren:** Mac App Store → „Xcode“ → Laden (groß, dauert). Danach Xcode einmal
   öffnen und die Zusatzkomponenten installieren lassen. Für iOS 26 brauchst du Xcode 26 oder neuer.
2. **Node.js installieren:** <https://nodejs.org> → „LTS“ laden und installieren.
   Prüfen im Terminal: `node -v` zeigt mindestens `v20`.
3. **Projekt holen** (Terminal):
   ```bash
   git clone https://github.com/saschahoffmannsh-gif/squish-attack.git
   cd squish-attack
   git checkout app-shell
   cd app
   npm install
   ```
4. **Apple-Konto in Xcode:** Xcode → Einstellungen → Accounts → „+“ → Apple ID. Zum Testen auf deinem
   eigenen iPhone reicht deine normale Apple-ID. Für TestFlight und den App Store brauchst du das
   Apple-Developer-Programm (99 €/Jahr).
5. **iPhone vorbereiten:** iPhone per Kabel anschließen und „Vertrauen“ antippen. Auf dem iPhone:
   Einstellungen → Datenschutz & Sicherheit → **Entwicklermodus** einschalten (das iPhone startet neu).

## Bei jeder neuen Version

Im Ordner `app/`:

```bash
npm run sync      # baut app/www aus dem Spiel und kopiert es ins Xcode-Projekt (npx cap sync ios)
npm run open      # öffnet das Xcode-Projekt
```

`npm run sync` macht zwei Dinge: `node scripts/build-web.mjs` (kopiert `index.html`, `game/`,
`levels/`, `squish/` nach `app/www` und hängt die App-Brücke an) und danach `npx cap sync ios`.

## In Xcode signieren und auf dem iPhone starten

1. Links oben auf das blaue Projekt **App** klicken → Target **App** → Reiter **Signing & Capabilities**.
2. Haken bei **Automatically manage signing** setzen und bei **Team** dein Team (deine Apple-ID)
   auswählen.
3. **Bundle Identifier** steht auf dem Platzhalter `de.hoffmann.squishattack`. Mit einem kostenlosen
   Konto muss er weltweit eindeutig sein. Falls Xcode meckert, ändere ihn (siehe „Platzhalter“ unten).
4. Bei **+ Capability** nichts hinzufügen. In-App-Käufe funktionieren ohne Extra-Capability.
5. Oben in der Leiste dein iPhone als Ziel wählen und auf **▶ (Run)** klicken.
   Beim ersten Mal auf dem iPhone: Einstellungen → Allgemein → VPN & Geräteverwaltung → dem
   Entwickler vertrauen.

Beim ersten Start siehst du nacheinander: den Google-Einwilligungsdialog (nur in der EU, nur wenn
in AdMob angelegt), dann Apples Frage „Darf … dich über Apps hinweg verfolgen?“. Danach startet das
Spiel. Werbung läuft mit **Google-Test-Anzeigen** (Banner „Test Ad“). Echtes Geld fließt dabei nicht.

### Was du auf dem iPhone testen solltest

- **Start offline:** Flugmodus an, App starten. Das Spiel muss laufen, nur Sync und Duell fehlen.
- **Haptik:** Bei Zügen und Merges vibriert es spürbar (Einstellungen → Vibration ist in der App an).
- **Abenteuer:** Leeres Hilfsmittel → „Ansehen“ → Test-Video bis zum Ende → +1 Hilfsmittel.
  Schließt du das Video vorher, gibt es nichts.
- **Zwischenwerbung:** nach jedem 10. gewonnenen Level (Wiederholungen zählen mit), immer erst
  **vor** dem nächsten Level.
- **Endlos:** nach je 15 Minuten Spielzeit kommt nach einem Zug eine normale Zwischenwerbung
  ohne Belohnung (Werbefrei entfernt sie). launch-29: Endlos hat keine Werkzeuge mehr.
- **Spielstand über Neuinstallation:** ein paar Level spielen, App löschen, neu installieren
  (▶ in Xcode). Die Sterne kommen über den Schlüsselbund und die Cloud-Sicherung zurück.
- **Hochformat:** Drehen ändert nichts, Zoomen und Gummiband-Scrollen gehen nicht.

### Käufe testen (StoreKit-Testdatei, ohne App Store Connect)

Der Shop bleibt ausgeblendet (`SHOP_CONFIG.enabled = false` in `game/shop.mjs`). Der Kaufweg ist trotzdem
angeschlossen und lässt sich lokal testen:

1. Xcode → Menü **Product → Scheme → Edit Scheme… → Run → Options → StoreKit Configuration** muss auf
   `Squish.storekit` stehen (ist im geteilten Schema schon eingetragen; falls leer: auswählen).
2. App mit ▶ starten. Auf dem Mac **Safari → Einstellungen → Erweitert → „Funktionen für
   Webentwickler“** einschalten. Auf dem iPhone: Einstellungen → Apps → Safari → Erweitert →
   **Web-Inspektor** an.
3. Safari → Menü **Entwickler → [dein iPhone] → Squish Attack** → Konsole:
   ```js
   await SquishApp.testPurchase('rocket-3')
   ```
   Es erscheint der StoreKit-Testkaufdialog. Ergebnis: `{ok: true, items: {rocket: 3}, …}`.
   (Dieser Test bucht nichts in den Vorrat, er prüft nur den Kaufweg.)
4. Werbefrei (Nicht-Verbrauch, 4,99 €, Produkt-ID `squish.adfree` — **ohne** das Shop-Präfix):
   ```js
   await SquishApp.testAdFreePurchase()   // Kaufdialog, danach isAdFree() === true
   await SquishApp.testAdFreeRestore()    // Käufe wiederherstellen
   ```
   In der App steht derselbe Weg unter Einstellungen: „Werbefrei 4,99 €“ und
   „Käufe wiederherstellen“ (nur in der nativen App, nicht im Web).
5. Wer den ganzen Werkzeug-Shop sehen will: in `game/shop.mjs` vorübergehend `enabled: true` setzen,
   `npm run sync`, ▶. **Nicht so committen.**

Abgeschlossene Testkäufe siehst du in Xcode unter **Debug → StoreKit → Manage Transactions**.
Zum Testen von „Käufe wiederherstellen“: Transaction für `squish.adfree` dort löschen, App neu
starten (lokales Entitlement ggf. im Web-Inspektor mit `localStorage.removeItem('squish-adfree-v1')`
löschen) und Restore erneut auslösen — ohne vorhandenen Kauf muss das Ergebnis `owned: false` sein.

### Werbefrei in App Store Connect anlegen

Einmaliger In-App-Kauf, **kein** Abonnement, **kein** Verbrauchsartikel.

1. App Store Connect → die App „Squish Attack“ → **Monetarisierung → In-App-Käufe → „+“**.
2. Typ: **Nicht-Verbrauch** (Non-Consumable). Referenzname z. B. „Werbefrei“.
3. Produkt-ID genau **`squish.adfree`** (nicht `de.hoffmann.squishattack.adfree`). Einmal angelegt,
   lässt sich die ID nicht mehr ändern.
4. Preis: **4,99 EUR** (Preisstufe wählen, die in Deutschland 4,99 € anzeigt).
5. Lokalisierung Deutsch: Anzeigename „Werbefrei“, Beschreibung z. B. „Keine Werbung vor
   Hilfsmitteln, keine Zwischenwerbung. Jedes Hilfsmittel bleibt 1× je Versuch.“
   Englisch: „Ad-free“ / „No tool ads, no interstitials. Each tool stays 1× per attempt.“
6. Prüfung: Screenshot der Einstellungen mit Kaufknopf beilegen, Review-Notizen:
   „Non-consumable unlocks ad-free. Settings → Werbefrei and Käufe wiederherstellen.
   Does not remove the 1×-per-attempt tool limit.“
7. Dieselbe ID steht in `app/src/app-config.mjs` (`store.adFreeProductId`) und in der Testdatei
   `app/ios/App/App/Squish.storekit` (Typ `NonConsumable`, 4.99). Nach Änderungen an der Testdatei
   in Xcode das Schema prüfen (**StoreKit Configuration** = `Squish.storekit`).
8. Werkzeug-Pakete (`de.hoffmann.squishattack.*`) bleiben Verbrauchsartikel und der Shop bleibt
   vorerst ausgeblendet. Sie nicht mit Werbefrei vermischen.

## TestFlight (mit Apple-Developer-Programm)

1. In **App Store Connect** (<https://appstoreconnect.apple.com>) → Apps → „+“ → Neue App:
   Plattform iOS, Name „Squish Attack“, Sprache Deutsch, Bundle-ID = deine endgültige App-ID, SKU z. B.
   `squishattack1`.
2. In Xcode oben als Ziel **Any iOS Device (arm64)** wählen.
3. Bei jeder neuen Version im Target **App → General** die **Build**-Nummer um 1 erhöhen
   (Version z. B. `1.0`, Build `1`, `2`, `3` …).
4. Menü **Product → Archive**. Nach dem Bauen öffnet sich der Organizer.
5. **Distribute App → App Store Connect → Upload** → Weiter mit den Standardwerten.
6. Nach 10–30 Minuten erscheint der Build in App Store Connect → TestFlight. Die Frage zur
   Verschlüsselung ist schon beantwortet (`ITSAppUsesNonExemptEncryption = NO`).
7. Unter TestFlight → **Interne Tests** dich selbst hinzufügen und auf dem iPhone die App
   **TestFlight** installieren. Dort erscheint Squish Attack.

---

## Platzhalter: vor dem Store-Start ersetzen

| Was | Platzhalter | Wo ändern |
|---|---|---|
| **App-ID (Bundle-ID)** | `de.hoffmann.squishattack` | `app/capacitor.config.json` → `appId` **und** in Xcode → Target App → Signing & Capabilities → Bundle Identifier (setzt `PRODUCT_BUNDLE_IDENTIFIER` in `app/ios/App/App.xcodeproj/project.pbxproj`). Danach `npm run sync`. |
| **AdMob-App-ID** | `ca-app-pub-3940256099942544~1458002511` (Google-Test) | `app/ios/App/App/Info.plist` → `GADApplicationIdentifier` |
| **AdMob-Anzeigenblöcke** | Google-Test-IDs für Interstitial (Rewarded seit launch-42 ungenutzt) | `app/src/app-config.mjs` → `admob.interstitialId` |
| **Test-Modus Werbung** | `testing: true` | `app/src/app-config.mjs` → erst **nach** dem Eintragen der echten IDs auf `false` |
| **Produkt-IDs (Werkzeug-Shop)** | `de.hoffmann.squishattack.<shop-id>`, z. B. `…rocket_3`, `…bundle_mix` | Präfix in `app/src/app-config.mjs` → `store.productPrefix`; die Shop-IDs kommen aus `SHOP_CONFIG` in `game/shop.mjs`. In App Store Connect als **Verbrauchsartikel** genau so anlegen. Die Testdatei `app/ios/App/App/Squish.storekit` muss dieselben IDs haben (bei neuem Präfix dort mit ändern). Shop bleibt ausgeblendet. |
| **Werbefrei (IAP)** | `squish.adfree` (ohne Präfix), einmalig **4,99 EUR**, **Nicht-Verbrauch** | `app/src/app-config.mjs` → `store.adFreeProductId`. In App Store Connect als Non-Consumable mit genau dieser ID anlegen (siehe Abschnitt „Werbefrei in App Store Connect anlegen“). Testdatei `Squish.storekit` enthält denselben Eintrag. Einstellungen: Kauf + „Käufe wiederherstellen“. |
| **ATT-Text** | „Damit wir dir passendere Werbung zeigen können …“ | `app/ios/App/App/de.lproj/InfoPlist.strings`, `en.lproj/InfoPlist.strings` (und Info.plist) |
| **ATT ganz weglassen** | `askTracking: true` | `app/src/app-config.mjs`. Bei `false` auch `NSUserTrackingUsageDescription` aus der Info.plist löschen und im Privacy Manifest `NSPrivacyTracking` auf `false`. |
| **App-Icon / Startbild** | aus `game/icons/squishy-v1-1024.png` und dem Logo erzeugt | neue Vorlagen in `game/…` ablegen, dann `npm run assets` (braucht Python mit Pillow) |
| **Version** | `1.0` (Build `1`) | Xcode → Target App → General |

AdMob-Konsole (wenn das Konto da ist): App anlegen (iOS), zwei Anzeigenblöcke („Mit Prämie“ und
„Interstitial“), unter **Datenschutz & Mitteilungen** die DSGVO-Mitteilung (UMP) und die IDFA-Erklärung
veröffentlichen, `app-ads.txt` auf der Entwickler-Website hinterlegen.

## Aufbau (für später)

```
app/
  package.json            Capacitor 8 + Plugins, Skripte (sync, open, test, assets)
  capacitor.config.json   App-ID, webDir www, kein server.url, Startbild, Statusleiste
  scripts/build-web.mjs   baut www/ aus dem Spiel, prüft: keine externen Skripte, nur relative Pfade
  scripts/patch-xcode.cjs einmalige Xcode-Anpassungen (nur iPhone, de/en, Privacy Manifest, StoreKit)
  scripts/make-assets.py  Icon + Startbild
  src/                    App-Brücke (landet in www/game/app/)
    native-boot.mjs       Start: Schlüsselbund-Token → Spiel → AdMob/StoreKit anmelden
    app-config.mjs        alle Platzhalter-IDs an einer Stelle
    token-keychain.mjs    Spieler-Token im iOS-Schlüsselbund (Fallback localStorage)
    admob-adapter.mjs     UMP → Rewarded/Interstitial (nur Test-IDs)
    att-prompt.mjs        launch-32: Vorfrage + ATT nach dem ersten gelösten Level
    store-adapter.mjs     StoreKit über @capgo/native-purchases (Werkzeug-Pakete + Werbefrei squish.adfree)
    app.css               kein Zoom/Gummiband in der App
  test/                   Unit-Tests mit Mocks (npm test) + Browser-e2e mit gemocktem Capacitor
  ios/App/                Xcode-Projekt (Swift Package Manager, keine CocoaPods nötig)
game/native.mjs           Brücke im Spiel: Haptik, Bildschirm wach, Speichern bei App-Pause (im Browser ohne Wirkung)
game/ad-pacing.mjs        Werbe-Takt: jedes 10. gewonnene Level, Endlos-Zwischenwerbung alle 15 Minuten
```

Plugins: `@capacitor-community/admob` (Google Mobile Ads + UMP + ATT), `@capgo/native-purchases`
(StoreKit 2), `capacitor-secure-storage-plugin` (Schlüsselbund), `@capacitor/haptics`, `@capacitor/app`,
`@capacitor/status-bar`, `@capacitor/splash-screen`, `@capacitor/share`, `@capacitor-community/keep-awake`.

Backend: dasselbe wie im Web (Supabase-Projekt `tzkgqwvldlfbswdvyqgy`, Funktion `squish`). Die App
kommt vom Ursprung `capacitor://localhost`, den die Funktion per CORS schon erlaubt.

## Wenn etwas hakt

- **„No such module Capacitor“ / Pakete fehlen:** In Xcode **File → Packages → Reset Package Caches**,
  dann erneut ▶. Vorher muss `npm install` in `app/` gelaufen sein (die Swift-Pakete liegen in
  `app/node_modules`).
- **Weißer Bildschirm:** `npm run sync` vergessen. Danach in Xcode erneut ▶.
- **Signing-Fehler „No profiles for …“:** Team auswählen bzw. Bundle Identifier ändern.
- **Keine Test-Werbung:** Erst nach dem Einwilligungsdialog wird Werbung geladen. Im Simulator und
  ohne Netz kommt keine. Das Spiel läuft trotzdem; es gibt dann einfach kein Hilfsmittel.

## Endlos-Vorrat und Cloud (bis launch-28, jetzt stillgelegt)

- launch-29: Endlos hat keine Werkzeuge mehr. Der alte lokale Vorrat `squish-endless-tools-v1` wird ignoriert.
- Das Cloud-Feld `einv`/`einvAt` bleibt im Wire-Format lesbar; die App schickt es nicht mehr, der Server
  behält einen gespeicherten Stand (rückwärtskompatibel, nichts wird gelöscht).
- Werkzeug-Protokoll: Quelle `ad-endless` bleibt für alte Einträge lesbar.

## Bestenliste entfernt

Auf `app-shell` gibt es keine Bestenliste mehr: kein Menüpunkt, kein Bildschirm, keine Namenseingabe,
kein Senden von Punkten, kein Abruf. Die Tabelle `sq_leaderboard` und ihre Zeilen im Backend bleiben
unangetastet, sie werden nur nicht mehr benutzt.

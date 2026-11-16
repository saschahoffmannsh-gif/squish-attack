# App-Hülle (iOS, Capacitor): Plan

Stand: 16.11.2026, launch-19. **Umgesetzt im Branch `app-shell` (Ordner `app/`), Bauanleitung: [app-build.md](app-build.md).** Live ist davon nichts; die Web-Version bleibt unverändert.
Ziel ist das Spiel als iPhone-App im Hochformat, das komplett offline läuft. Echtes Geld gibt es
nur in der App: Werbung über AdMob, später In-App-Käufe über StoreKit.

## 1. Grundsatz

- Capacitor packt den Ordner der Website **lokal** in die App. Es wird kein Code aus dem Netz
  nachgeladen, also keine Live-Updates und kein `server.url`. Damit ist App-Store-Richtlinie
  2.5.2 erfüllt.
- Das Netz wird nur für **Daten** genutzt: Cloud-Spielstand, Fortschritt und Duell (eine Bestenliste gibt es nicht mehr).
  Fällt es aus, läuft das Spiel trotzdem (offline zuerst; geprüft in den e2e-Tests von launch-19).
- Pro App-Version gibt es eine feste Build-Kennung (`launch-N`). Neue Inhalte kommen nur per
  App-Update.

## 2. Aufbau des Pakets

Prüfung vom 16.11.: Alles liegt lokal, alle Pfade sind relativ, und es gibt keinen Fremd-Code.

```
squish-app/                    (eigenes Repo oder Ordner, Capacitor-Projekt)
  capacitor.config.ts          appId z. B. de.hoffmann.squishattack, webDir: 'www'
  www/                         = Kopie aus squish-attack (main), per Skript
    index.html                 leitet auf game/ weiter
    game/                      Spiel (ES-Module, CSS, Assets, Fonts, Audio, Icons, manifest)
    levels/                    levels-001-100.json, levels-lab.json
    squish/                    Grafik-Bundle + Texturen
  ios/                         Xcode-Projekt (von Capacitor erzeugt)
```

- **Kopierskript:** `main` exportieren und nach `www/` legen. `lab/`, `tools/`, `tests/`,
  `docs/`, `404.html`, `robots.txt` und `sw.js` werden weggelassen. Das Spiel registriert
  `sw.js` nicht.
- **Ursprung in der App:** `capacitor://localhost`. Die Edge Function erlaubt diesen Ursprung
  schon (CORS, live seit 16.11.).
- **Schriften** (Fredoka, Lilita One) liegen lokal in `game/assets/fonts`. Die OFL-Lizenztexte
  sind dabei.
- **Audio:** Die Lizenzen stehen in `game/assets/audio/CREDITS.txt` (CC0).
- **App-Icon:** `game/icons/squishy-v1-1024.png` ist die Vorlage. In Xcode braucht das Icon
  1024×1024 px ohne Transparenz.
- **Startbild:** navy Hintergrund mit Logo (`game/assets/squish-attack-logo-v1.png`).
- **Ausrichtung:** nur Hochformat (`UISupportedInterfaceOrientations` = Portrait), nur iPhone
  (`TARGETED_DEVICE_FAMILY = 1`).
- **WKWebView:** Wiedergabe ohne Antippen (`allowsInlineMediaPlayback`) und kein Zurück-Wischen.
  `contentInset: 'never'`, da die sichere Fläche im CSS behandelt wird.

### Was schon da ist

| Teil | Wo | Stand |
|---|---|---|
| Kauf-Schnittstelle | `game/shop.mjs` → `registerNativeStore(adapter)`, auch über `window.SquishNative.registerNativeStore` | vorbereitet; Shop ist aus (`SHOP_CONFIG.enabled = false`) |
| Werbe-Schnittstelle | `game/native-ads.mjs` → `registerNativeAds({showRewarded, showInterstitial})`, auch über `window.SquishNative.registerNativeAds` | neu in launch-19; ohne Adapter bleibt es bei der Dummy-Werbung |
| Native Kleinigkeiten | Branch `capacitor-bridge`, `game/native.mjs`: Haptik, Duell-Code teilen, Bildschirm wach halten, Pause/Weiter speichert, Game-Center-Platzhalter | **noch nicht in `main`**; der Branch liegt 58 Commits zurück und wird beim Start der App-Hülle nachgezogen |
| CORS für die App | Edge Function `squish` v2 | live |
| Fortschritt in der Cloud | `game/progress-sync.mjs`, Route `/progress` | live seit launch-19 |

## 3. Native Brücke

Die Brücke ist eine kleine Datei `www/native-boot.js`, die nur in der App geladen wird (z. B. per
`<script>` im App-Build). Sie meldet die Adapter an. Im Browser gibt es keinen Adapter, dort ändert
sich nichts.

### 3.1 Werbung (AdMob), passend zum Geld-Plan

Plugin: `@capacitor-community/admob` (oder ein gleichwertiges Plugin). Es enthält das Google
Mobile Ads SDK und die UMP-Einwilligung.

| Stelle | Art | Regel |
|---|---|---|
| Abenteuer: Hilfsmittel einsetzen (ohne Werbefrei) | **Rewarded** | je Einsatz ein Clip; nur wenn er zu Ende geschaut wurde, wird die 1×-Ladung verbraucht. Kein Vorrat, kein Ansammeln. Werbefrei (`squish.adfree`, 2,99 €, StoreKit, Nicht-Verbrauch): gleicher 1×-Takt, ohne Clip |
| Abenteuer: nach jedem **5.** gewonnenen Level (launch-26, vorher 10) | **Interstitial** | Pflichtwerbung, erst vor dem nächsten Level, nie mitten im Level; entfällt bei Werbefrei |
| Endlos: alle 10 Minuten ein Angebot, direkt nach einem Zug (wenn die Animationen fertig sind) | **Rewarded** (Angebot, kann weggedrückt werden) | Belohnung = **ein Werkzeug für den eigenen Endlos-Vorrat** (reihum Rakete, Zauberstab; Protokoll-Quelle `ad-endless`); der Abenteuer-Vorrat bleibt unberührt; **kein** Weiterspielen nach Game Over; entfällt bei Werbefrei |
| Geschenke nach Level 3/6/10/20 | – | launch-26: entfallen vollständig, auch nicht in den Endlos-Vorrat |
| Werbefrei (einmalig 2,99 €, `squish.adfree`) | IAP, nur App | Hook `registerAdFree({ isAdFree, purchase, restore })`. Entfernt Clips, Zwischenwerbung und das Endlos-Angebot, nicht das 1×-Limit. Werkzeug-Shop bleibt aus; in den Einstellungen: Kauf und „Käufe wiederherstellen“ |

Werkzeug-Pakete im Shop bleiben ausgeblendet. Energie-Systeme: keine.

```js
// native-boot.js (Skizze)
import { AdMob, RewardAdPluginEvents } from '@capacitor-community/admob';
await AdMob.initialize({ initializeForTesting: false });
// Einwilligung (UMP) zuerst, dann ATT (siehe 4.)
const REWARDED = 'ca-app-pub-XXX/YYY', INTER = 'ca-app-pub-XXX/ZZZ';
window.SquishNative.registerNativeAds({
  name: 'admob',
  async showRewarded({ placement, tool }) {
    await AdMob.prepareRewardVideoAd({ adId: REWARDED });
    const reward = await AdMob.showRewardVideoAd();     // löst nur bei vollständigem Ansehen aus
    return { ok: !!reward };
  },
  async showInterstitial({ placement }) {
    await AdMob.prepareInterstitial({ adId: INTER });
    await AdMob.showInterstitial();
    return { ok: true };
  },
});
```

**Im Spiel (launch-26):** Takt liegt in `game/ad-pacing.mjs` (`interstitialEvery: 5`,
`endlessOfferMs: 10 Minuten`). Die App-Hülle zeigt Interstitials über `hasNativeAds()`
und `takeInterstitial()`; die Web-Version zählt Siege mit `levelWon()`, zeigt aber
keine Werbung. Endlos-Angebot und Endlos-Vorrat (einv, lokal + Cloud) bleiben nur in der App
und sind unverändert. Ohne Adapter passiert im Browser nichts Sichtbares. Werbefrei
unterdrückt Clips und beide Werbeformen.

### 3.1a Game Center (nur iOS-App)

Plugin `@bavrk/capacitor-game-center`. Leise Anmeldung beim Start, Spiel läuft
auch ohne Anmeldung. Eine Endlos-Bestenliste (`squish.lb.endless`) und 16 Erfolge
(Tutorial, Kapitel 1–10, erste 5er-Fusion, erste Straße, perfektes Kapitel,
Endlos 1.000 / 5.000). IDs, Texte, Punkte und die Schritte in App Store Connect:
`docs/game-center.md`. Brücke: `window.SquishNative.gameCenter`. Im Web No-Op.


### 3.2 In-App-Käufe (StoreKit), später

Plugin: z. B. `@capgo/native-purchases` oder RevenueCat (`@revenuecat/purchases-capacitor`).
RevenueCat bringt Belegprüfung und Statistik mit und ist bis zu einem gewissen Umsatz kostenlos.

```js
window.SquishNative.registerNativeStore({
  name: 'storekit',
  async products() { /* Preise aus App Store Connect */ },
  async purchase(product) { /* … */ return { ok: true, transactionId }; },
});
```

Verbrauchsgüter (Hilfsmittel-Pakete) laufen als „Consumable“. Ein Starterpaket ist vielleicht
später dran. Der Shop wird erst mit echten Produkten eingeschaltet.

### 3.3 Spielstand über eine Neuinstallation retten

Heute hängt alles am anonymen Geräte-Token (`squish-save-token-v1`) im localStorage. Wird die App
gelöscht, ist er weg.
1. **Schritt 1 (zum App-Start):** Den Token zusätzlich im **iOS-Schlüsselbund** ablegen, z. B. mit
   `capacitor-secure-storage-plugin`. Beim Start gilt: Ist der Schlüsselbund gefüllt, aber der
   localStorage leer, wird der Token zurückgeschrieben. Der Abgleich holt dann Fortschritt und
   Endlos-Spielstand automatisch zurück, denn der Server führt per `PUT /progress` zusammen. Der
   Schlüsselbund überlebt eine Neuinstallation und wird über iCloud-Schlüsselbund auch auf ein neues
   iPhone übertragen.
2. **Schritt 2 (optional, später):** Game Center oder Sign in with Apple. Die Tabelle `sq_progress`
   hat dafür schon die Spalte `account_id`, z. B. `gc:<teamPlayerID>` oder `apple:<sub>`. Ein
   Konto bündelt dann mehrere Geräte-Tokens, ohne dass sich das Format ändert. Dazu braucht es eine
   neue Route `/link` mit Prüfung der Apple-Signatur. Sign in with Apple ist nur Pflicht, wenn es
   andere Logins gibt, und die gibt es nicht.

## 4. Einwilligung: ATT und DSGVO

Reihenfolge beim ersten Start, bevor Werbung geladen wird:
1. **Google UMP (Consent-Dialog)**, Pflicht in EU/EWR/UK für personalisierte Werbung. Den Dialog
   und die Texte in AdMob unter „Datenschutz & Mitteilungen“ anlegen (IAB-TCF-Dialog). Ohne
   Einwilligung kommt nur nicht personalisierte Werbung.
2. **Apple ATT** (`requestTrackingAuthorization`) nur, wenn personalisierte Werbung mit IDFA
   genutzt werden soll. In `Info.plist` steht dann `NSUserTrackingUsageDescription`, z. B. „Damit
   wir dir passendere Werbung zeigen können. Das Spiel funktioniert auch ohne.“. Lehnt der Spieler
   ab, gibt es keine IDFA, die Werbung läuft trotzdem.
3. **SKAdNetwork-IDs** von Google in `Info.plist` eintragen (Liste aus der AdMob-Doku).
4. **Privacy Manifest** (`PrivacyInfo.xcprivacy`): Das Google-SDK bringt sein eigenes mit. Für das
   Spiel kommen localStorage/UserDefaults dazu (Grund `CA92.1`) und „Tracking: ja“, falls ATT
   genutzt wird.
5. **App-Datenschutz-Angaben in App Store Connect** (Vorschlag):
   - *Kennungen, Nutzer-ID:* der anonyme Spieler-Token. Nicht mit der Identität verknüpft, App-Funktion.
   - *Nutzungsdaten, Produktinteraktion:* Fortschritt, Punkte. App-Funktion.
   - Mit AdMob zusätzlich: *Kennungen, Geräte-ID* (IDFA, nur mit ATT-Erlaubnis), *Nutzungsdaten,
     Werbedaten*, *Diagnose*. Zweck: Werbung von Drittanbietern; bei ATT-Erlaubnis „Tracking“.
6. **Altersfreigabe:** Das Spiel richtet sich nicht an Kinder unter 13. Sonst gelten strengere
   Werberegeln (Kids Category, COPPA). Fragebogen in App Store Connect ehrlich ausfüllen; mit
   Werbung meist 4+ oder 9+.
7. In der App einen Link „Datenschutz“ und „Impressum“ zeigen (Einstellungen). Dazu einen Schalter
   „Werbe-Einwilligung ändern“, der das UMP-Formular erneut öffnet.

## 5. Datenschutzerklärung (Entwurf, von Sascha zu prüfen)

> Entwurf, keine Rechtsberatung. Vor Veröffentlichung prüfen lassen, z. B. mit einem Generator
> wie dem von eRecht24 oder durch einen Anwalt. Platzhalter in [eckigen Klammern].

---

**Datenschutzerklärung für „Squish Attack“**

**1. Verantwortlicher**
[Vorname Nachname], [Straße Nr.], [PLZ Ort], [E-Mail]. Weitere Angaben findest du im Impressum.

**2. Kurz gesagt**
Du kannst Squish Attack ohne Konto, ohne E-Mail und ohne Namen spielen. Wir speichern nur, was
das Spiel braucht: eine zufällige Spieler-Kennung und deinen Spielstand. In der App zeigen wir Werbung von Google AdMob. Dafür fragen wir
dich vorher um Erlaubnis.

**3. Welche Daten wir verarbeiten**
- **Anonyme Spieler-Kennung:** Beim ersten Start erzeugt dein Gerät eine Zufallszahl. Sie bleibt
  auf deinem Gerät. Unser Server speichert nur einen daraus berechneten, nicht umkehrbaren Wert
  (SHA-256). Daraus lässt sich nicht ablesen, wer du bist.
- **Spielstand und Fortschritt:** Endlos-Spielstand, Punkte, freigespielte Level, Sterne, beste
  Züge und Hilfsmittel-Vorrat (Abenteuer und Endlos). Damit dein Spielstand gesichert ist und auf deinem Gerät
  wiederhergestellt werden kann.
- **Duell:** Für die Dauer eines Duells der Spielverlauf beider Spieler. Duell-Räume werden nach
  spätestens einer Stunde gelöscht.
- **Technische Daten:** Zum Schutz vor Missbrauch (Begrenzung der Anfragen) verarbeiten wir deine
  IP-Adresse. Gespeichert wird nur ein gekürzter, mit einem geheimen Schlüssel verfremdeter Wert,
  und der wird nach höchstens 2 Tagen gelöscht.

**4. Zweck und Rechtsgrundlage**
- Bereitstellung des Spiels, Spielstand und Duell: Art. 6 Abs. 1 lit. b DSGVO
  (Nutzung des Spiels) und lit. f (berechtigtes Interesse an einem funktionierenden, fairen Spiel).
- Missbrauchsschutz: Art. 6 Abs. 1 lit. f DSGVO.
- Personalisierte Werbung und Tracking: nur mit deiner Einwilligung, Art. 6 Abs. 1 lit. a DSGVO
  und § 25 Abs. 1 TDDDG. Ohne Einwilligung zeigen wir nicht personalisierte Werbung, gestützt auf
  Art. 6 Abs. 1 lit. f DSGVO, denn Werbung finanziert das kostenlose Spiel.

**5. Speicherdauer**
- Endlos-Spielstand: wird gelöscht, wenn er 90 Tage nicht benutzt wurde.
- Fortschritt (Level, Sterne, Vorrat): [bis zu 24 Monate nach der letzten Nutzung. Die
  automatische Löschung ist noch einzurichten.]
- [Alte Bestenliste-Einträge aus der Web-Version: Die Bestenliste ist abgeschaltet, die Daten liegen
  noch im Backend. Ob und wann sie gelöscht werden, entscheidet Sascha; bis dahin auf Wunsch Löschung
  einzelner Einträge.]
- Daten auf deinem Gerät: bis du die App löschst.

**6. Empfänger und Dienstleister**
- **Supabase** (Supabase Inc., Server in Frankfurt am Main, EU) für Datenbank und Server-Funktion.
  Ein Vertrag zur Auftragsverarbeitung ist geschlossen. [Sascha: DPA im Supabase-Dashboard
  annehmen.]
- **Google AdMob** (Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irland) nur in
  der App, für Werbung. Google kann dabei Geräte-Kennungen (z. B. die Werbe-ID, nur mit deiner
  Erlaubnis), IP-Adresse, ungefähren Standort und Interaktionen mit Werbung verarbeiten, auch in
  den USA (EU-US Data Privacy Framework). Mehr dazu:
  https://policies.google.com/technologies/partner-sites
- **Apple** (App Store, ggf. iCloud-Schlüsselbund für deine Spieler-Kennung) nach den Bedingungen
  von Apple.
- **GitHub Pages** (GitHub Inc.) nur bei der Web-Version: Beim Aufruf der Website verarbeitet
  GitHub deine IP-Adresse in Server-Protokollen.

**7. Werbung und Einwilligung**
Beim ersten Start fragen wir dich, ob Google personalisierte Werbung zeigen darf. Auf dem iPhone
fragt zusätzlich Apple, ob Apps dich „tracken“ dürfen. Du kannst beides jederzeit ändern: im Spiel
unter Einstellungen → „Werbe-Einwilligung“ und in den iOS-Einstellungen → Datenschutz → Tracking.

**8. Deine Rechte**
Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und
Widerspruch sowie das Recht, eine Einwilligung zu widerrufen. Weil wir deinen Namen nicht kennen,
nenne uns bitte deine öffentliche Spieler-ID aus dem Spiel [Ort in der App], damit wir deine Daten
finden. Du kannst dich bei einer Datenschutz-Aufsichtsbehörde beschweren, z. B. [zuständige
Landesbehörde].

**9. Kinder**
Das Spiel richtet sich nicht an Kinder unter 13 Jahren.

**10. Änderungen**
Wir passen diese Erklärung an, wenn sich das Spiel ändert. Stand: [Datum].

---

## 6. Impressum (Platzhalter)

> Pflicht für Apps mit Werbung in Deutschland (§ 5 DDG). In der App und im App-Store-Eintrag
> verlinken.

```
Impressum

Angaben gemäß § 5 DDG
[Vorname Nachname]
[Straße Hausnummer]
[PLZ Ort]
Deutschland

Kontakt
E-Mail: [E-Mail-Adresse]
Telefon: [optional, oder ein anderer schneller Kontaktweg]

[Falls vorhanden: Umsatzsteuer-ID gemäß § 27a UStG: DE…]

Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV:
[Vorname Nachname, Anschrift wie oben]

Verbraucherstreitbeilegung: Wir sind nicht bereit und nicht verpflichtet, an
Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.
```

Hosting der beiden Seiten: z. B. `game/datenschutz.html` und `game/impressum.html` im Repo, damit
sie auf GitHub Pages öffentlich erreichbar sind (App Store Connect will eine URL) und auch offline
in der App liegen.

## 7. Was Sascha selbst erledigen muss

1. **Apple Developer Program** (99 €/Jahr) als Einzelperson oder Firma. Achtung: Bei Einzelpersonen
   werden Name und, wegen der EU-Händlerangaben (DSA), auch Adresse, Telefon und E-Mail im App
   Store angezeigt, sobald es Werbung oder Käufe gibt.
2. **Mac mit Xcode** (oder ein Cloud-Mac) für Build, Signierung und Upload. Den Build kann ich
   vorbereiten, aber Signieren und Hochladen laufen über Saschas Apple-Konto.
3. **App Store Connect:** App anlegen (Name, Bundle-ID, SKU). Dort ausfüllen: Altersfreigabe,
   App-Datenschutz-Angaben (siehe 4.5), Kategorie „Spiele → Puzzle“, Screenshots (6,9″ und 6,5″
   iPhone), Beschreibung, Support-URL, Datenschutz-URL. Außerdem den **Vertrag für kostenpflichtige
   Apps** abschließen, mit Bankverbindung und **Steuerformularen**; ohne den keine In-App-Käufe.
4. **Google AdMob-Konto:** App anlegen, Anzeigenblöcke für Rewarded und Interstitial erstellen,
   Zahlungsdaten und Steuerinfos hinterlegen. Den **Consent-Dialog (UMP, IAB TCF)** unter
   „Datenschutz & Mitteilungen“ veröffentlichen und `app-ads.txt` auf einer eigenen Domain
   bereitstellen (die Entwickler-Website aus App Store Connect).
5. **Rechtliches:** Daten für Impressum und Datenschutzerklärung (Name, Anschrift, E-Mail), Texte
   prüfen lassen, im Supabase-Dashboard den **Auftragsverarbeitungsvertrag (DPA)** annehmen und
   klären, ob ein Gewerbe angemeldet werden muss (Werbeeinnahmen); steuerlich mit Steuerberater
   oder Finanzamt.
6. **Entscheidungen:** die App-ID (z. B. `de.<nachname>.squishattack`), ob es personalisierte
   Werbung mit ATT gibt oder nur nicht personalisierte, die Speicherdauer für den Fortschritt (ich
   schlage 24 Monate vor) und ob Game Center zum Start dabei sein soll.
7. **Optional:** eigene Domain (für `app-ads.txt`, Datenschutz und Support), ca. 10 €/Jahr.

## 8. Ablauf, wenn es losgeht

1. Branch `capacitor-bridge` auf den aktuellen Stand bringen (`native.mjs` + Adapter). Lokal
   testen.
2. Capacitor-Projekt anlegen, Kopierskript schreiben, Hochformat, Icons, Startbild.
3. AdMob mit Test-Anzeigen-IDs einbauen (Rewarded, Interstitial nach 10 Leveln, Endlos-Angebot),
   dazu UMP und ATT.
4. Schlüsselbund für den Spieler-Token.
5. Datenschutz- und Impressum-Seiten mit Saschas Daten.
6. TestFlight-Build über Saschas Konto, auf dem iPhone testen, dann einreichen.

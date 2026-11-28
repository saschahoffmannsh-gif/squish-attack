# App Store Connect: Texte und Angaben für Squish Attack

Zum Abtippen in App Store Connect. Stand: 28. November 2026.
Zeichenlimits sind eingehalten. Die Werkzeug-Shop-Texte bleiben ungenutzt, der Shop ist aus.

- **Name:** Squish Attack (steht schon im Bundle)
- **Bundle-ID:** `de.hoffmann.squishattack` (Platzhalter — in Apple Developer und App Store Connect genau so anlegen, oder vorher ändern)
- **SKU:** z. B. `squishattack1` (einmalig, intern)
- **Primäre Sprache:** Deutsch
- **Kategorie:** Spiele → Puzzle. Sekundär (optional): Spiele → Familie
- **Support-URL:** https://spoostudio.de/squish-attack/support/
- **Datenschutz-URL:** https://spoostudio.de/squish-attack/datenschutz/
- **Marketing-URL (optional):** https://spoostudio.de/
- **Copyright:** 2026 Sascha Hoffmann

Lokalisierungen: Deutsch und Englisch (UK oder US, egal; Texte sind allgemeines Englisch).

---

## Untertitel (max. 30 Zeichen)

| | Text | Zeichen |
|---|---|---|
| DE | Schieben, fusionieren, lösen | 28 |
| EN | Slide, merge, and solve | 23 |

## Promo-Text (max. 170 Zeichen, ohne Review änderbar)

**DE (156):**
100 Level und ein Endlos-Modus. Schiebe weiche Squishes, fusioniere sie, sammle Sterne. Die ersten fünf Level ohne Zwischenwerbung, danach nur kurze Pausen.

**EN (148):**
100 levels plus Endless. Slide soft Squishes, merge them, collect stars. The first five levels have no interstitials; after that, only short breaks.

## Beschreibung (max. 4000 Zeichen)

**DE**

Squish Attack ist ein ruhiges Puzzle: Du schiebst weiche Squishes über das Brett. Liegen zwei gleiche nebeneinander, werden sie zu einem größeren. So räumst du, baust höhere Werte und löst Aufgabe für Aufgabe.

Das Abenteuer hat 100 Level in zehn Kapiteln. Jedes Level hat ein klares Ziel – zum Beispiel einen 4er bauen, das Brett leeren oder eine Straße legen. Wer mit weniger Zügen auskommt, bekommt mehr Sterne. Nach bestimmten Leveln liegt eine Hilfe im Vorrat: eine Rakete oder drei Extra-Züge. Du kannst eine Hilfe aufbewahren, aber nicht mehrere von derselben Sorte stapeln.

Wenn du länger spielen willst, gibt es den Endlos-Modus – einfach weitermachen und den eigenen Rekord verbessern. Zu zweit könnt ihr auf einem Gerät oder über einen kurzen Code gegeneinander spielen.

Die ersten fünf Abenteuer-Level kommen ohne Zwischenwerbung. Danach erscheint gelegentlich eine kurze Werbung zwischen den Leveln, im Endlos-Modus etwa alle 15 Minuten. Werbefrei (einmalig 4,99 €) nimmt nur diese Zwischenwerbung weg. An den Hilfen im Spiel ändert der Kauf nichts.

Keine Anmeldung, kein Konto. Dein Spielstand bleibt auf dem Gerät und kann zusätzlich in der Cloud gesichert werden.

Fragen oder ein Problem? spoostudio.de/squish-attack/support/
Datenschutz: spoostudio.de/squish-attack/datenschutz/

**EN**

Squish Attack is a calm puzzle game: you slide soft Squishes across the board. When two of the same kind sit side by side, they merge into a bigger one. That’s how you clear space, build higher values, and finish each goal.

Adventure has 100 levels in ten chapters. Every level has a clear task — build a 4, clear the board, make a run, and so on. Using fewer moves earns more stars. After certain levels you get a tool for your inventory: a rocket, or three extra moves. You can keep one of each, but they don’t stack.

If you want a longer session, Endless lets you keep going and chase your own high score. You can also play against someone else on the same device, or with a short code.

The first five Adventure levels have no interstitial ads. After that, a short ad appears between levels every so often, and in Endless about every 15 minutes. Ad-free (a one-time €4.99) removes only those interstitials. It doesn’t change the tools you get in the game.

No sign-in, no account. Your progress stays on the device and can also be backed up in the cloud.

Support: spoostudio.de/en/support/
Privacy: spoostudio.de/en/privacy/

## Schlüsselwörter (max. 100 Zeichen, ohne Leerzeichen nach Kommas)

| | Text | Zeichen |
|---|---|---|
| DE | puzzle,merge,schieben,denkspiel,casual,entspannend,steine,level,kampagne,endlos,fusion,sterne | 93 |
| EN | puzzle,merge,slide,casual,relaxing,tiles,levels,campaign,endless,fusion,stars,two player,brain | 94 |

Den App-Namen nicht noch einmal in die Keywords setzen. Keine Markennamen Dritter.

## Neue Funktionen (1.0, optional)

DE: Erste Version: 100 Level, Endlos-Modus und ein Spiel zu zweit.
EN: First release: 100 levels, Endless mode, and a two-player game.

---

## In-App-Käufe

Der **Werkzeug-Shop** ist aus (`SHOP_CONFIG.enabled = false`). In App Store Connect keine Verbrauchsartikel für Raketen oder +3 anlegen, solange der Shop aus bleibt.

**Werbefrei ist in der App schon angeschlossen** (Einstellungen: Kauf und „Käufe wiederherstellen“), nur in der nativen App, nicht im Web.

- Referenzname: Werbefrei
- Produkt-ID genau: `squish.adfree` (ohne Bundle-Präfix, lässt sich später nicht ändern)
- Typ: Nicht-Verbrauch (Non-Consumable)
- Preis: 4,99 EUR (Preisstufe wählen, die in Deutschland 4,99 € zeigt)
- DE: Anzeigename „Werbefrei“. Beschreibung: „Keine Zwischenwerbung im Abenteuer und im Endlos-Modus. An den Hilfen im Spiel ändert der Kauf nichts.“
- EN: Display name “Ad-free”. Description: “Removes interstitial ads in Adventure and Endless. Does not change the tools you get in the game.”
- Vor dem Verkauf: Vertrag für kostenpflichtige Apps, Bank- und Steuerdaten in App Store Connect.

---

## App-Datenschutz (Fragebogen)

Eigene Daten der App und die des AdMob-SDK angeben. Ohne ATT-Erlaubnis liefert Apple keine IDFA; trotzdem muss die Möglichkeit deklariert werden, weil die App um ATT bitten kann.

### Von uns (Spoo Studio / Supabase-Cloud-Stand)

| Datentyp | Erhoben? | Mit Identität verknüpft? | Tracking? | Zweck |
|---|---|---|---|---|
| Kennungen → Benutzer-ID (anonyme Geräte-Kennung, 64-Hex-Token) | Ja | Nein | Nein | App-Funktionalität (Spielstand sichern und wiederherstellen) |
| Nutzungsdaten → Produktinteraktion (Level, Sterne, Endlos-Stand, Vorrat) | Ja | Nein | Nein | App-Funktionalität |

Kein Name, keine E-Mail, keine Telefonnummer, kein Standort von uns, keine Kontakte, keine Gesundheitsdaten. Die Benutzer-ID ist ein Zufallswert, kein Login.

### Von Google AdMob (Drittanbieter-Werbung)

| Datentyp | Erhoben? | Mit Identität verknüpft? | Tracking? | Zweck |
|---|---|---|---|---|
| Kennungen → Geräte-ID (IDFA, nur nach ATT-Erlaubnis) | Ja | Ja (durch Google) | Ja, nur mit ATT | Werbung von Drittanbietern |
| Nutzungsdaten → Werbedaten (Einblendungen, Klicks) | Ja | Ja (durch Google) | Ja, nur mit ATT | Werbung von Drittanbietern |
| Standort → Ungefährer Standort (über IP, durch Google) | Ja, typisch bei AdMob | Ja (durch Google) | Ja, nur mit ATT | Werbung von Drittanbietern |
| Diagnose (Crash/Performance, falls das SDK welche sendet) | Ja, typisch bei AdMob | Nein, sofern nicht anders von Google angegeben | Nein | App-Funktionalität / Analyse des SDK |

**Tracking insgesamt: Ja**, aber nur über AdMob und nur wenn die Spielerin ATT erlaubt. Unsere eigenen Spielstand-Daten werden nicht zum Tracking verwendet.

**„Mit der Identität verknüpft“:** Unsere Daten nein. AdMob-Daten ja, weil Google sie in seinem Werbesystem zusammenführen kann.

Käufe (Werbefrei) laufen über Apple. Wir bekommen keine Kartendaten; einen Kaufstatus speichert die App lokal plus App-Store-Beleg. Im Fragebogen „Käufe“ nur ankreuzen, wenn du den Status als erhobene Daten zählen willst — empfohlen: nicht als eigenen Datentyp führen, die Abrechnung bleibt bei Apple.

---

## Altersfreigabe

Empfohlenes Ergebnis: **4+** (ruhiges Puzzle, keine Gewalt, keine anstößigen Inhalte). Werbung und der optionale Kauf werden im Fragebogen angegeben, heben die Stufe typischerweise nicht auf 9+ oder 12+.

Klassische Fragen (None / No, außer den markierten):

- Cartoon or Fantasy Violence: None
- Realistic Violence: None
- Sexual Content or Nudity: None
- Profanity or Crude Humor: None
- Horror/Fear Themes: None
- Mature/Suggestive Themes: None
- Alcohol, Tobacco, or Drug Use or References: None
- Simulated Gambling: None
- Medical or Treatment Information: None
- Unrestricted Web Access: No (Einstellungen öffnen nur die festen spoostudio.de-Seiten)
- Gambling and Contests: No
- **Advertising: Yes** (Google-Zwischenwerbung)
- **In-App Purchases: Yes** (Werbefrei, einmalig)

Das Spiel richtet sich nicht an Kinder unter 13 im Sinne von COPPA/Kids Category (Werbung, Cloud-Stand). Den Altersfragebogen ehrlich ausfüllen, die App aber nicht in die Kinder-Kategorie stecken.

---

## Hinweise für die App-Prüfung (Review Notes, Englisch)

Squish Attack is a puzzle game. Interstitial ads (AdMob) start after Adventure level 5, then every third completed level, and about every 15 minutes in Endless. The non-consumable “Ad-free” (product id squish.adfree, €4.99) removes those interstitials only; tools are granted after set Adventure levels and are not unlocked by watching ads or by buying ad-free. Restore purchases is in Settings. There is no account or sign-in; a random device token can back up progress. Privacy policy and support links are in Settings and point to spoostudio.de. The first launch may show Google’s UMP consent form (EU) and, after the first completed level, Apple’s ATT prompt.

Zum Testen des Kaufs: StoreKit-Testdatei liegt im Xcode-Projekt (`Squish.storekit`), oder Sandbox-Apple-ID in den Review-Notizen angeben, sobald `squish.adfree` in App Store Connect angelegt ist.

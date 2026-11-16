# Game Center (iOS-App)

Stand: 16.11.2026, Branch `app-shell`. Nur in der nativen App. Die Web-Version
(GitHub Pages) bleibt unverändert: `isAvailable()` ist falsch, alle Aufrufe sind
No-Ops, das Spiel startet ohne Dialog.

Plugin: **`@bavrk/capacitor-game-center` 0.1.0** (Capacitor 7/8, iOS 15+, MIT).
Anmeldung über `GameKit` / `GKLocalPlayer`, Bestenlisten und Erfolge, Apple-Dialoge.
Die JS-Brücke ist `window.SquishNative.gameCenter` (und `registerGameCenter` für die
App-Hülle). Authentifizierung startet leise beim App-Start und blockiert das Spiel
nicht, wenn der Spieler ablehnt oder Game Center auf dem Gerät aus ist.

## IDs (einmal festlegen)

Die IDs müssen in App Store Connect **genau so** angelegt werden. Nach der ersten
Live-Schaltung lassen sie sich nicht mehr ändern.

### Bestenliste

| ID | DE Titel | EN Titel | DE Beschreibung | EN Beschreibung | Format |
|---|---|---|---|---|---|
| `squish.lb.endless` | Endlos-Rekord | Endless high score | Dein höchster Punktestand im Endlos-Modus. | Your highest score in endless mode. | Ganzzahl, höher ist besser, alle Zeiten, weltweit |

Es gibt genau diese eine Bestenliste. Der aktuelle Endlos-Punktestand wird beim
Game Over gesendet; Game Center behält den besten Wert.

### Erfolge

Punkte addieren sich auf **100** (Maximum bei Game Center). Jeder Erfolg wird
vollständig (100 %) gemeldet, mit dem üblichen Game-Center-Banner.

| ID | Punkte | DE Titel | EN Titel | DE Beschreibung | EN Beschreibung |
|---|---:|---|---|---|---|
| `squish.ach.tutorial` | 5 | Erste Schritte | First steps | Schließe die fünf Tutorial-Level (1–5) ab. | Complete the five tutorial levels (1–5). |
| `squish.ach.chapter1` | 5 | Kapitel 1 | Chapter 1 | Schließe Level 10 ab und beende damit Kapitel 1. | Finish level 10 to complete chapter 1. |
| `squish.ach.chapter2` | 5 | Kapitel 2 | Chapter 2 | Schließe Level 20 ab und beende damit Kapitel 2. | Finish level 20 to complete chapter 2. |
| `squish.ach.chapter3` | 5 | Kapitel 3 | Chapter 3 | Schließe Level 30 ab und beende damit Kapitel 3. | Finish level 30 to complete chapter 3. |
| `squish.ach.chapter4` | 5 | Kapitel 4 | Chapter 4 | Schließe Level 40 ab und beende damit Kapitel 4. | Finish level 40 to complete chapter 4. |
| `squish.ach.chapter5` | 10 | Kapitel 5 | Chapter 5 | Schließe Level 50 ab und beende damit Kapitel 5. | Finish level 50 to complete chapter 5. |
| `squish.ach.chapter6` | 5 | Kapitel 6 | Chapter 6 | Schließe Level 60 ab und beende damit Kapitel 6. | Finish level 60 to complete chapter 6. |
| `squish.ach.chapter7` | 5 | Kapitel 7 | Chapter 7 | Schließe Level 70 ab und beende damit Kapitel 7. | Finish level 70 to complete chapter 7. |
| `squish.ach.chapter8` | 5 | Kapitel 8 | Chapter 8 | Schließe Level 80 ab und beende damit Kapitel 8. | Finish level 80 to complete chapter 8. |
| `squish.ach.chapter9` | 5 | Kapitel 9 | Chapter 9 | Schließe Level 90 ab und beende damit Kapitel 9. | Finish level 90 to complete chapter 9. |
| `squish.ach.chapter10` | 15 | Hundert | One hundred | Schließe Level 100 ab und beende alle zehn Kapitel. | Finish level 100 to complete all ten chapters. |
| `squish.ach.first5` | 5 | Fünferpack | Bunch of five | Verschmilz zum ersten Mal fünf Steine auf einmal (keine Straße). | Merge five tiles at once for the first time (not a straight). |
| `squish.ach.firstStreet` | 5 | Die Straße | The straight | Löse zum ersten Mal eine Straße aus. | Trigger a straight for the first time. |
| `squish.ach.perfectChapter` | 10 | Perfektes Kapitel | Perfect chapter | Hole 3 Sterne auf allen zehn Leveln eines Kapitels (30★, ohne Hilfsmittel). | Earn 3 stars on all ten levels of a chapter (30★, no tools). |
| `squish.ach.endless1000` | 5 | Endlos 1.000 | Endless 1,000 | Erreiche 1.000 Punkte in einer Endlos-Runde. | Score 1,000 points in a single endless run. |
| `squish.ach.endless5000` | 5 | Endlos 5.000 | Endless 5,000 | Erreiche 5.000 Punkte in einer Endlos-Runde. | Score 5,000 points in a single endless run. |

16 Erfolge. Quelle der Wahrheit im Code: `game/game-center.mjs` (`ACHIEVEMENTS`,
`ENDLESS_LEADERBOARD`).

Schon erreichte Dinge (abgeschlossene Kapitel, Tutorial, 3★-Kapitel, gespeicherter
Endlos-Rekord; 5er-Fusion und Straße auch rückwirkend ab Tutorial-Level 4 bzw. 5)
werden nach einer erfolgreichen Anmeldung nachgemeldet.

## App Store Connect einrichten

Diese Schritte macht Sascha im Apple-Developer-Konto; die App gibt keine Käufe
dafür aus.

1. **Apple Developer → Identifiers:** Für die App-ID `de.hoffmann.squishattack`
   die Fähigkeit **Game Center** einschalten (bei automatischer Signierung erledigt
   Xcode das oft selbst). Profil ggf. neu erzeugen.
2. **Xcode:** Target **App → Signing & Capabilities → + Capability → Game Center**.
   Im Repo liegt dazu `app/ios/App/App/App.entitlements` mit
   `com.apple.developer.game-center = true` (steht in den Build-Einstellungen unter
   `CODE_SIGN_ENTITLEMENTS`).
3. **App Store Connect → die App → Services (oder Features) → Game Center:**
   Game Center für die App einschalten.
4. **Bestenliste anlegen:** Typ „Klassisch“, ID genau `squish.lb.endless`,
   Anzeigename und Beschreibung wie in der Tabelle (Deutsch und Englisch),
   Format Ganzzahl, Sortierung höchster Wert zuerst, Gültigkeit „alle Zeiten“.
5. **Erfolge anlegen:** Für jede Zeile der Tabelle einen Erfolg mit genau dieser
   ID, den Punktwert, Titel und Beschreibung in Deutsch und Englisch. Bild: z. B.
   das App-Icon oder ein späteres Motiv (Apple verlangt ein Bild). Erst nach dem
   Anlegen der Bilder lassen sich die Erfolge zur Prüfung einreichen.
6. **App-Version:** In der Version, die in den Store oder zu TestFlight soll,
   Game Center anhaken und diese Bestenliste plus alle 16 Erfolge zuordnen.
7. **Testen:** Gerät oder Simulator in den Einstellungen bei Game Center anmelden.
   Xcode- und TestFlight-Builds nutzen die Sandbox; Punkte dort erscheinen nicht
   in der öffentlichen Bestenliste. In der App: Einstellungen → **Game Center**
   öffnet Apple’s Übersicht. Konsole (Safari-Web-Inspektor):
   `await SquishNative.gameCenter.sync()`, `SquishNative.gameCenter.isSignedIn()`.

## Technik in der App

- Plugin-Registrierung: `npx cap sync ios` trägt `@bavrk/capacitor-game-center`
  in `app/ios/App/CapApp-SPM/Package.swift` ein.
- Start: `app/src/native-boot.mjs` ruft `signIn()` *nach* dem Spielstart auf
  (`void`, ohne das Booten aufzuhalten). Ablehnen → `signedIn: false`, weiterspielen.
  Spätere Anmeldung in den iOS-Einstellungen wird über das `signedIn`-Ereignis
  nachgezogen und löst eine Synchronisierung aus.
- Adapter: `app/src/game-center-adapter.mjs`. Die Spiel-API in
  `game/game-center.mjs` bleibt im Web stumm, bis `registerGameCenter` kommt.
- Brücke: `window.SquishNative.gameCenter` mit `isAvailable`, `isSignedIn`,
  `signIn`, `show`, `submitEndlessScore`, `unlock`, `sync`.
- Auslöser im Spiel (nur App-Hülle, `game/game.mjs`): Level gewonnen (Tutorial,
  Kapitel, Perfekt-Kapitel), 5er-Fusion, Straße, Endlos-Game-Over (Score +
  Meilensteine).

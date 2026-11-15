# Kampagne – Rätselmodus für Squish Attack

Stand: 14.11.2026, Branch `campaign`. Die Spiellogik (`game/game-logic.mjs`,
`game/balance.mjs`, `game/ranked.mjs`) ist **unverändert**; die Server-Prüfung
gewerteter Endlos-Runden bleibt damit gültig.

## 1. Die echten Regeln (Grundlage für alle Level)

- Brett 5×5. Ein Zug schiebt den nächsten Stein der Warteschlange von einem
  Rand in eine Reihe oder Spalte (4 Richtungen × 5 Linien = 20 mögliche Züge).
  Der Stein landet am Rand; alle Steine bis zur ersten Lücke rutschen einen
  Platz weiter. Ist die Linie voll, ist der Zug nicht erlaubt.
- Danach wird „gesettled“, so lange etwas passiert:
  - **Fusion:** 3+ gleiche Werte in einer Linie (inkl. T-/L-Ansatz an inneren
    Steinen) verschmelzen zu einem Stein mit Wert +1, bei 5+ Steinen +2.
  - **Straße** (nur wenn keine Fusion möglich ist): 3+ aufeinanderfolgende Werte
    in einer Linie (z. B. 1-2-3 oder 4-3-2) fallen auf den höchsten zusammen;
    ab Länge 4 gibt es +1.
  - Jede Runde dieser Schleife ist eine Stufe einer **Kettenreaktion**.
- Punkte pro Gruppe: neuer Wert × Anzahl Steine × 10.
- Endlos: Steine kommen zufällig (`balance.mjs`), Spielende bei vollem Brett
  ohne Fusion. Die Kampagne ersetzt nur den Zufall durch eine feste Folge.

„Merge zu 3“ heißt also: einen Stein mit dem Wert 3 durch Fusion/Straße erzeugen.

## 2. Level-Format (JSON)

```json
{
  "id": 17,
  "chapter": 2,
  "kind": "clear",
  "board": [[1, null, 3, null, 2], [null, ...], ...],
  "sequence": [1, 2, 2, 1, 3, 1, 2, 1, 1, 2],
  "moves": 6,
  "goals": [{ "type": "clear", "tiles": 7 }],
  "stars": { "three": 4, "two": 5 },
  "solution": "hbrc",
  "meta": { "minMoves": 3, "slack": 3, "optimalSolutions": 4, "difficulty": 23,
            "winRate": { "random": 0.04, "casual": 0.41, "good": 0.66 }, ... }
}
```

| Feld | Bedeutung |
|---|---|
| `board` | 5×5, `null` = leer, Zahl = Stein |
| `sequence` | feste Steinfolge (Zahlen). Länge = `moves` + 5 Reserve-Steine (für „+Züge“-Hilfsmittel). Die Vorschau zeigt 3 Steine, aber nie über das Zuglimit hinaus. |
| `moves` | Zuglimit |
| `goals` | ein oder mehrere Ziele, **alle** müssen erfüllt sein (UND) |
| `stars` | `three`: höchstens so viele Züge für 3★ (= Optimum des Solvers + 1), `two`: für 2★; gewonnen innerhalb `moves` = 1★ |
| `solution` | vom Solver gefundene optimale Lösung, gleiche Zugcodes wie `ranked.mjs` (`a`–`t` = Richtung × 5 + Linie) |
| `meta` | Solver-Kennzahlen, nur für Balancing/Debug |

Gewonnen ist ein Level, sobald nach einem Zug alle Ziele erfüllt sind.
Verloren: Zuglimit erreicht oder kein Zug mehr möglich (Brett voll).

## 3. Zielarten

Alle passen zu den echten Mechaniken und werden aus den `settle()`-Gruppen
gezählt (`game/campaign.mjs`, `tally()`):

| `type` | Parameter | UI-Text | Gezählt wird |
|---|---|---|---|
| `tile` | `value` | „Erzeuge einen 4er“ | höchster durch Fusion/Straße erzeugter Wert |
| `make` | `value`, `count` | „Erzeuge 3× einen 3er oder höher“ | erzeugte Steine mit Wert ≥ value |
| `clear` | `tiles` | „Löse 8 Steine auf“ | pro Gruppe Steine − 1 (die verschwinden) |
| `street` | `count` | „Bilde 2 Straßen“ | Straßen-Gruppen |
| `score` | `points` | „Erreiche 400 Punkte“ | Punkte wie im Endlosmodus |
| `combo` | `chain` | „Kettenreaktion: 2 Fusionen in einem Zug“ | längste Kette in einem Zug |

**Keine Hindernisse** (Entscheidung Sascha, 14.11.2026): Felsen o. Ä. gibt es
nicht, weder im Format noch im Generator noch in `campaign.mjs`.

## 4. Sterne und Schwierigkeitskurve

Erster Schritt: **25 Level** (`levels/levels-001-025.json`). Generator und Kurve
skalieren über `--count` auf 100 (die Kurve wird dann über 100 Level gestreckt
und die Zielarten werden langsamer eingeführt).

- **Sterne** (Entscheidung Sascha): 3★ = höchstens Optimum + 1 Zug,
  2★ = höchstens 3★-Schwelle + halber Rest bis zum Limit (aufgerundet),
  1★ = gewonnen innerhalb des Limits (`starThresholds(min, limit)`).
  Beispiel Optimum 4, Limit 7: 3★ ≤ 5, 2★ ≤ 6, 1★ ≤ 7.
- **Hilfsmittel deckeln auf 2★** (egal welches). Wer erst mit „+3 Züge“ über
  das Limit hinaus gewinnt, bekommt 1★ (`starsFor(..., {toolsUsed})`).
- Damit alle drei Stufen existieren, ist der Spielraum (Limit − Optimum)
  immer ≥ 3: erstes Fünftel 4–5, bis 45 % der Kampagne 3–4, danach 3.
  Die Schwierigkeit kommt am Ende aus schwereren Rätseln (mehr Planung,
  weniger Lösungen), nicht aus extrem knappen Limits.
- Gesteuert wird über eine **Ziel-Gewinnrate eines Gelegenheitsspielers**
  (Spielermodell, s. u.): Level 1 ≈ 95 % (Tutorial, 1 Zug) bis zum letzten
  Level ≈ 12 %, mit Verschnaufpause nach jedem 10er-Block, etwas schwererem
  Block-Boss (Level 10, 20) und zwei leichteren Leveln, wenn eine neue Zielart kommt.
- Minimalzüge steigen von 1 (Level 1) auf 4–7.
  Ab dem ersten Fünftel darf ein gieriger Spieler (1 Zug Vorausschau) das Level
  nicht mehr schaffen → Planen ist nötig.
- Einführung der Zielarten bei 25 Leveln: `tile` (1), `make` (5), `clear` (9),
  `street` (13), `score` (17), `combo` (21), Doppelziele (23). Bei 100 Leveln:
  1, 7, 13, 19, 25, 31, Doppelziele ab 37.
- Innerhalb eines Abschnitts (zwischen zwei Einführungen) sind die Level nach
  Schwierigkeit sortiert; Einführungs-Level stehen vorn.
- **Kapitel = 10 Level** (Feld `chapter`; 25 Level = Kapitel 1, 2 und halbes 3,
  100 Level = 10 Kapitel).

### Freischalten (umgesetzt in `campaign.mjs`)

- Der Reihe nach: Level n ist frei, wenn n−1 geschafft ist (mind. 1★).
- **Sterne-Schranke am Kapitelanfang:** Für Kapitel k ≥ 2 braucht man
  insgesamt **18 × (k − 1) Sterne**: Kapitel 2 ab 18★, Kapitel 3 ab 36★, …,
  Kapitel 10 ab 162★. Das sind 60 % der bis dahin möglichen Sterne, also Ø 1,8★
  pro Level. Begründung: Mit Hilfsmitteln (max. 2★) ist die Schranke immer
  erreichbar, wer nur knapp gewinnt (1★), muss ein paar Level verbessern;
  da 3★ schon bei Optimum + 1 gibt, sind 2★ im Schnitt gut machbar.
- `lockReason(progress, n)` liefert `{reason:'previous'}` oder
  `{reason:'stars', need, have, chapter}` für die UI; `nextLevel()` für „Weiterspielen“.
- Einmal frei bleibt frei (Bestwerte sinken nie). Werte stehen als Konstanten
  `CHAPTER_SIZE` und `STARS_PER_CHAPTER_GATE` in `campaign.mjs`.

Schwierigkeitswert `meta.difficulty` (0–100, feste Skala, also vergleichbar
zwischen 25er- und 100er-Datei) kombiniert: Minimalzüge, Anteil optimaler
Zugfolgen an allen Folgen (`pOptimal`), Gewinnraten von Zufalls-,
Gelegenheits- und gutem Spieler beim Zuglimit, ob ein gieriger Spieler es
schafft, Anzahl Ziele. `meta.expectedAttempts` = 1 / Gewinnrate des
Gelegenheitsspielers, ohne und mit „+3 Züge“.

## 5. Solver und Generator

- `tools/campaign/solver.mjs` – schichtweise Breitensuche über die Zugtiefe mit
  Transpositionstabelle (Zustand = Brett + gedeckelter Zielfortschritt; die
  Position in der Folge ist die Tiefe). Pfadanzahlen werden beim Zusammenlegen
  addiert, dadurch exakt: Minimalzüge, eine optimale Lösung, Zahl optimaler
  Lösungen, Verzweigung. Bei Überlauf Abbruch oder Beam-Suche (`beam: true`,
  dann als ungenau markiert). Dazu: Zufallsspieler, gieriger Spieler und ein
  Spielermodell mit Können-Regler (`playerModel`, Softmax über 1-Zug-Bewertung).
  Alle Züge laufen durch die echten `insertTile`/`settle`.
- `tools/campaign/candidates.mjs` – Kandidaten aus fester Saat (mulberry32 aus
  `ranked.mjs`), Startbrett ohne Selbstauflösung, Erkennung von Duplikaten
  inkl. Drehung/Spiegelung.
- `tools/campaign/generate.mjs` – bewertet Kandidaten parallel (Worker-Threads),
  wählt 100 Level entlang der Kurve, prüft jede gespeicherte Lösung erneut mit
  der echten Logik und schreibt `levels/levels-001-<count>.json`.
  `node tools/campaign/generate.mjs --count 25 --candidates 3000 --seed 20261114`
  (später `--count 100`, dann ggf. mehr Kandidaten)
  (Pool wird in `tools/campaign/.cache/` zwischengespeichert, `--fresh` erzwingt Neuberechnung).
- `tools/campaign/stats.mjs [--list]` – Übersicht.
- Tests: `node --test tests/*.test.mjs` (bei ≤ 25 Leveln löst der Solver alle neu, bei mehr eine Stichprobe; `FULL=1` erzwingt alle).

## 6. Fortschritt speichern

**Lokal (fertig in `campaign.mjs`):** `localStorage['squish-campaign-v1']` =
`{version:1, levels:{"1":{stars,moves,at}, …}, updatedAt}`. Pro Level bleibt das
beste Ergebnis (mehr Sterne, bei Gleichstand weniger Züge). Freischalten siehe
Abschnitt 4. `mergeProgress()` führt zwei Stände zusammen.

**Backend (später, nicht umgesetzt):**
- Tabelle `campaign_progress(player_id, level_id, stars, moves, solution_log, level_version, updated_at)`,
  Primärschlüssel `(player_id, level_id)`, RLS wie bei den Spielständen.
- Edge Function `campaign-submit`: bekommt `level_id` + Zug-Log, spielt es mit
  derselben `campaign.mjs` + Leveldatei nach (wie `replayRun` für Ranked) und
  speichert nur bessere Ergebnisse. Damit sind Sterne nicht fälschbar.
- Endpunkt zum Laden aller Ergebnisse beim Start; Client merged lokal + Server.
- Leveldatei versionieren (`version`, Hash); bei geänderten Leveln alte
  Ergebnisse behalten, aber ggf. neu bewerten.
- Optional: Sterne-Rangliste / Freunde-Vergleich pro Level.

## 7. Startbildschirm und Menüs

```
Ladebildschirm
   └─ Moduswahl (neu): [Kampagne]  [Endlos]   (+ Einstellungen)
        ├─ Kampagne-Menü (gleicher Look wie heute)
        │    Weiterspielen (nächstes offenes Level) · Levelauswahl (Kapitel, Sterne)
        │    · Fortschritt (Sterne gesamt) · Einstellungen · Zurück
        │    └─ Level: Ziel-Karte → Spiel (Ziele + verbleibende Züge statt Punkte-HUD)
        │         → Gewonnen (Sterne, Nächstes Level) / Verloren (Nochmal)
        └─ Endlos-Menü (das heutige): Neues Spiel (gewertet) · Weiterspielen
             · Mehrspieler/Duell · Bestenliste · Einstellungen · Zurück
```

Die Moduswahl nutzt dieselben „wide“-Buttons aus `world-menu.mjs`. Der
Kampagnen-Spielzustand ist getrennt vom Endlos-Spielstand (`shift3-play-v1`),
Ranked/Duell bleiben exklusiv im Endlosmodus.

UI-Anbindung: `createLevelRun(level)`, `queueOf(run)`, `applyLevelMove(run, dir, line)`
(liefert `settled` für die bestehenden Merge-Effekte), `goalProgress`, `goalText`,
`movesLeft`, `starsOfRun`, `addExtraMoves`, `markToolUsed`, `lockReason`/`isUnlocked`, `nextLevel`, `recordResult`/`saveProgress`.

## 8. Ausblick: Hilfsmittel (Booster)

Jedes Hilfsmittel deckelt das Ergebnis auf 2★ (`markToolUsed(run, typ)`).

Ziel: Schwere Level sind mit **erspielten** Hilfsmitteln in vernünftig vielen
Versuchen schaffbar; Kaufen ist eine Abkürzung, kein Zwang.

Hilfsmittel, die zu den echten Mechaniken passen:

| Hilfsmittel | Wirkung | Modell im Solver |
|---|---|---|
| **+3 Züge** | Zuglimit +3 (nutzt die Reserve-Steine der Folge), auch zum „Weiterspielen“ nach verlorenem Level | `campaign.mjs`: `addExtraMoves(run, 3)`; Solver: `toolEffect(level, {type:'extraMoves', count:3})` – umgesetzt |
| **Rakete** (früher Hammer) | einen Stein entfernen, kein Zug | `useRocket(run, r, c)` – umgesetzt (launch-10); Solver: Zusatzaktion „Feld leeren“ in `expand()`, danach `settle()` |
| **Hinweis** | spielt die nächsten 2 Züge eines kürzesten Gewinnwegs | `hint-solver.mjs` (BFS vom aktuellen Stand) – umgesetzt (launch-10) |
| **Zauberstab** | ein Stein bekommt eine gewählte Zahl, kein Zug | `useWand(run, r, c, wert)` – umgesetzt (launch-10) |
| **Tausch** | nächsten Stein mit dem übernächsten tauschen | Zusatzaktion: Folge an Position d/d+1 tauschen |
| **Wunschstein** | nächster Stein bekommt einen gewählten Wert (1–max) | Zusatzaktion: `sequence[d]` ersetzen |
| **Überspringen** | nächsten Stein verwerfen (ans Ende der Folge) | Zusatzaktion: Index +1 ohne Zug |
| **Rückgängig** | letzten Zug zurücknehmen | kein Solver-Effekt, wirkt nur auf Spielfehler (Spielermodell) |

So wird der Solver erweitert: ein Hilfsmittel = zusätzliche Aktionsart in
`expand()`, ein Zähler „Hilfsmittel übrig“ wird Teil des Zustandsschlüssels.
Damit lässt sich messen, wie viele Züge ein Hilfsmittel spart (Minimalzüge
mit/ohne), und mit `playerModel` die Gewinnrate bei nicht perfektem Spiel
schätzen → erwartete Versuche = 1 / Gewinnrate. Balancing-Regel als Vorschlag:
Für jedes Level soll gelten: erwartete Versuche ohne Hilfsmittel ≤ ~15, mit
einem erspielbaren Hilfsmittel ≤ ~5. Der Generator kann Level, die das
verletzen, verwerfen oder ihr Zuglimit anpassen.

### Level 20–25 mit geschenkten Hilfsmitteln

Ziel laut Sascha: Level 25 klar lösbar, aber nur mit echtem Planen, evtl. mit
einem oder zwei Hilfsmitteln, die man unterwegs gratis bekommen hat. Vorschlag:

- **Geschenke unterwegs:** 1× „+3 Züge“ nach Level 10 (Kapitel 1 geschafft),
  1× „Rakete“ nach Level 20, dazu 1 Hilfsmittel für je 10 gesammelte Sterne
  (seit launch-10 zusätzlich Hinweis nach Level 3 und Zauberstab nach Level 6).
  Wer bis Level 20 ordentlich spielt, hat 2–4 Stück.
- **Wirkung laut Spielermodell** (`meta.expectedAttempts`, Gelegenheitsspieler):
  Level 20–25 brauchen ohne Hilfsmittel ca. 2,5–8 Versuche, mit „+3 Züge“ ca.
  1,2–3,5. Level 25: ca. 8 Versuche ohne, ca. 3 mit „+3 Züge“.
- Die Rakete hilft vor allem bei Straßen- und Doppelziel-Leveln (23–25), wenn
  ein einzelner falscher Stein eine Linie blockiert.
- Mit Hilfsmittel gibt es höchstens 2★ – die Kapitel-Schranke (Ø 1,8★) bleibt
  damit erreichbar, 3★ bleibt das Ziel für Knobler.
- Kaufen bleibt Abkürzung: Kein Level der ersten 25 braucht im Modell mehr als
  ~8 Versuche ohne Hilfsmittel.

Hinweis: Das Spielermodell ist eine grobe Heuristik und muss mit echten
Spieldaten (Versuche pro Level) nachkalibriert werden.

## UI (launch-3)

- **Startbildschirm** (3D-Gel-Menü): Kampagne · Endlos · Einstellungen. Der gewählte Modus wird in `localStorage['squish-mode-v1']` gemerkt; beim nächsten Öffnen startet das Menü direkt im zuletzt gewählten Modus, „Zurück“ führt zum Startbildschirm. Erstbesucher sehen den Startbildschirm.
- **Endlos**: unverändert (Neues Spiel, Weiterspielen, Mehrspieler, Bestenliste) plus „Zurück“. Endlos-Spielstand (`shift3-play-v1`) und gewertete Runden bleiben unberührt; während der Kampagne wird nichts davon gespeichert oder eingereicht.
- **Kampagne**: „Level N spielen“ (nächstes offenes Level), Levelauswahl (DOM-Dialog, Kapitel à 10, Sterne pro Level, Schloss + Grund, Sterne-Tor pro Kapitel, Gesamtsterne).
- **Spielansicht**: gleiches Brett/Rendering; Zielkarte mit Fortschritt, Zug-Zähler, Vorschau aus der festen Steinfolge, Hilfsmittel-Leiste (+3 Züge, Hinweis, Rakete, Zauberstab – seit launch-10). Pause-Menü hat „Zum Menü“ und „Level neu starten“.
- **Ergebnis**: Sterne, Nächstes Level / Nochmal / Zum Menü; bei Niederlage durch Zugende „+3 Züge einsetzen“, wenn vorhanden.
- **Hilfsmittel** (`squish-campaign-tools-v1`, nur Geschenke, keine Käufe): siehe „Hilfsmittel (launch-10)“ unten. Jedes Hilfsmittel deckelt das Level auf 2 ★.
- Fortschritt: `squish-campaign-v1` (campaign.mjs). Kein Backend.

## UI (launch-4, Herbst-Design)

- **Ein Startbildschirm** (2D, `home-menu.mjs` + `autumn-ui.css`): Logo über dunklem Herbst-Hintergrund mit fallenden Blättern, Knöpfe **Abenteuer** (= Kampagne), **Endlos**, **2 Spieler** (das bestehende Online-Duell per Code), Zahnrad unten rechts für die Einstellungen (Ton, Handybewegung, Vibration, Build). Nach dem Laden kommt immer der Startbildschirm; „Zum Menü“ aus einem Spiel führt ins Menü des gespielten Modus.
- **Modus-Menüs** im selben Stil: Abenteuer (Sterne-Karte, Hilfsmittel-Bestand, Level N spielen, Levelauswahl, Zurück), Endlos (Rekord, Weiterspielen/Neues Spiel, Bestenliste, Zurück).
- Außerhalb des aktiven Spiels kein 3D mehr: Das alte Glastisch-Menü (`world-menu.mjs`) ist entfernt, die 3D-Szene pausiert im Menü.
- **Sieg**: erst ca. 1,2 s Konfetti über dem Brett (`confetti.mjs`), dann der Dialog (Band „Level geschafft!“/„Perfekt!“, Weiter / Menü / Nochmal, rotes X = Menü); die verdienten Sterne ploppen nacheinander (≈360 ms Abstand) mit Glanz, unverdiente bleiben als leere Plätze. Ablauf-Protokoll für Tests: `SquishGame.campaign.timeline`.
- Niederlage und Pause im selben Stil („+3 Züge“ als Hauptknopf, wenn möglich; sonst „Nochmal“).
- Schriften lokal: Lilita One (unverändert, OFL) und Fredoka (Subset, OFL), Lizenzen in `game/assets/fonts/`.
- `prefers-reduced-motion`: keine fallenden Blätter/Wackel-Animationen, kürzeres Konfetti, Sterne blenden nur ein.

## UI (launch-5, Comic-Look nach Menü-Mockup)
- `game/comic-ui.css` (nach `autumn-ui.css` geladen): Pillen-Knöpfe mit gemessenen Mockup-Farben (grün/orange/blau/lila),
  dünner dunkler Kontur, dunkler Unterlippe, feiner Lichtkante oben (dezenter Glanz), weichem Farbschein; weiße Symbole mit Kontur.
- Schrift: Fredoka Bold als statische Instanz `assets/fonts/fredoka-bold.woff2` (aus der OFL-Variable-Font erzeugt, kein Reserved Font Name).
- Startbildschirm: Kopfleiste (★ Sterne, 🏆 Endlos-Rekord, Zahnrad oben rechts wie im Mockup), Abenteuer / Endlos / 2 Spieler,
  Kacheln Levels / Bestenliste / Regeln (alle mit echter Funktion; kein Shop, keine Münzen). Neuer Bildschirm „Spielregeln“.
- Spiel-HUD: Ziel- und Züge-Karte als dunkle Navy-Panels mit Goldrand, Punkte-Box im Abenteuer ausgeblendet,
  Werkzeuge als Kacheln mit Zähler-Badge, Pause als blaue Kachel, Hinweis-Toast im gleichen Stil. Brett/Steine unverändert.
- E2E offline: `node e2e-redesign.mjs <url> iphone <shots> --offline` blockiert alle Backend-Schreibzugriffe.

## Squish-Stil C im Spiel (launch-6, Comic)
- `game/comic-style.mjs`: alle Squish-Körper (Brett, Vorschau, Rekord-Stein, Fusions-Ballon) mit flachem Zweiton-Cel-Shading,
  dicker dunkler Kontur (invertierte Hülle auf derselben CPU-verformten Geometrie, konstante Weltdicke), hartem weißem Glanzfleck + Punkt;
  Ziffern weiß mit dunkler Kontur (Coverage-Dilatation in `crisp-labels.mjs`). Geometrie, Federn und Animationen unverändert.
- Ballon-Merge bleibt: Kontur bläst sich mit auf, Glanzfleck wird beim Aufblasen größer; Pop = Comic-Stern + Ring + Funkel-Stern,
  Hautfetzen als Zweiton mit Tinten-Rissrand, Tropfen mit Tintenrand (`fusion.mjs`). Hammer lässt den Stein genauso platzen.
- 2D-Effektschicht (`vfx-flipbooks.mjs`): vorgerenderte Gel-Sprites werden posterisiert (zwei Töne, Tintenkontur); weiche Lichtkugeln werden Comic-Sterne.
- Renderer: Bloom/HDR-Ziel, Gel-Maske und Lichtbrechungs-Pass entfallen; Szene direkt in den (MSAA-)Canvas.
  `render-quality.mjs`: iPhone volle 3× (Minimum 2×), Absenkung nur bei anhaltender Last (gerenderte Frames > 28 ms über ~2 s, nicht während Bewegung);
  nach einem Kontextverlust in der Sitzung eine Stufe niedriger. Test: `tests/render-quality.test.mjs`.
- Glasplatte (Reflexionen, Rahmen) unverändert.

## Nachwackeln statt Ruhe-Wackeln (launch-8)
- Das Dauer-Atmen aus launch-7 ist wieder entfernt: ein ruhendes Brett zeichnet nicht mehr neu (0 fps).
- Stattdessen klingt das vorhandene Gel-Wackeln nach jeder Bewegung (Schieben, Landen/Einfallen, Anstupsen durch Nachbarn,
  Merge-Ergebnis, Kettenreaktion, Hammer-Nachbarn) ~1,75x länger aus, gleiche Frequenz, pro Stein leicht unterschiedlich
  (`wobbleDecayFactor` in `game/gel-softness.mjs`); Loslass-/Wisch-Federn etwas weniger gedämpft.
- Gezeichnet wird, bis die Amplitude < 0,012 ist (vorher 0,045), damit kein leicht schiefer Endzustand stehen bleibt.
- Der Hammer stupst die direkten Nachbarn an. `prefers-reduced-motion`: kein Wackeln.
- Fix aus launch-7 bleibt: im Bewegung-reduzieren-Modus sind Steine/Vorschau sichtbar und neue Steine liegen auf dem Brett.

## Sterne-Sound (launch-9)
- Im Gewinn-Dialog spielt jeder Stern jetzt den weichen Schiebe-Sound der Squishes (Sample `cup`, `sound.play('star',n)`)
  statt des Ballon-Knalls; Tonhöhe steigt pro Stern (Rate 1 / 1,12 / 1,26), weiter synchron zur gestaffelten Stern-Animation.
- Stumm/Sound-aus und `?nosound=1` gelten wie für alle Sounds. Haptik unverändert.

## Hilfsmittel (launch-10): Rakete, Hinweis, Zauberstab

Werkzeugleiste im Level: **+3 Züge · Hinweis | Vorschau | Rakete · Zauber** (je zwei
Kacheln links/rechts der schmaleren Vorschau, passt auf 375 und 390 px). Icons sind
eigene SVGs im Comic-Stil (`tool-icons.mjs`), keine Emoji. Jedes Hilfsmittel deckelt
das Level auf **höchstens 2 ★**. Nur Geschenke, keine Käufe.

- **Rakete** (ersetzt den Hammer überall): Kachel antippen → Stein antippen. Eine
  Comic-Rakete fliegt mit Rauchspur von der Kachel zum Stein, dann **BOOM**
  (Explosionsstern, Funken, leichtes Bildschirmwackeln, Vibration, Sound). Der Stein
  verschwindet, die Nachbarn wackeln nach. Kein Zug, keine Schwerkraft – wie der
  alte Hammer (`useRocket`).
- **Hinweis**: sucht vom **aktuellen** Stand (Brett, Steinfolge, Ziel-Fortschritt,
  übrige Züge) den kürzesten Gewinnweg (`hint-solver.mjs`, BFS mit
  Zustandstabelle, im Web Worker `hint-worker.mjs`; Budget 160 000 Zustände /
  2,5 s, danach Strahlsuche, Notfall ohne Worker 0,9 s). Spielt dann die ersten
  **2 Züge** automatisch (1 Zug, wenn der Sieg nur noch 1 Zug entfernt ist), vor
  jedem Zug ein goldenes Band mit Pfeil an der Einschubseite. Die Züge zählen
  normal. **Kein Weg** → Meldung „Kein Weg mehr zum Ziel – probier Neustart“, der
  Hinweis wird **nicht** verbraucht und deckelt nichts. Level 1–25 vom Start:
  Hinweis-Länge = Solver-Minimum, jeweils < 0,3 s (Node).
- **Zauberstab**: Kachel antippen → Stein antippen → Comic-Auswahl mit
  Zahl-Pillen in Squish-Farben (Abbrechen/Esc/Tippen daneben bricht ab, nichts
  verbraucht). Wahl: **1 bis einschließlich Levelziel** (kleinster Wert der
  „Erzeuge“-Ziele, z. B. auch der 2er in Level 5/8; Entscheidung Sascha nach
  launch-10-Test; ohne solches Ziel bis zum höchsten Wert auf Brett/Vorschau,
  mind. 2), **nicht** die aktuelle Zahl und **keine** Zahl, die das Level sofort
  gewinnen würde. Danach gelten die normalen Regeln: entsteht eine Dreierreihe,
  wird fusioniert (zählt für Ziele und Punkte). Kein Zug. Gibt es keine passende
  Zahl, kommt ein Hinweis und nichts wird verbraucht.
- **Sperren**: Während Hinweis/Rakete läuft, sind Wischen und Leiste gesperrt.
  `prefers-reduced-motion`: keine Flugbahn, kein Wackeln, nur kurze Einblendung.
  Ton aus / `?nosound`: keine Sounds.
- **Geschenke** (`grantGifts`, je einmal): Hinweis nach Level 3, Zauberstab nach
  Level 6, +3 Züge nach Level 10, Rakete nach Level 20; dazu je 10 Sterne ein
  Hilfsmittel im Wechsel +3 Züge → Rakete → Hinweis → Zauberstab.
- **Spielstand**: `squish-campaign-tools-v1` jetzt `version: 2`
  (`extraMoves, rocket, hint, wand, gifts`); alte Stände (v1) werden beim Laden
  übernommen, Hammer-Anzahl → Raketen.

## Test-Einstellung (launch-11, temporär): je Level 1× jedes Hilfsmittel, kein Vorrat

Wunsch Sascha („Mach mir erstmal in jedes Level eines von jedem Werkzeug rein“,
dann „Vorrat machen wir raus“):

- Jeder Level-Versuch – auch Neustart, „Nochmal“ und „Weiter“ – hat genau
  **1× +3 Züge, 1× Hinweis, 1× Rakete, 1× Zauberstab**. Die Knöpfe zeigen 1 oder 0.
  Nichts wird gespeichert oder ins nächste Level/den nächsten Versuch übertragen.
- **Kein Vorrat:** Der gespeicherte Vorrat (`squish-campaign-tools-v1`) wird weder
  angeboten noch verändert, die Abenteuer-Karte zeigt keine Vorrats-Chips.
- **Keine Geschenke:** Level-Geschenke (3/6/10/20) und „je 10 Sterne ein
  Hilfsmittel“ sind ausgeschaltet (Code bleibt, siehe oben).
- Unverändert: Wer ein Hilfsmittel benutzt, bekommt höchstens 2 ★; „+3 Züge“
  erscheint nach verlorenem Level im Ergebnis-Dialog, solange die Ladung des
  Versuchs noch da ist.
- **Schalter** in `game/campaign.mjs`:
  `FREE_TOOLS_PER_LEVEL = 1` (Ladungen pro Versuch) und `TOOL_STOCK = false`
  (Vorrat + Geschenke + Chips). Altes Verhalten (launch-10): `FREE_TOOLS_PER_LEVEL = 0`,
  `TOOL_STOCK = true`. Beides an geht auch (erst Gratis-Ladung, dann Vorrat).

## Shop, Vorrat und Geschenk-Blase (launch-12)

Wunsch Sascha: grünes Plus an leeren Werkzeugen → Shop; Geschenke bleiben (wie
bisher verteilt), lassen sich aber antippen und kommen in einer Blase hoch.

- **Ladungen + Vorrat:** Die 1 Gratis-Ladung je Werkzeug und Level-Versuch
  (launch-11) bleibt und wird **zuerst** verbraucht. Dazu gibt es wieder den
  gespeicherten **Vorrat** (`TOOL_STOCK = true`), den nur Geschenke und Shop-Käufe
  füllen. Die Kacheln zeigen die Summe (Gratis + Vorrat). Jedes Werkzeug –
  gratis, geschenkt oder gekauft – deckelt das Level auf höchstens 2 ★.
- **Grünes Plus:** Ist ein Werkzeug auf 0, zeigt seine Kachel statt der Zahl ein
  kleines grünes Comic-Plus; Antippen öffnet den Shop direkt bei diesem Werkzeug.
- **Shop** (`shop-ui.mjs`, Stil `store.css`): Comic-Panel in Navy/Gold mit
  Fredoka, dicken Konturen und Pillen-Knöpfen. Pro Werkzeug 1×/3×/5×, dazu die
  „Werkzeugkiste“ (je 2× alle vier). Erreichbar über das grüne Plus und über den
  gelben „Shop“-Knopf in der Abenteuer-Karte (neben „Geschenk“, wenn eins offen ist).
  Esc, ✕ oder Tippen daneben schließt. Unten der Hinweis zur 2-★-Grenze.
- **Preise (Platzhalter) – eine Tabelle** in `game/shop.mjs` → `SHOP_CONFIG`:
  `packs: [[1, 0.99], [3, 2.49], [5, 3.99]]` (für jedes Werkzeug gleich),
  `bundles: [{ id: 'bundle-mix', title: 'Werkzeugkiste', items: je 2×, price: 4.99 }]`.
  Produkt-ids: `<werkzeug>-<anzahl>` (z. B. `rocket-3`) und `bundle-mix` – später
  die ids im App-Store.
- **Testkauf-Schalter:** `SHOP_CONFIG.testPurchases = true` → im Web ist jeder
  Kauf ein deutlich markierter **„Testkauf – keine Bezahlung“**: Er legt nur in den
  lokalen Vorrat. Kein Zahlungsanbieter, kein Backend, kein Geld.
  `testPurchases = false` ohne nativen Store → „Käufe sind hier noch nicht
  verfügbar“. `SHOP_CONFIG.enabled = false` blendet Shop und Plus aus.
- **Schnittstelle für echte In-App-Käufe (später):**
  `registerNativeStore({ name, purchase(product) })` aus `shop.mjs`, z. B. aus der
  Capacitor-Brücke (StoreKit / Play Billing). `purchase` liefert erst nach
  bestätigter Zahlung `{ ok: true, transactionId }`; `purchase(productId)` gibt
  dann `{ ok, items, test:false, transactionId }` zurück und das Spiel legt `items`
  in den Vorrat (`addToStock`). Ein angemeldeter nativer Store hat Vorrang vor dem
  Testkauf.
- **Geschenke:** Verteilung unverändert (Level 3 Hinweis, 6 Zauberstab, 10 +3 Züge,
  20 Rakete, je 10 Sterne eins im Wechsel). Neu: Sie werden **nicht sofort**
  gutgeschrieben, sondern als offene Pakete gespeichert (`inventory.pending`,
  `queueGifts`) und bleiben, bis man sie einsammelt. Antippbar im Ergebnis-Dialog
  („Geschenk: Hinweis – öffnen!“) und in der Abenteuer-Karte („Geschenk“ mit Anzahl).
- **Geschenk-Blase** (`gift-fx.mjs`): Paket hüpft, Deckel fliegt weg, der Inhalt
  steigt in einer Comic-Seifenblase hoch (Regenbogen-Rand, Glanzbogen, sanftes
  Schweben/Wabbeln). Antippen → Blase platzt („PLOPP!“, Tropfen, Plopp-Sound,
  Vibration), das Werkzeug fliegt in die Leiste bzw. auf seinen Chip und wird
  gutgeschrieben (`collectGift`). Reduzierte Bewegung: nur Ein-/Ausblenden.
  Ton aus: kein Sound.
- **Spielstand** `squish-campaign-tools-v1` jetzt `version: 3`
  (`extraMoves, rocket, hint, wand, gifts, pending`); ältere Stände werden übernommen.

## Testphase: Werkzeuge per Dummy-Werbung + Werkzeug-Protokoll (launch-13, temporär)

Ziel: sehen, wie viele Hilfsmittel beim echten Spielen wann und wo gebraucht werden.

- **Vorrat einmalig geleert:** Beim ersten Laden von launch-13 werden alle Hilfsmittel
  auf 0 gesetzt und offene Geschenke verworfen (`resetStockOnce`, Merker
  `squish-campaign-tools-reset = launch-13`). Bereits vergebene Geschenk-ids bleiben
  gespeichert, damit später nichts doppelt verschenkt wird. Danach geholte Werkzeuge
  bleiben erhalten.
- **Keine Gratis-Ladungen:** `FREE_TOOLS_PER_LEVEL = 0`; jedes Level startet mit 0.
- **Werbung statt Shop:** Ist ein Hilfsmittel leer, zeigt die Kachel das grüne Plus;
  Antippen öffnet den Comic-Dialog „Werbeclip (Dummy)“. „Ansehen“ gibt **sofort**
  1 Stück (kein Video, kein Warten, kein Netz), „Nein danke“ gibt nichts.
  Leiste: das Stück liegt danach in der Kachel und wird per Tipp eingesetzt.
  Ergebnis-Dialog nach Niederlage durch Zugmangel: „+3 Züge · Werbung“ → nach
  „Ansehen“ wird +3 direkt eingesetzt (man wollte ja weiterspielen).
- **Shop versteckt:** `SHOP_CONFIG.enabled = false` (Plus führt zur Werbung, der
  Shop-Knopf in der Karte ist weg). Grund: Testkäufe würden das Protokoll verfälschen.
- **Geschenke aus:** `TOOL_GIFTS = false` (keine Level-/Sterne-Geschenke).
- **Sterne:** unverändert, mit Hilfsmittel höchstens 2 ★.
- **Werkzeug-Protokoll** (`game/tool-log.mjs`, nur `localStorage`
  `squish-tool-log-v1`, nie ans Backend):
  - je Level-Versuch: Level, Versuch-Nr. (pro Level), Start/Ende, Ausgang
    (`won` / `lost` / `quit`), Züge, Zuglimit, Sterne, Niederlagengrund, eingesetzte
    Werkzeuge, Anzahl Werbung. Nochmal/Neustart/nächstes Level = neuer Versuch;
    Menü oder geschlossene Seite = `quit`. „+3“ nach Niederlage öffnet den Versuch
    wieder (`reopened`).
  - je Ereignis (`ad` = Werbung angesehen, `use` = eingesetzt): Zeit, Werkzeug, Level,
    Versuch, Zug-Nr., Restzüge, Zielfortschritt (je Ziel current/target, Stand vor dem
    Einsatz), Ort (`level` / `result`) und der Ausgang des Versuchs (wird beim Ende
    nachgetragen).
  - Begrenzung: 4000 Ereignisse, 3000 Versuche (älteste fallen raus).
- **Einstellungen → „Werkzeug-Statistik“:** Comic-Übersicht mit Summen (Versuche,
  Siege, Einsätze, Werbung), je Werkzeug, und Tabelle je Level (Versuche, Siege,
  Einsätze je Werkzeug, ▶ = per Werbung). „Exportieren“ kopiert das JSON
  (Zusammenfassung + Rohprotokoll) in die Zwischenablage und bietet Teilen
  (iPhone-Teilen-Blatt mit Datei) bzw. Download an. „Zurücksetzen“ fragt einmal nach
  („Wirklich löschen?“).
- **Zurück zum Stand launch-12** (nach der Testphase):
  `FREE_TOOLS_PER_LEVEL = 1` (oder 0 für reinen Vorrat), `AD_TOOLS = false`,
  `TOOL_GIFTS = true`, `TOOL_STOCK_RESET = null` in `game/campaign.mjs`;
  `SHOP_CONFIG.enabled = true` in `game/shop.mjs`. Protokoll und Statistik können
  bleiben oder mit dem Knopf in den Einstellungen entfernt werden.

## Level-Geschenke wieder an, Sterne-Geschenke entfernt (launch-14, temporär)

- `TOOL_GIFTS = true`: nur die Level-Geschenke (`LEVEL_GIFTS`): Hinweis nach Level 3, Zauberstab nach 6, +3 Züge nach 10, Rakete nach 20 – wie gehabt als antippbare Geschenk-Blase.
- Die Sterne-Geschenke („1 Werkzeug je 10 gesammelte Sterne“) sind komplett entfernt (`STARS_PER_GIFT`/`STAR_GIFT_ROTATION` gelöscht). `loadInventory` verwirft noch offene `stars-…`-Geschenke.
- Unverändert: Vorrat-Reset einmalig (`TOOL_STOCK_RESET = 'launch-13'`, kein zweiter Reset), keine Gratis-Ladungen (`FREE_TOOLS_PER_LEVEL = 0`), Dummy-Werbung (`AD_TOOLS = true`), Shop versteckt.
- Einmaliger Abenteuer-Reset (Saschas Entscheidung, `resetCampaignOnce`, Merker `squish-campaign-progress-reset = 'launch-14'`): beim ersten Laden von launch-14 werden auf jedem Gerät der Abenteuer-Fortschritt (freigeschaltete Level, Sterne, beste Züge, damit auch die Kapitel-Sperren) sowie vergebene und offene Geschenke gelöscht. So kommen die Level-Geschenke 3/6/10/20 beim Nachspielen wieder. Nicht angefasst: Anzahl im Werkzeug-Vorrat, Endlos-Spielstand, Highscores, Rangliste, Duell, Einstellungen, Werkzeug-Protokoll. Kein zweiter Reset nach Neuladen. Der Fortschritt liegt nur lokal (`squish-campaign-v1`), es gibt keinen Server-Abgleich, der ihn zurückholen könnte.
- Werkzeug-Protokoll: Geschenke werden als `kind: 'gift'`, `source: 'gift'` mit `giftId` und dem Level des Geschenks protokolliert; Werbung hat `source: 'ad'`. `summarize` zählt `gifts` je Werkzeug und Level, die Statistik zeigt eine Kachel „Geschenke“ und 🎁 je Zelle.
- Zurück zu launch-13: `TOOL_GIFTS = false`, `CAMPAIGN_RESET = null` (ein schon erfolgter Reset lässt sich nicht rückgängig machen).

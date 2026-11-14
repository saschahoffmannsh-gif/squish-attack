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
| **Hammer** | einen Stein entfernen, kein Zug | Zusatzaktion „Feld leeren“ in `expand()`, danach `settle()` |
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
  1× „Hammer“ nach Level 20, dazu 1 Hilfsmittel für je 10 gesammelte Sterne.
  Wer bis Level 20 ordentlich spielt, hat 2–4 Stück.
- **Wirkung laut Spielermodell** (`meta.expectedAttempts`, Gelegenheitsspieler):
  Level 20–25 brauchen ohne Hilfsmittel ca. 2,5–8 Versuche, mit „+3 Züge“ ca.
  1,2–3,5. Level 25: ca. 8 Versuche ohne, ca. 3 mit „+3 Züge“.
- Der Hammer hilft vor allem bei Straßen- und Doppelziel-Leveln (23–25), wenn
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
- **Spielansicht**: gleiches Brett/Rendering; Zielkarte mit Fortschritt, Zug-Zähler, Vorschau aus der festen Steinfolge, Hilfsmittel-Leiste (+3 Züge, Hammer). Pause-Menü hat „Zum Menü“ und „Level neu starten“.
- **Ergebnis**: Sterne, Nächstes Level / Nochmal / Zum Menü; bei Niederlage durch Zugende „+3 Züge einsetzen“, wenn vorhanden.
- **Hilfsmittel** (`squish-campaign-tools-v1`, nur Geschenke, keine Käufe): +3 Züge nach Level 10, Hammer nach Level 20, je 10 Sterne ein Hilfsmittel (abwechselnd +3 Züge und Hammer). Jedes Hilfsmittel deckelt das Level auf 2 ★.
- Fortschritt: `squish-campaign-v1` (campaign.mjs). Kein Backend.

## UI (launch-4, Herbst-Design)

- **Ein Startbildschirm** (2D, `home-menu.mjs` + `autumn-ui.css`): Logo über dunklem Herbst-Hintergrund mit fallenden Blättern, Knöpfe **Abenteuer** (= Kampagne), **Endlos**, **2 Spieler** (das bestehende Online-Duell per Code), Zahnrad unten rechts für die Einstellungen (Ton, Handybewegung, Vibration, Build). Nach dem Laden kommt immer der Startbildschirm; „Zum Menü“ aus einem Spiel führt ins Menü des gespielten Modus.
- **Modus-Menüs** im selben Stil: Abenteuer (Sterne-Karte, Hilfsmittel-Bestand, Level N spielen, Levelauswahl, Zurück), Endlos (Rekord, Weiterspielen/Neues Spiel, Bestenliste, Zurück).
- Außerhalb des aktiven Spiels kein 3D mehr: Das alte Glastisch-Menü (`world-menu.mjs`) ist entfernt, die 3D-Szene pausiert im Menü.
- **Sieg**: erst ca. 1,2 s Konfetti über dem Brett (`confetti.mjs`), dann der Dialog (Band „Level geschafft!“/„Perfekt!“, Weiter / Menü / Nochmal, rotes X = Menü); die verdienten Sterne ploppen nacheinander (≈360 ms Abstand) mit Glanz, unverdiente bleiben als leere Plätze. Ablauf-Protokoll für Tests: `SquishGame.campaign.timeline`.
- Niederlage und Pause im selben Stil („+3 Züge“ als Hauptknopf, wenn möglich; sonst „Nochmal“).
- Schriften lokal: Lilita One (unverändert, OFL) und Fredoka (Subset, OFL), Lizenzen in `game/assets/fonts/`.
- `prefers-reduced-motion`: keine fallenden Blätter/Wackel-Animationen, kürzeres Konfetti, Sterne blenden nur ein.

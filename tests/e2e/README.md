# Browser-/Live-Checks

Laufen aus `/workspace/squish-e2e/campaign` (dort liegen `lib.mjs` und puppeteer-core). Kopien zur Nachvollziehbarkeit:

- `e2e-sync19.mjs`: Cloud-Abgleich des Fortschritts (online als Attrappe, Netzfehler, offline), iPhone 390×844 und `--small` 375×667
- `live-check19.mjs`: Live-Check nach dem Release (Build, ?v, Level, Testseite, Endlos + Reload, 0 fps, reduzierte Bewegung, keine JS-Fehler)
- `api-check19.mjs`: Live-API der Edge Function (alte Routen, CORS, /progress-Rundreise, sq_progress nicht öffentlich)
- `live-check21.mjs`: Live-Check launch-21 (Bestenliste entfernt)
- `live-check22.mjs`: Live-Check launch-22 (Tutorials L1–5, Sperre Endlos/2 Spieler, Abenteuer-Reset bei behaltenem Endlos-Stand, Geisterfinger, Freischalten, 0 fps, reduzierte Bewegung). Backend-Schreibzugriffe blockiert, kein api-check.

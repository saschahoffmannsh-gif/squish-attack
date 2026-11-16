# Squish Attack

Merge-Puzzle für das iPhone (Hochformat), live auf GitHub Pages:
https://saschahoffmannsh-gif.github.io/squish-attack/

- `game/`: das Spiel (ES-Module ohne Build-Schritt, alle Assets lokal)
- `levels/`: Abenteuer-Level (`levels-001-100.json`) und Testseite (`levels-lab.json`)
- `squish/`: Grafik-Bundle und Texturen
- `tests/`: Unit-Tests, `node --test tests/*.test.mjs`
- `tools/campaign/`: Level-Generator, Solver und Auswertung
- `docs/`: Kampagne (`kampagne.md`), Level-Übersicht (`levels-100.md`), App-Hülle (`app-shell.md`)

Das Backend (Supabase-Projekt `tzkgqwvldlfbswdvyqgy`: Edge Function `squish` und `sq_*`-Tabellen)
liegt in einem eigenen Repo (`squish-backend`). Der Client spricht es über `game/config.js` an.
Dort stehen nur öffentliche Werte (Publishable Key, Bundle-Token), keine Geheimnisse.

Release: Arbeit auf `campaign`, dann `main` vorspulen (Fast-Forward). GitHub Pages baut aus
`main`. Jede Version heißt `launch-N` (`game/build.txt`, `?v=launch-N` an allen Modulen).

// Werbe-Takt. Reine Logik, kein DOM, kein Netz – im Browser ohne Werbe-Adapter ungenutzt,
// in der App-Hülle mit AdMob verbunden.
// - Abenteuer: nach jedem 10. gewonnenen Level (launch-28; vorher 5.) ist eine Zwischenwerbung fällig. Sie wird erst
//   beim Start des nächsten Levels gezeigt (nie mitten in einem Level, nie über dem Sterne-Dialog).
// - Endlos: nach je 15 Minuten (launch-32; vorher 10) aktiver Spielzeit eine kurze Zwischenwerbung ohne Belohnung
//   (launch-29: Endlos hat keine Werkzeuge), direkt nach einem Zug, wenn alles ruhig ist.
//   Lange Pausen zwischen zwei Zügen zählen nur bis MAX_GAP_MS (Pause/Menü/Hintergrund zählt nicht).
//   Werbefrei (`isAdFree`) unterdrückt Zwischenwerbung und Endlos-Werbung, nicht den Hilfsmittel-Takt.
export const AD_PACING = Object.freeze({
  interstitialEvery: 10,          // jedes 10. gewonnene Abenteuer-Level (launch-28; launch-26: 5)
  endlessOfferMs: 15 * 60 * 1000, // launch-32: 15 Minuten aktive Endlos-Spielzeit (vorher 10)
  maxGapMs: 30 * 1000,            // mehr zählt zwischen zwei Zügen nicht
});
const KEY = 'preview-goal-squish-ad-pacing-v1';

export function createAdPacing({ storage = globalThis.localStorage, config = AD_PACING, now = () => Date.now(), isAdFree = () => false } = {}) {
  const free = () => { try { return !!isAdFree(); } catch { return false; } };
  let state = { wins: 0, due: false, reward: 0 };
  try { const s = JSON.parse(storage?.getItem(KEY) || 'null'); if (s && Number.isInteger(s.wins)) state = { wins: Math.max(0, s.wins), due: !!s.due, reward: Number.isInteger(s.reward) && s.reward >= 0 ? s.reward : 0 }; } catch {}
  const save = () => { try { storage?.setItem(KEY, JSON.stringify(state)); } catch {} };
  let endlessMs = 0, lastMove = null;
  return {
    /** Ein Abenteuer-Level wurde gewonnen (nicht für Test-Level aufrufen). → true, wenn jetzt eine Zwischenwerbung fällig wird. */
    levelWon() {
      state.wins++;
      // Werbefrei: Siege zählen weiter, aber es wird keine Zwischenwerbung fällig.
      if (!free() && state.wins % config.interstitialEvery === 0) state.due = true;
      save(); return !free() && state.due;
    },
    get interstitialDue() { return !free() && state.due; },
    /** Vor dem Start eines Levels: true = jetzt zeigen (und Merker löschen). */
    takeInterstitial() {
      if (free()) { if (state.due) { state.due = false; save(); } return false; }
      if (!state.due) return false; state.due = false; save(); return true;
    },
    get wins() { return state.wins; },
    /** Endlos: nach jedem fertigen Zug aufrufen. → true, wenn das Angebot jetzt gezeigt werden darf. */
    endlessMove() {
      if (free()) { lastMove = null; return false; }
      const t = now();
      if (lastMove != null) endlessMs += Math.min(Math.max(0, t - lastMove), config.maxGapMs);
      lastMove = t;
      return endlessMs >= config.endlessOfferMs;
    },
    /** Endlos pausiert (Pause, Menü, Hintergrund): die Lücke bis zum nächsten Zug zählt nicht. */
    endlessPause() { lastMove = null; },
    /** Angebot wurde gezeigt (angesehen oder weggedrückt): Uhr neu starten. */
    endlessOffered() { endlessMs = 0; lastMove = now(); },
    get endlessMs() { return endlessMs; },
    /** Belohnung des Endlos-Angebots: reihum durch die Werkzeuge (fair, vorhersehbar, über Neustarts gemerkt). */
    peekEndlessReward(types) { return types[state.reward % types.length]; },
    /** Nach angesehenem Clip: die gezeigte Belohnung verbuchen, nächstes Mal kommt das nächste Werkzeug. */
    takeEndlessReward(types) { const t = types[state.reward % types.length]; state.reward = (state.reward + 1) % types.length; save(); return t; },
  };
}

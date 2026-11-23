// Werbe-Takt. Reine Logik, kein DOM, kein Netz – im Browser ohne Werbe-Adapter ungenutzt,
// in der App-Hülle mit AdMob verbunden.
// - Abenteuer (launch-42): in Level 1–5 keine Zwischenwerbung, danach nach jedem 3. gelösten
//   Level (also nach 8, 11, 14, …). Sie wird erst beim Start des nächsten Levels gezeigt
//   (nie mitten in einem Level, nie über dem Sterne-Dialog).
// - Endlos: nach je 15 Minuten (launch-32) aktiver Spielzeit eine kurze Zwischenwerbung ohne
//   Belohnung, direkt nach einem Zug, wenn alles ruhig ist.
//   Lange Pausen zwischen zwei Zügen zählen nur bis MAX_GAP_MS (Pause/Menü/Hintergrund zählt nicht).
//   Werbefrei (`isAdFree`) unterdrückt Zwischenwerbung und Endlos-Werbung.
export const AD_PACING = Object.freeze({
  interstitialEvery: 3,           // nach je 3 gelösten Leveln, sobald interstitialFreeLevels vorbei sind
  interstitialFreeLevels: 5,      // die ersten 5 Level ohne Zwischenwerbung
  endlessOfferMs: 15 * 60 * 1000, // launch-32: 15 Minuten aktive Endlos-Spielzeit
  maxGapMs: 30 * 1000,            // mehr zählt zwischen zwei Zügen nicht
});
const KEY = 'squish-ad-pacing-v1';

export function interstitialAfterWin(n, { freeLevels = AD_PACING.interstitialFreeLevels, every = AD_PACING.interstitialEvery } = {}) {
  return Number.isInteger(n) && n > freeLevels && (n - freeLevels) % every === 0;
}

export function createAdPacing({ storage = globalThis.localStorage, config = AD_PACING, now = () => Date.now(), isAdFree = () => false } = {}) {
  const free = () => { try { return !!isAdFree(); } catch { return false; } };
  let state = { wins: 0, due: false, reward: 0 };
  try { const s = JSON.parse(storage?.getItem(KEY) || 'null'); if (s && Number.isInteger(s.wins)) state = { wins: Math.max(0, s.wins), due: !!s.due, reward: Number.isInteger(s.reward) && s.reward >= 0 ? s.reward : 0 }; } catch {}
  const save = () => { try { storage?.setItem(KEY, JSON.stringify(state)); } catch {} };
  let endlessMs = 0, lastMove = null;
  return {
    /** Ein Abenteuer-Level n wurde gewonnen (nicht für Test-Level aufrufen). → true, wenn jetzt eine Zwischenwerbung fällig wird. */
    levelWon(n) {
      state.wins++;
      // Werbefrei: Siege zählen weiter, aber es wird keine Zwischenwerbung fällig.
      if (!free() && interstitialAfterWin(n, { freeLevels: config.interstitialFreeLevels, every: config.interstitialEvery })) state.due = true;
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
    /** Historisch: Endlos-Belohnung reihum (launch-42 ungenutzt, Zustand bleibt kompatibel). */
    peekEndlessReward(types) { return types[state.reward % types.length]; },
    takeEndlessReward(types) { const t = types[state.reward % types.length]; state.reward = (state.reward + 1) % types.length; save(); return t; },
  };
}

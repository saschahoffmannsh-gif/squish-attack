// Schnittstelle für echte Werbung in der App (launch-19, vorbereitet). Im Browser ist kein
// Adapter angemeldet: dann bleibt alles wie bisher (Dummy-Werbung, sofortige Belohnung).
// Die App-Hülle (Capacitor + AdMob, docs/app-shell.md) meldet beim Start einen Adapter an:
//   registerNativeAds({
//     name: 'admob',
//     async showRewarded({ placement, tool }) { …; return { ok: true } },   // nur bei ok gibt es das Werkzeug
//     async showInterstitial({ placement }) { …; return { ok: true } },     // nach jedem 10. Level
//   })
// Kein Netz, kein Fremdcode im Spiel selbst – das SDK lebt nur in der nativen Hülle.
let adapter = null;
export function registerNativeAds(a) { adapter = a && typeof a.showRewarded === 'function' ? a : null; }
export const hasNativeAds = () => !!adapter;
export const nativeAdsName = () => adapter?.name || null;

/** Kein Netz laut Browser/WebView (navigator.onLine). Dann gibt es keine Werbung – sie wird still übersprungen. */
export const isOffline = (nav = globalThis.navigator) => nav?.onLine === false;
/** Belohnungsclip. → {ok, dummy?, unavailable?}. Ohne Adapter sofort ok (Testphase).
 *  unavailable = kein Clip zu haben (offline, nicht geladen, Zeitüberschreitung) – die Hilfe bleibt dann gesperrt
 *  (launch-31, kurzer Hinweis „Keine Verbindung“). Abbruch durch den Spieler = {ok:false} ohne unavailable. */
export async function showRewarded(opts = {}) {
  if (!adapter) return { ok: true, dummy: true };
  if (isOffline()) return { ok: false, unavailable: true };
  try { const r = await adapter.showRewarded(opts); return { ok: !!r?.ok, ...(r?.unavailable ? { unavailable: true } : {}) }; } catch { return { ok: false, unavailable: true }; }
}
/** Zwischenwerbung (nicht belohnt). Ohne Adapter: nichts. Blockiert nie das Spiel bei Fehlern. */
export async function showInterstitial(opts = {}) {
  if (!adapter?.showInterstitial) return { ok: false, skipped: true };
  if (isOffline()) return { ok: false, skipped: true, unavailable: true };
  try { const r = await adapter.showInterstitial(opts); return { ok: !!r?.ok }; } catch { return { ok: false }; }
}
// Für die App-Hülle ohne Modul-Import erreichbar (window.SquishNative.registerNativeAds(...)).
if (typeof globalThis !== 'undefined') {
  globalThis.SquishNative = Object.assign(globalThis.SquishNative || {}, { registerNativeAds });
}

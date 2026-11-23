// Schnittstelle für echte Werbung in der App (launch-19, vorbereitet). Im Browser ist kein
// Adapter angemeldet: dann gibt es keine Zwischenwerbung.
// Die App-Hülle (Capacitor + AdMob, docs/app-shell.md) meldet beim Start einen Adapter an:
//   registerNativeAds({
//     name: 'admob',
//     async showInterstitial({ placement }) { …; return { ok: true } },
//   })
// launch-42: Belohnungsclips entfallen; showRewarded ist optional und wird vom Spiel nicht mehr aufgerufen.
// Kein Netz, kein Fremdcode im Spiel selbst – das SDK lebt nur in der nativen Hülle.
let adapter = null;
export function registerNativeAds(a) { adapter = a && (typeof a.showInterstitial === 'function' || typeof a.showRewarded === 'function') ? a : null; }
export const hasNativeAds = () => !!adapter;
export const nativeAdsName = () => adapter?.name || null;

/** Kein Netz laut Browser/WebView (navigator.onLine). Dann wird Zwischenwerbung still übersprungen. */
export const isOffline = (nav = globalThis.navigator) => nav?.onLine === false;
/** Historisch: Belohnungsclip. launch-42 ungenutzt. Ohne Adapter / ohne showRewarded: nicht verfügbar. */
export async function showRewarded(opts = {}) {
  if (typeof adapter?.showRewarded !== 'function') return { ok: false, skipped: true, unavailable: true };
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

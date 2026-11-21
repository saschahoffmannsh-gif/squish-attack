// launch-31: Offline-Cache fürs Web-Spiel anmelden (offline-sw.js, Scope game/). Nicht in der App-Hülle
// (Capacitor liefert alle Dateien lokal) und nicht ohne http(s). Fehler bleiben still.
// Die Adresse trägt den Build-Tag wie alle anderen Dateien (?v=…, wird beim Release mit hochgezählt).
export const SW_URL = 'offline-sw.js?v=launch-39';
export function registerOfflineCache({ nav = globalThis.navigator, doc = globalThis.document, loc = globalThis.location } = {}) {
  try {
    if (!nav?.serviceWorker || !/^https?:$/.test(loc?.protocol || '')) return false;
    if (globalThis.Capacitor?.isNativePlatform?.() || doc?.documentElement?.dataset?.appShell) return false;
    const start = () => nav.serviceWorker.register(SW_URL, { scope: './' }).catch(() => {});
    if (doc?.readyState === 'complete') setTimeout(start, 1500); else globalThis.addEventListener?.('load', () => setTimeout(start, 1500), { once: true });
    return true;
  } catch { return false; }
}

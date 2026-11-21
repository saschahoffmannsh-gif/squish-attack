// Preview must not register the live game service worker (scope would be
// resolved against this document). Live /game/ is left untouched.
export const SW_URL = '';
export function registerOfflineCache() {
  try {
    const nav = globalThis.navigator;
    nav?.serviceWorker?.getRegistrations?.().then(rs => {
      for (const r of rs) {
        if (/preview-streak/.test(r.scope || '')) r.unregister();
      }
    }).catch(() => {});
  } catch {}
  return false;
}

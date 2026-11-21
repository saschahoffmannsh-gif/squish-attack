// Preview must not register the live-game service worker (shared cache prefix
// would delete the live `squish-game-*` caches on activate).
export const SW_URL = 'offline-sw.js?v=preview-gel';
export function registerOfflineCache(){ return false; }

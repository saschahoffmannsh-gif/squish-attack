// Replaces the former encrypted-gate worker at ./sw.js.
// Clears the old 'app-body' cache, unregisters, and reloads controlled pages
// so devices that unlocked the password gate receive the plain site.
// The game itself must not register this file.
const CACHE = "app-body";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    } catch {}
    await self.clients.claim();
    try {
      await self.registration.unregister();
    } catch {}
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    await Promise.all(clients.map((client) => {
      if (typeof client.navigate === "function") return client.navigate(client.url);
      return Promise.resolve();
    }));
  })());
});

// While this worker is briefly in control, never serve the stale gate cache.
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

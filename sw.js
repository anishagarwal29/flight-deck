// Flight Deck service worker: keeps every file on the phone so the app opens with no internet.
const CACHE = "flightdeck-v7";
const FILES = [
  "./", "index.html", "app.css", "app.js", "map.json", "manifest.webmanifest",
  "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png",
  "fonts/barlow-condensed-latin-600-normal.woff2", "fonts/barlow-condensed-latin-700-normal.woff2",
  "fonts/barlow-latin-400-normal.woff2", "fonts/barlow-latin-500-normal.woff2",
  "fonts/barlow-latin-600-normal.woff2", "fonts/barlow-latin-700-normal.woff2",
  "fonts/dm-mono-latin-400-normal.woff2", "fonts/dm-mono-latin-500-normal.woff2"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Serve from the phone first; quietly refresh the copy when online.
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(e.request, { ignoreSearch: true }).then(hit => {
        const fresh = fetch(e.request).then(res => { if (res && res.ok) cache.put(e.request, res.clone()); return res; }).catch(() => hit);
        return hit || fresh;
      })
    )
  );
});

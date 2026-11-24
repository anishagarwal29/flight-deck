// Flight Deck service worker: keeps every file on the phone so the app opens with no internet.
const CACHE = "flightdeck-v17";
const FILES = [
  "./", "index.html", "app.css", "app.js", "manifest.webmanifest",
  "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png",
  "fonts/barlow-condensed-latin-600-normal.woff2", "fonts/barlow-condensed-latin-700-normal.woff2",
  "fonts/barlow-latin-400-normal.woff2", "fonts/barlow-latin-500-normal.woff2",
  "fonts/barlow-latin-600-normal.woff2", "fonts/barlow-latin-700-normal.woff2",
  "fonts/dm-mono-latin-400-normal.woff2", "fonts/dm-mono-latin-500-normal.woff2", "fonts/caveat-latin-600-normal.woff2",
  "lib/d3-array.min.js", "lib/d3-geo.min.js", "lib/topojson-client.min.js",
  "data/airports.json", "data/world-50m.json"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Online: always fetch the newest version (and keep a copy). Offline or slow: use the saved copy.
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request, { cache: "no-cache" }).then(res => { if (res && res.ok) cache.put(e.request, res.clone()); return res; });
    if (!hit) {   // nothing saved yet: wait for the network however long it takes (big 3D files on slow wifi)
      try { return await net; } catch (err) { return Response.error(); }
    }
    // saved copy exists: prefer fresh, but don't keep you waiting more than 4s
    try { return await Promise.race([net, new Promise((_, rej) => setTimeout(() => rej(new Error("slow")), 4000))]); }
    catch (err) { return hit; }
  })());
});

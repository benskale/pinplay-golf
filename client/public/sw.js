const CACHE_NAME = "pinplay-v2";

// Install: skip pre-caching — let requests populate cache naturally
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

// Activate: clean old caches immediately
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch strategy:
// - HTML pages: network-first (always get latest app shell)
// - JS/CSS/assets: cache-first (hashed by Vite, safe to cache)
// - API: network-first, fall back to cache
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip WebSocket and non-GET
  if (request.method !== "GET") return;
  if (url.protocol === "ws:" || url.protocol === "wss:") return;

  const isHTML = request.headers.get("Accept")?.includes("text/html");
  const isAPI = url.pathname.startsWith("/api/");
  const isAsset = url.pathname.match(/\.(js|css|png|jpg|svg|ico|json|woff2?)$/);

  // HTML + API: network-first
  if (isHTML || isAPI) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Static assets (JS, CSS, images): cache-first
  if (isAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Everything else: network-first
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

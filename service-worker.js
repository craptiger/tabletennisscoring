const CACHE_NAME = "tt-scoreboard-runtime-v4.9.3";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))));
    await self.clients.claim();
  })());
});

function isHTMLNavigation(request) {
  return request.mode === "navigate" ||
    (request.headers.get("accept") || "").includes("text/html");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // Network-first for HTML navigations (index.html). This is the "seamless updates" bit.
  if (sameOrigin && isHTMLNavigation(req)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const fresh = await fetch(req);
        // Always update cached index.html so next load is latest
        cache.put("./index.html", fresh.clone()).catch(() => {});
        return fresh;
      } catch {
        const cached = await cache.match("./index.html");
        return cached || new Response("Offline", { status: 503, statusText: "Offline" });
      }
    })());
    return;
  }

  // Stale-while-revalidate for other same-origin GETs (icons/manifest/anything else)
  if (sameOrigin) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req, { ignoreSearch: true });
      const fetchPromise = fetch(req)
        .then((fresh) => {
          cache.put(req, fresh.clone()).catch(() => {});
          return fresh;
        })
        .catch(() => null);

      // Return cached immediately if present, otherwise wait for network.
      return cached || (await fetchPromise) || new Response("Offline", { status: 503, statusText: "Offline" });
    })());
    return;
  }

  // For cross-origin, just pass through (or you can ignore)
});

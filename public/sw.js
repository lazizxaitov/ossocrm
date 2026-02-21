const CACHE_NAME = "osso-warehouse-v2";
const APP_SHELL = ["/warehouse", "/warehouse/inventory", "/warehouse/history", "/warehouse/containers", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Never cache Next.js build assets and API responses.
  if (url.pathname.startsWith("/_next/") || url.pathname.startsWith("/api/")) {
    return;
  }

  // Limit SW behavior to warehouse area and PWA metadata.
  const isWarehousePath =
    url.pathname === "/warehouse" ||
    url.pathname.startsWith("/warehouse/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/sw.js";
  if (!isWarehousePath) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/warehouse")),
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        return response;
      })
      .catch(() => caches.match(request)),
  );
});

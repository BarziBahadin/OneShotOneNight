const VERSION = "oneshotonenight-v7";
const APP_SHELL_CACHE = `${VERSION}-app-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/app-icon-192.png",
  "/app-icon-512.png",
  "/apple-touch-icon.png",
  "/favicon-32.png",
  "/admin/login",
  "/admin",
  "/admin/events",
  "/admin/events/new"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE)
      .then((cache) => Promise.all(APP_SHELL.map((path) => cache.add(path).catch(() => undefined))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin || !["http:", "https:"].includes(url.protocol)) {
    return;
  }

  if (request.method !== "GET" || url.pathname.startsWith("/api/")) {
    return;
  }

  if (url.pathname.startsWith("/assets/") || url.pathname.endsWith(".js") || url.pathname.endsWith(".css") || url.pathname.endsWith(".svg") || url.pathname.endsWith(".png")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "/"));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      cacheResponse(request, response);
    }
    return response;
  } catch {
    return offlineResponse(request);
  }
}

async function networkFirst(request, fallbackPath) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      cacheResponse(request, response);
      return response;
    }
    if (request.mode === "navigate") {
      const fallback = await caches.match(fallbackPath);
      if (fallback) return fallback;
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    const fallback = await caches.match(fallbackPath);
    if (fallback) return fallback;
    return offlineResponse(request);
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const fetched = fetch(request).then((response) => {
    if (response.ok) cacheResponse(request, response);
    return response;
  }).catch(() => cached || offlineResponse(request));
  return cached || fetched;
}

function cacheResponse(request, response) {
  caches.open(RUNTIME_CACHE)
    .then((cache) => cache.put(request, response.clone()))
    .catch(() => undefined);
}

function offlineResponse(request) {
  if (request.mode === "navigate") {
    return new Response(
      "<!doctype html><title>Offline</title><main><h1>Offline</h1><p>Please check your connection and try again.</p></main>",
      {
        status: 503,
        statusText: "Service Unavailable",
        headers: { "Content-Type": "text/html; charset=utf-8" }
      }
    );
  }

  return new Response("", {
    status: 503,
    statusText: "Service Unavailable"
  });
}

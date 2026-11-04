// Life Tracker Service Worker
// Caches static assets and JS/CSS bundles so the shell loads instantly offline.
// API responses (server actions, /api/*) are never cached — always live data.

const CACHE = "life-tracker-v1";

const STATIC_ROUTES = ["/", "/gym", "/food", "/money", "/todos", "/wishlist", "/business"];

// On install: pre-cache the app shell pages
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(STATIC_ROUTES).catch(() => {}))
  );
});

// On activate: remove old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy:
// - Navigation requests (HTML pages): network first, fall back to cache
// - _next/static/* (JS/CSS bundles): cache first (they're content-hashed, never stale)
// - API calls and server actions: always network, never cache
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept: API routes, server actions, non-GET
  if (request.method !== "GET") return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/_next/data/")) return; // RSC payloads — always fresh

  // Cache-first for static assets (content-hashed, safe to serve stale)
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Network-first for navigation (HTML) — show cached shell if offline
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached ?? caches.match("/")))
    );
    return;
  }
});

// Web Push: show notification
self.addEventListener("push", (event) => {
  if (!event.data) return;
  try {
    const payload = event.data.json();
    const title = payload.title || "Life Tracker";
    const options = {
      body: payload.body || "You have a task due today.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: payload.url || "/todos" },
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch {
    // malformed push — ignore
  }
});

// Notification click: focus or open the app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || "/todos";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(urlToOpen) && "focus" in client) return client.focus();
        }
        if (clients.openWindow) return clients.openWindow(urlToOpen);
      })
  );
});

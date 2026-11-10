// Life Tracker Service Worker
// Caches only content-hashed static bundles (/_next/static/*) so the app opens fast.
// HTML pages, server actions and /api/* are never cached: they hold personal data and must stay live.

const CACHE = "life-tracker-v3";
// Registered as /sw.js?dev by the dev server: Turbopack dev chunks keep their URL when their content changes.
const DEV = new URL(self.location.href).searchParams.has("dev");

self.addEventListener("install", () => {
  self.skipWaiting();
});

// Drop every older cache, including the v1 one that stored authenticated HTML.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => DEV || k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (DEV || request.method !== "GET" || !url.pathname.startsWith("/_next/static/")) return;

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        }),
    ),
  );
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
  // Only paths of this app: a push payload must never open another site.
  const target = new URL(event.notification.data?.url || "/todos", self.location.origin);
  const urlToOpen = target.origin === self.location.origin ? target.pathname + target.search : "/todos";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(urlToOpen) && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(urlToOpen);
    }),
  );
});

// Life Tracker Service Worker
// Two caches, both only for a fast start:
// - content-hashed static bundles (/_next/static/*) and the 5.6 MB muscle model, cache first (the model keeps its URL:
//   when the file changes, bump CACHE so devices fetch it again);
// - the signed-in pages (HTML), stale while revalidate: opening the app shows the last seen page at once and the
//   server's answer replaces it in the background (only a page stored today: an older one waits for the server).
//   Server actions and /api/* are never cached.
// The pages cache holds personal data on this device until Sign out (and the sign-in screen) delete it.

const CACHE = "life-tracker-v3";
const PAGES = "life-tracker-pages-v1";
const SIGNED_IN = /^\/(gym|health|todos|wishlist|settings)(\/|$)/;
// url -> promise of "the server's page differs from the one shown". Answered when the page asks (see the message handler).
const pending = new Map();
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
      .then((keys) => Promise.all(keys.filter((k) => DEV || (k !== CACHE && k !== PAGES)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (DEV || request.method !== "GET") return;

  // The root only redirects to Health; doing it here lets the start from the Home Screen reach the cached page.
  if (request.mode === "navigate" && url.pathname === "/") {
    event.respondWith(Response.redirect(new URL("/health", url.origin).href, 307));
    return;
  }
  if (request.mode === "navigate" && SIGNED_IN.test(url.pathname)) {
    event.respondWith(page(event, url));
    return;
  }
  if (!url.pathname.startsWith("/_next/static/") && url.pathname !== "/models/muscles.glb") return;

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

async function page(event, url) {
  const key = url.origin + url.pathname + url.search;
  const cache = await caches.open(PAGES);
  const cached = await cache.match(key);
  const shown = cached?.clone().text();
  const fetched = fetch(event.request);
  const changed = fetched
    .then(async (response) => {
      // A redirect (session gone, sign-in) or an error is never stored, and it removes what was stored.
      if (!response.ok || response.redirected) {
        await cache.delete(key);
        return !!cached;
      }
      const [read, store] = [response.clone(), response.clone()];
      const html = await read.text();
      await cache.put(key, store);
      return !!cached && html !== (await shown);
    })
    .catch(() => false);
  event.waitUntil(changed);
  // A page stored on an earlier day (device clock) would show that day's lists as today's: wait for the server.
  if (!cached || new Date(cached.headers.get("date")).toDateString() !== new Date().toDateString()) return fetched;
  pending.set(key, changed);
  return cached;
}

// A page served from the cache asks once whether the server's page differs; the answer is one message.
self.addEventListener("message", (event) => {
  if (event.data?.type !== "stale-check") return;
  const url = new URL(event.data.url);
  const changed = pending.get(url.origin + url.pathname + url.search);
  if (changed) event.waitUntil(changed.then((c) => c && event.source.postMessage({ type: "stale" })));
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

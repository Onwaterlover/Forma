// Forma service worker: keeps the app shell and an open workout usable during short connection drops.
// Workout edits themselves are stored in localStorage by the page and synced when back online.
const STATIC = "forma-static-v1";
const PAGES = "forma-pages-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => ![STATIC, PAGES].includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  // Immutable build assets: cache first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(STATIC).then(async (c) => (await c.match(req)) || fetch(req).then((res) => (res.ok && c.put(req, res.clone()), res))),
    );
    return;
  }

  if (req.mode === "navigate") {
    // Signing out (or landing on the login page) clears cached personal pages from this device.
    if (url.pathname === "/login" || url.pathname === "/register") {
      event.waitUntil(caches.delete(PAGES));
      return;
    }
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && (url.pathname === "/" || url.pathname.startsWith("/workout/") || url.pathname === "/training")) {
            const copy = res.clone();
            caches.open(PAGES).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(req)) || (await caches.match("/")) || Response.error()),
    );
  }
});

const CACHE_VERSION = "citronex-jobs-v4-multilingual-2026-07-23";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./data/content.js",
  "./data/locales/ru.js",
  "./data/locales/uk.js",
  "./data/locales/pl.js",
  "./data/locales/en.js",
  "./data/locales/az.js",
  "./data/locales/ka.js",
  "./data/locales/id.js",
  "./data/locales/es.js",
  "./data/locales/fil.js",
  "./data/locales/ne.js",
  "./data/locales/hy.js",
  "./assets/styles.css",
  "./assets/i18n.js",
  "./assets/application-form.js",
  "./assets/app.js",
  "./assets/icon.svg",
  "./assets/share-card.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(async () => (
          await caches.match(event.request)
          || await caches.match("./index.html")
        ))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const update = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || update;
    })
  );
});

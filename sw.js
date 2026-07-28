const CACHE_PREFIX = "kiris-jobs-";
const CACHE_VERSION = "kiris-jobs-v196-homepage-focus-2026-07-28";
const CORE_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./data/content.js?v=196",
  "./data/locales/ru.js?v=196",
  "./data/locales/en.js?v=196",
  "./assets/styles.css?v=196",
  "./assets/clean.css?v=196",
  "./assets/i18n.js?v=196",
  "./assets/application-form.js?v=196",
  "./assets/candidate.js?v=196",
  "./assets/icons.svg",
  "./assets/mobility-map.svg?v=10",
  "./assets/oleksandr-kiris-greenhouse.jpg",
  "./assets/oleksandr-kiris-citronex-logo.png",
  "./assets/fonts/manrope-latin.woff2",
  "./assets/fonts/manrope-latin-ext.woff2",
  "./assets/fonts/manrope-cyrillic.woff2",
  "./assets/fonts/manrope-cyrillic-ext.woff2",
  "./assets/fonts/noto-sans-georgian-variable.woff2",
  "./assets/fonts/noto-sans-armenian-variable.woff2",
  "./assets/fonts/noto-sans-devanagari-variable.woff2",
  "./assets/fonts/OFL-1.1.txt",
  "./assets/fonts/FONT-LICENSES.md",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/share-card.svg",
  "./assets/share-card.png?v=196"
];
const OPTIONAL_LOCALES = [
  "./data/locales/uk.js?v=196",
  "./data/locales/pl.js?v=196",
  "./data/locales/az.js?v=196",
  "./data/locales/ka.js?v=196",
  "./data/locales/id.js?v=196",
  "./data/locales/es.js?v=196",
  "./data/locales/fil.js?v=196",
  "./data/locales/ne.js?v=196",
  "./data/locales/hy.js?v=196"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(async (cache) => {
      await cache.addAll([...CORE_SHELL, ...OPTIONAL_LOCALES]);
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
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
    const networkUpdate = fetch(event.request).then(async (response) => {
      if (response.ok) {
        const cache = await caches.open(CACHE_VERSION);
        await cache.put(event.request, response.clone());
      }
      return response;
    });
    event.waitUntil(networkUpdate.then(() => undefined).catch(() => undefined));
    event.respondWith(
      caches.match(event.request).then(async (cached) => (
        cached
        || await caches.match("./index.html")
        || networkUpdate
      ))
    );
    return;
  }

  const networkUpdate = fetch(event.request)
    .then(async (response) => {
      if (response.ok) {
        const cache = await caches.open(CACHE_VERSION);
        await cache.put(event.request, response.clone());
      }
      return response;
    });

  event.waitUntil(networkUpdate.then(() => undefined).catch(() => undefined));
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || networkUpdate.catch(() => cached);
    })
  );
});

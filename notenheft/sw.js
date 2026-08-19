// Bei jeder inhaltlichen Änderung an den Dateien diese Versionsnummer erhöhen,
// damit Geräte, die die App schon installiert haben, die neue Version laden.
const CACHE_NAME = "notenheft-cache-v2";

const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Cache-first: Alles kommt zuerst aus dem lokalen Cache, damit die App auch
// ganz ohne Netzverbindung startet. Nur wenn etwas fehlt, wird versucht,
// es nachzuladen (nützlich beim allerersten Laden).
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => response)
        .catch(() => cached);
    })
  );
});

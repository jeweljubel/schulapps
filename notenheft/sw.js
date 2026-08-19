// Bei jeder inhaltlichen Änderung an den Dateien diese Versionsnummer erhöhen,
// damit Geräte, die die App schon installiert haben, die neue Version laden.
const CACHE_NAME = "notenheft-cache-v3";

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
    caches.open(CACHE_NAME).then((cache) =>
      // Jede Datei einzeln cachen statt alles-oder-nichts (cache.addAll):
      // scheitert eine einzelne Datei (z. B. kurzer Verbindungsaussetzer),
      // gehen die übrigen trotzdem in den Offline-Speicher.
      Promise.all(
        ASSETS.map((url) =>
          cache.add(url).catch((err) => console.warn("Konnte nicht zwischenspeichern:", url, err))
        )
      )
    ).then(() => self.skipWaiting())
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
// ganz ohne Netzverbindung startet. Fehlt etwas im Cache, wird es bei
// erfolgreichem Netzzugriff nachträglich mit eingelagert (Selbstheilung).
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});

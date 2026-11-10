// Service worker : l'appli s'ouvre sans connexion et se met à jour toute seule dès qu'une nouvelle version est publiée
const CACHE = "bf-v1.3.0";
const SHELL = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;           // les appels vers le Sheet ne passent jamais par le cache
  // réseau d'abord (version la plus récente), cache en secours hors connexion
  e.respondWith(
    fetch(req).then(res => {
      const copie = res.clone();
      caches.open(CACHE).then(c => c.put(req, copie));
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match("index.html")))
  );
});

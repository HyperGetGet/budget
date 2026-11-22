// Service worker : l'appli s'ouvre sans connexion et se met à jour toute seule dès qu'une nouvelle version est publiée
const CACHE = "bf-v1.43.0";
const IMG = "bf-img";   // photos des recettes (Wikimedia Commons), gardées d'une version à l'autre pour l'usage hors ligne
const LIB = "bf-lib";   // v1.28 : bibliothèque Firebase (versionnée, ne change jamais) ; v1.39 : polices
const SHELL = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png"];
const DELAI = 2500;     // v1.39 : au-delà, on ouvre l'appli avec la copie du téléphone (réseau faible, train)

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== IMG && k !== LIB).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// v1.39 : fichiers de l'appli. Réseau d'abord (toujours la dernière version quand le réseau répond), mais :
//  - la réponse doit arriver EN ENTIER en moins de DELAI, sinon on sert la copie du téléphone et le téléchargement finit en arrière-plan
//    (la nouvelle version, s'il y en a une, sera là à l'ouverture suivante) ;
//  - une réponse en erreur (GitHub en panne) ne remplace jamais la copie du téléphone.
async function appli(e) {
  const req = e.request, cache = await caches.open(CACHE);
  const copie = (await cache.match(req)) || (req.mode === "navigate" ? await cache.match("index.html") : undefined);
  const reseau = (async () => {
    const res = await fetch(req);
    // la copie n'est rangée (et la réponse rendue) qu'une fois le fichier reçu en entier
    if (res.ok) { try { await cache.put(req, res.clone()); } catch (x) {} }
    return res;
  })();
  if (!copie) return reseau;
  let minuteur;
  const trop = new Promise(ok => { minuteur = setTimeout(() => ok(null), DELAI); });
  try {
    const res = await Promise.race([reseau, trop]);
    if (res && (res.ok || res.type === "opaqueredirect")) return res;   // une redirection passe telle quelle, comme avant
    if (!res) e.waitUntil(reseau.catch(() => {}));   // trop lent : on laisse finir, pour la prochaine ouverture
  } catch (x) { /* hors connexion */ }
  finally { clearTimeout(minuteur); }
  return copie;
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname === "upload.wikimedia.org" || url.hostname === "thumb.wikimedia.org") {        // photos : cache d'abord, réseau sinon
    e.respondWith(caches.open(IMG).then(c => c.match(req).then(r => r || fetch(req).then(res => { if (res.ok || res.type === "opaque") c.put(req, res.clone()); return res; }))));
    return;
  }
  if (url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) {        // Firebase : cache d'abord
    e.respondWith(caches.open(LIB).then(c => c.match(req).then(r => r || fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }))));
    return;
  }
  // v1.39 : polices. Fichiers (gstatic) : cache d'abord, ils ne changent jamais. Feuille de style (googleapis) : copie du téléphone tout de suite,
  // rafraîchie en arrière-plan. L'appli s'affiche donc sans attendre Google, et garde ses polices sans réseau.
  if (url.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.open(LIB).then(c => c.match(req).then(r => r || fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }))));
    return;
  }
  if (url.hostname === "fonts.googleapis.com") {
    e.respondWith(caches.open(LIB).then(c => c.match(req).then(r => {
      const frais = fetch(req).then(res => { if (res.ok || res.type === "opaque") c.put(req, res.clone()); return res; });
      if (r) { e.waitUntil(frais.catch(() => {})); return r; }
      return frais;
    })));
    return;
  }
  if (url.origin !== location.origin) return;           // les appels vers le Sheet ne passent jamais par le cache
  e.respondWith(appli(e));
});

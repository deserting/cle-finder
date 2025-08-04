// Version du cache - incrémentez pour forcer la mise à jour
const CACHE_VERSION = 'cle-en-main-v1.2'; // ↔ même chaîne que dans app.js
// Note: La version doit correspondre à celle définie dans app.js et sw.js
//       pour assurer la cohérence entre l'application et le service worker.

//v1 : Mise à jour de la BDD complètes des couples adresse/clé
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;

// Fichiers à mettre en cache
const STATIC_ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './db.json',
  './icons/192.png',
  './icons/512.png'
];

const EXTERNAL_ASSETS = [
  'https://unpkg.com/@ericblade/quagga2@1.2.6/dist/quagga.min.js'
];

// Installation du Service Worker
self.addEventListener('install', (event) => {
  console.log('SW: Installation en cours...');
  
  event.waitUntil(
    Promise.all([
      // Cache des assets statiques
      caches.open(STATIC_CACHE).then((cache) => {
        console.log('SW: Mise en cache des assets statiques');
        return cache.addAll(STATIC_ASSETS);
      }),
      // Cache des assets externes
      caches.open(DYNAMIC_CACHE).then((cache) => {
        console.log('SW: Mise en cache des assets externes');
        return cache.addAll(EXTERNAL_ASSETS);
      })
    ]).then(() => {
      console.log('SW: Installation terminée');
      // Forcer l'activation immédiate
      return self.skipWaiting();
    })
  );
});

// Activation du Service Worker
self.addEventListener('activate', (event) => {
  console.log('SW: Activation en cours...');
  
  event.waitUntil(
    // Nettoyer les anciens caches
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter(cacheName => cacheName.startsWith('cle-en-main-') && cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE)
          .map(cacheName => {
            console.log('SW: Suppression ancien cache:', cacheName);
            return caches.delete(cacheName);
          })
      );
    }).then(() => {
      console.log('SW: Activation terminée');
      // Prendre contrôle de toutes les pages
      return self.clients.claim();
    })
  );
});

// Interception des requêtes
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  
  // Ignorer les requêtes non-GET
  if (request.method !== 'GET') {
    return;
  }
  
  // Ignorer les requêtes vers Google Forms
  if (url.hostname === 'docs.google.com') {
    return;
  }
  
  // Ignorer les requêtes de chrome-extension
  if (url.protocol === 'chrome-extension:') {
    return;
  }
  
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        console.log('SW: Servi depuis le cache:', request.url);
        return cachedResponse;
      }
      
      // Si pas en cache, récupérer depuis le réseau
      return fetch(request).then((networkResponse) => {
        // Si c'est une réponse valide, la mettre en cache
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          
          // Déterminer le cache approprié
          const cacheKey = STATIC_ASSETS.includes(url.pathname) || 
                          EXTERNAL_ASSETS.includes(request.url) ? 
                          STATIC_CACHE : DYNAMIC_CACHE;
          
          caches.open(cacheKey).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        
        return networkResponse;
      }).catch(() => {
        // En cas d'erreur réseau, retourner une page hors ligne simple
        if (request.destination === 'document') {
          return new Response(
            `<!DOCTYPE html>
            <html>
            <head>
              <title>Hors ligne - Clé en main</title>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width,initial-scale=1">
            </head>
            <body style="font-family:sans-serif;text-align:center;padding:2rem;">
              <h1>📵 Hors ligne</h1>
              <p>Vous êtes actuellement hors ligne.</p>
              <p>L'application continuera à fonctionner avec les données en cache.</p>
              <button onclick="location.reload()">Réessayer</button>
            </body>
            </html>`,
            {
              headers: { 'Content-Type': 'text/html' }
            }
          );
        }
        
        return new Response('Ressource non disponible hors ligne', {
          status: 503,
          statusText: 'Service Unavailable'
        });
      });
    })
  );
});

// Gestion des messages depuis l'app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
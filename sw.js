// ↗ change le nom du cache pour forcer la nouvelle version
const CACHE = 'cle-v2';

const ASSETS = [
  './',             // index.html par défaut
  './index.html',
  './app.js',
  './manifest.json',
  './db.json',
  'https://unpkg.com/@ericblade/quagga2@1.2.6/dist/quagga.min.js'
];

self.addEventListener('install', event =>
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)))
);

self.addEventListener('fetch', event =>
  event.respondWith(
    caches.match(event.request).then(r => r || fetch(event.request))
  )
);

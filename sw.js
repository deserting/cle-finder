const CACHE = 'cle-v1';
const ASSETS = [
  '/', '/index.html', '/app.js', '/manifest.json', '/db.json',
  'https://unpkg.com/@ericblade/quagga2@1.2.6/dist/quagga.min.js'
];

self.addEventListener('install', e =>
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)))
);

self.addEventListener('fetch', e =>
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)))
);

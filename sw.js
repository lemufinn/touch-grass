// Change this version number to clear cache on users' devices when you update assets
const CACHE_NAME = 'touch-grass-v9';

// List of all assets that must be cached for offline support and installation capability
const ASSETS_TO_CACHE = [
  './',                   // Cache the root directory/index.html
  './index.html',         // Specifically cache index.html
  './css/style.css',      // Cache your main stylesheet
  './js/app.js',          // Cache your 3D application logic
  './manifest.json',      // Cache the PWA configuration file
  './assets/icons/touchgrass-192.png',      // Standard PWA icon
  './assets/icons/touchgrass-512.png',      // Standard PWA icon
  './assets/icons/touchgrass-preview.png',  // <-- NEW: Cache your custom random preview image
  // Cache the Three.js library from CDN
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
];

// 🔧 INSTALL EVENT: Pre-caches all essential assets
self.addEventListener('install', (event) => {
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('SW: Pre-caching all app assets');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// 🚀 ACTIVATE EVENT: Cleans up old caches from previous versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          // If cache name doesn't match the current CACHE_NAME, delete it
          if (cache !== CACHE_NAME) {
            console.log('SW: Clearing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim()) // Claim all clients immediately
  );
});

// 🌐 FETCH EVENT: Handles offline support (Cache-first, Network-fallback strategy)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // If the request is in the cache, return it
      return response || fetch(event.request).catch(() => {
        // Fallback: If network fails and it's not cached (e.g., offline new page), return index.html
        return caches.match('./index.html');
      });
    })
  );
});

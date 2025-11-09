// Service Worker for Harvous PWA
// Improves initial load and re-engagement performance

const CACHE_NAME = 'harvous-cache-v2';
const OFFLINE_URL = '/';

// Resources to pre-cache for faster initial load
// Note: Removed '/dashboard' to prevent auth conflicts - authenticated routes should use network-first
const CRITICAL_ASSETS = [
  '/',
  '/favicon.svg',
  '/favicon.png',
  '/manifest.json',
  '/scripts/pwa-startup.js'
];

// Assets that need to be cached immediately for UI responsiveness
// Note: Removed '/dashboard' to prevent auth conflicts - authenticated routes should use network-first
const UI_CRITICAL_ASSETS = [
  '/dashboard/threads'
];

// Install event - precache critical assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Caching critical assets');
        return cache.addAll(CRITICAL_ASSETS);
      })
      .then(() => self.skipWaiting()) // Activate immediately
  );
});

// Activate event - clean up old caches and take control
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => {
          return name !== CACHE_NAME;
        }).map((name) => {
          return caches.delete(name);
        })
      );
    }).then(() => {
      // Take control of all clients immediately
      return self.clients.claim();
    }).then(() => {
      // After activation and claiming clients, cache UI critical assets
      return caches.open(CACHE_NAME).then((cache) => {
        return cache.addAll(UI_CRITICAL_ASSETS);
      });
    })
  );
});

// Helper to determine if a request is for a critical UI asset
const isUICriticalAsset = (url) => {
  const path = new URL(url).pathname;
  return UI_CRITICAL_ASSETS.some(criticalPath => path.startsWith(criticalPath));
};

// Fetch event - with optimized strategy based on asset type
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Skip cross-origin requests
  if (!url.origin.includes(self.location.origin)) {
    return;
  }
  
  // Handle API requests or mutations differently
  if (url.pathname.includes('/api/') || event.request.method !== 'GET') {
    return;
  }

  // For UI critical assets, use cache-first for immediate response
  if (isUICriticalAsset(event.request.url)) {
    event.respondWith(
      caches.match(event.request)
        .then((cachedResponse) => {
          if (cachedResponse) {
            // Return cached response immediately
            // And refresh cache in the background
            const fetchPromise = fetch(event.request)
              .then(response => {
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then(cache => {
                  cache.put(event.request, responseClone);
                });
                return response;
              })
              .catch(() => { /* Ignore errors */ });
              
            // Kick off the fetch but don't wait for it
            fetchPromise;
            return cachedResponse;
          }
          
          // If not in cache, get from network and cache
          return fetch(event.request)
            .then(response => {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, responseClone);
              });
              return response;
            });
        })
    );
    return;
  }

  // For all other requests, use network-first strategy
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache the fresh response
        const clonedResponse = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, clonedResponse);
        });
        return response;
      })
      .catch(() => {
        // If network fails, use cache
        return caches.match(event.request)
          .then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            
            // If it's a navigation, serve the offline page
            if (event.request.mode === 'navigate') {
              return caches.match(OFFLINE_URL);
            }
            
            // Otherwise, return a 404-like response
            return new Response('', {
              status: 404,
              statusText: 'Not found'
            });
          });
      })
  );
});

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});

// Warm up the app when PWA is launched or brought back from background
self.addEventListener('message', (event) => {
  if (event.data === 'warmup') {
    // Pre-fetch assets that might be needed soon
    caches.open(CACHE_NAME).then((cache) => {
      // Pre-fetch common navigation targets with high priority
      const criticalFetches = [
        fetch('/').then(response => {
          cache.put('/', response);
        }).catch(() => {})
      ];
      
      // Execute critical fetches immediately
      Promise.all(criticalFetches);
      
      // Then schedule less critical pre-fetches
      setTimeout(() => {
        cache.addAll([
          '/find',
          '/profile'
        ]).catch(() => {});
      }, 1000);
    });
  }
}); 
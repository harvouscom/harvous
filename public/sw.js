// Service Worker for Harvous PWA
// Improves initial load and re-engagement performance

const CACHE_NAME = 'harvous-cache-v4'; // Increment version to invalidate old cache
const OFFLINE_URL = '/';
const NAV_API_CACHE = 'harvous-nav-api-v2'; // Increment version to invalidate old cache
const CACHE_MAX_AGE = 30 * 60 * 1000; // 30 minutes for navigation API
const PAGE_CACHE_MAX_AGE = 5 * 60 * 1000; // 5 minutes for page cache

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

// Helper to cache assets individually, continuing even if some fail
const cacheAssetsIndividually = async (cache, assets) => {
  const results = await Promise.allSettled(
    assets.map(url => 
      cache.add(url).catch(err => {
        console.warn(`Failed to cache asset: ${url}`, err);
        return null; // Continue with other assets
      })
    )
  );
  
  const successful = results.filter(r => r.status === 'fulfilled' && r.value !== null).length;
  const failed = results.length - successful;
  
  if (failed > 0) {
    console.warn(`Service Worker: Cached ${successful}/${assets.length} assets (${failed} failed)`);
  } else {
    console.log(`Service Worker: Successfully cached all ${assets.length} assets`);
  }
  
  return results;
};

// Install event - precache critical assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Caching critical assets');
        return cacheAssetsIndividually(cache, CRITICAL_ASSETS);
      })
      .then(() => self.skipWaiting()) // Activate immediately even if some assets failed
      .catch((err) => {
        console.error('Service Worker install error:', err);
        // Still activate even on error
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches and take control
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => {
          return name !== CACHE_NAME && name !== NAV_API_CACHE;
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
        return cacheAssetsIndividually(cache, UI_CRITICAL_ASSETS);
      });
    }).catch((err) => {
      console.error('Service Worker activate error:', err);
      // Continue even if caching fails
    })
  );
});

// Helper to determine if a request is for a critical UI asset
const isUICriticalAsset = (url) => {
  const path = new URL(url).pathname;
  return UI_CRITICAL_ASSETS.some(criticalPath => path.startsWith(criticalPath));
};

// Helper to determine if a request is for a navigation route
// Navigation routes should use cache-first strategy for faster mobile performance
const isNavigationRoute = (url) => {
  const path = new URL(url).pathname;
  
  // Static navigation routes
  if (path === '/' || 
      path === '/find' || 
      path === '/profile' || 
      path === '/new-space') {
    return true;
  }
  
  // Dynamic routes (threads, spaces, notes)
  // Pattern: /{id} where id is not an API route or static asset
  // Exclude API routes, static assets, and special paths
  if (path.startsWith('/api/') || 
      path.startsWith('/_astro/') ||
      path.startsWith('/scripts/') ||
      path.startsWith('/icons/') ||
      path.includes('.') || // Files with extensions
      path.startsWith('/sign-in') ||
      path.startsWith('/sign-up')) {
    return false;
  }
  
  // If it's a simple path like /thread_123 or /space_456 or /note_789, it's a navigation route
  // Also handles routes like /thread_unorganized
  if (path.length > 1 && path.length < 100 && !path.includes('/')) {
    return true;
  }
  
  return false;
};

// Helper to determine if a response should be cached
// Only cache successful responses (200-299)
// Do not cache redirects (300-399) or errors (400+)
const shouldCacheResponse = (response) => {
  if (!response) return false;
  const status = response.status;
  // Only cache successful responses (200-299)
  // Redirects (300-399) and errors (400+) should not be cached
  return status >= 200 && status < 300;
};

// Helper to check if cached response is stale
const isCacheStale = (cachedResponse, maxAge) => {
  if (!cachedResponse) return true;
  
  // Check if response has a Date header
  const dateHeader = cachedResponse.headers.get('date');
  if (!dateHeader) return false; // Can't determine age, assume fresh
  
  try {
    const cacheDate = new Date(dateHeader);
    const age = Date.now() - cacheDate.getTime();
    return age > maxAge;
  } catch (error) {
    return false; // Error parsing date, assume fresh
  }
};

// Helper to add cache timestamp to response
const addCacheTimestamp = (response) => {
  if (!response) return response;
  
  // Clone response to add Date header if missing
  const headers = new Headers(response.headers);
  if (!headers.has('date')) {
    headers.set('date', new Date().toUTCString());
  }
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: headers
  });
};

// Fetch event - with optimized strategy based on asset type
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Skip cross-origin requests
  if (!url.origin.includes(self.location.origin)) {
    return;
  }
  
  // Handle navigation API with cache-first strategy for faster loads
  if (url.pathname === '/api/navigation/data' && event.request.method === 'GET') {
    event.respondWith(
      caches.open(NAV_API_CACHE).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          const isStale = isCacheStale(cachedResponse, CACHE_MAX_AGE);
          
          // Return cached response immediately if available and fresh
          if (cachedResponse && !isStale) {
            // Refresh in background
            fetch(event.request)
              .then((response) => {
                if (shouldCacheResponse(response)) {
                  const timestampedResponse = addCacheTimestamp(response);
                  cache.put(event.request, timestampedResponse.clone());
                }
              })
              .catch(() => { /* Ignore errors */ });
            return cachedResponse;
          }
          
          // Cache is stale or missing - fetch fresh data
          return fetch(event.request)
            .then((response) => {
              if (shouldCacheResponse(response)) {
                const timestampedResponse = addCacheTimestamp(response);
                cache.put(event.request, timestampedResponse.clone());
                return timestampedResponse;
              }
              return response;
            })
            .catch(() => {
              // If network fails and we have stale cache, use it
              if (cachedResponse) {
                return cachedResponse;
              }
              // No cache at all - return empty data
              return new Response(JSON.stringify({ threads: [], spaces: [], inboxCount: 0 }), {
                status: 200,
                headers: { 
                  'Content-Type': 'application/json',
                  'date': new Date().toUTCString()
                }
              });
            });
        });
      })
    );
    return;
  }
  
  // Handle other API requests or mutations differently
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
                if (shouldCacheResponse(response)) {
                  const responseClone = response.clone();
                  caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseClone);
                  });
                }
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
              if (shouldCacheResponse(response)) {
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then(cache => {
                  cache.put(event.request, responseClone);
                });
              }
              return response;
            });
        })
    );
    return;
  }

  // For navigation routes (threads, spaces, notes, find, profile, new-space, dashboard)
  // Use cache-first strategy for faster mobile performance
  if (event.request.mode === 'navigate' || isNavigationRoute(event.request.url)) {
    event.respondWith(
      caches.match(event.request)
        .then((cachedResponse) => {
          const isStale = isCacheStale(cachedResponse, PAGE_CACHE_MAX_AGE);
          
          if (cachedResponse && !isStale) {
            // Return cached response immediately for instant navigation
            // Refresh cache in the background
            fetch(event.request)
              .then(response => {
                if (shouldCacheResponse(response)) {
                  const timestampedResponse = addCacheTimestamp(response);
                  caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, timestampedResponse.clone());
                  });
                }
              })
              .catch(() => { /* Ignore errors */ });
            
            return cachedResponse;
          }
          
          // Cache is stale or missing - fetch fresh data
          return fetch(event.request)
            .then(response => {
              if (shouldCacheResponse(response)) {
                const timestampedResponse = addCacheTimestamp(response);
                caches.open(CACHE_NAME).then(cache => {
                  cache.put(event.request, timestampedResponse.clone());
                });
                return timestampedResponse;
              }
              return response;
            })
            .catch(() => {
              // If network fails and we have stale cache, use it
              if (cachedResponse) {
                return cachedResponse;
              }
              // No cache at all - return error
              return new Response('Network error', {
                status: 503,
                statusText: 'Service Unavailable'
              });
            });
        })
    );
    return;
  }

  // For all other requests, use network-first strategy
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache the fresh response only if it's successful
        if (shouldCacheResponse(response)) {
          const timestampedResponse = addCacheTimestamp(response);
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, timestampedResponse.clone());
          });
          return timestampedResponse;
        }
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
          if (shouldCacheResponse(response)) {
            const timestampedResponse = addCacheTimestamp(response);
            cache.put('/', timestampedResponse);
          }
        }).catch(() => {})
      ];
      
      // Execute critical fetches immediately
      Promise.all(criticalFetches);
      
      // Then schedule less critical pre-fetches
      setTimeout(() => {
        cacheAssetsIndividually(cache, [
          '/find',
          '/profile'
        ]).catch(() => {});
      }, 1000);
    });
  }
});

// Handle online/offline events for mobile devices
self.addEventListener('online', () => {
  console.log('Service Worker: Online - refreshing stale cache');
  
  // Clear stale cache entries when coming back online
  caches.open(CACHE_NAME).then((cache) => {
    cache.keys().then((keys) => {
      keys.forEach((request) => {
        cache.match(request).then((cachedResponse) => {
          if (cachedResponse && isCacheStale(cachedResponse, PAGE_CACHE_MAX_AGE)) {
            // Delete stale cache entry
            cache.delete(request).catch(() => {});
          }
        });
      });
    });
  });
  
  // Refresh navigation API cache
  caches.open(NAV_API_CACHE).then((cache) => {
    cache.keys().then((keys) => {
      keys.forEach((request) => {
        cache.match(request).then((cachedResponse) => {
          if (cachedResponse && isCacheStale(cachedResponse, CACHE_MAX_AGE)) {
            // Delete stale cache entry
            cache.delete(request).catch(() => {});
          }
        });
      });
    });
  });
  
  // Notify clients that we're online
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => {
      client.postMessage({ type: 'online' });
    });
  });
});

self.addEventListener('offline', () => {
  console.log('Service Worker: Offline - using cached content');
  
  // Notify clients that we're offline
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => {
      client.postMessage({ type: 'offline' });
    });
  });
}); 
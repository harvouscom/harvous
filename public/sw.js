// Service Worker for Harvous PWA
// Improves initial load and re-engagement performance

const CACHE_NAME = 'harvous-cache-v6'; // Increment version to invalidate old cache
const OFFLINE_URL = '/';
const NAV_API_CACHE = 'harvous-nav-api-v3'; // Increment version to invalidate old cache
const CACHE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours for navigation API
const PAGE_CACHE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours for page cache

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

// Helper to determine if a request is for an Astro asset (CSS, JS, etc.)
// These should use cache-first strategy for reliable style loading
const isAstroAsset = (url) => {
  const path = new URL(url).pathname;
  return path.startsWith('/_astro/');
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
// Only cache successful responses (200-299), but exclude 206 (Partial Content)
// The Cache API doesn't support partial responses
// Do not cache redirects (300-399) or errors (400+)
const shouldCacheResponse = (response) => {
  if (!response) return false;
  const status = response.status;
  // Only cache successful responses (200-299), but exclude 206 (Partial Content)
  // Redirects (300-399) and errors (400+) should not be cached
  return status >= 200 && status < 300 && status !== 206;
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
// IMPORTANT: Response body can only be read once, so we must clone BEFORE processing
const addCacheTimestamp = (response) => {
  if (!response) return response;
  
  // Clone response first to avoid consuming the body stream
  const clonedResponse = response.clone();
  
  // Create new headers with Date if missing
  const headers = new Headers(clonedResponse.headers);
  if (!headers.has('date')) {
    headers.set('date', new Date().toUTCString());
  }
  
  // Create new response with cloned body
  return new Response(clonedResponse.body, {
    status: clonedResponse.status,
    statusText: clonedResponse.statusText,
    headers: headers
  });
};

// Helper to safely cache a response with error handling
// Gracefully handles 206 errors and other cache failures without breaking the service worker
const safeCachePut = async (cache, request, response) => {
  try {
    await cache.put(request, response);
  } catch (error) {
    // Log warning but don't throw - cache failures shouldn't break the app
    // Common causes: 206 status codes, quota exceeded, or invalid responses
    if (error.message && error.message.includes('206')) {
      console.warn(`Service Worker: Skipped caching 206 (Partial Content) response for ${request.url}`);
    } else {
      console.warn(`Service Worker: Failed to cache response for ${request.url}:`, error.message || error);
    }
  }
};

// Fetch event - with optimized strategy based on asset type
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Skip cross-origin requests
  if (!url.origin.includes(self.location.origin)) {
    return;
  }
  
  // Always bypass cache for authentication routes to prevent sign-in page flash
  // These routes should always use network-first to ensure fresh authentication state
  if (url.pathname.startsWith('/sign-in') || url.pathname.startsWith('/sign-up')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // If network fails, return a basic error response instead of cached sign-in page
        return new Response('Authentication page unavailable', {
          status: 503,
          statusText: 'Service Unavailable'
        });
      })
    );
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
                  // Clone before processing to avoid body consumption
                  const responseClone = response.clone();
                  const timestampedResponse = addCacheTimestamp(responseClone);
                  // Clone before caching (background refresh, but clone to be safe)
                  const cacheClone = timestampedResponse.clone();
                  safeCachePut(cache, event.request, cacheClone);
                }
              })
              .catch(() => { /* Ignore errors */ });
            return cachedResponse;
          }
          
          // Cache is stale or missing - fetch fresh data
          return fetch(event.request)
            .then((response) => {
              if (shouldCacheResponse(response)) {
                // Clone before processing to avoid body consumption
                const responseClone = response.clone();
                const timestampedResponse = addCacheTimestamp(responseClone);
                // Clone timestamped response before caching (since we're also returning it)
                const cacheClone = timestampedResponse.clone();
                safeCachePut(cache, event.request, cacheClone);
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
  
  // EXCLUDE API ENDPOINTS FROM CACHING - Always use network-first for API calls
  // This prevents stale API responses and ensures fresh data
  // Check this BEFORE any other caching logic
  if (url.pathname.startsWith('/api/')) {
    // For API endpoints, always fetch from network (no caching)
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Return response directly without caching
          return response;
        })
        .catch(() => {
          // If network fails, return error response (don't use cache)
          return new Response(JSON.stringify({ error: 'Network error' }), {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'application/json' }
          });
        })
    );
    return;
  }

  // Handle non-GET requests (POST, PUT, DELETE, etc.) - don't cache these
  if (event.request.method !== 'GET') {
    // For non-GET requests, always fetch from network (no caching)
    event.respondWith(fetch(event.request));
    return;
  }

  // For Astro assets (CSS, JS), use cache-first strategy for reliable style loading
  // This ensures styles persist even after long periods or service worker updates
  if (isAstroAsset(event.request.url)) {
    event.respondWith(
      caches.match(event.request)
        .then((cachedResponse) => {
          if (cachedResponse) {
            // Return cached response immediately for instant loading
            // Refresh cache in the background
            fetch(event.request)
              .then(response => {
                if (shouldCacheResponse(response)) {
                  // Clone before processing to avoid body consumption
                  const responseClone = response.clone();
                  const timestampedResponse = addCacheTimestamp(responseClone);
                  // Clone before caching (background refresh, but clone to be safe)
                  const cacheClone = timestampedResponse.clone();
                  caches.open(CACHE_NAME).then(cache => {
                    safeCachePut(cache, event.request, cacheClone);
                  });
                }
              })
              .catch(() => { /* Ignore errors - use cached version */ });
            
            return cachedResponse;
          }
          
          // If not in cache, get from network and cache
          return fetch(event.request)
            .then(response => {
              if (shouldCacheResponse(response)) {
                // Clone before caching to avoid body consumption
                const responseClone = response.clone();
                const timestampedResponse = addCacheTimestamp(responseClone);
                // Clone timestamped response before caching (since we're also returning it)
                const cacheClone = timestampedResponse.clone();
                caches.open(CACHE_NAME).then(cache => {
                  safeCachePut(cache, event.request, cacheClone);
                });
                return timestampedResponse;
              }
              return response;
            })
            .catch(() => {
              // If network fails, try to return cached version even if stale
              return cachedResponse || new Response('Asset not available', {
                status: 503,
                statusText: 'Service Unavailable'
              });
            });
        })
    );
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
                  // Clone before caching to avoid body consumption
                  const responseClone = response.clone();
                  const timestampedResponse = addCacheTimestamp(responseClone);
                  // Clone before caching (background refresh, but clone to be safe)
                  const cacheClone = timestampedResponse.clone();
                  caches.open(CACHE_NAME).then(cache => {
                    safeCachePut(cache, event.request, cacheClone);
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
                // Clone before caching to avoid body consumption
                const responseClone = response.clone();
                const timestampedResponse = addCacheTimestamp(responseClone);
                // Clone before caching (we return original response, but clone to be safe)
                const cacheClone = timestampedResponse.clone();
                caches.open(CACHE_NAME).then(cache => {
                  safeCachePut(cache, event.request, cacheClone);
                });
                return response;
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
                  // Clone before processing to avoid body consumption
                  const responseClone = response.clone();
                  const timestampedResponse = addCacheTimestamp(responseClone);
                  // Clone before caching (background refresh, but clone to be safe)
                  const cacheClone = timestampedResponse.clone();
                  caches.open(CACHE_NAME).then(cache => {
                    safeCachePut(cache, event.request, cacheClone);
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
                // Clone before processing to avoid body consumption
                const responseClone = response.clone();
                const timestampedResponse = addCacheTimestamp(responseClone);
                // Clone timestamped response before caching (since we're also returning it)
                const cacheClone = timestampedResponse.clone();
                caches.open(CACHE_NAME).then(cache => {
                  safeCachePut(cache, event.request, cacheClone);
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
              // Try to serve cached dashboard first
              return caches.match('/dashboard')
                .then(cachedDashboard => {
                  if (cachedDashboard) {
                    // Return cached dashboard with offline indicator
                    return cachedDashboard;
                  }
                  // Fallback to offline page
                  return caches.match(OFFLINE_URL) || new Response('Network error', {
                    status: 503,
                    statusText: 'Service Unavailable'
                  });
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
          // Clone before processing to avoid body consumption
          const responseClone = response.clone();
          const timestampedResponse = addCacheTimestamp(responseClone);
          // Clone timestamped response before caching (since we're also returning it)
          const cacheClone = timestampedResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            safeCachePut(cache, event.request, cacheClone);
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
            
            // If it's a navigation, try cached dashboard first, then offline page
            if (event.request.mode === 'navigate') {
              return caches.match('/dashboard')
                .then(cachedDashboard => {
                  if (cachedDashboard) {
                    return cachedDashboard;
                  }
                  return caches.match(OFFLINE_URL);
                });
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
            // Clone before processing to avoid body consumption
            const responseClone = response.clone();
            const timestampedResponse = addCacheTimestamp(responseClone);
            // Clone before caching (warmup, but clone to be safe)
            const cacheClone = timestampedResponse.clone();
            safeCachePut(cache, '/', cacheClone);
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
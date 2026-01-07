// Service Worker for Harvous PWA
// Simple, reliable caching with stale-while-revalidate strategy

const CACHE_NAME = 'harvous-cache-v0-240-14'; // Bump version for new SW
const NAV_API_CACHE = 'harvous-nav-api-v4';
const CACHE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

// Resources to pre-cache for faster initial load
const CRITICAL_ASSETS = [
  '/favicon.svg',
  '/favicon.png',
  '/manifest.json',
  '/scripts/pwa-startup.js'
];

// Install event - precache critical assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching critical assets');
        return Promise.allSettled(
          CRITICAL_ASSETS.map(url => cache.add(url).catch(() => null))
        );
      })
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.error('Service Worker install error:', err);
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => {
          return name !== CACHE_NAME && name !== NAV_API_CACHE;
        }).map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Helper to check if a response is from the sign-in page
const isSignInPageResponse = async (response) => {
  if (!response) return false;
  try {
    const text = await Promise.race([
      response.clone().text(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
    ]);
    return text.includes('id="sign-in-content"') || 
           text.includes('sign-in-hidden') ||
           text.includes('ClerkSignIn') ||
           text.includes('<title>Sign In</title>');
  } catch {
    return false;
  }
};

// Helper to check if response should be cached
const shouldCacheResponse = (response) => {
  if (!response) return false;
  const status = response.status;
  return status >= 200 && status < 300 && status !== 206;
};

// Helper to add cache timestamp
const addCacheTimestamp = (response) => {
  if (!response) return response;
  // Clone once at the start to avoid "Response body is already used" errors
  const clonedResponse = response.clone();
  const headers = new Headers(clonedResponse.headers);
  if (!headers.has('date')) {
    headers.set('date', new Date().toUTCString());
  }
  return new Response(clonedResponse.body, {
    status: response.status,
    statusText: response.statusText,
    headers: headers
  });
};

// Helper for safe cache put
const safeCachePut = async (cache, request, response) => {
  try {
    await cache.put(request, response);
  } catch (error) {
    console.warn(`Service Worker: Cache put failed for ${request.url}`);
  }
};

// Fetch event handler
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Skip cross-origin requests
  if (!url.origin.includes(self.location.origin)) {
    return;
  }
  
  // Auth routes - always network-first, no caching
  if (url.pathname.startsWith('/sign-in') || url.pathname.startsWith('/sign-up')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // API endpoints - always network-first, no caching (except navigation data)
  if (url.pathname.startsWith('/api/') && url.pathname !== '/api/navigation/data') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(JSON.stringify({ error: 'Network error' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }
  
  // Navigation data API - stale-while-revalidate
  if (url.pathname === '/api/navigation/data' && event.request.method === 'GET') {
    event.respondWith(
      caches.open(NAV_API_CACHE).then((cache) => {
        return cache.match(event.request).then((cached) => {
          const fetchPromise = fetch(event.request)
            .then((response) => {
              if (shouldCacheResponse(response)) {
                const timestamped = addCacheTimestamp(response);
                // Clone before async cache operation for safety
                const timestampedClone = timestamped.clone();
                safeCachePut(cache, event.request, timestampedClone);
              }
              return response;
            })
            .catch(() => null);
          
          // Return cached immediately, refresh in background
          if (cached) {
            fetchPromise; // Fire and forget
            return cached;
          }
          
          // No cache - wait for network
          return fetchPromise.then(response => response || new Response(
            JSON.stringify({ threads: [], spaces: [], inboxCount: 0 }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          ));
        });
      })
    );
    return;
  }
  
  // Non-GET requests - always network
  if (event.request.method !== 'GET') {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // Static assets (/_astro/) - cache-first
  if (url.pathname.startsWith('/_astro/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) {
          // Refresh in background
          fetch(event.request).then((response) => {
            if (shouldCacheResponse(response)) {
              const timestamped = addCacheTimestamp(response);
              // Clone before async cache operation for safety
              const timestampedClone = timestamped.clone();
              caches.open(CACHE_NAME).then((cache) => {
                safeCachePut(cache, event.request, timestampedClone);
              });
            }
          }).catch(() => {});
          return cached;
        }
        
        return fetch(event.request).then((response) => {
          if (shouldCacheResponse(response)) {
            const timestamped = addCacheTimestamp(response);
            // Clone before returning to browser - browser will consume the body
            const timestampedClone = timestamped.clone();
            caches.open(CACHE_NAME).then((cache) => {
              safeCachePut(cache, event.request, timestampedClone);
            });
            return timestamped;
          }
          return response;
        });
      })
    );
    return;
  }
  
  // Navigation requests (pages) - stale-while-revalidate
  // This is the key change: we just let the page load normally
  // If there's a cached version, serve it. Otherwise, wait for network.
  // No more complex retry logic or "warming up" screens.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match(event.request).then(async (cached) => {
        // Check if cached response is a sign-in page (shouldn't serve for other routes)
        let cachedIsSignIn = false;
        if (cached && url.pathname !== '/') {
          cachedIsSignIn = await isSignInPageResponse(cached);
        }
        
        // Start network fetch
        const networkPromise = fetch(event.request)
          .then(async (response) => {
            if (shouldCacheResponse(response)) {
              const isSignIn = await isSignInPageResponse(response.clone());
              if (!isSignIn) {
                const timestamped = addCacheTimestamp(response);
                // Clone before async cache operation - response may be consumed by browser
                const timestampedClone = timestamped.clone();
                caches.open(CACHE_NAME).then((cache) => {
                  safeCachePut(cache, event.request, timestampedClone);
                });
              }
            }
            return response;
          });
        
        // If we have valid cache (not sign-in), serve it immediately
        // Network refresh happens in background
        if (cached && !cachedIsSignIn) {
          networkPromise.catch(() => {}); // Fire and forget
          return cached;
        }
        
        // No valid cache - wait for network
        // This is where cold starts happen, but we just let the browser
        // show its normal loading indicator instead of a custom page
        return networkPromise.catch(() => {
          // Network failed - try to serve any cached version as fallback
          if (cached && !cachedIsSignIn) {
            return cached;
          }
          
          // Last resort: simple offline message
          // Only shown when truly offline with no cache
          return new Response(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>Offline - Harvous</title>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <style>
                body { font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #F3F2EC; }
                .message { text-align: center; padding: 20px; }
                h1 { color: #4a473d; margin-bottom: 8px; }
                p { color: #78766f; }
                button { background: #007bff; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 16px; cursor: pointer; margin-top: 16px; }
              </style>
            </head>
            <body>
              <div class="message">
                <h1>You're offline</h1>
                <p>Check your connection and try again.</p>
                <button onclick="location.reload()">Retry</button>
              </div>
            </body>
            </html>
          `, {
            status: 503,
            headers: { 'Content-Type': 'text/html' }
          });
        });
      })
    );
    return;
  }
  
  // All other requests - network-first with cache fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (shouldCacheResponse(response)) {
          const timestamped = addCacheTimestamp(response);
          // Clone before returning to browser - browser will consume the body
          const timestampedClone = timestamped.clone();
          caches.open(CACHE_NAME).then((cache) => {
            safeCachePut(cache, event.request, timestampedClone);
          });
          return timestamped;
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || new Response('', { status: 404 })))
  );
});

// Handle messages from main thread
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting' || (event.data && event.data.type === 'SKIP_WAITING')) {
    self.skipWaiting();
  }
  
  // Warmup message - ping health endpoint
  if (event.data === 'warmup' || (event.data && event.data.type === 'warmup')) {
    fetch('/api/health', { method: 'GET', credentials: 'include' }).catch(() => {});
  }
});

// Online/offline events
self.addEventListener('online', () => {
  console.log('Service Worker: Online');
  // Warm up serverless function
  fetch('/api/health', { method: 'GET', credentials: 'include' }).catch(() => {});
  
  // Notify clients
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => client.postMessage({ type: 'online' }));
  });
});

self.addEventListener('offline', () => {
  console.log('Service Worker: Offline');
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => client.postMessage({ type: 'offline' }));
  });
});

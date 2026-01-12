// Service Worker for Harvous PWA
// Simple, reliable caching with stale-while-revalidate strategy

const CACHE_NAME = 'harvous-cache-v1-10-4';
const NAV_API_CACHE = 'harvous-nav-api-v8';
const CACHE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

const CRITICAL_ASSETS = [
  '/favicon.svg',
  '/favicon.png',
  '/manifest.json',
  '/scripts/pwa-startup.js'
];

// Install event
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

// Activate event
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

// Helper functions
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

const shouldCacheResponse = (response) => {
  if (!response) return false;
  const status = response.status;
  return status >= 200 && status < 300 && status !== 206;
};

const addCacheTimestamp = (response) => {
  if (!response) return response;
  const cloned = response.clone();
  const headers = new Headers(cloned.headers);
  if (!headers.has('date')) {
    headers.set('date', new Date().toUTCString());
  }
  return new Response(cloned.body, {
    status: response.status,
    statusText: response.statusText,
    headers: headers
  });
};

const safeCachePut = async (cache, request, response) => {
  try {
    await cache.put(request, response);
  } catch (error) {
    console.warn(`Service Worker: Cache put failed for ${request.url}`);
  }
};

const isNoteOrThreadPage = (pathname) => {
  if (/^\/\d+$/.test(pathname)) return true;
  return false;
};

const isCacheFresh = (cachedResponse, maxAge = 30000) => {
  if (!cachedResponse) return false;
  try {
    const dateHeader = cachedResponse.headers.get('date');
    if (!dateHeader) return false;
    const cacheDate = new Date(dateHeader).getTime();
    const age = Date.now() - cacheDate;
    return age < maxAge;
  } catch {
    return false;
  }
};

// Fetch event handler
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip cross-origin requests
  if (!url.origin.includes(self.location.origin)) {
    return;
  }
  
  // Auth routes - always network-first
  if (url.pathname.startsWith('/sign-in') || url.pathname.startsWith('/sign-up')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // Cacheable API endpoints
  const cacheableApiEndpoints = [
    '/api/navigation/data',
    '/api/spaces/items',
    '/api/notes/recent',
    '/api/threads/'
  ];

  const isCacheableApi = cacheableApiEndpoints.some(endpoint => {
    if (endpoint === '/api/notes/recent') {
      return url.pathname === '/api/notes/recent';
    }
    if (endpoint === '/api/threads/') {
      return url.pathname.startsWith('/api/threads/');
    }
    return url.pathname === endpoint;
  });

  if (isCacheableApi && event.request.method === 'GET') {
    event.respondWith(
      caches.open(NAV_API_CACHE).then((cache) => {
        return fetch(event.request)
          .then((response) => {
            if (shouldCacheResponse(response)) {
              const timestamped = addCacheTimestamp(response);
              const timestampedClone = timestamped.clone();
              safeCachePut(cache, event.request, timestampedClone);
            }
            return response;
          })
          .catch(() => {
            return cache.match(event.request).then((cached) => {
              if (cached) {
                return cached;
              }
              if (url.pathname === '/api/navigation/data') {
                return new Response(
                  JSON.stringify({ threads: [], spaces: [], inboxCount: 0 }),
                  { status: 200, headers: { 'Content-Type': 'application/json' } }
                );
              }
              if (url.pathname === '/api/spaces/items') {
                return new Response(
                  JSON.stringify({ notes: [], threads: [] }),
                  { status: 200, headers: { 'Content-Type': 'application/json' } }
                );
              }
              if (url.pathname === '/api/notes/recent') {
                return new Response(
                  JSON.stringify([]),
                  { status: 200, headers: { 'Content-Type': 'application/json' } }
                );
              }
              return new Response(
                JSON.stringify({ error: 'Network error' }),
                { status: 503, headers: { 'Content-Type': 'application/json' } }
              );
            });
          });
      })
    );
    return;
  }
  
  // Other API endpoints - no caching
  if (url.pathname.startsWith('/api/')) {
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
  
  // Non-GET requests
  if (event.request.method !== 'GET') {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // Font files - cache-first
  const isFontFile = /\.(woff2?|ttf|otf|eot)$/i.test(url.pathname);
  if (isFontFile) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) {
          fetch(event.request).then((response) => {
            if (shouldCacheResponse(response)) {
              caches.open(CACHE_NAME).then((cache) => {
                safeCachePut(cache, event.request, addCacheTimestamp(response.clone()));
              });
            }
          }).catch(() => {});
          return cached;
        }
        
        return fetch(event.request).then((response) => {
          if (shouldCacheResponse(response)) {
            const timestamped = addCacheTimestamp(response.clone());
            const responseToCache = timestamped.clone();
            caches.open(CACHE_NAME).then((cache) => {
              safeCachePut(cache, event.request, responseToCache);
            });
            return timestamped;
          }
          return response;
        }).catch(() => {
          return caches.match(event.request);
        });
      })
    );
    return;
  }
  
  // CSS files - cache-first
  const isCSSFile = /\.css$/i.test(url.pathname);
  if (isCSSFile) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) {
          fetch(event.request).then((response) => {
            if (shouldCacheResponse(response)) {
              caches.open(CACHE_NAME).then((cache) => {
                safeCachePut(cache, event.request, addCacheTimestamp(response.clone()));
              });
            }
          }).catch(() => {});
          return cached;
        }
        
        return fetch(event.request).then((response) => {
          if (shouldCacheResponse(response)) {
            const timestamped = addCacheTimestamp(response.clone());
            const responseToCache = timestamped.clone();
            caches.open(CACHE_NAME).then((cache) => {
              safeCachePut(cache, event.request, responseToCache);
            });
            return timestamped;
          }
          return response;
        }).catch(() => {
          return caches.match(event.request);
        });
      })
    );
    return;
  }
  
  // Static assets (/_astro/) - cache-first
  if (url.pathname.startsWith('/_astro/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) {
          fetch(event.request).then((response) => {
            if (shouldCacheResponse(response)) {
              const timestamped = addCacheTimestamp(response);
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
            const timestamped = addCacheTimestamp(response.clone());
            const responseToCache = timestamped.clone();
            caches.open(CACHE_NAME).then((cache) => {
              safeCachePut(cache, event.request, responseToCache);
            });
            return timestamped;
          }
          return response;
        }).catch(() => {
          return caches.match(event.request);
        });
      })
    );
    return;
  }
  
  // Navigation requests (pages)
  if (event.request.mode === 'navigate') {
    const isNoteOrThread = isNoteOrThreadPage(url.pathname);
    
    // For note/thread pages: network-only when online
    if (isNoteOrThread) {
      const isOnline = navigator.onLine;
      
      if (isOnline) {
        // Always go to network when online
        event.respondWith(
          fetch(event.request).then(async (response) => {
            // Cache for offline use
            if (shouldCacheResponse(response)) {
              const isSignIn = await isSignInPageResponse(response.clone());
              if (!isSignIn) {
                const timestamped = addCacheTimestamp(response);
                const timestampedClone = timestamped.clone();
                caches.open(CACHE_NAME).then((cache) => {
                  safeCachePut(cache, event.request, timestampedClone);
                });
              }
            }
            return response;
          }).catch(async () => {
            // Network failed - use cache if offline
            if (!navigator.onLine) {
              const cached = await caches.match(event.request);
              if (cached) {
                const cachedIsSignIn = await isSignInPageResponse(cached);
                if (!cachedIsSignIn) {
                  return cached;
                }
              }
            }
            // Show error page
            return new Response(`
              <!DOCTYPE html>
              <html>
              <head>
                <title>Connection Error - Harvous</title>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                  body { 
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center; 
                    min-height: 100vh; 
                    margin: 0; 
                    background: #F3F2EC; 
                    padding: 16px;
                  }
                  .message { 
                    text-align: center; 
                    padding: 32px; 
                    max-width: 500px;
                    background: white;
                    border-radius: 16px;
                    box-shadow: 0px 4px 16px rgba(0, 0, 0, 0.1);
                  }
                  h1 { color: #4a473d; margin: 0 0 12px 0; font-size: 24px; }
                  p { color: #78766f; margin: 0 0 24px 0; font-size: 16px; }
                  button { 
                    background: #4a473d; 
                    color: white; 
                    border: none; 
                    padding: 14px 24px; 
                    border-radius: 12px; 
                    font-size: 16px; 
                    cursor: pointer; 
                  }
                </style>
              </head>
              <body>
                <div class="message">
                  <h1>Unable to load page</h1>
                  <p>The page couldn't be loaded. This might be a temporary server issue or network problem.</p>
                  <button onclick="location.reload()">Retry</button>
                </div>
              </body>
              </html>
            `, {
              status: 503,
              headers: { 'Content-Type': 'text/html' }
            });
          })
        );
        return;
      } else {
        // Offline: serve from cache
        event.respondWith(
          caches.match(event.request).then(async (cached) => {
            if (cached) {
              const cachedIsSignIn = await isSignInPageResponse(cached);
              if (!cachedIsSignIn) {
                return cached;
              }
            }
            // No cache - show offline page
            return new Response(`
              <!DOCTYPE html>
              <html>
              <head>
                <title>Offline - Harvous</title>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                  body { 
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center; 
                    min-height: 100vh; 
                    margin: 0; 
                    background: #F3F2EC; 
                    padding: 16px;
                  }
                  .message { 
                    text-align: center; 
                    padding: 32px; 
                    max-width: 500px;
                    background: white;
                    border-radius: 16px;
                    box-shadow: 0px 4px 16px rgba(0, 0, 0, 0.1);
                  }
                  h1 { color: #4a473d; margin: 0 0 12px 0; font-size: 24px; }
                  p { color: #78766f; margin: 0 0 24px 0; font-size: 16px; }
                </style>
              </head>
              <body>
                <div class="message">
                  <h1>You're offline</h1>
                  <p>This page isn't cached. Visit pages while online to access them offline.</p>
                </div>
              </body>
              </html>
            `, {
              status: 503,
              headers: { 'Content-Type': 'text/html' }
            });
          })
        );
        return;
      }
    }
    
    // For all other pages: network-first when online, cache-first when offline
    event.respondWith(
      caches.match(event.request).then(async (cached) => {
        const isOnline = navigator.onLine;
        
        let cachedIsSignIn = false;
        if (cached && url.pathname !== '/') {
          cachedIsSignIn = await isSignInPageResponse(cached);
        }
        
        const networkPromise = fetch(event.request)
          .then(async (response) => {
            if (shouldCacheResponse(response)) {
              const isSignIn = await isSignInPageResponse(response.clone());
              if (!isSignIn) {
                const timestamped = addCacheTimestamp(response);
                const timestampedClone = timestamped.clone();
                caches.open(CACHE_NAME).then((cache) => {
                  safeCachePut(cache, event.request, timestampedClone);
                });
              }
            }
            return response;
          });
        
        if (isOnline) {
          return networkPromise.catch(() => {
            if (cached && !cachedIsSignIn && isCacheFresh(cached, 30000)) {
              return cached;
            }
            
            return new Response(`
              <!DOCTYPE html>
              <html>
              <head>
                <title>Connection Error - Harvous</title>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                  body { 
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center; 
                    min-height: 100vh; 
                    margin: 0; 
                    background: #F3F2EC; 
                    padding: 16px;
                  }
                  .message { 
                    text-align: center; 
                    padding: 32px; 
                    max-width: 500px;
                    background: white;
                    border-radius: 16px;
                    box-shadow: 0px 4px 16px rgba(0, 0, 0, 0.1);
                  }
                  h1 { color: #4a473d; margin: 0 0 12px 0; font-size: 24px; }
                  p { color: #78766f; margin: 0 0 24px 0; font-size: 16px; }
                  button { 
                    background: #4a473d; 
                    color: white; 
                    border: none; 
                    padding: 14px 24px; 
                    border-radius: 12px; 
                    font-size: 16px; 
                    cursor: pointer; 
                  }
                </style>
              </head>
              <body>
                <div class="message">
                  <h1>Unable to load page</h1>
                  <p>The page couldn't be loaded. This might be a temporary server issue or network problem.</p>
                  <button onclick="location.reload()">Retry</button>
                </div>
              </body>
              </html>
            `, {
              status: 503,
              headers: { 'Content-Type': 'text/html' }
            });
          });
        } else {
          if (cached && !cachedIsSignIn) {
            networkPromise.catch(() => {});
            return cached;
          }
          
          return networkPromise.catch(() => {
            const isActuallyOffline = !navigator.onLine;
            
            if (!isActuallyOffline) {
              return new Response(`
                <!DOCTYPE html>
                <html>
                <head>
                  <title>Connection Error - Harvous</title>
                  <meta charset="utf-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1">
                  <style>
                    body { 
                      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
                      display: flex; 
                      align-items: center; 
                      justify-content: center; 
                      min-height: 100vh; 
                      margin: 0; 
                      background: #F3F2EC; 
                      padding: 16px;
                    }
                    .message { 
                      text-align: center; 
                      padding: 32px; 
                      max-width: 500px;
                      background: white;
                      border-radius: 16px;
                      box-shadow: 0px 4px 16px rgba(0, 0, 0, 0.1);
                    }
                    h1 { color: #4a473d; margin: 0 0 12px 0; font-size: 24px; }
                    p { color: #78766f; margin: 0 0 24px 0; font-size: 16px; }
                    button { 
                      background: #4a473d; 
                      color: white; 
                      border: none; 
                      padding: 14px 24px; 
                      border-radius: 12px; 
                      font-size: 16px; 
                      cursor: pointer; 
                    }
                  </style>
                </head>
                <body>
                  <div class="message">
                    <h1>Unable to load page</h1>
                    <p>The page couldn't be loaded. This might be a temporary server issue or network problem.</p>
                    <button onclick="location.reload()">Retry</button>
                  </div>
                </body>
                </html>
              `, {
                status: 503,
                headers: { 'Content-Type': 'text/html' }
              });
            }
            
            return new Response(`
              <!DOCTYPE html>
              <html>
              <head>
                <title>Offline - Harvous</title>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                  body { 
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center; 
                    min-height: 100vh; 
                    margin: 0; 
                    background: #F3F2EC; 
                    padding: 16px;
                  }
                  .message { 
                    text-align: center; 
                    padding: 32px; 
                    max-width: 500px;
                    background: white;
                    border-radius: 16px;
                    box-shadow: 0px 4px 16px rgba(0, 0, 0, 0.1);
                  }
                  h1 { color: #4a473d; margin: 0 0 12px 0; font-size: 24px; }
                  p { color: #78766f; margin: 0 0 24px 0; font-size: 16px; }
                </style>
              </head>
              <body>
                <div class="message">
                  <h1>You're offline</h1>
                  <p>This page isn't cached. Visit pages while online to access them offline.</p>
                </div>
              </body>
              </html>
            `, {
              status: 503,
              headers: { 'Content-Type': 'text/html' }
            });
          });
        }
      })
    );
    return;
  }
  
  // All other requests - network-first with cache fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (shouldCacheResponse(response)) {
          const timestamped = addCacheTimestamp(response.clone());
          const responseToReturn = timestamped.clone();
          caches.open(CACHE_NAME).then((cache) => {
            safeCachePut(cache, event.request, timestamped);
          });
          return responseToReturn;
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
  
  if (event.data === 'warmup' || (event.data && event.data.type === 'warmup')) {
    fetch('/api/health', { method: 'GET', credentials: 'include' }).catch(() => {});
  }
});

// Online/offline events
self.addEventListener('online', () => {
  console.log('Service Worker: Online');
  fetch('/api/health', { method: 'GET', credentials: 'include' }).catch(() => {});
  
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

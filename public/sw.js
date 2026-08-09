// Service Worker for Harvous PWA
// Simple, reliable caching with stale-while-revalidate strategy

const CACHE_NAME = 'harvous-cache-v2-47-1';
const CACHE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

const CRITICAL_ASSETS = [
  '/images/harvous-2-icon.png',
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

// Activate event — drop obsolete NAV_API_CACHE (authenticated JSON must not linger)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
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

/**
 * True when the response body is obviously not what the URL asked for — the SPA catch-all
 * answering a deleted /assets/*.js with index.html at 200. Status alone can't catch that,
 * and caching it would serve HTML as JS for the life of this cache version.
 */
const isMistypedAssetResponse = (request, response) => {
  if (!request || !response) return false;
  let pathname;
  try {
    pathname = new URL(request.url).pathname;
  } catch (_) {
    return false;
  }
  if (!/\.(js|mjs|css)$/i.test(pathname)) return false;
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  return contentType.includes('text/html');
};

const shouldCacheResponse = (response, request) => {
  if (!response) return false;
  const status = response.status;
  if (!(status >= 200 && status < 300 && status !== 206)) return false;
  if (isMistypedAssetResponse(request, response)) {
    console.warn(`Service Worker: refusing to cache HTML for ${request.url}`);
    return false;
  }
  return true;
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

const DEDICATED_PROTOTYPE_HOSTS = new Set(['app.harvous.com', 'new.harvous.com', 'localhost']);
const NON_PROTOTYPE_PREFIXES = [
  '/sign-in',
  '/sign-up',
  '/spaces/join',
  '/shared/',
  '/invitations/',
  '/addon',
  '/upgrade',
  '/status',
  '/api/',
];
const RESERVED_PROTOTYPE_SEGMENTS = new Set([
  'settings',
  'space',
  'search',
  'admin',
  'n',
  'new',
  'compose',
  'church',
  'challenges',
  'compete',
  'learn',
  'org',
]);

function prototypeLogicalPath(pathname) {
  if (pathname.startsWith('/prototype')) {
    const rest = pathname.slice('/prototype'.length);
    return rest || '/';
  }
  return pathname;
}

function isNonPrototypeAppPath(logical) {
  return NON_PROTOTYPE_PREFIXES.some((p) => logical === p || logical.startsWith(p));
}

const isPrototypeNoteSlugPath = (pathname, hostname) => {
  if (!DEDICATED_PROTOTYPE_HOSTS.has(hostname)) return false;
  const logical = prototypeLogicalPath(pathname);
  if (isNonPrototypeAppPath(logical)) return false;
  const trimmed = logical.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!trimmed || trimmed.includes('/')) return false;
  if (RESERVED_PROTOTYPE_SEGMENTS.has(trimmed)) return false;
  return true;
};

const isNoteOrThreadPage = (pathname, hostname) => {
  if (/^\/\d+$/.test(pathname)) return true;
  if (/^\/(note|thread)\//.test(pathname)) return true;
  // Legacy `/n/{id}` and flat `/{id}` on dedicated hosts.
  if (/^\/n\/[^/]+\/?$/.test(pathname)) return true;
  if (isPrototypeNoteSlugPath(pathname, hostname)) return true;
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
  
  // Auth routes - always network-first with credentials
  if (url.pathname.startsWith('/sign-in') || url.pathname.startsWith('/sign-up')) {
    event.respondWith(
      fetch(event.request, { credentials: 'include' }).catch(() =>
        new Response(JSON.stringify({ error: 'Network error' }), {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // API routes - always network, no cache (credentials included). Authenticated responses
  // must never land in Cache Storage (shared-device / account-switch leakage).
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request, { credentials: 'include', cache: 'no-store' }).catch(() =>
        new Response(JSON.stringify({ error: 'Network error' }), {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // Non-GET requests
  if (event.request.method !== 'GET') {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // Everything under /assets/ is a Vite build output — content-hashed by filename (JS, CSS,
  // and fonts all land here, see vite.config.ts outDir), so a cache hit can never be stale:
  // a changed file gets a new filename, and a new deploy gets a new CACHE_NAME (see
  // scripts/inject-sw-cache-version.js). Serve straight from cache with no network hop at
  // all — this is what used to needlessly redownload the whole JS bundle on every launch.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;

        return fetch(event.request).then((response) => {
          if (shouldCacheResponse(response, event.request)) {
            const timestamped = addCacheTimestamp(response.clone());
            const responseToCache = timestamped.clone();
            caches.open(CACHE_NAME).then((cache) => {
              safeCachePut(cache, event.request, responseToCache);
            });
            return timestamped;
          }
          return response;
        }).catch(() =>
          // `caches.match` resolves undefined on a miss, and respondWith(undefined) throws —
          // which would turn a transient network blip into a hard failure for this asset.
          caches.match(event.request).then((fallback) =>
            fallback || new Response('', { status: 504, statusText: 'Asset unavailable' })
          )
        );
      })
    );
    return;
  }

  // Font files outside /assets/ (public/fonts/* — unhashed, can change between deploys without
  // a filename change) and any other stray CSS — cache-first, revalidate only once the cached
  // copy is older than CACHE_MAX_AGE instead of on every single hit.
  const isFontFile = /\.(woff2?|ttf|otf|eot)$/i.test(url.pathname);
  const isCSSFile = /\.css$/i.test(url.pathname);
  if (isFontFile || isCSSFile) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) {
          if (!isCacheFresh(cached, CACHE_MAX_AGE)) {
            fetch(event.request).then((response) => {
              if (shouldCacheResponse(response, event.request)) {
                caches.open(CACHE_NAME).then((cache) => {
                  safeCachePut(cache, event.request, addCacheTimestamp(response.clone()));
                });
              }
            }).catch(() => {});
          }
          return cached;
        }

        return fetch(event.request).then((response) => {
          if (shouldCacheResponse(response, event.request)) {
            const timestamped = addCacheTimestamp(response.clone());
            const responseToCache = timestamped.clone();
            caches.open(CACHE_NAME).then((cache) => {
              safeCachePut(cache, event.request, responseToCache);
            });
            return timestamped;
          }
          return response;
        }).catch(() =>
          // `caches.match` resolves undefined on a miss, and respondWith(undefined) throws —
          // which would turn a transient network blip into a hard failure for this asset.
          caches.match(event.request).then((fallback) =>
            fallback || new Response('', { status: 504, statusText: 'Asset unavailable' })
          )
        );
      })
    );
    return;
  }

  // Navigation requests (pages)
  if (event.request.mode === 'navigate') {
    const isNoteOrThread = isNoteOrThreadPage(url.pathname, url.hostname);
    const isIndexPage = url.pathname === '/';
    const isOnline = navigator.onLine;

    // Index page when online: stale-while-revalidate — serve cached app shell immediately (avoids blank
    // screen on lie-fi / slow network), then refresh cache in the background. List/data freshness is
    // handled by the client (React Query), not by blocking on HTML.
    if (isIndexPage && isOnline) {
      event.respondWith(
        caches.match(event.request).then(async (cached) => {
          let cachedOk = null;
          if (cached) {
            const cachedIsSignIn = await isSignInPageResponse(cached);
            if (!cachedIsSignIn) {
              cachedOk = cached;
            }
          }

          if (cachedOk) {
            fetch(event.request, { cache: 'no-cache' })
              .then(async (response) => {
                if (shouldCacheResponse(response, event.request)) {
                  const isSignIn = await isSignInPageResponse(response.clone());
                  if (!isSignIn) {
                    const timestamped = addCacheTimestamp(response);
                    const timestampedClone = timestamped.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                      safeCachePut(cache, event.request, timestampedClone);
                    });
                  }
                }
              })
              .catch(() => {});
            return cachedOk;
          }

          return fetch(event.request, { cache: 'no-cache' })
            .then(async (response) => {
              if (shouldCacheResponse(response, event.request)) {
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
            })
            .catch(async () => {
              const cachedFallback = await caches.match(event.request);
              if (cachedFallback) {
                const cachedIsSignIn = await isSignInPageResponse(cachedFallback);
                if (!cachedIsSignIn) {
                  return cachedFallback;
                }
              }
              return new Response(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>Connection Error | Harvous</title>
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
        })
      );
      return;
    }

    // For note/thread pages: network-only when online
    if (isNoteOrThread) {
      if (isOnline) {
        // Always go to network when online
        event.respondWith(
          fetch(event.request, { cache: 'no-cache' }).then(async (response) => {
            // Cache for offline use
            if (shouldCacheResponse(response, event.request)) {
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
                <title>Connection Error | Harvous</title>
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
                <title>Offline | Harvous</title>
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
        
        const networkPromise = fetch(event.request, { cache: 'no-cache' })
          .then(async (response) => {
            if (shouldCacheResponse(response, event.request)) {
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
                <title>Connection Error | Harvous</title>
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
                  <title>Connection Error | Harvous</title>
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
                <title>Offline | Harvous</title>
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
    fetch(event.request, { cache: 'no-cache' })
      .then((response) => {
        if (shouldCacheResponse(response, event.request)) {
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

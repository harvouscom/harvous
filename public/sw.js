// Service Worker for Harvous PWA
// Simple, reliable caching with stale-while-revalidate strategy

const CACHE_NAME = 'harvous-cache-v3-3-6';
const CACHE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

const CRITICAL_ASSETS = [
  '/images/harvous-2-icon.png',
  '/manifest.json',
  '/scripts/pwa-startup.js',
  // Notification chrome: a reminder can arrive while the device is offline-ish, and an icon
  // that 404s renders as the browser's generic bell rather than as Harvous.
  '/images/icons/icon-192.png',
  '/images/icons/badge-96.png'
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

// ─── Web push reminders ──────────────────────────────────────────────────────
// Everything below is the Sunday / midweek reminder. The three listeners are separate
// concerns: showing the notification, acting on a tap, and healing a rotated subscription.

const REMINDER_ICON = '/images/icons/icon-192.png';
const REMINDER_BADGE = '/images/icons/badge-96.png';

/**
 * Where a notification tap wants the app to go, parked somewhere the app can find it.
 *
 * postMessage alone is not enough. The message is delivered once, to whoever is listening at
 * that instant, and on a cold launch the app is still booting — so the tap that matters most,
 * the one that opens the app, is exactly the one whose message lands on nobody. Cache Storage
 * is same-origin and survives both the worker being killed and the app's boot, so the app can
 * come up and ask what it was opened for.
 */
const PENDING_NAV_CACHE = 'harvous-pending-navigation';
const PENDING_NAV_KEY = '/__harvous_pending_navigation';

async function setPendingNavigation(url) {
  try {
    const cache = await caches.open(PENDING_NAV_CACHE);
    // The key as a plain string, which is what reads it back too. Wrapping it in a Request
    // buys nothing and needs an absolute URL to construct outside a browser.
    await cache.put(
      PENDING_NAV_KEY,
      new Response(JSON.stringify({ url: url, at: Date.now() }), {
        headers: { 'Content-Type': 'application/json' },
      })
    );
  } catch (_) {
    // Falls back to the postMessage path, which is enough for an app already running.
  }
}

/**
 * Report what became of a notification.
 *
 * Sent with credentials, because a worker woken by a push has no Clerk bearer token — only
 * the session cookie.
 *
 * Every caller must AWAIT this inside `waitUntil`. It was originally fired with `void`, on
 * the reasoning that a lost report is harmless, and on iOS not one report ever arrived: the
 * worker is killed the moment the promise passed to `waitUntil` settles, and an un-awaited
 * fetch is simply killed with it. A failure genuinely is harmless — the next tick settles an
 * unreported delivery by attribution — but never being sent at all is not.
 */
function reportNotificationEvent(deliveryId, event) {
  if (!deliveryId) return Promise.resolve();
  return fetch('/api/push/event', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deliveryId: deliveryId, event: event }),
  }).catch(() => {});
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = {};
  }

  const title = data.title || 'Harvous';
  const options = {
    body: data.body || 'A minute with Scripture.',
    icon: data.icon || REMINDER_ICON,
    badge: data.badge || REMINDER_BADGE,
    tag: data.tag || 'harvous-reminder',
    // The tag alone collapses a Sunday and a midweek reminder into one row; renotify false
    // stops the second one from buzzing again for a message the reader already has.
    renotify: false,
    data: {
      url: (data.data && data.data.url) || '/',
      kind: data.data && data.data.kind,
      deliveryId: (data.data && data.data.deliveryId) || null,
    },
    actions: data.actions || [{ action: 'open', title: 'Open' }],
  };

  // showNotification is not optional. iOS revokes the push subscription of any app that
  // receives a push and shows nothing, so a silent push here would quietly unsubscribe every
  // iPhone on the next send.
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      navigator.setAppBadge ? navigator.setAppBadge(1).catch(() => {}) : Promise.resolve(),
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const payload = event.notification.data || {};
  const target = new URL(payload.url || '/', self.location.origin).href;

  event.waitUntil(
    (async () => {
      if (navigator.clearAppBadge) {
        try {
          await navigator.clearAppBadge();
        } catch (_) {
          /* not supported here */
        }
      }
      // Awaited, not fired and forgotten — see reportNotificationEvent.
      await reportNotificationEvent(payload.deliveryId, 'click');

      // Parked before focusing, so it is already there whether the app is booting or running.
      await setPendingNavigation(target);

      // Focus what is already open before opening anything new: someone with Harvous in a
      // background tab should be taken to it, not given a second copy of the app.
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const sameOrigin = clientList.find((client) => {
        try {
          return new URL(client.url).origin === self.location.origin;
        } catch (_) {
          return false;
        }
      });

      if (sameOrigin) {
        await sameOrigin.focus();
        /*
         * Ask the app to route, rather than driving the window from here.
         *
         * `WindowClient.navigate()` is the obvious call and does nothing on iOS — the window
         * comes to the front still showing whatever page it was on, so a reminder about
         * today's verse dropped you wherever you happened to be. It is also a full document
         * load where the app has a router that can do it without one.
         *
         * postMessage reaches the running app, which knows how to route. If nothing is
         * listening (an older cached bundle), the deep link is lost but the app is still open
         * and focused, which is the same outcome navigate() gave us anyway.
         */
        sameOrigin.postMessage({ type: 'HARVOUS_NOTIFICATION_NAVIGATE', url: target });
        return;
      }
      await self.clients.openWindow(target);
    })()
  );
});

self.addEventListener('notificationclose', (event) => {
  const payload = event.notification.data || {};
  // Already awaited by virtue of being the whole waitUntil promise.
  event.waitUntil(reportNotificationEvent(payload.deliveryId, 'close'));
});

/**
 * The browser rotated this subscription. Re-subscribe with the same application server key
 * and tell the server, or the next reminder goes to an endpoint that no longer exists.
 */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const old = event.oldSubscription;
      const applicationServerKey = old && old.options ? old.options.applicationServerKey : null;
      if (!applicationServerKey) return;

      try {
        const subscription = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey,
        });
        await fetch('/api/push/subscribe', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: subscription.toJSON() }),
        });
      } catch (_) {
        // The client re-syncs on the next app open (syncPushSubscriptionIfGranted), which is
        // the real safety net — this is just the earlier of the two chances.
      }
    })()
  );
});

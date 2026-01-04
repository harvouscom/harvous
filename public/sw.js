// Service Worker for Harvous PWA
// Improves initial load and re-engagement performance

const CACHE_NAME = 'harvous-cache-v8'; // Increment version to invalidate old cache (v8: clear cache after logger/incremental detection changes)
// Note: OFFLINE_URL should not be '/' as it may contain sign-in page
// Use a dedicated offline page or show error message instead
const OFFLINE_URL = null; // Don't use cached root as offline fallback
const NAV_API_CACHE = 'harvous-nav-api-v3'; // Increment version to invalidate old cache
const CACHE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours for navigation API
const PAGE_CACHE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours for page cache

// Resources to pre-cache for faster initial load
// Note: Removed '/' and '/dashboard' to prevent auth conflicts - authenticated routes should use network-first
// Root route '/' is excluded to prevent sign-in page flash
const CRITICAL_ASSETS = [
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

// Helper to check if a URL is a route (not a static asset)
// Routes are paths without file extensions that should be handled by fetch handler, not pre-cached
const isRouteURL = (url) => {
  try {
    const urlObj = new URL(url, self.location.origin);
    const pathname = urlObj.pathname;
    
    // Static asset paths should be cached
    if (pathname.startsWith('/_astro/') ||
        pathname.startsWith('/scripts/') ||
        pathname.startsWith('/icons/') ||
        pathname.startsWith('/videos/') ||
        pathname.includes('.')) { // Has file extension
      return false;
    }
    
    // Routes (paths without extensions) should not be pre-cached as assets
    // They're handled by the fetch event handler with appropriate strategies
    return true;
  } catch (e) {
    // If URL parsing fails, assume it's not a route
    return false;
  }
};

// Helper to cache assets individually, continuing even if some fail
// Filters out route URLs which should not be pre-cached as assets
const cacheAssetsIndividually = async (cache, assets) => {
  // Filter out route URLs - these are handled by fetch handler, not pre-cached
  const staticAssets = assets.filter(url => !isRouteURL(url));
  const routeURLs = assets.filter(url => isRouteURL(url));
  
  // Log if routes were filtered out (for debugging)
  if (routeURLs.length > 0) {
    console.log(`Service Worker: Skipping ${routeURLs.length} route(s) from asset caching: ${routeURLs.join(', ')}`);
  }
  
  // Only cache static assets
  if (staticAssets.length === 0) {
    return [];
  }
  
  const results = await Promise.allSettled(
    staticAssets.map(url => 
      cache.add(url).catch(err => {
        console.warn(`Failed to cache asset: ${url}`, err);
        return null; // Continue with other assets
      })
    )
  );
  
  const successful = results.filter(r => r.status === 'fulfilled' && r.value !== null).length;
  const failed = results.length - successful;
  
  if (failed > 0) {
    console.warn(`Service Worker: Cached ${successful}/${staticAssets.length} assets (${failed} failed)`);
  } else {
    console.log(`Service Worker: Successfully cached all ${staticAssets.length} assets`);
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
// IMPORTANT: Root route '/' is excluded to prevent sign-in page flash - it uses network-first
const isNavigationRoute = (url) => {
  const path = new URL(url).pathname;
  
  // Static navigation routes (excluding '/' which needs network-first for auth state)
  // Root route '/' is handled separately with network-first to ensure correct authentication
  if (path === '/find' || 
      path === '/profile' || 
      path === '/new-space') {
    return true;
  }
  
  // Dynamic routes (threads, spaces, notes)
  // Pattern: /{id} where id is not an API route or static asset
  // Exclude API routes, static assets, and special paths
  if (path === '/' || // Root route excluded - needs network-first for auth
      path.startsWith('/api/') || 
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

// Helper to check if a response is from the sign-in page
// This prevents serving cached sign-in HTML for authenticated routes
// Enhanced with timeout and fallback detection
const isSignInPageResponse = async (response) => {
  if (!response) return false;
  
  try {
    // Clone the response to avoid consuming the body
    const clonedResponse = response.clone();
    
    // Add timeout for reading response body (5 seconds max)
    const textPromise = clonedResponse.text();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout')), 5000)
    );
    
    const text = await Promise.race([textPromise, timeoutPromise]);
    
    // Check for sign-in page indicators in the HTML
    // These are unique elements from the sign-in page
    return text.includes('id="sign-in-content"') || 
           text.includes('sign-in-hidden') ||
           text.includes('ClerkSignIn') ||
           text.includes('<title>Sign In</title>');
  } catch (error) {
    // If we can't read the response (timeout or error), use fallback detection
    // Check response headers for content-type and size
    if (response.headers) {
      const contentType = response.headers.get('content-type') || '';
      const contentLength = response.headers.get('content-length');
      
      // If response is very small (< 1000 bytes), it's likely an error page
      if (contentLength && parseInt(contentLength) < 1000) {
        return false; // Too small to be a real page
      }
      
      // If content-type doesn't include html, it's not a sign-in page
      if (!contentType.includes('text/html')) {
        return false;
      }
    }
    
    // Safe default: assume it's not sign-in page if we can't determine
    return false;
  }
};

// Helper to check if root route should bypass cache
// Root route '/' needs network-first to prevent sign-in page flash
const isRootRoute = (url) => {
  const path = new URL(url).pathname;
  return path === '/';
};

// Idle detection: Track last successful root route fetch time
const IDLE_STORAGE_KEY = 'harvous-last-root-fetch';
const IDLE_CACHE_NAME = 'harvous-idle-state';

// Get last fetch time from cache
const getLastFetchTime = async () => {
  try {
    const cache = await caches.open(IDLE_CACHE_NAME);
    const cached = await cache.match(IDLE_STORAGE_KEY);
    if (cached) {
      const data = await cached.json();
      return data.timestamp || 0;
    }
  } catch (error) {
    // Ignore errors - return 0 to assume long idle period
  }
  return 0;
};

// Update last fetch time
const updateLastFetchTime = async () => {
  try {
    const cache = await caches.open(IDLE_CACHE_NAME);
    const timestamp = Date.now();
    await cache.put(IDLE_STORAGE_KEY, new Response(JSON.stringify({ timestamp }), {
      headers: { 'Content-Type': 'application/json' }
    }));
  } catch (error) {
    // Ignore errors - not critical
  }
};

// Get timeout based on idle period
const getTimeoutForIdlePeriod = async () => {
  const lastFetch = await getLastFetchTime();
  const now = Date.now();
  const idleHours = lastFetch > 0 ? (now - lastFetch) / (1000 * 60 * 60) : 999; // Assume long idle if no record
  
  if (idleHours > 6) return 30000; // 30 seconds for > 6 hours idle
  if (idleHours > 1) return 20000; // 20 seconds for 1-6 hours idle
  return 10000; // 10 seconds default
};

// Detect if request comes after sign-in redirect
const isPostSignInRequest = (request) => {
  // Check referrer header for sign-in page
  const referrer = request.headers.get('referer') || request.headers.get('referrer') || '';
  if (referrer.includes('/sign-in') || referrer.includes('/sign-up')) {
    return true;
  }
  
  // Check if URL has redirect_url param (coming from sign-in)
  try {
    const url = new URL(request.url);
    if (url.searchParams.has('redirect_url')) {
      return true;
    }
  } catch (e) {
    // Ignore URL parsing errors
  }
  
  return false;
};

// Fetch with retry logic and exponential backoff
const fetchWithRetry = async (request, maxRetries = 3) => {
  let lastError = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Get timeout based on idle period (only on first attempt, then use shorter timeouts)
      const baseTimeout = attempt === 0 ? await getTimeoutForIdlePeriod() : 15000;
      
      const response = await Promise.race([
        fetch(request),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Network timeout')), baseTimeout)
        )
      ]);
      
      // Validate response
      if (!response || !response.ok) {
        throw new Error(`Invalid response: ${response?.status || 'no response'}`);
      }
      
      // Check response size - reject if too small (likely error)
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) < 1000) {
        throw new Error('Response too small');
      }
      
      // Success - update last fetch time
      await updateLastFetchTime();
      return response;
    } catch (error) {
      lastError = error;
      
      // If this was the last attempt, throw the error
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // Should never reach here, but TypeScript needs it
  throw lastError || new Error('Unknown error');
};

// Helper to create a network error page
// Shows a user-friendly error message - authentication redirects are handled by middleware
const createNetworkErrorPage = (currentUrl, isPostSignIn = false) => {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Network Error</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      background: #f5f5f5;
    }
    .error-container {
      text-align: center;
      background: white;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      max-width: 500px;
    }
    h1 {
      color: #333;
      margin: 0 0 16px 0;
    }
    p {
      color: #666;
      margin: 0 0 24px 0;
      line-height: 1.5;
    }
    .status-message {
      color: #888;
      font-size: 14px;
      margin: 16px 0;
      min-height: 20px;
    }
    .retry-countdown {
      color: #007bff;
      font-weight: 500;
    }
    button {
      background: #007bff;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 16px;
      margin: 8px;
      transition: background 0.2s;
    }
    button:hover {
      background: #0056b3;
    }
    button:disabled {
      background: #ccc;
      cursor: not-allowed;
    }
    .button-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: center;
    }
    @media (min-width: 480px) {
      .button-group {
        flex-direction: row;
        justify-content: center;
      }
    }
  </style>
</head>
<body>
  <div class="error-container">
    <h1>Network Error</h1>
    <p>${isPostSignIn 
      ? 'The server is warming up after a period of inactivity. This usually takes 10-30 seconds. Please wait while we reconnect...'
      : 'Unable to connect to the server. The server may be warming up after a period of inactivity.'}</p>
    <div class="status-message" id="statusMessage"></div>
    <div class="button-group">
      <button id="retryButton" onclick="retryConnection()">Retry Now</button>
      <button onclick="window.location.reload()">Reload Page</button>
    </div>
  </div>
  <script>
    let retryCount = 0;
    let autoRetryTimeout = null;
    let countdownInterval = null;
    const maxRetries = 5;
    const retryDelays = [2000, 4000, 8000, 16000, 30000]; // Exponential backoff
    
    function updateStatus(message, showCountdown = false) {
      const statusEl = document.getElementById('statusMessage');
      if (showCountdown && retryCount < maxRetries) {
        let countdown = retryDelays[retryCount] / 1000;
        statusEl.innerHTML = message + ' <span class="retry-countdown">(Retrying in ' + countdown + 's...)</span>';
        
        if (countdownInterval) clearInterval(countdownInterval);
        countdownInterval = setInterval(() => {
          countdown--;
          if (countdown > 0) {
            statusEl.innerHTML = message + ' <span class="retry-countdown">(Retrying in ' + countdown + 's...)</span>';
          } else {
            clearInterval(countdownInterval);
            statusEl.innerHTML = message + ' <span class="retry-countdown">(Retrying now...)</span>';
          }
        }, 1000);
      } else {
        statusEl.textContent = message;
      }
    }
    
    function retryConnection() {
      if (retryCount >= maxRetries) {
        updateStatus('Maximum retry attempts reached. Please reload the page.');
        return;
      }
      
      const button = document.getElementById('retryButton');
      button.disabled = true;
      updateStatus('Attempting to reconnect... (Attempt ' + (retryCount + 1) + ' of ' + maxRetries + ')', false);
      
      // Try to fetch the page
      fetch(window.location.href, { 
        method: 'GET',
        cache: 'no-store',
        credentials: 'include'
      })
        .then(response => {
          if (response.ok) {
            // Success - reload the page
            window.location.reload();
          } else {
            throw new Error('Response not ok: ' + response.status);
          }
        })
        .catch(error => {
          retryCount++;
          if (retryCount < maxRetries) {
            const delay = retryDelays[retryCount - 1];
            updateStatus('Connection failed. Retrying... (Attempt ' + retryCount + ' of ' + maxRetries + ')', true);
            button.disabled = false;
            autoRetryTimeout = setTimeout(retryConnection, delay);
          } else {
            updateStatus('Unable to connect after ' + maxRetries + ' attempts. Please check your internet connection and try reloading.');
            button.disabled = false;
            button.textContent = 'Try Again';
          }
        });
    }
    
    // Auto-retry on page load if post-sign-in
    if (${isPostSignIn ? 'true' : 'false'}) {
      updateStatus('Waiting for server to warm up...', true);
      autoRetryTimeout = setTimeout(retryConnection, retryDelays[0]);
    } else {
      updateStatus('Click "Retry Now" to attempt reconnection.');
    }
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
      if (autoRetryTimeout) clearTimeout(autoRetryTimeout);
      if (countdownInterval) clearInterval(countdownInterval);
    });
  </script>
</body>
</html>`;
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
  
  // Root route '/' uses network-first to prevent sign-in page flash
  // This ensures authenticated users always get the dashboard, not cached sign-in page
  if (isRootRoute(event.request.url) && event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        // Check if this is a post-sign-in request (needs longer timeout)
        const postSignIn = isPostSignInRequest(event.request);
        
        // Try to get cached response first (for graceful degradation)
        const cachedResponse = await caches.match(event.request);
        let validCachedResponse = null;
        
        if (cachedResponse) {
          // Validate cached response
          const contentLength = cachedResponse.headers.get('content-length');
          if (contentLength && parseInt(contentLength) >= 1000) {
            // Check if cached response is sign-in page - don't serve it
            const isSignIn = await isSignInPageResponse(cachedResponse.clone());
            if (!isSignIn) {
              validCachedResponse = cachedResponse;
            }
          }
        }
        
        try {
          // Use retry logic with exponential backoff
          const response = await fetchWithRetry(event.request, 3);
          
          // Cache the fresh response only if it's successful and NOT sign-in page
          if (shouldCacheResponse(response)) {
            // Check if this is a sign-in page response (shouldn't cache for root)
            const isSignIn = await isSignInPageResponse(response.clone());
            if (!isSignIn) {
              const responseClone = response.clone();
              const timestampedResponse = addCacheTimestamp(responseClone);
              const cacheClone = timestampedResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                safeCachePut(cache, event.request, cacheClone);
              });
            }
          }
          
          return response;
        } catch (error) {
          // If all retries failed, try to use cached response if available
          if (validCachedResponse) {
            // Return cached response while showing it might be stale
            return validCachedResponse;
          }
          
          // Fallback: return a user-friendly HTML error page with auto-retry
          // Middleware handles authentication redirects if needed
          return new Response(createNetworkErrorPage(event.request.url, postSignIn), {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/html' }
          });
        }
      })()
    );
    return;
  }
  
  // Handle navigation API with stale-while-revalidate strategy for faster loads
  // This returns cached data immediately (even if stale) and refreshes in background
  if (url.pathname === '/api/navigation/data' && event.request.method === 'GET') {
    event.respondWith(
      caches.open(NAV_API_CACHE).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          // Always return cached response immediately if available (stale-while-revalidate)
          // This provides instant navigation data while fresh data loads in background
          if (cachedResponse) {
            // Refresh in background regardless of staleness
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
              .catch(() => { /* Ignore errors - cached data is still valid */ });
            return cachedResponse;
          }
          
          // No cache - fetch fresh data
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
  // Note: Root route '/' is handled above with network-first strategy
  if (event.request.mode === 'navigate' || isNavigationRoute(event.request.url)) {
    event.respondWith(
      caches.match(event.request)
        .then(async (cachedResponse) => {
          const isStale = isCacheStale(cachedResponse, PAGE_CACHE_MAX_AGE);
          
          // Additional check: verify cached response is not sign-in page HTML
          // This prevents serving sign-in page for any authenticated route
          let isSignInCached = false;
          if (cachedResponse && !isStale) {
            // Validate cached response size
            const contentLength = cachedResponse.headers.get('content-length');
            if (contentLength && parseInt(contentLength) < 1000) {
              // Cached response is too small, treat as invalid
            } else {
              isSignInCached = await isSignInPageResponse(cachedResponse.clone());
            }
          }
          
          if (cachedResponse && !isStale && !isSignInCached) {
            // Return cached response immediately for instant navigation
            // Refresh cache in the background
            Promise.race([
              fetch(event.request),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Network timeout')), 10000)
              )
            ])
              .then(async response => {
                if (response && shouldCacheResponse(response)) {
                  // Validate response size
                  const contentLength = response.headers.get('content-length');
                  if (contentLength && parseInt(contentLength) < 1000) {
                    return; // Response too small, don't cache
                  }
                  
                  // Don't cache sign-in page responses for navigation routes
                  const isSignIn = await isSignInPageResponse(response.clone());
                  if (!isSignIn) {
                    const responseClone = response.clone();
                    const timestampedResponse = addCacheTimestamp(responseClone);
                    const cacheClone = timestampedResponse.clone();
                    caches.open(CACHE_NAME).then(cache => {
                      safeCachePut(cache, event.request, cacheClone);
                    });
                  }
                }
              })
              .catch(() => { /* Ignore errors - use cached version */ });
            
            return cachedResponse;
          }
          
          // Cache is stale, missing, or contains sign-in page - fetch fresh data
          return Promise.race([
            fetch(event.request),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Network timeout')), 10000)
            )
          ])
            .then(async response => {
              // Validate response before using
              if (!response || !response.ok) {
                throw new Error('Invalid response');
              }
              
              // Check response size - reject if too small (likely error)
              const contentLength = response.headers.get('content-length');
              if (contentLength && parseInt(contentLength) < 1000) {
                throw new Error('Response too small');
              }
              
              if (shouldCacheResponse(response)) {
                // Don't cache sign-in page responses for navigation routes
                const isSignIn = await isSignInPageResponse(response.clone());
                if (!isSignIn) {
                  const responseClone = response.clone();
                  const timestampedResponse = addCacheTimestamp(responseClone);
                  const cacheClone = timestampedResponse.clone();
                  caches.open(CACHE_NAME).then(cache => {
                    safeCachePut(cache, event.request, cacheClone);
                  });
                  return timestampedResponse;
                }
              }
              return response;
            })
            .catch(async () => {
              // If network fails and we have stale cache (that's not sign-in page), use it
              if (cachedResponse && !isSignInCached) {
                // Validate cached response size before serving
                const contentLength = cachedResponse.headers.get('content-length');
                if (!contentLength || parseInt(contentLength) >= 1000) {
                  return cachedResponse;
                }
              }
              // Try to serve cached dashboard first
              return caches.match('/dashboard')
                .then(cachedDashboard => {
                  if (cachedDashboard) {
                    // Validate dashboard response size
                    const contentLength = cachedDashboard.headers.get('content-length');
                    if (!contentLength || parseInt(contentLength) >= 1000) {
                      return cachedDashboard;
                    }
                  }
                  // Fallback: return a user-friendly HTML error page
                  // Middleware handles authentication redirects if needed
                  return new Response(createNetworkErrorPage(event.request.url), {
                    status: 503,
                    statusText: 'Service Unavailable',
                    headers: { 'Content-Type': 'text/html' }
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
  if (event.data === 'warmup' || (event.data && event.data.type === 'warmup')) {
    const extendedIdle = event.data?.extendedIdle || false;
    
    // Pre-fetch assets that might be needed soon
    // Note: Root route '/' is NOT pre-cached to prevent sign-in page flash
    // It uses network-first strategy to ensure correct authentication state
    caches.open(CACHE_NAME).then((cache) => {
      // Pre-fetch static assets only - authenticated routes use network-first
      // Don't pre-cache '/' as it needs fresh auth state on each load
      console.log('Service Worker: Warmup - skipping root route to prevent auth issues');
      
      // Routes like /find, /profile, and '/' are handled by the fetch event handler
      // with appropriate strategies, so they don't need to be pre-cached here
    });
    
    // Ping health endpoint to warm up serverless functions
    // This helps reduce cold start delays for the first user action
    // For extended idle, make multiple warmup calls
    if (extendedIdle) {
      warmUpServerlessFunctions();
      // Second warmup call after 1 second to ensure function is ready
      setTimeout(() => {
        warmUpServerlessFunctions();
      }, 1000);
    } else {
      warmUpServerlessFunctions();
    }
  }
});

/**
 * Warm up serverless functions by pinging lightweight endpoints
 * Called on warmup message and when coming back online
 */
function warmUpServerlessFunctions() {
  // Ping the health endpoint - it's lightweight and wakes up the function fast
  fetch('/api/health', { 
    method: 'GET',
    credentials: 'include'
  }).catch(() => {
    // Silently fail - this is just a warmup
  });
}

// Handle online/offline events for mobile devices
self.addEventListener('online', () => {
  console.log('Service Worker: Online - refreshing stale cache');
  
  // Immediately warm up serverless functions when coming back online
  // This is critical for preventing cold start delays after extended offline periods
  warmUpServerlessFunctions();
  
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
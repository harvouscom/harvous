/**
 * PWA Startup Performance Optimization
 * 
 * This script improves the initial load and re-engagement experience
 * for the PWA, especially addressing first-interaction delay.
 */

// Check if launched as standalone app
const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                    window.navigator.standalone === true;

// Cache of critical selectors for better app performance
const cachedElements = {};
let isWarmedUp = false;

/**
 * Warm up the app when it launches or returns from background
 */
function warmUpApp() {
  if (isWarmedUp) return;

  // Mark that initial warmup is complete
  isWarmedUp = true;
  
  // Set a short timeout to allow the UI to render first
  setTimeout(() => {
    // Prefetch critical routes immediately
    prefetchCriticalRoutes();
    
    // Prepare UI components that will be needed right away
    preCacheElements();

    // Preload thread data
    warmUpLocalData();
    
    // Warm up API endpoints to prevent cold start delays
    // This is critical for preventing the first-action delay
    // Add delay to allow Clerk auth to establish after sign-in redirect
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        // Additional delay to ensure auth is ready after sign-in
        setTimeout(() => {
          warmUpAPI();
        }, 500);
      }, { timeout: 2000 });
    } else {
      // Additional delay to ensure auth is ready after sign-in
      setTimeout(() => {
        warmUpAPI();
      }, 1500);
    }
    
    // Tell the service worker to warm up
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage('warmup');
    }
    
    // Schedule non-critical work
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        prefetchLowPriorityRoutes();
      });
    } else {
      setTimeout(prefetchLowPriorityRoutes, 2000);
    }
  }, 50);
}

/**
 * Prefetch critical routes immediately
 */
function prefetchCriticalRoutes() {
  // Only prefetch the current route area
  const currentPath = window.location.pathname;
  let criticalRoute = '/';
  
  // Determine the most likely immediate need
  if (currentPath.includes('/threads')) {
    criticalRoute = '/threads';
  } else if (currentPath === '/') {
    criticalRoute = '/';
  }
  
  try {
    const prefetcher = document.createElement('link');
    prefetcher.rel = 'prefetch';
    prefetcher.href = criticalRoute;
    document.head.appendChild(prefetcher);
  } catch (e) {
    // Ignore errors
  }
}

/**
 * Prefetch less critical routes when idle
 */
function prefetchLowPriorityRoutes() {
  const routes = ['/find', '/profile'];
  
  routes.forEach(route => {
    try {
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = route;
      document.head.appendChild(link);
    } catch (e) {
      // Ignore errors
    }
  });
}

/**
 * Cache common DOM elements that will be needed for UI interaction
 */
function preCacheElements() {
  // Cache commonly accessed UI elements to avoid DOM queries on first interaction
  // This reduces the delay when the user first interacts with the app
  cachedElements.actionBar = document.getElementById('global-action-bar');
  cachedElements.threadCards = document.querySelectorAll('.thread-card');
  cachedElements.tabs = document.querySelectorAll('.close-tab-btn');
  
  // Add click event listeners directly to speed up first interaction
  if (cachedElements.tabs) {
    Array.from(cachedElements.tabs).forEach(tab => {
      // Create an invisible clone of the button to preload any resources
      const tabClone = tab.cloneNode(true);
      tabClone.style.position = 'absolute';
      tabClone.style.opacity = '0';
      tabClone.style.pointerEvents = 'none';
      tabClone.setAttribute('aria-hidden', 'true');
      document.body.appendChild(tabClone);
      setTimeout(() => {
        document.body.removeChild(tabClone);
      }, 500);
    });
  }
}

/**
 * Warm up local data access
 */
function warmUpLocalData() {
  // Clear large stale data that might cause performance issues
  const keysToCheck = [
    'noteEditState',
    'lastViewedThread',
    'lastViewedNote', 
    'sourceThreadForNote'
  ];
  
  try {
    // Access and clean up localStorage data
    keysToCheck.forEach(key => {
      const value = localStorage.getItem(key);
      if (value && value.length > 5000) {
        // If it's an extremely large value, remove it
        localStorage.removeItem(key);
      }
    });
  } catch (e) {
    // Ignore errors
  }
}

/**
 * Check if Clerk authentication is ready
 * Returns true if auth cookies/tokens are present
 */
function isAuthReady() {
  // Check for Clerk session cookie or token
  // Clerk typically sets cookies like __clerk_db_jwt, __session, etc.
  const cookies = document.cookie.split(';');
  const hasClerkCookie = cookies.some(cookie => 
    cookie.trim().startsWith('__clerk') || 
    cookie.trim().startsWith('__session')
  );
  
  // Also check if we're on a protected route (not sign-in/sign-up)
  const isProtectedRoute = !window.location.pathname.includes('/sign-in') && 
                          !window.location.pathname.includes('/sign-up');
  
  return hasClerkCookie || isProtectedRoute;
}

/**
 * Warm up API endpoints to prevent cold start delays
 * This proactively calls multiple API endpoints in parallel to warm up
 * serverless functions and database connections
 * 
 * @param {Object} options - Warmup options
 * @param {boolean} options.skipThrottle - Skip the throttle check (for visibility change)
 * @param {boolean} options.extendedIdle - True if idle > 1 hour (aggressive warmup)
 * @param {number} options.retryCount - Internal retry counter
 */
function warmUpAPI(options = {}) {
  const { skipThrottle = false, extendedIdle = false, retryCount = 0 } = options;
  const now = Date.now();
  
  // Only apply throttle for regular warmups, not visibility change warmups
  // Cold starts happen after 1+ hour idle, so 5-minute throttle is too aggressive
  if (!skipThrottle) {
    const lastWarmup = sessionStorage.getItem('lastAPIWarmup');
    const fiveMinutes = 5 * 60 * 1000;
    
    if (lastWarmup && (now - parseInt(lastWarmup, 10)) < fiveMinutes) {
      // Already warmed up recently, skip
      return;
    }
  }
  
  // Check if auth is ready before making API call
  // After sign-in redirect, auth may not be fully established yet
  if (!isAuthReady() && retryCount < 3) {
    // Wait for auth to establish with exponential backoff
    const delay = Math.min(500 * Math.pow(2, retryCount), 2000);
    setTimeout(() => {
      warmUpAPI({ skipThrottle, extendedIdle, retryCount: retryCount + 1 });
    }, delay);
    return;
  }
  
  // Add additional delay after sign-in to ensure auth is fully propagated
  // This prevents race conditions where API is called before auth is ready
  // For extended idle, reduce delay to warm up faster
  const initialDelay = extendedIdle ? 200 : (retryCount === 0 ? 500 : 0);
  
  setTimeout(() => {
    // For extended idle, make multiple warmup calls to ensure server is ready
    const warmupPromises = extendedIdle ? [
      // First call - wake up the function
      fetch('/api/health', {
        method: 'GET',
        credentials: 'include'
      }).catch(() => null),
      // Second call after short delay - ensure it's warmed up
      new Promise(resolve => setTimeout(() => {
        fetch('/api/health', {
          method: 'GET',
          credentials: 'include'
        }).catch(() => null).then(resolve);
      }, 1000))
    ] : [
      // Health endpoint - returns immediately, wakes function
      fetch('/api/health', {
        method: 'GET',
        credentials: 'include'
      }).catch(() => null)
    ];
    
    // Call multiple endpoints IN PARALLEL to maximize warmup effectiveness
    // The health endpoint is ultra-lightweight and wakes the function fast
    // The navigation/data endpoint warms up database connections
    Promise.all([
      ...warmupPromises,
      // Navigation data - warms database connection
      fetch('/api/navigation/data', {
        method: 'GET',
        credentials: 'include'
      }).catch(() => null)
    ])
      .then((responses) => {
        // Mark warmup as successful if at least one succeeded
        const healthResponse = responses[0];
        const navResponse = responses[responses.length - 1];
        if ((healthResponse && healthResponse.ok) || (navResponse && navResponse.ok)) {
          sessionStorage.setItem('lastAPIWarmup', now.toString());
        } else if (navResponse && navResponse.status === 401 && retryCount < 2) {
          // Auth not ready yet, retry with exponential backoff
          const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 3000);
          setTimeout(() => {
            warmUpAPI({ skipThrottle, extendedIdle, retryCount: retryCount + 1 });
          }, retryDelay);
        }
        // Silently handle errors - auth will establish soon
      })
      .catch(() => {
        // Silently fail - this is just a warmup, not critical
        // Only retry on network errors if we haven't retried too many times
        if (retryCount < 2) {
          const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 3000);
          setTimeout(() => {
            warmUpAPI({ skipThrottle, extendedIdle, retryCount: retryCount + 1 });
          }, retryDelay);
        }
      });
  }, initialDelay);
}

/**
 * Apply CSS optimizations to improve UI rendering performance
 */
function applyCssOptimizations() {
  // CSS optimizations
  const style = document.createElement('style');
  style.textContent = `
    /* Add will-change to elements that need animation */
    .thread-card, .note-card-placeholder {
      will-change: transform;
      contain: content;
    }
    
    /* Optimize tab buttons for first touch */
    .close-tab-btn {
      touch-action: manipulation;
      will-change: opacity;
    }
    
    /* Optimize text fields */
    trix-editor {
      will-change: contents;
      contain: content;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Initialize the PWA optimization
 */
function initPWA() {
  // Apply CSS optimizations regardless of whether it's a standalone PWA
  applyCssOptimizations();
  
  // Prep for touch inputs
  document.addEventListener('touchstart', () => {}, {passive: true});
  
  // Always set up visibility change listener to warm up API on return from background
  // This is critical for preventing cold start delays after 1+ hour idle
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      // Detect extended idle period
      const lastWarmup = sessionStorage.getItem('lastAPIWarmup');
      const now = Date.now();
      const idleMinutes = lastWarmup ? (now - parseInt(lastWarmup, 10)) / (1000 * 60) : 999;
      const extendedIdle = idleMinutes > 60; // More than 1 hour
      
      // App is visible again - warm up API IMMEDIATELY to prevent cold start
      // Skip the normal throttle since cold starts happen after extended idle (1+ hours)
      // This ensures the serverless function is waking up before the user takes action
      warmUpAPI({ skipThrottle: true, extendedIdle });
      
      // Signal service worker about warmup state
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ 
          type: 'warmup',
          extendedIdle 
        });
      }
      
      // Also reset warmup flag and do full app warmup
      isWarmedUp = false;
      warmUpApp();
    }
  });
  
  // Execute full warmup if in standalone mode
  if (isStandalone) {
    // Immediate warm up when the page loads
    warmUpApp();
  }
}

// Run the initialization as early as possible
initPWA();

// Also run when fully loaded to catch any missed elements
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', warmUpApp);
} else {
  warmUpApp();
}

// Expose the API for other scripts to use
window.pwaPerformance = {
  warmUp: warmUpApp,
  prefetchRoutes: prefetchLowPriorityRoutes,
  cachedElements: cachedElements
}; 
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
 * This proactively calls a lightweight API endpoint to warm up
 * serverless functions and database connections
 * 
 * Now includes auth readiness check and retry logic to prevent
 * race conditions after sign-in redirect
 */
function warmUpAPI(retryCount = 0) {
  // Only warm up if we haven't done so recently (within last 5 minutes)
  const lastWarmup = sessionStorage.getItem('lastAPIWarmup');
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;
  
  if (lastWarmup && (now - parseInt(lastWarmup, 10)) < fiveMinutes) {
    // Already warmed up recently, skip
    return;
  }
  
  // Check if auth is ready before making API call
  // After sign-in redirect, auth may not be fully established yet
  if (!isAuthReady() && retryCount < 3) {
    // Wait for auth to establish with exponential backoff
    const delay = Math.min(500 * Math.pow(2, retryCount), 2000);
    setTimeout(() => {
      warmUpAPI(retryCount + 1);
    }, delay);
    return;
  }
  
  // Add additional delay after sign-in to ensure auth is fully propagated
  // This prevents race conditions where API is called before auth is ready
  const initialDelay = retryCount === 0 ? 500 : 0;
  
  setTimeout(() => {
    // Call a lightweight API endpoint to warm up the serverless function
    // This endpoint is cached and lightweight, perfect for warming up
    fetch('/api/navigation/data', {
      method: 'GET',
      credentials: 'include'
    })
      .then((response) => {
        if (response.ok) {
          // Mark that we've warmed up successfully
          sessionStorage.setItem('lastAPIWarmup', now.toString());
        } else if (response.status === 401 && retryCount < 2) {
          // Auth not ready yet, retry with exponential backoff
          const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 3000);
          setTimeout(() => {
            warmUpAPI(retryCount + 1);
          }, retryDelay);
        }
        // Silently handle 401 errors - auth will establish soon
        // Don't show errors for warmup failures
      })
      .catch(() => {
        // Silently fail - this is just a warmup, not critical
        // Only retry on network errors if we haven't retried too many times
        if (retryCount < 2) {
          const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 3000);
          setTimeout(() => {
            warmUpAPI(retryCount + 1);
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
  // This is critical for preventing cold start delays, not just for standalone PWAs
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      // App is visible again - warm up API to prevent cold start
      // Reset warmup flag so we can warm up again
      isWarmedUp = false;
      
      // Warm up immediately when returning from background
      // This ensures the first user action is fast
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
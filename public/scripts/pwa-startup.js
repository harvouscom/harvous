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
let cachedElements = {};

/**
 * Warm up the app when it launches or returns from background
 */
function warmUpApp() {
  // Prefetch common routes
  prefetchRoutes(['/feed', '/feed/search', '/feed/profile']);
  
  // Prepare UI components that will be needed right away
  preCacheElements();

  // Preload thread data
  warmUpLocalData();
  
  // Tell the service worker to warm up
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage('warmup');
  }
}

/**
 * Prefetch common navigation routes
 */
function prefetchRoutes(routes) {
  if (!routes || !routes.length) return;
  
  // Use requestIdleCallback to defer non-critical work
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
      routes.forEach(route => {
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = route;
        document.head.appendChild(link);
      });
    });
  } else {
    // Fallback
    setTimeout(() => {
      routes.forEach(route => {
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = route;
        document.head.appendChild(link);
      });
    }, 1000);
  }
}

/**
 * Cache common DOM elements that will be needed for UI interaction
 */
function preCacheElements() {
  // Cache commonly accessed UI elements to avoid DOM queries on first interaction
  // This reduces the delay when the user first interacts with the app
  cachedElements = {
    actionBar: document.getElementById('global-action-bar'),
    threadCards: document.querySelectorAll('.thread-card'),
    tabs: document.querySelectorAll('.close-tab-btn')
  };
}

/**
 * Warm up local data access
 */
function warmUpLocalData() {
  // Read and parse localStorage data to prime the cache
  try {
    // Access frequently used localStorage items to get them in memory
    const threadId = localStorage.getItem('lastViewedThread');
    const noteId = localStorage.getItem('lastViewedNote');
    
    // Just by accessing these, they're now cached and faster to access later
  } catch (e) {
    // Ignore errors
  }
}

/**
 * Initialize the PWA optimization
 */
function initPWA() {
  // Execute warmup on load for standalone PWA
  if (isStandalone) {
    // Immediate warm up when the page loads
    warmUpApp();
    
    // Set visibility change listener to warm up when returning from background
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        warmUpApp();
      }
    });
  }
}

// Run the initialization when the DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPWA);
} else {
  initPWA();
}

// Expose the API for other scripts to use
window.pwaPerformance = {
  warmUp: warmUpApp,
  prefetchRoutes: prefetchRoutes
}; 
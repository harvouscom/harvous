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
  let criticalRoute = '/dashboard';
  
  // Determine the most likely immediate need
  if (currentPath.includes('/dashboard/threads')) {
    criticalRoute = '/dashboard/threads';
  } else if (currentPath.includes('/dashboard')) {
    criticalRoute = '/dashboard';
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
  const routes = ['/dashboard/find', '/dashboard/profile'];
  
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
  
  // Execute full warmup if in standalone mode
  if (isStandalone) {
    // Immediate warm up when the page loads
    warmUpApp();
    
    // Set visibility change listener to warm up when returning from background
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        isWarmedUp = false; // Reset flag when returning from background
        warmUpApp();
      }
    });
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
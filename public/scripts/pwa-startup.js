/**
 * PWA Startup Performance Optimization
 * 
 * Simple, lightweight warmup for PWA experience.
 */

// Check if launched as standalone app
const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                    window.navigator.standalone === true;

let isWarmedUp = false;

/**
 * Warm up the app - simple prefetch of critical routes
 */
function warmUpApp() {
  if (isWarmedUp) return;
  isWarmedUp = true;
  
  // Signal service worker to warm up
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage('warmup');
  }
  
  // Prefetch low-priority routes when idle
  if ('requestIdleCallback' in window) {
    requestIdleCallback(prefetchRoutes);
  } else {
    setTimeout(prefetchRoutes, 1000);
  }
}

/**
 * Prefetch commonly accessed routes
 */
function prefetchRoutes() {
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
 * Warm up API endpoint
 */
function warmUpAPI() {
  // Simple health check - no retries, no complex logic
  fetch('/api/health', {
    method: 'GET',
    credentials: 'include'
  }).catch(() => {
    // Silently fail - this is just a warmup
  });
}

/**
 * Initialize the PWA
 */
function initPWA() {
  // Touch event optimization
  document.addEventListener('touchstart', () => {}, { passive: true });
  
  // Warm up when app becomes visible (returning from background)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      isWarmedUp = false;
      warmUpApp();
      warmUpAPI();
    }
  });
  
  // Initial warmup for standalone mode
  if (isStandalone) {
    warmUpApp();
    // Warm API after a short delay to allow auth to establish
    setTimeout(warmUpAPI, 500);
  }
}

// Initialize
initPWA();

// Also run when fully loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', warmUpApp);
} else {
  warmUpApp();
}

// Expose API for other scripts
window.pwaPerformance = {
  warmUp: warmUpApp,
  prefetchRoutes: prefetchRoutes
};

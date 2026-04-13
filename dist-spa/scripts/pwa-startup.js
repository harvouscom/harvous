/**
 * PWA Startup Performance Optimization
 * 
 * Simple, lightweight warmup for PWA experience.
 */

// Check if launched as app-like display (standalone, fullscreen, minimal-ui) or iOS/Android app
const isStandalone = window.matchMedia('(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui)').matches ||
                    window.navigator.standalone === true ||
                    (typeof document !== 'undefined' && document.referrer.includes('android-app://'));

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
 * Warm up API endpoints to reduce cold start latency
 */
function warmUpAPI() {
  // Warm up critical API endpoints in parallel
  const endpoints = [
    '/api/health',           // Lightweight health check
    '/api/threads/list',     // Thread list (common first load)
    '/api/navigation/data',  // Navigation structure
  ];

  endpoints.forEach(endpoint => {
    fetch(endpoint, {
      method: 'GET',
      credentials: 'include'
    }).catch(() => {
      // Silently fail - this is just a warmup
    });
  });
}

/**
 * Track PWA session start time
 * This helps distinguish between app resumption and new navigation
 * Sets both localStorage (for client-side checks) and cookie (for server-side checks)
 */
function trackPWASessionStart() {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  
  try {
    const sessionKey = 'harvous-pwa-session-start';
    const lastSessionStart = localStorage.getItem(sessionKey);
    const now = Date.now();
    
    // If no session start exists, or it's been more than 30 minutes since last session,
    // treat this as a new session
    const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
    const isNewSession = !lastSessionStart || (now - parseInt(lastSessionStart, 10)) > SESSION_TIMEOUT;
    
    if (isNewSession || isStandalone) {
      localStorage.setItem(sessionKey, now.toString());
      // Also set a flag to indicate this is a PWA launch (not a refresh)
      if (isStandalone) {
        localStorage.setItem('harvous-pwa-launch-time', now.toString());
        // Set cookie for server-side access (expires in 1 minute - enough for initial page load)
        document.cookie = `harvous-pwa-launch-time=${now}; path=/; max-age=60; SameSite=Lax`;
      }
    }
  } catch (e) {
    // Silently fail if localStorage is unavailable
  }
}

/**
 * Initialize the PWA
 */
function initPWA() {
  // Track session start for PWA launch detection
  trackPWASessionStart();
  
  // Touch event optimization
  document.addEventListener('touchstart', () => {}, { passive: true });
  
  // Warm up when app becomes visible (returning from background)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      isWarmedUp = false;
      warmUpApp();
      warmUpAPI();
      // iOS WebKit: force compositor repaint when returning from background (avoids black flash)
      try {
        if (document.body) {
          document.body.style.webkitTransform = 'translateZ(0)';
          requestAnimationFrame(() => {
            document.body.style.webkitTransform = '';
          });
        }
      } catch (e) {
        /* ignore */
      }
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

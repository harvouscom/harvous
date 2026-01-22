// Register the service worker for PWA support
// Deferred to avoid blocking initial render - runs after page is interactive
(function() {
  if ('serviceWorker' in navigator) {
    // Store registration reference for update checks
    let registrationRef = null;
    let reloadingForUpdate = false; // Prevent infinite reload loops

    // Get app version from package.json (injected at build time or from meta tag)
    // Fallback to reading from a meta tag if available
    function getAppVersion() {
      const versionMeta = document.querySelector('meta[name="app-version"]');
      if (versionMeta) {
        return versionMeta.getAttribute('content');
      }
      // Fallback: try to get from window if set elsewhere
      if (window.__APP_VERSION__) {
        return window.__APP_VERSION__;
      }
      return 'unknown';
    }

    // Extract version from cache name (e.g., 'harvous-cache-v1-27-2' -> '1.27.2')
    function extractVersionFromCacheName(cacheName) {
      const match = cacheName.match(/v(\d+)-(\d+)-(\d+)/);
      if (match) {
        return {
          full: `${match[1]}.${match[2]}.${match[3]}`,
          major: parseInt(match[1], 10),
          minor: parseInt(match[2], 10),
          patch: parseInt(match[3], 10)
        };
      }
      return null;
    }

    // Check if this is a major version update
    async function isMajorVersionUpdate() {
      try {
        const cacheNames = await caches.keys();
        const harvousCaches = cacheNames.filter(name => name.startsWith('harvous-cache-v'));
        
        if (harvousCaches.length < 2) {
          return false; // Can't determine, allow update
        }
        
        // Sort to get old and new versions
        const versions = harvousCaches
          .map(name => ({ name, version: extractVersionFromCacheName(name) }))
          .filter(item => item.version !== null)
          .sort((a, b) => {
            // Sort by major, minor, patch
            if (a.version.major !== b.version.major) return a.version.major - b.version.major;
            if (a.version.minor !== b.version.minor) return a.version.minor - b.version.minor;
            return a.version.patch - b.version.patch;
          });
        
        if (versions.length < 2) {
          return false; // Can't determine, allow update
        }
        
        const oldVersion = versions[0].version;
        const newVersion = versions[versions.length - 1].version;
        
        // Check if major version changed
        return newVersion.major > oldVersion.major;
      } catch (error) {
        console.log('Error checking version update type:', error);
        return false; // On error, allow update
      }
    }

    // Expose version to window for debugging
    window.__APP_VERSION__ = getAppVersion();


    // Set up controller change listener once
    // Only reload if this isn't a fresh page load (performance.navigation.type check)
    navigator.serviceWorker.addEventListener('controllerchange', async () => {
      if (reloadingForUpdate) {
        return; // Already reloading
      }

      // Skip reload if we just refreshed (hard reload or normal reload)
      // This prevents infinite reload loops on hard refresh
      if (performance && (performance.navigation?.type === 1 || performance.getEntriesByType('navigation')[0]?.type === 'reload')) {
        return;
      }

      // Check if this is a major version update
      const isMajorUpdate = await isMajorVersionUpdate();
      
      if (isMajorUpdate) {
        // Major version update detected - don't force reload
        console.log('Major version update detected. Skipping automatic reload.');
        // TODO: In the future, could show a different notification here for major updates
        return;
      }

      reloadingForUpdate = true;
      
      // Minor/patch update - show toast and auto-reload
      if (window.toast && typeof window.toast.info === 'function') {
        try {
          window.toast.info('New update available, refreshing app...');
          // Wait 2 seconds before reloading to let user see the toast
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        } catch (error) {
          // If toast fails, reload immediately
          console.log('Toast notification failed, reloading immediately:', error);
          window.location.reload();
        }
      } else {
        // Toast system not available, reload immediately (fallback to current behavior)
        window.location.reload();
      }
    });

    // Function to check for service worker updates and handle them
    const checkForUpdates = (registration) => {
      if (!registration) return;

      // Check if there's a waiting worker
      if (registration.waiting) {
        // Send skipWaiting message to activate the new worker
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        return;
      }

      // Check if there's an installing worker
      if (registration.installing) {
        const installingWorker = registration.installing;
        installingWorker.addEventListener('statechange', () => {
          if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New service worker installed, send skipWaiting
            installingWorker.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      }
    };
    
    // Register service worker asynchronously after page load to avoid blocking render
    const registerServiceWorker = () => {
      navigator.serviceWorker.register('/sw.js')
        .then(registration => {
          registrationRef = registration;
          
          // Check for updates immediately
          checkForUpdates(registration);
          
          // Listen for new updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // New service worker available - activate it (controllerchange will handle reload)
                  newWorker.postMessage({ type: 'SKIP_WAITING' });
                }
              });
            }
          });
          
          // Periodically check for updates (every hour)
          setInterval(() => {
            registration.update().catch(err => {
              console.log('Service Worker update check failed:', err);
            });
          }, 60 * 60 * 1000); // 1 hour
          
          // Also check for updates when page becomes visible (after being hidden)
          document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
              registration.update().catch(err => {
                console.log('Service Worker update check failed:', err);
              });
            }
          });
        })
        .catch(error => {
          console.log('ServiceWorker registration failed:', error);
        });
    };
    
    // Use requestIdleCallback to defer registration until browser is idle
    if ('requestIdleCallback' in window) {
      // Wait for page to be fully loaded first
      if (document.readyState === 'complete') {
        requestIdleCallback(registerServiceWorker, { timeout: 3000 });
      } else {
        window.addEventListener('load', () => {
          requestIdleCallback(registerServiceWorker, { timeout: 3000 });
        });
      }
    } else {
      // Fallback: wait for page load, then delay registration
      if (document.readyState === 'complete') {
        setTimeout(registerServiceWorker, 2000);
      } else {
        window.addEventListener('load', () => {
          setTimeout(registerServiceWorker, 2000);
        });
      }
    }
    
    // Warm up the app when it's launched or brought back from background
    // Handle visibility change for different browsers
    function isHidden() {
      if (typeof document.hidden !== "undefined") {
        return document.hidden;
      } else if (typeof document.msHidden !== "undefined") {
        return document.msHidden;
      } else if (typeof document.webkitHidden !== "undefined") {
        return document.webkitHidden;
      }
      return false;
    }
    
    // Get the correct visibility change event name
    let visibilityEvent = "visibilitychange";
    if (typeof document.msHidden !== "undefined") {
      visibilityEvent = "msvisibilitychange";
    } else if (typeof document.webkitHidden !== "undefined") {
      visibilityEvent = "webkitvisibilitychange";
    }
    
    // When the app becomes visible after being hidden (returned from background)
    document.addEventListener(visibilityEvent, () => {
      if (!isHidden()) {
        // App is visible again - warm up
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage('warmup');
        }
        
        // Preload critical UI components
        if ('requestIdleCallback' in window) {
          window.requestIdleCallback(() => {
            // Prefetch common navigation paths when idle
            const prefetcher = document.createElement('link');
            prefetcher.rel = 'prefetch';
            prefetcher.href = '/';
            document.head.appendChild(prefetcher);
          });
        } else {
          // Fallback for browsers that don't support requestIdleCallback
          setTimeout(() => {
            const prefetcher = document.createElement('link');
            prefetcher.rel = 'prefetch';
            prefetcher.href = '/';
            document.head.appendChild(prefetcher);
          }, 1000);
        }
      }
    });
    
    // Also warm up on initial load (deferred)
    const warmupOnLoad = () => {
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage('warmup');
      }
    };
    
    if (document.readyState === 'complete') {
      if ('requestIdleCallback' in window) {
        requestIdleCallback(warmupOnLoad, { timeout: 3000 });
      } else {
        setTimeout(warmupOnLoad, 2000);
      }
    } else {
      window.addEventListener('load', () => {
        if ('requestIdleCallback' in window) {
          requestIdleCallback(warmupOnLoad, { timeout: 3000 });
        } else {
          setTimeout(warmupOnLoad, 2000);
        }
      });
    }
  }
  
  // Add to homescreen prompt handler
  let deferredPrompt;
  
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent Chrome 67+ from automatically showing the prompt
    e.preventDefault();
    // Stash the event so it can be triggered later
    deferredPrompt = e;
  });
})();


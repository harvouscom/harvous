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

    // Don't show update toasts on upgrade, auth, or shared/join/invitation pages
    function isNoUpdateToastPath() {
      var p = window.location.pathname;
      return p === '/upgrade' ||
        p.indexOf('/sign-in') === 0 ||
        p.indexOf('/sign-up') === 0 ||
        p.indexOf('/spaces/join/') === 0 ||
        p.indexOf('/shared/note/') === 0 ||
        p.indexOf('/shared/thread/') === 0 ||
        p.indexOf('/invitations/') === 0;
    }

    // --- iOS PWA silent-update detection ---
    // On iOS, when the PWA is killed and relaunched, the new service worker is
    // already the controller before this script runs, so 'controllerchange' is
    // never fired. We compare the current SW cache version to the version stored
    // during the last session. If they differ, the app updated while dormant.
    const SW_VERSION_KEY = 'harvous-sw-version';
    async function getCurrentCacheVersion() {
      try {
        const keys = await caches.keys();
        const harvousCache = keys.find(k => k.startsWith('harvous-cache-v'));
        return harvousCache || null;
      } catch (_) { return null; }
    }
    async function checkSilentUpdate() {
      const currentVersion = await getCurrentCacheVersion();
      if (!currentVersion) return;
      const lastVersion = localStorage.getItem(SW_VERSION_KEY);
      // Always persist the current version for next comparison
      localStorage.setItem(SW_VERSION_KEY, currentVersion);
      if (lastVersion && lastVersion !== currentVersion) {
        if (isNoUpdateToastPath()) return;
        // App updated silently (iOS killed + relaunch scenario).
        // Don't reload — the page is already running the new code.
        // Just show the "updated" toast so the user knows.
        if (window.toast && typeof window.toast.info === 'function') {
          window.toast.info('Harvous has been updated');
        }
      }
    }

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

      // Claim immediately so duplicate controllerchange events in this document are ignored
      reloadingForUpdate = true;

      // Check if this is a major version update
      const isMajorUpdate = await isMajorVersionUpdate();
      
      if (isMajorUpdate) {
        // Major version update detected - don't force reload
        console.log('Major version update detected. Skipping automatic reload.');
        reloadingForUpdate = false; // Allow future updates to trigger toast
        // TODO: In the future, could show a different notification here for major updates
        return;
      }

      function clearCachesAndReload() {
        caches.keys()
          .then(function(names) {
            return Promise.all(names.map(function(n) { return caches.delete(n); }));
          })
          .then(function() { window.location.reload(); })
          .catch(function() { window.location.reload(); });
      }

      // Only show toast on app layout pages (Layout.astro has .app-layout); suppress on sign-in, sign-up, shared, etc.
      var isAppLayoutPage = document.querySelector('.app-layout') !== null;

      // Minor/patch update - show toast on app layout only, then auto-reload
      if (isAppLayoutPage && !isNoUpdateToastPath() && window.toast && typeof window.toast.info === 'function') {
        try {
          window.toast.info('Updating Harvous for you');
          // Wait 1600ms (matches toast duration) before reloading
          setTimeout(clearCachesAndReload, 1600);
        } catch (error) {
          console.log('Toast notification failed, reloading immediately:', error);
          clearCachesAndReload();
        }
      } else {
        // Non-app layout or toast not available - reload immediately without toast
        clearCachesAndReload();
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

    // Called from the SPA on client-side navigation so active users still fetch new sw.js
    // (registration.update() otherwise only runs on visibility + hourly interval).
    const runFetchAndActivateWorker = (registration) => {
      if (!registration) return;
      registrationRef = registration;
      registration
        .update()
        .then(function () {
          checkForUpdates(registration);
        })
        .catch(function (err) {
          console.log('Service Worker update check failed:', err);
        });
    };

    window.__harvousCheckServiceWorkerUpdate = function () {
      if (registrationRef) {
        runFetchAndActivateWorker(registrationRef);
        return;
      }
      navigator.serviceWorker
        .getRegistration()
        .then(function (reg) {
          if (reg) runFetchAndActivateWorker(reg);
        })
        .catch(function () {
          /* ignore */
        });
    };

    // Register service worker asynchronously after page load to avoid blocking render
    const registerServiceWorker = () => {
      navigator.serviceWorker.register('/sw.js')
        .then(registration => {
          registrationRef = registration;

          // Check for iOS silent-update (app was killed & relaunched with a new SW already active)
          checkSilentUpdate();

          // Check for updates immediately (handles waiting/installing workers)
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
    e.preventDefault();
    deferredPrompt = e;
  });
})();


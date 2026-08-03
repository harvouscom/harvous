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
        p === '/addon' ||
        p.indexOf('/sign-in') === 0 ||
        p.indexOf('/sign-up') === 0 ||
        p.indexOf('/spaces/join/') === 0 ||
        p.indexOf('/shared/note/') === 0 ||
        p.indexOf('/shared/thread/') === 0 ||
        p.indexOf('/invitations/') === 0;
    }

    function isPrototypeShellPage() {
      var el = document.documentElement;
      if (el.classList.contains('harvous-prototype-route')) return true;
      if (document.querySelector('.proto-shell-frame')) return true;
      var shellPath = window.__harvousPrototypeShellPath;
      if (shellPath && shellPath.isPrototypeShellPath(window.location.pathname, window.location.hostname)) {
        return true;
      }
      return false;
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
      // Persist the current version for next comparison (e.g. iOS PWA silent relaunch).
      localStorage.setItem(SW_VERSION_KEY, currentVersion);
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

      // Prototype shell (the whole authenticated app): never force a reload — that caused
      // loops on iOS PWA (WebKit process kill) — but do NOT stay silent either. The new
      // worker has already claimed this client and deleted the old cache, so the running
      // document's lazily-imported chunk URLs are gone from the CDN and any route the user
      // hasn't visited yet will fail. Offer the reload and let them take it.
      if (isPrototypeShellPage()) {
        reloadingForUpdate = false;
        if (!isNoUpdateToastPath()) {
          if (typeof window.__harvousShowAppUpdateNotice === 'function') {
            window.__harvousShowAppUpdateNotice({ needsReload: true });
          } else {
            window.dispatchEvent(new CustomEvent('harvous-prototype-app-update', {
              detail: { mode: 'reload' }
            }));
          }
        }
        return;
      }

      // Auth / shared / join pages: never reload mid-flow (preserves in-progress sign-in email).
      if (isNoUpdateToastPath()) {
        reloadingForUpdate = false;
        return;
      }

      clearCachesAndReload();
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
          
          // Periodically check for updates (every hour). The on-visible check lives in the
          // single consolidated visibilitychange handler below — registering a second one
          // here meant every tab focus fired two update() requests for the same worker.
          setInterval(() => {
            registration.update().catch(err => {
              console.log('Service Worker update check failed:', err);
            });
          }, 60 * 60 * 1000); // 1 hour
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
    
    // Someone glancing at their phone repeatedly (e.g. checking notes during a service)
    // shouldn't cost a network round trip every single time — only refresh if it's been
    // a while since the last one. The hourly setInterval above is the slow-path backstop.
    const FOREGROUND_REFRESH_THROTTLE_MS = 15 * 60 * 1000; // 15 minutes
    let lastForegroundRefreshAt = 0;

    /**
     * THE on-visible handler for the service worker. Everything the app does when a tab
     * comes back to the foreground belongs here — there used to be three separate
     * visibilitychange listeners (two in this file, one in pwa-startup.js), so a single
     * focus fired two registration.update() calls, two 'warmup' messages, /api/health
     * twice, plus /api/threads/list and /api/navigation/data that React Query already
     * refetches itself via refetchOnWindowFocus.
     *
     * pwa-startup.js keeps only its standalone-specific work (shell watchdog, WebKit repaint).
     */
    document.addEventListener(visibilityEvent, () => {
      if (isHidden()) return;

      const now = Date.now();
      if (now - lastForegroundRefreshAt < FOREGROUND_REFRESH_THROTTLE_MS) return;
      lastForegroundRefreshAt = now;

      // One update check…
      if (registrationRef) {
        registrationRef.update().catch(err => {
          console.log('Service Worker update check failed:', err);
        });
      }

      // …and one warmup ping (the SW answers this with a single /api/health fetch).
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage('warmup');
      }
    });

    // Also warm up on initial load (deferred)
    const warmupOnLoad = () => {
      lastForegroundRefreshAt = Date.now();
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


// Register the service worker for PWA support
// Deferred to avoid blocking initial render - runs after page is interactive
(function() {
  if ('serviceWorker' in navigator) {
    // Store registration reference for update checks
    let registrationRef = null;
    
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
    
    // Expose version to window for debugging
    window.__APP_VERSION__ = getAppVersion();
    
    // Function to check for service worker updates and handle them
    const checkForUpdates = (registration) => {
      if (!registration) return;
      
      // Check if there's a waiting worker
      if (registration.waiting) {
        // Send skipWaiting message to activate the new worker
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        
        // Listen for controller change (when new SW takes control)
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          // Reload the page to get the new version
          window.location.reload();
        });
        
        return;
      }
      
      // Check if there's an installing worker
      if (registration.installing) {
        const installingWorker = registration.installing;
        installingWorker.addEventListener('statechange', () => {
          if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New service worker installed, send skipWaiting and reload
            installingWorker.postMessage({ type: 'SKIP_WAITING' });

            navigator.serviceWorker.addEventListener('controllerchange', () => {
              window.location.reload();
            });
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
                if (newWorker.state === 'installed') {
                  if (navigator.serviceWorker.controller) {
                    // New service worker available - activate it
                    newWorker.postMessage({ type: 'SKIP_WAITING' });
                    
                    navigator.serviceWorker.addEventListener('controllerchange', () => {
                      window.location.reload();
                    });
                  } else {
                    // First time installation, no need to reload
                    console.log('Service Worker installed for the first time');
                  }
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


// Register the service worker for PWA support
(function() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(registration => {
          
          // Check if there's a waiting worker and offer update if needed
          if (registration.waiting) {
            // New service worker is waiting - could prompt user to refresh
          }
          
          // Listen for new updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // New service worker available, could notify user
                }
              });
            }
          });
        })
        .catch(error => {
          console.log('ServiceWorker registration failed:', error);
        });
      
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
              prefetcher.href = '/dashboard';
              document.head.appendChild(prefetcher);
            });
          } else {
            // Fallback for browsers that don't support requestIdleCallback
            setTimeout(() => {
              const prefetcher = document.createElement('link');
              prefetcher.rel = 'prefetch';
              prefetcher.href = '/dashboard';
              document.head.appendChild(prefetcher);
            }, 1000);
          }
        }
      });
      
      // Also warm up on initial load
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage('warmup');
      }
    });
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


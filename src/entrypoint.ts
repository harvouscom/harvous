import type { Alpine } from 'alpinejs'
// @ts-ignore types for x-collapse
import collapse from '@alpinejs/collapse'
 
export default (Alpine: Alpine) => {
    Alpine.plugin(collapse)
}

// This file is used during build time
// Add code needed to start the app from a standalone PWA context
// and warm up the app on initial launch or after background return.

// Determine if app is running in standalone PWA mode
export const isInStandalonePWA = () => {
  return window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    (window.navigator as any).standalone === true;
};

// Function to optimize startup performance for PWA
export const optimizePWAStartup = () => {
  // Set a flag indicating the app has started
  localStorage.setItem('pwaSessionStart', Date.now().toString());
  
  // Pre-load most commonly used application routes
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage('warmup');
  }

  // Remove any stale data from previous sessions that might slow down the app
  const staleKeys = [
    'noteEditState',
    // Add other temporary keys that could be cleaned up
  ];
  
  staleKeys.forEach(key => {
    if (localStorage.getItem(key)) {
      try {
        // Check if this key contains JSON data that might be very large
        const data = localStorage.getItem(key);
        if (data && data.length > 1000) {
          // If it's large data, remove it to prevent memory/processing overhead
          localStorage.removeItem(key);
        }
      } catch (e) {
        // Just remove it if we can't parse it
        localStorage.removeItem(key);
      }
    }
  });
};
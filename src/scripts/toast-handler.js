// Toast handler - checks URL parameters and displays toasts
// This script handles both initial page loads and View Transition navigations

// Track which URL base (without query params) we've already processed to prevent duplicates
let processedUrlBase = null;

// Helper function to get URL base without query parameters
function getUrlBase() {
  const url = new URL(window.location.href);
  return url.origin + url.pathname;
}

// Helper function to check if toast system is ready
// Sonner's toast function is available globally once Toaster is mounted
function isToastSystemReady() {
  // Check for Sonner's global toast function (available when Toaster is mounted)
  const hasSonnerToast = typeof toast !== 'undefined' && typeof toast.success === 'function';
  
  // Also check for our window.toast wrapper (if it exists)
  const hasWindowToast = window.toast && typeof window.toast.success === 'function';
  
  // Either one works
  const hasToastUtil = hasSonnerToast || hasWindowToast;
  
  return {
    ready: hasToastUtil,
    hasToastUtil,
    hasSonnerToast,
    hasWindowToast
  };
}

// Function to show toast using whichever API is available
function showToast(message, type) {
  // Try Sonner's global toast first (most direct)
  if (typeof toast !== 'undefined' && typeof toast[type] === 'function') {
    try {
      toast[type](message);
      return true;
    } catch (error) {
      console.error('[Toast Handler] Error calling Sonner toast:', error);
    }
  }
  
  // Fallback to window.toast wrapper
  if (window.toast && typeof window.toast[type] === 'function') {
    try {
      window.toast[type](message);
      return true;
    } catch (error) {
      console.error('[Toast Handler] Error calling window.toast:', error);
    }
  }
  
  return false;
}

// Function to check URL parameters and show toast
function checkAndShowToast() {
  const urlBase = getUrlBase();
  const urlParams = new URLSearchParams(window.location.search);
  const toastType = urlParams.get('toast');
  const message = urlParams.get('message');
  
  // If there are no toast parameters, mark as processed and exit
  if (!toastType || !message) {
    if (processedUrlBase !== urlBase) {
      processedUrlBase = urlBase;
    }
    return;
  }
  
  // If we've already processed this URL base with toast params, skip
  if (processedUrlBase === urlBase) {
    console.log('[Toast Handler] Already processed URL base, skipping:', urlBase);
    return;
  }
  
  console.log('[Toast Handler] Found toast parameters:', { toastType, message, urlBase });
  
  // Mark this URL base as processed BEFORE cleaning URL (prevents re-processing)
  processedUrlBase = urlBase;
  
  // Clean up URL parameters immediately to prevent re-triggering
  const newUrl = new URL(window.location.href);
  newUrl.searchParams.delete('toast');
  newUrl.searchParams.delete('message');
  window.history.replaceState({}, '', newUrl.toString());
  
  const decodedMessage = decodeURIComponent(message);
  
  // Wait for toast system to be ready with polling
  function waitForToastAndShow(maxAttempts = 50, attempt = 0) {
    const status = isToastSystemReady();
    
    if (attempt === 0 || attempt % 5 === 0) {
      // Log every 5th attempt to avoid console spam
      console.log(`[Toast Handler] Attempt ${attempt + 1}/${maxAttempts}:`, {
        hasToastUtil: status.hasToastUtil,
        hasSonnerToast: status.hasSonnerToast,
        hasWindowToast: status.hasWindowToast,
        ready: status.ready
      });
    }
    
    if (status.ready) {
      // Check if toaster portal exists
      const toaster = document.querySelector('[data-sonner-toaster]');
      if (!toaster) {
        console.warn('[Toast Handler] Toast system ready but portal not found, waiting...');
        // Retry after a short delay
        if (attempt < maxAttempts - 1) {
          setTimeout(() => waitForToastAndShow(maxAttempts, attempt + 1), 100);
          return;
        }
      }
      
      // Toast system is ready, show toast
      const success = showToast(decodedMessage, toastType);
      if (success) {
        console.log(`[Toast Handler] ✅ Toast displayed successfully [${toastType}]:`, decodedMessage);
        // Verify toast actually appeared in DOM
        setTimeout(() => {
          const toasts = document.querySelectorAll('[data-sonner-toast]');
          if (toasts.length === 0) {
            console.warn('[Toast Handler] ⚠️ Toast called but no toast elements found in DOM');
          } else {
            console.log(`[Toast Handler] ✅ Verified ${toasts.length} toast(s) in DOM`);
          }
        }, 200);
      } else {
        console.error('[Toast Handler] ❌ Failed to show toast despite system being ready');
      }
      return;
    }
    
    // Not ready yet
    if (attempt === 0) {
      // Log what's missing on first attempt
      if (!status.hasSonnerToast && !status.hasWindowToast) {
        console.log('[Toast Handler] ⏳ Waiting for toast function (Sonner or window.toast)...');
        console.log('[Toast Handler] Debug info:', {
          'typeof toast': typeof toast,
          'window.toast': window.toast,
          'ToastProvider mounted?': document.querySelector('[data-sonner-toaster]') !== null
        });
      }
    }
    
    // Continue polling if we haven't exceeded max attempts
    if (attempt < maxAttempts - 1) {
      // Exponential backoff: start with 50ms, increase gradually, max 300ms
      const delay = Math.min(50 * Math.pow(1.15, attempt), 300);
      setTimeout(() => waitForToastAndShow(maxAttempts, attempt + 1), delay);
    } else {
      // Timeout reached - try showing toast anyway (might work even if detection failed)
      console.warn('[Toast Handler] ⚠️ Timeout waiting for toast system. Attempting to show toast anyway...');
      console.warn('[Toast Handler] Final status:', status);
      
      const success = showToast(decodedMessage, toastType);
      if (success) {
        console.log(`[Toast Handler] ✅ Toast displayed (despite timeout) [${toastType}]:`, decodedMessage);
      } else {
        console.error('[Toast Handler] ❌ Failed to show toast after timeout');
      }
    }
  }
  
  // Start polling for toast system readiness
  waitForToastAndShow();
}

// Run on initial page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[Toast Handler] DOMContentLoaded event fired');
    checkAndShowToast();
  });
} else {
  // DOM already loaded, check immediately
  console.log('[Toast Handler] DOM already loaded, checking immediately');
  checkAndShowToast();
}

// Re-run after View Transitions (client-side navigation)
// Reset processedUrlBase when navigating to allow new toasts
document.addEventListener('astro:before-preparation', () => {
  console.log('[Toast Handler] View Transition starting, resetting processedUrlBase');
  processedUrlBase = null;
});

document.addEventListener('astro:page-load', () => {
  console.log('[Toast Handler] astro:page-load event fired');
  checkAndShowToast();
});

// Listen for custom 'toast' events from anywhere in the app
function setupToastListener() {
  // Remove existing listener if any (to prevent duplicates)
  if (window._toastListener) {
    window.removeEventListener('toast', window._toastListener);
  }
  
  window._toastListener = (event) => {
    const detail = event.detail || {};
    const message = detail.message || 'Notification';
    const type = detail.type || 'success';
    
    console.log('[Toast Handler] Custom toast event received:', { message, type, event });
    
    // Use the toast system to show the message
    showToast(message, type);
  };
  
  window.addEventListener('toast', window._toastListener);
  console.log('[Toast Handler] Toast event listener registered');
}

// Set up listener immediately
setupToastListener();

// Re-setup listener after view transitions (Astro page loads)
document.addEventListener('astro:page-load', () => {
  console.log('[Toast Handler] Page load detected, re-setting up toast listener');
  setupToastListener();
});
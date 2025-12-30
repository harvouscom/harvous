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
    return;
  }
  
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
    
    if (status.ready) {
      // Toast system is ready, show toast
      const success = showToast(decodedMessage, toastType);
      if (!success) {
        console.error('[Toast Handler] ❌ Failed to show toast despite system being ready');
      }
      return;
    }
    
    // Continue polling if we haven't exceeded max attempts
    if (attempt < maxAttempts - 1) {
      // Exponential backoff: start with 50ms, increase gradually, max 300ms
      const delay = Math.min(50 * Math.pow(1.15, attempt), 300);
      setTimeout(() => waitForToastAndShow(maxAttempts, attempt + 1), delay);
    } else {
      // Timeout reached - try showing toast anyway (might work even if detection failed)
      console.warn('[Toast Handler] ⚠️ Timeout waiting for toast system. Attempting to show toast anyway...');
      
      const success = showToast(decodedMessage, toastType);
      if (!success) {
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
    checkAndShowToast();
  });
} else {
  // DOM already loaded, check immediately
  checkAndShowToast();
}

// Re-run after View Transitions (client-side navigation)
// Reset processedUrlBase when navigating to allow new toasts
document.addEventListener('astro:before-preparation', () => {
  processedUrlBase = null;
});

document.addEventListener('astro:page-load', () => {
  checkAndShowToast();
});
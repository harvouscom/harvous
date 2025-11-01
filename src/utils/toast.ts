import { toast as sonnerToast } from 'sonner';

// Helper function to ensure toaster portal exists before showing toast
function ensurePortalExists(callback: () => void, maxRetries = 10, attempt = 0): void {
  const toaster = document.querySelector('[data-sonner-toaster]');
  
  if (toaster || attempt >= maxRetries) {
    // Portal exists or we've given up, call the toast
    callback();
    return;
  }
  
  // Portal doesn't exist yet, retry after a short delay
  setTimeout(() => ensurePortalExists(callback, maxRetries, attempt + 1), 50);
}

// Helper function to safely call Sonner toast
function safeToast(callback: () => void, type: string, message: string) {
  try {
    ensurePortalExists(callback);
    console.log(`Toast [${type}]: ${message}`);
  } catch (error) {
    console.error(`Toast [${type}] error:`, error);
    console.error('Message that failed:', message);
  }
}

// Toast utility functions that can be used from anywhere
export const toast = {
  success: (message: string) => {
    safeToast(() => sonnerToast.success(message), 'success', message);
  },
  
  error: (message: string) => {
    safeToast(() => sonnerToast.error(message), 'error', message);
  },
  
  info: (message: string) => {
    safeToast(() => sonnerToast.info(message), 'info', message);
  },
  
  warning: (message: string) => {
    safeToast(() => sonnerToast.warning(message), 'warning', message);
  },
  
  // Generic toast function
  show: (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success') => {
    switch (type) {
      case 'success':
        safeToast(() => sonnerToast.success(message), 'success', message);
        break;
      case 'error':
        safeToast(() => sonnerToast.error(message), 'error', message);
        break;
      case 'info':
        safeToast(() => sonnerToast.info(message), 'info', message);
        break;
      case 'warning':
        safeToast(() => sonnerToast.warning(message), 'warning', message);
        break;
    }
  }
};

// Global toast functions for use in non-React contexts
declare global {
  interface Window {
    toast: typeof toast;
  }
}

// Make toast available globally
if (typeof window !== 'undefined') {
  window.toast = toast;
  console.log('Toast utility initialized and available at window.toast');
}

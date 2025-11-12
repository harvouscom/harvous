import { toast as sonnerToast } from 'sonner';

// Helper function to strip periods and exclamation marks from toast messages
function stripPunctuation(message: string): string {
  return message.replace(/[.!]/g, '');
}

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
    const cleanedMessage = stripPunctuation(message);
    safeToast(() => sonnerToast.success(cleanedMessage, { icon: null }), 'success', cleanedMessage);
  },
  
  error: (message: string) => {
    const cleanedMessage = stripPunctuation(message);
    safeToast(() => sonnerToast.error(cleanedMessage, { icon: null }), 'error', cleanedMessage);
  },
  
  info: (message: string) => {
    const cleanedMessage = stripPunctuation(message);
    safeToast(() => sonnerToast.info(cleanedMessage, { icon: null }), 'info', cleanedMessage);
  },
  
  warning: (message: string) => {
    const cleanedMessage = stripPunctuation(message);
    safeToast(() => sonnerToast.warning(cleanedMessage, { icon: null }), 'warning', cleanedMessage);
  },
  
  // Generic toast function
  show: (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success') => {
    const cleanedMessage = stripPunctuation(message);
    switch (type) {
      case 'success':
        safeToast(() => sonnerToast.success(cleanedMessage, { icon: null }), 'success', cleanedMessage);
        break;
      case 'error':
        safeToast(() => sonnerToast.error(cleanedMessage, { icon: null }), 'error', cleanedMessage);
        break;
      case 'info':
        safeToast(() => sonnerToast.info(cleanedMessage, { icon: null }), 'info', cleanedMessage);
        break;
      case 'warning':
        safeToast(() => sonnerToast.warning(cleanedMessage, { icon: null }), 'warning', cleanedMessage);
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

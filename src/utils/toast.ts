import { toast as sonnerToast } from 'sonner';

// Helper function to safely call Sonner toast
function safeToast(callback: () => void, type: string, message: string) {
  try {
    callback();
    console.log(`Toast [${type}]: ${message}`);
  } catch (error) {
    console.error(`Toast [${type}] error:`, error);
    console.error('Message that failed:', message);
    // Fallback to alert if Sonner isn't available
    alert(message);
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

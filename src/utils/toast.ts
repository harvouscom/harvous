import { toast as sonnerToast } from 'sonner';

// Toast utility functions that can be used from anywhere
export const toast = {
  success: (message: string) => {
    sonnerToast.success(message);
  },
  
  error: (message: string) => {
    sonnerToast.error(message);
  },
  
  info: (message: string) => {
    sonnerToast.info(message);
  },
  
  warning: (message: string) => {
    sonnerToast.warning(message);
  },
  
  // Generic toast function
  show: (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success') => {
    switch (type) {
      case 'success':
        sonnerToast.success(message);
        break;
      case 'error':
        sonnerToast.error(message);
        break;
      case 'info':
        sonnerToast.info(message);
        break;
      case 'warning':
        sonnerToast.warning(message);
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
}

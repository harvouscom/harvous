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
  } catch (error) {
    console.error(`Toast [${type}] error:`, error);
    console.error('Message that failed:', message);
  }
}

// Toast utility functions that can be used from anywhere
export const toast = {
  success: (message: string) => {
    const cleanedMessage = stripPunctuation(message);
    safeToast(() => sonnerToast.success(cleanedMessage, { icon: null, duration: 4000 }), 'success', cleanedMessage);
  },
  
  error: (message: string) => {
    const cleanedMessage = stripPunctuation(message);
    safeToast(() => sonnerToast.error(cleanedMessage, { icon: null, duration: 4000 }), 'error', cleanedMessage);
  },
  
  info: (message: string) => {
    const cleanedMessage = stripPunctuation(message);
    safeToast(() => sonnerToast.info(cleanedMessage, { icon: null, duration: 4000 }), 'info', cleanedMessage);
  },
  
  warning: (message: string) => {
    const cleanedMessage = stripPunctuation(message);
    safeToast(() => sonnerToast.warning(cleanedMessage, { icon: null, duration: 4000 }), 'warning', cleanedMessage);
  },
  
  // Generic toast function
  show: (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success') => {
    const cleanedMessage = stripPunctuation(message);
    switch (type) {
      case 'success':
        safeToast(() => sonnerToast.success(cleanedMessage, { icon: null, duration: 4000 }), 'success', cleanedMessage);
        break;
      case 'error':
        safeToast(() => sonnerToast.error(cleanedMessage, { icon: null, duration: 4000 }), 'error', cleanedMessage);
        break;
      case 'info':
        safeToast(() => sonnerToast.info(cleanedMessage, { icon: null, duration: 4000 }), 'info', cleanedMessage);
        break;
      case 'warning':
        safeToast(() => sonnerToast.warning(cleanedMessage, { icon: null, duration: 4000 }), 'warning', cleanedMessage);
        break;
    }
  },
  
  // Error toast with action button (for note limit errors)
  errorWithAction: (message: string, action: { label: string; onClick: () => void }) => {
    const cleanedMessage = stripPunctuation(message);
    safeToast(() => sonnerToast.error(cleanedMessage, {
      icon: null,
      duration: Infinity, // Don't auto-dismiss
      action: {
        label: action.label,
        onClick: action.onClick,
      },
    }), 'error', cleanedMessage);
  },

  // Persistent upgrade prompt: message + Upgrade (primary) and Not now (secondary). Stays open until user acts.
  upgradePrompt: (message: string, upgradeUrl?: string) => {
    const url = upgradeUrl || '/upgrade';
    safeToast(() => sonnerToast.error(message, {
      icon: null,
      duration: Infinity,
      className: 'harvous-upgrade-toast',
      action: {
        label: 'Upgrade',
        onClick: () => {
          try {
            sessionStorage.setItem('harvousSkipBeforeUnload', 'upgrade');
          } catch (_) {}
          window.location.href = url;
        },
      },
      cancel: {
        label: 'Not now',
        onClick: () => {},
      },
    }), 'upgradePrompt', message);
  },

  // PWA prompt toast (matches env.d.ts Window.toast interface)
  pwaPrompt: (message: string) => {
    const cleanedMessage = stripPunctuation(message);
    safeToast(() => sonnerToast.info(cleanedMessage, { icon: null, duration: 4000 }), 'pwaPrompt', cleanedMessage);
  },
};

// Make toast available globally (Window.toast type is declared in env.d.ts)
if (typeof window !== 'undefined') {
  window.toast = toast;
}

import { isPrototypeShellPath } from '@/lib/prototype-path';
import { toast as sonnerToast } from 'sonner';
import {
  showPrototypeFeedbackToast,
  type PrototypeFeedbackToastVariant,
  type ShowPrototypeFeedbackToastOptions,
} from '@/utils/prototype-feedback-toast';
import { shouldSuppressAppToasts } from '@/utils/should-suppress-app-toasts';

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
function safeToast(
  callback: () => void,
  type: PrototypeFeedbackToastVariant,
  message: string,
  prototypeOptions?: ShowPrototypeFeedbackToastOptions,
) {
  if (shouldSuppressAppToasts()) {
    if (typeof window !== 'undefined' && isPrototypeShellPath(window.location.pathname)) {
      showPrototypeFeedbackToast(message, type, prototypeOptions);
    }
    return;
  }
  try {
    ensurePortalExists(callback);
  } catch (error) {
    console.error(`Toast [${type}] error:`, error);
    console.error('Message that failed:', message);
  }
}

function openSupportSettings() {
  try {
    sessionStorage.setItem('harvousSkipBeforeUnload', 'support');
  } catch (_) {}
  window.location.href = '/settings/support';
}

/** How long a non-persistent error stays up — longer than a success, still ephemeral. */
const ERROR_TOAST_DURATION_MS = 6000;

export interface ShowErrorToastOptions {
  /** Stay until dismissed, with a support affordance. */
  persistent?: boolean;
  /** Dedupe key so a repeated failure replaces its predecessor instead of stacking. */
  id?: string;
}

/**
 * Single implementation for error toasts.
 *
 * Previously every error was `duration: Infinity` with a hardcoded Support button, so a
 * transient blip demanded the same attention as a genuinely stuck state, and the design
 * system's own guidance (toasts are for ephemeral feedback; persistent failures belong in
 * inline chrome) was ignored. Now persistence is opt-in — see spa/src/lib/error-copy.ts,
 * which escalates only after repeated failures of the same operation.
 *
 * The label is "Get support" to match the design-system gallery baseline (ds-12-toasts);
 * production had drifted to "Support".
 */
function showError(message: string, options: ShowErrorToastOptions = {}): void {
  const persistent = options.persistent ?? false;
  const prototypeOptions: ShowPrototypeFeedbackToastOptions = {
    persistent,
    ...(persistent ? { action: { label: 'Get support' } } : {}),
  };
  safeToast(
    () =>
      sonnerToast.error(message, {
        icon: null,
        duration: persistent ? Infinity : ERROR_TOAST_DURATION_MS,
        className: 'harvous-error-toast',
        ...(options.id ? { id: options.id } : {}),
        ...(persistent ? { action: { label: 'Get support', onClick: openSupportSettings } } : {}),
      }),
    'error',
    message,
    prototypeOptions,
  );
}

// Toast utility functions that can be used from anywhere
export const toast = {
  success: (message: string) => {
    const cleanedMessage = stripPunctuation(message);
    safeToast(() => sonnerToast.success(cleanedMessage, { icon: null, duration: 4000 }), 'success', cleanedMessage);
  },
  
  error: (message: string, options?: ShowErrorToastOptions) => {
    showError(stripPunctuation(message), options);
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
        showError(cleanedMessage);
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

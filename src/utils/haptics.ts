/**
 * Haptic Feedback Utility
 *
 * Provides haptic feedback mapped to visual shadow depth.
 * Uses web-haptics when available (SPA has set window.__webHaptics); otherwise
 * falls back to navigator.vibrate. Most tap haptics are handled by the global
 * handler (public/scripts/haptics-handler.js).
 */

// Check if device is mobile (iOS/Android) to prevent console errors on desktop
function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

function vibrate(duration: number | number[]) {
  // Only attempt vibration on mobile devices to prevent desktop console errors
  if (!isMobileDevice()) return;

  try {
    if (navigator.vibrate) {
      navigator.vibrate(duration);
    }
  } catch (e) {
    // Silently fail on unsupported devices
  }
}

function useWebHaptics(): boolean {
  return typeof window !== 'undefined' && typeof window.__webHaptics?.trigger === 'function';
}

export const haptics = {
  /** Light haptic (10ms) - for elements with no/minimal shadows */
  light: () => {
    if (useWebHaptics()) {
      window.__hapticsTriggerShadow?.(10);
    } else {
      vibrate(10);
    }
  },

  /** Medium haptic (20ms) - for elements with -4px shadows */
  medium: () => {
    if (useWebHaptics()) {
      window.__hapticsTriggerShadow?.(20);
    } else {
      vibrate(20);
    }
  },

  /** Strong haptic (30ms) - for elements with -6px to -8px shadows */
  strong: () => {
    if (useWebHaptics()) {
      window.__hapticsTriggerShadow?.(30);
    } else {
      vibrate(30);
    }
  },

  /** Success pattern - for positive confirmations */
  success: () => {
    if (useWebHaptics()) {
      window.__webHaptics?.trigger('success');
    } else {
      vibrate([10, 20, 30]);
    }
  },

  /** Error pattern - for destructive actions */
  error: () => {
    if (useWebHaptics()) {
      window.__webHaptics?.trigger('error');
    } else {
      vibrate([50, 50, 50]);
    }
  }
};

/**
 * Haptic Feedback Utility
 *
 * Provides haptic feedback mapped to visual shadow depth.
 * Note: Most haptics are now handled by the global handler (public/scripts/haptics-handler.js)
 * This utility exists for any components that need to trigger haptics programmatically.
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

export const haptics = {
  /** Light haptic (10ms) - for elements with no/minimal shadows */
  light: () => vibrate(10),

  /** Medium haptic (20ms) - for elements with -4px shadows */
  medium: () => vibrate(20),

  /** Strong haptic (30ms) - for elements with -6px to -8px shadows */
  strong: () => vibrate(30),

  /** Success pattern - for positive confirmations */
  success: () => vibrate([10, 20, 30]),

  /** Error pattern - for destructive actions */
  error: () => vibrate([50, 50, 50])
};

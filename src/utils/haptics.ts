/**
 * Haptic Feedback Utility
 * 
 * Provides haptic feedback mapped to button shadow depth for a cohesive tactile experience.
 * Intensity levels correspond to visual depth:
 * - Light (10ms): Shallow buttons with -3px inset shadow
 * - Medium (20ms): Medium depth buttons with -4px inset shadow
 * - Strong (30ms): Deep buttons with -8px inset shadow + outer shadow
 */

// Detect if haptics are available (mobile device with Vibration API)
let hapticsAvailable = typeof navigator !== 'undefined' && 
                       !!navigator.vibrate &&
                       (('ontouchstart' in window) || (navigator.maxTouchPoints > 0));

export const haptics = {
  /**
   * Light haptic for shallow buttons (-3px shadow)
   * Used for: action buttons, space buttons, navigation items
   */
  light: () => {
    if (!hapticsAvailable) return;
    try {
      navigator.vibrate(10);
    } catch (e) {
      // Silently fail - disable haptics on error
      hapticsAvailable = false;
    }
  },
  
  /**
   * Medium haptic for medium depth buttons (-4px shadow)
   * Used for: ButtonSmall components
   */
  medium: () => {
    if (!hapticsAvailable) return;
    try {
      navigator.vibrate(20);
    } catch (e) {
      // Silently fail - disable haptics on error
      hapticsAvailable = false;
    }
  },
  
  /**
   * Strong haptic for deep buttons (-8px shadow + outer)
   * Used for: Large CTA buttons, primary action buttons with outer shadow
   */
  strong: () => {
    if (!hapticsAvailable) return;
    try {
      navigator.vibrate(30);
    } catch (e) {
      // Silently fail - disable haptics on error
      hapticsAvailable = false;
    }
  },
  
  /**
   * Success pattern for positive confirmations
   * Used for: successful form submissions, note creation
   */
  success: () => {
    if (!hapticsAvailable) return;
    try {
      navigator.vibrate([10, 20, 30]);
    } catch (e) {
      // Silently fail - disable haptics on error
      hapticsAvailable = false;
    }
  },
  
  /**
   * Error pattern for destructive actions
   * Used for: delete actions, error states
   */
  error: () => {
    if (!hapticsAvailable) return;
    try {
      navigator.vibrate([50, 50, 50]);
    } catch (e) {
      // Silently fail - disable haptics on error
      hapticsAvailable = false;
    }
  }
};

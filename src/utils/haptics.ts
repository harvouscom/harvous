/**
 * Haptic Feedback Utility
 * 
 * Provides haptic feedback mapped to button shadow depth for a cohesive tactile experience.
 * Intensity levels correspond to visual depth:
 * - Light (10ms): Shallow buttons with -3px inset shadow
 * - Medium (20ms): Medium depth buttons with -4px inset shadow
 * - Strong (30ms): Deep buttons with -8px inset shadow + outer shadow
 */

export const haptics = {
  /**
   * Light haptic for shallow buttons (-3px shadow)
   * Used for: action buttons, space buttons, navigation items
   */
  light: () => {
    if (navigator.vibrate) {
      navigator.vibrate(10);
    }
  },
  
  /**
   * Medium haptic for medium depth buttons (-4px shadow)
   * Used for: ButtonSmall components
   */
  medium: () => {
    if (navigator.vibrate) {
      navigator.vibrate(20);
    }
  },
  
  /**
   * Strong haptic for deep buttons (-8px shadow + outer)
   * Used for: Large CTA buttons, primary action buttons with outer shadow
   */
  strong: () => {
    if (navigator.vibrate) {
      navigator.vibrate(30);
    }
  },
  
  /**
   * Success pattern for positive confirmations
   * Used for: successful form submissions, note creation
   */
  success: () => {
    if (navigator.vibrate) {
      navigator.vibrate([10, 20, 30]);
    }
  },
  
  /**
   * Error pattern for destructive actions
   * Used for: delete actions, error states
   */
  error: () => {
    if (navigator.vibrate) {
      navigator.vibrate([50, 50, 50]);
    }
  }
};

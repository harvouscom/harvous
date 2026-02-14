/**
 * Haptic Feedback Utility
 *
 * Provides haptic feedback mapped to visual shadow depth.
 * On native (iOS/Android via Capacitor), uses @capacitor/haptics for proper
 * iOS Taptic Engine support (navigator.vibrate is blocked on iOS).
 * On Android web/PWA, falls back to navigator.vibrate.
 *
 * Note: Most haptics are now handled by the global handler (public/scripts/haptics-handler.js)
 * This utility exists for any components that need to trigger haptics programmatically.
 */
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

// Detect if running inside a Capacitor native shell
function isNative(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as any).Capacitor?.isNative;
}

function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

async function vibrateNative(style: ImpactStyle) {
  try {
    await Haptics.impact({ style });
  } catch {
    // Silently fail if plugin unavailable
  }
}

async function vibrateNativeNotification(type: NotificationType) {
  try {
    await Haptics.notification({ type });
  } catch {
    // Silently fail if plugin unavailable
  }
}

function vibrateFallback(duration: number | number[]) {
  if (!isMobileDevice()) return;
  try {
    if (navigator.vibrate) {
      navigator.vibrate(duration);
    }
  } catch {
    // Silently fail on unsupported devices
  }
}

export const haptics = {
  /** Light haptic - for elements with no/minimal shadows */
  light: () => {
    if (isNative()) return vibrateNative(ImpactStyle.Light);
    vibrateFallback(10);
  },

  /** Medium haptic - for elements with -4px shadows */
  medium: () => {
    if (isNative()) return vibrateNative(ImpactStyle.Medium);
    vibrateFallback(20);
  },

  /** Strong haptic - for elements with -6px to -8px shadows */
  strong: () => {
    if (isNative()) return vibrateNative(ImpactStyle.Heavy);
    vibrateFallback(30);
  },

  /** Success pattern - for positive confirmations */
  success: () => {
    if (isNative()) return vibrateNativeNotification(NotificationType.Success);
    vibrateFallback([10, 20, 30]);
  },

  /** Error pattern - for destructive actions */
  error: () => {
    if (isNative()) return vibrateNativeNotification(NotificationType.Error);
    vibrateFallback([50, 50, 50]);
  },
};

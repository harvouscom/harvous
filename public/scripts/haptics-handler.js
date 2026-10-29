/**
 * Global Haptics Handler for All Interactive Elements
 *
 * A light selection tick when a choice control changes. Outcome haptics (success, error)
 * are fired by the app itself through src/utils/haptics.ts.
 *
 * Fires on click (a completed tap) for choice controls only; see CHOICE_SELECTOR.
 */

(function() {
  'use strict';

  // Check if device is mobile (iOS/Android) to prevent console errors on desktop
  function isMobileDevice() {
    if (typeof navigator === 'undefined') return false;
    // iPadOS reports a Mac user agent; the touch screen gives it away.
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
      (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  }

  // Early bail on desktop — don't register any listeners
  if (!isMobileDevice()) return;

  // Check if running in a Capacitor native shell (iOS/Android)
  function isNative() {
    return !!(window.Capacitor && window.Capacitor.isNative);
  }

  // Map duration buckets to Capacitor ImpactStyle values
  // Light=10ms, Medium=20ms, Strong=30ms
  function impactStyleForDuration(duration) {
    var ms = Array.isArray(duration) ? duration[0] : duration;
    if (ms <= 10) return 'LIGHT';
    if (ms <= 20) return 'MEDIUM';
    return 'HEAVY';
  }

  // Simple vibrate wrapper - uses Capacitor Haptics on native, web-haptics or navigator.vibrate on web
  function vibrate(duration) {
    // Native: use Capacitor Haptics plugin (works on iOS where navigator.vibrate is blocked)
    if (isNative() && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics) {
      try {
        window.Capacitor.Plugins.Haptics.impact({ style: impactStyleForDuration(duration) });
      } catch (e) {
        // Silently fail
      }
      return;
    }

    // Web/PWA: use web-haptics (shadow-based intensity) when SPA has set it; else fallback to navigator.vibrate
    if (typeof window.__hapticsTriggerShadow === 'function') {
      try {
        window.__hapticsTriggerShadow(duration);
      } catch (e) {
        // Silently fail
      }
      return;
    }

    // Fallback: navigator.vibrate (e.g. before React has mounted)
    try {
      if (navigator.vibrate) {
        navigator.vibrate(duration);
      }
    } catch (e) {
      // Silently fail on unsupported devices
    }
  }

  /*
   * Which taps get a tick.
   *
   * This used to buzz on touchstart for nearly every button, link and card, so starting a
   * scroll on a row buzzed and every tap felt the same. Native iOS gives a selection tick
   * when a choice *changes* — a toggle, a segment, a switch — and saves the stronger feel
   * for outcomes, which the app fires itself (haptics.success / haptics.error in
   * src/utils/haptics.ts). So: click, not touchstart, and only for choice controls.
   */
  var CHOICE_SELECTOR = [
    '[role="switch"]',
    '[role="radio"]',
    '[role="tab"]',
    '[role="menuitemradio"]',
    '[role="menuitemcheckbox"]',
    'button[aria-pressed]',
    'input[type="checkbox"]',
    'input[type="radio"]',
    '.proto-toolbar-seg__btn',
  ].join(', ');

  function classifyTarget(target) {
    if (!target || !target.closest) return 0;
    var el = target.closest(CHOICE_SELECTOR);
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return 0;
    return 10;
  }

  // Click fires once the tap completes (never for a scroll or a cancelled press). Capture
  // phase so a React handler's stopPropagation cannot swallow it.
  function handleClick(e) {
    var intensity = classifyTarget(e.target);
    if (intensity > 0) vibrate(intensity);
  }

  document.addEventListener('click', handleClick, { passive: true, capture: true });

})();

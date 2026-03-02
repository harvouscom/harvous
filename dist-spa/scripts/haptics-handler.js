/**
 * Global Haptics Handler for All Interactive Elements
 *
 * Provides haptic feedback for all tappable elements based on shadow depth.
 * Intensity levels correspond to visual depth:
 * - Light (10ms): Elements with no/minimal shadows
 * - Medium (20ms): Elements with medium shadows (-4px inset)
 * - Strong (30ms): Elements with heavy shadows (-6px to -8px inset + outer)
 *
 * Uses touchstart in capture phase to fire BEFORE React's synthetic event
 * system can intercept or stopPropagation on events.
 */

(function() {
  'use strict';

  // Check if device is mobile (iOS/Android) to prevent console errors on desktop
  function isMobileDevice() {
    if (typeof navigator === 'undefined') return false;
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
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

  // Classify an element and return the haptic intensity (0 = no haptic)
  function classifyTarget(target) {
    if (!target || !target.closest) return 0;

    // Strong haptic (30ms): Heavy shadow elements
    if (target.closest('.card-thread, .card-thread-container, button.btn--lg, button.btn-cta, button[data-outer-shadow], .btn-chonk')) {
      return 30;
    }

    // Medium haptic (20ms): Medium shadow elements
    if (target.closest('button.btn--sm, .card-feat-container, .space-switcher-anchor__toggle')) {
      return 20;
    }

    // Mobile nav space-switcher main button (medium)
    var navLink = target.closest('.nav-link');
    if (navLink) {
      var inMobileDropdown = navLink.closest('.mobile-nav__dropdown-wrapper');
      if (inMobileDropdown && navLink.closest('.space-switcher-anchor') && !target.closest('.space-switcher-anchor__toggle')) {
        return 20;
      }
    }

    // Fallback space-switcher anchor check
    var mobileDropdownWrapper = target.closest('.mobile-nav__dropdown-wrapper');
    if (mobileDropdownWrapper && target.closest('.space-switcher-anchor') && !target.closest('.space-switcher-anchor__toggle')) {
      return 20;
    }

    // SpaceButton in space-switcher-anchor context (medium)
    var spaceButton = target.closest('.space-button, .space-btn');
    if (spaceButton && spaceButton.closest('.space-switcher-anchor')) {
      return 20;
    }
    // nav-link inside space-switcher-anchor (desktop, medium)
    if (navLink && navLink.closest('.space-switcher-anchor')) {
      return 20;
    }

    // Light haptic (10ms): Minimal shadow elements
    if (target.closest('.card-note-container, .card-note, button.btn-action, button.btn-animate-squish, .menu-item, .tab-nav__button')) {
      return 10;
    }

    // Space buttons outside switcher (light)
    if (spaceButton && !spaceButton.closest('.space-switcher-anchor')) {
      return 10;
    }

    // Space switcher dropdown items (light)
    if (target.closest('.space-switcher-dropdown__item, .space-switcher-dropdown__close-btn')) {
      return 10;
    }

    // Navigation elements (light)
    if (target.closest('.nav-link, .nav-link--shrink, .nav-item-container, .mobile-nav__search-btn, .mobile-nav__space-panel-item')) {
      return 10;
    }

    // Internal links (light)
    if (target.closest('a[href^="/"]') && !target.closest('a[href^="//"]')) {
      return 10;
    }

    // ShareSettingsModal buttons (light)
    if (target.closest('.share-settings-modal__access-button, .share-settings-modal__copy-button, .share-settings-modal__refresh-button, .share-settings-modal__refresh-buttons button')) {
      return 10;
    }

    // Button group toggles (medium; align with space-button feel)
    if (target.closest('.button-group__button')) {
      return 20;
    }

    // Icon / overlay action buttons (light)
    if (target.closest('.action-button-hover')) {
      return 10;
    }

    // Role button (e.g. template picker, combobox triggers) (light)
    if (target.closest('[role="button"]')) {
      return 10;
    }

    // Panel footer controls (light; catch-all for footer buttons)
    if (target.closest('.panel__footer--buttons button')) {
      return 10;
    }

    // Fallback: any non-disabled button (light)
    var btn = target.closest('button');
    if (btn && !btn.disabled) {
      return 10;
    }

    return 0;
  }

  // Handler: fires on touchstart in capture phase.
  // This runs BEFORE React's synthetic event system processes the event,
  // so stopPropagation() in React handlers cannot block it.
  function handleTouchStart(e) {
    var touch = e.touches && e.touches[0];
    if (!touch) return;
    var target = document.elementFromPoint(touch.clientX, touch.clientY) || e.target;
    var intensity = classifyTarget(target);
    if (intensity > 0) {
      vibrate(intensity);
    }
  }

  // Register on document in capture phase — this fires before any React handler
  // passive: true so we never block scrolling
  document.addEventListener('touchstart', handleTouchStart, { passive: true, capture: true });

})();

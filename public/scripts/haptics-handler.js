/**
 * Global Haptics Handler for All Interactive Elements
 * 
 * Provides haptic feedback for all tappable elements based on shadow depth.
 * Intensity levels correspond to visual depth:
 * - Light (10ms): Elements with no/minimal shadows
 * - Medium (20ms): Elements with medium shadows (-4px inset)
 * - Strong (30ms): Elements with heavy shadows (-6px to -8px inset + outer)
 */

(function() {
  'use strict';
  
  // Check if device is mobile (iOS/Android) to prevent console errors on desktop
  function isMobileDevice() {
    if (typeof navigator === 'undefined') return false;
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  }

  // Simple vibrate wrapper with error suppression
  // Only calls navigator.vibrate() on mobile devices to prevent desktop console errors
  function vibrate(duration) {
    // Only attempt vibration on mobile devices
    if (!isMobileDevice()) return;
    
    try {
      if (navigator.vibrate) {
        navigator.vibrate(duration);
      }
    } catch (e) {
      // Silently fail on unsupported devices
    }
  }

  // Handler function that processes touch end events
  function handleInteraction(e) {
    var target = e.target;
    
    // Strong haptic: Elements with heavy shadows (-6px to -8px + outer)
    // CardThread, CTA buttons, SquareButton with outer shadow
    if (target.closest('.card-thread, .card-thread-container, button.btn--lg, button.btn-cta, button[data-outer-shadow], .btn-chonk')) {
      vibrate(30);
      return;
    }

    // Medium haptic: Elements with medium shadows (-4px)
    // ButtonSmall, card-feat, space switcher toggle button
    if (target.closest('button.btn--sm, .card-feat-container, .space-switcher-anchor__toggle')) {
      vibrate(20);
      return;
    }

    // Mobile nav specific: Check if inside mobile dropdown wrapper AND space-switcher-anchor
    // This MUST run before general nav-link check to catch the main button that opens bottom sheet
    // The main button is a nav-link inside space-switcher-anchor inside mobile-nav__dropdown-wrapper
    // First, check if we're touching on or inside a nav-link that's in mobile nav dropdown
    var navLink = target.closest('.nav-link');
    if (navLink) {
      var mobileDropdownWrapper = navLink.closest('.mobile-nav__dropdown-wrapper');
      if (mobileDropdownWrapper) {
        var spaceSwitcherAnchor = navLink.closest('.space-switcher-anchor');
        if (spaceSwitcherAnchor) {
          // Make sure we're not touching the toggle button
          var toggleButton = target.closest('.space-switcher-anchor__toggle');
          if (!toggleButton) {
            // We're ending touch on the nav-link inside mobile dropdown + space-switcher-anchor
            // This is the main button that opens the bottom sheet - trigger medium haptic
            vibrate(20);
            return;
          }
        }
      }
    }
    // Fallback: Check if inside mobile dropdown wrapper AND space-switcher-anchor (any element)
    var mobileDropdownWrapper = target.closest('.mobile-nav__dropdown-wrapper');
    if (mobileDropdownWrapper) {
      var spaceSwitcherAnchor = target.closest('.space-switcher-anchor');
      if (spaceSwitcherAnchor) {
        var toggleButton = target.closest('.space-switcher-anchor__toggle');
        if (!toggleButton) {
          // We're inside mobile dropdown + space-switcher-anchor, but not the toggle
          vibrate(20);
          return;
        }
      }
    }

    // SpaceButton in space-switcher-anchor context has shadow (medium haptic)
    // Check if target is a space-button/space-btn AND inside space-switcher-anchor
    var spaceButton = target.closest('.space-button, .space-btn');
    if (spaceButton && spaceButton.closest('.space-switcher-anchor')) {
      vibrate(20);
      return;
    }
    // Also check if ending touch on nav-link that's inside space-switcher-anchor (desktop nav case)
    // nav-link wraps SpaceButton, so touches ending on nav-link or its children should trigger medium haptic
    var navLink = target.closest('.nav-link');
    if (navLink && navLink.closest('.space-switcher-anchor')) {
      vibrate(20);
      return;
    }

    // Light haptic: Elements with no/minimal shadows
    // CardNote, general space buttons (outside switcher), menu items
    if (target.closest('.card-note-container, .card-note, button.btn-action, button.btn-animate-squish, .menu-item, .tab-nav__button')) {
      vibrate(10);
      return;
    }
    
    // Space buttons outside of space-switcher get light haptic
    if (target.closest('.space-button, .space-btn') && !target.closest('.space-switcher-anchor')) {
      vibrate(10);
      return;
    }
    
    // Space switcher dropdown items (light - no shadow)
    if (target.closest('.space-switcher-dropdown__item, .space-switcher-dropdown__close-btn')) {
      vibrate(10);
      return;
    }
    
    // Navigation elements (desktop and mobile)
    // Note: This runs AFTER space-switcher-anchor space-button check to avoid catching it
    if (target.closest('.nav-link, .nav-link--shrink, .nav-item-container, .mobile-nav__search-btn, .mobile-nav__space-panel-item')) {
      vibrate(10);
      return;
    }
    
    // Internal links (fallback for any navigation)
    if (target.closest('a[href^="/"]') && !target.closest('a[href^="//"]')) {
      vibrate(10);
      return;
    }

    // Fallback: Any button gets light haptic
    if (target.closest('button') && !target.closest('button').disabled) {
      vibrate(10);
    }
  }

  // Listen to touchend for mobile devices (haptics are mobile-only)
  // touchend fires when user lifts finger, providing better timing than touchstart
  document.addEventListener('touchend', handleInteraction, { passive: true, capture: true });

})();

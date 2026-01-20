/**
 * Global Haptics Handler for All Interactive Elements
 * 
 * Provides haptic feedback for all tappable elements based on shadow depth.
 * Intensity levels correspond to visual depth:
 * - Light (10ms): Shallow elements with -2px to -3px inset shadow
 * - Medium (20ms): Medium depth elements with -4px to -6px inset shadow
 * - Strong (30ms): Deep elements with -8px inset shadow + outer shadow
 */

(function() {
  'use strict';
  
  // Haptic utility functions
  const haptics = {
    light: () => {
      if (navigator.vibrate) {
        navigator.vibrate(10);
      }
    },
    medium: () => {
      if (navigator.vibrate) {
        navigator.vibrate(20);
      }
    },
    strong: () => {
      if (navigator.vibrate) {
        navigator.vibrate(30);
      }
    }
  };

  // Unified click handler with priority-based matching
  document.addEventListener('click', (e) => {
    // Strong haptic: Deep elements with -8px shadow + outer shadow
    const deepElement = e.target.closest(
      'button.btn--lg, button.btn-cta, button[data-outer-shadow], .btn-chonk'
    );
    if (deepElement && !deepElement.disabled) {
      haptics.strong();
      return;
    }

    // Medium haptic: Medium depth elements with -4px to -6px shadow
    const mediumElement = e.target.closest(
      'button.btn--sm, .card-thread, .card-note-container, .card-feat-container'
    );
    if (mediumElement && !mediumElement.disabled && !mediumElement.hasAttribute('disabled')) {
      haptics.medium();
      return;
    }

    // Light haptic: Shallow elements with -3px shadow
    const lightElement = e.target.closest(
      'button.btn-action, button.space-button, button.btn-animate-squish, ' +
      '.nav-link, .nav-item, .mobile-nav-item, .menu-item, ' +
      '.space-switcher-dropdown__item, .tab-nav__button, ' +
      'a[href^="/"]:not([href^="//"])'
    );
    if (lightElement && !lightElement.disabled && !lightElement.hasAttribute('disabled')) {
      haptics.light();
      return;
    }

    // Fallback: Any button not matched above gets light haptic
    const anyButton = e.target.closest('button');
    if (anyButton && !anyButton.disabled) {
      haptics.light();
    }
  }, { passive: true });

})();

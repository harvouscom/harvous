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
  
  // Detect if haptics are actually supported and usable
  function isHapticsSupported() {
    // Desktop browsers - skip haptics entirely to avoid console errors
    const isDesktop = !('ontouchstart' in window) && 
                      !navigator.maxTouchPoints;
    if (isDesktop) return false;
    
    // Check Vibration API availability
    if (!navigator.vibrate) return false;
    
    // Mobile device with Vibration API
    return true;
  }
  
  // State tracking
  let hapticsEnabled = isHapticsSupported();
  let userActivated = false;
  
  // Warm up the Vibration API on first user interaction
  function warmUpHaptics() {
    if (userActivated || !hapticsEnabled) return;
    
    try {
      // Trigger a silent 0ms vibration to activate the API
      navigator.vibrate(0);
      userActivated = true;
    } catch (e) {
      // Failed to warm up - disable haptics silently
      hapticsEnabled = false;
    }
  }
  
  // Listen for first interaction to warm up haptics
  if (hapticsEnabled) {
    document.addEventListener('touchstart', warmUpHaptics, { once: true, passive: true });
    document.addEventListener('click', warmUpHaptics, { once: true, passive: true });
  }
  
  // Haptic utility functions with error handling
  const haptics = {
    light: () => {
      if (!hapticsEnabled) return;
      try {
        navigator.vibrate(10);
        userActivated = true; // Mark as successfully activated
      } catch (e) {
        // Silently fail - don't spam console
        hapticsEnabled = false;
      }
    },
    medium: () => {
      if (!hapticsEnabled) return;
      try {
        navigator.vibrate(20);
        userActivated = true;
      } catch (e) {
        // Silently fail - don't spam console
        hapticsEnabled = false;
      }
    },
    strong: () => {
      if (!hapticsEnabled) return;
      try {
        navigator.vibrate(30);
        userActivated = true;
      } catch (e) {
        // Silently fail - don't spam console
        hapticsEnabled = false;
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

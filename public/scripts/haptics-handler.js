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
  
  // Simple vibrate wrapper with error suppression
  function vibrate(duration) {
    try {
      if (navigator.vibrate) {
        navigator.vibrate(duration);
      }
    } catch (e) {
      // Silently fail on unsupported devices
    }
  }

  // Single click handler using capture phase to catch all clicks
  document.addEventListener('click', function(e) {
    var target = e.target;
    
    // Strong haptic: Elements with heavy shadows (-6px to -8px + outer)
    // CardThread, CTA buttons, SquareButton with outer shadow
    if (target.closest('.card-thread, .card-thread-container, button.btn--lg, button.btn-cta, button[data-outer-shadow], .btn-chonk')) {
      vibrate(30);
      return;
    }

    // Medium haptic: Elements with medium shadows (-4px)
    // ButtonSmall, card-feat
    if (target.closest('button.btn--sm, .card-feat-container')) {
      vibrate(20);
      return;
    }

    // Light haptic: Elements with no/minimal shadows
    // CardNote, navigation items, space buttons, menu items, links
    if (target.closest('.card-note-container, .card-note, button.btn-action, button.space-button, button.btn-animate-squish, .nav-link, .nav-item, .mobile-nav-item, .menu-item, .space-switcher-dropdown__item, .tab-nav__button')) {
      vibrate(10);
      return;
    }
    
    // Internal links
    if (target.closest('a[href^="/"]') && !target.closest('a[href^="//"]')) {
      vibrate(10);
      return;
    }

    // Fallback: Any button gets light haptic
    if (target.closest('button') && !target.closest('button').disabled) {
      vibrate(10);
    }
  }, { passive: true, capture: true });

})();

/**
 * Global Haptics Handler for Astro-rendered Buttons
 * 
 * Provides haptic feedback for server-rendered buttons based on shadow depth.
 * This script runs on the client and adds haptics to all button clicks.
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

  // Add haptics to all button clicks based on shadow depth
  document.addEventListener('click', (e) => {
    const button = e.target.closest('button');
    if (!button || button.disabled) return;

    // Deep buttons (-8px shadow + outer shadow) = Strong haptic
    if (button.classList.contains('btn--lg') || 
        button.classList.contains('btn-cta') ||
        button.hasAttribute('data-outer-shadow')) {
      haptics.strong();
    }
    // Medium buttons (-4px shadow) = Medium haptic
    else if (button.classList.contains('btn--sm')) {
      haptics.medium();
    }
    // Shallow buttons (-3px shadow) = Light haptic
    else if (button.classList.contains('btn-action') ||
             button.classList.contains('space-button') ||
             button.classList.contains('btn-animate-squish')) {
      haptics.light();
    }
  }, { passive: true });

  // Add haptics to menu items (light feedback)
  document.addEventListener('click', (e) => {
    const menuItem = e.target.closest('.menu-item');
    if (menuItem && !menuItem.closest('button')) {
      haptics.light();
    }
  }, { passive: true });

})();

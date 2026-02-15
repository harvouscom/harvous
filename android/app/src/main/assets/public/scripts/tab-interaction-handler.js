/**
 * Tab Interaction Handler
 * 
 * This script specifically optimizes tab interaction performance,
 * focusing on the first interaction after PWA launch or returning
 * from background.
 */

(() => {
  // Track if we've optimized tab interactions
  let tabsOptimized = false;
  
  /**
   * Optimize tab buttons for responsiveness
   */
  function optimizeTabButtons() {
    if (tabsOptimized) return;
    tabsOptimized = true;
    
    // Find all tab buttons - this script is for close-tab-btn, not data-tab-button
    const tabButtons = document.querySelectorAll('.close-tab-btn');
    if (!tabButtons || tabButtons.length === 0) return;
    
    // Preload the click state
    Array.from(tabButtons).forEach(button => {
      // Apply immediate touch-response optimizations
      button.style.touchAction = 'manipulation';
      button.style.willChange = 'opacity';
      
      // Pre-calculate and cache action data
      if (button.dataset.action) {
        // Parse the action to "warm up" the function compilation
        try {
          const action = button.dataset.action;
          // Create but don't execute the function
          new Function(`return () => { ${action} }`)();
        } catch (e) {
          // Ignore errors in warm-up
        }
      }
      
      // Attach fast response touch handler
      button.addEventListener('touchstart', handleTabTouch, { passive: false });
    });
  }
  
  /**
   * Special touch handler for tab interactions
   */
  function handleTabTouch(e) {
    const button = e.currentTarget;
    
    // Show touch feedback instantly
    button.style.opacity = '0.7';
    
    // Add a fast touch response that will execute regardless of UI thread load
    setTimeout(() => {
      button.style.opacity = '1';
      
      // Execute action directly from data attribute if possible
      if (button.dataset.action) {
        try {
          const action = button.dataset.action;
          new Function(action)();
        } catch (error) {
          console.log('Tab action error:', error);
          // Fallback to click
          button.click();
        }
      } else {
        // Fallback to normal click
        button.click();
      }
    }, 50);
  }
  
  /**
   * Initialize the tab optimization on page load and visibility change
   */
  function init() {
    // Run immediately if possible
    if (document.readyState !== 'loading') {
      optimizeTabButtons();
    } else {
      // Otherwise wait for DOM to be ready
      document.addEventListener('DOMContentLoaded', optimizeTabButtons);
    }
    
    // Also optimize when page becomes visible
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        // Reset optimization state when returning from background
        tabsOptimized = false;
        optimizeTabButtons();
      }
    });
    
    // Recheck when Alpine might have rendered components
    if (window.Alpine) {
      document.addEventListener('alpine:initialized', optimizeTabButtons);
    }
  }
  
  // Start initialization
  init();
  
  // Expose API
  window.tabInteractionOptimizer = {
    optimize: optimizeTabButtons
  };
})(); 
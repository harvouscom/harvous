// Ensure tab functionality works consistently across environments
(function() {
  // Prevent multiple initializations
  if (window.tabFunctionalityInitialized) {
    return;
  }
  window.tabFunctionalityInitialized = true;
  
  function initTabs() {
    try {
      // Remove any existing event listeners to prevent duplicates
      const existingButtons = document.querySelectorAll('[data-tab-button]');
      existingButtons.forEach(function(button) {
        const newButton = button.cloneNode(true);
        if (button.parentNode) {
          button.parentNode.replaceChild(newButton, button);
        }
      });
    
    // Initialize tab functionality
    function setupTabHandlers() {
      const tabButtons = document.querySelectorAll('[data-tab-button]');
      
      if (tabButtons.length === 0) {
        return;
      }
      
      tabButtons.forEach(function(button) {
        // Remove any existing click listeners
        button.removeEventListener('click', handleTabClick);
        button.addEventListener('click', handleTabClick);
      });
    }
    
    function handleTabClick(e) {
      const clickedButton = e.currentTarget;
      if (!clickedButton) return;
      
      const tabId = clickedButton.getAttribute('data-tab-id');
      const tabNavContainer = clickedButton.closest('.tab-nav-container');
      
      if (!tabId || !tabNavContainer) return;
      
      // Update all tabs in this TabNav component
      const allTabsInNav = tabNavContainer.querySelectorAll('[data-tab-button]');
      allTabsInNav.forEach(function(tab) {
        tab.setAttribute('data-active', 'false');
        tab.classList.remove('opacity-100');
        tab.classList.add('opacity-50');
        
        // Dot is now handled by CSS ::after pseudo-element
      });
      
      // Activate the clicked tab
      clickedButton.setAttribute('data-active', 'true');
      clickedButton.classList.remove('opacity-50');
      clickedButton.classList.add('opacity-100');
      
      // Dot is now handled by CSS ::after pseudo-element
      
      // Find and switch content sections that belong to this specific TabNav
      const tabNavParent = tabNavContainer.parentElement;
      if (!tabNavParent) return;
      
      const allSiblings = Array.from(tabNavParent.children);
      const currentTabNavIndex = allSiblings.indexOf(tabNavContainer);
      
      // Find the next TabNav (if any) to determine the boundary
      let nextTabNavIndex = -1;
      for (let i = currentTabNavIndex + 1; i < allSiblings.length; i++) {
        const sibling = allSiblings[i];
        if (sibling.classList && sibling.classList.contains('tab-nav-container')) {
          nextTabNavIndex = i;
          break;
        }
      }
      
      // Find content sections between current TabNav and next TabNav (or end)
      const endIndex = nextTabNavIndex !== -1 ? nextTabNavIndex : allSiblings.length;
      const relevantSiblings = allSiblings.slice(currentTabNavIndex + 1, endIndex);
      
      relevantSiblings.forEach(function(sibling) {
        if (sibling.hasAttribute && sibling.hasAttribute('data-tab-content')) {
          const sectionTabId = sibling.getAttribute('data-tab-content');
          
          if (sectionTabId === tabId) {
            sibling.classList.remove('hidden');
            sibling.style.display = 'block';
          } else {
            sibling.classList.add('hidden');
            sibling.style.display = 'none';
          }
        }
      });
      
      // Also handle legacy content IDs (for backward compatibility)
      const legacyContent = document.getElementById(tabId + '-content');
      if (legacyContent) {
        legacyContent.classList.remove('hidden');
        legacyContent.style.display = 'block';
      }
      
      // Hide other legacy content sections
      allTabsInNav.forEach(function(tab) {
        const otherTabId = tab.getAttribute('data-tab-id');
        if (otherTabId && otherTabId !== tabId) {
          const otherContent = document.getElementById(otherTabId + '-content');
          if (otherContent) {
            otherContent.classList.add('hidden');
            otherContent.style.display = 'none';
          }
        }
      });
      
      // Dispatch a custom event for parent components to listen to
      const tabChangeEvent = new CustomEvent('tabChange', {
        detail: { tabId: tabId, tabNavContainer: tabNavContainer },
        bubbles: true
      });
      tabNavContainer.dispatchEvent(tabChangeEvent);
    }
    
    // Initialize tabs
    setupTabHandlers();
    
    // Also listen for dynamic content changes (for SPAs)
    const observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        if (mutation.type === 'childList') {
          // Check if new tab buttons were added
          const newTabButtons = document.querySelectorAll('[data-tab-button]');
          if (newTabButtons.length > 0) {
            setupTabHandlers();
          }
        }
      });
    });
    
    // Start observing
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    } catch (error) {
      console.error('Layout: Error initializing tabs:', error);
    }
  }
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTabs);
  } else {
    // DOM is already ready
    initTabs();
  }
  
  // Re-initialize tabs after View Transitions page loads
  document.addEventListener('astro:page-load', () => {
    setTimeout(initTabs, 50);
  });
  
  // Also re-initialize after DOM swap for View Transitions
  document.addEventListener('astro:after-swap', () => {
    setTimeout(initTabs, 50);
  });
  
  // Also initialize when Alpine.js is ready (if it's being used)
  if (window.Alpine) {
    document.addEventListener('alpine:initialized', initTabs);
  }
  
  // Fallback: initialize after a short delay to ensure everything is loaded
  setTimeout(initTabs, 100);
  
  // Additional fallback for development environment
  if (document.readyState === 'complete') {
    setTimeout(initTabs, 500);
  }
  
  // Extra fallback for View Transitions - wait for all resources to load
  window.addEventListener('load', () => {
    setTimeout(initTabs, 200);
  });
})();


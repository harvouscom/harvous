// Debug script for navigation persistence
console.log('🔧 Navigation Debug Script Loaded');

// Add debug functions to window
window.debugNavigation = {
  // Check if navigation history functions are working
  checkNavigationHistory: function() {
    console.log('🔍 Checking Navigation History Functions...');
    try {
      if (window.getNavigationHistory) {
        const history = window.getNavigationHistory();
        console.log('✅ Navigation history functions working, history:', history);
        return true;
      } else {
        console.log('❌ Navigation history functions not available');
        return false;
      }
    } catch (error) {
      console.log('❌ Navigation history error:', error);
      return false;
    }
  },
  
  // Check localStorage
  checkLocalStorage: function() {
    console.log('🔍 Checking localStorage...');
    try {
      const stored = localStorage.getItem('navigation-history');
      console.log('📦 Stored navigation history:', stored);
      return stored;
    } catch (error) {
      console.log('❌ localStorage error:', error);
      return null;
    }
  },
  
  // Check current page data
  checkPageData: function() {
    console.log('🔍 Checking page data...');
    const navigationElement = document.querySelector('[slot="navigation"]');
    if (navigationElement) {
      console.log('✅ Navigation element found:', {
        threadId: navigationElement.dataset.threadId,
        threadTitle: navigationElement.dataset.threadTitle,
        threadNoteCount: navigationElement.dataset.threadNoteCount,
        threadBackgroundGradient: navigationElement.dataset.threadBackgroundGradient,
        threadColor: navigationElement.dataset.threadColor,
        contentType: navigationElement.dataset.contentType,
        contentId: navigationElement.dataset.contentId
      });
    } else {
      console.log('❌ Navigation element not found');
    }
  },
  
  // Clear navigation history
  clearHistory: function() {
    console.log('🧹 Clearing navigation history...');
    if (window.clearNavigationHistory) {
      window.clearNavigationHistory();
      console.log('✅ Navigation history cleared');
    } else {
      console.log('❌ clearNavigationHistory function not available');
    }
  },
  
  // Test Alpine.js functionality
  testAlpine: function() {
    console.log('🔍 Testing Alpine.js functionality...');
    try {
      if (window.Alpine) {
        console.log('✅ Alpine.js is available');
        
        // Test hover functionality on navigation buttons
        const navButtons = document.querySelectorAll('[data-navigation-item] button');
        console.log('🔍 Found navigation buttons:', navButtons.length);
        
        navButtons.forEach((button, index) => {
          if (button.hasAttribute('x-data')) {
            console.log(`🧪 Testing button ${index + 1}:`, button);
            
            // Simulate hover
            button.dispatchEvent(new Event('mouseenter'));
            setTimeout(() => {
              const closeIcon = button.querySelector('[x-show="showClose"]');
              console.log(`🔍 Button ${index + 1} close icon visible:`, closeIcon ? 'Yes' : 'No');
              button.dispatchEvent(new Event('mouseleave'));
            }, 100);
          }
        });
        
        return true;
      } else {
        console.log('❌ Alpine.js not available');
        return false;
      }
    } catch (error) {
      console.log('❌ Alpine.js test error:', error);
      return false;
    }
  },
  
  // Run all checks
  runAllChecks: function() {
    console.log('🚀 Running all navigation debug checks...');
    this.checkNavigationHistory();
    this.checkLocalStorage();
    this.checkPageData();
    this.testAlpine();
  }
};

// Auto-run checks on load
document.addEventListener('DOMContentLoaded', () => {
  console.log('📄 DOM loaded, running navigation debug checks...');
  setTimeout(() => {
    window.debugNavigation.runAllChecks();
  }, 1000);
});

// Also run on page transitions
document.addEventListener('astro:page-load', () => {
  console.log('📄 Page loaded, running navigation debug checks...');
  setTimeout(() => {
    window.debugNavigation.runAllChecks();
  }, 1000);
});

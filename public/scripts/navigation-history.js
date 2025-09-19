// Simple Navigation History - Clean and Working
console.log('🚀 Simple navigation history loaded');
console.log('🔍 Current URL:', window.location.href);
console.log('🔍 Current path:', window.location.pathname);

// Get navigation history from localStorage
function getNavigationHistory() {
  try {
    const stored = localStorage.getItem('navigation-history');
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Error getting navigation history:', error);
    return [];
  }
}

// Save navigation history to localStorage
function saveNavigationHistory(history) {
  try {
    localStorage.setItem('navigation-history', JSON.stringify(history));
  } catch (error) {
    console.error('Error saving navigation history:', error);
  }
}

// Add item to navigation history
function addToNavigationHistory(item) {
  console.log('📝 Adding to navigation history:', item);
  const history = getNavigationHistory();
  console.log('📝 Current history:', history);
  
  // Remove if already exists
  const filteredHistory = history.filter(h => h.id !== item.id);
  
  // Add to end (oldest at top, newest at bottom)
  const newHistory = [...filteredHistory, item];
  
  // Limit to 8 items
  const limitedHistory = newHistory.slice(-8);
  
  console.log('📝 New history:', limitedHistory);
  saveNavigationHistory(limitedHistory);
  
  // Re-render persistent navigation
  if (window.renderPersistentNavigation) {
    console.log('📝 Re-rendering persistent navigation');
    window.renderPersistentNavigation();
  } else {
    console.log('❌ renderPersistentNavigation not available');
  }
}

// Remove item from navigation history
function removeFromNavigationHistory(itemId) {
  const history = getNavigationHistory();
  const filteredHistory = history.filter(item => item.id !== itemId);
  saveNavigationHistory(filteredHistory);
  
  // Special handling for unorganized thread - mark it as closed
  if (itemId === 'thread_unorganized') {
    localStorage.setItem('unorganized-thread-closed', 'true');
  }
  
  // Re-render persistent navigation
  if (window.renderPersistentNavigation) {
    window.renderPersistentNavigation();
  }
}

// Track navigation access
function trackNavigationAccess() {
  const currentPath = window.location.pathname;
  const currentItemId = currentPath.startsWith('/') ? currentPath.substring(1) : currentPath;
  
  console.log('🔍 Tracking navigation access for:', currentItemId);
  console.log('🔍 Current path:', currentPath);
  
  // Skip dashboard and empty paths
  if (currentItemId === 'dashboard' || currentItemId === '' || currentItemId === 'sign-in' || currentItemId === 'sign-up') {
    console.log('⏭️ Skipping tracking for:', currentItemId);
    return;
  }
  
  // Track spaces too (they should be persistent and closable)
  // if (currentItemId.startsWith('space_')) {
  //   return;
  // }
  
  // Create item data
  let itemData = {
    id: currentItemId,
    title: 'Unknown',
    type: 'thread',
    count: 0,
    backgroundGradient: 'var(--color-gradient-gray)',
    color: 'blessed-blue'
  };
  
  // Try to get better data from navigation element
  const navigationElement = document.querySelector('[slot="navigation"]');
  if (navigationElement) {
    if (navigationElement.dataset.threadId === currentItemId) {
      itemData = {
        id: currentItemId,
        title: navigationElement.dataset.threadTitle || 'Unknown Thread',
        type: 'thread',
        count: parseInt(navigationElement.dataset.threadNoteCount) || 0,
        backgroundGradient: navigationElement.dataset.threadBackgroundGradient || 'var(--color-gradient-gray)',
        color: navigationElement.dataset.threadColor || 'blessed-blue'
      };
    } else if (currentItemId.startsWith('note_') && navigationElement.dataset.threadId) {
      // For notes, track the parent thread
      const threadId = navigationElement.dataset.threadId;
      const threadTitle = navigationElement.dataset.threadTitle || 'Unknown Thread';
      
      itemData = {
        id: threadId,
        title: threadTitle,
        type: 'thread',
        count: parseInt(navigationElement.dataset.threadNoteCount) || 0,
        backgroundGradient: navigationElement.dataset.threadBackgroundGradient || 'var(--color-gradient-gray)',
        color: navigationElement.dataset.threadColor || 'blessed-blue'
      };
      
      // Special handling for unorganized thread - clear closed state when visiting its notes
      if (threadId === 'thread_unorganized') {
        localStorage.removeItem('unorganized-thread-closed');
      }
    } else if (currentItemId.startsWith('space_') && navigationElement.dataset.spaceId) {
      // For spaces, get the actual count from the navigation element
      itemData = {
        id: currentItemId,
        title: navigationElement.dataset.spaceTitle || 'Space',
        type: 'space',
        count: parseInt(navigationElement.dataset.spaceItemCount) || 0,
        backgroundGradient: navigationElement.dataset.spaceBackgroundGradient || 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)',
        color: navigationElement.dataset.spaceColor || 'paper'
      };
    }
  }
  
  // Special handling for unorganized thread (only if not already handled above)
  if (currentItemId === 'thread_unorganized' && (!navigationElement || !navigationElement.dataset.threadId)) {
    // Try to get the actual count from the navigation element if available
    const unorganizedCount = navigationElement ? parseInt(navigationElement.dataset.threadNoteCount) || 0 : 0;
    
    itemData = {
      id: 'thread_unorganized',
      title: 'Unorganized',
      type: 'thread',
      count: unorganizedCount,
      backgroundGradient: 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)',
      color: 'blessed-blue'
    };
    
    // Clear the closed state when visiting unorganized thread
    localStorage.removeItem('unorganized-thread-closed');
  }
  
  // Special handling for spaces (only if not already handled above)
  if (currentItemId.startsWith('space_') && (!navigationElement || !navigationElement.dataset.spaceId)) {
    // Try to get the actual count from the navigation element if available
    const spaceCount = navigationElement ? parseInt(navigationElement.dataset.spaceItemCount) || 0 : 0;
    
    itemData = {
      id: currentItemId,
      title: 'Space',
      type: 'space',
      count: spaceCount,
      backgroundGradient: 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)',
      color: 'paper'
    };
  }
  
  console.log('📝 Final item data:', itemData);
  addToNavigationHistory(itemData);
}

// Initialize tracking
function initTracking() {
  trackNavigationAccess();
}

// Run on page load and View Transitions
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTracking);
} else {
  initTracking();
}

document.addEventListener('astro:page-load', initTracking);

// Export functions
window.getNavigationHistory = getNavigationHistory;
window.addToNavigationHistory = addToNavigationHistory;
window.removeFromNavigationHistory = removeFromNavigationHistory;
window.trackNavigationAccess = trackNavigationAccess;
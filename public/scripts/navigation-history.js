// Simple Navigation History - Clean and Working
console.log('🚀 Simple navigation history loaded');

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
  const history = getNavigationHistory();
  
  // Remove if already exists
  const filteredHistory = history.filter(h => h.id !== item.id);
  
  // Add to end (oldest at top, newest at bottom)
  const newHistory = [...filteredHistory, item];
  
  // Limit to 8 items
  const limitedHistory = newHistory.slice(-8);
  
  saveNavigationHistory(limitedHistory);
  
  // Re-render persistent navigation
  if (window.renderPersistentNavigation) {
    window.renderPersistentNavigation();
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
  
  // Skip dashboard and empty paths
  if (currentItemId === 'dashboard' || currentItemId === '' || currentItemId === 'sign-in' || currentItemId === 'sign-up') {
    return;
  }
  
  // Skip spaces (they're permanently visible)
  if (currentItemId.startsWith('space_')) {
    return;
  }
  
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
    }
  }
  
  // Special handling for unorganized thread
  if (currentItemId === 'thread_unorganized') {
    itemData = {
      id: 'thread_unorganized',
      title: 'Unorganized',
      type: 'thread',
      count: 0,
      backgroundGradient: 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)',
      color: 'blessed-blue'
    };
    
    // Clear the closed state when visiting unorganized thread
    localStorage.removeItem('unorganized-thread-closed');
  }
  
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
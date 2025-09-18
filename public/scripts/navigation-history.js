// Simple Navigation History - Clean localStorage approach
console.log('🚀 Navigation history script loaded');

// Get navigation history from localStorage
function getNavigationHistory() {
  try {
    const stored = localStorage.getItem('navigation-history');
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('❌ Error getting navigation history:', error);
    return [];
  }
}

// Save navigation history to localStorage
function saveNavigationHistory(history) {
  try {
    localStorage.setItem('navigation-history', JSON.stringify(history));
    console.log('💾 Saved navigation history:', history);
  } catch (error) {
    console.error('❌ Error saving navigation history:', error);
  }
}

// Add or update an item in navigation history
function addToNavigationHistory(item) {
  const currentHistory = getNavigationHistory();
  const now = Date.now();
  
  // Check if item already exists
  const existingIndex = currentHistory.findIndex(historyItem => historyItem.id === item.id);
  
  let updatedHistory;
  
  if (existingIndex !== -1) {
    // Item exists - keep it in the same position but update its data
    const existingItem = currentHistory[existingIndex];
    updatedHistory = currentHistory.map((historyItem, index) => {
      if (index === existingIndex) {
        return {
          ...existingItem,
          ...item,
          lastAccessed: now
          // Keep the original firstAccessed time
        };
      }
      return historyItem;
    });
  } else {
    // New item - add to the end (most recent first access)
    updatedHistory = [
      ...currentHistory,
      {
        ...item,
        firstAccessed: now,
        lastAccessed: now
      }
    ];
  }
  
  // Limit to 10 items to prevent clutter
  if (updatedHistory.length > 10) {
    // Remove oldest items (those with earliest firstAccessed times)
    updatedHistory = updatedHistory
      .sort((a, b) => a.firstAccessed - b.firstAccessed) // Sort by first access time
      .slice(-10); // Keep the most recent first accesses
  }
  
  saveNavigationHistory(updatedHistory);
  
  // Trigger re-render of persistent navigation
  if (window.renderPersistentNavigation) {
    window.renderPersistentNavigation();
  }
}

// Remove an item from navigation history
function removeFromNavigationHistory(itemId) {
  const currentHistory = getNavigationHistory();
  const updatedHistory = currentHistory.filter(item => item.id !== itemId);
  saveNavigationHistory(updatedHistory);
  console.log('🗑️ Removed from navigation history:', itemId);
  
  // Trigger re-render of persistent navigation
  if (window.renderPersistentNavigation) {
    window.renderPersistentNavigation();
  }
}

// Clear all navigation history
function clearNavigationHistory() {
  localStorage.removeItem('navigation-history');
  console.log('🧹 Navigation history cleared');
  
  // Trigger re-render of persistent navigation
  if (window.renderPersistentNavigation) {
    window.renderPersistentNavigation();
  }
}

// Track navigation when items are accessed
function trackNavigationAccess() {
  const currentPath = window.location.pathname;
  const currentItemId = currentPath.startsWith('/') ? currentPath.substring(1) : currentPath;
  
  // Skip tracking for dashboard and empty paths
  if (currentItemId === 'dashboard' || currentItemId === '' || currentItemId === 'sign-in' || currentItemId === 'sign-up') {
    return;
  }
  
  // Get item data from the page
  const itemData = extractItemDataFromPage(currentItemId);
  
  if (itemData) {
    addToNavigationHistory(itemData);
  }
}

// Extract item data from the current page
function extractItemDataFromPage(itemId) {
  
  // Try to get data from navigation element attributes first
  const navigationElement = document.querySelector('[slot="navigation"]');
  if (navigationElement) {
    // Check for thread data
    if (navigationElement.dataset.threadId === itemId) {
      const itemData = {
        id: itemId,
        title: navigationElement.dataset.threadTitle || 'Unknown Thread',
        type: 'thread',
        count: parseInt(navigationElement.dataset.threadNoteCount) || 0,
        backgroundGradient: navigationElement.dataset.threadBackgroundGradient || 'var(--color-gradient-gray)',
        color: navigationElement.dataset.threadColor || 'blessed-blue'
      };
      console.log('✅ Extracted thread data:', itemData);
      return itemData;
    }
    
    // For notes, get the thread data from the navigation element
    if (itemId.startsWith('note_') && navigationElement.dataset.threadId) {
      const threadData = {
        id: navigationElement.dataset.threadId,
        title: navigationElement.dataset.threadTitle || 'Unknown Thread',
        type: 'thread',
        count: parseInt(navigationElement.dataset.threadNoteCount) || 0,
        backgroundGradient: navigationElement.dataset.threadBackgroundGradient || 'var(--color-gradient-gray)',
        color: navigationElement.dataset.threadColor || 'blessed-blue'
      };
      console.log('✅ Extracted thread data for note:', threadData);
      return threadData;
    }
  }
  
  // Fallback: create basic data based on ID pattern
  let type = 'note';
  let title = 'Unknown';
  let backgroundGradient = 'var(--color-gradient-gray)';
  
  if (itemId.startsWith('thread_')) {
    type = 'thread';
    title = itemId === 'thread_unorganized' ? 'Unorganized' : 'Thread';
    backgroundGradient = itemId === 'thread_unorganized' 
      ? 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)'
      : 'var(--color-gradient-gray)';
  } else if (itemId.startsWith('space_')) {
    type = 'space';
    title = 'Space';
    backgroundGradient = 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)';
  } else if (itemId.startsWith('note_')) {
    type = 'note';
    title = 'Note';
    backgroundGradient = 'var(--color-gradient-gray)';
  }
  
  const itemData = {
    id: itemId,
    title: title,
    type: type,
    count: 0,
    backgroundGradient: backgroundGradient,
    color: type === 'space' ? 'paper' : 'blessed-blue'
  };
  
  console.log('✅ Extracted fallback data:', itemData);
  return itemData;
}

// Enhanced close function that also removes from navigation history
window.closeNavigationItemWithHistory = function(itemId) {
  console.log('🔥 closeNavigationItemWithHistory called with itemId:', itemId);
  
  // Remove from navigation history
  removeFromNavigationHistory(itemId);
  
  // For persistent navigation items, we just remove them from history
  // We don't navigate away or hide regular navigation items
  console.log('✅ Removed item from navigation history:', itemId);
};

// Track if we've already initialized to prevent duplicates
let navigationTrackingInitialized = false;

// Initialize navigation tracking
function initializeNavigationTracking() {
  if (navigationTrackingInitialized) {
    console.log('⏭️ Navigation tracking already initialized, skipping');
    return;
  }
  
  console.log('🚀 Initializing navigation tracking');
  navigationTrackingInitialized = true;
  
  // Track current page access
  trackNavigationAccess();
  
  // Track navigation on page changes (for View Transitions)
  document.addEventListener('astro:page-load', () => {
    console.log('📄 Page loaded, tracking navigation access');
    trackNavigationAccess();
  });
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeNavigationTracking);
} else {
  initializeNavigationTracking();
}

// Export functions for global access
window.trackNavigationAccess = trackNavigationAccess;
window.getNavigationHistory = getNavigationHistory;
window.addToNavigationHistory = addToNavigationHistory;
window.removeFromNavigationHistory = removeFromNavigationHistory;
window.clearNavigationHistory = clearNavigationHistory;

// Debug function to clear navigation history
window.debugNavigation = {
  clearHistory: clearNavigationHistory,
  getHistory: getNavigationHistory,
  addItem: addToNavigationHistory,
  removeItem: removeFromNavigationHistory,
  showOrder: () => {
    const history = getNavigationHistory();
    console.log('📋 Navigation order (most recent first access at top):');
    history.forEach((item, index) => {
      const firstAccess = new Date(item.firstAccessed || 0).toLocaleTimeString();
      const lastAccess = new Date(item.lastAccessed || 0).toLocaleTimeString();
      console.log(`${index + 1}. ${item.title} (${item.id}) - First: ${firstAccess}, Last: ${lastAccess}`);
    });
  },
  removeUnorganizedFromHistory: () => {
    removeFromNavigationHistory('thread_unorganized');
    if (window.renderPersistentNavigation) {
      window.renderPersistentNavigation();
    }
  }
};
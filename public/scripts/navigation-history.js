// Simple Navigation History - Clean localStorage approach
console.log('🚀 Navigation history script loaded');
console.log('🔍 Script version: 4.1 - Fixed Blue wave duplication issue');
console.log('🔍 Current URL:', window.location.href);
console.log('🔍 Current path:', window.location.pathname);

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
  console.log('📝 addToNavigationHistory called for:', item.id);
  
  // CRITICAL FIX: Don't add Blue wave thread when on unorganized thread
  if (item.id === 'thread_1758241289251' && window.location.pathname === '/thread_unorganized') {
    console.log('🚫 BLUE WAVE BLOCKED - Not adding Blue wave when on unorganized thread');
    return;
  }
  
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
  console.log('✅ Added to navigation history:', item);
  
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

// Check if an item is currently active (being viewed)
function isItemCurrentlyActive(itemId) {
  const currentPath = window.location.pathname;
  const currentItemId = currentPath.startsWith('/') ? currentPath.substring(1) : currentPath;
  const isActive = currentItemId === itemId;
  console.log(`🔍 Checking if ${itemId} is currently active:`, isActive, `(current: ${currentItemId})`);
  return isActive;
}

// Check if an item is permanently visible in regular navigation (spaces only)
function isItemPermanentlyVisible(itemId) {
  // Check if it's a space (starts with space_)
  if (itemId.startsWith('space_')) {
    console.log(`🔍 ${itemId} is a space - permanently visible`);
    return true;
  }
  
  // Note: Threads (including unorganized) are NOT permanently visible - they can be closed
  // Only spaces are permanently visible
  console.log(`🔍 ${itemId} is a thread - NOT permanently visible`);
  return false;
}

// Track navigation when items are accessed
function trackNavigationAccess() {
  console.log('📊 trackNavigationAccess called');
  const currentPath = window.location.pathname;
  const currentItemId = currentPath.startsWith('/') ? currentPath.substring(1) : currentPath;
  
  console.log('📊 Current path:', currentPath, 'Item ID:', currentItemId);
  
  // Skip tracking for dashboard and empty paths
  if (currentItemId === 'dashboard' || currentItemId === '' || currentItemId === 'sign-in' || currentItemId === 'sign-up') {
    console.log('⏭️ Skipping tracking for:', currentItemId);
    return;
  }
  
  // Check if this item is currently active (being viewed)
  const isCurrentlyActive = isItemCurrentlyActive(currentItemId);
  
  // Check if this item is permanently visible in regular navigation
  const isPermanentlyVisible = isItemPermanentlyVisible(currentItemId);
  
  console.log(`📊 Tracking navigation access for ${currentItemId}:`, {
    isCurrentlyActive,
    isPermanentlyVisible,
    willTrack: !isCurrentlyActive && !isPermanentlyVisible
  });
  
  // Only track items that are NOT permanently visible (spaces)
  // We track items when they are accessed, regardless of whether they're currently active
  if (!isPermanentlyVisible) {
    const itemData = extractItemDataFromPage(currentItemId);
    
    if (itemData) {
      console.log(`✅ Adding ${currentItemId} to navigation history:`, itemData);
      addToNavigationHistory(itemData);
    }
  } else {
    console.log(`⏭️ Skipping ${currentItemId} - permanently visible in regular navigation (space)`);
  }
}

// Extract item data from the current page
function extractItemDataFromPage(itemId) {
  console.log('🔍 extractItemDataFromPage called for:', itemId);
  
  try {
    // Try to get data from navigation element attributes first
    const navigationElement = document.querySelector('[slot="navigation"]');
    console.log('🔍 Found navigation element:', navigationElement);
    
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
  
  } catch (error) {
    console.error('❌ Error in extractItemDataFromPage:', error);
    console.error('❌ ItemId:', itemId);
    
    // Return basic fallback data
    return {
      id: itemId,
      title: 'Unknown',
      type: 'unknown',
      count: 0,
      backgroundGradient: 'var(--color-gradient-gray)',
      color: 'blessed-blue'
    };
  }
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

// Simple close function for regular navigation items
window.closeNavigationItem = function(itemId) {
  console.log('🔥 closeNavigationItem called with itemId:', itemId);
  
  // Remove from navigation history
  removeFromNavigationHistory(itemId);
  
  // Navigate to dashboard
  if (window.astroNavigate) {
    window.astroNavigate('/dashboard');
  } else {
    window.location.replace('/dashboard');
  }
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
  console.log('🔍 Document ready state:', document.readyState);
  console.log('🔍 Current path at init:', window.location.pathname);
  navigationTrackingInitialized = true;
  
  // Track current page access with a small delay to ensure DOM is rendered
  setTimeout(() => {
    // First clean up any items that shouldn't be in history
    if (window.debugNavigation && window.debugNavigation.cleanupHistory) {
      window.debugNavigation.cleanupHistory();
    }
    // Then track current page access
    trackNavigationAccess();
  }, 100);
  
// Track navigation on page changes (for View Transitions)
document.addEventListener('astro:page-load', () => {
  console.log('📄 Page loaded, tracking navigation access');
  console.log('📄 New path:', window.location.pathname);
  // Add delay to ensure DOM is fully rendered
  setTimeout(() => {
    // First clean up any items that shouldn't be in history
    if (window.debugNavigation && window.debugNavigation.cleanupHistory) {
      window.debugNavigation.cleanupHistory();
    }
    // Then track current page access
    trackNavigationAccess();
  }, 100);
});

// Also track when navigating away from pages
document.addEventListener('astro:before-preparation', () => {
  console.log('📄 Before navigation - current path:', window.location.pathname);
  // Track the current page before leaving it
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
window.saveNavigationHistory = saveNavigationHistory;

// Test function to verify script is working
window.testNavigationScript = function() {
  console.log('🧪 Testing navigation script...');
  console.log('🧪 Current path:', window.location.pathname);
  console.log('🧪 Navigation history:', getNavigationHistory());
  console.log('🧪 Script is working!');
  return true;
};

// Test function to manually add an item to navigation history
window.testAddToHistory = function(itemId = 'test_thread_123') {
  console.log('🧪 Testing add to history...');
  const testItem = {
    id: itemId,
    title: 'Test Thread',
    type: 'thread',
    count: 1,
    backgroundGradient: 'var(--color-gradient-gray)',
    color: 'blessed-blue'
  };
  addToNavigationHistory(testItem);
  console.log('🧪 Added test item to history');
  return testItem;
};

// Test function to check visibility
window.testVisibility = function(itemId = 'thread_unorganized') {
  console.log('🧪 Testing visibility for:', itemId);
  const isActive = isItemCurrentlyActive(itemId);
  const isPermanentlyVisible = isItemPermanentlyVisible(itemId);
  console.log('🧪 Results:', { isActive, isPermanentlyVisible });
  return { isActive, isPermanentlyVisible };
};

// Test function to manually add Blue wave thread to history
window.testAddBlueWave = function() {
  console.log('🧪 Manually adding Blue wave thread to history...');
  const blueWaveItem = {
    id: 'thread_1758241289251',
    title: 'Blue wave',
    type: 'thread',
    count: 1,
    backgroundGradient: 'linear-gradient(180deg, var(--color-blessed-blue) 0%, var(--color-blessed-blue) 100%)',
    color: 'blessed-blue',
    lastAccessed: Date.now()
  };
  addToNavigationHistory(blueWaveItem);
  console.log('🧪 Added Blue wave to history');
  
  // Trigger re-render of persistent navigation
  if (window.renderPersistentNavigation) {
    window.renderPersistentNavigation();
  }
  
  return blueWaveItem;
};

// Trigger initial persistent navigation render
if (typeof window.renderPersistentNavigation === 'function') {
  window.renderPersistentNavigation();
}

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
  },
  // New function to clean up items that should not be in history
  cleanupHistory: () => {
    const history = getNavigationHistory();
    
    console.log('🧹 Cleaning up navigation history...');
    
    const cleanedHistory = history.filter(item => {
      const isCurrentlyActive = isItemCurrentlyActive(item.id);
      const isPermanentlyVisible = isItemPermanentlyVisible(item.id);
      const shouldKeep = !isCurrentlyActive && !isPermanentlyVisible;
      
      if (!shouldKeep) {
        if (isCurrentlyActive) {
          console.log(`🗑️ Removing ${item.id} from history (currently active)`);
        } else if (isPermanentlyVisible) {
          console.log(`🗑️ Removing ${item.id} from history (permanently visible - space)`);
        }
      }
      return shouldKeep;
    });
    
    if (cleanedHistory.length !== history.length) {
      saveNavigationHistory(cleanedHistory);
      console.log(`✅ Cleaned up navigation history: ${history.length} -> ${cleanedHistory.length} items`);
      
      // Re-render persistent navigation
      if (window.renderPersistentNavigation) {
        window.renderPersistentNavigation();
      }
    } else {
      console.log('✅ Navigation history is already clean');
    }
  }
};
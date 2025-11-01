// Simple Navigation History - Clean and Working

// Storage utility with localStorage fallback to sessionStorage
function getStorage() {
  try {
    // Test localStorage first
    const testKey = 'test-storage-' + Date.now();
    localStorage.setItem(testKey, 'test');
    const retrieved = localStorage.getItem(testKey);
    localStorage.removeItem(testKey);
    
    if (retrieved === 'test') {
      return localStorage;
    } else {
      throw new Error('localStorage test failed');
    }
  } catch (error) {
    return sessionStorage;
  }
}

// Alternative storage approach using a global variable as backup
window.navigationHistoryBackup = window.navigationHistoryBackup || null;

// Get navigation history from storage (localStorage or sessionStorage)
function getNavigationHistory() {
  try {
    const storage = getStorage();
    const stored = storage.getItem('harvous-navigation-history-v2');
    
    let parsed = stored ? JSON.parse(stored) : [];
    
    // If localStorage is empty but we have a backup, use it
    if (parsed.length === 0 && window.navigationHistoryBackup && window.navigationHistoryBackup.length > 0) {
      parsed = window.navigationHistoryBackup;
    }
    
    
    return parsed;
  } catch (error) {
    console.error('Error getting navigation history:', error);
    console.error('Error details:', error.message, error.name);
    return window.navigationHistoryBackup || [];
  }
}

// Save navigation history to storage (localStorage or sessionStorage)
function saveNavigationHistory(history) {
  try {
    const storage = getStorage();
    const jsonString = JSON.stringify(history);
    storage.setItem('harvous-navigation-history-v2', jsonString);
    
    // Also update the backup
    window.navigationHistoryBackup = [...history];
    
    // Verify the save worked
    const verification = storage.getItem('harvous-navigation-history-v2');
    
    if (verification !== jsonString) {
      console.error('💾 saveNavigationHistory - SAVE FAILED! Data mismatch');
    } else {
    }
  } catch (error) {
    console.error('Error saving navigation history:', error);
    console.error('Error details:', error.message, error.name);
  }
}

// Add item to navigation history
function addToNavigationHistory(item) {
  const history = getNavigationHistory();
  
  // Check if item already exists
  const existingIndex = history.findIndex(h => h.id === item.id);
  
  if (existingIndex !== -1) {
    // Item already exists - this shouldn't happen if called correctly
    return;
  } else {
    // Item doesn't exist - add to end first, then sort
    const newItem = {
      ...item,
      firstAccessed: Date.now(),
      lastAccessed: Date.now()
    };
    history.push(newItem);
  }
  
  // Limit to 10 items, keeping the most recently accessed
  let limitedHistory = history;
  if (history.length > 10) {
    limitedHistory = history.slice(0, 10);
  }
  
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
  
  // Special handling for unorganized thread
  if (itemId === 'thread_unorganized') {
    localStorage.setItem('unorganized-thread-closed', 'true');
  }
  
  saveNavigationHistory(filteredHistory);
  
  // Re-render persistent navigation
  if (window.renderPersistentNavigation) {
    window.renderPersistentNavigation();
  }
}

// Track thread context for smart navigation
function trackThreadContext(threadId) {
  try {
    const contextKey = 'harvous-current-thread-context';
    const timestampKey = 'harvous-thread-context-timestamp';
    
    localStorage.setItem(contextKey, threadId);
    localStorage.setItem(timestampKey, Date.now().toString());
  } catch (error) {
    // Silent failure for thread context tracking
  }
}

// Get current thread context
function getCurrentThreadContext() {
  try {
    const contextKey = 'harvous-current-thread-context';
    const timestampKey = 'harvous-thread-context-timestamp';
    
    const threadId = localStorage.getItem(contextKey);
    const timestamp = localStorage.getItem(timestampKey);
    
    // Only use context if it's recent (within last 30 minutes)
    if (threadId && timestamp) {
      const age = Date.now() - parseInt(timestamp);
      if (age < 30 * 60 * 1000) { // 30 minutes
        return threadId;
      }
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

// Enhanced breadcrumb navigation tracking
function trackBreadcrumbNavigation(fromThreadId, toNoteId) {
  try {
    const breadcrumbKey = 'harvous-breadcrumb-navigation';
    const breadcrumbData = {
      fromThreadId: fromThreadId,
      toNoteId: toNoteId,
      timestamp: Date.now()
    };
    
    localStorage.setItem(breadcrumbKey, JSON.stringify(breadcrumbData));
  } catch (error) {
    // Silent failure for breadcrumb tracking
  }
}

// Get breadcrumb navigation context
function getBreadcrumbNavigation(noteId) {
  try {
    const breadcrumbKey = 'harvous-breadcrumb-navigation';
    const breadcrumbData = localStorage.getItem(breadcrumbKey);
    
    if (breadcrumbData) {
      const data = JSON.parse(breadcrumbData);
      
      // Only use if it's recent (within last 5 minutes) and matches the note
      const age = Date.now() - data.timestamp;
      if (age < 5 * 60 * 1000 && data.toNoteId === noteId) { // 5 minutes
        return data.fromThreadId;
      }
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

// Detect thread context from referrer
function getThreadContextFromReferrer() {
  try {
    const referrer = document.referrer;
    
    if (referrer) {
      const referrerPath = new URL(referrer).pathname;
      
      // Only extract thread context from actual thread pages
      if (referrerPath.includes('/thread_')) {
        const threadId = referrerPath.split('/').pop();
        if (threadId && threadId !== 'dashboard' && threadId !== 'sign-in' && threadId !== 'sign-up') {
          return threadId;
        }
      }
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

// Track navigation access
function trackNavigationAccess() {
  const currentPath = window.location.pathname;
  const currentItemId = currentPath.startsWith('/') ? currentPath.substring(1) : currentPath;


  // Skip dashboard and empty paths
  if (currentItemId === 'dashboard' || currentItemId === '' || currentItemId === 'sign-in' || currentItemId === 'sign-up') {
    // Skipping navigation tracking for dashboard
    return;
  }
  
  // Debug: Processing navigation for currentItemId
  
  // Track spaces too (they should be persistent and closable)
  // Spaces are now tracked in navigation history
  
  // Extract item data from page
  const itemData = extractItemDataFromPage(currentItemId);
  
  if (itemData) {
    // Special handling for unorganized thread
    if (currentItemId === 'thread_unorganized' || itemData.id === 'thread_unorganized') {
      localStorage.removeItem('unorganized-thread-closed');
    }
    
    // Check if this is a new item (not in history yet)
    const history = getNavigationHistory();
    const existingItem = history.find(h => h.id === itemData.id);
    
    if (!existingItem) {
      // Only add new items to history - this preserves the order
      addToNavigationHistory(itemData);
    } else {
      // Update the item data but DON'T change its position
      const existingIndex = history.findIndex(h => h.id === itemData.id);
      history[existingIndex] = {
        ...history[existingIndex],
        ...itemData,
        lastAccessed: Date.now()
      };
      
      saveNavigationHistory(history);
      
      // Re-render persistent navigation
      if (window.renderPersistentNavigation) {
        window.renderPersistentNavigation();
      }
    }
  }
}

// Helper function to get thread gradient CSS (client-side compatible)
function getThreadGradientCSS(color) {
  const colorVar = color ? `var(--color-${color})` : 'var(--color-paper)';
  return `linear-gradient(180deg, ${colorVar} 0%, ${colorVar} 100%)`;
}

// Extract item data from page
function extractItemDataFromPage(currentItemId) {
  try {
    // Try to get data from navigation element first
    const navigationElement = document.querySelector('[slot="navigation"]');
    
    if (navigationElement) {
      const threadId = navigationElement.dataset.threadId;
      const spaceId = navigationElement.dataset.spaceId;
      const noteId = navigationElement.dataset.noteId;
      
      if (threadId) {
        return {
          id: threadId,
          title: navigationElement.dataset.threadTitle || 'Thread',
          type: 'thread',
          count: parseInt(navigationElement.dataset.threadNoteCount) || 0,
          backgroundGradient: navigationElement.dataset.threadBackgroundGradient || getThreadGradientCSS('blue'),
          color: navigationElement.dataset.threadColor || 'blue'
        };
      }
      
      if (spaceId) {
        return {
          id: spaceId,
          title: navigationElement.dataset.spaceTitle || 'Space',
          type: 'space',
          count: parseInt(navigationElement.dataset.spaceItemCount) || 0,
          backgroundGradient: navigationElement.dataset.spaceBackgroundGradient || getThreadGradientCSS('paper'),
          color: navigationElement.dataset.spaceColor || 'paper'
        };
      }
      
      if (noteId) {
        // For notes, track the parent thread
        const parentThreadId = navigationElement.dataset.parentThreadId;
        const parentThreadTitle = navigationElement.dataset.parentThreadTitle;
        const parentThreadCount = navigationElement.dataset.parentThreadCount;
        
        if (parentThreadId) {
          return {
            id: parentThreadId,
            title: parentThreadTitle || 'Thread',
            type: 'thread',
            count: parseInt(parentThreadCount) || 0,
            backgroundGradient: navigationElement.dataset.parentThreadBackgroundGradient || getThreadGradientCSS('blue'),
            color: navigationElement.dataset.parentThreadColor || 'blue'
          };
        }
      }
    }
    
    // For note pages, try to get parent thread data from the main content area
    if (currentItemId.startsWith('note_')) {
      const noteElement = document.querySelector('[data-note-id]');
      
      if (noteElement) {
        const parentThreadId = noteElement.dataset.parentThreadId || 'thread_unorganized';
        const parentThreadTitle = noteElement.dataset.parentThreadTitle || 'Unorganized';
        const parentThreadCount = noteElement.dataset.parentThreadCount || '0';
        const parentThreadBackgroundGradient = noteElement.dataset.parentThreadBackgroundGradient;
        const parentThreadColor = noteElement.dataset.parentThreadColor;
        
        // Special handling for unorganized thread
        if (parentThreadId === 'thread_unorganized') {
          return {
            id: 'thread_unorganized',
            title: 'Unorganized',
            type: 'thread',
            count: parseInt(parentThreadCount) || 0,
            backgroundGradient: parentThreadBackgroundGradient || getThreadGradientCSS('paper'),
            color: parentThreadColor || 'paper'
          };
        } else {
          return {
            id: parentThreadId,
            title: parentThreadTitle,
            type: 'thread',
            count: parseInt(parentThreadCount) || 0,
            backgroundGradient: parentThreadBackgroundGradient || getThreadGradientCSS('blue'),
            color: parentThreadColor || 'blue'
          };
        }
      }
    }
    
    // Fallback: create basic data from current path
    let itemData = null;
    
    if (currentItemId.startsWith('thread_')) {
      itemData = {
        id: currentItemId,
        title: currentItemId === 'thread_unorganized' ? 'Unorganized' : 'Thread',
        type: 'thread',
        count: 0,
        backgroundGradient: currentItemId === 'thread_unorganized' 
          ? getThreadGradientCSS('paper')
          : getThreadGradientCSS('blue'),
        color: currentItemId === 'thread_unorganized' ? 'paper' : 'blue'
      };
    } else if (currentItemId.startsWith('space_')) {
      itemData = {
        id: currentItemId,
        title: 'Space',
        type: 'space',
        count: 0,
        backgroundGradient: getThreadGradientCSS('paper'),
        color: 'paper'
      };
    } else if (currentItemId.startsWith('note_')) {
      // Final fallback for notes: default to unorganized
      itemData = {
        id: 'thread_unorganized',
        title: 'Unorganized',
        type: 'thread',
        count: 0,
        backgroundGradient: getThreadGradientCSS('paper'),
        color: 'paper'
      };
    }
    
    return itemData;
  } catch (error) {
    console.error('Error extracting item data:', error);
    return null;
  }
}

// Initialize tracking
function initTracking() {
  trackNavigationAccess();
}

// Debug function to inspect localStorage
window.debugNavigation = {
  getHistory: () => {
    const history = getNavigationHistory();
    return history;
  },
  clearHistory: () => {
    const storage = getStorage();
    storage.removeItem('harvous-navigation-history-v2');
  },
  inspectStorage: () => {
    const storage = getStorage();
    const stored = storage.getItem('harvous-navigation-history-v2');
    try {
      const parsed = JSON.parse(stored || '[]');
      return parsed;
    } catch (error) {
      console.error('❌ Error parsing storage:', error);
      return null;
    }
  },
  checkAllLocalStorage: () => {
  },
  testLocalStorage: () => {
    const testKey = 'test-navigation-key';
    const testValue = 'test-value-' + Date.now();
    
    try {
      localStorage.setItem(testKey, testValue);
      const retrieved = localStorage.getItem(testKey);
      localStorage.removeItem(testKey);
    } catch (error) {
      console.error('🧪 localStorage test failed:', error);
    }
  },
  monitorLocalStorage: () => {
    const originalSetItem = localStorage.setItem;
    const originalRemoveItem = localStorage.removeItem;
    const originalClear = localStorage.clear;
    
    localStorage.setItem = function(key, value) {
      if (key === 'harvous-navigation-history-v2') {
      }
      return originalSetItem.call(this, key, value);
    };

    localStorage.removeItem = function(key) {
      if (key === 'harvous-navigation-history-v2') {
      }
      return originalRemoveItem.call(this, key);
    };
    
    localStorage.clear = function() {
      return originalClear.call(this);
    };
    
  },
  manualTrack: () => {
    initTracking();
  },
  testTrackCurrentPage: () => {
    trackNavigationAccess();
  }
};

// Make functions globally available
window.getNavigationHistory = getNavigationHistory;
window.addToNavigationHistory = addToNavigationHistory;
window.removeFromNavigationHistory = removeFromNavigationHistory;
window.trackNavigationAccess = trackNavigationAccess;
window.trackThreadContext = trackThreadContext;
window.getCurrentThreadContext = getCurrentThreadContext;
window.trackBreadcrumbNavigation = trackBreadcrumbNavigation;
window.getBreadcrumbNavigation = getBreadcrumbNavigation;
window.getThreadContextFromReferrer = getThreadContextFromReferrer;
window.initTracking = initTracking;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  // Only run Astro tracking if React NavigationProvider hasn't loaded yet
  setTimeout(() => {
    if (!window.addToNavigationHistory || typeof window.addToNavigationHistory !== 'function') {
      if (typeof initTracking === 'function') {
        initTracking();
      }
    }
  }, 100);
});

// Listen for astro:page-load events
document.addEventListener('astro:page-load', () => {
  // Only run Astro tracking if React NavigationProvider hasn't loaded yet
  setTimeout(() => {
    if (!window.addToNavigationHistory || typeof window.addToNavigationHistory !== 'function') {
      if (typeof initTracking === 'function') {
        initTracking();
      }
    }
  }, 100);
});

// Test function to manually trigger navigation tracking
window.testNavigationTracking = function() {
  if (typeof trackNavigationAccess === 'function') {
    trackNavigationAccess();
  } else {
    console.error('trackNavigationAccess function not found');
  }
};

// Test function to verify script is working
window.testNavigationScript = function() {
  return 'Navigation script is working!';
};


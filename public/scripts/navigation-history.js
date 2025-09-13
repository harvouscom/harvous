// Navigation history tracking - Simple localStorage approach
console.log('🚀 Navigation history script loaded');

// Navigation item interface
const NavigationItem = {
  id: '',
  title: '',
  type: 'thread', // 'thread' | 'space' | 'note'
  count: 0,
  backgroundGradient: '',
  color: '',
  lastAccessed: 0
};

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
    // Item exists - move it to the end (most recent) and update its data
    const existingItem = currentHistory[existingIndex];
    updatedHistory = [
      ...currentHistory.filter((_, index) => index !== existingIndex),
      {
        ...existingItem,
        ...item,
        lastAccessed: now
      }
    ];
  } else {
    // New item - add to the end
    updatedHistory = [
      ...currentHistory,
      {
        ...item,
        lastAccessed: now
      }
    ];
  }
  
  saveNavigationHistory(updatedHistory);
  console.log('📚 Navigation history updated:', updatedHistory);
  
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
  console.log('📚 Updated navigation history:', updatedHistory);
  
  // Trigger re-render of persistent navigation
  if (window.renderPersistentNavigation) {
    window.renderPersistentNavigation();
  }
}

// Track navigation when items are accessed
function trackNavigationAccess() {
  const currentPath = window.location.pathname;
  const currentItemId = currentPath.startsWith('/') ? currentPath.substring(1) : currentPath;
  
  console.log('🔍 Tracking navigation access for:', currentItemId);
  
  // Skip tracking for dashboard
  if (currentItemId === 'dashboard' || currentItemId === '') {
    console.log('⏭️ Skipping tracking for dashboard');
    return;
  }
  
  // Special handling for notes in unorganized thread
  if (currentItemId.startsWith('note_')) {
    const itemData = extractItemDataFromPage(currentItemId);
    if (itemData) {
      // For notes, always treat them as individual items, not part of unorganized thread
      const noteData = {
        ...itemData,
        type: 'note',
        title: itemData.title || 'Note'
      };
      console.log('📝 Adding note to navigation history:', noteData);
      addToNavigationHistory(noteData);
      
      // Also track the thread this note belongs to (including unorganized thread)
      if (itemData.type === 'thread') {
        console.log('📝 Adding thread to navigation history:', itemData);
        addToNavigationHistory(itemData);
      }
      return;
    }
  }
  
  // Special handling for unorganized thread itself
  if (currentItemId === 'thread_unorganized') {
    const unorganizedThreadData = {
      id: 'thread_unorganized',
      title: 'Unorganized',
      type: 'thread',
      count: 0, // We'll update this when we have better data
      backgroundGradient: 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)',
      color: 'paper'
    };
    console.log('📝 Adding unorganized thread to navigation history:', unorganizedThreadData);
    addToNavigationHistory(unorganizedThreadData);
    return;
  }
  
  // Get item data from the page
  const itemData = extractItemDataFromPage(currentItemId);
  
  if (itemData) {
    console.log('📝 Adding to navigation history:', itemData);
    addToNavigationHistory(itemData);
  } else {
    console.log('❌ Could not extract item data for:', currentItemId);
  }
}

// Extract item data from the current page
function extractItemDataFromPage(itemId) {
  console.log('🔍 Extracting data for itemId:', itemId);
  
  // Try to get data from navigation element attributes
  const navigationElement = document.querySelector('[slot="navigation"]');
  if (navigationElement) {
    console.log('🔍 Navigation element data:', {
      threadId: navigationElement.dataset.threadId,
      threadTitle: navigationElement.dataset.threadTitle,
      threadNoteCount: navigationElement.dataset.threadNoteCount,
      threadBackgroundGradient: navigationElement.dataset.threadBackgroundGradient,
      threadColor: navigationElement.dataset.threadColor,
      contentType: navigationElement.dataset.contentType,
      contentId: navigationElement.dataset.contentId
    });
    
    // Check for thread data
    if (navigationElement.dataset.threadId === itemId) {
      const itemData = {
        id: itemId,
        title: navigationElement.dataset.threadTitle || 'Unknown Thread',
        type: 'thread',
        count: parseInt(navigationElement.dataset.threadNoteCount) || 0,
        backgroundGradient: navigationElement.dataset.threadBackgroundGradient,
        color: navigationElement.dataset.threadColor
      };
      console.log('✅ Extracted thread data:', itemData);
      return itemData;
    }
    
    // Check for space data (spaces don't have specific data attributes yet)
    if (itemId.startsWith('space_')) {
      const itemData = {
        id: itemId,
        title: 'Space', // We'll need to get this from the page content
        type: 'space',
        count: 0,
        backgroundGradient: 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)',
        color: 'paper'
      };
      console.log('✅ Extracted space data:', itemData);
      return itemData;
    }
    
    // For notes, try to get the thread data from the navigation element
    if (itemId.startsWith('note_') && navigationElement.dataset.threadId) {
      const threadData = {
        id: navigationElement.dataset.threadId,
        title: navigationElement.dataset.threadTitle || 'Unknown Thread',
        type: 'thread',
        count: parseInt(navigationElement.dataset.threadNoteCount) || 0,
        backgroundGradient: navigationElement.dataset.threadBackgroundGradient,
        color: navigationElement.dataset.threadColor
      };
      console.log('✅ Extracted thread data for note:', threadData);
      return threadData;
    }
  }
  
  // Try to get data from page title and content
  const pageTitle = document.title;
  if (pageTitle && pageTitle !== 'Harvous') {
    // Determine type based on ID prefix
    let type = 'note'; // default
    if (itemId.startsWith('thread_')) type = 'thread';
    else if (itemId.startsWith('space_')) type = 'space';
    else if (itemId.startsWith('note_')) type = 'note';
    
    // For notes, try to get a better title from the page content
    let title = pageTitle;
    if (type === 'note') {
      // Try to find the note title in the page
      const noteTitleElement = document.querySelector('h1, .note-title, [data-note-title]');
      if (noteTitleElement && noteTitleElement.textContent.trim()) {
        title = noteTitleElement.textContent.trim();
      } else {
        title = 'Note'; // Fallback title
      }
    }
    
    const itemData = {
      id: itemId,
      title: title,
      type: type,
      count: 0, // We'll update this when we have better data
      backgroundGradient: type === 'space' ? 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)' : 'var(--color-gradient-gray)'
    };
    console.log('✅ Extracted data from page title:', itemData);
    return itemData;
  }
  
  console.log('❌ Could not extract data for itemId:', itemId);
  return null;
}

// Enhanced close function that also removes from navigation history
window.closeNavigationItemWithHistory = function(itemId) {
  console.log('🔥 closeNavigationItemWithHistory called with itemId:', itemId);
  
  // Remove from navigation history
  removeFromNavigationHistory(itemId);
  
  // Also remove from the DOM if it exists
  const itemToClose = document.querySelector(`[data-navigation-item="${itemId}"]`);
  if (itemToClose) {
    itemToClose.style.display = 'none';
    itemToClose.setAttribute('data-closed', 'true');
  }
  
  // Navigate to dashboard if this was the current page
  const currentPath = window.location.pathname;
  const currentItemId = currentPath.startsWith('/') ? currentPath.substring(1) : currentPath;
  
  if (currentItemId === itemId) {
    console.log('🚀 Navigating to dashboard because current item was closed');
    if (window.astroNavigate) {
      window.astroNavigate('/dashboard');
    } else {
      window.location.replace('/dashboard');
    }
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
  navigationTrackingInitialized = true;
  
  // Track current page access
  trackNavigationAccess();
  
  // Track navigation on page changes (for View Transitions)
  document.addEventListener('astro:page-load', () => {
    console.log('📄 Page loaded, tracking navigation access');
    trackNavigationAccess();
  });
}

// Reset initialization flag on page unload to allow re-initialization
document.addEventListener('astro:before-preparation', () => {
  navigationTrackingInitialized = false;
  console.log('🔄 Reset navigation tracking initialization flag');
});

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeNavigationTracking);
} else {
  initializeNavigationTracking();
}

// Clear all navigation history (for debugging)
function clearNavigationHistory() {
  localStorage.removeItem('navigation-history');
  console.log('🧹 Navigation history cleared');
  
  // Trigger re-render of persistent navigation
  if (window.renderPersistentNavigation) {
    window.renderPersistentNavigation();
  }
}

// Export functions for global access
window.trackNavigationAccess = trackNavigationAccess;
window.getNavigationHistory = getNavigationHistory;
window.addToNavigationHistory = addToNavigationHistory;
window.removeFromNavigationHistory = removeFromNavigationHistory;
window.clearNavigationHistory = clearNavigationHistory;

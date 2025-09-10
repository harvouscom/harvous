// Navigation state management
class NavigationState {
  constructor() {
    this.storageKey = 'harvous-navigation-state';
    this.persistentKey = 'harvous-persistent-navigation';
  }

  // Save the current navigation state
  saveState(currentPath, activeItems = {}) {
    const state = {
      currentPath,
      activeItems,
      timestamp: Date.now()
    };
    localStorage.setItem(this.storageKey, JSON.stringify(state));
  }

  // Get the saved navigation state
  getState() {
    const saved = localStorage.getItem(this.storageKey);
    if (!saved) return null;
    
    try {
      const state = JSON.parse(saved);
      // Only use state that's less than 1 hour old
      if (Date.now() - state.timestamp < 3600000) {
        return state;
      }
    } catch (e) {
      console.error('Error parsing navigation state:', e);
    }
    return null;
  }

  // Clear the navigation state
  clearState() {
    localStorage.removeItem(this.storageKey);
  }

  // Update the active items in the current state
  updateActiveItems(activeItems) {
    const currentState = this.getState();
    if (currentState) {
      currentState.activeItems = { ...currentState.activeItems, ...activeItems };
      this.saveState(currentState.currentPath, currentState.activeItems);
    }
  }

  // Get persistent navigation items (threads and spaces that stay open)
  getPersistentItems() {
    const saved = localStorage.getItem(this.persistentKey);
    if (!saved) return [];
    
    try {
      return JSON.parse(saved);
    } catch (e) {
      console.error('Error parsing persistent items:', e);
      return [];
    }
  }

  // Add an item to persistent navigation
  addPersistentItem(item) {
    const persistentItems = this.getPersistentItems();
    // Check if item already exists
    const exists = persistentItems.some(persistent => persistent.id === item.id);
    if (!exists) {
      persistentItems.push(item);
      localStorage.setItem(this.persistentKey, JSON.stringify(persistentItems));
      
      // Dispatch event to update navigation
      window.dispatchEvent(new CustomEvent('persistentItemAdded', {
        detail: { item }
      }));
    }
  }

  // Remove an item from persistent navigation
  removePersistentItem(itemId) {
    const persistentItems = this.getPersistentItems();
    const filtered = persistentItems.filter(item => item.id !== itemId);
    localStorage.setItem(this.persistentKey, JSON.stringify(filtered));
  }

  // Clear all persistent items
  clearPersistentItems() {
    localStorage.removeItem(this.persistentKey);
  }
}

// Initialize navigation state management
const navigationState = new NavigationState();

// Save state when navigating
document.addEventListener('DOMContentLoaded', () => {
  console.log('Navigation state script loaded');
  
  // Add a small delay to ensure DOM is fully rendered
  setTimeout(() => {
    const currentPath = window.location.pathname;
    console.log('Current path:', currentPath);
    const urlParams = new URLSearchParams(window.location.search);
    
    // Extract active items from URL or current page
    const activeItems = {};
  
  // If we're on a thread page, save the thread and add it to persistent navigation
  if (currentPath.includes('thread_')) {
    console.log('Detected thread page');
    const threadId = currentPath.split('/')[1];
    console.log('Thread ID:', threadId);
    activeItems.thread = threadId;
    
    // Add the thread to persistent navigation
    // We'll get the thread details from the page data
    // Try multiple selectors to find the navigation element
    let navigationElement = document.querySelector('[slot="navigation"]');
    if (!navigationElement) {
      navigationElement = document.querySelector('.h-full[slot="navigation"]');
    }
    if (!navigationElement) {
      navigationElement = document.querySelector('div[slot="navigation"]');
    }
    
    console.log('Navigation element found:', !!navigationElement);
    if (navigationElement) {
      console.log('Thread data attributes:', {
        threadId: navigationElement.dataset.threadId,
        threadTitle: navigationElement.dataset.threadTitle,
        threadColor: navigationElement.dataset.threadColor,
        threadNoteCount: navigationElement.dataset.threadNoteCount
      });
    }
    
    // If we still can't find the element with data attributes, try to get thread data from the page content
    if (!navigationElement || !navigationElement.dataset.threadId) {
      console.log('Trying to get thread data from page content...');
      // Look for thread data in the page content or try to extract from URL
      const threadData = {
        id: threadId,
        type: 'thread',
        title: 'Thread', // We'll use a default title for now
        color: 'blessed-blue',
        noteCount: 0
      };
      console.log('Adding thread to persistent navigation with default data:', threadData);
      navigationState.addPersistentItem(threadData);
    } else {
      const threadData = {
        id: threadId,
        type: 'thread',
        title: navigationElement.dataset.threadTitle || 'Thread',
        color: navigationElement.dataset.threadColor || 'blessed-blue',
        noteCount: parseInt(navigationElement.dataset.threadNoteCount || '0')
      };
      console.log('Adding thread to persistent navigation:', threadData);
      navigationState.addPersistentItem(threadData);
    }
  }
  
  // If we're on a space page, save the space and add it to persistent navigation
  if (currentPath.includes('space_')) {
    const spaceId = currentPath.split('/')[1];
    activeItems.space = spaceId;
    
    // Add the space to persistent navigation
    const navigationElement = document.querySelector('[slot="navigation"]');
    if (navigationElement && navigationElement.dataset.spaceId) {
      const spaceData = {
        id: spaceId,
        type: 'space',
        title: navigationElement.dataset.spaceTitle || 'Space',
        totalItemCount: parseInt(navigationElement.dataset.spaceItemCount || '0')
      };
      navigationState.addPersistentItem(spaceData);
    }
  }
  
    // Save the current state
    navigationState.saveState(currentPath, activeItems);
  }, 100); // 100ms delay to ensure DOM is fully rendered
});

// Export for use in other scripts
window.navigationState = navigationState;


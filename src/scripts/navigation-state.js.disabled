// Navigation state management
class NavigationState {
  constructor() {
    this.storageKey = 'harvous-navigation-state';
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
}

// Initialize navigation state management
const navigationState = new NavigationState();

// Save state when navigating
document.addEventListener('DOMContentLoaded', () => {
  const currentPath = window.location.pathname;
  const urlParams = new URLSearchParams(window.location.search);
  
  // Extract active items from URL or current page
  const activeItems = {};
  
  // If we're on a thread page, save the thread
  if (currentPath.includes('thread_')) {
    activeItems.thread = currentPath.split('/')[1];
  }
  
  // If we're on a space page, save the space
  if (currentPath.includes('space_')) {
    activeItems.space = currentPath.split('/')[1];
  }
  
  // Save the current state
  navigationState.saveState(currentPath, activeItems);
});

// Export for use in other scripts
window.navigationState = navigationState;


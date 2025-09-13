// Navigation close functionality
window.closeNavigationItem = function(itemId) {
    console.log('🔥 closeNavigationItem called with itemId:', itemId);
    if (!itemId) {
        console.log('❌ No itemId provided to closeNavigationItem');
        return;
    }
    
    console.log('🔥 Closing navigation item:', itemId);
    
    // Find the navigation item to close
    const itemToClose = document.querySelector(`[data-navigation-item="${itemId}"]`);
    if (!itemToClose) {
        console.log('❌ Item not found:', itemId);
        console.log('❌ Available items:', Array.from(document.querySelectorAll('[data-navigation-item]')).map(item => item.getAttribute('data-navigation-item')));
        return;
    }
    console.log('✅ Found item to close:', itemToClose);
    
    // Get all navigation items in the navigation column
    // Since we know the item exists, find its parent section
    const navigationColumn = itemToClose.closest('section') || 
                            document.querySelector('section');
    if (!navigationColumn) {
        console.log('❌ Navigation column not found');
        return;
    }
    console.log('✅ Found navigation column:', navigationColumn);
    
    const allItems = Array.from(navigationColumn.querySelectorAll('[data-navigation-item]'));
    const currentIndex = allItems.indexOf(itemToClose);
    
    console.log('🔥 All navigation items:', allItems.map(item => item.getAttribute('data-navigation-item')));
    console.log('🔥 Current item index:', currentIndex);
    console.log('🔥 Total items:', allItems.length);
    
    // Find the next available item (going from bottom to top, so previous in array)
    let nextItem = null;
    console.log('🔍 Looking for previous items (bottom to top)...');
    for (let i = currentIndex - 1; i >= 0; i--) {
        const item = allItems[i];
        console.log(`🔍 Checking item ${i}:`, item.getAttribute('data-navigation-item'), 'closed:', item.hasAttribute('data-closed'));
        if (item && !item.hasAttribute('data-closed')) {
            nextItem = item;
            console.log('✅ Found previous item:', item.getAttribute('data-navigation-item'));
            break;
        }
    }
    
    // If no previous item, find the next available item (going down)
    if (!nextItem) {
        console.log('🔍 No previous items found, looking for next items (top to bottom)...');
        for (let i = currentIndex + 1; i < allItems.length; i++) {
            const item = allItems[i];
            console.log(`🔍 Checking item ${i}:`, item.getAttribute('data-navigation-item'), 'closed:', item.hasAttribute('data-closed'));
            if (item && !item.hasAttribute('data-closed')) {
                nextItem = item;
                console.log('✅ Found next item:', item.getAttribute('data-navigation-item'));
                break;
            }
        }
    }
    
    console.log('🔥 Next item found:', nextItem ? nextItem.getAttribute('data-navigation-item') : 'none');
    
    // Mark current item as closed
    itemToClose.setAttribute('data-closed', 'true');
    itemToClose.style.display = 'none';
    
    // Save closed state
    window.saveClosedState();
    
    // Add a small delay to ensure DOM changes are processed
    setTimeout(() => {
    
        // Navigate to next available item
        if (nextItem) {
            const link = nextItem.querySelector('a');
            if (link) {
                console.log('🚀 Navigating to:', link.href);
                // Use Astro's navigate function for proper View Transitions support
                if (window.astroNavigate) {
                    window.astroNavigate(link.href);
                } else {
                    window.location.replace(link.href);
                }
            } else {
                console.log('❌ No link found in next item');
            }
        } else {
            // If no other items available, go to dashboard
            console.log('🚀 No other items available, going to dashboard');
            console.log('🚀 Executing redirect to dashboard...');
            // Use Astro's navigate function for proper View Transitions support
            if (window.astroNavigate) {
                window.astroNavigate('/dashboard');
            } else {
                window.location.replace('/dashboard');
            }
        }
    }, 100); // Small delay to ensure DOM changes are processed
};

// Initialize navigation state on page load and after navigation
function initializeNavigationState() {
    // Get current page ID from URL
    const currentPath = window.location.pathname;
    const currentItemId = currentPath.startsWith('/') ? currentPath.substring(1) : currentPath;
    
    console.log('🔧 Initializing navigation state for current item:', currentItemId);
    
    // Restore closed state from session storage
    let closedItems = JSON.parse(sessionStorage.getItem('closedNavigationItems') || '[]');
    console.log('🔧 Closed items from session storage:', closedItems);
    
    // Clear the closed state for the current item (so it shows in navigation)
    if (currentItemId && closedItems.includes(currentItemId)) {
        console.log('🔧 Clearing closed state for current item:', currentItemId);
        window.clearClosedState(currentItemId);
        // Remove it from the closedItems array so we don't hide it
        closedItems = closedItems.filter(id => id !== currentItemId);
        console.log('🔧 Updated closed items after clearing current:', closedItems);
    }
    
    // Apply closed state to remaining items
    closedItems.forEach(itemId => {
        const item = document.querySelector(`[data-navigation-item="${itemId}"]`);
        if (item) {
            console.log('🔧 Hiding closed item:', itemId);
            item.setAttribute('data-closed', 'true');
            item.style.display = 'none';
        }
    });
}

// Initialize on DOM ready (initial page load)
document.addEventListener('DOMContentLoaded', initializeNavigationState);

// Re-initialize after view transitions (Astro navigation)
document.addEventListener('astro:page-load', initializeNavigationState);

// Save closed state to session storage
window.saveClosedState = function() {
    const closedItems = Array.from(document.querySelectorAll('[data-navigation-item][data-closed="true"]'))
        .map(item => item.getAttribute('data-navigation-item'));
    sessionStorage.setItem('closedNavigationItems', JSON.stringify(closedItems));
    console.log('💾 Saved closed state:', closedItems);
};

// Clear closed state for a specific item (when navigating to it)
window.clearClosedState = function(itemId) {
    const closedItems = JSON.parse(sessionStorage.getItem('closedNavigationItems') || '[]');
    const updatedItems = closedItems.filter(id => id !== itemId);
    sessionStorage.setItem('closedNavigationItems', JSON.stringify(updatedItems));
    console.log('🧹 Cleared closed state for:', itemId);
    console.log('💾 Updated closed state:', updatedItems);
};

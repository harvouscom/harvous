// Load persistent navigation from localStorage with proper chronological ordering
// Added retry logic to wait for DOM readiness
function loadPersistentNavigation(retryCount) {
  if (retryCount === undefined) retryCount = 0;
  const maxRetries = 10;
  const retryDelay = 100;
  
  try {
    const navHistory = localStorage.getItem('harvous-navigation-history-v2');
    if (!navHistory) {
      return;
    }
    
    const history = JSON.parse(navHistory);
    
    // Sort by firstAccessed (chronological order - maintain original order)
    // Defensive: handle missing firstAccessed by treating as oldest (very large number)
    // Check for undefined/null specifically, not falsy (0 is a valid timestamp)
    const sortedHistory = history.sort((a, b) => {
      const aFirst = (a.firstAccessed != null) ? a.firstAccessed : Number.MAX_SAFE_INTEGER;
      const bFirst = (b.firstAccessed != null) ? b.firstAccessed : Number.MAX_SAFE_INTEGER;
      return aFirst - bFirst;
    });
    
    // Filter out items that shouldn't be shown
    const currentPath = window.location.pathname;
    const currentItemId = currentPath.startsWith('/') ? currentPath.substring(1) : currentPath;
    
    // Get active thread ID from navigation element data attributes
    const navigationElement = document.querySelector('[slot="navigation"]');
    const activeThreadId = navigationElement ? navigationElement.getAttribute('data-thread-id') : null;
    
    let persistentItems = sortedHistory.filter((item) => {
      // Don't show dashboard
      if (item.id === 'dashboard') {
        return false;
      }
      
      return true;
    });
    
    if (persistentItems.length === 0) {
      // Remove existing persistent navigation if it exists
      const existingPersistentNav = document.getElementById('persistent-navigation');
      if (existingPersistentNav) {
        existingPersistentNav.remove();
      }
      return;
    }
    
    // Find the "For You" button and insert persistent navigation after it
    // Use more specific selector to ensure we find the right element
    const forYouButton = document.querySelector('a[href="/"]');
    if (!forYouButton) {
      // Retry if button not found and we haven't exceeded max retries
      if (retryCount < maxRetries) {
        setTimeout(() => {
          loadPersistentNavigation(retryCount + 1);
        }, retryDelay);
      }
      return;
    }
    
    // Find the parent container
    const parentContainer = forYouButton.parentElement;
    if (!parentContainer) {
      // Retry if parent container not found and we haven't exceeded max retries
      if (retryCount < maxRetries) {
        setTimeout(() => {
          loadPersistentNavigation(retryCount + 1);
        }, retryDelay);
      }
      return;
    }
    
    // Check if persistent navigation already exists
    let persistentNav = document.getElementById('persistent-navigation');
    if (persistentNav) {
      persistentNav.remove();
    }
    
    // Create persistent navigation container
    persistentNav = document.createElement('div');
    persistentNav.id = 'persistent-navigation';
    persistentNav.className = 'w-full';
    
    // Add each item in chronological order (oldest first)
    persistentItems.forEach((item) => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'w-full nav-item-container';
      itemDiv.setAttribute('data-navigation-item', item.id);
      
      // Check if this is the current page or if we're on a note page and this is the parent thread
      let isCurrentPage = item.id === currentItemId;
      
      // Special case: if we're on a note page, check if this thread is the parent thread
      if (!isCurrentPage && currentItemId.startsWith('note_')) {
        const navigationElement = document.querySelector('[slot="navigation"]');
        if (navigationElement) {
          const parentThreadId = navigationElement.dataset.parentThreadId;
          if (parentThreadId && item.id === parentThreadId) {
            isCurrentPage = true;
          }
        }
      }
      
      // Also check data-thread-id attribute as fallback (useful for newly created threads)
      if (!isCurrentPage && navigationElement) {
        const threadId = navigationElement.getAttribute('data-thread-id');
        if (threadId && item.id === threadId) {
          isCurrentPage = true;
        }
      }
      
      // Create outer container for positioning close icon outside link
      const outerContainer = document.createElement('div');
      outerContainer.className = 'relative w-full';
      
      const link = document.createElement('a');
      link.href = `/${item.id}`;
      link.className = 'w-full relative block';
      
      // Helper function to determine if background is a colored thread background
      function isColoredBackground(gradient) {
        if (!gradient || gradient === 'var(--color-gradient-gray)' || gradient === 'var(--color-paper)') {
          return false;
        }
        // Check if gradient contains any thread color CSS variable (excluding paper)
        const threadColors = ['blue', 'yellow', 'green', 'pink', 'orange', 'purple'];
        return threadColors.some(color => gradient.includes(`--color-${color}`));
      }
      
      // Determine text color based on background
      // Pastel colors use dark text for visibility
      function getTextColor(gradient) {
        // All thread colors use dark text (pastel colors)
        return 'var(--color-deep-grey)';
      }
      
      // Create SpaceButton element using Tailwind classes like the actual component
      const button = document.createElement('button');
      button.className = 'space-button relative rounded-3xl h-[64px] cursor-pointer transition-[scale,shadow] duration-300 pl-4 pr-0 group w-full';
      
      // Determine background and text color
      let backgroundGradient = item.backgroundGradient;
      let buttonTextColor = 'var(--color-deep-grey)';
      
      // Apply active styling if this is the current page
      if (isCurrentPage) {
        // Use thread's background color or paper color for spaces
        if (item.id.startsWith('space_')) {
          button.style.background = 'var(--color-paper)';
          backgroundGradient = 'var(--color-paper)';
        } else {
          // Apply thread's background gradient
          button.style.background = item.backgroundGradient;
          button.style.backgroundImage = item.backgroundGradient;
          backgroundGradient = item.backgroundGradient;
        }
        button.style.boxShadow = '0px -3px 0px 0px rgba(120, 118, 111, 0.2) inset';
        button.classList.add('active-state');
        
        // Set text color - only white if active AND background is colored
        buttonTextColor = getTextColor(backgroundGradient);
      }
      // If not active, keep default dark grey color
      
      button.style.color = buttonTextColor;
      
      // Inner structure matching SpaceButton "WithCount" state exactly
      const innerDiv = document.createElement('div');
      innerDiv.className = 'flex items-center relative w-full h-full pl-2 pr-0 transition-transform duration-125 min-w-0';
      
      // Title wrapper
      const titleWrapper = document.createElement('div');
      titleWrapper.className = 'flex-1 min-w-0 overflow-hidden text-left';
      
      const title = document.createElement('span');
      title.textContent = item.title;
      title.className = 'font-sans text-[18px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis block text-left';
      title.style.color = buttonTextColor;
      
      // Badge container
      const badgeContainer = document.createElement('div');
      badgeContainer.className = 'p-[20px] flex-shrink-0';
      
      // Badge count with hover functionality
      const badgeCount = document.createElement('div');
      badgeCount.className = 'badge-count bg-[rgba(120,118,111,0.1)] flex items-center justify-center rounded-3xl w-6 h-6 relative cursor-pointer';
      badgeCount.style.pointerEvents = 'auto';
      badgeCount.setAttribute('data-close-item', item.id);
      
      const countSpan = document.createElement('span');
      countSpan.textContent = item.count || 0;
      countSpan.className = 'text-[14px] font-sans font-semibold leading-[0] badge-number';
      countSpan.style.color = buttonTextColor;
      countSpan.style.display = 'block'; // Ensure it's visible initially
      
      // Close icon (×) - hidden by default, shown on hover
      // Using inline SVG instead of Font Awesome classes
      const closeIcon = document.createElement('div');
      closeIcon.className = 'close-icon';
      closeIcon.style.display = 'none';
      closeIcon.style.cursor = 'pointer';
      closeIcon.style.pointerEvents = 'auto';
      closeIcon.style.position = 'absolute';
      closeIcon.style.top = '50%';
      closeIcon.style.left = '50%';
      closeIcon.style.transform = 'translate(-50%, -50%)';
      closeIcon.style.width = '16px';
      closeIcon.style.height = '16px';
      // Determine close icon color - pastel colors use dark text
      const closeIconColor = 'var(--color-deep-grey)';
      
      closeIcon.innerHTML = `
        <svg viewBox="0 0 384 512" style="width: 16px; height: 16px; fill: ${closeIconColor};">
          <path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/>
        </svg>
      `;
      
      // Build structure - add both count and close icon to badge
      badgeCount.appendChild(countSpan);
      badgeCount.appendChild(closeIcon);
      
      // Add mousedown event listener to close icon for close functionality
      // Using mousedown instead of click because click events are being intercepted
      closeIcon.addEventListener('mousedown', (e) => {
        e.stopImmediatePropagation();
        e.stopPropagation();
        e.preventDefault();
        
        const itemId = badgeCount.getAttribute('data-close-item');
        if (!itemId) return;
        
        // Determine the active item ID - handle note pages by checking parent thread
        let activeItemId = currentItemId;
        if (currentItemId.startsWith('note_')) {
          // Try to get parent thread from note element (most reliable)
          const noteElement = document.querySelector('[data-note-id]');
          if (noteElement && noteElement.getAttribute('data-parent-thread-id')) {
            activeItemId = noteElement.getAttribute('data-parent-thread-id');
          } else {
            // Fallback: try to get from navigation element
            const navElement = document.querySelector('[slot="navigation"]');
            if (navElement && navElement.getAttribute('data-parent-thread-id')) {
              activeItemId = navElement.getAttribute('data-parent-thread-id');
            } else {
              // Final fallback: assume unorganized thread
              activeItemId = 'thread_unorganized';
            }
          }
        }
        
        // Check if this is the current page (active item)
        const isCurrentPage = itemId === activeItemId;
        
        // If active, find next item BEFORE removing (need persistentItems array which has original order)
        let nextItem = null;
        if (isCurrentPage) {
          const currentIndex = persistentItems.findIndex((item) => item.id === activeItemId);
          nextItem = currentIndex !== -1
            ? (persistentItems[currentIndex + 1] || persistentItems[currentIndex - 1] || null)
            : null;
        }
        
        // ALWAYS remove from localStorage to ensure removal happens
        try {
          const navHistory = localStorage.getItem('harvous-navigation-history-v2');
          if (navHistory) {
            const history = JSON.parse(navHistory);
            const filteredHistory = history.filter((item) => item.id !== itemId);
            localStorage.setItem('harvous-navigation-history-v2', JSON.stringify(filteredHistory));
          }
        } catch (error) {
          console.error('Error removing item from navigation history:', error);
        }
        
        // Remove from DOM immediately for instant visual feedback
        const itemElement = document.querySelector(`[data-navigation-item="${itemId}"]`);
        if (itemElement && itemElement.parentNode) {
          itemElement.parentNode.removeChild(itemElement);
        }
        
        // If this is the active item, navigate to next available item
        if (isCurrentPage) {
          const targetUrl = nextItem ? `/${nextItem.id}` : '/';
          window.location.replace(targetUrl);
          return;
        }
        
        // Also reload persistent navigation to ensure consistency (for non-active items)
        if (!isCurrentPage) {
          loadPersistentNavigation();
        }
        
        // Return false to prevent any further event handling
        return false;
      });
      
      
      badgeContainer.appendChild(badgeCount);
      titleWrapper.appendChild(title);
      innerDiv.appendChild(titleWrapper);
      innerDiv.appendChild(badgeContainer);
      button.appendChild(innerDiv);
      
      // Wrap in nav-item-container div
      const navItemContainer = document.createElement('div');
      navItemContainer.className = 'relative nav-item-container';
      navItemContainer.appendChild(button);
      
      link.appendChild(navItemContainer);
      
      // Add link to outer container
      outerContainer.appendChild(link);
      
      // Add hover event listeners to badge count AFTER DOM is built
      badgeCount.addEventListener('mouseenter', () => {
        // Hide count, show close icon
        countSpan.style.display = 'none';
        closeIcon.style.display = 'block';
        // Disable link when hovering over close area
        link.style.pointerEvents = 'none';
        link.style.cursor = 'default';
        link.style.opacity = '0.7'; // Visual feedback that link is disabled
      });
      
      // Add hover listeners to close icon to keep it visible
      closeIcon.addEventListener('mouseenter', () => {
        // Keep close icon visible when hovering over it
        countSpan.style.display = 'none';
        closeIcon.style.display = 'block';
        link.style.pointerEvents = 'none';
        link.style.cursor = 'default';
        link.style.opacity = '0.7';
      });
      
      badgeCount.addEventListener('mouseleave', (e) => {
        // Only hide close icon if we're not moving to the close icon itself
        const relatedTarget = e.relatedTarget;
        if (relatedTarget !== closeIcon) {
          // Show count, hide close icon
          countSpan.style.display = 'block';
          closeIcon.style.display = 'none';
          // Re-enable link when not hovering over close area
          link.style.pointerEvents = 'auto';
          link.style.cursor = 'pointer';
          link.style.opacity = '1'; // Restore full opacity
        }
      });
      
      closeIcon.addEventListener('mouseleave', (e) => {
        // Hide close icon when leaving the close icon area
        const relatedTarget = e.relatedTarget;
        if (relatedTarget !== badgeCount) {
          countSpan.style.display = 'block';
          closeIcon.style.display = 'none';
          link.style.pointerEvents = 'auto';
          link.style.cursor = 'pointer';
          link.style.opacity = '1';
        }
      });
      
      // Force initial state to be correct (show count, hide close icon)
      countSpan.style.display = 'block';
      closeIcon.style.display = 'none';
      link.style.pointerEvents = 'auto';
      link.style.cursor = 'pointer';
      link.style.opacity = '1';
      
      itemDiv.appendChild(outerContainer);
      persistentNav.appendChild(itemDiv);
    });
    
    // Insert persistent navigation after the "For You" button but before the bottom section
    // Find the navigation buttons container (the div that contains all navigation items)
    const navigationButtonsContainer = forYouButton.closest('.flex.flex-col.items-start.justify-start.w-full');
    if (navigationButtonsContainer) {
      // Insert after the "For You" button but within the navigation buttons container
      navigationButtonsContainer.insertBefore(persistentNav, forYouButton.nextSibling);
    } else {
      // Fallback to original behavior
      parentContainer.insertBefore(persistentNav, forYouButton.nextSibling);
    }
  } catch (error) {
    console.error('Error loading persistent navigation:', error);
  }
}

// Make loadPersistentNavigation globally available
window.loadPersistentNavigation = loadPersistentNavigation;

// Add CSS for hover behavior and close functionality
function addPersistentNavigationStyles() {
  const style = document.createElement('style');
  style.textContent = `
    /* Badge count hover effect - remove background when close icon is visible (only for badges with close icons) */
    .badge-count:has(.close-icon):hover {
      background-color: transparent !important;
    }
    
    /* Hide badge number on hover when close icon is present */
    .badge-count:has(.close-icon):hover .badge-number {
      display: none !important;
    }
    
    /* Show close icon on hover when present */
    .badge-count:has(.close-icon):hover .close-icon {
      display: flex !important;
    }
    
    /* Ensure badge background is transparent when close icon is visible */
    .badge-count .close-icon {
      background-color: transparent;
    }
    
    /* Close icon styling - no opacity effects */
    .close-icon {
      transition: none;
      display: none;
    }
    
    .close-icon:hover {
      opacity: 1 !important;
    }
    
    .close-icon svg {
      display: block;
      width: 16px;
      height: 16px;
    }
  `;
  document.head.appendChild(style);
}

// Add close functionality
function addCloseFunctionality() {
  document.addEventListener('click', (event) => {
    // Check if clicked on close icon or any element inside it
    const closeIcon = event.target ? event.target.closest('.close-icon') : null;
    
    if (!closeIcon) return;
    
    // Prevent all default behavior and event propagation
    event.stopImmediatePropagation();
    event.stopPropagation();
    event.preventDefault();
    
    const itemId = closeIcon.getAttribute('data-close-item');
    if (!itemId) return;
    
    // Get current path to determine if we're on a note page
    const currentPath = window.location.pathname;
    const currentItemId = currentPath.startsWith('/') ? currentPath.substring(1) : currentPath;
    
    // Determine the active item ID - handle note pages by checking parent thread
    let activeItemId = currentItemId;
    if (currentItemId.startsWith('note_')) {
      // Try to get parent thread from note element (most reliable)
      const noteElement = document.querySelector('[data-note-id]');
      if (noteElement && noteElement.getAttribute('data-parent-thread-id')) {
        activeItemId = noteElement.getAttribute('data-parent-thread-id');
      } else {
        // Fallback: try to get from navigation element
        const navElement = document.querySelector('[slot="navigation"]');
        if (navElement && navElement.getAttribute('data-parent-thread-id')) {
          activeItemId = navElement.getAttribute('data-parent-thread-id');
        } else {
          // Final fallback: assume unorganized thread
          activeItemId = 'thread_unorganized';
        }
      }
    }
    
    // Check if this is the active item
    const isActive = itemId === activeItemId;
    
    // If active, find next item BEFORE removing (need to read history first)
    let nextItem = null;
    if (isActive) {
      try {
        const navHistory = localStorage.getItem('harvous-navigation-history-v2');
        if (navHistory) {
          const history = JSON.parse(navHistory).sort((a, b) => a.firstAccessed - b.firstAccessed);
          const currentIndex = history.findIndex((item) => item.id === itemId);
          nextItem = currentIndex !== -1
            ? (history[currentIndex + 1] || history[currentIndex - 1] || null)
            : null;
        }
      } catch (error) {
        console.error('Error finding next item:', error);
      }
    }
    
    // ALWAYS remove from localStorage to ensure removal happens
    try {
      const navHistory = localStorage.getItem('harvous-navigation-history-v2');
      if (navHistory) {
        const history = JSON.parse(navHistory);
        const filteredHistory = history.filter((item) => item.id !== itemId);
        localStorage.setItem('harvous-navigation-history-v2', JSON.stringify(filteredHistory));
      }
    } catch (error) {
      console.error('Error removing item from navigation history:', error);
    }
    
    // Remove from DOM
    const itemElement = document.querySelector(`[data-navigation-item="${itemId}"]`);
    if (itemElement && itemElement.parentNode) {
      itemElement.parentNode.removeChild(itemElement);
    }
    
    // If this is the active item, navigate to next available item
    if (isActive) {
      const targetUrl = nextItem ? `/${nextItem.id}` : '/';
      window.location.replace(targetUrl);
      return;
    }
    
    // For non-active items, sync with context if available
    if (!isActive && window.removeFromNavigationHistory) {
      window.removeFromNavigationHistory(itemId);
    }
    
    // Reload persistent navigation (for non-active items)
    if (!isActive) {
      loadPersistentNavigation();
    }
    
    return false;
  }, true); // Use capture phase to catch the event before it bubbles
}

// Load persistent navigation on page load
document.addEventListener('DOMContentLoaded', () => {
  addPersistentNavigationStyles();
  addCloseFunctionality();
  loadPersistentNavigation();
});

// On astro:page-load, wait a brief moment to ensure React components have hydrated
// This is especially important in production where hydration might take longer
document.addEventListener('astro:page-load', () => {
  // Small delay to ensure React hydration and DOM are ready
  // The retry logic in loadPersistentNavigation will handle cases where DOM isn't ready yet
  setTimeout(() => {
    loadPersistentNavigation();
  }, 50);
});
window.addEventListener('popstate', loadPersistentNavigation);

// Listen for thread and space creation events to refresh navigation display
// Note: The React NavigationContext handles adding items to history
// localStorage is updated synchronously before the event is dispatched, so we can call immediately
// but we still need to wait for DOM readiness (handled by retry logic in loadPersistentNavigation)
document.addEventListener('threadCreated', (event) => {
  // Call immediately - localStorage is already updated synchronously in NewThreadPanel
  // Retry logic in loadPersistentNavigation will handle DOM readiness
  loadPersistentNavigation();
});

document.addEventListener('spaceCreated', (event) => {
  // Call immediately - localStorage is already updated synchronously
  // Retry logic in loadPersistentNavigation will handle DOM readiness
  loadPersistentNavigation();
});

// Listen for deletion events to refresh navigation display
document.addEventListener('threadDeleted', (event) => {
  // Small delay to ensure React system has updated localStorage
  setTimeout(() => {
    loadPersistentNavigation();
  }, 100);
});

document.addEventListener('spaceDeleted', (event) => {
  // Small delay to ensure React system has updated localStorage
  setTimeout(() => {
    loadPersistentNavigation();
  }, 100);
});

// Listen for note events to refresh navigation display (for count updates)
document.addEventListener('noteCreated', (event) => {
  // Small delay to ensure React system has updated localStorage
  setTimeout(() => {
    loadPersistentNavigation();
  }, 100);
});

document.addEventListener('noteDeleted', (event) => {
  // Small delay to ensure React system has updated localStorage
  setTimeout(() => {
    loadPersistentNavigation();
  }, 100);
});

document.addEventListener('noteRemovedFromThread', (event) => {
  // Small delay to ensure React system has updated localStorage
  setTimeout(() => {
    loadPersistentNavigation();
  }, 100);
});

document.addEventListener('noteAddedToThread', (event) => {
  // Small delay to ensure React system has updated localStorage
  setTimeout(() => {
    loadPersistentNavigation();
  }, 100);
});


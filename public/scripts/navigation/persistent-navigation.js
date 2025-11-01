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
    const sortedHistory = history.sort((a, b) => a.firstAccessed - b.firstAccessed);
    
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
    const forYouButton = document.querySelector('a[href="/dashboard"]');
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
      
      // Create SpaceButton element using Tailwind classes like the actual component
      const button = document.createElement('button');
      button.className = 'space-button relative rounded-xl h-[64px] cursor-pointer transition-[scale,shadow] duration-300 pl-4 pr-0 group w-full';
      button.style.color = 'var(--color-deep-grey)';
      
      // Apply active styling if this is the current page
      if (isCurrentPage) {
        // Use thread's background color or paper color for spaces
        if (item.id.startsWith('space_')) {
          button.style.background = 'var(--color-paper)';
        } else {
          // Apply thread's background gradient
          button.style.background = item.backgroundGradient;
          button.style.backgroundImage = item.backgroundGradient;
        }
        button.style.color = 'var(--color-deep-grey)';
        button.style.boxShadow = '0px -3px 0px 0px rgba(120, 118, 111, 0.2) inset';
        button.classList.add('active-state');
      }
      
      // Inner structure matching SpaceButton "WithCount" state exactly
      const innerDiv = document.createElement('div');
      innerDiv.className = 'flex items-center relative w-full h-full pl-2 pr-0 transition-transform duration-125 min-w-0';
      
      // Title wrapper
      const titleWrapper = document.createElement('div');
      titleWrapper.className = 'flex-1 min-w-0 overflow-hidden text-left';
      
      const title = document.createElement('span');
      title.textContent = item.title;
      title.className = 'text-[var(--color-deep-grey)] font-sans text-[18px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis block text-left';
      
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
      countSpan.className = 'text-[14px] font-sans font-semibold text-[var(--color-deep-grey)] leading-[0] badge-number';
      countSpan.style.display = 'block'; // Ensure it's visible initially
      
      // Close icon (×) - hidden by default, shown on hover
      const closeIcon = document.createElement('i');
      closeIcon.className = 'fa-solid fa-xmark close-icon';
      closeIcon.style.display = 'none';
      closeIcon.style.cursor = 'pointer';
      closeIcon.style.pointerEvents = 'auto';
      closeIcon.style.fontSize = '16px';
      closeIcon.style.color = 'var(--color-deep-grey)';
      closeIcon.style.position = 'absolute';
      closeIcon.style.top = '50%';
      closeIcon.style.left = '50%';
      closeIcon.style.transform = 'translate(-50%, -50%)';
      
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
        
        // Check if this is the current page (active item)
        const isCurrentPage = itemId === currentItemId;
        
        if (isCurrentPage) {
          // Find next item to navigate to (bottom to top)
          const currentIndex = persistentItems.findIndex((item) => item.id === currentItemId);
          const nextItem = persistentItems[currentIndex + 1] || persistentItems[currentIndex - 1] || null;
          
          // Navigate to next item or dashboard
          if (nextItem) {
            window.location.href = `/${nextItem.id}`;
          } else {
            window.location.href = '/dashboard';
          }
        }
        
        // Use the global function from NavigationContext if available
        if (window.removeFromNavigationHistory) {
          window.removeFromNavigationHistory(itemId);
        } else {
          // Fallback to direct localStorage manipulation
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
        }
        
        // Remove the item from DOM immediately for instant visual feedback
        const itemElement = document.querySelector(`[data-navigation-item="${itemId}"]`);
        if (itemElement && itemElement.parentNode) {
          itemElement.parentNode.removeChild(itemElement);
        }
        
        // Also reload persistent navigation to ensure consistency
        loadPersistentNavigation();
        
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
    /* Badge count hover effect - remove background when close icon is visible */
    .badge-count:hover {
      background-color: transparent !important;
    }
    
    /* Close icon styling - no opacity effects */
    .close-icon {
      transition: none;
    }
    
    .close-icon:hover {
      opacity: 1 !important;
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
    
    // Use the global function from NavigationContext if available
    if (window.removeFromNavigationHistory) {
      window.removeFromNavigationHistory(itemId);
    } else {
      // Fallback to direct localStorage manipulation
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
    }
    
    // Reload persistent navigation
    loadPersistentNavigation();
    
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


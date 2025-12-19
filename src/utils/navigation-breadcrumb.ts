/**
 * Navigation breadcrumb utilities
 * Helper functions for breadcrumb-style navigation behavior
 */

/**
 * Check if the current page is in a specific thread/space context
 * @param targetItemId - The thread or space ID to check against
 * @returns true if current page is in the context of the target item
 */
export function isInThreadOrSpaceContext(targetItemId: string): boolean {
  if (typeof window === 'undefined') return false;
  
  const currentPath = window.location.pathname;
  const currentItemId = currentPath.startsWith('/') ? currentPath.substring(1) : currentPath;
  
  // If we're already on the thread/space page, we're in context
  if (currentItemId === targetItemId) {
    return true;
  }
  
  // If we're on a note page, check if it belongs to this thread/space
  if (currentItemId.startsWith('note_')) {
    // Check note element for data-parent-thread-id or data-parent-space-id
    const noteElement = document.querySelector('[data-note-id]') as HTMLElement;
    if (noteElement) {
      const parentThreadId = noteElement.dataset.parentThreadId;
      const parentSpaceId = noteElement.dataset.parentSpaceId;
      
      if (parentThreadId === targetItemId || parentSpaceId === targetItemId) {
        return true;
      }
    }
    
    // Check navigation element for data-parent-thread-id or data-thread-id
    const navigationElement = document.querySelector('[slot="navigation"]') as HTMLElement;
    if (navigationElement) {
      const navThreadId = navigationElement.getAttribute('data-parent-thread-id') || 
                         navigationElement.getAttribute('data-thread-id');
      const navSpaceId = navigationElement.getAttribute('data-parent-space-id') || 
                        navigationElement.getAttribute('data-space-id');
      
      if (navThreadId === targetItemId || navSpaceId === targetItemId) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Handle breadcrumb-style navigation for thread/space buttons
 * If in context, goes back one step in history; otherwise navigates directly
 * @param targetItemId - The thread or space ID to navigate to
 */
export function handleBreadcrumbNavigation(targetItemId: string): void {
  if (typeof window === 'undefined') return;
  
  const currentPath = window.location.pathname;
  const currentItemId = currentPath.startsWith('/') ? currentPath.substring(1) : currentPath;
  
  // If we're already on the thread/space page, do nothing
  if (currentItemId === targetItemId) {
    return;
  }
  
  // Check if we're in the context of this thread/space
  if (isInThreadOrSpaceContext(targetItemId)) {
    // We're in context - go back one step in history
    if (window.history.length > 1) {
      window.history.back();
    } else {
      // Fallback: navigate directly if no history
      if ((window as any).astroNavigate) {
        (window as any).astroNavigate(`/${targetItemId}`);
      } else {
        window.location.href = `/${targetItemId}`;
      }
    }
  } else {
    // Not in context - navigate directly
    if ((window as any).astroNavigate) {
      (window as any).astroNavigate(`/${targetItemId}`);
    } else {
      window.location.href = `/${targetItemId}`;
    }
  }
}


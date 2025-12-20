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
  
  // Enhanced logging at entry point
  console.log('[handleBreadcrumbNavigation] Called with targetItemId:', {
    targetItemId: targetItemId,
    type: typeof targetItemId,
    isString: typeof targetItemId === 'string',
    isEmpty: targetItemId?.trim() === '',
    startsWithThread: targetItemId?.startsWith('thread_'),
    startsWithSpace: targetItemId?.startsWith('space_'),
    startsWithNote: targetItemId?.startsWith('note_')
  });
  
  // Validate targetItemId first
  if (!targetItemId || typeof targetItemId !== 'string' || targetItemId.trim() === '') {
    console.error('[handleBreadcrumbNavigation] Invalid targetItemId - aborting navigation:', {
      targetItemId: targetItemId,
      type: typeof targetItemId,
      isNull: targetItemId === null,
      isUndefined: targetItemId === undefined,
      isEmpty: targetItemId?.trim() === ''
    });
    return;
  }
  
  const currentPath = window.location.pathname;
  const currentItemId = currentPath.startsWith('/') ? currentPath.substring(1) : currentPath;
  
  console.log('[handleBreadcrumbNavigation] Current page context:', {
    currentPath: currentPath,
    currentItemId: currentItemId
  });
  
  // If we're already on the thread/space page, do nothing
  if (currentItemId === targetItemId) {
    console.log('[handleBreadcrumbNavigation] Already on target page, skipping navigation');
    return;
  }
  
  // Check if we're currently on a note page
  const isOnNotePage = currentItemId.startsWith('note_');
  
  // Check if we're navigating to a thread or space
  const isNavigatingToThreadOrSpace = targetItemId.startsWith('thread_') || targetItemId.startsWith('space_');
  
  // If we're on a note page and navigating to a thread/space, always navigate directly
  // This ensures fresh data is loaded and prevents "Content not found" errors from stale cached pages
  // Use window.location.href to force a full page reload, ensuring the database query runs fresh
  // This is especially important for newly created threads that might not be in cache yet
  if (isOnNotePage && isNavigatingToThreadOrSpace) {
    const targetUrl = `/${targetItemId}`;
    console.log('[handleBreadcrumbNavigation] Navigating from note to thread/space:', {
      currentPath: currentPath,
      currentItemId: currentItemId,
      targetItemId: targetItemId,
      targetUrl: targetUrl,
      isValid: targetItemId.startsWith('thread_') || targetItemId.startsWith('space_')
    });
    
    // Double-check the URL is valid before navigating
    if (!targetItemId.startsWith('thread_') && !targetItemId.startsWith('space_')) {
      console.error('[handleBreadcrumbNavigation] Invalid thread/space ID format - aborting navigation:', {
        targetItemId: targetItemId,
        startsWithThread: targetItemId.startsWith('thread_'),
        startsWithSpace: targetItemId.startsWith('space_')
      });
      return;
    }
    
    // Always use window.location.href (not astroNavigate) to force full page reload
    // This ensures the database query runs fresh and finds the thread, even if it was just created
    console.log('[handleBreadcrumbNavigation] Executing navigation to:', targetUrl);
    window.location.href = targetUrl;
    return;
  }
  
  // Check if we're in the context of this thread/space
  const isInContext = isInThreadOrSpaceContext(targetItemId);
  console.log('[handleBreadcrumbNavigation] Context check:', {
    targetItemId: targetItemId,
    isInContext: isInContext,
    historyLength: window.history.length
  });
  
  if (isInContext) {
    // We're in context - go back one step in history
    // (This is used for navigating between notes within the same thread)
    if (window.history.length > 1) {
      console.log('[handleBreadcrumbNavigation] In context - going back in history');
      window.history.back();
    } else {
      // Fallback: navigate directly if no history
      const fallbackUrl = `/${targetItemId}`;
      console.log('[handleBreadcrumbNavigation] In context but no history - navigating directly to:', fallbackUrl);
      if ((window as any).astroNavigate) {
        (window as any).astroNavigate(fallbackUrl);
      } else {
        window.location.href = fallbackUrl;
      }
    }
  } else {
    // Not in context - navigate directly
    const directUrl = `/${targetItemId}`;
    console.log('[handleBreadcrumbNavigation] Not in context - navigating directly to:', directUrl);
    if ((window as any).astroNavigate) {
      (window as any).astroNavigate(directUrl);
    } else {
      window.location.href = directUrl;
    }
  }
}


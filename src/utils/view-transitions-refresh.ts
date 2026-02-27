/**
 * Utilities for handling data refresh after Astro View Transitions navigation
 * 
 * When using View Transitions, the DOM is swapped without a full page reload,
 * so server-side data fetching doesn't re-run. These utilities help components
 * detect navigation and refresh their data client-side.
 */

/**
 * Page type detection
 */
export type PageType = 'dashboard' | 'thread' | 'space' | 'note' | 'unknown';

/**
 * Detect the current page type from the pathname
 */
export function detectPageType(pathname: string = typeof window !== 'undefined' ? window.location.pathname : ''): PageType {
  if (!pathname || pathname === '/') {
    return 'dashboard';
  }

  if (pathname.startsWith('/thread/')) {
    return 'thread';
  }

  if (pathname.startsWith('/space/')) {
    return 'space';
  }

  if (pathname.startsWith('/note/')) {
    return 'note';
  }

  return 'unknown';
}

/**
 * Extract the database ID from a pathname.
 * Handles new format: /thread/abc123 → thread_abc123
 */
export function extractIdFromPathname(pathname: string = typeof window !== 'undefined' ? window.location.pathname : ''): string | null {
  if (!pathname || pathname === '/') {
    return null;
  }

  // New URL format: /thread/abc123 → thread_abc123
  const match = pathname.match(/^\/(thread|note|space|local)\/(.+)$/);
  if (match) {
    return match[1] + '_' + match[2];
  }

  return null;
}

/**
 * Check if we're on a specific page type
 */
export function isPageType(type: PageType, pathname?: string): boolean {
  return detectPageType(pathname) === type;
}

/**
 * Check if we're on a specific page (by ID)
 */
export function isPage(id: string, pathname?: string): boolean {
  const currentId = extractIdFromPathname(pathname);
  return currentId === id;
}

/**
 * Create a debounced function that prevents multiple rapid calls
 */
export function createDebouncedRefresh<T extends (...args: any[]) => any>(
  fn: T,
  delayMs: number = 300
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let isRefreshing = false;
  
  return (...args: Parameters<T>) => {
    // Clear any pending timeout
    if (timeout) {
      clearTimeout(timeout);
    }
    
    // Debounce the refresh
    timeout = setTimeout(() => {
      timeout = null;
      if (!isRefreshing) {
        isRefreshing = true;
        try {
          fn(...args);
        } finally {
          // Reset flag after a short delay to allow the refresh to complete
          setTimeout(() => {
            isRefreshing = false;
          }, 100);
        }
      }
    }, delayMs);
  };
}

/**
 * Create a refresh handler that only runs on specific page types
 */
export function createPageTypeRefreshHandler(
  pageTypes: PageType[],
  refreshFn: () => void | Promise<void>,
  options: {
    debounceMs?: number;
    checkPathname?: () => string;
  } = {}
): () => void {
  const { debounceMs = 300, checkPathname } = options;
  const debouncedRefresh = createDebouncedRefresh(refreshFn, debounceMs);
  
  return () => {
    const pathname = checkPathname ? checkPathname() : (typeof window !== 'undefined' ? window.location.pathname : '');
    const pageType = detectPageType(pathname);
    
    if (pageTypes.includes(pageType)) {
      debouncedRefresh();
    }
  };
}

/**
 * Setup a View Transitions refresh listener
 * 
 * @param refreshHandler - Function to call when page loads
 * @param cleanup - Optional cleanup function
 * @returns Cleanup function to remove the listener
 */
export function setupViewTransitionsRefresh(
  refreshHandler: () => void,
  cleanup?: () => void
): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {}; // No-op cleanup for SSR
  }
  
  const handlePageLoad = () => {
    refreshHandler();
  };
  
  document.addEventListener('app:route-change', handlePageLoad);
  
  return () => {
    document.removeEventListener('app:route-change', handlePageLoad);
    if (cleanup) {
      cleanup();
    }
  };
}

/**
 * Setup a View Transitions refresh listener that tracks navigation
 * Prevents refresh during navigation and only refreshes after navigation completes
 */
export function setupNavigationAwareRefresh(
  refreshHandler: () => void,
  options: {
    debounceMs?: number;
    skipDuringNavigation?: boolean;
  } = {}
): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {}; // No-op cleanup for SSR
  }
  
  const { debounceMs = 300, skipDuringNavigation = true } = options;
  let isNavigating = false;
  let refreshTimeout: ReturnType<typeof setTimeout> | null = null;
  
  const debouncedRefresh = createDebouncedRefresh(refreshHandler, debounceMs);
  
  const handlePageLoad = () => {
    if (skipDuringNavigation && isNavigating) {
      return;
    }
    isNavigating = false;
    debouncedRefresh();
  };
  
  document.addEventListener('app:route-change', handlePageLoad);
  
  return () => {
    document.removeEventListener('app:route-change', handlePageLoad);
    if (refreshTimeout) {
      clearTimeout(refreshTimeout);
    }
  };
}


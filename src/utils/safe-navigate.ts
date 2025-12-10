/**
 * Safe navigation utility for astro:transitions/client
 * Handles errors when the module fails to load or network issues occur
 */

interface NavigateOptions {
  history?: 'replace' | 'push';
}

let navigateFunction: ((path: string, options?: NavigateOptions) => void) | null = null;
let navigatePromise: Promise<typeof import('astro:transitions/client')> | null = null;

// Preload View Transitions module when browser is idle to avoid blocking initial load
if (typeof window !== 'undefined') {
  const preloadViewTransitions = () => {
    navigatePromise = import('astro:transitions/client').catch(() => {
      // Silently fail - will fall back to window.location
      return null;
    });
    
    navigatePromise.then((module) => {
      if (module) {
        navigateFunction = module.navigate;
      }
    }).catch(() => {
      // Silently fail - will fall back to window.location
    });
  };
  
  // Preload when browser is idle to avoid blocking initial page load
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(preloadViewTransitions, { timeout: 2000 });
  } else {
    // Fallback for browsers without requestIdleCallback
    setTimeout(preloadViewTransitions, 1000);
  }
}

/**
 * Safely navigate using Astro's View Transitions
 * Falls back to window.location if astro:transitions/client fails
 */
export async function safeNavigate(path: string, options?: { history?: 'replace' | 'push' }): Promise<void> {
  try {
    // Try to get navigate function if we haven't loaded it yet
    if (!navigateFunction) {
      if (!navigatePromise) {
        navigatePromise = import('astro:transitions/client');
      }
      
      try {
        const module = await navigatePromise;
        navigateFunction = module.navigate;
      } catch (error) {
        // Module failed to load - fall back to window.location
        console.warn('[Safe Navigate] Failed to load astro:transitions/client, using window.location:', error);
        navigateFunction = null;
      }
    }
    
    // Use navigate if available, otherwise fall back to window.location
    if (navigateFunction) {
      navigateFunction(path, options);
    } else {
      // Fallback to window.location
      if (options?.history === 'replace') {
        window.location.replace(path);
      } else {
        window.location.href = path;
      }
    }
  } catch (error) {
    // If navigate fails, fall back to window.location
    console.warn('[Safe Navigate] Navigation failed, using window.location fallback:', error);
    if (options?.history === 'replace') {
      window.location.replace(path);
    } else {
      window.location.href = path;
    }
  }
}

/**
 * Synchronous version that uses navigate if already loaded, otherwise falls back
 * Use this when you need immediate navigation without async/await
 */
export function safeNavigateSync(path: string, options?: { history?: 'replace' | 'push' }): void {
  if (navigateFunction) {
    try {
      navigateFunction(path, options);
      return;
    } catch (error) {
      console.warn('[Safe Navigate] Navigate function failed, using window.location:', error);
    }
  }
  
  // Fallback to window.location
  if (options?.history === 'replace') {
    window.location.replace(path);
  } else {
    window.location.href = path;
  }
}


/**
 * Safe navigation utility for the SPA (app-navigate module).
 * Handles errors when the module fails to load or network issues occur.
 */

// Import PostHog for error tracking (lazy import to avoid circular dependencies)
let captureException: ((error: Error, properties?: Record<string, any>) => void) | null = null;

if (typeof window !== 'undefined') {
  import('@/utils/posthog').then((module) => {
    captureException = module.captureException;
  }).catch((error) => {
    if (import.meta.env.DEV) {
      console.warn('[safe-navigate] PostHog not available:', error);
    }
  });
}

interface NavigateOptions {
  history?: 'replace' | 'push';
}

let navigateFunction: ((path: string, options?: NavigateOptions) => void) | null = null;
let navigatePromise: Promise<{ navigate: (path: string, options?: NavigateOptions) => Promise<void> }> | null = null;

if (typeof window !== 'undefined') {
  const preloadNavigate = () => {
    navigatePromise = import('app-navigate').catch((error) => {
      if (import.meta.env.DEV) {
        console.warn('[safe-navigate] Failed to preload app-navigate:', error);
      }
      if (captureException) {
        try {
          captureException(error instanceof Error ? error : new Error(String(error)), {
            context: 'safe-navigate',
            action: 'preload-module'
          });
        } catch {
          // ignore
        }
      }
      return null;
    });
    navigatePromise.then((module) => {
      if (module) navigateFunction = module.navigate;
    }).catch((error) => {
      if (import.meta.env.DEV) {
        console.warn('[safe-navigate] Failed to initialize navigate function:', error);
      }
    });
  };
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(preloadNavigate, { timeout: 2000 });
  } else {
    setTimeout(preloadNavigate, 1000);
  }
}

/**
 * Preload the navigate module when the user is likely to navigate soon
 * (e.g. when opening the nav sheet) to reduce delay on first tap.
 */
export function preloadSafeNavigate(): void {
  if (navigateFunction) return;
  if (!navigatePromise) {
    navigatePromise = import('app-navigate').catch((err) => {
      if (import.meta.env.DEV) console.warn('[safe-navigate] preload failed:', err);
      return null;
    });
    navigatePromise.then((m) => { if (m) navigateFunction = m.navigate; }).catch(() => {});
  }
}

/**
 * Navigate within the SPA. Falls back to window.location if the navigate module fails.
 */
export async function safeNavigate(path: string, options?: NavigateOptions): Promise<void> {
  try {
    if (!navigateFunction) {
      if (!navigatePromise) {
        navigatePromise = import('app-navigate');
      }
      
      try {
        const module = await navigatePromise;
        if (module) navigateFunction = module.navigate;
      } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        console.warn('[Safe Navigate] Failed to load app-navigate, using window.location:', errorObj);
        
        // Track error in PostHog if available
        if (captureException) {
          try {
            captureException(errorObj, {
              context: 'safe-navigate',
              action: 'load-module',
              path: path
            });
          } catch {
            // Ignore PostHog errors
          }
        }
        
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
    const errorObj = error instanceof Error ? error : new Error(String(error));
    console.warn('[Safe Navigate] Navigation failed, using window.location fallback:', errorObj);
    
    // Track error in PostHog if available
    if (captureException) {
      try {
        captureException(errorObj, {
          context: 'safe-navigate',
          action: 'navigate',
          path: path,
          history: options?.history
        });
      } catch {
        // Ignore PostHog errors
      }
    }
    
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
export function safeNavigateSync(path: string, options?: NavigateOptions): void {
  if (navigateFunction) {
    try {
      navigateFunction(path, options);
      return;
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      console.warn('[Safe Navigate] Navigate function failed, using window.location:', errorObj);
      
      // Track error in PostHog if available
      if (captureException) {
        try {
          captureException(errorObj, {
            context: 'safe-navigate',
            action: 'navigate-sync',
            path: path
          });
        } catch {
          // Ignore PostHog errors
        }
      }
    }
  }
  
  // Fallback to window.location
  if (options?.history === 'replace') {
    window.location.replace(path);
  } else {
    window.location.href = path;
  }
}


/**
 * Utility functions for checking Clerk initialization status
 * Helps ensure Clerk is fully loaded before rendering billing components
 */

/**
 * Check if Clerk is fully initialized and available
 * @returns true if Clerk is loaded, false otherwise
 */
export function isClerkLoaded(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  // Check if Clerk frontend API is available
  const hasClerkAPI = !!(window as any).__clerk_frontend_api;
  
  // Check if Clerk component props map exists (from @clerk/astro)
  const hasAstroClerk = !!(window as any)._astro_clerk_component_props;
  
  return hasClerkAPI || hasAstroClerk;
}

/**
 * Wait for Clerk to be loaded with a timeout
 * @param timeoutMs Maximum time to wait in milliseconds (default: 15000)
 * @returns Promise that resolves when Clerk is loaded or rejects on timeout
 */
export function waitForClerk(timeoutMs: number = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Window is not available'));
      return;
    }

    // If already loaded, resolve immediately
    if (isClerkLoaded()) {
      resolve();
      return;
    }

    // Set up timeout
    const timeoutId = setTimeout(() => {
      reject(new Error(`Clerk did not load within ${timeoutMs}ms`));
    }, timeoutMs);

    // Check periodically
    const checkInterval = setInterval(() => {
      if (isClerkLoaded()) {
        clearInterval(checkInterval);
        clearTimeout(timeoutId);
        resolve();
      }
    }, 100);

    // Also listen for Clerk's load event if available
    const handleClerkLoaded = () => {
      clearInterval(checkInterval);
      clearTimeout(timeoutId);
      window.removeEventListener('clerk:loaded', handleClerkLoaded);
      resolve();
    };

    window.addEventListener('clerk:loaded', handleClerkLoaded);
  });
}

/**
 * React hook to check if Clerk is loaded (for use in components)
 * Note: This is a utility function, not an actual React hook
 * Use useAuth() from @clerk/clerk-react for React hooks
 */
export function useClerkInitCheck(): {
  isLoaded: boolean;
  error: Error | null;
} {
  // This is a utility function - actual React hooks should use useAuth()
  // This is kept for consistency with the utility pattern
  return {
    isLoaded: isClerkLoaded(),
    error: null
  };
}


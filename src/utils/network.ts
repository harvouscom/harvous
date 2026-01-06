/**
 * Network utility functions for detecting and handling network errors
 */

/**
 * Check if an error is a network error (e.g., offline, fetch failed)
 */
export function isNetworkError(error: any): boolean {
  if (!error) return false;
  
  // TypeError with "Failed to fetch" is the most common network error
  if (error instanceof TypeError) {
    return (
      error.message === 'Failed to fetch' ||
      error.message.includes('network error') ||
      error.message.includes('NetworkError') ||
      error.message.includes('Network request failed')
    );
  }
  
  // Check error message strings
  if (typeof error === 'string') {
    return (
      error.includes('Failed to fetch') ||
      error.includes('network error') ||
      error.includes('NetworkError') ||
      error.includes('Network request failed')
    );
  }
  
  // Check error object properties
  if (error && typeof error === 'object') {
    // Check for service worker's offline response pattern
    if (error.error === 'Network error') return true;
    
    const message = error.message || error.toString();
    return (
      message.includes('Failed to fetch') ||
      message.includes('network error') ||
      message.includes('NetworkError') ||
      message.includes('Network request failed')
    );
  }
  
  return false;
}

/**
 * Check if a Response indicates a network error
 */
export function isNetworkErrorResponse(response: Response | null): boolean {
  if (!response) return true;
  
  // Status 0 typically indicates network error (CORS, offline, etc.)
  if (response.status === 0) return true;
  
  // Status codes that might indicate network issues
  if (response.status >= 500 && response.status < 600) {
    // Server errors might be network-related, but not always
    // We'll be conservative and only treat 0 as network error
    return false;
  }
  
  return false;
}

/**
 * Check if the browser is currently offline
 */
export function isOffline(): boolean {
  if (typeof navigator === 'undefined') return false;
  return !navigator.onLine;
}

/**
 * Online recovery coordinator - prevents thundering herd when coming back online
 * Components register callbacks that fire with staggered delays when connection is restored
 */
const onlineRecoveryCallbacks: Map<string, { callback: () => void; priority: number }> = new Map();
let onlineRecoveryTimeout: ReturnType<typeof setTimeout> | null = null;
let isRecoveryInProgress = false;

/**
 * Register a callback to run when coming back online
 * @param id - Unique identifier for this callback (to prevent duplicates)
 * @param callback - Function to call when online
 * @param priority - Lower numbers run first (default: 10)
 */
export function onOnlineRecovery(id: string, callback: () => void, priority: number = 10): void {
  onlineRecoveryCallbacks.set(id, { callback, priority });
}

/**
 * Unregister an online recovery callback
 */
export function offOnlineRecovery(id: string): void {
  onlineRecoveryCallbacks.delete(id);
}

/**
 * Execute online recovery with staggered callbacks
 * Called by a single listener (e.g., in SyncManagerIsland)
 */
export function executeOnlineRecovery(): void {
  if (isRecoveryInProgress) return;
  if (!navigator.onLine) return;
  
  isRecoveryInProgress = true;
  
  // Clear any pending timeout
  if (onlineRecoveryTimeout) {
    clearTimeout(onlineRecoveryTimeout);
  }
  
  // Wait 1 second for connection to stabilize
  onlineRecoveryTimeout = setTimeout(() => {
    if (!navigator.onLine) {
      isRecoveryInProgress = false;
      return;
    }
    
    // Sort callbacks by priority
    const sortedCallbacks = Array.from(onlineRecoveryCallbacks.entries())
      .sort((a, b) => a[1].priority - b[1].priority);
    
    // Execute callbacks with staggered delays (200ms apart)
    sortedCallbacks.forEach(([id, { callback }], index) => {
      setTimeout(() => {
        if (navigator.onLine) {
          try {
            callback();
          } catch (error) {
            console.error(`[OnlineRecovery] Error in callback "${id}":`, error);
          }
        }
      }, index * 200);
    });
    
    // Reset recovery flag after all callbacks have had time to run
    setTimeout(() => {
      isRecoveryInProgress = false;
    }, sortedCallbacks.length * 200 + 1000);
  }, 1000);
}


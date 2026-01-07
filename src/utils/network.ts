/**
 * Check if an error is a network error (connection failure, timeout, etc.)
 */
export function isNetworkError(error: unknown): boolean {
  if (!error) return false;

  // Check if it's a TypeError (common for fetch failures)
  if (error instanceof TypeError) {
    const message = error.message?.toLowerCase() || '';
    return (
      message.includes('failed to fetch') ||
      message.includes('networkerror') ||
      message.includes('network error') ||
      message.includes('load failed')
    );
  }

  // Check if it's an Error with network-related message
  if (error instanceof Error) {
    const message = error.message?.toLowerCase() || '';
    const name = error.name?.toLowerCase() || '';
    
    return (
      name === 'networkerror' ||
      name === 'typeerror' ||
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('connection') ||
      message.includes('timeout') ||
      message.includes('aborted')
    );
  }

  // Check if it's a string
  if (typeof error === 'string') {
    const errorLower = error.toLowerCase();
    return (
      errorLower.includes('network') ||
      errorLower.includes('fetch') ||
      errorLower.includes('connection') ||
      errorLower.includes('timeout')
    );
  }

  return false;
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

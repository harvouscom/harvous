/**
 * Safe Storage Utility
 * Handles localStorage quota exceeded errors and provides cleanup strategies
 */

export type StorageType = typeof localStorage | typeof sessionStorage;

export interface StorageOptions {
  maxSize?: number; // Maximum size in bytes for cleanup
  fallbackToSession?: boolean; // Fallback to sessionStorage on quota error
  cleanupOldest?: boolean; // Clean up oldest data when quota exceeded
}

/**
 * Get storage with fallback handling
 * Returns localStorage if available, otherwise sessionStorage
 */
export function getStorage(): StorageType {
  if (typeof window === 'undefined') {
    // SSR fallback - return a mock storage
    return {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      length: 0,
      key: () => null,
    } as StorageType;
  }

  try {
    // Test localStorage first
    const testKey = 'test-storage-' + Date.now();
    localStorage.setItem(testKey, 'test');
    const retrieved = localStorage.getItem(testKey);
    localStorage.removeItem(testKey);
    
    if (retrieved === 'test') {
      return localStorage;
    } else {
      throw new Error('localStorage test failed');
    }
  } catch (error) {
    // Fallback to sessionStorage
    return sessionStorage;
  }
}

/**
 * Check if error is a quota exceeded error
 */
function isQuotaExceededError(error: unknown): boolean {
  if (!error) return false;
  
  const err = error as Error & { name?: string; code?: number; message?: string };
  return !!(
    err.name === 'QuotaExceededError' ||
    err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    err.code === 22 ||
    err.code === 1014 ||
    (err.message && err.message.toLowerCase().includes('quota'))
  );
}

/**
 * Estimate storage size in bytes
 */
function estimateStorageSize(storage: StorageType): number {
  let total = 0;
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key) {
        const value = storage.getItem(key);
        if (value) {
          total += key.length + value.length;
        }
      }
    }
  } catch (error) {
    console.warn('Error estimating storage size:', error);
  }
  return total;
}

/**
 * Clean up oldest navigation history items
 * Removes oldest items until we have space
 */
function cleanupNavigationHistory(storage: StorageType, targetSize: number): void {
  try {
    const historyKey = 'harvous-navigation-history-v2';
    const stored = storage.getItem(historyKey);
    
    if (!stored) return;
    
    const history = JSON.parse(stored);
    if (!Array.isArray(history) || history.length === 0) return;
    
    // Sort by lastAccessed (oldest first)
    const sorted = [...history].sort((a, b) => {
      const aTime = a.lastAccessed || a.firstAccessed || 0;
      const bTime = b.lastAccessed || b.firstAccessed || 0;
      return aTime - bTime;
    });
    
    // Remove oldest items until we're under target size
    let cleaned = [...sorted];
    while (cleaned.length > 0) {
      const testData = JSON.stringify(cleaned);
      if (testData.length < targetSize) {
        break;
      }
      cleaned.shift(); // Remove oldest
    }
    
    // Save cleaned history
    if (cleaned.length < sorted.length) {
      storage.setItem(historyKey, JSON.stringify(cleaned));
      console.log(`Cleaned up ${sorted.length - cleaned.length} old navigation items`);
    }
  } catch (error) {
    console.error('Error cleaning up navigation history:', error);
  }
}

/**
 * Safe setItem with quota error handling
 */
export function safeSetItem(
  key: string,
  value: string,
  options: StorageOptions = {}
): boolean {
  const maxSize = options.maxSize ?? 4 * 1024 * 1024; // 4MB default
  const fallbackToSession = options.fallbackToSession ?? true;
  const cleanupOldest = options.cleanupOldest ?? true;

  if (typeof window === 'undefined') {
    return false;
  }

  let storage = getStorage();
  const originalStorage = storage;

  try {
    storage.setItem(key, value);
    return true;
  } catch (error) {
    if (isQuotaExceededError(error)) {
      console.warn(`Storage quota exceeded for key: ${key}`);
      
      // Try cleanup if enabled
      if (cleanupOldest && storage === localStorage) {
        const currentSize = estimateStorageSize(storage);
        const targetSize = maxSize * 0.8; // Target 80% of max
        
        if (currentSize > targetSize) {
          cleanupNavigationHistory(storage, targetSize);
          
          // Try again after cleanup
          try {
            storage.setItem(key, value);
            return true;
          } catch (retryError) {
            // Cleanup didn't help, continue to fallback
          }
        }
      }
      
      // Fallback to sessionStorage if enabled
      if (fallbackToSession && storage === localStorage) {
        try {
          sessionStorage.setItem(key, value);
          console.log(`Fell back to sessionStorage for key: ${key}`);
          return true;
        } catch (sessionError) {
          console.error('SessionStorage also failed:', sessionError);
          return false;
        }
      }
      
      return false;
    } else {
      // Other errors (security, etc.)
      console.error('Storage error (not quota):', error);
      return false;
    }
  }
}

/**
 * Safe getItem with fallback
 */
export function safeGetItem(key: string): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const storage = getStorage();
    return storage.getItem(key);
  } catch (error) {
    console.error('Error getting item from storage:', error);
    return null;
  }
}

/**
 * Safe removeItem
 */
export function safeRemoveItem(key: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const storage = getStorage();
    storage.removeItem(key);
    
    // Also try sessionStorage in case it was stored there
    if (storage === localStorage) {
      try {
        sessionStorage.removeItem(key);
      } catch (error) {
        // Ignore sessionStorage errors
      }
    }
  } catch (error) {
    console.error('Error removing item from storage:', error);
  }
}


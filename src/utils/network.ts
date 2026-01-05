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


/**
 * Request Deduplication Utility
 * Prevents multiple simultaneous requests to the same endpoint
 */

interface PendingRequest {
  promise: Promise<any>;
  timestamp: number;
}

// Map of pending requests by URL
const pendingRequests = new Map<string, PendingRequest>();

// Cleanup old pending requests (older than 30 seconds)
const CLEANUP_INTERVAL = 30 * 1000;
const MAX_REQUEST_AGE = 30 * 1000;

function cleanupOldRequests() {
  const now = Date.now();
  for (const [url, request] of pendingRequests.entries()) {
    if (now - request.timestamp > MAX_REQUEST_AGE) {
      pendingRequests.delete(url);
    }
  }
}

// Run cleanup periodically
if (typeof window !== 'undefined') {
  setInterval(cleanupOldRequests, CLEANUP_INTERVAL);
}

/**
 * Deduplicate fetch requests
 * If a request to the same URL is already in progress, return the existing promise
 * Otherwise, create a new request and track it
 */
export async function deduplicatedFetch<T>(
  url: string,
  fetchFn: () => Promise<T>
): Promise<T> {
  // Check if there's already a pending request for this URL
  const existing = pendingRequests.get(url);
  if (existing) {
    // Request already in progress, return existing promise
    return existing.promise;
  }

  // Create new request
  const promise = fetchFn()
    .then((result) => {
      // Remove from pending requests on success
      pendingRequests.delete(url);
      return result;
    })
    .catch((error) => {
      // Remove from pending requests on error
      pendingRequests.delete(url);
      throw error;
    });

  // Track the request
  pendingRequests.set(url, {
    promise,
    timestamp: Date.now()
  });

  return promise;
}

/**
 * Clear all pending requests (useful for testing or cleanup)
 */
export function clearPendingRequests(): void {
  pendingRequests.clear();
}

/**
 * Get count of pending requests (useful for debugging)
 */
export function getPendingRequestCount(): number {
  return pendingRequests.size;
}


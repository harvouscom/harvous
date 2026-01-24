/**
 * Fetch helper utilities with timeout and retry support
 * Used for external API calls that may hang on slow mobile networks
 */

export interface FetchWithTimeoutOptions extends RequestInit {
  timeout?: number; // Timeout in milliseconds (default: 10000)
  retries?: number; // Number of retries (default: 2)
  retryTimeout?: number; // Timeout for retries in milliseconds (default: 5000)
}

/**
 * Fetch with timeout and retry logic
 * Uses AbortController to cancel requests that exceed timeout
 * 
 * @param url - URL to fetch
 * @param options - Fetch options including timeout and retry configuration
 * @returns Promise<Response>
 * @throws Error with descriptive message for timeout vs network failures
 */
export async function fetchWithTimeout(
  url: string,
  options: FetchWithTimeoutOptions = {}
): Promise<Response> {
  const {
    timeout = 10000, // 10 seconds default
    retries = 2,
    retryTimeout = 5000, // 5 seconds for retries
    ...fetchOptions
  } = options;

  let lastError: Error | null = null;

  // Try initial attempt + retries
  for (let attempt = 0; attempt <= retries; attempt++) {
    const currentTimeout = attempt === 0 ? timeout : retryTimeout;
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, currentTimeout);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: abortController.signal,
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error: any) {
      clearTimeout(timeoutId);
      lastError = error;

      // Check if it was aborted (timeout)
      if (error.name === 'AbortError' || abortController.signal.aborted) {
        // If this was the last attempt, throw timeout error
        if (attempt === retries) {
          throw new Error(
            `Request timeout after ${currentTimeout}ms (attempt ${attempt + 1} of ${retries + 1})`
          );
        }
        // Otherwise, continue to retry
        continue;
      }

      // For other errors, if it's the last attempt, throw
      if (attempt === retries) {
        throw new Error(
          `Network error: ${error.message || 'Failed to fetch'}`
        );
      }

      // Otherwise, continue to retry
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError || new Error('Unknown error occurred');
}

/**
 * Get JWT token from Clerk for API authentication
 * Used in static builds to authenticate API requests
 * Waits for Clerk to be loaded before attempting to get token
 */
export async function getAuthToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  try {
    // Wait for Clerk to be loaded (max 5 seconds)
    let attempts = 0;
    const maxAttempts = 50; // 50 * 100ms = 5 seconds

    while (attempts < maxAttempts) {
      const clerk = (window as any).Clerk;

      // Clerk is loaded and has a session
      if (clerk?.loaded && clerk?.session) {
        return await clerk.session.getToken();
      }

      // Clerk is loaded but no session (user not signed in)
      if (clerk?.loaded) {
        return null;
      }

      // Wait 100ms before trying again
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    console.warn('[fetch-helpers] Clerk did not load within timeout');
    return null;
  } catch (error) {
    console.error('[fetch-helpers] Failed to get auth token:', error);
    return null;
  }
}

/**
 * Authenticated fetch - automatically includes JWT token in Authorization header
 * Use this for all API calls to /api/* routes in static builds
 *
 * @param url - API URL to fetch
 * @param options - Standard fetch options
 * @returns Promise<Response>
 */
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getAuthToken();

  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(url, {
    ...options,
    credentials: 'include', // Include cookies for backward compatibility
    headers
  });
}


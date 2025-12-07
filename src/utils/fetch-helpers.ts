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


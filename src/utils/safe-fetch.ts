/**
 * Safe fetch utility with retry logic, timeout, and request deduplication
 * Provides resilient API calls with graceful error handling
 */

interface SafeFetchOptions extends RequestInit {
  /** Number of retry attempts (default: 3) */
  retries?: number;
  /** Base delay in ms for exponential backoff (default: 1000) */
  retryDelay?: number;
  /** Request timeout in ms (default: 10000) */
  timeout?: number;
  /** Whether to deduplicate concurrent identical requests (default: true) */
  deduplicate?: boolean;
  /** Whether to check auth before making request (default: true) */
  checkAuth?: boolean;
}

interface SafeFetchResult<T = unknown> {
  data: T | null;
  error: string | null;
  status: number | null;
  ok: boolean;
}

// In-flight request cache for deduplication
const inFlightRequests = new Map<string, Promise<Response | null>>();

/**
 * Check if Clerk authentication is ready
 * Returns true if auth cookies/tokens are present
 */
export function isAuthReady(): boolean {
  if (typeof window === 'undefined') return false;
  
  // Check for Clerk session cookie or token
  const cookies = document.cookie.split(';');
  const hasClerkCookie = cookies.some(cookie => 
    cookie.trim().startsWith('__clerk') || 
    cookie.trim().startsWith('__session')
  );
  
  // Also check if we're on a protected route (not sign-in/sign-up)
  const isProtectedRoute = !window.location.pathname.includes('/sign-in') && 
                          !window.location.pathname.includes('/sign-up');
  
  return hasClerkCookie || isProtectedRoute;
}

/**
 * Create a unique cache key for request deduplication
 */
function createCacheKey(url: string, options: RequestInit = {}): string {
  const method = options.method || 'GET';
  const body = options.body ? String(options.body) : '';
  return `${method}:${url}:${body}`;
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch with timeout support
 */
async function fetchWithTimeout(
  url: string, 
  options: RequestInit = {}, 
  timeout: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Safe fetch wrapper with retry logic, timeout, and deduplication
 * 
 * Features:
 * - Automatic retry with exponential backoff for transient failures (5xx errors)
 * - Request timeout to prevent hanging requests
 * - Request deduplication for identical concurrent requests
 * - Auth checking to prevent unnecessary API calls when not authenticated
 * - Graceful error handling with null returns instead of throws
 * 
 * @param url - The URL to fetch
 * @param options - Fetch options plus safe-fetch specific options
 * @returns Response or null if request failed
 */
export async function safeFetch(
  url: string, 
  options: SafeFetchOptions = {}
): Promise<Response | null> {
  const {
    retries = 3,
    retryDelay = 1000,
    timeout = 10000,
    deduplicate = true,
    checkAuth = true,
    ...fetchOptions
  } = options;

  // Check if auth is ready before making API call
  if (checkAuth && !isAuthReady()) {
    return null;
  }

  // Ensure credentials are included for auth
  const mergedOptions: RequestInit = {
    ...fetchOptions,
    credentials: 'include'
  };

  const cacheKey = createCacheKey(url, mergedOptions);

  // Check for in-flight request (deduplication)
  if (deduplicate && inFlightRequests.has(cacheKey)) {
    // Clone the response so each consumer can read the body independently
    const cachedPromise = inFlightRequests.get(cacheKey)!;
    const response = await cachedPromise;
    return response ? response.clone() : null;
  }

  // Create the fetch promise with retry logic
  const fetchPromise = (async (): Promise<Response | null> => {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetchWithTimeout(url, mergedOptions, timeout);
        
        // Handle 401 Unauthorized - don't retry, auth issue
        if (response.status === 401) {
          return null;
        }
        
        // Handle 503 Service Unavailable - retry with backoff
        // Completely suppress retry logs - only log final error after all retries
        if (response.status === 503 && attempt < retries) {
          const delay = retryDelay * Math.pow(2, attempt);
          // Don't log retries - completely silent during retries
          await sleep(delay);
          continue;
        }
        
        // Handle other 5xx errors - retry with backoff
        // Completely suppress retry logs - only log final error after all retries
        if (response.status >= 500 && attempt < retries) {
          const delay = retryDelay * Math.pow(2, attempt);
          // Don't log retries - completely silent during retries
          await sleep(delay);
          continue;
        }
        
        // Log errors but don't throw
        // Only log after all retries are exhausted or for non-retryable errors
        if (!response.ok) {
          if (response.status >= 500) {
            // Only log server errors after ALL retries are exhausted (attempt === retries)
            if (attempt === retries) {
              console.error(`[safeFetch] Server error ${response.status} for ${url} (after ${retries + 1} attempts)`);
            }
          } else if (import.meta.env.DEV && response.status >= 400) {
            console.warn(`[safeFetch] Client error ${response.status} for ${url}`);
          }
        }
        
        return response;
      } catch (error: any) {
        lastError = error;
        
        // Handle timeout/abort
        if (error.name === 'AbortError') {
          if (attempt < retries) {
            const delay = retryDelay * Math.pow(2, attempt);
            console.warn(`[safeFetch] Timeout for ${url}, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
            await sleep(delay);
            continue;
          }
          console.error(`[safeFetch] Timeout for ${url} after ${retries} retries`);
          return null;
        }
        
        // Network errors - retry with backoff
        if (attempt < retries) {
          const delay = retryDelay * Math.pow(2, attempt);
          console.warn(`[safeFetch] Network error for ${url}, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
          await sleep(delay);
          continue;
        }
        
        console.error(`[safeFetch] Network error for ${url}:`, error.message || error);
        return null;
      }
    }
    
    // All retries exhausted - only log if it's not a server error (those are logged above)
    // Server errors (503/5xx) are already logged when response.ok is false after retries
    // Only log network/timeout errors that aren't server errors
    if (lastError) {
      const errorMsg = lastError.message || String(lastError);
      const isServerError = /50[0-9]|503/.test(errorMsg) || errorMsg.includes('Service Unavailable');
      if (!isServerError) {
        console.error(`[safeFetch] All retries exhausted for ${url}`, errorMsg);
      }
    }
    return null;
  })();

  // Store in-flight request for deduplication
  if (deduplicate) {
    inFlightRequests.set(cacheKey, fetchPromise);
    
    // Clean up after request completes
    fetchPromise.finally(() => {
      inFlightRequests.delete(cacheKey);
    });
  }

  return fetchPromise;
}

/**
 * Safe fetch with automatic JSON parsing
 * Returns a structured result with data, error, and status
 */
export async function safeFetchJSON<T = unknown>(
  url: string,
  options: SafeFetchOptions = {}
): Promise<SafeFetchResult<T>> {
  const response = await safeFetch(url, options);
  
  if (!response) {
    return {
      data: null,
      error: 'Request failed',
      status: null,
      ok: false
    };
  }
  
  try {
    const data = await response.json();
    return {
      data: response.ok ? data : null,
      error: response.ok ? null : (data.error || data.message || 'Request failed'),
      status: response.status,
      ok: response.ok
    };
  } catch (parseError) {
    return {
      data: null,
      error: 'Failed to parse response',
      status: response.status,
      ok: false
    };
  }
}

/**
 * Clear all in-flight requests (useful for testing or cleanup)
 */
export function clearInFlightRequests(): void {
  inFlightRequests.clear();
}


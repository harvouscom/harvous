/**
 * Safe URL utilities for Safari PWA compatibility
 * Handles edge cases where window.location.origin returns "null" or document.referrer is relative
 * 
 * Following the pattern of safe-fetch.ts and safe-navigate.ts
 */

/**
 * Get a safe origin that works in all contexts including Safari PWA
 * In Safari PWA standalone mode, window.location.origin can return the string "null"
 * or be empty, so we construct it manually from protocol and host
 */
export function getSafeOrigin(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  // Check if origin is valid (not "null" string or empty)
  const origin = window.location.origin;
  if (origin && origin !== 'null' && origin !== 'undefined') {
    return origin;
  }

  // Fallback: construct origin from protocol and host
  const protocol = window.location.protocol || 'https:';
  const host = window.location.host || window.location.hostname || '';
  
  if (host) {
    return `${protocol}//${host}`;
  }

  // Last resort: return current href without path
  try {
    const url = new URL(window.location.href);
    return url.origin;
  } catch {
    // If even that fails, return empty string
    return '';
  }
}

/**
 * Safely construct a URL, handling Safari PWA edge cases
 * Returns null if URL cannot be constructed
 * 
 * @param path - The path or full URL to parse
 * @param base - Optional base URL (defaults to safe origin)
 */
export function safeURL(path: string, base?: string): URL | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    // If path is already a full URL, use it directly
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return new URL(path);
    }

    // Use provided base or get safe origin
    const baseUrl = base || getSafeOrigin();
    
    if (!baseUrl) {
      // If we can't get a base, try using current location as fallback
      try {
        return new URL(path, window.location.href);
      } catch {
        return null;
      }
    }

    return new URL(path, baseUrl);
  } catch (error) {
    // Log error in development for debugging
    if (import.meta.env.DEV) {
      console.warn('[safeURL] Failed to construct URL:', { path, base, error });
    }
    return null;
  }
}

/**
 * Build a URL string for API calls (convenience wrapper)
 * Returns empty string if URL cannot be constructed
 * 
 * @param path - The API path (e.g., '/api/content/load-more')
 * @param params - Optional query parameters
 */
export function buildAPIUrl(path: string, params?: Record<string, string | number>): string {
  const url = safeURL(path);
  
  if (!url) {
    return '';
  }

  // Add query parameters if provided
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    });
  }

  return url.toString();
}

/**
 * Safely parse a referrer URL
 * Handles cases where document.referrer is relative or empty
 * 
 * @param referrer - The referrer string (defaults to document.referrer)
 * @returns URL object or null if cannot be parsed
 */
export function safeParseReferrer(referrer?: string): URL | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  const referrerStr = referrer || document.referrer;
  
  if (!referrerStr) {
    return null;
  }

  // If it's already a full URL, parse it directly
  if (referrerStr.startsWith('http://') || referrerStr.startsWith('https://')) {
    try {
      return new URL(referrerStr);
    } catch {
      return null;
    }
  }

  // If it's relative, use safe origin as base
  return safeURL(referrerStr);
}

/**
 * Check if a referrer path matches a pattern
 * Safe wrapper for checking document.referrer paths
 * 
 * @param pattern - The path pattern to check (e.g., '/note_')
 * @param referrer - Optional referrer string (defaults to document.referrer)
 */
export function referrerMatchesPattern(pattern: string, referrer?: string): boolean {
  const referrerUrl = safeParseReferrer(referrer);
  
  if (!referrerUrl) {
    // Fallback: check if referrer string contains the pattern
    const referrerStr = referrer || (typeof document !== 'undefined' ? document.referrer : '');
    return referrerStr ? referrerStr.includes(pattern) : false;
  }

  return referrerUrl.pathname.startsWith(pattern);
}


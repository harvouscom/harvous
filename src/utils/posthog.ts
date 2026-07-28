/**
 * PostHog Analytics Utility
 * 
 * Provides a privacy-first PostHog integration for:
 * - Product analytics
 * - Feature flags
 * - Error/event tracking
 * 
 * Note: PostHog is initialized client-side only
 */

import posthog from 'posthog-js';

// Type definitions for window.posthog
declare global {
  interface Window {
    posthog?: typeof posthog;
  }
}

function getPostHogKey(): string | undefined {
  const env = import.meta.env as Record<string, string | undefined>;
  return env.VITE_PUBLIC_POSTHOG_KEY || env.PUBLIC_POSTHOG_KEY || undefined;
}

function getPostHogHost(): string {
  const env = import.meta.env as Record<string, string | undefined>;
  return env.VITE_PUBLIC_POSTHOG_HOST || env.PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';
}

/**
 * Initialize PostHog (client-side only)
 * Should be called after page load to avoid blocking initial render
 */
export function initPostHog() {
  // Only run on client-side
  if (typeof window === 'undefined') {
    return;
  }

  // Check if already initialized
  if (window.posthog) {
    return;
  }

  const posthogKey = getPostHogKey();
  const posthogHost = getPostHogHost();

  if (!posthogKey) {
    if (import.meta.env.DEV) {
      console.warn('[PostHog] Missing PUBLIC_POSTHOG_KEY / VITE_PUBLIC_POSTHOG_KEY — analytics disabled');
    }
    return;
  }

  try {
    posthog.init(posthogKey, {
      api_host: posthogHost,
      // Privacy-first settings
      autocapture: false, // Disable automatic capture for privacy
      // SPA: capture initial load + history API / back-forward navigations
      capture_pageview: 'history_change' as const,
      capture_pageleave: true,
      // Respect Do Not Track
      respect_dnt: true,
      // Disable session recording by default (opt-in only)
      disable_session_recording: true,
      // Mask sensitive data
      mask_all_text: false,
      mask_all_element_attributes: false,
      loaded: (instance) => {
        window.posthog = instance;
      },
    });
    // Available immediately for identify / capture (loaded may race)
    window.posthog = posthog;
  } catch (error) {
    console.error('[PostHog] Initialization error:', error);
  }
}

/**
 * Identify user with Clerk userId and user data
 * Call this after user authentication
 */
export function identifyUser(userId: string, userData?: {
  email?: string;
  name?: string;
  displayName?: string;
  userColor?: string;
}) {
  if (typeof window === 'undefined' || !window.posthog) {
    return;
  }

  try {
    window.posthog.identify(userId, {
      // Only include non-sensitive user properties
      email: userData?.email,
      name: userData?.name || userData?.displayName,
      user_color: userData?.userColor,
      // Don't send sensitive data
    });
  } catch (error) {
    console.error('[PostHog] Identify error:', error);
  }
}

/**
 * Reset user identification (on logout)
 */
export function resetUser() {
  if (typeof window === 'undefined' || !window.posthog) {
    return;
  }

  try {
    window.posthog.reset();
  } catch (error) {
    console.error('[PostHog] Reset error:', error);
  }
}

/**
 * Capture a custom event
 */
export function captureEvent(eventName: string, properties?: Record<string, any>) {
  if (typeof window === 'undefined' || !window.posthog) {
    return;
  }

  try {
    window.posthog.capture(eventName, properties);
  } catch (error) {
    console.error('[PostHog] Capture error:', error);
  }
}

/**
 * Check if a feature flag is enabled
 */
export function isFeatureEnabled(flagName: string): boolean {
  if (typeof window === 'undefined' || !window.posthog) {
    return false;
  }

  try {
    return window.posthog.isFeatureEnabled(flagName) || false;
  } catch (error) {
    console.error('[PostHog] Feature flag error:', error);
    return false;
  }
}

/**
 * Get feature flag value
 */
export function getFeatureFlag(flagName: string): string | boolean | undefined {
  if (typeof window === 'undefined' || !window.posthog) {
    return undefined;
  }

  try {
    return window.posthog.getFeatureFlag(flagName);
  } catch (error) {
    console.error('[PostHog] Feature flag error:', error);
    return undefined;
  }
}

// Re-export for backward compatibility — new callers should import from './offline-mode' directly.
export { isOfflineModeEnabled } from './offline-mode';

/**
 * Enable session recording (opt-in)
 */
export function enableSessionRecording() {
  if (typeof window === 'undefined' || !window.posthog) {
    return;
  }

  try {
    window.posthog.startSessionRecording();
  } catch (error) {
    console.error('[PostHog] Session recording error:', error);
  }
}

/**
 * Disable session recording
 */
export function disableSessionRecording() {
  if (typeof window === 'undefined' || !window.posthog) {
    return;
  }

  try {
    window.posthog.stopSessionRecording();
  } catch (error) {
    console.error('[PostHog] Session recording error:', error);
  }
}

/**
 * Opt out of tracking
 */
export function optOut() {
  if (typeof window === 'undefined' || !window.posthog) {
    return;
  }

  try {
    window.posthog.opt_out_capturing();
  } catch (error) {
    console.error('[PostHog] Opt out error:', error);
  }
}

/**
 * Opt in to tracking
 */
export function optIn() {
  if (typeof window === 'undefined' || !window.posthog) {
    return;
  }

  try {
    window.posthog.opt_in_capturing();
  } catch (error) {
    console.error('[PostHog] Opt in error:', error);
  }
}

/**
 * Check if an error should be ignored (not sent to PostHog)
 * Filters out expected errors like AbortError from cancelled fetch requests
 */
function shouldIgnoreError(error: Error | string): boolean {
  if (typeof error === 'string') {
    const errorLower = error.toLowerCase();
    return errorLower.includes('aborterror') || 
           errorLower.includes('signal is aborted') ||
           errorLower.includes('user aborted a request');
  }
  
  // Check error name
  if (error.name === 'AbortError' || error.name === 'DOMException') {
    const message = error.message?.toLowerCase() || '';
    return message.includes('aborterror') ||
           message.includes('signal is aborted') ||
           message.includes('user aborted a request');
  }
  
  // Check error message
  const message = error.message?.toLowerCase() || '';
  return message.includes('aborterror') ||
         message.includes('signal is aborted') ||
         message.includes('user aborted a request');
}

/**
 * Capture an exception/error in PostHog
 * Uses PostHog's captureException method for proper error tracking
 */
export function captureException(
  error: Error | string,
  additionalProperties?: Record<string, any>
) {
  if (typeof window === 'undefined' || !window.posthog) {
    return;
  }

  // Filter out AbortError exceptions (expected behavior from cancelled requests)
  if (shouldIgnoreError(error)) {
    return;
  }

  try {
    // Convert string errors to Error objects
    const errorObj = typeof error === 'string' 
      ? new Error(error) 
      : error;

    window.posthog.captureException(errorObj, additionalProperties);
  } catch (err) {
    console.error('[PostHog] Error capturing exception:', err);
  }
}

/**
 * Track page load performance metrics
 * Captures: DOMContentLoaded, load, and First Contentful Paint (if available)
 */
export function trackPageLoad() {
  if (typeof window === 'undefined' || !window.posthog) {
    return;
  }

  try {
    // Track DOMContentLoaded time
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        const domContentLoadedTime = performance.now();
        captureEvent('page_load_dom_content_loaded', {
          load_time_ms: Math.round(domContentLoadedTime),
          page_url: window.location.pathname,
        });
      });
    } else {
      // Already loaded
      const domContentLoadedTime = performance.timing?.domContentLoadedEventEnd 
        ? performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart
        : null;
      if (domContentLoadedTime) {
        captureEvent('page_load_dom_content_loaded', {
          load_time_ms: Math.round(domContentLoadedTime),
          page_url: window.location.pathname,
        });
      }
    }

    // Track full page load time
    if (document.readyState === 'complete') {
      const loadTime = performance.timing?.loadEventEnd 
        ? performance.timing.loadEventEnd - performance.timing.navigationStart
        : null;
      if (loadTime) {
        captureEvent('page_load_complete', {
          load_time_ms: Math.round(loadTime),
          page_url: window.location.pathname,
        });
      }
    } else {
      window.addEventListener('load', () => {
        const loadTime = performance.timing?.loadEventEnd 
          ? performance.timing.loadEventEnd - performance.timing.navigationStart
          : performance.now();
        captureEvent('page_load_complete', {
          load_time_ms: Math.round(loadTime),
          page_url: window.location.pathname,
        });
      });
    }

    // Track First Contentful Paint if available
    if ('PerformanceObserver' in window) {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.name === 'first-contentful-paint') {
              captureEvent('page_load_first_contentful_paint', {
                fcp_ms: Math.round(entry.startTime),
                page_url: window.location.pathname,
              });
              observer.disconnect();
            }
          }
        });
        observer.observe({ entryTypes: ['paint'] });
      } catch (e) {
        // PerformanceObserver not supported or failed
      }
    }
  } catch (error) {
    console.error('[PostHog] Error tracking page load:', error);
  }
}

/**
 * Track API response time for slow queries
 * Call this after API requests complete
 */
export function trackAPIResponseTime(
  endpoint: string,
  responseTimeMs: number,
  statusCode?: number,
  error?: boolean
) {
  if (typeof window === 'undefined' || !window.posthog) {
    return;
  }

  try {
    const isSlow = responseTimeMs > 1000; // Flag queries over 1 second as slow
    const isVerySlow = responseTimeMs > 3000; // Flag queries over 3 seconds as very slow

    captureEvent('api_response_time', {
      endpoint,
      response_time_ms: Math.round(responseTimeMs),
      status_code: statusCode,
      is_error: error || false,
      is_slow: isSlow,
      is_very_slow: isVerySlow,
    });

    // Also track slow queries as a separate event for easier filtering
    if (isSlow) {
      captureEvent('slow_api_query', {
        endpoint,
        response_time_ms: Math.round(responseTimeMs),
        status_code: statusCode,
        is_error: error || false,
      });
    }
  } catch (err) {
    console.error('[PostHog] Error tracking API response time:', err);
  }
}


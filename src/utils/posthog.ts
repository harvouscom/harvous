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

  const posthogKey = import.meta.env.PUBLIC_POSTHOG_KEY;
  const posthogHost = import.meta.env.PUBLIC_POSTHOG_HOST || 'https://app.posthog.com';

  if (!posthogKey) {
    if (import.meta.env.DEV) {
      console.warn('[PostHog] Key not found - analytics disabled');
    }
    return;
  }

  try {
    posthog.init(posthogKey, {
      api_host: posthogHost,
      // Privacy-first settings
      autocapture: false, // Disable automatic capture for privacy
      capture_pageview: true, // But still capture pageviews
      capture_pageleave: true,
      // Respect Do Not Track
      respect_dnt: true,
      // Disable session recording by default (opt-in only)
      disable_session_recording: true,
      // Mask sensitive data
      mask_all_text: false,
      mask_all_element_attributes: false,
      // Performance optimizations
      loaded: (posthog) => {
        if (import.meta.env.DEV) {
          console.log('[PostHog] Initialized successfully');
        }
        // Make posthog available globally for feature flags
        window.posthog = posthog;
        
        // Ensure pageview is captured (in case it wasn't automatic)
        try {
          posthog.capture('$pageview');
        } catch (error) {
          // Ignore errors - pageview might already be captured
        }
      },
      // Error handling
      _capture_metrics: true,
    });
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


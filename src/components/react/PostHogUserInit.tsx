/**
 * PostHog User Identification Component
 * 
 * Identifies users in PostHog after Clerk authentication.
 * Works with the official PostHog Astro integration.
 */

import { useEffect } from 'react';

interface PostHogUserInitProps {
  userId?: string;
  userData?: {
    email?: string;
    name?: string;
    displayName?: string;
    userColor?: string;
  };
}

export default function PostHogUserInit({ userId, userData }: PostHogUserInitProps) {
  useEffect(() => {
    if (typeof window === 'undefined' || !userId) {
      return;
    }

    // Store user data globally for PostHog to pick up
    const userProps = {
      email: userData?.email,
      name: userData?.name || userData?.displayName,
      user_color: userData?.userColor,
    };

    (window as any).__posthog_userId__ = userId;
    (window as any).__posthog_userData__ = userProps;

    // Function to identify user when PostHog is ready
    const identifyUser = () => {
      const posthog = (window as any).posthog;
      if (posthog && typeof posthog.identify === 'function') {
        try {
          posthog.identify(userId, userProps);
          console.log('[PostHog] User identified:', userId);
        } catch (error) {
          console.error('[PostHog] Identify error:', error);
        }
      }
    };

    // Try to identify immediately if PostHog is already loaded
    identifyUser();

    // Also retry a few times in case PostHog is still loading
    let attempts = 0;
    const maxAttempts = 10;
    const interval = setInterval(() => {
      attempts++;
      if ((window as any).posthog) {
        identifyUser();
        clearInterval(interval);
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
        console.warn('[PostHog] User identification timeout - PostHog may not be loaded');
      }
    }, 200);

    return () => {
      clearInterval(interval);
    };
  }, [userId, userData]);

  return null;
}


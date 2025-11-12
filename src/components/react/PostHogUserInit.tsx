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
    if (typeof window === 'undefined') {
      return;
    }

    // Store user data globally for PostHog to pick up
    if (userId) {
      (window as any).__posthog_userId__ = userId;
      (window as any).__posthog_userData__ = {
        email: userData?.email,
        name: userData?.name || userData?.displayName,
        user_color: userData?.userColor,
      };

      // If PostHog is already loaded, identify immediately
      if ((window as any).posthog) {
        (window as any).posthog.identify(userId, (window as any).__posthog_userData__);
      }
    }
  }, [userId, userData]);

  return null;
}


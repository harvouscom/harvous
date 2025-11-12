/**
 * PostHog Initialization Component
 * 
 * Initializes PostHog on the client-side and identifies users
 * after Clerk authentication.
 */

import { useEffect } from 'react';
import { initPostHog, identifyUser, captureEvent } from '@/utils/posthog';

interface PostHogInitProps {
  userId?: string;
  userData?: {
    email?: string;
    name?: string;
    displayName?: string;
    userColor?: string;
  };
}

export default function PostHogInit({ userId, userData }: PostHogInitProps) {
  useEffect(() => {
    // Initialize PostHog after component mounts
    initPostHog();

    // Wait for PostHog to be fully loaded, then identify user and send test event
    const checkPostHog = () => {
      if (typeof window !== 'undefined' && window.posthog) {
        // PostHog is loaded, identify user if authenticated
        if (userId) {
          identifyUser(userId, userData);
        }

        // Capture a test event to verify installation
        // This helps PostHog verify the integration is working
        captureEvent('posthog_initialized', {
          timestamp: new Date().toISOString(),
          has_user: !!userId,
        });

        if (import.meta.env.DEV) {
          console.log('[PostHog] Initialized and test event sent');
        }
      } else {
        // PostHog not ready yet, check again
        setTimeout(checkPostHog, 100);
      }
    };

    // Start checking after a short delay to allow initialization
    const timer = setTimeout(checkPostHog, 200);

    return () => clearTimeout(timer);
  }, [userId, userData]);

  // This component doesn't render anything
  return null;
}


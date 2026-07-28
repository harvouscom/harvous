/**
 * Initializes PostHog in the SPA and identifies / resets with Clerk auth.
 */
import { useAuth, useUser } from '@clerk/clerk-react';
import { useEffect, useRef } from 'react';
import { identifyUser, initPostHog, resetUser } from '@/utils/posthog';

export function PostHogBridge() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const identifiedIdRef = useRef<string | null>(null);

  useEffect(() => {
    initPostHog();
  }, []);

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn || !user?.id) {
      if (identifiedIdRef.current) {
        resetUser();
        identifiedIdRef.current = null;
      }
      return;
    }

    if (identifiedIdRef.current === user.id) return;

    const primaryEmail =
      user.primaryEmailAddress?.emailAddress ||
      user.emailAddresses?.[0]?.emailAddress ||
      undefined;

    const signedUpAt =
      user.createdAt instanceof Date
        ? user.createdAt.toISOString()
        : typeof user.createdAt === 'number'
          ? new Date(user.createdAt).toISOString()
          : undefined;

    identifyUser(user.id, {
      email: primaryEmail,
      name: user.fullName || undefined,
      displayName: user.fullName || user.firstName || undefined,
      signedUpAt,
    });
    identifiedIdRef.current = user.id;
  }, [isLoaded, isSignedIn, user]);

  return null;
}

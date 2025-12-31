import React, { useState, useEffect } from 'react';
import { SubscriptionDetailsButton } from '@clerk/clerk-react/experimental';
import { ClerkProvider, SignedIn, useAuth } from '@clerk/clerk-react';
import { waitForClerk, isClerkLoaded } from '@/utils/clerk-init';

interface SafeSubscriptionDetailsButtonProps {
  children: React.ReactNode;
  publishableKey?: string | null;
}

/**
 * Inner component that uses Clerk hooks - must be inside ClerkProvider
 */
function SafeSubscriptionDetailsButtonInner({ 
  children 
}: { 
  children: React.ReactNode;
}) {
  const { isLoaded } = useAuth();
  const [isClient, setIsClient] = useState(false);
  const [clerkInitError, setClerkInitError] = useState<Error | null>(null);
  const [isClerkReady, setIsClerkReady] = useState(false);

  // Ensure we're on the client before rendering Clerk components
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Wait for Clerk to be fully initialized
  useEffect(() => {
    if (!isClient) return;

    const initClerk = async () => {
      try {
        // If Clerk is already loaded, set ready immediately
        if (isClerkLoaded()) {
          setIsClerkReady(true);
          return;
        }

        // Otherwise wait for Clerk to load
        await waitForClerk(15000);
        setIsClerkReady(true);
      } catch (error) {
        console.error('[SafeSubscriptionDetailsButton] Clerk initialization error:', error);
        setClerkInitError(error as Error);
        // Still allow component to render, but show error state
        setIsClerkReady(false);
      }
    };

    initClerk();
  }, [isClient]);

  // Show loading state while Clerk initializes
  if (!isClient || !isLoaded || !isClerkReady) {
    return (
      <button
        type="button"
        disabled
        style={{ opacity: 0.5, pointerEvents: 'none', cursor: 'wait' }}
        aria-label="Loading billing..."
      >
        {children}
      </button>
    );
  }

  // Show error state if Clerk failed to initialize
  if (clerkInitError) {
    return (
      <button
        type="button"
        disabled
        style={{ opacity: 0.5, pointerEvents: 'none' }}
        aria-label="Billing unavailable"
      >
        {children}
      </button>
    );
  }

  return <SubscriptionDetailsButton>{children}</SubscriptionDetailsButton>;
}

/**
 * Wrapper component that safely renders SubscriptionDetailsButton.
 * React Islands are isolated and need their own ClerkProvider.
 * This is expected behavior - each React Island has its own React root.
 */
export default function SafeSubscriptionDetailsButton({ 
  children,
  publishableKey = null
}: SafeSubscriptionDetailsButtonProps) {
  // If no publishable key, render a disabled placeholder
  if (!publishableKey) {
    return (
      <button
        type="button"
        disabled
        style={{ opacity: 0.5, pointerEvents: 'none' }}
        aria-label="Billing unavailable"
      >
        {children}
      </button>
    );
  }

  // Get domain and URLs for ClerkProvider configuration
  const getClerkConfig = () => {
    if (typeof window === 'undefined') {
      return {
        publishableKey,
        domain: undefined,
        afterSignInUrl: undefined,
        afterSignUpUrl: undefined
      };
    }

    return {
      publishableKey,
      domain: window.location.hostname,
      afterSignInUrl: window.location.origin,
      afterSignUpUrl: window.location.origin
    };
  };

  const clerkConfig = getClerkConfig();

  // React Islands are isolated - each needs its own ClerkProvider
  // This is expected and correct behavior
  return (
    <ClerkProvider 
      publishableKey={clerkConfig.publishableKey!}
      domain={clerkConfig.domain}
      afterSignInUrl={clerkConfig.afterSignInUrl}
      afterSignUpUrl={clerkConfig.afterSignUpUrl}
    >
      <SignedIn>
        <SafeSubscriptionDetailsButtonInner>{children}</SafeSubscriptionDetailsButtonInner>
      </SignedIn>
    </ClerkProvider>
  );
}


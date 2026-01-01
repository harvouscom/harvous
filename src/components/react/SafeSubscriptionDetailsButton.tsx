import React, { useState, useEffect } from 'react';
import { SubscriptionDetailsButton } from '@clerk/clerk-react/experimental';
import { ClerkProvider, SignedIn } from '@clerk/clerk-react';

interface SafeSubscriptionDetailsButtonProps {
  children: React.ReactNode;
  publishableKey?: string | null;
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
  const [effectiveKey, setEffectiveKey] = useState<string | null>(publishableKey);

  // Get publishableKey from props or window global (for View Transitions compatibility)
  useEffect(() => {
    // Use prop if available, otherwise try window global
    const key = publishableKey || (typeof window !== 'undefined' ? (window as any).CLERK_PUBLISHABLE_KEY : null);
    setEffectiveKey(key);
  }, [publishableKey]);

  // Re-check after View Transitions navigation
  useEffect(() => {
    const handlePageLoad = () => {
      const key = publishableKey || (typeof window !== 'undefined' ? (window as any).CLERK_PUBLISHABLE_KEY : null);
      setEffectiveKey(key);
    };

    document.addEventListener('astro:page-load', handlePageLoad);
    return () => {
      document.removeEventListener('astro:page-load', handlePageLoad);
    };
  }, [publishableKey]);

  // If no publishable key, render a disabled placeholder
  if (!effectiveKey) {
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
        publishableKey: effectiveKey,
        domain: undefined,
        afterSignInUrl: undefined,
        afterSignUpUrl: undefined
      };
    }

    return {
      publishableKey: effectiveKey,
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
        <SubscriptionDetailsButton>{children}</SubscriptionDetailsButton>
      </SignedIn>
    </ClerkProvider>
  );
}


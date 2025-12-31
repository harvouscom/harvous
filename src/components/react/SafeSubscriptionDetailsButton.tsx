import React from 'react';
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
  // Get publishable key from props (passed from Astro frontmatter where import.meta.env works)

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

  // React Islands are isolated - each needs its own ClerkProvider
  // This is expected and correct behavior
  return (
    <ClerkProvider publishableKey={publishableKey}>
      <SignedIn>
        <SubscriptionDetailsButton>{children}</SubscriptionDetailsButton>
      </SignedIn>
    </ClerkProvider>
  );
}


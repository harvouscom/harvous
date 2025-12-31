import React from 'react';
import { SubscriptionDetailsButton } from '@clerk/clerk-react/experimental';
import { ClerkProvider, SignedIn } from '@clerk/clerk-react';

interface SafeSubscriptionDetailsButtonProps {
  children: React.ReactNode;
}

/**
 * Wrapper component that safely renders SubscriptionDetailsButton
 * with ClerkProvider context. React Islands are isolated, so each
 * needs its own ClerkProvider to access Clerk context.
 * Wrapped in SignedIn to ensure user is authenticated before drawer opens.
 */
export default function SafeSubscriptionDetailsButton({ 
  children 
}: SafeSubscriptionDetailsButtonProps) {
  const publishableKey = typeof window !== 'undefined' ? import.meta.env.PUBLIC_CLERK_PUBLISHABLE_KEY : null;

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

  // Wrap SubscriptionDetailsButton in ClerkProvider and SignedIn for React Island isolation
  // SignedIn ensures user is authenticated before drawer opens, preventing empty drawer
  return (
    <ClerkProvider publishableKey={publishableKey}>
      <SignedIn>
        <SubscriptionDetailsButton>{children}</SubscriptionDetailsButton>
      </SignedIn>
    </ClerkProvider>
  );
}


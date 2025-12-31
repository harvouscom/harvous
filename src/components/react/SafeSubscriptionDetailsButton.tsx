import React from 'react';
import { SubscriptionDetailsButton } from '@clerk/clerk-react/experimental';
import { SignedIn } from '@clerk/clerk-react';

interface SafeSubscriptionDetailsButtonProps {
  children: React.ReactNode;
}

/**
 * Wrapper component that safely renders SubscriptionDetailsButton.
 * Relies on @clerk/astro's global ClerkProvider context - do NOT add our own
 * ClerkProvider as it causes "multiple ClerkProvider" errors in production.
 * 
 * @clerk/astro integration provides global Clerk context that React Islands
 * should be able to access. If this doesn't work, the issue is with @clerk/astro
 * configuration, not this component.
 */
export default function SafeSubscriptionDetailsButton({ 
  children 
}: SafeSubscriptionDetailsButtonProps) {
  // Use SubscriptionDetailsButton directly with SignedIn wrapper
  // Rely on @clerk/astro's global ClerkProvider context
  // This avoids "multiple ClerkProvider" errors
  return (
    <SignedIn>
      <SubscriptionDetailsButton>{children}</SubscriptionDetailsButton>
    </SignedIn>
  );
}


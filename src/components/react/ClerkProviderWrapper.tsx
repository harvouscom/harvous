import React from 'react';
import { ClerkProvider } from '@clerk/clerk-react';

interface ClerkProviderWrapperProps {
  children: React.ReactNode;
}

/**
 * Global ClerkProvider wrapper for React Islands.
 * Provides Clerk context to all React components that need it.
 * This ensures both PricingTable (via Clerk initialization) and
 * SubscriptionDetailsButton can access Clerk context.
 */
export default function ClerkProviderWrapper({ children }: ClerkProviderWrapperProps) {
  const publishableKey = typeof window !== 'undefined' ? import.meta.env.PUBLIC_CLERK_PUBLISHABLE_KEY : null;

  // If no publishable key, render children without provider
  if (!publishableKey) {
    return <>{children}</>;
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>
      {children}
    </ClerkProvider>
  );
}


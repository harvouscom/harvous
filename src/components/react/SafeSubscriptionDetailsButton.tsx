import React, { useEffect, useState } from 'react';
import { SubscriptionDetailsButton } from '@clerk/clerk-react/experimental';
import { ClerkProvider, SignedIn } from '@clerk/clerk-react';

interface SafeSubscriptionDetailsButtonProps {
  children: React.ReactNode;
}

/**
 * Wrapper component that safely renders SubscriptionDetailsButton.
 * In production, @clerk/astro provides global Clerk context, but React Islands
 * are isolated and may need their own ClerkProvider. We check if Clerk is
 * already initialized globally before adding our own provider.
 */
export default function SafeSubscriptionDetailsButton({ 
  children 
}: SafeSubscriptionDetailsButtonProps) {
  const publishableKey = typeof window !== 'undefined' ? import.meta.env.PUBLIC_CLERK_PUBLISHABLE_KEY : null;
  const [clerkReady, setClerkReady] = useState(false);

  // Wait for Clerk to be initialized (either from @clerk/astro or our provider)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkClerkReady = () => {
      // Check if Clerk is available globally (from @clerk/astro)
      if ((window as any).__clerk_frontend_api || (window as any).Clerk) {
        setClerkReady(true);
        return true;
      }
      return false;
    };

    // Check immediately
    if (checkClerkReady()) {
      return;
    }

    // Poll for Clerk to become available
    let attempts = 0;
    const maxAttempts = 50; // 5 seconds
    const checkInterval = setInterval(() => {
      attempts++;
      if (checkClerkReady()) {
        clearInterval(checkInterval);
      } else if (attempts >= maxAttempts) {
        // After max attempts, set ready anyway - ClerkProvider will handle initialization
        setClerkReady(true);
        clearInterval(checkInterval);
      }
    }, 100);

    // Also listen for Clerk's load event
    const handleClerkLoaded = () => {
      setClerkReady(true);
      clearInterval(checkInterval);
    };
    window.addEventListener('clerk:loaded', handleClerkLoaded);

    return () => {
      clearInterval(checkInterval);
      window.removeEventListener('clerk:loaded', handleClerkLoaded);
    };
  }, []);

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

  // If Clerk is ready globally, try using it without ClerkProvider first
  // This avoids "multiple ClerkProvider" errors
  if (clerkReady && (window as any).__clerk_frontend_api) {
    // Clerk is initialized globally, try using it directly
    // But React Islands are isolated, so we still need ClerkProvider
    // However, we'll use the same publishable key to avoid conflicts
    return (
      <ClerkProvider publishableKey={publishableKey}>
        <SignedIn>
          <SubscriptionDetailsButton>{children}</SubscriptionDetailsButton>
        </SignedIn>
      </ClerkProvider>
    );
  }

  // Clerk not ready yet, show loading state
  if (!clerkReady) {
    return (
      <button
        type="button"
        disabled
        style={{ opacity: 0.5, pointerEvents: 'none' }}
        aria-label="Loading billing options"
      >
        {children}
      </button>
    );
  }

  // Fallback: provide ClerkProvider (will initialize Clerk if not already done)
  return (
    <ClerkProvider publishableKey={publishableKey}>
      <SignedIn>
        <SubscriptionDetailsButton>{children}</SubscriptionDetailsButton>
      </SignedIn>
    </ClerkProvider>
  );
}


import React, { useState, useEffect } from 'react';
import { SubscriptionDetailsButton } from '@clerk/clerk-react/experimental';

interface SafeSubscriptionDetailsButtonProps {
  children: React.ReactNode;
}

/**
 * Wrapper component that safely renders SubscriptionDetailsButton
 * only when Clerk context is available. Handles the hydration timing
 * issue in Astro React Islands where ClerkProvider may not be ready yet.
 * 
 * This component checks for Clerk's presence without using hooks conditionally,
 * which would violate React's rules.
 */
export default function SafeSubscriptionDetailsButton({ 
  children 
}: SafeSubscriptionDetailsButtonProps) {
  const [isReady, setIsReady] = useState(false);
  
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Check if Clerk is available by looking for Clerk's initialization markers
    const checkClerkReady = (): boolean => {
      // Check for Clerk's frontend API in window (set when ClerkProvider initializes)
      if ((window as any).__clerk_frontend_api) {
        return true;
      }
      return false;
    };
    
    // Initial check
    if (checkClerkReady()) {
      setIsReady(true);
      return;
    }
    
    // Poll for Clerk to become available
    // ClerkProviderWrapper uses client:load, so it should hydrate soon
    let attempts = 0;
    const maxAttempts = 25; // 2.5 seconds max (25 * 100ms)
    
    const checkInterval = setInterval(() => {
      attempts++;
      if (checkClerkReady()) {
        setIsReady(true);
        clearInterval(checkInterval);
      } else if (attempts >= maxAttempts) {
        // After max attempts, enable anyway to prevent infinite waiting
        // If Clerk isn't available, SubscriptionDetailsButton will handle the error
        setIsReady(true);
        clearInterval(checkInterval);
      }
    }, 100);
    
    // Also check after a short delay for immediate hydration
    const timeoutId = setTimeout(() => {
      if (checkClerkReady()) {
        setIsReady(true);
      }
      clearInterval(checkInterval);
    }, 150);
    
    return () => {
      clearInterval(checkInterval);
      clearTimeout(timeoutId);
    };
  }, []);
  
  // If Clerk is ready, render the SubscriptionDetailsButton
  if (isReady) {
    return <SubscriptionDetailsButton>{children}</SubscriptionDetailsButton>;
  }
  
  // Otherwise, render a disabled placeholder button while waiting
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


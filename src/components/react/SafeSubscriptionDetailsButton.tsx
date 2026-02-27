import React, { useState, useEffect, useRef } from 'react';
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
  const [pathname, setPathname] = useState<string>('');
  const [remountKey, setRemountKey] = useState<number>(Date.now());
  const [isVisible, setIsVisible] = useState<boolean>(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // Get publishableKey from props or window global (for View Transitions compatibility)
  useEffect(() => {
    // Use prop if available, otherwise try window global
    const key = publishableKey || (typeof window !== 'undefined' ? (window as any).CLERK_PUBLISHABLE_KEY : null);
    setEffectiveKey(key);
    
    if (typeof window !== 'undefined') {
      setPathname(window.location.pathname);
      // Update remount key on initial load
      setRemountKey(Date.now());
    }
  }, [publishableKey]);

  // Visibility detection using IntersectionObserver to force remount when component becomes visible
  useEffect(() => {
    if (typeof window === 'undefined' || !containerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const wasVisible = isVisible;
          const nowVisible = entry.isIntersecting;
          
          // If component becomes visible after being hidden, force remount
          if (!wasVisible && nowVisible) {
            setRemountKey(Date.now());
          }
          
          setIsVisible(nowVisible);
        });
      },
      {
        threshold: 0.1, // Trigger when at least 10% visible
        rootMargin: '0px'
      }
    );

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, [isVisible]);

  // Re-check after View Transitions navigation and force remount
  useEffect(() => {
    const handlePageLoad = () => {
      const key = publishableKey || (typeof window !== 'undefined' ? (window as any).CLERK_PUBLISHABLE_KEY : null);
      setEffectiveKey(key);
      
      if (typeof window !== 'undefined') {
        setPathname(window.location.pathname);
        // Force remount by updating key with new timestamp on each page load
        setRemountKey(Date.now());
      }
    };

    document.addEventListener('app:route-change', handlePageLoad);
    return () => {
      document.removeEventListener('app:route-change', handlePageLoad);
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
    <div ref={containerRef}>
      <ClerkProvider 
        key={`clerk-provider-subscription-${pathname}-${remountKey}`}
        publishableKey={clerkConfig.publishableKey!}
        domain={clerkConfig.domain}
        afterSignInUrl={clerkConfig.afterSignInUrl}
        afterSignUpUrl={clerkConfig.afterSignUpUrl}
      >
        <SignedIn>
          <SubscriptionDetailsButton key={`subscription-details-${remountKey}`}>
            {children}
          </SubscriptionDetailsButton>
        </SignedIn>
      </ClerkProvider>
    </div>
  );
}


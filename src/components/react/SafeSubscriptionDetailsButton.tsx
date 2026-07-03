import React, { useState, useEffect, useRef } from 'react';
import { SubscriptionDetailsButton } from '@clerk/clerk-react/experimental';
import { ClerkProvider, SignedIn } from '@clerk/clerk-react';

interface SafeSubscriptionDetailsButtonProps {
  children: React.ReactNode;
  publishableKey?: string | null;
  onSubscriptionCancel?: () => void;
}

function SubscriptionDetailsInner({
  children,
  remountKey,
  onSubscriptionCancel,
}: {
  children: React.ReactNode;
  remountKey: number;
  onSubscriptionCancel?: () => void;
}) {
  return (
    <SignedIn>
      <SubscriptionDetailsButton
        key={`subscription-details-${remountKey}`}
        onSubscriptionCancel={onSubscriptionCancel}
      >
        {children}
      </SubscriptionDetailsButton>
    </SignedIn>
  );
}

/**
 * Wrapper component that safely renders SubscriptionDetailsButton.
 * React Islands are isolated and need their own ClerkProvider.
 * When `publishableKey` is null, uses the SPA's ambient ClerkProvider (App.tsx).
 */
export default function SafeSubscriptionDetailsButton({
  children,
  publishableKey = null,
  onSubscriptionCancel,
}: SafeSubscriptionDetailsButtonProps) {
  const [effectiveKey, setEffectiveKey] = useState<string | null>(publishableKey);
  const [pathname, setPathname] = useState<string>('');
  const [remountKey, setRemountKey] = useState<number>(Date.now());
  const [isVisible, setIsVisible] = useState<boolean>(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // Get publishableKey from props or window global (for View Transitions compatibility)
  useEffect(() => {
    const key = publishableKey || (typeof window !== 'undefined' ? (window as any).CLERK_PUBLISHABLE_KEY : null);
    setEffectiveKey(key);

    if (typeof window !== 'undefined') {
      setPathname(window.location.pathname);
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

          if (!wasVisible && nowVisible) {
            setRemountKey(Date.now());
          }

          setIsVisible(nowVisible);
        });
      },
      {
        threshold: 0.1,
        rootMargin: '0px',
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
        setRemountKey(Date.now());
      }
    };

    document.addEventListener('app:route-change', handlePageLoad);
    return () => {
      document.removeEventListener('app:route-change', handlePageLoad);
    };
  }, [publishableKey]);

  // In the SPA, ClerkProvider is already provided by App.tsx — skip creating a nested one.
  if (publishableKey === null) {
    return (
      <div ref={containerRef}>
        <SubscriptionDetailsInner remountKey={remountKey} onSubscriptionCancel={onSubscriptionCancel}>
          {children}
        </SubscriptionDetailsInner>
      </div>
    );
  }

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

  const getClerkConfig = () => {
    if (typeof window === 'undefined') {
      return {
        publishableKey: effectiveKey,
        domain: undefined,
        afterSignInUrl: undefined,
        afterSignUpUrl: undefined,
      };
    }

    return {
      publishableKey: effectiveKey,
      domain: window.location.hostname,
      afterSignInUrl: window.location.origin,
      afterSignUpUrl: window.location.origin,
    };
  };

  const clerkConfig = getClerkConfig();

  return (
    <div ref={containerRef}>
      {/* @ts-expect-error Clerk's ClerkProviderProps discriminated union requires isSatellite/proxyUrl with domain */}
      <ClerkProvider
        key={`clerk-provider-subscription-${pathname}-${remountKey}`}
        publishableKey={clerkConfig.publishableKey!}
        domain={clerkConfig.domain}
        afterSignInUrl={clerkConfig.afterSignInUrl}
        afterSignUpUrl={clerkConfig.afterSignUpUrl}
      >
        <SubscriptionDetailsInner remountKey={remountKey} onSubscriptionCancel={onSubscriptionCancel}>
          {children}
        </SubscriptionDetailsInner>
      </ClerkProvider>
    </div>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import { CheckoutButton } from '@clerk/clerk-react/experimental';
import { ClerkProvider, SignedIn, useAuth } from '@clerk/clerk-react';

interface UpgradeCheckoutButtonProps {
  className?: string;
  publishableKey?: string | null;
  unlimitedPlanId?: string;
}

/**
 * Inner component that uses Clerk hooks - must be inside ClerkProvider
 */
function UpgradeCheckoutButtonInner({ 
  className, 
  unlimitedPlanId 
}: { 
  className: string; 
  unlimitedPlanId: string;
}) {
  const [selectedInterval, setSelectedInterval] = useState<'month' | 'year'>('month');
  const { isLoaded, isSignedIn } = useAuth();
  const [isClient, setIsClient] = useState(false);
  const [pathname, setPathname] = useState<string>('');

  // Ensure we're on the client before rendering Clerk components
  useEffect(() => {
    setIsClient(true);
    if (typeof window !== 'undefined') {
      setPathname(window.location.pathname);
    }
  }, []);

  // Update pathname on View Transitions to force remount
  useEffect(() => {
    const handlePageLoad = () => {
      if (typeof window !== 'undefined') {
        setPathname(window.location.pathname);
      }
    };

    document.addEventListener('astro:page-load', handlePageLoad);
    return () => {
      document.removeEventListener('astro:page-load', handlePageLoad);
    };
  }, []);

  // Update Clerk checkout drawer title when it opens
  useEffect(() => {
    const updateCheckoutDrawerTitle = () => {
      // Update checkout drawer title
      const checkoutTitle = document.querySelector('.cl-drawerTitle[data-localization-key="billing.checkout.title"]');
      if (checkoutTitle && checkoutTitle.textContent !== 'Upgrade') {
        checkoutTitle.textContent = 'Upgrade';
      }
    };

    // Watch for drawer opening using MutationObserver
    const observer = new MutationObserver(() => {
      updateCheckoutDrawerTitle();
    });

    // Observe the document body for changes
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Also try immediately in case drawer is already open
    updateCheckoutDrawerTitle();

    return () => {
      observer.disconnect();
    };
  }, []);

  // Show loading state while Clerk initializes
  if (!isClient || !isLoaded) {
    return (
      <div className={className}>
        {/* Button group skeleton - matches the actual layout */}
        <div className="button-group">
          <div className="button-group__container">
            <button
              type="button"
              disabled
              className="space-button button-group__button button-group__button--left h-[64px] bg-transparent"
              style={{ 
                paddingLeft: '1.5rem',
                paddingRight: '1.5rem',
                paddingTop: 0,
                paddingBottom: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                cursor: 'wait'
              }}
            >
              <span 
                className="font-sans text-[18px] font-semibold whitespace-nowrap"
                style={{
                  color: 'var(--color-pebble-grey)',
                  opacity: 0.6,
                  textAlign: 'center',
                  width: '100%',
                  display: 'block'
                }}
              >
                $6 per month
              </span>
            </button>
            <button
              type="button"
              disabled
              className="space-button button-group__button button-group__button--right h-[64px] bg-transparent"
              style={{ 
                paddingLeft: '1.5rem',
                paddingRight: '1.5rem',
                paddingTop: 0,
                paddingBottom: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                cursor: 'wait'
              }}
            >
              <span 
                className="font-sans text-[18px] font-semibold whitespace-nowrap"
                style={{
                  color: 'var(--color-pebble-grey)',
                  opacity: 0.6,
                  textAlign: 'center',
                  width: '100%',
                  display: 'block'
                }}
              >
                $39 per year
              </span>
            </button>
          </div>
        </div>
        <button
          type="button"
          disabled
          className="btn-cta flex-1 group"
          style={{ 
            width: '100%', 
            marginTop: '1.5rem',
            opacity: 0.5,
            cursor: 'wait'
          }}
        >
          <span className="btn-cta__content">Loading...</span>
          <div className="btn-cta__shadow" />
        </button>
      </div>
    );
  }

  // Only render checkout button if signed in
  if (!isSignedIn) {
    return (
      <div className={className}>
        <div className="button-group">
          <div className="button-group__container">
            <button
              type="button"
              onClick={() => setSelectedInterval('month')}
              className={`space-button button-group__button button-group__button--left h-[64px] ${
                selectedInterval === 'month' 
                  ? '' 
                  : 'bg-transparent'
              }`}
              style={selectedInterval === 'month' ? { 
                backgroundImage: 'var(--color-gradient-gray)',
                paddingLeft: '1.5rem',
                paddingRight: '1.5rem',
                paddingTop: 0,
                paddingBottom: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center'
              } : {
                paddingLeft: '1.5rem',
                paddingRight: '1.5rem',
                paddingTop: 0,
                paddingBottom: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center'
              }}
            >
              <span 
                className="font-sans text-[18px] font-semibold whitespace-nowrap"
                style={{
                  color: selectedInterval === 'month' 
                    ? 'var(--color-deep-grey)' 
                    : 'var(--color-pebble-grey)',
                  opacity: selectedInterval === 'month' ? 1 : 0.6,
                  textAlign: 'center',
                  width: '100%',
                  display: 'block'
                }}
              >
                $6 per month
              </span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedInterval('year')}
              className={`space-button button-group__button button-group__button--right h-[64px] ${
                selectedInterval === 'year' 
                  ? '' 
                  : 'bg-transparent'
              }`}
              style={selectedInterval === 'year' ? { 
                backgroundImage: 'var(--color-gradient-gray)',
                paddingLeft: '1.5rem',
                paddingRight: '1.5rem',
                paddingTop: 0,
                paddingBottom: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center'
              } : {
                paddingLeft: '1.5rem',
                paddingRight: '1.5rem',
                paddingTop: 0,
                paddingBottom: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center'
              }}
            >
              <span 
                className="font-sans text-[18px] font-semibold whitespace-nowrap"
                style={{
                  color: selectedInterval === 'year' 
                    ? 'var(--color-deep-grey)' 
                    : 'var(--color-pebble-grey)',
                  opacity: selectedInterval === 'year' ? 1 : 0.6,
                  textAlign: 'center',
                  width: '100%',
                  display: 'block'
                }}
              >
                $39 per year
              </span>
            </button>
          </div>
        </div>
        <button
          type="button"
          disabled
          className="btn-cta flex-1 group"
          style={{ 
            width: '100%', 
            marginTop: '1.5rem',
            opacity: 0.5,
            cursor: 'not-allowed'
          }}
        >
          <span className="btn-cta__content">Please sign in to continue</span>
          <div className="btn-cta__shadow" />
        </button>
      </div>
    );
  }

  return (
    <div className={className}>
          {/* Button group for billing interval - Monthly first, Annual second */}
          <div className="button-group">
            <div className="button-group__container">
              {/* Monthly button - First/Left */}
              <button
                type="button"
                onClick={() => setSelectedInterval('month')}
                className={`space-button button-group__button button-group__button--left h-[64px] ${
                  selectedInterval === 'month' 
                    ? '' 
                    : 'bg-transparent'
                }`}
                style={selectedInterval === 'month' ? { 
                  backgroundImage: 'var(--color-gradient-gray)',
                  paddingLeft: '1.5rem',
                  paddingRight: '1.5rem',
                  paddingTop: 0,
                  paddingBottom: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center'
                } : {
                  paddingLeft: '1.5rem',
                  paddingRight: '1.5rem',
                  paddingTop: 0,
                  paddingBottom: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center'
                }}
              >
                <span 
                  className="font-sans text-[18px] font-semibold whitespace-nowrap"
                  style={{
                    color: selectedInterval === 'month' 
                      ? 'var(--color-deep-grey)' 
                      : 'var(--color-pebble-grey)',
                    opacity: selectedInterval === 'month' ? 1 : 0.6,
                    textAlign: 'center',
                    width: '100%',
                    display: 'block'
                  }}
                >
                  $6 per month
                </span>
              </button>
              
              {/* Annual button - Second/Right */}
              <button
                type="button"
                onClick={() => setSelectedInterval('year')}
                className={`space-button button-group__button button-group__button--right h-[64px] ${
                  selectedInterval === 'year' 
                    ? '' 
                    : 'bg-transparent'
                }`}
                style={selectedInterval === 'year' ? { 
                  backgroundImage: 'var(--color-gradient-gray)',
                  paddingLeft: '1.5rem',
                  paddingRight: '1.5rem',
                  paddingTop: 0,
                  paddingBottom: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center'
                } : {
                  paddingLeft: '1.5rem',
                  paddingRight: '1.5rem',
                  paddingTop: 0,
                  paddingBottom: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center'
                }}
              >
                <span 
                  className="font-sans text-[18px] font-semibold whitespace-nowrap"
                  style={{
                    color: selectedInterval === 'year' 
                      ? 'var(--color-deep-grey)' 
                      : 'var(--color-pebble-grey)',
                    opacity: selectedInterval === 'year' ? 1 : 0.6,
                    textAlign: 'center',
                    width: '100%',
                    display: 'block'
                  }}
                >
                  $39 per year
                </span>
              </button>
            </div>
          </div>

          {/* CheckoutButton with planPeriod prop - Clerk docs confirm this is supported */}
          <CheckoutButton 
            key={`checkout-${selectedInterval}-${Date.now()}`}
            planId={unlimitedPlanId}
            planPeriod={selectedInterval === 'year' ? 'annual' : 'month'}
          >
            <button
              type="button"
              data-outer-shadow
              className="btn-cta flex-1 group"
              style={{ 
                width: '100%', 
                marginTop: '1.5rem',
                cursor: 'pointer'
              }}
              tabIndex={3}
              onClick={(e) => {
                // Debug: Log when button is clicked
                console.log('[UpgradeCheckoutButton] Upgrade to Unlimited clicked', {
                  planId: unlimitedPlanId,
                  planPeriod: selectedInterval === 'year' ? 'annual' : 'month',
                  pathname,
                  isLoaded,
                  isSignedIn
                });
              }}
            >
              <span className="btn-cta__content">Upgrade to Unlimited</span>
              <div className="btn-cta__shadow" />
            </button>
          </CheckoutButton>

      {/* Go back to My Harvous button - secondary variant */}
      <a
        href="/"
        className="btn-cta btn--secondary flex-1 group"
        style={{ 
          width: '100%', 
          marginTop: '1rem',
          display: 'flex',
          textDecoration: 'none',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        tabIndex={4}
      >
        <span className="btn-cta__content">
          Go back to My Harvous
        </span>
        <div className="btn-cta__shadow" />
      </a>
    </div>
  );
}

/**
 * React component that handles Clerk billing checkout.
 * Uses CheckoutButton from @clerk/clerk-react/experimental.
 * React Islands are isolated, so this component provides its own ClerkProvider.
 */
export default function UpgradeCheckoutButton({ 
  className = '', 
  publishableKey = null,
  unlimitedPlanId = 'cplan_37aJweoipC2wY2Pa94o7zMdoIyw' // Default fallback
}: UpgradeCheckoutButtonProps) {
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

  // If no publishable key, render disabled button
  if (!effectiveKey) {
    return (
      <div className={className}>
        <button
          type="button"
          disabled
          className="btn-cta flex-1 group"
          style={{ 
            width: '100%', 
            marginTop: '1.5rem',
            opacity: 0.5,
            cursor: 'not-allowed'
          }}
        >
          <span className="btn-cta__content">Billing Unavailable</span>
          <div className="btn-cta__shadow" />
        </button>
      </div>
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
  const [pathname, setPathname] = useState<string>('');
  const [remountKey, setRemountKey] = useState<number>(Date.now());
  const [isVisible, setIsVisible] = useState<boolean>(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // Track pathname and update remount key on each navigation to force ClerkProvider remount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPathname(window.location.pathname);
      // Update remount key on initial load
      setRemountKey(Date.now());
    }

    const handlePageLoad = () => {
      if (typeof window !== 'undefined') {
        setPathname(window.location.pathname);
        // Force remount by updating key with new timestamp on each page load
        setRemountKey(Date.now());
      }
    };

    document.addEventListener('astro:page-load', handlePageLoad);
    return () => {
      document.removeEventListener('astro:page-load', handlePageLoad);
    };
  }, []);

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

  // Debug: Log ClerkProvider configuration
  useEffect(() => {
    if (effectiveKey) {
      console.log('[UpgradeCheckoutButton] ClerkProvider config:', {
        hasPublishableKey: !!clerkConfig.publishableKey,
        domain: clerkConfig.domain,
        afterSignInUrl: clerkConfig.afterSignInUrl,
        afterSignUpUrl: clerkConfig.afterSignUpUrl,
        pathname,
        planId: unlimitedPlanId
      });
    }
  }, [effectiveKey, clerkConfig, pathname, unlimitedPlanId]);

  return (
    <div ref={containerRef}>
      <ClerkProvider 
        key={`clerk-provider-${pathname}-${remountKey}`}
        publishableKey={clerkConfig.publishableKey!}
        domain={clerkConfig.domain}
        afterSignInUrl={clerkConfig.afterSignInUrl}
        afterSignUpUrl={clerkConfig.afterSignUpUrl}
      >
        <SignedIn>
          <UpgradeCheckoutButtonInner 
            key={`checkout-inner-${remountKey}`}
            className={className} 
            unlimitedPlanId={unlimitedPlanId} 
          />
        </SignedIn>
      </ClerkProvider>
    </div>
  );
}


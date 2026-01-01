import React, { useState, useEffect } from 'react';
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

  // Ensure we're on the client before rendering Clerk components
  useEffect(() => {
    setIsClient(true);
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
            >
              <span className="btn-cta__content">Continue & Pay</span>
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
  // If no publishable key, render disabled button
  if (!publishableKey) {
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
        publishableKey,
        domain: undefined,
        afterSignInUrl: undefined,
        afterSignUpUrl: undefined
      };
    }

    return {
      publishableKey,
      domain: window.location.hostname,
      afterSignInUrl: window.location.origin,
      afterSignUpUrl: window.location.origin
    };
  };

  const clerkConfig = getClerkConfig();

  return (
    <ClerkProvider 
      publishableKey={clerkConfig.publishableKey!}
      domain={clerkConfig.domain}
      afterSignInUrl={clerkConfig.afterSignInUrl}
      afterSignUpUrl={clerkConfig.afterSignUpUrl}
    >
      <SignedIn>
        <UpgradeCheckoutButtonInner className={className} unlimitedPlanId={unlimitedPlanId} />
      </SignedIn>
    </ClerkProvider>
  );
}


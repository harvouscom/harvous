import React, { useState } from 'react';
import { CheckoutButton } from '@clerk/clerk-react/experimental';
import { ClerkProvider, SignedIn } from '@clerk/clerk-react';
import { UNLIMITED_PLAN_ID } from '@/utils/subscription';

interface UpgradeCheckoutButtonProps {
  className?: string;
}

/**
 * React component that handles Clerk billing checkout.
 * Uses CheckoutButton from @clerk/clerk-react/experimental.
 * React Islands are isolated, so this component provides its own ClerkProvider.
 */
export default function UpgradeCheckoutButton({ className = '' }: UpgradeCheckoutButtonProps) {
  const [selectedInterval, setSelectedInterval] = useState<'month' | 'year'>('month');
  // In Astro, import.meta.env is available during SSR and client-side
  const publishableKey = import.meta.env.PUBLIC_CLERK_PUBLISHABLE_KEY || null;

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

  return (
    <ClerkProvider publishableKey={publishableKey}>
      <SignedIn>
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

          {/* CheckoutButton - Opens Clerk checkout drawer */}
          <CheckoutButton
            planId={UNLIMITED_PLAN_ID}
            planPeriod={selectedInterval === 'year' ? 'year' : 'month'}
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
      </SignedIn>
    </ClerkProvider>
  );
}


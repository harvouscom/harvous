// @ts-ignore - React hooks are available, this is a linter cache issue
import React, { useState, useEffect } from 'react';
import UpgradeCheckoutButton from './UpgradeCheckoutButton';
import { authenticatedFetch } from '@/utils/fetch-helpers';

interface UpgradePageContentProps {
  initialHasUnlimited: boolean;
  initialCurrentCount: number;
  initialLimit: number | null;
  publishableKey?: string | null;
  unlimitedPlanId?: string;
}

/**
 * Client-side component that manages the upgrade page content
 * and updates dynamically when subscription status changes
 */
export default function UpgradePageContent({
  initialHasUnlimited,
  initialCurrentCount,
  initialLimit,
  publishableKey,
  unlimitedPlanId,
}: UpgradePageContentProps) {
  const [hasUnlimited, setHasUnlimited] = useState(initialHasUnlimited);
  const [currentCount, setCurrentCount] = useState(initialCurrentCount);
  const [limit, setLimit] = useState(initialLimit);

  // Check subscription status via API (simplified)
  const checkStatus = async () => {
    try {
      const response = await authenticatedFetch('/api/subscription/status', {
        cache: 'no-store'
      });

      if (response.ok) {
        const data = await response.json();
        setHasUnlimited(data.hasUnlimited);
        setCurrentCount(data.currentCount || 0);
        setLimit(data.limit || null);
      }
    } catch (error) {
      console.error('[UpgradePageContent] Error checking status:', error);
    }
  };

  // Check on mount and listen for upgrade events
  useEffect(() => {
    // Check status on initial mount
    checkStatus();
    
    const handleUpgrade = () => checkStatus();
    window.addEventListener('subscriptionUpgraded', handleUpgrade);
    
    // Also check status on View Transitions (for subsequent visits)
    const handlePageLoad = () => {
      // Only check if we're on the upgrade page
      if (window.location.pathname === '/upgrade') {
        checkStatus();
      }
    };
    document.addEventListener('astro:page-load', handlePageLoad);
    
    return () => {
      window.removeEventListener('subscriptionUpgraded', handleUpgrade);
      document.removeEventListener('astro:page-load', handlePageLoad);
    };
  }, []);


  return (
    <>
      {hasUnlimited ? (
        <div className="upgrade-content">
          <div className="upgrade-content__header">
            <div className="upgrade-content__success-icon">✓</div>
            <h1 className="clerk-form-header-title">You have unlimited notes!</h1>
            <p className="clerk-form-header-subtitle">
              You're all set. Create as many notes as you need.
            </p>
          </div>
          <a 
            href="/" 
            className="primary-button" 
            style={{ width: '100%', display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: '1.5rem' }}
          >
            Go to Dashboard
          </a>
          <div className="text-sm text-[var(--color-pebble-grey)] italic text-center" style={{ marginTop: '1.5rem' }}>
            Thanks in advance for subscribing. -Derek, the founder
          </div>
        </div>
      ) : (
        <div className="upgrade-content">
          <div className="upgrade-content__header">
            <h1 className="clerk-form-header-title">You've used {currentCount.toLocaleString()} of {limit?.toLocaleString() || 1000} notes</h1>
            <p className="clerk-form-header-subtitle">
              To keep using Harvous past the 1,000 note limit upgrade to get unlimited notes. Either choose to pay monthly or yearly (save 50% at $3 per month).
            </p>
          </div>

          {/* Checkout button using Clerk's React CheckoutButton component */}
          <UpgradeCheckoutButton publishableKey={publishableKey} unlimitedPlanId={unlimitedPlanId} />
          <div className="text-sm text-[var(--color-pebble-grey)] italic text-center" style={{ marginTop: '1.5rem' }}>
            Thanks in advance for subscribing. -Derek, the founder
          </div>
        </div>
      )}
    </>
  );
}


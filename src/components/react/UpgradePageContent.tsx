// @ts-ignore - React hooks are available, this is a linter cache issue
import React, { useState, useEffect } from 'react';
import UpgradeCheckoutButton from './UpgradeCheckoutButton';

export interface LimitsInfo {
  tier: 'free' | 'unlimited';
  limits: {
    ownedSharedSpaces: { current: number; limit: number; remaining: number };
    membersPerSpace: { limit: number };
    joinableSpaces: { current: number; limit: number | null; remaining: number };
  };
}

interface UpgradePageContentProps {
  initialHasUnlimited: boolean;
  limitsInfo?: LimitsInfo | null;
  publishableKey?: string | null;
  unlimitedPlanId?: string;
}

/**
 * Client-side component that manages the upgrade page content
 * and updates dynamically when subscription status changes
 */
export default function UpgradePageContent({
  initialHasUnlimited,
  limitsInfo: initialLimitsInfo = null,
  publishableKey,
  unlimitedPlanId,
}: UpgradePageContentProps) {
  const [hasUnlimited, setHasUnlimited] = useState(initialHasUnlimited);
  const [limitsInfo, setLimitsInfo] = useState<LimitsInfo | null>(initialLimitsInfo ?? null);

  // Check subscription status via API (simplified)
  const checkStatus = async () => {
    try {
      const [subRes, limitsRes] = await Promise.all([
        fetch('/api/subscription/status', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/user/limits', { credentials: 'include', cache: 'no-store' })
      ]);

      if (subRes.ok) {
        const data = await subRes.json();
        setHasUnlimited(data.hasUnlimited);
      }
      if (limitsRes.ok) {
        const data = await limitsRes.json();
        if (data.limits) setLimitsInfo(data);
      }
    } catch (error) {
      console.error('[UpgradePageContent] Error checking status:', error);
    }
  };

  // Check on mount and listen for upgrade / sharing events
  useEffect(() => {
    // Check status on initial mount
    checkStatus();

    const handleUpgrade = () => checkStatus();
    window.addEventListener('subscriptionUpgraded', handleUpgrade);

    // Also check status on View Transitions (for subsequent visits)
    const handlePageLoad = () => {
      if (window.location.pathname === '/upgrade') {
        checkStatus();
      }
    };
    document.addEventListener('app:route-change', handlePageLoad);

    return () => {
      window.removeEventListener('subscriptionUpgraded', handleUpgrade);
      document.removeEventListener('app:route-change', handlePageLoad);
    };
  }, []);

  const safeLimitsInfo = limitsInfo ?? null;

  return (
    <>
      {hasUnlimited ? (
        <div className="upgrade-content">
          <div className="upgrade-content__header">
            <div className="upgrade-content__success-icon">✓</div>
            <h1 className="clerk-form-header-title">You&apos;re on Premium</h1>
            <p className="clerk-form-header-subtitle">
              You have full sharing limits and premium features. Notes are always unlimited on every plan.
            </p>
            {safeLimitsInfo && (
              <ul className="upgrade-content__space-limits" style={{ marginTop: '0.75rem', paddingLeft: '1.25rem', textAlign: 'left', fontSize: '0.95rem', color: 'var(--color-pebble-grey)', listStyle: 'disc' }}>
                <li>Unlimited notes (all plans)</li>
              </ul>
            )}
          </div>
          <a 
            href="/" 
            className="primary-button" 
            style={{ width: '100%', display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: '1.5rem' }}
          >
            Go to Dashboard
          </a>
        </div>
      ) : (
        <div className="upgrade-content">
          <div className="upgrade-content__header">
            <h1 className="clerk-form-header-title">You&apos;re on the free plan</h1>
            <p className="clerk-form-header-subtitle" style={{ textWrap: 'balance' }}>
              Notes are unlimited for everyone. Upgrade for premium sharing: higher limits on owned shared spaces and collaboration.
            </p>
            {safeLimitsInfo && safeLimitsInfo.tier === 'free' && (
              <ul className="upgrade-content__space-limits" style={{ marginTop: '0.75rem', paddingLeft: '1.25rem', textAlign: 'left', fontSize: '0.95rem', color: 'var(--color-pebble-grey)', listStyle: 'disc' }}>
                <li>
                  {safeLimitsInfo.limits.ownedSharedSpaces.remaining === Infinity
                    ? 'Shared spaces: unlimited'
                    : `${safeLimitsInfo.limits.ownedSharedSpaces.current} of ${safeLimitsInfo.limits.ownedSharedSpaces.limit} owned shared spaces used`}
                </li>
              </ul>
            )}
          </div>

          {/* Checkout button using Clerk's React CheckoutButton component */}
          <UpgradeCheckoutButton publishableKey={publishableKey} unlimitedPlanId={unlimitedPlanId} />
        </div>
      )}
    </>
  );
}


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
  initialCurrentCount: number;
  initialLimit: number | null;
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
  initialCurrentCount,
  initialLimit,
  limitsInfo: initialLimitsInfo = null,
  publishableKey,
  unlimitedPlanId,
}: UpgradePageContentProps) {
  const [hasUnlimited, setHasUnlimited] = useState(initialHasUnlimited);
  const [currentCount, setCurrentCount] = useState(initialCurrentCount);
  const [limit, setLimit] = useState(initialLimit);
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
        setCurrentCount(data.currentCount || 0);
        setLimit(data.limit || null);
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
    document.addEventListener('astro:page-load', handlePageLoad);

    return () => {
      window.removeEventListener('subscriptionUpgraded', handleUpgrade);
      document.removeEventListener('astro:page-load', handlePageLoad);
    };
  }, []);

  const safeLimitsInfo = limitsInfo ?? null;

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
            {safeLimitsInfo && (
              <ul className="upgrade-content__space-limits" style={{ marginTop: '0.75rem', paddingLeft: '1.25rem', textAlign: 'left', fontSize: '0.95rem', color: 'var(--color-pebble-grey)', listStyle: 'disc' }}>
                <li>Unlimited notes</li>
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
          <div className="text-sm text-[var(--color-pebble-grey)] italic text-center" style={{ marginTop: '1.5rem' }}>
            Thanks in advance for subscribing. -Derek, the founder
          </div>
        </div>
      ) : (
        <div className="upgrade-content">
          <div className="upgrade-content__header">
            <h1 className="clerk-form-header-title">You're on the free plan</h1>
            <p className="clerk-form-header-subtitle" style={{ textWrap: 'balance' }}>
              Get unlimited notes. Pay monthly or yearly—save 50% at $3 per month.
            </p>
            {safeLimitsInfo && (() => {
              const limitRed = 'var(--color-red, #dc2626)';
              const notesAtLimit = (limit ?? 200) - currentCount <= 100;
              if (!notesAtLimit) return null;
              return (
                <div className="upgrade-content__limits flex flex-col" style={{ gap: 12, marginTop: '1rem', marginBottom: 0 }}>
                  <div
                    className="upgrade-content__limit-row bg-white rounded-xl p-3 flex items-center gap-3"
                    style={{
                      border: '1px solid',
                      borderColor: limitRed
                    }}
                  >
                    <svg className="w-4 h-4 flex-shrink-0 fill-current" style={{ color: limitRed }} viewBox="0 0 384 512" aria-hidden="true">
                      <path d="M0 48V487.7C0 501.1 10.9 512 24.3 512c5 0 9.9-1.5 14-4.4L192 400 345.7 507.6c4.1 2.9 9 4.4 14 4.4c13.4 0 24.3-10.9 24.3-24.3V48c0-26.5-21.5-48-48-48H48C21.5 0 0 21.5 0 48z" />
                    </svg>
                    <div className="min-w-0 flex-1 flex justify-between items-center text-left">
                      <span className="text-base font-semibold" style={{ color: limitRed }}>
                        {currentCount.toLocaleString()} of {(limit ?? 200).toLocaleString()} notes
                      </span>
                      {!hasUnlimited && (
                        <span className="text-xs flex-shrink-0" style={{ color: 'var(--color-pebble-grey)' }}>
                          Upgrade for unlimited
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
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


// @ts-ignore - React hooks are available, this is a linter cache issue
import React, { useState, useEffect } from 'react';
import UpgradeCheckoutButton from './UpgradeCheckoutButton';
import Icon from './Icon';

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
  const [limitsInfo, setLimitsInfo] = useState<LimitsInfo | null>(initialLimitsInfo);

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
            {limitsInfo && (
              <ul className="upgrade-content__space-limits" style={{ marginTop: '0.75rem', paddingLeft: '1.25rem', textAlign: 'left', fontSize: '0.95rem', color: 'var(--color-pebble-grey)', listStyle: 'disc' }}>
                <li>Unlimited notes</li>
                <li>{limitsInfo.limits.ownedSharedSpaces.limit} spaces shared</li>
                <li>{limitsInfo.limits.membersPerSpace.limit} people per space</li>
                <li>Join unlimited spaces</li>
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
              Get unlimited notes, bigger shared spaces (up to 100 people each), and the ability to join unlimited spaces. Pay monthly or yearly—save 50% at $3 per month.
            </p>
            {limitsInfo && (() => {
              const limitRed = 'var(--color-red, #dc2626)';
              const notesAtLimit = (limit ?? 200) - currentCount <= 100;
              const sharedAtLimit = limitsInfo.limits.ownedSharedSpaces.remaining <= 0;
              const joinedAtLimit = limitsInfo.limits.joinableSpaces.limit != null && limitsInfo.limits.joinableSpaces.remaining <= 1;
              return (
                <div className="flex flex-col" style={{ gap: 12, marginTop: '1rem', marginBottom: 0 }}>
                  {/* Notes - horizontal, one line, left-aligned */}
                  <div
                    className="bg-white rounded-xl p-3 flex items-center gap-3"
                    style={{
                      border: '1px solid',
                      borderColor: notesAtLimit ? limitRed : 'var(--color-fog-white)'
                    }}
                  >
                    <svg className="w-4 h-4 flex-shrink-0 fill-current" style={{ color: notesAtLimit ? limitRed : 'var(--color-deep-grey)' }} viewBox="0 0 384 512" aria-hidden="true">
                      <path d="M0 48V487.7C0 501.1 10.9 512 24.3 512c5 0 9.9-1.5 14-4.4L192 400 345.7 507.6c4.1 2.9 9 4.4 14 4.4c13.4 0 24.3-10.9 24.3-24.3V48c0-26.5-21.5-48-48-48H48C21.5 0 0 21.5 0 48z" />
                    </svg>
                    <div className="min-w-0 flex-1 flex justify-between items-center text-left">
                      <span className="text-base font-semibold" style={{ color: notesAtLimit ? limitRed : 'var(--color-deep-grey)' }}>
                        {currentCount.toLocaleString()} of {(limit ?? 200).toLocaleString()} notes
                      </span>
                      {!hasUnlimited && (
                        <span className="text-xs flex-shrink-0" style={{ color: 'var(--color-pebble-grey)' }}>
                          Upgrade for unlimited
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Spaces shared - horizontal, one line, left-aligned */}
                  <div
                    className="bg-white rounded-xl p-3 flex items-center gap-3"
                    style={{
                      border: '1px solid',
                      borderColor: sharedAtLimit ? limitRed : 'var(--color-fog-white)'
                    }}
                  >
                    <svg className="w-4 h-4 flex-shrink-0 fill-current" style={{ color: sharedAtLimit ? limitRed : 'var(--color-deep-grey)' }} viewBox="0 0 512 512" aria-hidden="true">
                      <path d="M234.5 5.7c13.9-5 29.1-5 43.1 0l192 68.6C495 83.4 512 107.5 512 134.6l0 242.9c0 27-17 51.2-42.5 60.3l-192 68.6c-13.9 5-29.1 5-43.1 0l-192-68.6C17 428.6 0 404.5 0 377.4L0 134.6c0-27 17-51.2 42.5-60.3l192-68.6zM256 66L82.3 128 256 190l173.7-62L256 66zm32 368.6l160-57.1 0-188L288 246.6l0 188z" />
                    </svg>
                    <div className="min-w-0 flex-1 flex justify-between items-center text-left">
                      <span className="text-base font-semibold" style={{ color: sharedAtLimit ? limitRed : 'var(--color-deep-grey)' }}>
                        {limitsInfo.limits.ownedSharedSpaces.current} of {limitsInfo.limits.ownedSharedSpaces.limit} spaces shared
                      </span>
                      {!hasUnlimited && (
                        <span className="text-xs flex-shrink-0" style={{ color: 'var(--color-pebble-grey)' }}>
                          Upgrade for 3 spaces
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Spaces joined - horizontal, one line, left-aligned */}
                  <div
                    className="bg-white rounded-xl p-3 flex items-center gap-3"
                    style={{
                      border: '1px solid',
                      borderColor: joinedAtLimit ? limitRed : 'var(--color-fog-white)'
                    }}
                  >
                    <svg className="w-4 h-4 flex-shrink-0 fill-current" style={{ color: joinedAtLimit ? limitRed : 'var(--color-deep-grey)' }} viewBox="0 0 448 512" aria-hidden="true">
                      <path d="M64 32C28.7 32 0 60.7 0 96L0 416c0 35.3 28.7 64 64 64l320 0c35.3 0 64-28.7 64-64l0-320c0-35.3-28.7-64-64-64L64 32zM337 209L209 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L303 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z" />
                    </svg>
                    <div className="min-w-0 flex-1 flex justify-between items-center text-left">
                      <span className="text-base font-semibold" style={{ color: joinedAtLimit ? limitRed : 'var(--color-deep-grey)' }}>
                        {limitsInfo.limits.joinableSpaces.limit == null
                          ? `${limitsInfo.limits.joinableSpaces.current} (unlimited) spaces joined`
                          : `${limitsInfo.limits.joinableSpaces.current} of ${limitsInfo.limits.joinableSpaces.limit} spaces joined`}
                      </span>
                      {!hasUnlimited && (
                        <span className="text-xs flex-shrink-0" style={{ color: 'var(--color-pebble-grey)' }}>
                          Upgrade for unlimited
                        </span>
                      )}
                    </div>
                  </div>
                  {/* People per space - horizontal, one line, left-aligned */}
                  <div
                    className="bg-white rounded-xl p-3 flex items-center gap-3"
                    style={{
                      border: '1px solid',
                      borderColor: 'var(--color-fog-white)'
                    }}
                  >
                    <Icon name="user-group" size={16} className="flex-shrink-0" style={{ color: 'var(--color-deep-grey)' }} />
                    <div className="min-w-0 flex-1 flex justify-between items-center text-left">
                      <span className="text-base font-semibold" style={{ color: 'var(--color-deep-grey)' }}>
                        {limitsInfo.limits.membersPerSpace.limit} people per space
                      </span>
                      {!hasUnlimited && (
                        <span className="text-xs flex-shrink-0" style={{ color: 'var(--color-pebble-grey)' }}>
                          Upgrade for 100 people
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


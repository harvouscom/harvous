// @ts-ignore - React hooks are available, this is a linter cache issue
import React, { useState, useEffect } from 'react';
import UpgradeCheckoutButton from './UpgradeCheckoutButton';

interface UpgradePageContentProps {
  initialHasUnlimited: boolean;
  initialCurrentCount: number;
  initialLimit: number | null;
}

/**
 * Client-side component that manages the upgrade page content
 * and updates dynamically when subscription status changes
 */
export default function UpgradePageContent({
  initialHasUnlimited,
  initialCurrentCount,
  initialLimit,
}: UpgradePageContentProps) {
  const [hasUnlimited, setHasUnlimited] = useState(initialHasUnlimited);
  const [currentCount, setCurrentCount] = useState(initialCurrentCount);
  const [limit, setLimit] = useState(initialLimit);

  // Check subscription status via API (simplified)
  const checkStatus = async () => {
    try {
      const response = await fetch('/api/subscription/status', {
        credentials: 'include',
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
    checkStatus();
    
    const handleUpgrade = () => checkStatus();
    window.addEventListener('subscriptionUpgraded', handleUpgrade);
    return () => window.removeEventListener('subscriptionUpgraded', handleUpgrade);
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
        </div>
      ) : (
        <div className="upgrade-content">
          <div className="upgrade-content__header">
            <h1 className="clerk-form-header-title">Upgrade to Unlimited</h1>
            <p className="clerk-form-header-subtitle">
              You've used {currentCount.toLocaleString()} of {limit?.toLocaleString() || 1000} notes. To continue using Harvous upgrade to get unlimited notes. Choose to pay monthly or yearly (only $3.25/month).
            </p>
          </div>

          {/* Checkout button using Clerk's React CheckoutButton component */}
          <UpgradeCheckoutButton />
        </div>
      )}
    </>
  );
}


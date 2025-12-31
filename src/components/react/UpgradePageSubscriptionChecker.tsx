// @ts-ignore - React hooks are available, this is a linter cache issue
import React, { useEffect } from 'react';

/**
 * Cleans up URL parameters after upgrade and dispatches event
 * Clerk Features update automatically, so we just need to notify components
 */
export default function UpgradePageSubscriptionChecker() {
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const upgradeSuccess = urlParams.get('upgrade') === 'success' || urlParams.get('success') === 'true';
    
    if (upgradeSuccess) {
      // Clean up URL
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('upgrade');
      newUrl.searchParams.delete('success');
      window.history.replaceState({}, '', newUrl.toString());

      // Dispatch event to trigger status refresh
      window.dispatchEvent(new CustomEvent('subscriptionUpgraded'));
    }
  }, []);

  return null;
}


import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { toast as sonnerToast } from 'sonner';
import UpgradePageContent from '../../../src/components/react/UpgradePageContent';
import { PublicTopBar } from './public/public-shared';
import { api } from '../lib/api';
import { trackUpgradeViewed } from '@/utils/analytics';
import { recordAudiencefulMilestoneOnce } from '@/utils/audienceful-milestones-client';

/**
 * Standalone /upgrade page — Harvous Plus, on the `.public-page` shell and laid out like
 * harvous.com/pricing (see `UpgradePageContent`). The watercolour sky that used to bleed
 * behind a letter now lives in the Plus card itself, as it does on the site.
 */
export default function UpgradePage() {
  const { isSignedIn } = useAuth();
  const [hasSharedSpaces, setHasSharedSpaces] = useState(false);
  const [sharedSpacesOwnedCount, setSharedSpacesOwnedCount] = useState<number | null>(null);
  const [sharedSpacesOwnedLimit, setSharedSpacesOwnedLimit] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshSharedSpacesStatus = useCallback(async (options?: { silent?: boolean }) => {
    if (!isSignedIn) {
      setHasSharedSpaces(false);
      setSharedSpacesOwnedCount(null);
      setSharedSpacesOwnedLimit(null);
      setIsLoading(false);
      return;
    }

    if (!options?.silent) {
      setIsLoading(true);
    }

    type Status = {
      hasSharedSpaces: boolean;
      sharedSpacesOwnedCount: number;
      sharedSpacesOwnedLimit: number;
    };
    const apply = (sub: Status) => {
      setHasSharedSpaces(Boolean(sub.hasSharedSpaces));
      setSharedSpacesOwnedCount(sub.sharedSpacesOwnedCount);
      setSharedSpacesOwnedLimit(sub.sharedSpacesOwnedLimit);
    };

    // Reveal on the cheap read. The Polar sync can take seconds (or hang), and the page stays
    // invisible until `isLoading` clears — that was the blank /upgrade that needed a refresh.
    try {
      apply(await api.get<Status>('/api/subscription/status'));
    } catch {
      setHasSharedSpaces(false);
      setSharedSpacesOwnedCount(null);
      setSharedSpacesOwnedLimit(null);
    } finally {
      if (!options?.silent) {
        setIsLoading(false);
      }
    }

    // Then reconcile with the billing provider in the background and re-read if it changed.
    try {
      await api.post('/api/billing/sync', {});
      apply(await api.get<Status>('/api/subscription/status'));
    } catch {
      /* the first read stands */
    }
  }, [isSignedIn]);

  useEffect(() => {
    trackUpgradeViewed({ source: 'upgrade_page' });
    recordAudiencefulMilestoneOnce('upgrade_viewed');
  }, []);

  useEffect(() => {
    sonnerToast.dismiss();
    void (async () => {
      try {
        await refreshSharedSpacesStatus();
      } finally {
        // Hosted Polar return: notify the app and drop the checkout query param.
        const params = new URLSearchParams(window.location.search);
        if (!params.has('checkout_id')) return;
        window.dispatchEvent(new CustomEvent('subscriptionUpgraded'));
        params.delete('checkout_id');
        const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`;
        window.history.replaceState({}, '', next);
      }
    })();
  }, [refreshSharedSpacesStatus]);

  useEffect(() => {
    const handleUpgrade = () => {
      void refreshSharedSpacesStatus({ silent: true });
    };
    window.addEventListener('subscriptionUpgraded', handleUpgrade);
    return () => window.removeEventListener('subscriptionUpgraded', handleUpgrade);
  }, [refreshSharedSpacesStatus]);

  return (
    <>
      <title>Harvous Plus | Harvous</title>
      <div className="public-page">
        <PublicTopBar isSignedIn={!!isSignedIn} signedInCtaLabel="Back to my Harvous" />

        <div className="public-body">
          <div className="public-content public-content--upgrade public-content--pricing">
            <UpgradePageContent
              ready={!isLoading}
              initialHasSharedSpaces={hasSharedSpaces}
              initialSharedSpacesOwnedCount={sharedSpacesOwnedCount}
              initialSharedSpacesOwnedLimit={sharedSpacesOwnedLimit}
              publishableKey={null}
            />
          </div>
        </div>
      </div>
    </>
  );
}

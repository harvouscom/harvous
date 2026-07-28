import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { toast as sonnerToast } from 'sonner';
import UpgradePageContent from '../../../src/components/react/UpgradePageContent';
import { PublicTopBar } from './public/public-shared';
import { loadAuthHeroImage } from '../utils/random-hero-image';
import { api } from '../lib/api';
import { trackUpgradeViewed } from '@/utils/analytics';
import { recordAudiencefulMilestoneOnce } from '@/utils/audienceful-milestones-client';

// Fixed hero (not randomized) — blue-field atmosphere made for Harvous Plus,
// sibling to the auth-hero pool (various blues, airy center for the letter).
const UPGRADE_HERO_IMAGE = '/images/auth-hero/ai_bg_plus.webp';

/**
 * Standalone /upgrade page — Harvous Plus (Shared Spaces hosting), built on
 * the `.public-page` shell (shared note / join-space / sign-in aesthetic),
 * with the same auth hero image bleeding behind the top of the card.
 */
export default function UpgradePage() {
  const { isSignedIn } = useAuth();
  const [hasSharedSpaces, setHasSharedSpaces] = useState(false);
  const [sharedSpacesOwnedCount, setSharedSpacesOwnedCount] = useState<number | null>(null);
  const [sharedSpacesOwnedLimit, setSharedSpacesOwnedLimit] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isHeroReady, setIsHeroReady] = useState(false);

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

    try {
      const sync = await api.post<{ hasSharedSpaces: boolean }>('/api/billing/sync', {});
      setHasSharedSpaces(Boolean(sync.hasSharedSpaces));
      const sub = await api.get<{
        hasSharedSpaces: boolean;
        sharedSpacesOwnedCount: number;
        sharedSpacesOwnedLimit: number;
      }>('/api/subscription/status');
      setHasSharedSpaces(Boolean(sub.hasSharedSpaces));
      setSharedSpacesOwnedCount(sub.sharedSpacesOwnedCount);
      setSharedSpacesOwnedLimit(sub.sharedSpacesOwnedLimit);
    } catch {
      try {
        const sub = await api.get<{
          hasSharedSpaces: boolean;
          sharedSpacesOwnedCount: number;
          sharedSpacesOwnedLimit: number;
        }>('/api/subscription/status');
        setHasSharedSpaces(Boolean(sub.hasSharedSpaces));
        setSharedSpacesOwnedCount(sub.sharedSpacesOwnedCount);
        setSharedSpacesOwnedLimit(sub.sharedSpacesOwnedLimit);
      } catch {
        setHasSharedSpaces(false);
        setSharedSpacesOwnedCount(null);
        setSharedSpacesOwnedLimit(null);
      }
    } finally {
      if (!options?.silent) {
        setIsLoading(false);
      }
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

  useEffect(() => {
    let cancelled = false;
    loadAuthHeroImage(UPGRADE_HERO_IMAGE)
      .then(() => !cancelled && setIsHeroReady(true))
      .catch(() => !cancelled && setIsHeroReady(true));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <title>Harvous Plus | Harvous</title>
      <div className="public-page">
        <PublicTopBar isSignedIn={!!isSignedIn} signedInCtaLabel="Back to my Harvous" />

        <div className="public-body">
          <div className="public-content public-content--upgrade">
            <div className="upgrade-hero-section" aria-hidden>
              <div
                className={`upgrade-hero-bg${isHeroReady ? ' upgrade-hero-bg--ready' : ''}`}
                style={isHeroReady ? { backgroundImage: `url(${UPGRADE_HERO_IMAGE})` } : undefined}
              />
            </div>
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

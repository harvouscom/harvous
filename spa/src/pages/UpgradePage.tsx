import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { toast as sonnerToast } from 'sonner';
import UpgradePageContent from '../../../src/components/react/UpgradePageContent';
import SubtleContentMount from '@/components/react/SubtleContentMount';
import { PublicTopBar } from './public/public-shared';
import { loadAuthHeroImage } from '../utils/random-hero-image';
import { api } from '../lib/api';

// Fixed hero (not randomized) — this is the "Group study" image used for the
// Shared Spaces use case on harvous.com, so the Shared Spaces upgrade always
// shows the same art rather than a random auth hero.
const UPGRADE_HERO_IMAGE = '/images/auth-hero/ai_bg_045.webp';

/**
 * Standalone /addon page — single-purpose Shared Spaces upgrade, built on
 * the `.public-page` shell (shared note / join-space / sign-in aesthetic),
 * with the same auth hero image bleeding behind the top of the card.
 */
export default function UpgradePage() {
  const { isSignedIn } = useAuth();
  const [hasSharedSpaces, setHasSharedSpaces] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isHeroReady, setIsHeroReady] = useState(false);

  const refreshSharedSpacesStatus = useCallback(async (options?: { silent?: boolean }) => {
    if (!isSignedIn) {
      setHasSharedSpaces(false);
      setIsLoading(false);
      return;
    }

    if (!options?.silent) {
      setIsLoading(true);
    }

    try {
      const sync = await api.post<{ hasSharedSpaces: boolean }>('/api/billing/sync-shared-spaces', {});
      setHasSharedSpaces(Boolean(sync.hasSharedSpaces));
    } catch {
      try {
        const sub = await api.get<{ hasSharedSpaces: boolean }>('/api/subscription/status');
        setHasSharedSpaces(Boolean(sub.hasSharedSpaces));
      } catch {
        setHasSharedSpaces(false);
      }
    } finally {
      if (!options?.silent) {
        setIsLoading(false);
      }
    }
  }, [isSignedIn]);

  useEffect(() => {
    sonnerToast.dismiss();
    void refreshSharedSpacesStatus();
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
      <title>Shared Spaces | Harvous</title>
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
            {isLoading ? (
              <div className="page-loading" />
            ) : (
              <SubtleContentMount variant="fade">
                <UpgradePageContent
                  initialHasSharedSpaces={hasSharedSpaces}
                  publishableKey={null}
                  sharedSpacesPlanId={import.meta.env.VITE_CLERK_SHARED_SPACES_PLAN_ID ?? ''}
                />
              </SubtleContentMount>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

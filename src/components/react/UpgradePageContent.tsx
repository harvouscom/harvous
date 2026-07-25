// @ts-ignore - React hooks are available, this is a linter cache issue
import React, { useMemo, useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import Icon from './Icon';
import {
  getSharedSpacesAddonFeatureBullets,
  OWNED_SHARED_SPACES_ADDON_LIMIT,
} from '@/lib/shared-spaces-limits';
import {
  formatPlanPrice,
  planFor,
  PLUS_COMING_SOON_FEATURE_BULLETS,
} from '@/lib/billing-plans';
import UpgradeCheckoutButton from './UpgradeCheckoutButton';
import { prototypeHref } from '@/lib/prototype-path';

interface SubscriptionStatusSnapshot {
  hasSharedSpaces: boolean;
  sharedSpacesOwnedCount: number;
  sharedSpacesOwnedLimit: number;
}

type PaperPhase = 'stacked' | 'fanned';

interface UpgradePageContentProps {
  initialHasSharedSpaces: boolean;
  initialSharedSpacesOwnedCount?: number | null;
  initialSharedSpacesOwnedLimit?: number | null;
  publishableKey?: string | null;
  /**
   * When false, paper stays stacked and letter copy stays hidden (same footprint).
   * When true, leaves fan out (harvous.com / founder-letter style) and content fades in.
   */
  ready?: boolean;
  /** Dev design gallery — bypasses Clerk for static previews. */
  designPreview?: { signedIn: boolean; ownedCount?: number; ownedLimit?: number };
}

const monthPlan = planFor('plus', 'month');
const yearPlan = planFor('plus', 'year');
const PLAN_NAME = yearPlan?.name ?? monthPlan?.name ?? 'Harvous Plus';
const PRICE_MONTHLY_LABEL = monthPlan ? `${formatPlanPrice(monthPlan)} per month` : '';
const PRICE_ANNUAL_LABEL = yearPlan ? `${formatPlanPrice(yearPlan)} per year` : '';

const ACTIVE_TAGLINE = `${PLAN_NAME} is active on your account. Here's a reminder of what it includes:`;
const PURCHASE_TAGLINE = 'For when Bible study needs more than a private notebook.';

type FoundingAvailability = {
  total: number;
  claimed: number;
  remaining: number;
  available: boolean;
};

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Single-purpose Shared Spaces upgrade card — paper-stack letter layout
 * matching shared-note / sign-in pages. Plan summary also lives in
 * Settings > Plan.
 */
export default function UpgradePageContent({
  initialHasSharedSpaces,
  initialSharedSpacesOwnedCount = null,
  initialSharedSpacesOwnedLimit = null,
  publishableKey,
  ready = true,
  designPreview,
}: UpgradePageContentProps) {
  const { isSignedIn: clerkSignedIn } = useAuth();
  const isSignedIn = designPreview?.signedIn ?? clerkSignedIn;
  const [hasSharedSpaces, setHasSharedSpaces] = useState(initialHasSharedSpaces);
  const [sharedSpacesOwnedCount, setSharedSpacesOwnedCount] = useState<number | null>(
    designPreview ? (designPreview.ownedCount ?? 0) : initialSharedSpacesOwnedCount,
  );
  const [sharedSpacesOwnedLimit, setSharedSpacesOwnedLimit] = useState<number | null>(
    designPreview
      ? (designPreview.ownedLimit ?? OWNED_SHARED_SPACES_ADDON_LIMIT)
      : initialSharedSpacesOwnedLimit,
  );
  const [paperPhase, setPaperPhase] = useState<PaperPhase>('stacked');
  const [founding, setFounding] = useState<FoundingAvailability | null>(null);
  const showActiveCopy = hasSharedSpaces;
  const revealed = ready && paperPhase === 'fanned';
  const purchaseTagline =
    !showActiveCopy && founding?.available && founding.remaining > 0
      ? `${PURCHASE_TAGLINE} Only ${founding.remaining} founding spots left.`
      : PURCHASE_TAGLINE;

  const featureBullets = useMemo(
    () =>
      getSharedSpacesAddonFeatureBullets({
        hasAddOn: showActiveCopy,
        ownedCount: showActiveCopy ? sharedSpacesOwnedCount : null,
        ownedLimit: sharedSpacesOwnedLimit ?? OWNED_SHARED_SPACES_ADDON_LIMIT,
      }),
    [showActiveCopy, sharedSpacesOwnedCount, sharedSpacesOwnedLimit],
  );

  useEffect(() => {
    if (designPreview) return;
    setHasSharedSpaces(initialHasSharedSpaces);
    setSharedSpacesOwnedCount(initialSharedSpacesOwnedCount);
    setSharedSpacesOwnedLimit(initialSharedSpacesOwnedLimit);
  }, [
    designPreview,
    initialHasSharedSpaces,
    initialSharedSpacesOwnedCount,
    initialSharedSpacesOwnedLimit,
  ]);

  useEffect(() => {
    if (!ready) {
      setPaperPhase('stacked');
      return;
    }

    if (prefersReducedMotion()) {
      setPaperPhase('fanned');
      return;
    }

    setPaperPhase('stacked');
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setPaperPhase('fanned'));
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [ready]);

  const applySubscriptionStatus = (data: Partial<SubscriptionStatusSnapshot>) => {
    if (typeof data.hasSharedSpaces === 'boolean') {
      setHasSharedSpaces(data.hasSharedSpaces);
    }
    if (typeof data.sharedSpacesOwnedCount === 'number') {
      setSharedSpacesOwnedCount(data.sharedSpacesOwnedCount);
    }
    if (typeof data.sharedSpacesOwnedLimit === 'number') {
      setSharedSpacesOwnedLimit(data.sharedSpacesOwnedLimit);
    }
  };

  const checkStatus = async () => {
    try {
      const subRes = await fetch('/api/subscription/status', { credentials: 'include', cache: 'no-store' });

      if (subRes.ok) {
        const data = (await subRes.json()) as Partial<SubscriptionStatusSnapshot>;
        applySubscriptionStatus(data);
      }
    } catch (error) {
      console.error('[UpgradePageContent] Error checking status:', error);
    }
  };

  useEffect(() => {
    if (designPreview) return;
    checkStatus();

    const handleUpgrade = () => checkStatus();
    window.addEventListener('subscriptionUpgraded', handleUpgrade);
    window.addEventListener('spaceCreated', handleUpgrade);

    const handlePageLoad = () => {
      if (window.location.pathname === '/upgrade' || window.location.pathname === '/addon') {
        checkStatus();
      }
    };
    document.addEventListener('app:route-change', handlePageLoad);

    return () => {
      window.removeEventListener('subscriptionUpgraded', handleUpgrade);
      window.removeEventListener('spaceCreated', handleUpgrade);
      document.removeEventListener('app:route-change', handlePageLoad);
    };
  }, [designPreview]);

  useEffect(() => {
    if (designPreview || showActiveCopy) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/billing/plans', { credentials: 'include', cache: 'no-store' });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { founding?: FoundingAvailability };
        if (!cancelled && data.founding) setFounding(data.founding);
      } catch {
        /* tagline stays without founding scarcity */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [designPreview, showActiveCopy]);

  const redirectUrl =
    typeof window !== 'undefined' ? encodeURIComponent(window.location.href) : encodeURIComponent('/upgrade');
  const signInHref = `/sign-in?redirect_url=${redirectUrl}`;

  return (
    <>
      <div
        className={[
          'public-paper-stack',
          'public-paper-stack--upgrade',
          paperPhase === 'fanned' ? 'public-paper-stack--fanned' : 'public-paper-stack--stacked',
        ].join(' ')}
      >
        <div className="public-paper-stack__leaf public-paper-stack__leaf--back" aria-hidden />
        <div className="public-paper-stack__leaf public-paper-stack__leaf--mid" aria-hidden />
        <article className="public-addon-letter" aria-busy={!revealed}>
          <div
            className={[
              'public-addon-letter__reveal',
              revealed ? 'public-addon-letter__reveal--in' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div className="public-addon-letter__header">
              <span className="public-addon-letter__icon public-addon-letter__icon--plus" aria-hidden>
                <Icon name="plus" size={22} />
              </span>
              <h1 className="public-addon-letter__title">{PLAN_NAME}</h1>
              <p className="public-addon-letter__tagline">
                {showActiveCopy ? ACTIVE_TAGLINE : purchaseTagline}
              </p>
            </div>

            <ul className="public-addon-letter__features" role="list">
              {featureBullets.map((feature) => (
                <li key={feature}>
                  <span className="public-addon-letter__check" aria-hidden="true">
                    <Icon name="check" size={10} />
                  </span>
                  <span className="public-addon-letter__feature-text">{feature}</span>
                </li>
              ))}
            </ul>

            <p className="public-addon-letter__coming-label">Coming soon</p>
            <ul className="public-addon-letter__features public-addon-letter__features--coming" role="list">
              {PLUS_COMING_SOON_FEATURE_BULLETS.map((feature) => (
                <li key={feature}>
                  <span className="public-addon-letter__check" aria-hidden="true">
                    <Icon name="check" size={10} />
                  </span>
                  <span className="public-addon-letter__feature-text">{feature}</span>
                </li>
              ))}
            </ul>

            <div className="public-addon-letter__cta">
              {hasSharedSpaces ? (
                <>
                  <a href="/" className="upgrade-secondary-btn">
                    Back to My Harvous
                  </a>
                  <a href={prototypeHref('settings/addons')} className="upgrade-secondary-btn">
                    Manage Subscription
                  </a>
                </>
              ) : isSignedIn ? (
                <UpgradeCheckoutButton
                  className="upgrade-checkout"
                  publishableKey={publishableKey}
                  ctaLabel={`Get ${PLAN_NAME}`}
                  priceMonthlyLabel={PRICE_MONTHLY_LABEL}
                  priceAnnualLabel={PRICE_ANNUAL_LABEL}
                />
              ) : (
                <a href={signInHref} className="upgrade-secondary-btn">
                  Sign in to add
                </a>
              )}
            </div>
          </div>
        </article>
      </div>
    </>
  );
}

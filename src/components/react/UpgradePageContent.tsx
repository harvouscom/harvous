// @ts-ignore - React hooks are available, this is a linter cache issue
import React, { useMemo, useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import {
  getSharedSpacesAddonFeatureBullets,
  OWNED_SHARED_SPACES_ADDON_LIMIT,
} from '@/lib/shared-spaces-limits';
import {
  formatPlanPrice,
  FREE_PLAN_FEATURE_BULLETS,
  FREE_PLAN_NAME,
  FREE_PLAN_TAGLINE,
  planFor,
  PLUS_FOUNDING_BADGE,
  PLUS_PLAN_TAGLINE,
} from '@/lib/billing-plans';
import UpgradeCheckoutButton from './UpgradeCheckoutButton';
import { prototypeHref } from '@/lib/prototype-path';
import { writePendingAuthRedirect } from '@/lib/pending-auth-redirect';
import PlanCard, { planCardPrice } from '../../../spa/src/pages/prototype/settings/PlanCard';
import { useSubscriptionStatus } from '../../../spa/src/hooks/queries/useSubscriptionStatus';

interface SubscriptionStatusSnapshot {
  hasSharedSpaces: boolean;
  sharedSpacesOwnedCount: number;
  sharedSpacesOwnedLimit: number;
}

interface UpgradePageContentProps {
  initialHasSharedSpaces: boolean;
  initialSharedSpacesOwnedCount?: number | null;
  initialSharedSpacesOwnedLimit?: number | null;
  publishableKey?: string | null;
  /**
   * False while the subscription status is still loading: the cards hold their place but
   * stay hidden, so a subscriber never sees the buy-it layout flash first.
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

/* The headline and subhead are harvous.com/pricing's, so arriving here from the site feels
   like the same page, now with your account behind it. */
const PURCHASE_TITLE = ['Free to study.', 'Plus to keep going.'] as const;
const PURCHASE_SUBHEAD =
  'Free for personal study. Plus is for study you keep coming back to, or share with a group.';
/* A subscriber's page is just their card, and the card says it: no headline above it
   repeating "you have Plus" in bigger type. */
const ACTIVE_TAGLINE = 'All of this is on your account.';

type FoundingAvailability = {
  total: number;
  claimed: number;
  remaining: number;
  available: boolean;
};

/**
 * /upgrade — laid out like harvous.com/pricing: the site's headline, then Free and Plus side
 * by side as pricing cards, with checkout at the foot of the Plus card. The Plus card is the
 * one Settings › Plan shows (`PlanCard`), so buying and managing describe the plan in the
 * same shape. A subscriber sees only their Plus card, priced from their billing.
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
  const [founding, setFounding] = useState<FoundingAvailability | null>(null);
  const showActiveCopy = hasSharedSpaces;
  const purchaseSubhead =
    !showActiveCopy && founding?.available && founding.remaining > 0
      ? `${PURCHASE_SUBHEAD} Only ${founding.remaining} founding spots left.`
      : PURCHASE_SUBHEAD;
  /* What a subscriber pays and when it renews — the same line Settings › Plan shows. */
  const { data: subscription } = useSubscriptionStatus();
  const price = planCardPrice({
    hasPlus: showActiveCopy,
    billing: designPreview ? null : subscription?.billing ?? null,
    canManageBilling: Boolean(subscription?.canManageBilling),
  });

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

  /** Prefer path so sign-in ↔ sign-up switches keep a stable return target. */
  const upgradeReturnPath =
    typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}${window.location.hash}` || '/upgrade'
      : '/upgrade';
  const upgradeReturnDestination =
    typeof window !== 'undefined'
      ? `${window.location.origin}${upgradeReturnPath.startsWith('/') ? upgradeReturnPath : `/${upgradeReturnPath}`}`
      : '/upgrade';
  const redirectParam = encodeURIComponent(upgradeReturnDestination);
  const signInHref = `/sign-in?redirect_url=${redirectParam}`;
  const signUpHref = `/sign-up?redirect_url=${redirectParam}`;

  const rememberUpgradeReturn = () => {
    writePendingAuthRedirect(upgradeReturnDestination);
  };

  const plusAction = hasSharedSpaces ? (
    <a href={prototypeHref('settings/addons')} className="upgrade-secondary-btn">
      Manage your plan
    </a>
  ) : isSignedIn ? (
    <UpgradeCheckoutButton
      className="upgrade-checkout"
      publishableKey={publishableKey}
      ctaLabel={`Get ${PLAN_NAME}`}
      priceMonthlyLabel={PRICE_MONTHLY_LABEL}
      priceAnnualLabel={PRICE_ANNUAL_LABEL}
    />
  ) : (
    <>
      <a href={signUpHref} className="upgrade-primary-btn" onClick={rememberUpgradeReturn}>
        Sign up to continue
      </a>
      <a href={signInHref} className="upgrade-secondary-btn" onClick={rememberUpgradeReturn}>
        Sign in
      </a>
    </>
  );

  return (
    <div
      className={['upgrade-pricing', ready ? 'upgrade-pricing--ready' : ''].filter(Boolean).join(' ')}
      aria-busy={!ready}
    >
      {!showActiveCopy ? (
        <header className="upgrade-pricing__head">
          <p className="upgrade-pricing__eyebrow">{PLAN_NAME}</p>
          <h1 className="upgrade-pricing__title">
            {PURCHASE_TITLE[0]}
            <br />
            {PURCHASE_TITLE[1]}
          </h1>
          <p className="upgrade-pricing__subhead">{purchaseSubhead}</p>
        </header>
      ) : (
        <h1 className="upgrade-pricing__visually-hidden">{PLAN_NAME}</h1>
      )}

      <div
        className={['upgrade-pricing__cards', showActiveCopy ? 'upgrade-pricing__cards--single' : '']
          .filter(Boolean)
          .join(' ')}
      >
        {/* Free sits beside Plus only while there is a choice to make; a subscriber is not
            choosing, so their page is their plan. */}
        {!showActiveCopy ? (
          <PlanCard
            tone="free"
            name={FREE_PLAN_NAME}
            icon="book-open"
            badge={isSignedIn ? 'Your plan' : null}
            price={{ primary: '$0' }}
            tagline={FREE_PLAN_TAGLINE}
            bullets={FREE_PLAN_FEATURE_BULLETS}
          >
            {!isSignedIn ? (
              <a href={signUpHref} className="upgrade-secondary-btn" onClick={rememberUpgradeReturn}>
                Sign up free
              </a>
            ) : null}
          </PlanCard>
        ) : null}
        <PlanCard
          name={PLAN_NAME}
          icon="plus"
          badge={showActiveCopy ? (subscription?.isFounding ? PLUS_FOUNDING_BADGE : 'Active') : null}
          price={
            showActiveCopy
              ? /* What you have, then the one fact about it — renewal date, or who manages
                   it. The amount is in Settings › Plan, which is where you change it. */
                { primary: `You have ${PLAN_NAME.replace(/^Harvous /, '')}`, note: price.note }
              : price
          }
          tagline={showActiveCopy ? ACTIVE_TAGLINE : PLUS_PLAN_TAGLINE}
          bullets={featureBullets}
        >
          {plusAction}
        </PlanCard>
      </div>
    </div>
  );
}

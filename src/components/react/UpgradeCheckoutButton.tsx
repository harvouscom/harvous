import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CheckoutButton } from '@clerk/clerk-react/experimental';
import { ClerkProvider, SignedIn, useAuth } from '@clerk/clerk-react';
import {
  dispatchSharedSpacesEntitlementSynced,
  syncSharedSpacesBilling,
} from '@/utils/sync-shared-spaces-billing';
import { isClerkCheckoutDrawerOpen, whenClerkCheckoutDrawerClosed } from '@/utils/wait-for-clerk-drawer-close';
import SafeSubscriptionDetailsButton from './SafeSubscriptionDetailsButton';
import { CLERK_BILLING_DRAWER_APPEARANCE } from '@/lib/clerk-billing-drawer-appearance';

const CHECKOUT_SUCCESS_TITLE = "You're all set";
const CHECKOUT_SUCCESS_DESCRIPTION =
  'Shared Spaces is on your account — tap Continue to get started.';

const CHECKOUT_SUCCESS_TITLE_KEYS = [
  'billing.checkout.title__paymentSuccessful',
  'billing.checkout.title__subscriptionSuccessful',
  'commerce.checkout.title__paymentSuccessful',
  'commerce.checkout.title__subscriptionSuccessful',
];

const CHECKOUT_SUCCESS_DESCRIPTION_KEYS = [
  'billing.checkout.description__paymentSuccessful',
  'billing.checkout.description__subscriptionSuccessful',
  'commerce.checkout.description__paymentSuccessful',
  'commerce.checkout.description__subscriptionSuccessful',
];

/**
 * The checkout drawer is portaled to `document.body`, above `.public-page`'s
 * whole React tree — see CLERK_BILLING_DRAWER_APPEARANCE.
 */
const CHECKOUT_DRAWER_APPEARANCE = CLERK_BILLING_DRAWER_APPEARANCE;

interface UpgradeCheckoutButtonProps {
  className?: string;
  publishableKey?: string | null;
  /** Clerk plan id to check out. */
  planId?: string;
  /** @deprecated alias for planId — the Unlimited plan is retired; kept for callers not yet migrated. */
  unlimitedPlanId?: string;
  /** Button + skeleton copy. */
  ctaLabel?: string;
  priceMonthlyLabel?: string;
  priceAnnualLabel?: string;
}

/** Monthly / annual segmented pill — styled to match the sign-in page's form inputs. */
function IntervalToggle({
  selectedInterval,
  onSelect,
  priceMonthlyLabel,
  priceAnnualLabel,
  disabled = false,
}: {
  selectedInterval: 'month' | 'year';
  onSelect: (interval: 'month' | 'year') => void;
  priceMonthlyLabel: string;
  priceAnnualLabel: string;
  disabled?: boolean;
}) {
  const options: Array<['month' | 'year', string]> = [
    ['month', priceMonthlyLabel],
    ['year', priceAnnualLabel],
  ];

  return (
    <div className="upgrade-toggle" role="radiogroup" aria-label="Billing interval">
      {options.map(([interval, label]) => (
        <button
          key={interval}
          type="button"
          role="radio"
          aria-checked={selectedInterval === interval}
          disabled={disabled}
          onClick={() => onSelect(interval)}
          className={`upgrade-toggle__btn${selectedInterval === interval ? ' upgrade-toggle__btn--active' : ''}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * Inner component that uses Clerk hooks - must be inside ClerkProvider
 */
function UpgradeCheckoutButtonInner({
  className,
  planId,
  remountKey,
  ctaLabel,
  priceMonthlyLabel,
  priceAnnualLabel,
  publishableKey,
}: {
  className: string;
  planId: string;
  remountKey: number;
  ctaLabel: string;
  priceMonthlyLabel: string;
  priceAnnualLabel: string;
  publishableKey?: string | null;
}) {
  const [selectedInterval, setSelectedInterval] = useState<'month' | 'year'>('month');
  const { isLoaded, isSignedIn, has } = useAuth();
  const [isClient, setIsClient] = useState(false);
  const [checkoutKey, setCheckoutKey] = useState<number>(Date.now());
  const [entitlementSyncing, setEntitlementSyncing] = useState(false);
  const [checkoutDrawerOpen, setCheckoutDrawerOpen] = useState(false);
  const entitlementSyncStarted = useRef(false);

  const clerkHasSharedSpaces = isLoaded && isSignedIn ? has({ feature: 'shared_spaces' }) : false;
  const blockCheckout = clerkHasSharedSpaces && !checkoutDrawerOpen;

  const runPostCheckoutSync = useCallback(async () => {
    entitlementSyncStarted.current = true;
    try {
      const result = await syncSharedSpacesBilling();
      dispatchSharedSpacesEntitlementSynced({
        hasSharedSpaces: result.hasSharedSpaces,
        updated: result.updated,
      });
    } catch (error) {
      console.error('[UpgradeCheckoutButton] Shared Spaces billing sync failed:', error);
    }

    // Keep the success drawer mounted until the user dismisses it — reloading
    // the session or flipping parent UI mid-drawer crashes Clerk (`Invalid state`).
    await whenClerkCheckoutDrawerClosed();
    window.dispatchEvent(new CustomEvent('subscriptionUpgraded'));
  }, []);

  // Clerk already shows an active subscription on return visits — reconcile DB
  // before opening checkout again. Skip while a drawer is open (post-payment).
  useEffect(() => {
    if (!blockCheckout || entitlementSyncStarted.current) return;
    entitlementSyncStarted.current = true;
    setEntitlementSyncing(true);
    void runPostCheckoutSync().finally(() => setEntitlementSyncing(false));
  }, [blockCheckout, runPostCheckoutSync]);

  useEffect(() => {
    const syncCheckoutDrawerOpen = () => setCheckoutDrawerOpen(isClerkCheckoutDrawerOpen());
    const observer = new MutationObserver(syncCheckoutDrawerOpen);
    observer.observe(document.body, { childList: true, subtree: true });
    syncCheckoutDrawerOpen();
    return () => observer.disconnect();
  }, []);

  // Ensure we're on the client before rendering Clerk components
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Force CheckoutButton remount on View Transitions navigation
  useEffect(() => {
    const handleViewTransition = () => setCheckoutKey(Date.now());
    document.addEventListener('app:route-change', handleViewTransition);
    return () => document.removeEventListener('app:route-change', handleViewTransition);
  }, []);

  // Rename drawer title + success copy when Clerk checkout opens or completes.
  useEffect(() => {
    const updateCheckoutDrawerCopy = () => {
      const checkoutTitle = document.querySelector('.cl-drawerTitle[data-localization-key="billing.checkout.title"]');
      if (checkoutTitle && checkoutTitle.textContent !== 'Add-on') {
        checkoutTitle.textContent = 'Add-on';
      }

      for (const key of CHECKOUT_SUCCESS_TITLE_KEYS) {
        const title = document.querySelector(`[data-localization-key="${key}"]`);
        if (title && title.textContent !== CHECKOUT_SUCCESS_TITLE) {
          title.textContent = CHECKOUT_SUCCESS_TITLE;
        }
      }

      for (const key of CHECKOUT_SUCCESS_DESCRIPTION_KEYS) {
        const description = document.querySelector(`[data-localization-key="${key}"]`);
        if (description && description.textContent !== CHECKOUT_SUCCESS_DESCRIPTION) {
          description.textContent = CHECKOUT_SUCCESS_DESCRIPTION;
        }
      }

      const titleByClass = document.querySelector('.cl-drawerBody .cl-checkoutSuccessTitle');
      if (titleByClass && titleByClass.textContent !== CHECKOUT_SUCCESS_TITLE) {
        titleByClass.textContent = CHECKOUT_SUCCESS_TITLE;
      }

      const descriptionByClass = document.querySelector('.cl-drawerBody .cl-checkoutSuccessDescription');
      if (descriptionByClass && descriptionByClass.textContent !== CHECKOUT_SUCCESS_DESCRIPTION) {
        descriptionByClass.textContent = CHECKOUT_SUCCESS_DESCRIPTION;
      }
    };

    const observer = new MutationObserver(updateCheckoutDrawerCopy);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    updateCheckoutDrawerCopy();

    return () => observer.disconnect();
  }, []);

  // Clerk drawer "already active" alert — sync entitlement and refresh the page state.
  useEffect(() => {
    let handled = false;

    const observer = new MutationObserver(() => {
      if (handled) return;
      const alerts = document.querySelectorAll('.cl-alert, [role="alert"]');
      for (const el of alerts) {
        const text = el.textContent?.toLowerCase() ?? '';
        if (text.includes('already active')) {
          handled = true;
          void runPostCheckoutSync();
          break;
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [runPostCheckoutSync]);

  if (!isClient || !isLoaded) {
    return (
      <div className={className}>
        <IntervalToggle
          selectedInterval={selectedInterval}
          onSelect={setSelectedInterval}
          priceMonthlyLabel={priceMonthlyLabel}
          priceAnnualLabel={priceAnnualLabel}
          disabled
        />
        <button type="button" disabled className="upgrade-primary-btn upgrade-primary-btn--disabled">
          Loading…
        </button>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className={className}>
        <IntervalToggle
          selectedInterval={selectedInterval}
          onSelect={setSelectedInterval}
          priceMonthlyLabel={priceMonthlyLabel}
          priceAnnualLabel={priceAnnualLabel}
        />
        <button type="button" disabled className="upgrade-primary-btn upgrade-primary-btn--disabled">
          Sign in first
        </button>
      </div>
    );
  }

  if (blockCheckout) {
    return (
      <div className={className}>
        <IntervalToggle
          selectedInterval={selectedInterval}
          onSelect={setSelectedInterval}
          priceMonthlyLabel={priceMonthlyLabel}
          priceAnnualLabel={priceAnnualLabel}
          disabled
        />
        <button type="button" disabled className="upgrade-primary-btn upgrade-primary-btn--disabled">
          {entitlementSyncing ? 'Just a moment…' : "You're all set"}
        </button>
        {!entitlementSyncing && (
          <SafeSubscriptionDetailsButton
            publishableKey={publishableKey}
            onSubscriptionCancel={() => {
              window.dispatchEvent(new CustomEvent('subscriptionUpgraded'));
            }}
          >
            <button type="button" className="upgrade-secondary-btn">
              Manage Add-On
            </button>
          </SafeSubscriptionDetailsButton>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      <IntervalToggle
        selectedInterval={selectedInterval}
        onSelect={setSelectedInterval}
        priceMonthlyLabel={priceMonthlyLabel}
        priceAnnualLabel={priceAnnualLabel}
      />

      <CheckoutButton
        key={`checkout-${selectedInterval}-${remountKey}-${checkoutKey}`}
        planId={planId}
        planPeriod={selectedInterval === 'year' ? 'annual' : 'month'}
        checkoutProps={{ appearance: CHECKOUT_DRAWER_APPEARANCE }}
        onSubscriptionComplete={() => {
          void runPostCheckoutSync();
        }}
      >
        <button type="button" className="upgrade-primary-btn">
          {ctaLabel}
        </button>
      </CheckoutButton>
    </div>
  );
}

/**
 * React component that handles Clerk billing checkout.
 * Uses CheckoutButton from @clerk/clerk-react/experimental.
 * React Islands are isolated, so this component provides its own ClerkProvider.
 */
export default function UpgradeCheckoutButton({
  className = '',
  publishableKey = null,
  planId,
  unlimitedPlanId = '',
  ctaLabel = 'Upgrade',
  priceMonthlyLabel = '$6 per month',
  priceAnnualLabel = '$48 per year',
}: UpgradeCheckoutButtonProps) {
  const effectivePlanId = planId || unlimitedPlanId;
  const [effectiveKey, setEffectiveKey] = useState<string | null>(publishableKey);

  // Get publishableKey from props or window global (for View Transitions compatibility)
  useEffect(() => {
    const key = publishableKey || (typeof window !== 'undefined' ? (window as any).CLERK_PUBLISHABLE_KEY : null);
    setEffectiveKey(key);
  }, [publishableKey]);

  // Re-check after View Transitions navigation
  useEffect(() => {
    const handlePageLoad = () => {
      const key = publishableKey || (typeof window !== 'undefined' ? (window as any).CLERK_PUBLISHABLE_KEY : null);
      setEffectiveKey(key);
    };

    document.addEventListener('app:route-change', handlePageLoad);
    return () => document.removeEventListener('app:route-change', handlePageLoad);
  }, [publishableKey]);

  // If no plan ID configured, don't expose checkout (plan ID must come from env)
  if (!effectivePlanId) {
    return (
      <div className={className}>
        <button type="button" disabled className="upgrade-primary-btn upgrade-primary-btn--disabled">
          Billing unavailable
        </button>
      </div>
    );
  }

  // If no publishable key AND not in SPA mode, render disabled button
  if (!effectiveKey && publishableKey !== null) {
    return (
      <div className={className}>
        <button type="button" disabled className="upgrade-primary-btn upgrade-primary-btn--disabled">
          Billing unavailable
        </button>
      </div>
    );
  }

  // Get domain and URLs for ClerkProvider configuration
  const getClerkConfig = () => {
    if (typeof window === 'undefined') {
      return {
        publishableKey: effectiveKey,
        domain: undefined,
        afterSignInUrl: undefined,
        afterSignUpUrl: undefined,
      };
    }

    return {
      publishableKey: effectiveKey,
      domain: window.location.hostname,
      afterSignInUrl: window.location.origin,
      afterSignUpUrl: window.location.origin,
    };
  };

  const clerkConfig = getClerkConfig();
  const [pathname, setPathname] = useState<string>('');
  const [remountKey, setRemountKey] = useState<number>(Date.now());
  const [isVisible, setIsVisible] = useState<boolean>(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // Track pathname and update remount key on each navigation to force ClerkProvider remount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPathname(window.location.pathname);
      setRemountKey(Date.now());
    }

    const handlePageLoad = () => {
      if (typeof window !== 'undefined') {
        setPathname(window.location.pathname);
        setRemountKey(Date.now());
      }
    };

    document.addEventListener('app:route-change', handlePageLoad);
    return () => document.removeEventListener('app:route-change', handlePageLoad);
  }, []);

  // Visibility detection using IntersectionObserver to force remount when component becomes visible
  useEffect(() => {
    if (typeof window === 'undefined' || !containerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const wasVisible = isVisible;
          const nowVisible = entry.isIntersecting;

          if (!wasVisible && nowVisible) {
            setRemountKey(Date.now());
          }

          setIsVisible(nowVisible);
        });
      },
      { threshold: 0.1, rootMargin: '0px' }
    );

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [isVisible]);

  // In the SPA, ClerkProvider is already provided by App.tsx — skip creating a nested one.
  if (publishableKey === null) {
    return (
      <div ref={containerRef}>
        <SignedIn>
          <UpgradeCheckoutButtonInner
            key={`checkout-inner-${remountKey}`}
            className={className}
            planId={effectivePlanId}
            remountKey={remountKey}
            ctaLabel={ctaLabel}
            priceMonthlyLabel={priceMonthlyLabel}
            priceAnnualLabel={priceAnnualLabel}
            publishableKey={publishableKey}
          />
        </SignedIn>
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      {/* @ts-expect-error Clerk's ClerkProviderProps discriminated union requires isSatellite/proxyUrl with domain */}
      <ClerkProvider
        key={`clerk-provider-${pathname}-${remountKey}`}
        publishableKey={clerkConfig.publishableKey!}
        domain={clerkConfig.domain}
        afterSignInUrl={clerkConfig.afterSignInUrl}
        afterSignUpUrl={clerkConfig.afterSignUpUrl}
      >
        <SignedIn>
          <UpgradeCheckoutButtonInner
            key={`checkout-inner-${remountKey}`}
            className={className}
            planId={effectivePlanId}
            remountKey={remountKey}
            ctaLabel={ctaLabel}
            priceMonthlyLabel={priceMonthlyLabel}
            priceAnnualLabel={priceAnnualLabel}
            publishableKey={publishableKey}
          />
        </SignedIn>
      </ClerkProvider>
    </div>
  );
}

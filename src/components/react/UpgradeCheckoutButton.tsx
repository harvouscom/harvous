import React, { useState, useEffect, useRef } from 'react';
import { CheckoutButton } from '@clerk/clerk-react/experimental';
import { ClerkProvider, SignedIn, useAuth } from '@clerk/clerk-react';
import type { Theme } from '@clerk/types';

/** Same font stack + blue gradient pill as `.upgrade-primary-btn` (upgrade-page.css). */
const CHECKOUT_FONT_STACK =
  '"Google Sans", "Reddit Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

/**
 * The checkout drawer is portaled to `document.body`, above `.public-page`'s
 * whole React tree — so it renders with `z-index: auto` while the sticky
 * `.public-toolbar` above it sets `z-index: 100`, letting the toolbar paint
 * over the drawer. Force the drawer above every page's chrome, and match its
 * title + primary button to the "Add Shared Spaces" button beside it instead
 * of Clerk's default flat-blue, small-radius look.
 */
const CHECKOUT_DRAWER_APPEARANCE: Theme = {
  elements: {
    drawerBackdrop: { zIndex: 300 },
    drawerRoot: { zIndex: 300 },
    drawerContent: { zIndex: 300 },
    drawerTitle: {
      fontFamily: CHECKOUT_FONT_STACK,
      fontWeight: 600,
    },
    drawerBody: { fontFamily: CHECKOUT_FONT_STACK },
    formButtonPrimary: {
      fontFamily: CHECKOUT_FONT_STACK,
      fontWeight: 600,
      color: '#ffffff',
      background: 'linear-gradient(171deg, #2bb5ff 7%, #006eff 93%)',
      borderRadius: '999px',
      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.3), 0 10px 24px -10px rgba(0, 110, 255, 0.6)',
      '&:hover': { filter: 'brightness(1.05)', color: '#ffffff' },
      '&:active': { filter: 'brightness(0.97)', color: '#ffffff' },
      '&:focus': { color: '#ffffff' },
    },
  },
};

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
}: {
  className: string;
  planId: string;
  remountKey: number;
  ctaLabel: string;
  priceMonthlyLabel: string;
  priceAnnualLabel: string;
}) {
  const [selectedInterval, setSelectedInterval] = useState<'month' | 'year'>('month');
  const { isLoaded, isSignedIn } = useAuth();
  const [isClient, setIsClient] = useState(false);
  const [checkoutKey, setCheckoutKey] = useState<number>(Date.now());

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

  // Update Clerk checkout drawer title when it opens
  useEffect(() => {
    const updateCheckoutDrawerTitle = () => {
      const checkoutTitle = document.querySelector('.cl-drawerTitle[data-localization-key="billing.checkout.title"]');
      if (checkoutTitle && checkoutTitle.textContent !== 'Upgrade') {
        checkoutTitle.textContent = 'Upgrade';
      }
    };

    const observer = new MutationObserver(updateCheckoutDrawerTitle);
    observer.observe(document.body, { childList: true, subtree: true });
    updateCheckoutDrawerTitle();

    return () => observer.disconnect();
  }, []);

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
          />
        </SignedIn>
      </ClerkProvider>
    </div>
  );
}

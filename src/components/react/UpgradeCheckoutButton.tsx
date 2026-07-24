import React, { useCallback, useEffect, useRef, useState } from 'react';
import { initializePaddle, type Environments, type Paddle, type PaddleEventData } from '@paddle/paddle-js';
import { dispatchSharedSpacesEntitlementSynced, syncSharedSpacesBilling } from '@/utils/sync-shared-spaces-billing';
import { formatPlanPrice, listedPlanForInterval, type PlanInterval } from '@/lib/billing-plans';

/** Class name (not a CSS selector) Paddle's inline checkout mounts into — see FRAME_TARGET_CLASS usage below. */
const FRAME_TARGET_CLASS = 'upgrade-checkout-frame';

let paddleClientPromise: Promise<Paddle | undefined> | null = null;
let latestPaddleEventHandler: ((event: PaddleEventData) => void) | null = null;

/** Lazily loads and caches a single Paddle.js client for the page's lifetime. */
function getPaddleClient(onEvent: (event: PaddleEventData) => void): Promise<Paddle | undefined> {
  latestPaddleEventHandler = onEvent;
  if (paddleClientPromise) return paddleClientPromise;

  const token = import.meta.env.VITE_PADDLE_CLIENT_TOKEN as string | undefined;
  if (!token) {
    paddleClientPromise = Promise.resolve(undefined);
    return paddleClientPromise;
  }

  const environment: Environments = import.meta.env.VITE_PADDLE_ENV === 'production' ? 'production' : 'sandbox';
  paddleClientPromise = initializePaddle({
    token,
    environment,
    eventCallback: (event) => latestPaddleEventHandler?.(event)
  });
  return paddleClientPromise;
}

interface UpgradeCheckoutButtonProps {
  className?: string;
  /** Unused with Paddle — kept so callers that still pass a Clerk-era publishable key don't need to change. */
  publishableKey?: string | null;
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
  selectedInterval: PlanInterval;
  onSelect: (interval: PlanInterval) => void;
  priceMonthlyLabel: string;
  priceAnnualLabel: string;
  disabled?: boolean;
}) {
  const options: Array<[PlanInterval, string]> = [
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

type CheckoutPhase = 'idle' | 'starting' | 'checkout' | 'syncing' | 'done';

/**
 * Paddle Billing checkout. Fetches a price + customer id from
 * `/api/billing/checkout`, then opens Paddle's inline checkout in a frame
 * mounted inside this card. On `checkout.completed`, reconciles entitlements
 * via `/api/billing/sync` and broadcasts `subscriptionUpgraded` so the rest of
 * the app (space switcher, settings, this page's parent) refreshes.
 */
export default function UpgradeCheckoutButton({
  className = '',
  ctaLabel = 'Upgrade',
  priceMonthlyLabel,
  priceAnnualLabel,
}: UpgradeCheckoutButtonProps) {
  const [selectedInterval, setSelectedInterval] = useState<PlanInterval>('year');
  const [phase, setPhase] = useState<CheckoutPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const monthPlan = listedPlanForInterval('month');
  const yearPlan = listedPlanForInterval('year');
  const resolvedMonthlyLabel = priceMonthlyLabel ?? (monthPlan ? `${formatPlanPrice(monthPlan)} per month` : '');
  const resolvedAnnualLabel = priceAnnualLabel ?? (yearPlan ? `${formatPlanPrice(yearPlan)} per year` : '');
  const billingConfigured = Boolean(monthPlan?.priceId || yearPlan?.priceId);

  const runPostCheckoutSync = useCallback(async () => {
    if (mountedRef.current) setPhase('syncing');
    try {
      const result = await syncSharedSpacesBilling();
      dispatchSharedSpacesEntitlementSynced({
        hasSharedSpaces: result.hasSharedSpaces,
        updated: result.updated,
        entitlements: result.entitlements
      });
    } catch (err) {
      console.error('[UpgradeCheckoutButton] Post-checkout sync failed:', err);
    }
    window.dispatchEvent(new CustomEvent('subscriptionUpgraded'));
    if (mountedRef.current) setPhase('done');
  }, []);

  const handlePaddleEvent = useCallback(
    (event: PaddleEventData) => {
      if (event.name === 'checkout.completed') {
        void runPostCheckoutSync();
      } else if (event.name === 'checkout.closed') {
        if (mountedRef.current) setPhase('idle');
      } else if (event.name === 'checkout.error') {
        if (mountedRef.current) {
          setError('Something went wrong opening checkout. Please try again.');
          setPhase('idle');
        }
      }
    },
    [runPostCheckoutSync]
  );

  const startCheckout = useCallback(async () => {
    setError(null);
    setPhase('starting');
    try {
      const paddle = await getPaddleClient(handlePaddleEvent);
      if (!paddle) throw new Error('Billing is not configured');

      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval: selectedInterval })
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Unable to start checkout');
      }

      const { priceId, customerId, customData } = (await res.json()) as {
        priceId: string;
        customerId?: string;
        customData?: Record<string, unknown>;
      };

      if (!mountedRef.current) return;
      setPhase('checkout');
      paddle.Checkout.open({
        items: [{ priceId, quantity: 1 }],
        customer: customerId ? { id: customerId } : undefined,
        customData,
        settings: {
          displayMode: 'inline',
          frameTarget: FRAME_TARGET_CLASS,
          frameInitialHeight: 450,
          frameStyle: 'width: 100%; min-width: 312px; background-color: transparent; border: none;'
        }
      });
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Unable to start checkout');
      setPhase('idle');
    }
  }, [selectedInterval, handlePaddleEvent]);

  const cancelCheckout = useCallback(() => {
    void getPaddleClient(handlePaddleEvent).then((paddle) => paddle?.Checkout.close());
    setPhase('idle');
  }, [handlePaddleEvent]);

  if (!billingConfigured) {
    return (
      <div className={className}>
        <button type="button" disabled className="upgrade-primary-btn upgrade-primary-btn--disabled">
          Billing unavailable
        </button>
      </div>
    );
  }

  if (phase === 'syncing' || phase === 'done') {
    return (
      <div className={className}>
        <button type="button" disabled className="upgrade-primary-btn upgrade-primary-btn--disabled">
          {phase === 'syncing' ? 'Just a moment…' : "You're all set"}
        </button>
      </div>
    );
  }

  if (phase === 'checkout') {
    return (
      <div className={className}>
        <div className={FRAME_TARGET_CLASS} />
        <button type="button" className="upgrade-secondary-btn" onClick={cancelCheckout}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className={className}>
      <IntervalToggle
        selectedInterval={selectedInterval}
        onSelect={setSelectedInterval}
        priceMonthlyLabel={resolvedMonthlyLabel}
        priceAnnualLabel={resolvedAnnualLabel}
        disabled={phase === 'starting'}
      />
      {error ? (
        <p className="upgrade-checkout__error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="button" className="upgrade-primary-btn" disabled={phase === 'starting'} onClick={() => void startCheckout()}>
        {phase === 'starting' ? 'Starting checkout…' : ctaLabel}
      </button>
    </div>
  );
}

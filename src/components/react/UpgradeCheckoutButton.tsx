import React, { useCallback, useEffect, useState } from 'react';
import {
  formatPlanPrice,
  formatCents,
  planFor,
  type PlanDefinition,
} from '@/lib/billing-plans';
import { trackCheckoutStarted } from '@/utils/analytics';
import { recordAudiencefulMilestoneOnce } from '@/utils/audienceful-milestones-client';

interface UpgradeCheckoutButtonProps {
  className?: string;
  /** Unused with Polar — kept so callers that still pass a Clerk-era publishable key don't need to change. */
  publishableKey?: string | null;
  ctaLabel?: string;
  priceMonthlyLabel?: string;
  priceAnnualLabel?: string;
}

type FoundingAvailability = {
  total: number;
  claimed: number;
  remaining: number;
  available: boolean;
  firstYearCents: number | null;
};

type PlanOption = {
  id: string;
  productId: string;
  /** Short chip label, e.g. "$49/yr". */
  chip: string;
  /** Full accessible name for the option. */
  label: string;
  /** Renewal price, shown under the toggle. Only the founding offer has one. */
  renewalNote?: string;
  /** Send the founding discount with this checkout. */
  founding?: boolean;
};

/** Segmented chip toggle — short price labels only. */
function PlanToggle({
  options,
  selectedId,
  onSelect,
  disabled = false,
}: {
  options: PlanOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`upgrade-toggle${options.length > 2 ? ' upgrade-toggle--triple' : ''}`}
      role="radiogroup"
      aria-label="Plan"
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={selectedId === option.id}
          aria-label={option.label}
          disabled={disabled}
          onClick={() => onSelect(option.id)}
          className={`upgrade-toggle__btn${selectedId === option.id ? ' upgrade-toggle__btn--active' : ''}`}
        >
          {option.chip}
        </button>
      ))}
    </div>
  );
}

function preferredTheme(): 'light' | 'dark' {
  if (typeof document !== 'undefined' && document.documentElement.dataset.theme) {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

function priceLabel(plan: PlanDefinition | null, suffix: string): string {
  return plan ? `${formatPlanPrice(plan)} ${suffix}` : '';
}

function chipLabel(plan: PlanDefinition | null): string {
  if (!plan) return '';
  return plan.interval === 'year' ? `${formatPlanPrice(plan)}/yr` : `${formatPlanPrice(plan)}/mo`;
}

/**
 * Polar Billing checkout — same-tab hosted redirect.
 * Creates a session via `/api/billing/checkout`, then navigates to Polar.
 * Return to `/upgrade?checkout_id=…` syncs entitlements on UpgradePage.
 *
 * Founding availability is fetched rather than derived from the registry: the
 * cap is a live count, and a page open since before the last slot went must not
 * offer a price it can no longer honor. The server re-checks at checkout too.
 */
export default function UpgradeCheckoutButton({
  className = '',
  ctaLabel = 'Upgrade',
  priceMonthlyLabel,
  priceAnnualLabel,
}: UpgradeCheckoutButtonProps) {
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [founding, setFounding] = useState<FoundingAvailability | null>(null);

  const monthPlan = planFor('plus', 'month');
  const yearPlan = planFor('plus', 'year');

  const resolvedMonthlyLabel = priceMonthlyLabel ?? priceLabel(monthPlan, 'per month');
  const resolvedAnnualLabel = priceAnnualLabel ?? priceLabel(yearPlan, 'per year');
  const billingConfigured = Boolean(monthPlan?.productId || yearPlan?.productId);

  const loadFounding = useCallback(async () => {
    try {
      const res = await fetch('/api/billing/plans', { credentials: 'include', cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { founding?: FoundingAvailability };
      if (data.founding) setFounding(data.founding);
    } catch {
      // Availability unknown → founding simply isn't offered. Standard pricing still works.
    }
  }, []);

  useEffect(() => {
    void loadFounding();
  }, [loadFounding]);

  const foundingCents = founding?.firstYearCents ?? null;
  const foundingAvailable = Boolean(founding?.available && yearPlan?.productId && foundingCents);

  /**
   * Two options, always: yearly and monthly. Founding is a first-year discount
   * on the yearly product rather than a third product, so selling out changes
   * the price on the annual chip instead of removing a chip — which is why the
   * toggle no longer has to move the user's selection when the last slot goes.
   */
  const options: PlanOption[] = [
    ...(yearPlan
      ? [
          {
            id: 'year',
            productId: yearPlan.productId,
            chip:
              foundingAvailable && foundingCents
                ? `${formatCents(foundingCents, yearPlan.currencyCode)} first year`
                : chipLabel(yearPlan),
            label:
              foundingAvailable && foundingCents
                ? `${formatCents(foundingCents, yearPlan.currencyCode)} for the first year, then ${formatPlanPrice(yearPlan)} per year`
                : resolvedAnnualLabel,
            // The renewal price belongs on the checkout, not in an email eleven
            // months later.
            renewalNote:
              foundingAvailable && foundingCents
                ? `then ${formatPlanPrice(yearPlan)}/yr`
                : undefined,
            founding: foundingAvailable,
          },
        ]
      : []),
    ...(monthPlan
      ? [
          {
            id: 'month',
            productId: monthPlan.productId,
            chip: chipLabel(monthPlan),
            label: resolvedMonthlyLabel,
          },
        ]
      : []),
  ];

  const defaultId = yearPlan ? 'year' : 'month';
  const [selectedId, setSelectedId] = useState<string>(defaultId);
  const [userPicked, setUserPicked] = useState(false);

  const selected = options.find((o) => o.id === selectedId) ?? options[options.length - 1];

  const startCheckout = useCallback(async () => {
    if (!selected) return;
    setError(null);
    setIsStarting(true);
    try {
      trackCheckoutStarted({
        plan: selected.founding ? 'founding' : 'plus',
        interval: selected.id === 'month' ? 'month' : 'year',
        productId: selected.productId,
      });
      recordAudiencefulMilestoneOnce('checkout_started');
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: selected.productId,
          ...(selected.founding ? { founding: true } : {}),
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
        if (body.code === 'FOUNDING_SOLD_OUT') {
          // Someone took the last slot while this page was open. Same product,
          // so nothing to re-select — reloading availability drops the
          // first-year price off the annual chip.
          await loadFounding();
          throw new Error('The founding price was just claimed. Standard pricing is shown.');
        }
        throw new Error(body.error || 'Unable to start checkout');
      }

      const { url } = (await res.json()) as { url: string };
      if (!url) throw new Error('Unable to start checkout');

      const checkoutUrl = new URL(url);
      checkoutUrl.searchParams.set('theme', preferredTheme());
      window.location.assign(checkoutUrl.toString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start checkout');
      setIsStarting(false);
    }
  }, [loadFounding, selected]);

  if (!billingConfigured) {
    return (
      <div className={className}>
        <button type="button" disabled className="upgrade-primary-btn upgrade-primary-btn--disabled">
          Billing unavailable
        </button>
      </div>
    );
  }

  return (
    <div className={className}>
      <PlanToggle
        options={options}
        selectedId={selected?.id ?? defaultId}
        onSelect={(id) => {
          setUserPicked(true);
          setSelectedId(id);
        }}
        disabled={isStarting}
      />
      {selected?.renewalNote ? (
        <p className="upgrade-checkout__renewal">{selected.renewalNote}</p>
      ) : null}
      {error ? (
        <p className="upgrade-checkout__error" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        className="upgrade-primary-btn"
        disabled={isStarting || !selected}
        onClick={() => void startCheckout()}
      >
        {isStarting ? 'Starting checkout…' : ctaLabel}
      </button>
      <p className="upgrade-checkout__guarantee">
        30-day money-back guarantee. Cancel anytime.
      </p>
    </div>
  );
}

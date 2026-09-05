import type { PlanInterval } from '@/lib/billing-plans';

export type BillingSummaryForCopy = {
  interval: PlanInterval;
  amountCents: number;
  currency: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
};

/** e.g. `$6/mo` or `$36/yr` from Polar amount. */
export function formatBillingPriceLine(billing: Pick<BillingSummaryForCopy, 'amountCents' | 'interval'>): string {
  const dollars = billing.amountCents / 100;
  const price = Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
  return billing.interval === 'year' ? `${price}/yr` : `${price}/mo`;
}

/** Human date for renewal / end / order (locale medium). */
export function formatBillingPeriodDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** “Renews Jul 24, 2027” or “Ends Jul 24, 2027” when canceling. */
export function formatBillingStatusLine(billing: BillingSummaryForCopy): string {
  const date = formatBillingPeriodDate(billing.currentPeriodEnd);
  if (!date) return billing.cancelAtPeriodEnd ? 'Cancels at period end' : 'Active';
  return billing.cancelAtPeriodEnd ? `Ends ${date}` : `Renews ${date}`;
}

export function formatBillingIntervalLabel(interval: PlanInterval): string {
  return interval === 'year' ? 'Yearly' : 'Monthly';
}

/** e.g. `Visa ·••• 4242` */
export function formatPaymentMethodLabel(method: { brand: string; last4: string } | null): string {
  if (!method?.last4) return 'No card on file';
  const brand = method.brand?.trim() || 'Card';
  return `${brand} ·••• ${method.last4}`;
}

/** Order amount for history rows. */
export function formatOrderAmount(amountCents: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency.toUpperCase() || 'USD',
      minimumFractionDigits: amountCents % 100 === 0 ? 0 : 2,
    }).format(amountCents / 100);
  } catch {
    const dollars = amountCents / 100;
    return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
  }
}

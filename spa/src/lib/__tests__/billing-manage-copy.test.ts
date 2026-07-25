import { describe, expect, it } from 'vitest';
import {
  formatBillingIntervalLabel,
  formatBillingPeriodDate,
  formatBillingPriceLine,
  formatBillingStatusLine,
  formatOrderAmount,
  formatPaymentMethodLabel,
} from '../billing-manage-copy';

describe('billing-manage-copy', () => {
  const base = {
    interval: 'year' as const,
    amountCents: 4500,
    currency: 'USD',
    currentPeriodEnd: '2027-07-24T12:00:00.000Z',
    cancelAtPeriodEnd: false,
  };

  it('formats founding annual and monthly price lines', () => {
    expect(formatBillingPriceLine(base)).toBe('$45/yr');
    expect(formatBillingPriceLine({ ...base, interval: 'month', amountCents: 500 })).toBe('$5/mo');
  });

  it('formats a locale period date', () => {
    const label = formatBillingPeriodDate(base.currentPeriodEnd);
    expect(label).toMatch(/2027/);
    expect(label.length).toBeGreaterThan(4);
  });

  it('says Renews when active, Ends when canceling', () => {
    expect(formatBillingStatusLine(base)).toMatch(/^Renews /);
    expect(formatBillingStatusLine({ ...base, cancelAtPeriodEnd: true })).toMatch(/^Ends /);
  });

  it('labels billing interval', () => {
    expect(formatBillingIntervalLabel('month')).toBe('Monthly');
    expect(formatBillingIntervalLabel('year')).toBe('Yearly');
  });

  it('formats payment method label', () => {
    expect(formatPaymentMethodLabel(null)).toBe('No card on file');
    expect(formatPaymentMethodLabel({ brand: 'Visa', last4: '4242' })).toBe('Visa ·••• 4242');
  });

  it('formats order amounts', () => {
    expect(formatOrderAmount(4500, 'USD')).toMatch(/45/);
    expect(formatOrderAmount(500, 'USD')).toMatch(/5/);
  });
});

import { describe, expect, it } from 'vitest';
import { planCardPrice } from '../PrototypeAddonsPage';

describe('plan card price', () => {
  it('shows both prices to someone without Plus, like the website', () => {
    expect(planCardPrice({ hasPlus: false, billing: null, canManageBilling: false })).toEqual({
      primary: '$6/mo',
      secondary: '$36/yr',
      note: null,
    });
  });

  it('shows a subscriber what they pay and when it renews', () => {
    const out = planCardPrice({
      hasPlus: true,
      canManageBilling: true,
      billing: { amountCents: 3600, interval: 'year', currentPeriodEnd: '2027-10-02T12:00:00Z', cancelAtPeriodEnd: false } as never,
    });
    expect(out.primary).toBe('$36/yr');
    expect(out.note).toMatch(/^Renews /);
  });

  it('never invents a price for a plan Harvous gave', () => {
    expect(planCardPrice({ hasPlus: true, billing: null, canManageBilling: false })).toEqual({
      primary: 'Included',
      secondary: null,
      note: 'Managed by Harvous',
    });
  });
});

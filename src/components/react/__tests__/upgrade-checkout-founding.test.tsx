/**
 * The founding offer is a discount on the annual product, not a product of its
 * own, so nothing about it is visible in the registry — the price on the annual
 * chip depends on what `/api/billing/plans` says about availability. These
 * assertions are the only place that pairing is pinned.
 *
 * The renewal line matters most: a first-year price shown without it is the part
 * of a discounted annual that turns into a support ticket eleven months later.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UpgradeCheckoutButton from '../UpgradeCheckoutButton';

/*
 * The unprefixed names, because those are the ones `envProduct` reads from `process.env`;
 * the `VITE_`-prefixed pair it falls back to lives on `import.meta.env`, which a test cannot
 * reach by assigning to `process.env`. Setting the prefixed names here passed only on a machine
 * whose `.env` already supplied real product ids, and failed in CI, where nothing did.
 */
const ENV_KEYS = ['POLAR_PLUS_PRODUCT_MONTHLY', 'POLAR_PLUS_PRODUCT_ANNUAL'] as const;

function mockPlans(founding: {
  available: boolean;
  firstYearCents: number | null;
}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        founding: { total: 99, claimed: 0, remaining: 99, ...founding },
      }),
    })),
  );
}

describe('UpgradeCheckoutButton founding offer', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      process.env[key] = `prod_${key.toLowerCase()}`;
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    vi.unstubAllGlobals();
  });

  it('prices the annual chip at the first year, with the renewal underneath', async () => {
    mockPlans({ available: true, firstYearCents: 3500 });
    render(<UpgradeCheckoutButton />);

    await waitFor(() => expect(screen.getByText('$35 first year')).toBeTruthy());
    // The renewal price is not optional copy — a +40% step has to be on the checkout.
    expect(screen.getByText('then $49/yr')).toBeTruthy();
    expect(screen.getByText('$7/mo')).toBeTruthy();
  });

  it('falls back to the list price when the offer is sold out or unconfigured', async () => {
    mockPlans({ available: false, firstYearCents: null });
    render(<UpgradeCheckoutButton />);

    await waitFor(() => expect(screen.getByText('$49/yr')).toBeTruthy());
    expect(screen.queryByText(/first year/)).toBeNull();
    // Selling out changes the price on the annual chip; it never removes the option.
    expect(screen.getByText('$7/mo')).toBeTruthy();
  });
});

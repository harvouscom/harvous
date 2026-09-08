/**
 * What the upgrade button shows, and what it says when checkout fails.
 *
 * The founding chip is gone from here because `foundingOffer()` is retired and
 * returns null, so `/api/billing/plans` can no longer report an available
 * offer. The component's chip code survives for the day it comes back; what is
 * pinned below is that the server contract as it now stands renders plain list
 * prices and never a first-year one.
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

describe('UpgradeCheckoutButton pricing', () => {
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

  it('shows both list prices and no first-year price', async () => {
    mockPlans({ available: false, firstYearCents: null });
    render(<UpgradeCheckoutButton />);

    await waitFor(() => expect(screen.getByText('$36/yr')).toBeTruthy());
    // Nothing renews at a different number than it was bought at any more.
    expect(screen.queryByText(/first year/)).toBeNull();
    expect(screen.queryByText(/^then /)).toBeNull();
    expect(screen.getByText('$6/mo')).toBeTruthy();
  });
});

/**
 * A user reported hitting the paywall and being shown "invalid token" — Polar's
 * phrase for our own rejected organization access token, which travelled from
 * the provider through `handleAPIError` into the response body and out to the
 * button unchanged. The failure is ours; the message read as theirs.
 */
describe('UpgradeCheckoutButton failure copy', () => {
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

  /** Plans load, then the checkout POST fails with `body`. */
  function mockFailedCheckout(status: number, body: unknown) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) =>
        init?.method === 'POST'
          ? { ok: false, status, json: async () => body }
          : {
              ok: true,
              json: async () => ({
                founding: { total: 99, claimed: 0, remaining: 99, available: false, firstYearCents: null },
              }),
            },
      ),
    );
  }

  it('never shows the provider’s wording for a provider failure', async () => {
    mockFailedCheckout(502, {
      error: 'API error occurred: {"error":"Unauthorized","detail":"Invalid token"}',
      code: 'BILLING_PROVIDER_UNAVAILABLE',
    });
    render(<UpgradeCheckoutButton />);

    await waitFor(() => expect(screen.getByText('$36/yr')).toBeTruthy());
    screen.getByRole('button', { name: 'Upgrade' }).click();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('temporarily unavailable');
    expect(alert.textContent).not.toMatch(/token/i);
  });

  it('falls back when the failure carries no code we wrote', async () => {
    // What a gateway 502 looks like: an `error` string, no code of ours.
    mockFailedCheckout(502, { error: 'Bad Gateway' });
    render(<UpgradeCheckoutButton />);

    await waitFor(() => expect(screen.getByText('$36/yr')).toBeTruthy());
    screen.getByRole('button', { name: 'Upgrade' }).click();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain("couldn't start checkout");
    expect(alert.textContent).not.toContain('Bad Gateway');
  });
});

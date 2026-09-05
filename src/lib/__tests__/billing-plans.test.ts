import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  isFeatureKey,
  isFeatureWithheld,
  WITHHELD_FEATURES,
  FEATURE_KEYS,
  FOUNDING_CAP,
  UNLIMITED,
  featuresForProductId,
  foundingOffer,
  FOUNDING_FIRST_YEAR_CENTS,
  getPlans,
  isUnlimited,
  limitsForFeatures,
  listedPlans,
  planFor,
  planForProductId,
  PLUS_COMING_SOON_FEATURE_BULLETS,
  PLUS_FOUNDING_BADGE,
} from '../billing-plans';

describe('billing-plans registry', () => {
  it('exposes the shared_spaces feature key', () => {
    expect(FEATURE_KEYS).toContain('shared_spaces');
  });

  it('has no season_pass key — Plus includes every season via challenges', () => {
    expect(FEATURE_KEYS).not.toContain('season_pass');
    expect(FEATURE_KEYS).toContain('challenges');
  });

  it('resolves free limits when no features', () => {
    expect(limitsForFeatures([])).toEqual({ ownedSpaces: 0, membersPerSpace: 50 });
  });

  it('resolves Plus limits for shared_spaces', () => {
    expect(limitsForFeatures(['shared_spaces'])).toEqual({
      ownedSpaces: UNLIMITED,
      membersPerSpace: 50,
    });
  });

  it('returns empty features for unknown product ids', () => {
    expect(featuresForProductId('prod_unknown')).toEqual([]);
    expect(planForProductId('prod_unknown')).toBeNull();
  });

  it('listedPlans only includes entries with product ids when env is set', () => {
    const listed = listedPlans();
    for (const plan of listed) {
      expect(plan.listed).toBe(true);
      expect(plan.productId).toBeTruthy();
    }
  });

  it('exposes founding badge and cap', () => {
    expect(PLUS_FOUNDING_BADGE).toBe('Founding');
    expect(FOUNDING_CAP).toBe(99);
  });

  it('no longer promises Review or Challenges as coming — they shipped in 3.0', () => {
    // The two bullets moved into SHARED_SPACES_ADDON_FEATURE_BULLETS, which is asserted in
    // shared-spaces-limits.test.ts. Nothing else is promised, so the list is empty and both
    // surfaces hide the heading.
    expect(PLUS_COMING_SOON_FEATURE_BULLETS).toHaveLength(0);
  });
});

describe('pricing model', () => {
  const plans = getPlans();
  const plus = (interval: 'month' | 'year') =>
    plans.find((p) => p.key === 'plus' && p.interval === interval);
  const connector = (interval: 'month' | 'year') =>
    plans.find((p) => p.key === 'connector' && p.interval === interval);
  const church = (interval: 'month' | 'year') =>
    plans.find((p) => p.key === 'church' && p.interval === interval);

  it('prices Plus at $7/mo and $49/yr, both listed', () => {
    expect(plus('month')?.amountCents).toBe(700);
    expect(plus('month')?.listed).toBe(true);
    expect(plus('year')?.amountCents).toBe(4900);
    expect(plus('year')?.listed).toBe(true);
  });

  it('has exactly one Plus row per interval — founding is a discount, not a product', () => {
    expect(plans.filter((p) => p.key === 'plus')).toHaveLength(2);
  });

  it('discounts annual hard enough to be the obvious choice', () => {
    // Polar takes 5% + 50c, so the flat fee alone is 7% of a $7 charge and 1% of
    // a $49 one. Annual must stay well under twelve months for that to pay off.
    const twelveMonths = plus('month')!.amountCents * 12;
    expect(plus('year')!.amountCents).toBeLessThan(twelveMonths * 0.65);
  });

  it('prices the founding first year below the annual list price', () => {
    expect(FOUNDING_FIRST_YEAR_CENTS).toBe(3500);
    expect(FOUNDING_FIRST_YEAR_CENTS).toBeLessThan(plus('year')!.amountCents);
  });

  it('prices Connector at $5/mo with NO annual discount', () => {
    expect(connector('month')?.amountCents).toBe(500);
    expect(connector('year')?.amountCents).toBe(connector('month')!.amountCents * 12);
  });

  it('prices Church at $30/mo with a 40% annual discount', () => {
    expect(church('month')?.amountCents).toBe(3000);
    // Pin the *intent*, not the literal 21600 — a future monthly change must
    // not silently drift the discount a church was sold on.
    expect(church('year')?.amountCents).toBe(
      Math.round(church('month')!.amountCents * 12 * 0.6),
    );
  });

  it('never lists Church on the personal upgrade page', () => {
    // Churches buy from the My Church hub; the buyer is a staff member paying
    // for the org, not for themselves.
    expect(church('month')?.listed).toBe(false);
    expect(church('year')?.listed).toBe(false);
  });

  it('Plus grants every consumer feature; Connector grants only its own', () => {
    expect(plus('month')?.features).toEqual(
      expect.arrayContaining(['shared_spaces', 'review', 'challenges']),
    );
    expect(connector('month')?.features).toEqual(['connector']);
    expect(connector('month')?.features).not.toContain('shared_spaces');
  });

  /*
   * What actually hides Challenges.
   *
   * Note that Plus still *grants* the key above — that is deliberate, so every subscriber
   * already holds a live row and none of them needs a backfill on the day it returns. The
   * withholding is a separate switch, and it has to be, because dropping a key from a plan
   * hides nothing: `listActiveFeatureKeys` reads rows from `Entitlements`, so anyone already
   * holding one keeps their access. That was tried first and left the feature up for exactly
   * the accounts most likely to be surprised by it.
   *
   * Both enforcement points read `isFeatureWithheld` — `hasEntitlementForUserId` on the server
   * and `useHasFeature` on the client. Deleting this test to make a change pass is the mistake
   * it exists to catch; remove it when Challenges is deliberately turned back on.
   */
  it('challenges is withheld from everyone, whatever they hold', () => {
    expect(isFeatureWithheld('challenges')).toBe(true);
    expect(WITHHELD_FEATURES).toContain('challenges');
    // The paid feature on the same surface must not be caught by the same switch.
    expect(isFeatureWithheld('review')).toBe(false);
    expect(isFeatureWithheld('shared_spaces')).toBe(false);
    // Still a real key, so a row issued before this reads rather than throwing.
    expect(isFeatureKey('challenges')).toBe(true);
  });

  it('Connector grants no hosting limits', () => {
    expect(isUnlimited(connector('month')!.limits.ownedSpaces)).toBe(false);
    expect(connector('month')!.limits.ownedSpaces).toBe(0);
  });
});

describe('founding vs standard product resolution', () => {
  const ENV_KEYS = [
    'POLAR_PLUS_FOUNDING_DISCOUNT_ID',
    'POLAR_PLUS_PRODUCT_MONTHLY',
    'POLAR_PLUS_PRODUCT_ANNUAL',
    'POLAR_CONNECTOR_PRODUCT_MONTHLY',
    'POLAR_CONNECTOR_PRODUCT_ANNUAL',
  ] as const;
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
  });

  it('the founding offer rides the annual product, not one of its own', () => {
    const offer = foundingOffer();
    expect(offer?.plan.productId).toBe(planFor('plus', 'year')!.productId);
    expect(offer?.plan.amountCents).toBe(4900);
    expect(offer?.firstYearCents).toBe(3500);
    expect(offer?.discountId).toBe('prod_polar_plus_founding_discount_id');
  });

  it('has no founding offer when the discount id is unset', () => {
    delete process.env.POLAR_PLUS_FOUNDING_DISCOUNT_ID;
    expect(foundingOffer()).toBeNull();
    // The annual plan is still perfectly sellable at list.
    expect(planFor('plus', 'year')?.amountCents).toBe(4900);
  });

  it('planFor returns both listed Plus intervals', () => {
    expect(planFor('plus', 'month')?.amountCents).toBe(700);
    expect(planFor('plus', 'year')?.amountCents).toBe(4900);
  });

  it('keeps Connector in the registry but unlisted until it ships', () => {
    expect(getPlans().some((p) => p.key === 'connector')).toBe(true);
    expect(listedPlans().some((p) => p.key === 'connector')).toBe(false);
    expect(planFor('connector', 'month')).toBeNull();
  });

  it('a founder buys the same features as anyone else on Plus', () => {
    expect(featuresForProductId(foundingOffer()!.plan.productId)).toEqual(
      featuresForProductId(planFor('plus', 'month')!.productId),
    );
  });
});

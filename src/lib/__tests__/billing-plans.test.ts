import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FEATURE_KEYS,
  FOUNDING_CAP,
  UNLIMITED,
  featuresForProductId,
  foundingPlan,
  getPlans,
  isFoundingProductId,
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

  it('exposes founding badge, cap, and Plus coming-soon bullets', () => {
    expect(PLUS_FOUNDING_BADGE).toBe('Founding');
    expect(FOUNDING_CAP).toBe(99);
    expect(PLUS_COMING_SOON_FEATURE_BULLETS.length).toBeGreaterThanOrEqual(2);
    expect(PLUS_COMING_SOON_FEATURE_BULLETS.some((b) => /Review/i.test(b))).toBe(true);
    expect(PLUS_COMING_SOON_FEATURE_BULLETS.some((b) => /Challenges/i.test(b))).toBe(true);
  });
});

describe('pricing model', () => {
  const plans = getPlans();
  const plus = (interval: 'month' | 'year', founding = false) =>
    plans.find((p) => p.key === 'plus' && p.interval === interval && Boolean(p.founding) === founding);
  const connector = (interval: 'month' | 'year') =>
    plans.find((p) => p.key === 'connector' && p.interval === interval);

  it('prices Plus at $8/mo and $64/yr', () => {
    expect(plus('month')?.amountCents).toBe(800);
    expect(plus('year')?.amountCents).toBe(6400);
  });

  it('prices founding at $45/yr, annual only', () => {
    const founder = plus('year', true);
    expect(founder?.amountCents).toBe(4500);
    expect(founder?.interval).toBe('year');
    expect(plans.filter((p) => p.founding && p.interval === 'month')).toHaveLength(0);
  });

  it('gives Plus annual a real discount (four months free)', () => {
    const monthly = plus('month')!.amountCents * 12;
    const annual = plus('year')!.amountCents;
    expect(annual).toBe(monthly - plus('month')!.amountCents * 4);
    expect(annual).toBeLessThan(monthly);
  });

  it('prices Connector at $5/mo with NO annual discount', () => {
    expect(connector('month')?.amountCents).toBe(500);
    expect(connector('year')?.amountCents).toBe(connector('month')!.amountCents * 12);
  });

  it('Plus grants every consumer feature; Connector grants only its own', () => {
    expect(plus('month')?.features).toEqual(
      expect.arrayContaining(['shared_spaces', 'review', 'challenges']),
    );
    expect(connector('month')?.features).toEqual(['connector']);
    expect(connector('month')?.features).not.toContain('shared_spaces');
  });

  it('Connector grants no hosting limits', () => {
    expect(isUnlimited(connector('month')!.limits.ownedSpaces)).toBe(false);
    expect(connector('month')!.limits.ownedSpaces).toBe(0);
  });
});

describe('founding vs standard product resolution', () => {
  const ENV_KEYS = [
    'POLAR_PLUS_PRODUCT_FOUNDING_ANNUAL',
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

  it('founding resolves to the $45 annual product', () => {
    const founder = foundingPlan();
    expect(founder?.amountCents).toBe(4500);
    expect(founder?.productId).toBe('prod_polar_plus_product_founding_annual');
    expect(isFoundingProductId(founder!.productId)).toBe(true);
  });

  it('planFor never returns the founding product — standard annual is $64', () => {
    const standardAnnual = planFor('plus', 'year');
    expect(standardAnnual?.amountCents).toBe(6400);
    expect(standardAnnual?.founding).toBeUndefined();
    expect(isFoundingProductId(standardAnnual!.productId)).toBe(false);
  });

  it('standard Plus products are not mistaken for founding', () => {
    expect(isFoundingProductId(planFor('plus', 'month')!.productId)).toBe(false);
    const connectorMonth = getPlans().find((p) => p.key === 'connector' && p.interval === 'month');
    expect(isFoundingProductId(connectorMonth!.productId)).toBe(false);
    expect(isFoundingProductId('prod_unknown')).toBe(false);
    expect(isFoundingProductId(null)).toBe(false);
  });

  it('keeps Connector in the registry but unlisted until it ships', () => {
    expect(getPlans().some((p) => p.key === 'connector')).toBe(true);
    expect(listedPlans().some((p) => p.key === 'connector')).toBe(false);
    expect(planFor('connector', 'month')).toBeNull();
  });

  it('the founding product grants the same features as standard Plus', () => {
    expect(featuresForProductId(foundingPlan()!.productId)).toEqual(
      featuresForProductId(planFor('plus', 'year')!.productId),
    );
  });
});

import { describe, expect, it } from 'vitest';
import {
  FEATURE_KEYS,
  featuresForPriceId,
  limitsForFeatures,
  listedPlans,
  planForPriceId,
} from '../billing-plans';

describe('billing-plans registry', () => {
  it('exposes the shared_spaces feature key', () => {
    expect(FEATURE_KEYS).toContain('shared_spaces');
  });

  it('resolves free limits when no features', () => {
    expect(limitsForFeatures([])).toEqual({ ownedSpaces: 0, membersPerSpace: 30 });
  });

  it('resolves Plus limits for shared_spaces', () => {
    expect(limitsForFeatures(['shared_spaces'])).toEqual({ ownedSpaces: 10, membersPerSpace: 30 });
  });

  it('returns empty features for unknown price ids', () => {
    expect(featuresForPriceId('pri_unknown')).toEqual([]);
    expect(planForPriceId('pri_unknown')).toBeNull();
  });

  it('listedPlans only includes entries with price ids when env is set', () => {
    const listed = listedPlans();
    for (const plan of listed) {
      expect(plan.listed).toBe(true);
      expect(plan.priceId).toBeTruthy();
      expect(plan.features).toContain('shared_spaces');
    }
  });
});

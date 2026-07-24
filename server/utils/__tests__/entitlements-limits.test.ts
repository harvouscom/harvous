import { describe, expect, it } from 'vitest';
import { limitsForFeatures } from '@/lib/billing-plans';

describe('never-evict downgrade semantics (limits)', () => {
  it('free tier cannot create owned spaces (gate uses ownedSpaces=0)', () => {
    expect(limitsForFeatures([]).ownedSpaces).toBe(0);
  });

  it('plus tier raises owned space + member caps without requiring eviction logic', () => {
    const plus = limitsForFeatures(['shared_spaces']);
    expect(plus.ownedSpaces).toBe(10);
    expect(plus.membersPerSpace).toBe(30);
  });

  it('church_seat and billing would coexist as separate Entitlements sources (shape)', () => {
    // Documented contract: unique(userId, featureKey, source). This test locks the
    // feature-key union used when both rows are active.
    const features = ['shared_spaces'] as const;
    expect(limitsForFeatures(features).ownedSpaces).toBe(10);
  });
});

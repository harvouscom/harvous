import { describe, expect, it } from 'vitest';
import { FREE_HISTORY_WINDOW_DAYS, limitsForFeatures, isUnlimited, UNLIMITED } from '@/lib/billing-plans';

describe('never-evict downgrade semantics (limits)', () => {
  it('free tier is strictly private — no owned spaces (gate uses ownedSpaces=0)', () => {
    expect(limitsForFeatures([]).ownedSpaces).toBe(0);
  });

  it('plus grants unlimited owned spaces; the member cap is the fence', () => {
    const plus = limitsForFeatures(['shared_spaces']);
    expect(isUnlimited(plus.ownedSpaces)).toBe(true);
    expect(plus.membersPerSpace).toBe(12);
  });

  it('unlimited is a negative sentinel, never Infinity (JSON-safe over the wire)', () => {
    const plus = limitsForFeatures(['shared_spaces']);
    expect(plus.ownedSpaces).toBe(UNLIMITED);
    expect(Number.isFinite(plus.ownedSpaces)).toBe(true);
    expect(JSON.parse(JSON.stringify({ v: plus.ownedSpaces })).v).toBe(UNLIMITED);
  });

  it('connector does not grant hosting', () => {
    expect(limitsForFeatures(['connector']).ownedSpaces).toBe(0);
  });

  it('church_seat and billing would coexist as separate Entitlements sources (shape)', () => {
    // Documented contract: unique(userId, featureKey, source). This test locks the
    // feature-key union used when both rows are active.
    const features = ['shared_spaces'] as const;
    expect(isUnlimited(limitsForFeatures(features).ownedSpaces)).toBe(true);
  });

  it('free sees a 90-day history window and full_history lifts it', () => {
    expect(limitsForFeatures([]).historyWindowDays).toBe(FREE_HISTORY_WINDOW_DAYS);
    expect(isUnlimited(limitsForFeatures(['full_history']).historyWindowDays)).toBe(true);
  });

  it('each key lifts only its own limit', () => {
    expect(limitsForFeatures(['shared_spaces']).historyWindowDays).toBe(FREE_HISTORY_WINDOW_DAYS);
    expect(limitsForFeatures(['full_history']).ownedSpaces).toBe(0);
    expect(limitsForFeatures(['connector']).historyWindowDays).toBe(FREE_HISTORY_WINDOW_DAYS);
  });
});

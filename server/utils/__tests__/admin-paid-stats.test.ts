/**
 * The paid split has to agree with the gate.
 *
 * The dashboard used to bucket accounts by `UserMetadata.tier`, a retired notes-quota label
 * the schema had already documented as no longer meaning what the name implied. These tests
 * pin the replacement to the one rule that matters: the set of features the dashboard counts
 * is derived from `WITHHELD_FEATURES`, never restated, so a key moving in or out changes what
 * is counted on the same commit that changes what is allowed.
 */
import { describe, expect, it } from 'vitest';
import { FEATURE_KEYS, WITHHELD_FEATURES, isFeatureWithheld } from '@/lib/billing-plans';
import { grantedAccounts, nonWithheldFeatureKeys, paidRatePct } from '../admin-paid-stats';

describe('nonWithheldFeatureKeys', () => {
  it('excludes every withheld key and keeps the rest', () => {
    const keys = nonWithheldFeatureKeys();
    for (const withheld of WITHHELD_FEATURES) {
      expect(keys).not.toContain(withheld);
    }
    for (const key of FEATURE_KEYS) {
      if (!isFeatureWithheld(key)) expect(keys).toContain(key);
    }
  });

  it('is derived from the withheld list rather than a second hardcoded one', () => {
    // The count is the only safe assertion here: hardcoding "review, shared_spaces, connector"
    // would reintroduce exactly the drift this function exists to prevent.
    expect(nonWithheldFeatureKeys()).toHaveLength(FEATURE_KEYS.length - WITHHELD_FEATURES.length);
  });

  it('never returns a key the gate would refuse', () => {
    for (const key of nonWithheldFeatureKeys()) {
      expect(isFeatureWithheld(key)).toBe(false);
    }
  });
});

describe('paidRatePct', () => {
  it('is 0 rather than NaN when there are no accounts', () => {
    expect(paidRatePct(0, 0)).toBe(0);
    expect(paidRatePct(5, 0)).toBe(0);
  });

  it('rounds to whole percent', () => {
    expect(paidRatePct(1, 3)).toBe(33);
    expect(paidRatePct(2, 3)).toBe(67);
    expect(paidRatePct(12, 400)).toBe(3);
  });
});

describe('grantedAccounts', () => {
  it('is paid minus billing', () => {
    expect(grantedAccounts(16, 12)).toBe(4);
    expect(grantedAccounts(12, 12)).toBe(0);
  });

  it('clamps at 0 when the two aggregates disagree', () => {
    // They come from separate FILTERs over a table that can change between them; a negative
    // "Granted" segment on the dashboard is worse than a momentarily stale one.
    expect(grantedAccounts(3, 5)).toBe(0);
  });
});

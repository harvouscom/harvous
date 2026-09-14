import { describe, expect, it } from 'vitest';
import {
  parseBackfillArgs,
  planFeatureKeyBackfill,
  type BackfillEntitlementRow,
} from '../backfill-feature-key';

const keys = { target: 'full_history', from: 'shared_spaces' } as const;

function entitlement(overrides: Partial<BackfillEntitlementRow> = {}): BackfillEntitlementRow {
  return {
    userId: 'user_a',
    featureKey: 'shared_spaces',
    status: 'active',
    source: 'billing',
    providerRef: 'sub_1',
    productId: 'prod_plus',
    ...overrides,
  };
}

describe('planFeatureKeyBackfill', () => {
  it('grants the new key beside every active source row, copying its billing references', () => {
    const plan = planFeatureKeyBackfill([entitlement()], keys);
    expect(plan.inserts).toEqual([
      { userId: 'user_a', source: 'billing', providerRef: 'sub_1', productId: 'prod_plus' },
    ]);
    expect(plan.insertsBySource).toEqual({ billing: 1 });
  });

  it('covers comped and church rows as well as billing, one row per source', () => {
    const plan = planFeatureKeyBackfill(
      [
        entitlement(),
        entitlement({ source: 'admin_grant', providerRef: null, productId: null }),
        entitlement({ userId: 'user_b', source: 'church_seat', providerRef: null, productId: null }),
      ],
      keys,
    );
    expect(plan.inserts).toHaveLength(3);
    expect(plan.insertsBySource).toEqual({ billing: 1, admin_grant: 1, church_seat: 1 });
  });

  it('leaves an account that already holds the key alone, so a second run grants nothing', () => {
    const plan = planFeatureKeyBackfill(
      [entitlement(), entitlement({ featureKey: 'full_history' })],
      keys,
    );
    expect(plan.inserts).toEqual([]);
    expect(plan.alreadyActive).toBe(1);
  });

  it('never revives a target row that was canceled', () => {
    const plan = planFeatureKeyBackfill(
      [entitlement(), entitlement({ featureKey: 'full_history', status: 'canceled' })],
      keys,
    );
    expect(plan.inserts).toEqual([]);
    expect(plan.skippedInactive).toBe(1);
  });

  it('ignores source rows that are no longer active', () => {
    const plan = planFeatureKeyBackfill([entitlement({ status: 'canceled' })], keys);
    expect(plan.inserts).toEqual([]);
    expect(plan.alreadyActive + plan.skippedInactive).toBe(0);
  });

  it('matches existing target rows by source, not just by account', () => {
    const plan = planFeatureKeyBackfill(
      [
        entitlement({ source: 'admin_grant' }),
        entitlement({ featureKey: 'full_history', source: 'billing' }),
      ],
      keys,
    );
    expect(plan.inserts).toEqual([
      { userId: 'user_a', source: 'admin_grant', providerRef: 'sub_1', productId: 'prod_plus' },
    ]);
  });
});

describe('parseBackfillArgs', () => {
  it('reads the target, the source, and --apply in any order', () => {
    expect(parseBackfillArgs(['full_history', '--from', 'shared_spaces', '--apply'])).toEqual({
      target: 'full_history',
      from: 'shared_spaces',
      apply: true,
    });
    expect(parseBackfillArgs(['--production', '--from', 'shared_spaces', 'full_history'])).toEqual({
      target: 'full_history',
      from: 'shared_spaces',
      apply: false,
    });
  });

  it('refuses unknown keys, a missing source, and a key backfilled from itself', () => {
    expect(parseBackfillArgs(['not_a_key', '--from', 'shared_spaces'])).toBeNull();
    expect(parseBackfillArgs(['full_history'])).toBeNull();
    expect(parseBackfillArgs(['full_history', '--from', 'full_history'])).toBeNull();
  });
});

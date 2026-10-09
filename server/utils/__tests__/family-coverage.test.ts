/**
 * Family coverage — who gets which rows, and the rules that keep coverage from leaking.
 * The shape is pure (`targetFamilyCoverage`); the rest are source assertions on the files
 * that would have to change for coverage to chain, include hosting, or be forgotten by a
 * billing writer.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db', () => ({}));

import { targetFamilyCoverage } from '../family-entitlements';
import {
  FAMILY_COVERED_FEATURES,
  FAMILY_MAX_MEMBERS,
  FAMILY_SPONSOR_SOURCES,
  PLUS_FEATURE_KEYS,
  getPlans,
} from '@/lib/billing-plans';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('targetFamilyCoverage', () => {
  it('covers every member but the owner with what the owner pays for', () => {
    const rows = targetFamilyCoverage({
      ownerUserId: 'owner',
      memberUserIds: ['owner', 'teen', 'spouse'],
      sponsorKeys: ['review', 'full_history'],
    });
    expect(rows).toEqual([
      { userId: 'teen', featureKey: 'review' },
      { userId: 'teen', featureKey: 'full_history' },
      { userId: 'spouse', featureKey: 'review' },
      { userId: 'spouse', featureKey: 'full_history' },
    ]);
  });

  it('never passes hosting on, even when the owner has it', () => {
    const rows = targetFamilyCoverage({
      ownerUserId: 'owner',
      memberUserIds: ['owner', 'teen'],
      sponsorKeys: ['shared_spaces', 'review'],
    });
    expect(rows.map((r) => r.featureKey)).toEqual(['review']);
  });

  it('covers no one when the owner pays for nothing', () => {
    expect(targetFamilyCoverage({ ownerUserId: 'owner', memberUserIds: ['owner', 'teen'], sponsorKeys: [] })).toEqual([]);
  });
});

describe('family coverage constants', () => {
  it('covers only Plus study features, never hosting', () => {
    for (const key of FAMILY_COVERED_FEATURES) expect(PLUS_FEATURE_KEYS).toContain(key);
    expect(FAMILY_COVERED_FEATURES).not.toContain('shared_spaces');
  });

  it('fits inside the shared-space people cap', () => {
    const plus = getPlans().find((plan) => plan.key === 'plus');
    expect(plus).toBeDefined();
    expect(FAMILY_MAX_MEMBERS).toBeLessThanOrEqual(plus!.limits.membersPerSpace);
    expect(FAMILY_MAX_MEMBERS).toBe(6);
  });

  it('is sponsored only by what the owner holds themself', () => {
    expect([...FAMILY_SPONSOR_SOURCES].sort()).toEqual(['admin_grant', 'billing']);
  });
});

describe('every billing writer reconciles the family', () => {
  const text = source('server/utils/entitlements.ts');
  const fn = (name: string) => {
    const start = text.indexOf(`function ${name}(`);
    expect(start, `${name} not found`).toBeGreaterThan(-1);
    const next = text.indexOf('\nexport ', start + 1);
    const nextPrivate = text.indexOf('\nasync function ', start + 1);
    const end = [next, nextPrivate].filter((i) => i > -1).sort((a, b) => a - b)[0];
    return text.slice(start, end);
  };

  it.each(['setEntitlementsForProduct', 'setFeatureEntitlement', 'cancelBillingEntitlements', 'syncEntitlementsFromProvider'])(
    '%s calls the family reconcile',
    (name) => {
      expect(fn(name)).toContain('reconcileFamilyAfterWrite(');
    },
  );

  it('never lets a family row sponsor another family row', () => {
    expect(fn('reconcileFamilyAfterWrite')).toContain("if (source === 'family') return;");
    const coverage = source('server/utils/family-entitlements.ts');
    expect(coverage).toContain('inArray(Entitlements.source, [...FAMILY_SPONSOR_SOURCES])');
    // No import of entitlements.ts — that would be a cycle.
    expect(coverage).not.toMatch(/from '\.\/entitlements'/);
  });
});

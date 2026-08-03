import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { churchIdFromPolarData } from '../../utils/polar-webhook';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('church plan registry', () => {
  const plans = () => source('src/lib/billing-plans.ts');

  it('grants no personal feature keys', () => {
    // A church subscription must never hand the staff buyer a free Plus, and
    // cancelling it must never revoke their own personal plan.
    expect(plans()).toContain('const CHURCH_FEATURES = [] as const');
    expect(plans()).toContain("features: CHURCH_FEATURES");
  });

  it('keeps church plans off the personal upgrade page', () => {
    const churchBlock = plans().slice(plans().indexOf("key: 'church'"));
    expect(churchBlock).toContain('listed: false');
    // listedPlans() is what /upgrade renders — church must never qualify.
    expect(plans()).toContain('return getPlans().filter((p) => p.listed && p.productId)');
  });
});

describe('polar webhook church routing', () => {
  it('reads churchId only from checkout metadata', () => {
    expect(churchIdFromPolarData({ metadata: { churchId: 'chur_1' } })).toBe('chur_1');
    expect(churchIdFromPolarData({ metadata: { churchId: '  chur_2  ' } })).toBe('chur_2');
    expect(churchIdFromPolarData({ metadata: { churchId: '' } })).toBeNull();
    expect(churchIdFromPolarData({ metadata: { churchId: 42 as unknown as string } })).toBeNull();
    expect(churchIdFromPolarData({ metadata: {} })).toBeNull();
    expect(churchIdFromPolarData(null)).toBeNull();
  });

  it('handles the church branch before the user entitlement path', () => {
    const hook = source('server/routes/webhooks.ts');
    const churchBranch = hook.indexOf('isChurchProductId(eventProductId)');
    const userPath = hook.indexOf('const userId = externalUserIdFromPolarData(data)');
    expect(churchBranch).toBeGreaterThan(-1);
    expect(userPath).toBeGreaterThan(-1);
    // Order is the invariant: a church event must return before it can reach
    // applyPolarSubscriptionEntitlement.
    expect(churchBranch).toBeLessThan(userPath);
  });

  it('writes Churches, never Entitlements, on a church event', () => {
    const hook = source('server/routes/webhooks.ts');
    const branch = hook.slice(
      hook.indexOf('isChurchProductId(eventProductId)'),
      hook.indexOf('const userId = externalUserIdFromPolarData(data)'),
    );
    expect(branch).toContain('applyChurchSubscription');
    expect(branch).not.toContain('applyPolarSubscriptionEntitlement');
    // Cancels arrive without metadata — the stored subscription id is the fallback.
    expect(branch).toContain('findChurchBySubscriptionId');
  });

  it('skips church subscriptions when reconciling a user’s personal plan', () => {
    // Without this, a staff buyer's church sub counts as "granted from Polar"
    // and keeps their canceled personal billing rows alive forever.
    const entitlements = source('server/utils/entitlements.ts');
    expect(entitlements).toContain('if (isChurchProductId(productId)) continue;');
    expect(entitlements.indexOf('isChurchProductId(productId)')).toBeLessThan(
      entitlements.indexOf('grantedFromPolar = true'),
    );
  });
});

describe('church checkout route contract', () => {
  const route = () => source('server/routes/church.ts');

  it('is staff-gated and stamps the church id into metadata', () => {
    const checkout = route().slice(route().indexOf("'/api/church/checkout'"));
    expect(checkout).toContain('isChurchStaffForOrg');
    expect(checkout).toContain('churchId: church.id');
    // The buyer is still the Polar customer — they hold the card.
    expect(checkout).toContain('externalCustomerId: auth.userId');
  });

  it('refuses to double-charge a church that already has a plan', () => {
    const checkout = route().slice(route().indexOf("'/api/church/checkout'"));
    expect(checkout).toContain("code: 'CHURCH_ALREADY_PAID'");
  });

  it('keeps billing status staff-only', () => {
    const billing = route().slice(
      route().indexOf("'/api/church/billing'"),
      route().indexOf("'/api/church/checkout'"),
    );
    expect(billing).toContain('isChurchStaffForOrg');
    expect(billing).toContain("code: 'CHURCH_STAFF_REQUIRED'");
  });
});

describe('pilot backfill safety', () => {
  const script = () => source('server/scripts/backfill-church-pilot-window.ts');

  it('never shortens an existing window or touches a paying church', () => {
    expect(script()).toContain('isNull(Churches.billingPlan)');
    expect(script()).toContain('isNull(Churches.pilotUntil)');
    expect(script()).toContain('eq(Churches.isActive, true)');
  });

  it('is dry-run unless --apply is passed', () => {
    expect(script()).toContain("const apply = process.argv.includes('--apply')");
    expect(script()).toContain('Dry run');
  });
});

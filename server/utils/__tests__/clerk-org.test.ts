import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ClerkOrgError,
  CLERK_ORG_STAFF_CAP,
  computeStaffSyncPlan,
  fetchClerkOrgMemberships,
  isValidClerkOrgId,
  isWithinClerkOrgStaffCap,
} from '../clerk-org';

describe('isWithinClerkOrgStaffCap', () => {
  it('allows up to the standard Clerk org staff ceiling', () => {
    expect(CLERK_ORG_STAFF_CAP).toBe(20);
    expect(isWithinClerkOrgStaffCap(0)).toBe(true);
    expect(isWithinClerkOrgStaffCap(20)).toBe(true);
    expect(isWithinClerkOrgStaffCap(21)).toBe(false);
  });
});

describe('isValidClerkOrgId', () => {
  it('accepts Clerk org ids', () => {
    expect(isValidClerkOrgId('org_2abcDEF123')).toBe(true);
  });

  it('rejects non-org ids and malformed input', () => {
    expect(isValidClerkOrgId('user_2abcDEF123')).toBe(false);
    expect(isValidClerkOrgId('org_')).toBe(false);
    expect(isValidClerkOrgId('org_abc def')).toBe(false);
    expect(isValidClerkOrgId('')).toBe(false);
    expect(isValidClerkOrgId('org_abc;DROP')).toBe(false);
  });
});

describe('computeStaffSyncPlan', () => {
  const owner = 'user_owner';

  it('plans inserts for a fresh space (owner row exists, staff have none)', () => {
    const plan = computeStaffSyncPlan({
      spaceOwnerUserId: owner,
      staff: [
        { userId: owner, role: 'org:admin' },
        { userId: 'user_a', role: 'org:member' },
        { userId: 'user_b', role: 'org:pastor' },
      ],
      existing: [{ userId: owner, role: 'owner' }],
    });
    expect(plan.toInsertLeaders.sort()).toEqual(['user_a', 'user_b']);
    expect(plan.toPromoteToLeader).toEqual([]);
    expect(plan.toRemove).toEqual([]);
    expect(plan.healOwnerRow).toBe(false);
    expect(plan.warnings).toEqual([]);
  });

  it('is a no-op on re-run with no Clerk changes', () => {
    const plan = computeStaffSyncPlan({
      spaceOwnerUserId: owner,
      staff: [
        { userId: owner, role: 'org:admin' },
        { userId: 'user_a', role: 'org:member' },
      ],
      existing: [
        { userId: owner, role: 'owner' },
        { userId: 'user_a', role: 'leader' },
      ],
    });
    expect(plan.toInsertLeaders).toEqual([]);
    expect(plan.toPromoteToLeader).toEqual([]);
    expect(plan.toRemove).toEqual([]);
    expect(plan.healOwnerRow).toBe(false);
  });

  it('promotes an existing member row to leader when they are org staff', () => {
    const plan = computeStaffSyncPlan({
      spaceOwnerUserId: owner,
      staff: [{ userId: 'user_a', role: 'org:member' }],
      existing: [
        { userId: owner, role: 'owner' },
        { userId: 'user_a', role: 'member' },
      ],
    });
    expect(plan.toPromoteToLeader).toEqual(['user_a']);
    expect(plan.toInsertLeaders).toEqual([]);
  });

  it('removes leader rows for people no longer in the org', () => {
    const plan = computeStaffSyncPlan({
      spaceOwnerUserId: owner,
      staff: [],
      existing: [
        { userId: owner, role: 'owner' },
        { userId: 'user_gone', role: 'leader' },
      ],
    });
    expect(plan.toRemove).toEqual(['user_gone']);
  });

  it('never touches congregant member rows', () => {
    const plan = computeStaffSyncPlan({
      spaceOwnerUserId: owner,
      staff: [{ userId: owner, role: 'org:admin' }],
      existing: [
        { userId: owner, role: 'owner' },
        { userId: 'user_congregant', role: 'member' },
      ],
    });
    expect(plan.toRemove).toEqual([]);
    expect(plan.toPromoteToLeader).toEqual([]);
    expect(plan.toInsertLeaders).toEqual([]);
  });

  it('skips the owner from leader upsert and never removes the owner row', () => {
    const plan = computeStaffSyncPlan({
      spaceOwnerUserId: owner,
      staff: [{ userId: owner, role: 'org:admin' }],
      existing: [{ userId: owner, role: 'owner' }],
    });
    expect(plan.toInsertLeaders).toEqual([]);
    expect(plan.toRemove).toEqual([]);
  });

  it('warns (without demoting) when the owner is not in the Clerk org', () => {
    const plan = computeStaffSyncPlan({
      spaceOwnerUserId: owner,
      staff: [{ userId: 'user_a', role: 'org:member' }],
      existing: [{ userId: owner, role: 'owner' }],
    });
    expect(plan.warnings).toHaveLength(1);
    expect(plan.warnings[0]).toContain(owner);
    expect(plan.toRemove).toEqual([]);
  });

  it('heals a missing owner row', () => {
    const plan = computeStaffSyncPlan({
      spaceOwnerUserId: owner,
      staff: [{ userId: owner, role: 'org:admin' }],
      existing: [],
    });
    expect(plan.healOwnerRow).toBe(true);
  });

  it('removes all leaders on an empty staff list but keeps the owner', () => {
    const plan = computeStaffSyncPlan({
      spaceOwnerUserId: owner,
      staff: [],
      existing: [
        { userId: owner, role: 'owner' },
        { userId: 'user_a', role: 'leader' },
        { userId: 'user_b', role: 'leader' },
        { userId: 'user_c', role: 'member' },
      ],
    });
    expect(plan.toRemove.sort()).toEqual(['user_a', 'user_b']);
    expect(plan.healOwnerRow).toBe(false);
  });
});

describe('fetchClerkOrgMemberships', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('fails closed when CLERK_SECRET_KEY is missing', async () => {
    vi.stubEnv('CLERK_SECRET_KEY', '');
    await expect(fetchClerkOrgMemberships('org_abc')).rejects.toBeInstanceOf(ClerkOrgError);
  });

  it('paginates and consumes only role + public_user_data.user_id', async () => {
    vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_fake');
    const pageOne = {
      data: Array.from({ length: 100 }, (_, i) => ({
        id: `orgmem_${i}`,
        role: 'org:member',
        public_user_data: { user_id: `user_${i}`, extra: 'ignored' },
      })),
      total_count: 102,
    };
    const pageTwo = {
      data: [
        { id: 'orgmem_100', role: 'org:admin', public_user_data: { user_id: 'user_100' } },
        { id: 'orgmem_101', role: 'org:member', public_user_data: null },
      ],
      total_count: 102,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(pageOne), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(pageTwo), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const members = await fetchClerkOrgMemberships('org_abc');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain('limit=100&offset=0');
    expect(String(fetchMock.mock.calls[1][0])).toContain('limit=100&offset=100');
    // 101 valid rows; the null public_user_data row is skipped
    expect(members).toHaveLength(101);
    expect(members[100]).toEqual({ userId: 'user_100', role: 'org:admin' });
  });

  it('throws CLERK_UNAVAILABLE on non-OK responses', async () => {
    vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_fake');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })));
    await expect(fetchClerkOrgMemberships('org_abc')).rejects.toMatchObject({ code: 'CLERK_UNAVAILABLE' });
  });

  it('surfaces 403 as CLERK_ORGS_NOT_ENABLED (feature off for the instance)', async () => {
    vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_fake');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 403 })));
    await expect(fetchClerkOrgMemberships('org_abc')).rejects.toMatchObject({ code: 'CLERK_ORGS_NOT_ENABLED' });
  });
});

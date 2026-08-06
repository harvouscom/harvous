import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ClerkOrgError,
  CLERK_ORG_STAFF_CAP,
  computeStaffSyncPlan,
  fetchClerkOrgMemberships,
  invalidateClerkOrgMemberships,
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

  it('never reaps a granted leader, who is not in the Clerk roster by design', () => {
    /*
      The landmine this guard exists for: a volunteer granted one space is not a
      Clerk staffer and never will be, so the roster sweep would delete the
      grant on the next webhook — silently, and within a day, since sync runs on
      every staff invite, removal and role change.
    */
    const plan = computeStaffSyncPlan({
      spaceOwnerUserId: owner,
      staff: [],
      existing: [
        { userId: owner, role: 'owner' },
        { userId: 'user_volunteer', role: 'leader', grantSource: 'grant' },
        { userId: 'user_gone', role: 'leader', grantSource: 'staff_sync' },
      ],
    });
    expect(plan.toRemove).toEqual(['user_gone']);
  });

  it('treats a null grantSource as staff-projected, so old rows still reap', () => {
    // Every leader row predating grants has NULL here; it must keep meaning
    // "the sync put this here", or the sweep would quietly stop working.
    const plan = computeStaffSyncPlan({
      spaceOwnerUserId: owner,
      staff: [],
      existing: [
        { userId: owner, role: 'owner' },
        { userId: 'user_legacy', role: 'leader', grantSource: null },
      ],
    });
    expect(plan.toRemove).toEqual(['user_legacy']);
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
  // The roster is memoized per org, so every test starts from a cold cache —
  // otherwise the pagination test below feeds its 101 members to the two error
  // cases that follow it.
  beforeEach(() => {
    invalidateClerkOrgMemberships('org_abc');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    invalidateClerkOrgMemberships('org_abc');
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

/**
 * The roster memo. Rendering one church pane used to ask Clerk for the same
 * list of at most twenty people four or five times — twice inside a single
 * gate. These are the properties that make reusing it safe.
 */
describe('fetchClerkOrgMemberships caching', () => {
  const roster = { data: [{ role: 'org:admin', public_user_data: { user_id: 'user_1' } }], total_count: 1 };
  const ok = () => new Response(JSON.stringify(roster), { status: 200 });

  beforeEach(() => {
    invalidateClerkOrgMemberships('org_abc');
    invalidateClerkOrgMemberships('org_other');
    vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_fake');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    invalidateClerkOrgMemberships('org_abc');
    invalidateClerkOrgMemberships('org_other');
  });

  it('serves a second read of the same org without another Clerk request', async () => {
    const fetchMock = vi.fn().mockImplementation(ok);
    vi.stubGlobal('fetch', fetchMock);

    const first = await fetchClerkOrgMemberships('org_abc');
    const second = await fetchClerkOrgMemberships('org_abc');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('shares one request between concurrent callers', async () => {
    // The gate asks twice in a row — once for staff standing, once for the
    // role — so this is the shape that mattered most.
    const fetchMock = vi.fn().mockImplementation(ok);
    vi.stubGlobal('fetch', fetchMock);

    await Promise.all([fetchClerkOrgMemberships('org_abc'), fetchClerkOrgMemberships('org_abc')]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never caches a failure — an outage must not lock staff out for the whole TTL', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 500 }))
      .mockImplementation(ok);
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchClerkOrgMemberships('org_abc')).rejects.toMatchObject({
      code: 'CLERK_UNAVAILABLE',
    });
    // The retry goes back to Clerk rather than replaying the rejection.
    expect(await fetchClerkOrgMemberships('org_abc')).toEqual([
      { userId: 'user_1', role: 'org:admin' },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('caches per org, so one church never answers for another', async () => {
    const fetchMock = vi.fn().mockImplementation(ok);
    vi.stubGlobal('fetch', fetchMock);

    await fetchClerkOrgMemberships('org_abc');
    await fetchClerkOrgMemberships('org_other');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain('org_abc');
    expect(String(fetchMock.mock.calls[1][0])).toContain('org_other');
  });

  it('re-reads after invalidation, which is how a role change takes effect', async () => {
    const fetchMock = vi.fn().mockImplementation(ok);
    vi.stubGlobal('fetch', fetchMock);

    await fetchClerkOrgMemberships('org_abc');
    invalidateClerkOrgMemberships('org_abc');
    await fetchClerkOrgMemberships('org_abc');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

/**
 * Source-level, because the eviction is what bounds how stale a capability can
 * be. A roster write that forgot to evict would leave this process deciding
 * from the roster as it stood before the change.
 */
describe('roster writes evict the memo', () => {
  it.each(['updateClerkOrgMemberRole', 'removeClerkOrgMember'])('%s', (fn) => {
    const module = readFileSync(resolve(process.cwd(), 'server/utils/clerk-org.ts'), 'utf8');
    const start = module.indexOf(`export async function ${fn}`);
    expect(start).toBeGreaterThan(-1);
    const body = module.slice(start, module.indexOf('\n}', start));
    expect(body).toContain('invalidateClerkOrgMemberships(orgId)');
  });

  it('reconciling always reads a live roster', () => {
    // syncChurchStaffForOrg IS the "go and look at Clerk" operation — the
    // webhook and both Sync buttons route through it.
    const module = readFileSync(resolve(process.cwd(), 'server/utils/church-staff-sync.ts'), 'utf8');
    expect(module).toContain('if (!options?.staff) invalidateClerkOrgMemberships(orgId);');
  });
});

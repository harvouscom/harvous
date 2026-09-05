import { beforeEach, describe, expect, it, vi } from 'vitest';

const getActiveChurchByOrgId = vi.fn();
const isChurchStaffForChurch = vi.fn();
const churchIsSponsored = vi.fn();
const fetchClerkOrgMemberships = vi.fn();
const spaceRows = vi.fn();
const membershipRows = vi.fn();

vi.mock('../church-staff', () => ({
  getActiveChurchByOrgId: (...args: unknown[]) => getActiveChurchByOrgId(...args),
  isChurchStaffForChurch: (...args: unknown[]) => isChurchStaffForChurch(...args),
}));

vi.mock('../church-entitlement', () => ({
  churchIsSponsored: (...args: unknown[]) => churchIsSponsored(...args),
  CHURCH_LAPSED_CODE: 'CHURCH_NOT_SPONSORED',
  CHURCH_LAPSED_ERROR: 'This church does not have an active Harvous plan',
}));

vi.mock('../clerk-org', () => ({
  fetchClerkOrgMemberships: (...args: unknown[]) => fetchClerkOrgMemberships(...args),
}));

/*
  The space lane's two questions: are you in the room, and do you run it. Mocked
  rather than driven through the db stub because the real `requireSpaceAccess`
  reads the same Spaces/SpaceMemberships chain this file already uses for the
  grant arm, and the two would end up answering each other's queries.
*/
const requireSpaceAccess = vi.fn();
const canManageSpaceStructure = vi.fn();
vi.mock('../space-access', () => ({
  requireSpaceAccess: (...args: unknown[]) => requireSpaceAccess(...args),
  canManageSpaceStructure: (...args: unknown[]) => canManageSpaceStructure(...args),
}));

/*
  '../../db', not '../db'. vi.mock resolves relative to *this* file, so '../db'
  would name `server/utils/db`, which does not exist — the mock would silently
  no-op and the real Supabase client would be constructed. (A sibling suite has
  the same typo but never touches `db`, so it never noticed.)
*/
vi.mock('../../db', () => {
  /*
    Two tables are read on the fall-through path — Spaces for the room, then
    SpaceMemberships for the grant — so the stub has to know which query it is
    answering. It tracks the last `.from()` and dispatches on it.
  */
  const SPACES = { __table: 'Spaces' };
  const MEMBERSHIPS = { __table: 'SpaceMemberships' };
  let current: { __table: string } | null = null;
  const chain = {
    select: () => chain,
    from: (table: { __table: string }) => {
      current = table;
      return chain;
    },
    where: () => chain,
    limit: () => (current === MEMBERSHIPS ? membershipRows() : spaceRows()),
  };
  return {
    db: chain,
    first: (rows: unknown[]) => rows?.[0],
    Spaces: SPACES,
    SpaceMemberships: MEMBERSHIPS,
    and: vi.fn(),
    eq: vi.fn(),
    isNull: vi.fn(),
  };
});

const { assertCanViewSpaceTeachingPlan, assertCanManageSpaceTeachingPlan } = await import(
  '../church-space-plan'
);
// Moved beside its sibling predicate to break a plan<->leaders import cycle.
const { isChurchOrgSpaceRow } = await import('../channel-publish-cadence');

const CHURCH = { id: 'chur_1', orgId: 'org_1', name: 'New Hope', isActive: true };
const YOUTH = { id: 'space_youth', orgId: 'org_1', type: 'public', isActive: true, deletedAt: null };
const USER = 'user_pastor';

function allowAll() {
  spaceRows.mockResolvedValue([YOUTH]);
  // No grant by default — the grant arm is opt-in per test.
  membershipRows.mockResolvedValue([]);
  getActiveChurchByOrgId.mockResolvedValue(CHURCH);
  isChurchStaffForChurch.mockResolvedValue(true);
  churchIsSponsored.mockReturnValue(true);
  fetchClerkOrgMemberships.mockResolvedValue([{ userId: USER, role: 'org:pastor' }]);
}

beforeEach(() => {
  vi.clearAllMocks();
  allowAll();
});

describe('isChurchOrgSpaceRow', () => {
  it('accepts both kinds of room a church owns', () => {
    expect(isChurchOrgSpaceRow({ type: 'public', orgId: 'org_1' })).toBe(true);
    expect(isChurchOrgSpaceRow({ type: 'shared', orgId: 'org_1' })).toBe(true);
  });

  it('rejects a personal space wearing the same type', () => {
    // A personal shared space has no orgId; without this the gate would hand a
    // church's plan to somebody's private room.
    expect(isChurchOrgSpaceRow({ type: 'shared', orgId: null })).toBe(false);
    expect(isChurchOrgSpaceRow({ type: 'private', orgId: 'org_1' })).toBe(false);
    expect(isChurchOrgSpaceRow({})).toBe(false);
  });

  it('is wider than the broadcast predicate it sits beside', () => {
    // Ministry channels broadcast; church Shared Spaces do not. Both gather,
    // so both may carry a plan.
    expect(isChurchOrgSpaceRow({ type: 'shared', orgId: 'org_1' })).toBe(true);
  });
});

describe('space plan gates', () => {
  it('lets a pastor read and manage a ministry plan', async () => {
    expect(await assertCanViewSpaceTeachingPlan(USER, 'space_youth')).toMatchObject({
      ok: true,
      church: CHURCH,
      space: YOUTH,
    });
    expect((await assertCanManageSpaceTeachingPlan(USER, 'space_youth')).ok).toBe(true);
  });

  it('lets a teacher read but not reshape, same as the church plan', async () => {
    fetchClerkOrgMemberships.mockResolvedValue([{ userId: USER, role: 'org:teacher' }]);
    expect((await assertCanViewSpaceTeachingPlan(USER, 'space_youth')).ok).toBe(true);
    expect(await assertCanManageSpaceTeachingPlan(USER, 'space_youth')).toMatchObject({
      ok: false,
      status: 403,
      code: 'TEACHING_PLAN_ROLE_REQUIRED',
    });
  });

  it.each([
    ['a missing space', []],
    ['a personal space', [{ ...YOUTH, orgId: null, type: 'shared' }]],
    ['a private space', [{ ...YOUTH, type: 'private' }]],
    ['a deactivated space', [{ ...YOUTH, isActive: false }]],
  ])('404s %s without disclosing which', async (_label, rows) => {
    // One code for all four: telling them apart would let anyone holding an id
    // learn what kind of room it names.
    spaceRows.mockResolvedValue(rows);
    expect(await assertCanViewSpaceTeachingPlan(USER, 'space_x')).toMatchObject({
      ok: false,
      status: 404,
      code: 'SPACE_NOT_FOUND',
    });
  });

  it('404s an empty space id before touching the database', async () => {
    expect(await assertCanViewSpaceTeachingPlan(USER, '  ')).toMatchObject({
      ok: false,
      code: 'SPACE_NOT_FOUND',
    });
    expect(spaceRows).not.toHaveBeenCalled();
  });

  it('gates against the space own org, never a caller-supplied one', async () => {
    // The cross-row invariant: the church we gate against is derived from the
    // space, so a plan row can never belong to another church's room.
    await assertCanViewSpaceTeachingPlan(USER, 'space_youth');
    expect(getActiveChurchByOrgId).toHaveBeenCalledWith('org_1');
  });

  it('checks staff BEFORE sponsorship, so a stranger never learns a church lapsed', async () => {
    isChurchStaffForChurch.mockResolvedValue(false);
    churchIsSponsored.mockReturnValue(false);
    expect(await assertCanManageSpaceTeachingPlan(USER, 'space_youth')).toMatchObject({
      code: 'CHURCH_STAFF_REQUIRED',
    });
    expect(churchIsSponsored).not.toHaveBeenCalled();
  });

  it('402s a lapsed church on write but never on read', async () => {
    churchIsSponsored.mockReturnValue(false);
    expect(await assertCanManageSpaceTeachingPlan(USER, 'space_youth')).toMatchObject({
      ok: false,
      status: 402,
      code: 'CHURCH_NOT_SPONSORED',
    });
    expect((await assertCanViewSpaceTeachingPlan(USER, 'space_youth')).ok).toBe(true);
  });

  it('fails closed when Clerk is unreachable', async () => {
    fetchClerkOrgMemberships.mockRejectedValue(new Error('clerk down'));
    expect(await assertCanManageSpaceTeachingPlan(USER, 'space_youth')).toMatchObject({
      ok: false,
      status: 403,
      code: 'TEACHING_PLAN_ROLE_REQUIRED',
    });
  });
});

describe('granted leader — the P5 boundary', () => {
  /** A volunteer: not Clerk staff, no church role, holding one granted room. */
  function asGrantedVolunteer() {
    isChurchStaffForChurch.mockResolvedValue(false);
    fetchClerkOrgMemberships.mockResolvedValue([]);
    membershipRows.mockResolvedValue([{ role: 'leader', grantSource: 'grant' }]);
  }

  it('lets a granted volunteer plan the space they were given', async () => {
    // The whole point of P5: a youth leader who holds no staff seat can plan
    // their own Wednesdays.
    asGrantedVolunteer();
    expect((await assertCanManageSpaceTeachingPlan('user_volunteer', 'space_youth')).ok).toBe(true);
  });

  it('refuses a member whose row is not a grant', async () => {
    isChurchStaffForChurch.mockResolvedValue(false);
    fetchClerkOrgMemberships.mockResolvedValue([]);
    membershipRows.mockResolvedValue([{ role: 'member', grantSource: null }]);
    expect(await assertCanManageSpaceTeachingPlan('user_member', 'space_youth')).toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it('refuses a staff-projected leader row reached without staff standing', async () => {
    // grantSource must be the discriminator, not the role — otherwise every
    // synced leader row would read as a grant.
    isChurchStaffForChurch.mockResolvedValue(false);
    fetchClerkOrgMemberships.mockResolvedValue([]);
    membershipRows.mockResolvedValue([{ role: 'leader', grantSource: 'staff_sync' }]);
    expect((await assertCanManageSpaceTeachingPlan('user_x', 'space_youth')).ok).toBe(false);
  });

  it('still 402s a granted volunteer at a lapsed church', async () => {
    // The grant widens *who may plan*, never what state the church has to be
    // in. Lapsing gates writes for everyone.
    asGrantedVolunteer();
    churchIsSponsored.mockReturnValue(false);
    expect(await assertCanManageSpaceTeachingPlan('user_volunteer', 'space_youth')).toMatchObject({
      ok: false,
      status: 402,
      code: 'CHURCH_NOT_SPONSORED',
    });
  });

  it('proves belonging before revealing billing state', async () => {
    // Same property the shared resolver exists for: a non-granted stranger
    // must not learn a church has lapsed. The grant sits in the staff check's
    // seat, so sponsorship is never consulted for someone who does not belong.
    isChurchStaffForChurch.mockResolvedValue(false);
    fetchClerkOrgMemberships.mockResolvedValue([]);
    membershipRows.mockResolvedValue([]);
    churchIsSponsored.mockReturnValue(false);
    const result = await assertCanManageSpaceTeachingPlan('user_stranger', 'space_youth');
    expect(result).toMatchObject({ ok: false, status: 403 });
    expect(result).not.toMatchObject({ code: 'CHURCH_NOT_SPONSORED' });
  });

  it('404s a granted leader on a personal space', async () => {
    // A grant never upgrades what kind of room something is, and a plan is a
    // thing a room shows other people.
    asGrantedVolunteer();
    spaceRows.mockResolvedValue([{ ...YOUTH, orgId: null, type: 'personal' }]);
    expect(await assertCanManageSpaceTeachingPlan('user_volunteer', 'space_x')).toMatchObject({
      ok: false,
      status: 404,
    });
  });

  describe('the space lane (a Shared Space with no church)', () => {
    const CHURCHLESS = { ...YOUTH, orgId: null, type: 'shared' as const };

    beforeEach(() => {
      spaceRows.mockResolvedValue([CHURCHLESS]);
    });

    it('refuses a plain member the read', async () => {
      /*
        **Narrowed Sep 2026.** This used to assert the opposite — "it is the
        group's own schedule" — and the trouble was that the church lane says
        `sermon_tools`, so two rooms of identical shape answered a member
        differently depending on whether a church sat behind one of them.

        What the member keeps is `coming-up`, gated on membership alone and
        never returning an undated backlog row. That endpoint existing
        separately from this one is what makes the narrowing cost them nothing.
      */
      requireSpaceAccess.mockResolvedValue({ role: 'member', space: CHURCHLESS });
      canManageSpaceStructure.mockReturnValue(false);
      expect(await assertCanViewSpaceTeachingPlan('user_member', 'space_x')).toMatchObject({
        ok: false,
        status: 403,
        code: 'PLAN_SPACE_ROLE_REQUIRED',
      });
    });

    it('lets whoever runs the room read it', async () => {
      /*
        Only meaningful because granted leadership reached churchless rooms in
        the same change: before that, "owner or leader" here meant "owner",
        since such a room could not have a leader at all.
      */
      requireSpaceAccess.mockResolvedValue({ role: 'leader', space: CHURCHLESS });
      canManageSpaceStructure.mockReturnValue(true);
      expect(await assertCanViewSpaceTeachingPlan('user_leader', 'space_x')).toMatchObject({
        ok: true,
        lane: 'space',
        church: null,
      });
    });

    it('refuses a plain member the write', async () => {
      requireSpaceAccess.mockResolvedValue({ role: 'member', space: CHURCHLESS });
      canManageSpaceStructure.mockReturnValue(false);
      expect(await assertCanManageSpaceTeachingPlan('user_member', 'space_x')).toMatchObject({
        ok: false,
        status: 403,
        code: 'PLAN_SPACE_ROLE_REQUIRED',
      });
    });

    it('lets whoever runs the room write', async () => {
      requireSpaceAccess.mockResolvedValue({ role: 'leader', space: CHURCHLESS });
      canManageSpaceStructure.mockReturnValue(true);
      expect(await assertCanManageSpaceTeachingPlan('user_leader', 'space_x')).toMatchObject({
        ok: true,
        lane: 'space',
        church: null,
      });
    });

    it('404s a stranger rather than telling them the room exists', async () => {
      requireSpaceAccess.mockRejectedValue(new Error('no access'));
      expect(await assertCanViewSpaceTeachingPlan('user_stranger', 'space_x')).toMatchObject({
        ok: false,
        status: 404,
      });
    });

    it('never consults church billing', async () => {
      // There is no church to be lapsed. A sponsorship check here would be a
      // question about someone else's org leaking into this room.
      requireSpaceAccess.mockResolvedValue({ role: 'owner', space: CHURCHLESS });
      canManageSpaceStructure.mockReturnValue(true);
      await assertCanManageSpaceTeachingPlan('user_owner', 'space_x');
      expect(churchIsSponsored).not.toHaveBeenCalled();
      expect(getActiveChurchByOrgId).not.toHaveBeenCalled();
    });
  });

  it('never consults a Clerk role on the grant arm', async () => {
    /*
      The strongest form of "holds zero ChurchCapability": the grant path does
      not reach a role lookup at all. The capability arm short-circuits at the
      staff check (a volunteer is deliberately not staff), and the grant arm
      asks only about membership. If this ever starts calling Clerk, some
      capability has crept into the volunteer path.
    */
    asGrantedVolunteer();
    const result = await assertCanManageSpaceTeachingPlan('user_volunteer', 'space_youth');
    expect(result.ok).toBe(true);
    expect(fetchClerkOrgMemberships).not.toHaveBeenCalled();
  });
});

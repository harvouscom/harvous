/**
 * Who may hand out leadership of a space — and specifically, the space lane.
 *
 * The `leader` role has always ranked correctly and every capability helper has
 * always honoured it, but until Sep 2026 nothing outside a church org could
 * create one: this gate 404'd on any room without an `orgId`. So a life group's
 * owner was the single point of failure for invites, pinning and starting a
 * Thread — the stated launch audience, unable to name a second leader.
 *
 * The lane is decided from the space, never from the caller, and the failures
 * below are the ones that would quietly widen it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveChurchOrgAccess = vi.fn();
const spaceRows = vi.fn();

vi.mock('../church-org-access', () => ({
  resolveChurchOrgAccess: (...args: unknown[]) => resolveChurchOrgAccess(...args),
}));

/* '../../db', not '../db' — vi.mock resolves relative to this file, and
   `server/utils/db` does not exist. A sibling suite documents the same trap. */
vi.mock('../../db', () => {
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    limit: () => spaceRows(),
  };
  return {
    db: chain,
    first: (rows: unknown[]) => rows?.[0],
    Spaces: { __table: 'Spaces' },
    SpaceMemberships: { __table: 'SpaceMemberships' },
    and: vi.fn(),
    eq: vi.fn(),
    isNull: vi.fn(),
  };
});

const { assertCanGrantSpaceLeadership } = await import('../church-space-leaders');

const OWNER = 'user_owner';
const MEMBER = 'user_member';

/** A life group: shared, no church behind it. */
const GROUP = {
  id: 'space_group',
  userId: OWNER,
  orgId: null,
  type: 'shared',
  isActive: true,
  deletedAt: null,
};

const CHURCH_ROOM = {
  id: 'space_youth',
  userId: OWNER,
  orgId: 'org_1',
  type: 'public',
  isActive: true,
  deletedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  spaceRows.mockResolvedValue([GROUP]);
});

describe('the space lane — a room with no church', () => {
  it('lets the owner grant, on the room’s own authority', async () => {
    const gate = await assertCanGrantSpaceLeadership(OWNER, GROUP.id);
    expect(gate).toMatchObject({ ok: true, lane: 'space', church: null });
    // No church was consulted — there is none, and asking would be the bug.
    expect(resolveChurchOrgAccess).not.toHaveBeenCalled();
  });

  it('refuses a member, and refuses as "not found" rather than "not yours"', async () => {
    /*
      404, not 403. The same discipline `resolveSpacePlanAccess` keeps: a probe
      must not be able to tell an existing room it cannot touch from one that
      does not exist.
    */
    expect(await assertCanGrantSpaceLeadership(MEMBER, GROUP.id)).toMatchObject({
      ok: false,
      status: 404,
      code: 'SPACE_NOT_FOUND',
    });
  });

  it('does not let leadership propagate', async () => {
    /*
      The doctrine both lanes share: a granted leader cannot grant. Enforced
      structurally rather than by a role check — the gate reads `Spaces.userId`,
      the one column a grant can never write — so a leader is refused for the
      same reason any non-owner is.
    */
    const leader = 'user_granted_leader';
    expect(await assertCanGrantSpaceLeadership(leader, GROUP.id)).toMatchObject({
      ok: false,
      status: 404,
    });
  });

  it('offers no lane on a personal space', async () => {
    // There is nobody to lead.
    spaceRows.mockResolvedValue([{ ...GROUP, type: 'personal' }]);
    expect(await assertCanGrantSpaceLeadership(OWNER, GROUP.id)).toMatchObject({
      ok: false,
      status: 404,
    });
  });

  it('refuses a deleted or deactivated room even to its owner', async () => {
    spaceRows.mockResolvedValue([{ ...GROUP, isActive: false }]);
    expect(await assertCanGrantSpaceLeadership(OWNER, GROUP.id)).toMatchObject({ ok: false });

    spaceRows.mockResolvedValue([]);
    expect(await assertCanGrantSpaceLeadership(OWNER, GROUP.id)).toMatchObject({ ok: false });
  });

  it('refuses a blank space id without touching the database', async () => {
    expect(await assertCanGrantSpaceLeadership(OWNER, '  ')).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(spaceRows).not.toHaveBeenCalled();
  });
});

describe('the church lane is unchanged', () => {
  it('still asks the church, and reports the church lane', async () => {
    spaceRows.mockResolvedValue([CHURCH_ROOM]);
    resolveChurchOrgAccess.mockResolvedValue({ ok: true, church: { id: 'chur_1', orgId: 'org_1' } });

    const gate = await assertCanGrantSpaceLeadership(OWNER, CHURCH_ROOM.id);
    expect(gate).toMatchObject({ ok: true, lane: 'church' });
    expect(resolveChurchOrgAccess).toHaveBeenCalled();
  });

  it('does not fall through to the space lane when the church refuses', async () => {
    /*
      The failure this guards: a church room whose owner is not staff must not
      quietly become "well, they own it" — that would let the owner path skip an
      inactive church or a lapsed plan, which the church lane deliberately does
      not allow.
    */
    spaceRows.mockResolvedValue([CHURCH_ROOM]);
    resolveChurchOrgAccess.mockResolvedValue({
      ok: false,
      status: 403,
      code: 'CHURCH_NOT_SPONSORED',
      error: 'This church does not have an active Harvous plan',
    });

    expect(await assertCanGrantSpaceLeadership(OWNER, CHURCH_ROOM.id)).toMatchObject({
      ok: false,
      code: 'CHURCH_NOT_SPONSORED',
    });
  });
});

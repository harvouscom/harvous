/**
 * Granted space leadership — a volunteer who runs one ministry.
 *
 * The ≤20 Clerk org cap is the hardest constraint in the church model, and it
 * is why this exists: a youth volunteer should be able to publish to the Youth
 * channel and plan its Wednesdays without consuming a staff seat. Before this,
 * `leader` was purely a projection of Clerk membership — `syncChurchStaffForOrg`
 * granted it to every staffer on every org space and deleted it from everyone
 * else.
 *
 * The boundary, from the §1 doctrine amendment and non-negotiable:
 *
 *   - A granted leader holds authority in **one space**, never church-wide.
 *   - They hold **zero** `ChurchCapability` — no church plan, no roster, no
 *     billing, no org templates. Nothing here consults
 *     `capabilitiesForChurchRole` for them, and nothing may.
 *   - They never join the Clerk org.
 *
 * Two kinds of `leader` row now coexist, told apart by `grantSource`: a
 * staff projection (`'staff_sync'`/NULL) that the roster sweep owns, and a
 * grant (`'grant'`) that only a human revokes. Neither may overwrite the other.
 */
import { db, first, SpaceMemberships, Spaces, and, eq, isNull } from '../db';
import { resolveChurchOrgAccess, type ChurchOrgAccessResult } from './church-org-access';
import { isChurchOrgSpaceRow } from './channel-publish-cadence';

export type SpaceRow = typeof Spaces.$inferSelect;

export type GrantGateResult =
  | {
      ok: true;
      /**
       * Which set of rules answered, named the same way `SpacePlanGateResult`
       * names it. `'church'` is the original lane — a church room, decided by
       * the church's ordering. `'space'` is a Shared Space with no church
       * behind it, where the room's own owner decides.
       *
       * Branch on this rather than on `church === null`: a lane is a policy, a
       * church is a row.
       */
      lane: 'church' | 'space';
      church: Extract<ChurchOrgAccessResult, { ok: true }>['church'] | null;
      space: SpaceRow;
    }
  | Extract<ChurchOrgAccessResult, { ok: false }>;

/** The value that marks a membership row as an explicit grant, not a projection. */
export const GRANT_SOURCE = 'grant';

/**
 * Is this user a granted leader of this space?
 *
 * Deliberately narrow: it asks about **one** space and reads only membership.
 * It is the second half of the space-plan write gate's OR, and it must never
 * grow into "is this user important" — the whole safety of the amendment rests
 * on this returning false for every space but the granted one.
 */
export async function isGrantedSpaceLeader(userId: string, spaceId: string): Promise<boolean> {
  if (!userId || !spaceId) return false;
  const row = first(
    await db
      .select({ role: SpaceMemberships.role, grantSource: SpaceMemberships.grantSource })
      .from(SpaceMemberships)
      .where(and(eq(SpaceMemberships.spaceId, spaceId), eq(SpaceMemberships.userId, userId)))
      .limit(1),
  );
  return row?.role === 'leader' && row.grantSource === GRANT_SOURCE;
}

/**
 * May this user hand out leadership of this space?
 *
 * **Two lanes**, mirroring the space plan's. In a church room: the church's own
 * admin (`manage_staff` — the people who already manage the roster), or the
 * space's owner. In a Shared Space with no church behind it: the owner, and
 * nobody else.
 *
 * Granting publish rights over a room a congregation follows is a real
 * escalation, which is why the church lane sits with the people who manage who
 * is on staff. The space lane is the same act at a smaller scale — a life group
 * naming a second person who can invite, pin and start a study — and the person
 * who pays to host the room is the one who says.
 *
 * Note what is *not* here, in **either** lane: a granted leader cannot grant.
 * Leadership does not propagate, or one volunteer could quietly staff a channel
 * — and one co-leader could quietly take over a group.
 */
export async function assertCanGrantSpaceLeadership(
  userId: string,
  spaceId: string,
): Promise<GrantGateResult> {
  const id = String(spaceId ?? '').trim();
  if (!id) {
    return { ok: false, status: 404, code: 'SPACE_NOT_FOUND', error: 'Space not found' };
  }

  const space = first(
    await db
      .select()
      .from(Spaces)
      .where(and(eq(Spaces.id, id), isNull(Spaces.deletedAt)))
      .limit(1),
  );
  if (!space || !space.isActive) {
    return { ok: false, status: 404, code: 'SPACE_NOT_FOUND', error: 'Space not found' };
  }

  /*
    The space lane: no church to consult, so the room answers for itself.

    `space.userId` rather than a membership row with `role === 'owner'`, matching
    the church lane's own owner exception below — the canonical column is the one
    that cannot be handed out, and this is the gate that hands things out.

    A personal space gets no lane at all: there is nobody to lead. 404 rather
    than 403 throughout, so a probe cannot tell "not yours" from "does not
    exist" — the same discipline `resolveSpacePlanAccess` keeps.
  */
  if (!isChurchOrgSpaceRow(space) || !space.orgId) {
    if (space.type !== 'shared' || space.userId !== userId) {
      return { ok: false, status: 404, code: 'SPACE_NOT_FOUND', error: 'Space not found' };
    }
    return { ok: true, lane: 'space', church: null, space };
  }

  /*
    The church ordering runs either way — a space owner still has to belong to
    an active, sponsored church — so the owner path cannot be used to edit a
    church that has lapsed or been deactivated. What the owner skips is only
    the `manage_staff` capability check at the end.
  */
  const access = await resolveChurchOrgAccess(userId, space.orgId, {
    capability: 'manage_staff',
    code: 'CHURCH_STAFF_REQUIRED',
    staffError: 'Only church staff can change who leads this space',
    roleError: 'A church admin or this space’s owner grants leadership here',
    sponsorshipGated: true,
  });

  if (access.ok) return { ok: true, lane: 'church', church: access.church, space };

  // The owner exception: only over the capability refusal, never over an
  // inactive church, a non-staff caller, or a lapsed plan.
  if (space.userId === userId && access.status === 403 && access.code === 'CHURCH_STAFF_REQUIRED') {
    const asOwner = await resolveChurchOrgAccess(userId, space.orgId, {
      capability: 'publish',
      code: 'CHURCH_STAFF_REQUIRED',
      staffError: 'Only church staff can change who leads this space',
      roleError: 'You cannot grant leadership here',
      sponsorshipGated: true,
    });
    if (asOwner.ok) return { ok: true, lane: 'church', church: asOwner.church, space };
    return asOwner;
  }

  return access;
}

/**
 * Gates for a *space's* teaching plan — Youth meets Wednesdays.
 *
 * The church's own plan hangs off `Churches` and is gated by org id
 * (`church-teaching-plan.ts`). A space plan is the same rows narrowed by
 * `ChurchServices.spaceId`, so the gate has one extra job before the church
 * ordering runs: resolve the space, prove it is one of *this* church's org
 * spaces, and hand its `orgId` to the shared resolver.
 *
 * It composes `resolveChurchOrgAccess` rather than re-implementing the sequence
 * — exists → active → **staff** → [write: sponsored] → Clerk role → capability.
 * That ordering is what keeps a signed-in stranger from learning whether a
 * church has lapsed, and it goes subtly wrong on the second copy.
 *
 * **Two lanes.** A Shared Space with no church behind it plans on its own
 * authority: read is any member's, write is `canManageSpaceStructure` — the
 * same rule that already decides who makes that room's folders and threads, and
 * the same bargain `assertCanManageSpaceLibrary` strikes for its shelf. A group
 * that meets without a church still meets on a rhythm. `lane` on the result
 * says which set of rules answered, and `church` is null for the space lane.
 */
import { db, first, Spaces, and, eq, isNull } from '../db';
import { isChurchOrgSpaceRow } from './channel-publish-cadence';
import { canManageSpaceStructure, requireSpaceAccess, type SpaceRole } from './space-access';
import { isGrantedSpaceLeader } from './church-space-leaders';
import { CHURCH_LAPSED_CODE, CHURCH_LAPSED_ERROR, churchIsSponsored } from './church-entitlement';
import { getActiveChurchByOrgId } from './church-staff';
import {
  resolveChurchOrgAccess,
  type ChurchOrgAccessResult,
  type ChurchOrgAccessRule,
} from './church-org-access';

export type SpaceRow = typeof Spaces.$inferSelect;

export type SpacePlanGateResult =
  | {
      ok: true;
      /**
       * Which set of rules answered. `'church'` is the original lane — the room
       * belongs to a church and the church's ordering decided. `'space'` is a
       * Shared Space with no church behind it, where the room itself decides.
       *
       * Routes branch on this rather than on `church === null` so the two
       * questions stay separable: a lane is a policy, a church is a row.
       */
      lane: 'church' | 'space';
      church: Extract<ChurchOrgAccessResult, { ok: true }>['church'] | null;
      space: SpaceRow;
    }
  | Extract<ChurchOrgAccessResult, { ok: false }>;

/**
 * Same rules as the church plan, applied to one space.
 *
 * `SPACE_NOT_FOUND` covers three different failures on purpose — no such space,
 * a deleted/inactive one, and a space that is not a church room at all. Telling
 * them apart would let anyone with an id discover what kind of room it names,
 * and none of the three is actionable to a caller who should not see it.
 */
async function resolveSpacePlanAccess(
  userId: string,
  spaceId: string,
  rule: ChurchOrgAccessRule,
  /*
    Kept off `ChurchOrgAccessRule` on purpose: that type is shared with the
    church plan, which has no space lane to describe. The church arm reads the
    rule; the space arm reads this.
  */
  opts: { spaceLaneWrite: boolean },
): Promise<SpacePlanGateResult> {
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
    No church behind the room: its own lane, gated by who runs the room — the
    same bargain `assertCanManageSpaceLibrary` already strikes for the shelf. A
    group that meets without a church still meets on a rhythm, and the room's
    structure rules are the ones that already answer "who arranges this".

    A personal space gets neither lane: a plan is a thing a room shows other
    people. 404 rather than 403 throughout, so a probe cannot tell "not yours"
    from "does not exist".
  */
  if (!isChurchOrgSpaceRow(space) || !space.orgId) {
    if (space.type !== 'shared') {
      return { ok: false, status: 404, code: 'SPACE_NOT_FOUND', error: 'Space not found' };
    }

    let role: SpaceRole | null = null;
    try {
      ({ role } = await requireSpaceAccess(space.id, userId));
    } catch {
      return { ok: false, status: 404, code: 'SPACE_NOT_FOUND', error: 'Space not found' };
    }

    /*
      Reading is every member's — it is the group's own schedule, and the
      `coming-up` window already hands them a slice of it one entry at a time.
      Only `write` narrows to whoever runs the room.
    */
    if (opts.spaceLaneWrite && !canManageSpaceStructure(space, role)) {
      return {
        ok: false,
        status: 403,
        code: 'PLAN_SPACE_ROLE_REQUIRED',
        error: 'Only this space’s leaders can change its plan',
      };
    }
    return { ok: true, lane: 'space', church: null, space };
  }

  /*
    The space's own org, never one supplied by the caller. This is what enforces
    the cross-row invariant from the schema comment — a plan row's space must
    belong to the same church — because the church we end up gating against is
    derived from the space itself.
  */
  const access = await resolveChurchOrgAccess(userId, space.orgId, rule);
  if (!access.ok) return access;

  return { ok: true, lane: 'church', church: access.church, space };
}

/** The staff *read* of a space plan. `sermon_tools`; never sponsorship-gated. */
export function assertCanViewSpaceTeachingPlan(
  userId: string,
  spaceId: string,
): Promise<SpacePlanGateResult> {
  return resolveSpacePlanAccess(userId, spaceId, {
    capability: 'sermon_tools',
    code: 'SERMON_TOOLS_REQUIRED',
    staffError: 'Only church staff can see this plan',
    roleError: 'Your role does not include the teaching plan',
    sponsorshipGated: false,
  }, { spaceLaneWrite: false });
}

/**
 * The staff *write* of a space plan:
 *
 *     church-wide `manage_teaching_plan`   OR   granted leader of THIS space
 *
 * The single place that OR exists. A granted leader is a volunteer handed one
 * ministry (see church-space-leaders.ts) — they hold no `ChurchCapability`, so
 * the capability arm refuses them and the grant arm is what lets them plan
 * their own Wednesdays.
 *
 * The **church-level** plan gate never widens. A grant is authority over one
 * room, and `assertCanManageTeachingPlan` must stay Clerk-capability-only.
 */
export async function assertCanManageSpaceTeachingPlan(
  userId: string,
  spaceId: string,
): Promise<SpacePlanGateResult> {
  const viaCapability = await resolveSpacePlanAccess(userId, spaceId, {
    capability: 'manage_teaching_plan',
    code: 'TEACHING_PLAN_ROLE_REQUIRED',
    staffError: 'Only church staff can manage this plan',
    roleError: 'A pastor or admin plans this ministry',
    sponsorshipGated: true,
  }, { spaceLaneWrite: true });
  if (viaCapability.ok) return viaCapability;

  /*
    Only a *belonging* or *role* refusal falls through to the grant. A 404 (not
    a church room), a 409 (church deactivated), or a 402 (lapsed) must stand for
    a granted leader exactly as for a pastor — the grant widens who may plan,
    never what state the church has to be in.

    `CHURCH_STAFF_REQUIRED` is in the list because a granted volunteer is
    genuinely *not* staff: `isChurchStaffForOrg` deliberately excludes grants,
    since several callers treat staff as sufficient for billing and checkout.
    So the shared ordering rejects them before it ever reaches a capability,
    and the grant arm below has to prove belonging its own way.
  */
  const fellThrough =
    viaCapability.status === 403 &&
    (viaCapability.code === 'TEACHING_PLAN_ROLE_REQUIRED' ||
      viaCapability.code === 'CHURCH_STAFF_REQUIRED');
  if (!fellThrough) return viaCapability;

  return resolveGrantedLeaderAccess(userId, spaceId, viaCapability);
}

/**
 * The grant arm: the same ordering minus the staff check, with the grant
 * itself standing in for it.
 *
 * Order is deliberate and mirrors the shared resolver's reason for existing —
 * **belonging is proven before billing state is revealed.** A grant is proof of
 * belonging, so it sits exactly where the staff check sits, and a stranger
 * still never learns whether a church has lapsed.
 */
async function resolveGrantedLeaderAccess(
  userId: string,
  spaceId: string,
  refusal: Extract<SpacePlanGateResult, { ok: false }>,
): Promise<SpacePlanGateResult> {
  const space = first(
    await db
      .select()
      .from(Spaces)
      .where(and(eq(Spaces.id, String(spaceId ?? '').trim()), isNull(Spaces.deletedAt)))
      .limit(1),
  );
  if (!space || !space.isActive || !isChurchOrgSpaceRow(space) || !space.orgId) return refusal;

  const church = await getActiveChurchByOrgId(space.orgId);
  if (!church || !church.isActive) return refusal;

  // Belonging first — this is the staff check's seat in the order.
  if (!(await isGrantedSpaceLeader(userId, space.id))) return refusal;

  // Then, and only then, the billing state.
  if (!churchIsSponsored(church)) {
    return { ok: false, status: 402, code: CHURCH_LAPSED_CODE, error: CHURCH_LAPSED_ERROR };
  }

  /* A grant only ever widens who may plan a *church* room — the space lane has
     no grants to widen, because whoever runs the room already qualifies. */
  return { ok: true, lane: 'church', church, space };
}

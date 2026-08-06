/**
 * Staff gates for church-scoped space writes (Shared Spaces + ministry channels).
 * Staff = Churches.createdBy, SpaceMemberships owner|leader on any org space,
 * or membership in the church's Clerk organization (staff-only org).
 */

import { db, first, Churches, Spaces, SpaceMemberships, eq, ne, and, or, isNull, inArray } from '../db';
import { fetchClerkOrgMemberships } from './clerk-org';
import { CHURCH_LAPSED_CODE, CHURCH_LAPSED_ERROR, churchIsSponsored } from './church-entitlement';

export type ChurchRow = typeof Churches.$inferSelect;

export type ChurchStaffGateResult =
  | { ok: true; church: ChurchRow }
  | { ok: false; status: 402 | 403 | 404 | 409; code: string; error: string };

/** Active (non-deleted) church by Clerk org id. */
export async function getActiveChurchByOrgId(orgId: string): Promise<ChurchRow | null> {
  const trimmed = orgId.trim();
  if (!trimmed) return null;
  const church = first(
    await db.select().from(Churches).where(eq(Churches.orgId, trimmed)).limit(1),
  );
  if (!church || church.deletedAt) return null;
  return church;
}

/**
 * True when the user is staff for this org (createdBy, space staff, or Clerk
 * org member).
 *
 * **A granted space leader is deliberately NOT staff.** Until granted
 * leadership existed, an `owner`/`leader` row on an org space could only have
 * come from `syncChurchStaffForOrg`, so "holds a leader row" and "is Clerk
 * staff" meant the same thing and this query was sound. A grant breaks that
 * equivalence: it hands one volunteer one room.
 *
 * Counting them here would be a real escalation, because several callers treat
 * staff as *sufficient* with no capability check after it — church billing,
 * checkout, and the `isStaff` flag that decides whether the hub shows staff
 * tools at all. A youth volunteer must not see the church's billing. Callers
 * that need "may this person act in this space" ask
 * `isGrantedSpaceLeader`, never this.
 */
export async function isChurchStaffForOrg(userId: string, orgId: string): Promise<boolean> {
  const church = await getActiveChurchByOrgId(orgId);
  if (!church) return false;
  return isChurchStaffForChurch(userId, church);
}

/**
 * The same check for a caller that already holds the church row.
 *
 * Every gate in `church-org-access.ts` had just fetched it, so going through
 * `isChurchStaffForOrg` looked the church up a second time on every church
 * request. Same rules, same answer — this only skips the redundant read.
 */
export async function isChurchStaffForChurch(userId: string, church: ChurchRow): Promise<boolean> {
  if (church.createdBy === userId) return true;

  const orgSpaces = await db
    .select({ id: Spaces.id })
    .from(Spaces)
    .where(and(eq(Spaces.orgId, church.orgId), isNull(Spaces.deletedAt)));
  if (orgSpaces.length > 0) {
    const membership = first(
      await db
        .select({ id: SpaceMemberships.id, role: SpaceMemberships.role })
        .from(SpaceMemberships)
        .where(
          and(
            eq(SpaceMemberships.userId, userId),
            inArray(
              SpaceMemberships.spaceId,
              orgSpaces.map((s) => s.id),
            ),
            inArray(SpaceMemberships.role, ['owner', 'leader']),
            // NULL reads as a staff projection, which is what every row
            // predating grants is.
            or(
              isNull(SpaceMemberships.grantSource),
              ne(SpaceMemberships.grantSource, 'grant'),
            ),
          ),
        )
        .limit(1),
    );
    if (membership) return true;
  }

  try {
    const staff = await fetchClerkOrgMemberships(church.orgId);
    return staff.some((member) => member.userId === userId);
  } catch (error) {
    console.warn('[isChurchStaffForChurch] Clerk org membership check failed', {
      orgId: church.orgId,
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function assertChurchStaffOrgWrite(
  userId: string,
  orgId: string,
  staffError: string,
): Promise<ChurchStaffGateResult> {
  const church = await getActiveChurchByOrgId(orgId);
  if (!church) {
    return { ok: false, status: 404, code: 'CHURCH_NOT_FOUND', error: 'Church not found' };
  }
  if (!church.isActive) {
    return { ok: false, status: 409, code: 'CHURCH_INACTIVE', error: 'Church is not active' };
  }
  // Sponsorship (paid or inside the pilot window) gates church-scoped *writes*.
  // Everything already published stays readable when a church lapses.
  if (!churchIsSponsored(church)) {
    return { ok: false, status: 402, code: CHURCH_LAPSED_CODE, error: CHURCH_LAPSED_ERROR };
  }
  if (!(await isChurchStaffForOrg(userId, church.orgId))) {
    return {
      ok: false,
      status: 403,
      code: 'CHURCH_STAFF_REQUIRED',
      error: staffError,
    };
  }
  return { ok: true, church };
}

/** Gate for creating church-scoped Shared Spaces under an org. */
export async function assertCanCreateChurchSharedSpace(
  userId: string,
  orgId: string,
): Promise<ChurchStaffGateResult> {
  return assertChurchStaffOrgWrite(
    userId,
    orgId,
    'Only church staff can create church Shared Spaces',
  );
}

/** Gate for creating ministry channels (type=public + orgId) under an org. */
export async function assertCanCreateMinistryChannel(
  userId: string,
  orgId: string,
): Promise<ChurchStaffGateResult> {
  return assertChurchStaffOrgWrite(
    userId,
    orgId,
    'Only church staff can create ministry channels',
  );
}

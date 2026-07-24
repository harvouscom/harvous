/**
 * Staff gates for church-scoped space writes (Shared Spaces + future helpers).
 * Staff = Churches.createdBy or SpaceMemberships owner|leader on any space for that orgId.
 */

import { db, first, Churches, Spaces, SpaceMemberships, eq, and, isNull, inArray } from '../db';

export type ChurchRow = typeof Churches.$inferSelect;

export type ChurchStaffGateResult =
  | { ok: true; church: ChurchRow }
  | { ok: false; status: 403 | 404 | 409; code: string; error: string };

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

/** True when the user is staff for this org (createdBy or owner/leader on an org space). */
export async function isChurchStaffForOrg(userId: string, orgId: string): Promise<boolean> {
  const church = await getActiveChurchByOrgId(orgId);
  if (!church) return false;
  if (church.createdBy === userId) return true;

  const orgSpaces = await db
    .select({ id: Spaces.id })
    .from(Spaces)
    .where(and(eq(Spaces.orgId, church.orgId), isNull(Spaces.deletedAt)));
  if (orgSpaces.length === 0) return false;

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
        ),
      )
      .limit(1),
  );
  return Boolean(membership);
}

/** Gate for creating church-scoped Shared Spaces under an org. */
export async function assertCanCreateChurchSharedSpace(
  userId: string,
  orgId: string,
): Promise<ChurchStaffGateResult> {
  const church = await getActiveChurchByOrgId(orgId);
  if (!church) {
    return { ok: false, status: 404, code: 'CHURCH_NOT_FOUND', error: 'Church not found' };
  }
  if (!church.isActive) {
    return { ok: false, status: 409, code: 'CHURCH_INACTIVE', error: 'Church is not active' };
  }
  if (!(await isChurchStaffForOrg(userId, church.orgId))) {
    return {
      ok: false,
      status: 403,
      code: 'CHURCH_STAFF_REQUIRED',
      error: 'Only church staff can create church Shared Spaces',
    };
  }
  return { ok: true, church };
}

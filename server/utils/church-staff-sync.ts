/**
 * Reconcile a church's Clerk org roster onto its org-owned spaces.
 *
 * Extracted from the admin `POST /api/admin/churches/:churchId/sync-staff` so
 * the admin button, the church's own staff screen, and the Clerk membership
 * webhook all run the *same* reconciliation. The invariants below are the whole
 * reason this lives in one place:
 *
 *   - `owner` is exclusively the `Spaces.userId` row. Never demoted, never
 *     removed; healed if missing.
 *   - `member` rows are never touched. They are congregant followers, not
 *     staff, and a staff sync must never unfollow a congregation.
 *   - Only `leader` rows are ever deleted, and the SQL restates that guard so
 *     a planning bug still can't reach an owner or member row.
 *   - Nothing is mutated when the Clerk fetch fails — a Clerk outage must not
 *     read as "the roster is empty" and strip every leader.
 *
 * Planning stays in the pure `computeStaffSyncPlan` (clerk-org.ts).
 */

import { db, Spaces, SpaceMemberships, eq, and, isNull } from '../db';
import { nowISO } from '../db/dates';
import {
  CLERK_ORG_STAFF_CAP,
  computeStaffSyncPlan,
  fetchClerkOrgMemberships,
  isWithinClerkOrgStaffCap,
  type ClerkOrgMember,
} from './clerk-org';

export type StaffSyncSpaceResult = {
  spaceId: string;
  title: string;
  added: number;
  promoted: number;
  removed: number;
  healedOwner: boolean;
};

export type StaffSyncResult =
  | {
      ok: true;
      staffCount: number;
      spaces: StaffSyncSpaceResult[];
      warnings: string[];
    }
  | {
      ok: false;
      code: 'CLERK_ORG_MEMBER_LIMIT';
      staffCount: number;
      limit: number;
    };

/**
 * Sync one church's staff. Pass `staff` when the roster is already in hand
 * (the webhook path) to avoid a redundant Clerk round trip.
 */
export async function syncChurchStaffForOrg(
  orgId: string,
  options?: { staff?: ClerkOrgMember[] },
): Promise<StaffSyncResult> {
  const staff = options?.staff ?? (await fetchClerkOrgMemberships(orgId));

  if (!isWithinClerkOrgStaffCap(staff.length)) {
    return {
      ok: false,
      code: 'CLERK_ORG_MEMBER_LIMIT',
      staffCount: staff.length,
      limit: CLERK_ORG_STAFF_CAP,
    };
  }

  // Include inactive spaces (membership stays truthful); exclude deleted.
  const orgSpaces = await db
    .select()
    .from(Spaces)
    .where(and(eq(Spaces.orgId, orgId), isNull(Spaces.deletedAt)));

  if (orgSpaces.length === 0) {
    return { ok: true, staffCount: staff.length, spaces: [], warnings: ['This church has no org spaces yet'] };
  }

  const now = nowISO();
  const warnings: string[] = [];
  const results: StaffSyncSpaceResult[] = [];

  for (const space of orgSpaces) {
    const existing = await db
      .select({ userId: SpaceMemberships.userId, role: SpaceMemberships.role })
      .from(SpaceMemberships)
      .where(eq(SpaceMemberships.spaceId, space.id));

    const plan = computeStaffSyncPlan({ spaceOwnerUserId: space.userId, staff, existing });
    warnings.push(...plan.warnings);

    await db.transaction(async (tx) => {
      if (plan.healOwnerRow) {
        await tx
          .insert(SpaceMemberships)
          .values({
            id: `smem_${crypto.randomUUID()}`,
            spaceId: space.id,
            userId: space.userId,
            role: 'owner',
            joinedAt: now,
            createdAt: now,
          })
          .onConflictDoNothing();
      }
      for (const userId of plan.toInsertLeaders) {
        await tx
          .insert(SpaceMemberships)
          .values({
            id: `smem_${crypto.randomUUID()}`,
            spaceId: space.id,
            userId,
            role: 'leader',
            joinedAt: now,
            createdAt: now,
          })
          .onConflictDoNothing();
      }
      for (const userId of plan.toPromoteToLeader) {
        await tx
          .update(SpaceMemberships)
          .set({ role: 'leader', updatedAt: now })
          .where(and(eq(SpaceMemberships.spaceId, space.id), eq(SpaceMemberships.userId, userId)));
      }
      for (const userId of plan.toRemove) {
        // Guard restated in SQL: only 'leader' rows are ever deleted here —
        // never role 'owner', never role 'member' (congregant followers).
        await tx
          .delete(SpaceMemberships)
          .where(
            and(
              eq(SpaceMemberships.spaceId, space.id),
              eq(SpaceMemberships.userId, userId),
              eq(SpaceMemberships.role, 'leader'),
            ),
          );
      }
    });

    results.push({
      spaceId: space.id,
      title: space.title,
      added: plan.toInsertLeaders.length,
      promoted: plan.toPromoteToLeader.length,
      removed: plan.toRemove.length,
      healedOwner: plan.healOwnerRow,
    });
  }

  return { ok: true, staffCount: staff.length, spaces: results, warnings: [...new Set(warnings)] };
}

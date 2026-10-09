/**
 * Family lifecycle helpers shared outside the family routes — account deletion dissolves a
 * family, and the generic space routes need to know when a space is a Family Space so they
 * can send people to Settings › Family instead.
 */

import {
  db,
  first,
  Families,
  FamilyInvites,
  FamilyMembers,
  FamilyEvents,
  FamilyRoleRequests,
  SpaceMemberships,
  Spaces,
  UserMetadata,
  Entitlements,
  and,
  eq,
} from '../db';
import { isPgUndefinedRelation } from './pg-undefined-relation';
import { isUniqueViolation } from './db-unique-violation';
import { cancelFamilyCoverage } from './family-entitlements';
import { spaceRoleForFamilyRole, type FamilyRole } from '@/lib/family-roles';

type Executor = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>;
type FamilyRow = typeof Families.$inferSelect;

/**
 * The family whose space this is, or null. Treats a missing Families table as "no family"
 * so the space routes keep working on a database the family DDL hasn't reached yet.
 */
export async function familyForSpace(spaceId: string, exec: Executor = db): Promise<FamilyRow | null> {
  try {
    return first(await exec.select().from(Families).where(eq(Families.spaceId, spaceId)).limit(1)) ?? null;
  } catch (error) {
    if (isPgUndefinedRelation(error, 'Families')) return null;
    throw error;
  }
}

/** The person's family membership, or null (same missing-table tolerance). */
export async function familyMembershipFor(userId: string, exec: Executor = db) {
  try {
    return first(await exec.select().from(FamilyMembers).where(eq(FamilyMembers.userId, userId)).limit(1)) ?? null;
  } catch (error) {
    if (isPgUndefinedRelation(error, 'FamilyMembers')) return null;
    throw error;
  }
}

/** A create or redeem that lost a race to the one-family-per-person indexes. */
export function isFamilyMembershipRace(error: unknown): boolean {
  return (
    isUniqueViolation(error, 'FamilyMembers_userId_unique') ||
    isUniqueViolation(error, 'Families_ownerUserId_unique')
  );
}

/**
 * Dissolving ends the family, not anyone's study: family rows go, coverage ends, and the
 * space stays as an ordinary shared space with everyone still in it. Parents' leader rows
 * become plain member rows (they led the space *because* they were parents). Returns who was
 * in it, for invalidation.
 */
export async function dissolveFamily(tx: Executor, family: FamilyRow, now: Date): Promise<string[]> {
  const members = await tx
    .select({ userId: FamilyMembers.userId })
    .from(FamilyMembers)
    .where(eq(FamilyMembers.familyId, family.id));
  await tx
    .update(SpaceMemberships)
    .set({ role: 'member', grantSource: null, updatedAt: now })
    .where(
      and(
        eq(SpaceMemberships.spaceId, family.spaceId),
        eq(SpaceMemberships.role, 'leader'),
        eq(SpaceMemberships.grantSource, 'family'),
      ),
    );
  await tx.delete(FamilyInvites).where(eq(FamilyInvites.familyId, family.id));
  await tx.delete(FamilyMembers).where(eq(FamilyMembers.familyId, family.id));
  await tx.delete(Families).where(eq(Families.id, family.id));
  await cancelFamilyCoverage(family.id, tx);
  return members.map((m) => m.userId);
}

export interface FamilyCoverageSummary {
  kind: 'family';
  familyName: string;
  sponsorFirstName: string | null;
  /** False while the owner's Plus is lapsed — the family stays, coverage doesn't. */
  active: boolean;
}

/**
 * The family part of /api/subscription/status: whether this account is in a family, and —
 * for anyone but the owner — whose Plus covers them, so the Plan page can say so instead of
 * "Managed by Harvous".
 */
export async function familyStatusFor(
  userId: string,
): Promise<{ inFamily: boolean; coverage: FamilyCoverageSummary | null }> {
  const membership = await familyMembershipFor(userId);
  if (!membership) return { inFamily: false, coverage: null };
  const family = first(await db.select().from(Families).where(eq(Families.id, membership.familyId)).limit(1));
  if (!family || family.ownerUserId === userId) return { inFamily: Boolean(family), coverage: null };
  const [space, owner, row] = await Promise.all([
    db.select({ title: Spaces.title }).from(Spaces).where(eq(Spaces.id, family.spaceId)).limit(1).then(first),
    db
      .select({ firstName: UserMetadata.firstName })
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, family.ownerUserId))
      .limit(1)
      .then(first),
    db
      .select({ id: Entitlements.id })
      .from(Entitlements)
      .where(
        and(
          eq(Entitlements.userId, userId),
          eq(Entitlements.source, 'family'),
          eq(Entitlements.status, 'active'),
          eq(Entitlements.providerRef, family.id),
        ),
      )
      .limit(1)
      .then(first),
  ]);
  return {
    inFamily: true,
    coverage: {
      kind: 'family',
      familyName: space?.title ?? 'Your family',
      sponsorFirstName: owner?.firstName?.trim() || null,
      active: Boolean(row),
    },
  };
}

export type FamilyEventKind =
  | 'created'
  | 'renamed'
  | 'invite_created'
  | 'invite_revoked'
  | 'joined'
  | 'role_changed'
  | 'removed'
  | 'left'
  | 'dissolved'
  | 'request_created'
  | 'request_withdrawn'
  | 'request_decided'
  | 'request_escalated'
  | 'frozen'
  | 'unfrozen'
  | 'ownership_transferred';

/**
 * Append to a family's history. Support reads this before overriding anything, and members
 * see "Changed by Harvous support" from it. Detail is small structured facts, never content.
 */
export async function recordFamilyEvent(
  exec: Executor,
  input: {
    familyId: string;
    actorUserId: string | null;
    actorKind: 'member' | 'support' | 'system';
    kind: FamilyEventKind;
    targetUserId?: string | null;
    detail?: Record<string, unknown> | null;
    reason?: string | null;
    now?: Date;
  },
): Promise<void> {
  await exec.insert(FamilyEvents).values({
    id: `fev_${crypto.randomUUID()}`,
    familyId: input.familyId,
    actorUserId: input.actorUserId,
    actorKind: input.actorKind,
    kind: input.kind,
    targetUserId: input.targetUserId ?? null,
    detail: input.detail ? JSON.stringify(input.detail) : null,
    reason: input.reason ?? null,
    createdAt: input.now ?? new Date(),
  });
}

/** The refusal every member-initiated change gets while support has the family paused. */
export const FAMILY_FROZEN_REFUSAL = {
  error: 'Harvous support has paused changes to this family while they look into something.',
  code: 'FAMILY_FROZEN',
} as const;

/** Keep the Family Space membership in step with a family role. */
export async function upsertSpaceRole(
  tx: Executor,
  input: { spaceId: string; userId: string; role: FamilyRole; isOwner: boolean; invitedBy?: string | null; now: Date },
): Promise<void> {
  const spaceRole = spaceRoleForFamilyRole(input.role, input.isOwner);
  const existing = first(
    await tx
      .select({ id: SpaceMemberships.id, role: SpaceMemberships.role })
      .from(SpaceMemberships)
      .where(and(eq(SpaceMemberships.spaceId, input.spaceId), eq(SpaceMemberships.userId, input.userId)))
      .limit(1),
  );
  if (existing) {
    if (existing.role === 'owner') return;
    await tx
      .update(SpaceMemberships)
      .set({ role: spaceRole, grantSource: spaceRole === 'leader' ? 'family' : null, updatedAt: input.now })
      .where(eq(SpaceMemberships.id, existing.id));
    return;
  }
  await tx.insert(SpaceMemberships).values({
    id: `smem_${crypto.randomUUID()}`,
    spaceId: input.spaceId,
    userId: input.userId,
    role: spaceRole,
    invitedBy: input.invitedBy ?? null,
    grantSource: spaceRole === 'leader' ? 'family' : null,
    joinedAt: input.now,
    createdAt: input.now,
  });
}


/**
 * Close any pending request this person has — when they become an adult (approved), leave or
 * are removed (withdrawn), or a parent or support says no (declined).
 */
export async function closePendingRequests(
  exec: Executor,
  userId: string,
  status: 'approved' | 'declined' | 'withdrawn',
  decidedBy: string | null,
  decidedVia: 'parent' | 'support' | 'self',
  now: Date,
): Promise<number> {
  const rows = await exec
    .update(FamilyRoleRequests)
    .set({ status, decidedBy, decidedVia, decidedAt: now })
    .where(and(eq(FamilyRoleRequests.userId, userId), eq(FamilyRoleRequests.status, 'pending')))
    .returning({ id: FamilyRoleRequests.id });
  return rows.length;
}

/**
 * The one way a role changes, for members and support alike: the family row, the Family
 * Space role, a pending request settled, and the history. `roleChangedBy` carries
 * `support:<adminId>` for support so members can be told who did it.
 */
export async function applyRoleChange(
  exec: Executor,
  input: {
    family: FamilyRow;
    member: typeof FamilyMembers.$inferSelect;
    to: FamilyRole;
    actorUserId: string;
    actorKind: 'member' | 'support';
    reason?: string | null;
    now: Date;
  },
): Promise<void> {
  const { family, member, to, actorUserId, actorKind, now } = input;
  const from = member.role;
  await exec
    .update(FamilyMembers)
    .set({
      role: to,
      roleChangedAt: now,
      roleChangedBy: actorKind === 'support' ? `support:${actorUserId}` : actorUserId,
      updatedAt: now,
    })
    .where(eq(FamilyMembers.id, member.id));
  await upsertSpaceRole(exec, {
    spaceId: family.spaceId,
    userId: member.userId,
    role: to,
    isOwner: member.userId === family.ownerUserId,
    now,
  });
  if (from === 'child' && to === 'adult') {
    await closePendingRequests(exec, member.userId, 'approved', actorUserId, actorKind === 'support' ? 'support' : 'parent', now);
  }
  await recordFamilyEvent(exec, {
    familyId: family.id,
    actorUserId,
    actorKind,
    kind: 'role_changed',
    targetUserId: member.userId,
    detail: { from, to },
    reason: input.reason ?? null,
    now,
  });
}

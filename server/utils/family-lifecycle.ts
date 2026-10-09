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

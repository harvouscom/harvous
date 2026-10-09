/**
 * Family coverage — the owner's Plus, extended to the rest of the household as
 * `Entitlements` rows with source 'family' (providerRef = familyId).
 *
 * Stored, not computed per read: `listActiveFeatureKeys` stays one query on the hot path,
 * and coverage shows up wherever entitlements are counted.
 *
 * **Who sponsors:** only the owner, and only from their own `billing` / `admin_grant` rows.
 * Never from 'family', 'church_seat' or 'trial' — coverage cannot chain.
 *
 * **Idempotent.** Every function computes the target and moves rows toward it, so calling
 * one twice, or after a missed webhook, is always safe. Callers on billing paths wrap these
 * in try/catch: a failed reconcile must never fail the billing write that triggered it.
 *
 * Deliberately does **not** import ./entitlements — entitlements.ts calls in here after each
 * write to the owner's rows, and the reverse import would be a cycle.
 */

import {
  db,
  first,
  Entitlements,
  Families,
  FamilyMembers,
  and,
  eq,
  inArray,
  ne,
} from '../db';
import {
  FAMILY_COVERED_FEATURES,
  FAMILY_SPONSOR_SOURCES,
  isFeatureKey,
  type FeatureKey,
} from '@/lib/billing-plans';

type Executor = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>;

const FAMILY_SOURCE = 'family' as const;
const COVERED = new Set<FeatureKey>(FAMILY_COVERED_FEATURES);

/** The covered features the owner's own Plus currently pays for. */
export async function sponsorFeatureKeys(ownerUserId: string, exec: Executor = db): Promise<FeatureKey[]> {
  const rows = await exec
    .select({ featureKey: Entitlements.featureKey })
    .from(Entitlements)
    .where(
      and(
        eq(Entitlements.userId, ownerUserId),
        eq(Entitlements.status, 'active'),
        inArray(Entitlements.source, [...FAMILY_SPONSOR_SOURCES]),
      ),
    );
  const keys = new Set<FeatureKey>();
  for (const row of rows) {
    if (isFeatureKey(row.featureKey) && COVERED.has(row.featureKey)) keys.add(row.featureKey);
  }
  return [...keys];
}

/**
 * The rows a family should hold: every covered feature the owner pays for, for every member
 * except the owner. Pure, so the shape of coverage is tested without a database.
 */
export function targetFamilyCoverage(input: {
  ownerUserId: string;
  memberUserIds: readonly string[];
  sponsorKeys: readonly FeatureKey[];
}): Array<{ userId: string; featureKey: FeatureKey }> {
  const keys = input.sponsorKeys.filter((key) => COVERED.has(key));
  const out: Array<{ userId: string; featureKey: FeatureKey }> = [];
  for (const userId of new Set(input.memberUserIds)) {
    if (userId === input.ownerUserId) continue;
    for (const featureKey of keys) out.push({ userId, featureKey });
  }
  return out;
}

async function writeFamilyRow(
  exec: Executor,
  familyId: string,
  userId: string,
  featureKey: FeatureKey,
  active: boolean,
  now: Date,
): Promise<void> {
  const existing = first(
    await exec
      .select({ id: Entitlements.id, status: Entitlements.status, providerRef: Entitlements.providerRef })
      .from(Entitlements)
      .where(
        and(
          eq(Entitlements.userId, userId),
          eq(Entitlements.featureKey, featureKey),
          eq(Entitlements.source, FAMILY_SOURCE),
        ),
      )
      .limit(1),
  );
  const status = active ? 'active' : 'canceled';
  if (existing) {
    if (existing.status === status && existing.providerRef === familyId) return;
    await exec
      .update(Entitlements)
      .set({ status, providerRef: familyId, updatedAt: now, ...(active ? { expiresAt: null } : {}) })
      .where(eq(Entitlements.id, existing.id));
    return;
  }
  if (!active) return;
  await exec.insert(Entitlements).values({
    id: crypto.randomUUID(),
    userId,
    featureKey,
    status: 'active',
    source: FAMILY_SOURCE,
    providerRef: familyId,
    productId: null,
    grantedAt: now,
    expiresAt: null,
    updatedAt: now,
  });
}

/** Cancel every active family row for these users (or, with no list, for the whole family). */
async function cancelFamilyRows(
  exec: Executor,
  where: { familyId: string; userIds?: readonly string[] } | { userId: string },
  now: Date,
): Promise<void> {
  if ('userIds' in where && where.userIds && where.userIds.length === 0) return;
  const scope =
    'userId' in where
      ? eq(Entitlements.userId, where.userId)
      : where.userIds
        ? and(eq(Entitlements.providerRef, where.familyId), inArray(Entitlements.userId, [...where.userIds]))
        : eq(Entitlements.providerRef, where.familyId);
  await exec
    .update(Entitlements)
    .set({ status: 'canceled', updatedAt: now })
    .where(and(eq(Entitlements.source, FAMILY_SOURCE), eq(Entitlements.status, 'active'), scope));
}

/**
 * Bring a family's coverage rows in line with its members and the owner's Plus. Also
 * cancels rows of anyone no longer in the family that still point at it.
 */
export async function reconcileFamilyCoverage(familyId: string, exec: Executor = db): Promise<void> {
  const now = new Date();
  const family = first(
    await exec
      .select({ id: Families.id, ownerUserId: Families.ownerUserId })
      .from(Families)
      .where(eq(Families.id, familyId))
      .limit(1),
  );
  if (!family) {
    await cancelFamilyRows(exec, { familyId }, now);
    return;
  }
  const members = await exec
    .select({ userId: FamilyMembers.userId })
    .from(FamilyMembers)
    .where(eq(FamilyMembers.familyId, familyId));
  const memberIds = members.map((m) => m.userId);
  const sponsorKeys = await sponsorFeatureKeys(family.ownerUserId, exec);
  const target = targetFamilyCoverage({ ownerUserId: family.ownerUserId, memberUserIds: memberIds, sponsorKeys });
  const targetSet = new Set(target.map((t) => `${t.userId}\u0000${t.featureKey}`));

  for (const row of target) await writeFamilyRow(exec, familyId, row.userId, row.featureKey, true, now);

  // Members' rows for keys the owner no longer pays for.
  for (const userId of memberIds) {
    if (userId === family.ownerUserId) continue;
    for (const featureKey of FAMILY_COVERED_FEATURES) {
      if (!targetSet.has(`${userId}\u0000${featureKey}`)) {
        await writeFamilyRow(exec, familyId, userId, featureKey, false, now);
      }
    }
  }

  // Anyone pointing at this family who is no longer in it (including the owner, who never
  // covers themself).
  const stale = await exec
    .select({ userId: Entitlements.userId })
    .from(Entitlements)
    .where(
      and(
        eq(Entitlements.source, FAMILY_SOURCE),
        eq(Entitlements.status, 'active'),
        eq(Entitlements.providerRef, familyId),
      ),
    );
  const memberSet = new Set(memberIds.filter((id) => id !== family.ownerUserId));
  const staleIds = [...new Set(stale.map((r) => r.userId))].filter((id) => !memberSet.has(id));
  await cancelFamilyRows(exec, { familyId, userIds: staleIds }, now);
}

/**
 * Reconcile from one person's point of view: an owner reconciles their whole family, a
 * member their family, and someone in no family loses any family rows they still hold.
 */
export async function reconcileFamilyCoverageForUser(userId: string, exec: Executor = db): Promise<void> {
  const owned = first(
    await exec.select({ id: Families.id }).from(Families).where(eq(Families.ownerUserId, userId)).limit(1),
  );
  if (owned) {
    await reconcileFamilyCoverage(owned.id, exec);
    return;
  }
  const membership = first(
    await exec
      .select({ familyId: FamilyMembers.familyId })
      .from(FamilyMembers)
      .where(eq(FamilyMembers.userId, userId))
      .limit(1),
  );
  if (membership) {
    await reconcileFamilyCoverage(membership.familyId, exec);
    return;
  }
  await cancelFamilyRows(exec, { userId }, new Date());
}

/** End all coverage a dissolved family was giving. */
export async function cancelFamilyCoverage(familyId: string, exec: Executor = db): Promise<void> {
  await cancelFamilyRows(exec, { familyId }, new Date());
}

/**
 * Which members are covered right now — one read for the Family settings list. A member is
 * covered when they hold any active family row pointing at this family.
 */
export async function coveredMemberIds(familyId: string, exec: Executor = db): Promise<Set<string>> {
  const rows = await exec
    .select({ userId: Entitlements.userId })
    .from(Entitlements)
    .where(
      and(
        eq(Entitlements.source, FAMILY_SOURCE),
        eq(Entitlements.status, 'active'),
        eq(Entitlements.providerRef, familyId),
      ),
    );
  return new Set(rows.map((r) => r.userId));
}

/** Does this user hold their own (non-family) Plus row for a covered feature? */
export async function hasOwnStudyPlus(userId: string, exec: Executor = db): Promise<boolean> {
  const row = first(
    await exec
      .select({ id: Entitlements.id })
      .from(Entitlements)
      .where(
        and(
          eq(Entitlements.userId, userId),
          eq(Entitlements.status, 'active'),
          ne(Entitlements.source, FAMILY_SOURCE),
          inArray(Entitlements.featureKey, [...FAMILY_COVERED_FEATURES]),
        ),
      )
      .limit(1),
  );
  return Boolean(row);
}

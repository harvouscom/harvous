import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { FamilyMembers } from '../db/schema';

/**
 * Child notebooks are added from a family, so starting one needs a parent's place in a family.
 * Notebooks already made don't depend on it: a parent who leaves a family can still open,
 * export, renew and delete them (COPPA's review and deletion rights don't wait on a family).
 */
export async function isFamilyParent(userId: string): Promise<boolean> {
  const rows = await db.select({ id: FamilyMembers.id }).from(FamilyMembers)
    .where(and(eq(FamilyMembers.userId, userId), eq(FamilyMembers.role, 'parent'))).limit(1);
  return rows.length > 0;
}

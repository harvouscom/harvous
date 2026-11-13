import { and, eq, lt, notExists, or, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { FamilyChildren, FamilyChildSessions, FamilyVerifications } from '../db/schema';
import { deleteChildData } from './service';
const DAY = 24 * 60 * 60 * 1000;
const WITHDRAWN_RETENTION_MS = 30 * DAY;

/**
 * Whether a FamilyChildren row takes one of the parent's CHILD_NOTEBOOK_MAX_PER_PARENT places.
 * Active notebooks count, including paused ones (an old notice) and ones idle long enough to be
 * near the inactivity purge: the child's notes are still there and the parent can resume them.
 * Withdrawn notebooks also count until their 30-day deletion window closes. They still hold the
 * child's data, so without this a parent could withdraw and re-create past the cap (and past
 * another paid verification each time); once the window closes the place frees up, even if the
 * daily purge hasn't removed the row yet. Pending verifications don't count; see the routes.
 */
export function holdsChildNotebookPlace(child: { revokedAt: Date | null }, now: Date) {
  return child.revokedAt === null || child.revokedAt.getTime() >= now.getTime() - WITHDRAWN_RETENTION_MS;
}

export function retentionDue(child: { revokedAt: Date | null; lastActiveAt: Date }, now: Date) {
  return child.revokedAt !== null
    ? child.revokedAt.getTime() < now.getTime() - WITHDRAWN_RETENTION_MS
    : child.lastActiveAt.getTime() < now.getTime() - 365 * DAY;
}

/** Bounded job, scheduled daily by deployment. Returns counts only, never personal content. */
export async function purgeExpiredFamilyData(apply: boolean, now = new Date()) {
  const candidates = await db.select().from(FamilyChildren).where(or(
    lt(FamilyChildren.revokedAt, new Date(now.getTime() - WITHDRAWN_RETENTION_MS)),
    and(sql`${FamilyChildren.revokedAt} IS NULL`, lt(FamilyChildren.lastActiveAt, new Date(now.getTime() - 365 * DAY)))
  )).limit(100);
  let deleted = 0;
  if (apply) {
    for (const candidate of candidates) await db.transaction(async (tx) => {
      const [child] = await tx.select().from(FamilyChildren).where(eq(FamilyChildren.id, candidate.id)).for('update');
      if (child && retentionDue(child, now)) { await deleteChildData(tx, child); deleted++; }
    });
    await db.delete(FamilyChildSessions).where(lt(FamilyChildSessions.expiresAt, now));
    await db.delete(FamilyVerifications).where(and(lt(FamilyVerifications.expiresAt, now),
      notExists(db.select({ id: FamilyChildren.id }).from(FamilyChildren).where(eq(FamilyChildren.verificationId, FamilyVerifications.id)))));
  }
  return { candidates: candidates.length, deleted, apply };
}

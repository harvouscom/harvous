import { deleteNoteRecordsInTransaction } from '../utils/delete-note-cascade';
import { parseHTML } from 'linkedom';
import { and, asc, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { isPgUndefinedRelation } from '../utils/pg-undefined-relation';
import { db } from '../db/client';
import { FamilyChildren, FamilyChildSessions, FamilySpaceApprovals, FamilyVerifications, Notes, Spaces, SpaceMemberships, SpaceNotes, Tags, Threads } from '../db/schema';
import { familyEnrollmentConfig, requireFamilyEnrollment } from './kws';
import { CHILD_SESSION_TTL_MS, hashSecret, hasActiveChildConsent, childSecret } from './policy';

export type FamilyTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Child = typeof FamilyChildren.$inferSelect;

export async function ownedChild(tx: FamilyTx, parentId: string, childId: string) {
  const [child] = await tx.select().from(FamilyChildren).where(and(
    eq(FamilyChildren.id, childId), eq(FamilyChildren.parentUserId, parentId)
  )).for('update');
  if (!child) throw new HTTPException(404, { message: 'Child account not found.' });
  return child;
}

/** Serializing against the child row makes revoke/delete win over all subsequent reads/writes. */
export async function withChildSession<T>(token: string | undefined, work: (tx: FamilyTx, child: Child) => Promise<T>) {
  if (!token || !/^hvkid_[\w-]{43}$/.test(token)) throw new HTTPException(401, { message: 'Ask your parent for a new sign-in link.' });
  return db.transaction(async (tx) => {
    const [session] = await tx.select().from(FamilyChildSessions).where(and(
      eq(FamilyChildSessions.tokenHash, hashSecret(token)), eq(FamilyChildSessions.kind, 'session'),
      gt(FamilyChildSessions.expiresAt, new Date())
    ));
    if (!session) throw new HTTPException(401, { message: 'Ask your parent for a new sign-in link.' });
    const [child] = await tx.select().from(FamilyChildren).where(eq(FamilyChildren.id, session.childId)).for('update');
    if (!child || !hasActiveChildConsent(child)) throw new HTTPException(403, { message: 'Your parent needs to review your account.' });
    if (!familyEnrollmentConfig(process.env, child.parentUserId)) {
      throw new HTTPException(403, { message: 'Child notebooks are paused right now.' });
    }
    // Check again after acquiring the lock: a parent may have ended sessions while we waited.
    const [stillValid] = await tx.select().from(FamilyChildSessions).where(and(
      eq(FamilyChildSessions.tokenHash, session.tokenHash), gt(FamilyChildSessions.expiresAt, new Date())
    ));
    if (!stillValid) throw new HTTPException(401, { message: 'This study session has ended.' });
    await tx.update(FamilyChildren).set({ lastActiveAt: new Date() }).where(eq(FamilyChildren.id, child.id));
    return work(tx, child);
  });
}

export async function redeemHandoff(token: string) {
  return db.transaction(async (tx) => {
    const [candidate] = await tx.select().from(FamilyChildSessions).where(and(
      eq(FamilyChildSessions.tokenHash, hashSecret(token)), eq(FamilyChildSessions.kind, 'handoff'),
      gt(FamilyChildSessions.expiresAt, new Date())
    ));
    if (!candidate) throw new HTTPException(401, { message: 'This link has expired or was already used.' });
    const [child] = await tx.select().from(FamilyChildren).where(eq(FamilyChildren.id, candidate.childId)).for('update');
    if (!child || !hasActiveChildConsent(child)) throw new HTTPException(403, { message: 'Your parent needs to review your account.' });
    requireFamilyEnrollment(child.parentUserId);
    const consumed = await tx.delete(FamilyChildSessions).where(and(
      eq(FamilyChildSessions.tokenHash, candidate.tokenHash), gt(FamilyChildSessions.expiresAt, new Date())
    )).returning();
    if (!consumed.length) throw new HTTPException(401, { message: 'This link has expired or was already used.' });
    const sessionToken = childSecret();
    await tx.insert(FamilyChildSessions).values({ tokenHash: hashSecret(sessionToken), childId: child.id,
      kind: 'session', createdAt: new Date(), expiresAt: new Date(Date.now() + CHILD_SESSION_TTL_MS) });
    return { token: sessionToken };
  });
}

export const childNoteSelection = { id: Notes.id, title: Notes.title, content: Notes.content, updatedAt: Notes.updatedAt };

/** Read-only ministry channels. No roster, responses, emails, or child notes go to leaders. */
export async function availableMinistries(tx: FamilyTx, parentId: string) {
  return tx.select({ id: Spaces.id, title: Spaces.title }).from(Spaces)
    .innerJoin(SpaceMemberships, and(eq(SpaceMemberships.spaceId, Spaces.id), eq(SpaceMemberships.userId, parentId)))
    .where(and(eq(Spaces.type, 'public'), sql`${Spaces.orgId} IS NOT NULL`, isNull(Spaces.deletedAt)));
}

export async function ministryMaterials(tx: FamilyTx, child: Child, item?: { spaceId: string; noteId: string }) {
  const rows = await tx.select({ ...childNoteSelection, spaceId: Spaces.id, spaceTitle: Spaces.title }).from(FamilySpaceApprovals)
    .innerJoin(Spaces, eq(Spaces.id, FamilySpaceApprovals.spaceId))
    .innerJoin(SpaceMemberships, and(eq(SpaceMemberships.spaceId, Spaces.id), eq(SpaceMemberships.userId, child.parentUserId)))
    .innerJoin(SpaceNotes, and(eq(SpaceNotes.spaceId, Spaces.id), isNull(SpaceNotes.removedAt)))
    .innerJoin(Notes, eq(Notes.id, SpaceNotes.noteId))
    .where(and(eq(FamilySpaceApprovals.childId, child.id), eq(Spaces.type, 'public'),
      sql`${Spaces.orgId} IS NOT NULL`, isNull(Spaces.deletedAt), eq(Notes.contentEncrypted, false),
      item ? and(eq(Spaces.id, item.spaceId), eq(Notes.id, item.noteId)) : undefined))
    .orderBy(desc(SpaceNotes.addedAt), asc(SpaceNotes.id))
    .limit(item ? 1 : 100);
  return rows.map((row) => {
    const { document } = parseHTML(`<html><body>${row.content}</body></html>`);
    document.querySelectorAll('script,style,iframe,object').forEach((element) => element.remove());
    return { ...row, content: document.body.textContent ?? '' };
  });
}

/** Only the isolated child API writes these identities; notes never have sharing or derived records. */
export async function deleteChildData(tx: FamilyTx, child: Child) {
  const notes = await tx.select({ id: Notes.id }).from(Notes).where(eq(Notes.userId, child.id));
  await deleteNoteRecordsInTransaction(tx, child.id, notes.map((note) => note.id));
  await tx.delete(Tags).where(eq(Tags.userId, child.id));
  await tx.delete(Threads).where(eq(Threads.userId, child.id));
  await tx.delete(FamilyChildren).where(eq(FamilyChildren.id, child.id)); // session + approval FK cascades
  await tx.delete(Spaces).where(and(eq(Spaces.id, child.homeSpaceId), eq(Spaces.userId, child.id)));
  await tx.delete(FamilyVerifications).where(eq(FamilyVerifications.id, child.verificationId));
}

/** A durable tombstone closes the create-vs-delete race without holding a DB connection across Clerk calls. */
export async function beginFamilyParentDeletion(parentId: string) {
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${parentId}))`);
      const children = await tx.select({ id: FamilyChildren.id }).from(FamilyChildren)
        .where(eq(FamilyChildren.parentUserId, parentId)).limit(1);
      if (children.length) throw new HTTPException(409, { message: 'Delete your managed child accounts in Family settings first.' });
      await tx.delete(FamilyVerifications).where(eq(FamilyVerifications.parentUserId, parentId));
      await tx.insert(FamilyVerifications).values({ id: `deleting_${parentId}`, parentUserId: parentId,
        parentEmailHash: '', status: 'parent-deleting', environment: 'none', location: 'US',
        createdAt: new Date(), expiresAt: new Date(Date.now() + 7 * 86400_000) });
    });
  } catch (error) {
    if (!isPgUndefinedRelation(error, 'FamilyChildren') && !isPgUndefinedRelation(error, 'FamilyVerifications')) throw error;
  }
}

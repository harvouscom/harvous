/**
 * Reconciliation helper for UserMetadata.highestSimpleNoteId.
 * Ensures the stored value is never behind the actual max(Notes.simpleNoteId)
 * so the next assigned ID never reuses a deleted ID.
 */

import { db, UserMetadata, Notes, eq, and, isNotNull, desc } from '../db';
import { nowISO } from '../db/dates';

/**
 * Returns the effective highest simple note ID for a user, reconciling
 * UserMetadata.highestSimpleNoteId with the actual max(Notes.simpleNoteId).
 * If metadata is behind, updates UserMetadata and returns the corrected value.
 */
export async function getEffectiveHighestSimpleNoteId(userId: string): Promise<number> {
  const [userMetadata, existingNotes] = await Promise.all([
    db
      .select({ highestSimpleNoteId: UserMetadata.highestSimpleNoteId })
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, userId))
      .get(),
    db
      .select({ simpleNoteId: Notes.simpleNoteId })
      .from(Notes)
      .where(and(eq(Notes.userId, userId), isNotNull(Notes.simpleNoteId)))
      .orderBy(desc(Notes.simpleNoteId))
      .limit(1),
  ]);
  const fromMetadata = userMetadata?.highestSimpleNoteId ?? 0;
  const maxFromNotes = existingNotes.length > 0 ? (existingNotes[0].simpleNoteId ?? 0) : 0;
  const effectiveHighest = Math.max(fromMetadata, maxFromNotes);
  if (userMetadata && effectiveHighest > (userMetadata.highestSimpleNoteId ?? 0)) {
    await db
      .update(UserMetadata)
      .set({ highestSimpleNoteId: effectiveHighest, updatedAt: nowISO() })
      .where(eq(UserMetadata.userId, userId));
  }
  return effectiveHighest;
}

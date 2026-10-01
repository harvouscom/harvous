/**
 * Resolve a public share token to its note — the lookup behind `GET /api/shared/note/:token`,
 * shared with the Connector's `get_shared_note` (server/connector/) so both apply the same
 * three conditions: the token matches, the note is still public, and it is not locked.
 *
 * Callers validate the token's format first (`isValidShareToken`).
 */

import { db, Notes, eq, and } from '../db';
import { first } from '../db/helpers';

export async function findPublicSharedNoteByToken(shareToken: string) {
  return first(
    await db
      .select({
        id: Notes.id, title: Notes.title, content: Notes.content,
        noteType: Notes.noteType, isPublic: Notes.isPublic, shareToken: Notes.shareToken,
        createdAt: Notes.createdAt, updatedAt: Notes.updatedAt, userId: Notes.userId,
      })
      .from(Notes)
      .where(and(eq(Notes.shareToken, shareToken), eq(Notes.isPublic, true), eq(Notes.contentEncrypted, false)))
      .limit(1),
  );
}

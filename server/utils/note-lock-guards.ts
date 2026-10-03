/**
 * Who may flip a note's lock, and when — shared by PUT /api/notes/update,
 * POST /api/notes/:id/update-content and sync push.
 *
 * Two rules the create path already enforced and the toggle paths did not:
 *
 *   - Only the author locks or unlocks. A co-editor may edit a co-edited note, but a lock
 *     is sealed with the locker's PIN — a collaborator locking it would put the author's
 *     own note behind a PIN the author doesn't know.
 *   - A note that lives in a shared space can't be locked. Every read path through a space
 *     already hides locked notes, so locking one would silently pull it out from under the
 *     space's members. Take it out of the space first.
 */
import { db, Notes, Spaces, SpaceNotes, eq, and, isNull, ne, sql } from '../db';
import { first } from '../db/helpers';

export async function noteIsInSharedSpace(noteId: string): Promise<boolean> {
  const row = first(
    await db
      .select({ id: SpaceNotes.id })
      .from(SpaceNotes)
      .innerJoin(Spaces, eq(Spaces.id, SpaceNotes.spaceId))
      .where(and(eq(SpaceNotes.noteId, noteId), isNull(SpaceNotes.removedAt), ne(Spaces.type, 'personal')))
      .limit(1),
  );
  return Boolean(row);
}

export type LockToggleRefusal = { status: 403 | 409; error: string; code: string };

/** Null when the requested lock change (if any) is allowed. */
export async function refuseLockToggle(input: {
  noteId: string;
  requested: unknown;
  current: boolean;
  actorRole: string | null | undefined;
}): Promise<LockToggleRefusal | null> {
  if (typeof input.requested !== 'boolean' || input.requested === input.current) return null;
  if (input.actorRole === 'collaborator') {
    return { status: 403, error: 'Only the author can lock or unlock this note.', code: 'LOCK_AUTHOR_ONLY' };
  }
  if (input.requested === true && (await noteIsInSharedSpace(input.noteId))) {
    return {
      status: 409,
      error: 'Take this note out of your shared spaces before locking it.',
      code: 'LOCKED_NOTE_IN_SHARED_SPACE',
    };
  }
  return null;
}

/**
 * `Notes.content` for any read that shows, excerpts or analyses a note body: '' when the
 * note is locked, because a locked body is ciphertext and nothing server-side can use it.
 * Select it in place of `Notes.content` so no new feed, card or row can forget the check.
 */
export const noteBodyUnlessLocked = sql<string>`case when ${Notes.contentEncrypted} then '' else ${Notes.content} end`;

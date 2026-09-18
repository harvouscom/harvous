/**
 * Import into a space you author in — a pastor loading a sermon archive into a
 * ministry channel, or a leader seeding a group.
 *
 * Imported notes are still the importer's own notes, created in their Home the
 * way every import is; the space is a `SpaceNotes` row on top, which is how any
 * note enters a room (series publish does the same). So undo, dedupe and the
 * rest of the import pipeline need no second path, and undo's cascade already
 * removes the room rows.
 *
 * Imported notes land in the room unattached — putting one on a Sunday stays a
 * deliberate act through published material.
 */
import { db, and, eq, inArray, isNull, SpaceNotes } from '../db';
import { canAuthorInSpace, type SpaceRole } from './space-access';

export type ImportSpaceTargetDecision =
  | { ok: true }
  | { ok: false; status: 400 | 403; code: string; error: string };

/** Pure. `space` and `role` come from `requireSpaceAccess`. */
export function decideImportSpaceTarget(input: {
  space: { type: string };
  role: SpaceRole;
  /** A Harvous backup restores a whole library; it belongs in Home, not in a room. */
  isBackupRestore: boolean;
}): ImportSpaceTargetDecision {
  if (input.space.type === 'personal') {
    return { ok: false, status: 400, code: 'PERSONAL_TARGET', error: 'Imports land in My Home already' };
  }
  if (input.isBackupRestore) {
    return {
      ok: false,
      status: 400,
      code: 'BACKUP_NEEDS_HOME',
      error: 'A Harvous backup restores into My Home. Import it there, then add notes to the space.',
    };
  }
  if (!canAuthorInSpace(input.space as Parameters<typeof canAuthorInSpace>[0], input.role)) {
    return { ok: false, status: 403, code: 'FORBIDDEN', error: 'You cannot add notes to this space' };
  }
  return { ok: true };
}

/** Put freshly imported notes in the room. Skips any already live there. */
export async function addImportedNotesToSpace(
  spaceId: string,
  noteIds: readonly string[],
  actorId: string,
): Promise<number> {
  if (noteIds.length === 0) return 0;
  const present = await db
    .select({ noteId: SpaceNotes.noteId })
    .from(SpaceNotes)
    .where(and(eq(SpaceNotes.spaceId, spaceId), inArray(SpaceNotes.noteId, [...noteIds]), isNull(SpaceNotes.removedAt)));
  const have = new Set(present.map((row) => row.noteId));
  const now = new Date();
  const rows = [...new Set(noteIds)]
    .filter((id) => !have.has(id))
    .map((noteId) => ({
      id: `sn_${crypto.randomUUID()}`,
      spaceId,
      noteId,
      addedBy: actorId,
      addedAt: now,
    }));
  if (rows.length > 0) await db.insert(SpaceNotes).values(rows);
  return rows.length;
}

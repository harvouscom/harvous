/**
 * Can this viewer read this note *through a shared space*?
 *
 * The shared-space half of `resolveNoteReadContext` in server/routes/notes.ts, lifted out
 * so the Connector's `get_note` (server/connector/) answers with the same rule the app's
 * note page does rather than a copy of it:
 *
 *   - a locked note (`contentEncrypted`) is never readable through a space;
 *   - the viewer must own the space or hold a membership in it;
 *   - the note must have a live association with that space (`removedAt IS NULL`).
 *
 * Read-only. Personal-space reads (your own notes) are not decided here.
 */

import { db, Spaces, SpaceNotes, SpaceMemberships, Notes, eq, and, isNull, ne, or, sql } from '../db';
import { first } from '../db/helpers';

type SpaceRow = typeof Spaces.$inferSelect;
type AssociationRow = typeof SpaceNotes.$inferSelect;

export async function sharedSpaceNoteAssociation(input: {
  space: Pick<SpaceRow, 'id' | 'userId'>;
  note: Pick<typeof Notes.$inferSelect, 'id' | 'contentEncrypted'>;
  viewerUserId: string;
}): Promise<AssociationRow | null> {
  if (input.note.contentEncrypted) return null;
  const [membership, association] = await Promise.all([
    db
      .select({ id: SpaceMemberships.id })
      .from(SpaceMemberships)
      .where(
        and(
          eq(SpaceMemberships.spaceId, input.space.id),
          eq(SpaceMemberships.userId, input.viewerUserId),
        ),
      )
      .limit(1)
      .then((rows) => first(rows)),
    db
      .select()
      .from(SpaceNotes)
      .where(
        and(
          eq(SpaceNotes.spaceId, input.space.id),
          eq(SpaceNotes.noteId, input.note.id),
          isNull(SpaceNotes.removedAt),
        ),
      )
      .limit(1)
      .then((rows) => first(rows)),
  ]);
  if ((!membership && input.space.userId !== input.viewerUserId) || !association) return null;
  return association;
}

/**
 * Any live, non-personal space through which the viewer may read this note — for a caller
 * that has a note id but no space (the Connector's `get_note` without `spaceId`). One query;
 * the same three conditions as `sharedSpaceNoteAssociation`.
 */
export async function findSharedSpaceForNote(
  noteId: string,
  viewerUserId: string,
): Promise<Pick<SpaceRow, 'id' | 'title'> | null> {
  return (
    first(
      await db
        .select({ id: Spaces.id, title: Spaces.title })
        .from(SpaceNotes)
        .innerJoin(Spaces, eq(Spaces.id, SpaceNotes.spaceId))
        .where(
          and(
            eq(SpaceNotes.noteId, noteId),
            isNull(SpaceNotes.removedAt),
            isNull(Spaces.deletedAt),
            ne(Spaces.type, 'personal'),
            or(
              eq(Spaces.userId, viewerUserId),
              sql`EXISTS (
                SELECT 1 FROM ${SpaceMemberships}
                WHERE ${SpaceMemberships.spaceId} = ${Spaces.id}
                  AND ${SpaceMemberships.userId} = ${viewerUserId}
              )`,
            ),
          ),
        )
        .limit(1),
    ) ?? null
  );
}

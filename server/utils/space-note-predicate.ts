import { Notes, SpaceNotes, sql } from '../db';

/** A note currently shared into this space (its `SpaceNotes` row is not removed). */
export function activeSpaceNotePredicate(spaceId: string) {
  return sql`EXISTS (
    SELECT 1 FROM ${SpaceNotes}
    WHERE ${SpaceNotes.spaceId} = ${spaceId}
      AND ${SpaceNotes.noteId} = ${Notes.id}
      AND ${SpaceNotes.removedAt} IS NULL
  )`;
}

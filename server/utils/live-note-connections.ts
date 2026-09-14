/**
 * A NoteConnections row is a link only while both of its notes exist and belong to the row's
 * owner. The table has no foreign keys, so nothing in the database enforces that — and rows
 * that break it do get written:
 *
 * - `migrateLinkedFromNoteConnectionsForUser` rebuilt edges from `Notes.linkedFromNoteId`
 *   without checking the source note was still there. The delete cascade removed the edge but
 *   left the pointer, so the next migration run put the edge back, a month after the note was
 *   deleted.
 * - Create-from-highlight writes its edge after the note transaction commits; a note gone by
 *   then leaves an edge to nothing.
 *
 * Every surface that turns edges into Threads reads through `noteConnectionEndpointsLive()`,
 * so a dead row can never become a listed Thread that 404s on open, and never pick a deleted
 * note as a cluster's representative. `findOrphanNoteConnections` / `deleteOrphanNoteConnections`
 * are the cleanup path (server/scripts/cleanup-orphan-note-connections.ts).
 */

import { db, Notes, NoteConnections, and, eq, inArray, not, sql, type SQL } from '../db';
import { recordDeletedEntities } from './sync-deletion-log';

type ConnectionEndpointColumn = typeof NoteConnections.fromNoteId | typeof NoteConnections.toNoteId;

function endpointIsLiveOwnedNote(column: ConnectionEndpointColumn): SQL {
  return sql`EXISTS (SELECT 1 FROM ${Notes} WHERE ${Notes.id} = ${column} AND ${Notes.userId} = ${NoteConnections.userId})`;
}

/** Both ends of the NoteConnections row exist as notes owned by the row's user. */
export function noteConnectionEndpointsLive(): SQL {
  return and(
    endpointIsLiveOwnedNote(NoteConnections.fromNoteId),
    endpointIsLiveOwnedNote(NoteConnections.toNoteId),
  ) as SQL;
}

/**
 * For a query over Notes: the note's `linkedFromNoteId` names a note that still exists and
 * belongs to the same user. The inner table is aliased so the outer "Notes" stays addressable.
 */
export function linkedFromNoteIsLiveOwned(): SQL {
  return sql`EXISTS (SELECT 1 FROM "Notes" AS "linkedFrom" WHERE "linkedFrom"."id" = ${Notes.linkedFromNoteId} AND "linkedFrom"."userId" = ${Notes.userId})`;
}

export type OrphanNoteConnection = {
  id: string;
  userId: string;
  fromNoteId: string;
  toNoteId: string;
  spaceId: string | null;
  createdAt: Date;
};

/** Rows with at least one end missing or owned by someone else. Scoped to one user when given. */
export async function findOrphanNoteConnections(userId?: string): Promise<OrphanNoteConnection[]> {
  const orphaned = not(noteConnectionEndpointsLive());
  return db
    .select({
      id: NoteConnections.id,
      userId: NoteConnections.userId,
      fromNoteId: NoteConnections.fromNoteId,
      toNoteId: NoteConnections.toNoteId,
      spaceId: NoteConnections.spaceId,
      createdAt: NoteConnections.createdAt,
    })
    .from(NoteConnections)
    .where(userId ? and(eq(NoteConnections.userId, userId), orphaned) : orphaned);
}

/**
 * Deletes the given orphaned rows and records `noteConnection` tombstones so synced clients
 * (native keeps its own copy of the graph) drop them too. Re-checks orphan status in the
 * delete itself, so a row whose note came back in between is left alone.
 */
export async function deleteOrphanNoteConnections(rows: OrphanNoteConnection[]): Promise<string[]> {
  if (rows.length === 0) return [];
  const deleted = await db
    .delete(NoteConnections)
    .where(and(inArray(NoteConnections.id, rows.map((r) => r.id)), not(noteConnectionEndpointsLive())))
    .returning({ id: NoteConnections.id, userId: NoteConnections.userId });

  const idsByUser = new Map<string, string[]>();
  for (const row of deleted) {
    idsByUser.set(row.userId, [...(idsByUser.get(row.userId) ?? []), row.id]);
  }
  for (const [ownerId, ids] of idsByUser) {
    await recordDeletedEntities(ownerId, 'noteConnection', ids);
  }
  return deleted.map((r) => r.id);
}

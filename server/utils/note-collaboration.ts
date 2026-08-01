/**
 * Note co-editing ("pass the pen") authorization.
 *
 * Shared Spaces are a visibility layer: by default the author is the only person
 * who may write a note body. When an author opts a note in for a specific shared
 * space (SpaceNotes.coEditEnabled), members of that space may edit it too — one
 * at a time, coordinated client-side by a presence lease.
 *
 * Notes.coEditEnabled is a derived OR-mirror across live associations (native /
 * broadcast). Authorization always reads the association flags.
 *
 * The lease is advisory. This module and Notes.currentVersion/expectedVersion are
 * the enforcement: authorization decides *who may write*, optimistic concurrency
 * decides *whose write lands*. Nothing here knows or cares who holds the pen.
 *
 * Deliberately does not use requireSpaceAccess — that heals-on-read (inserting an
 * owner membership row) and throws on the first denial. The edit path wants a
 * silent verdict over the whole set of associated spaces, in one query.
 */

import {
  db,
  first,
  Notes,
  NoteVersions,
  SpaceNotes,
  SpaceMemberships,
  Spaces,
  eq,
  and,
  isNull,
} from '../db';
import { nowISO } from '../db/dates';
import { isOnboardingSystemNote } from './purge-onboarding-content';

/** Drizzle db or transaction — both expose the query surface we use here. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Executor = any;

export type NoteEditRole = 'author' | 'collaborator';

export type NoteEditDenialCode =
  /** Not the author, and no shared association grants this actor edit access. */
  | 'NOT_AUTHOR'
  /** Locked notes are end-to-end encrypted; co-editing is mutually exclusive with that. */
  | 'ENCRYPTED'
  /** Onboarding system notes are read-only for everyone, author included. */
  | 'ONBOARDING'
  /** Opted in somewhere, but the actor is not a member of any granting space. */
  | 'NO_SHARED_SPACE';

export type NoteEditDecision =
  | { allowed: true; role: NoteEditRole; viaSpaceId: string | null }
  | { allowed: false; code: NoteEditDenialCode };

type NoteForEditDecision = Pick<
  typeof Notes.$inferSelect,
  'id' | 'userId' | 'contentEncrypted' | 'threadId' | 'addedBy'
>;

/**
 * Pure edit verdict. `sharedSpaceIdsActorBelongsTo` is the already-resolved list
 * of live shared associations that (a) have coEditEnabled and (b) count the actor
 * as a member — the caller does the I/O so this stays trivially testable.
 *
 * Order matters: the onboarding and encryption gates apply to the author too,
 * matching today's behavior, and the author short-circuit means a note with no
 * co-edit associations takes exactly the same path it takes now.
 */
export function canEditNoteAsCollaborator(input: {
  note: NoteForEditDecision;
  actorId: string;
  sharedSpaceIdsActorBelongsTo: string[];
}): NoteEditDecision {
  const { note, actorId, sharedSpaceIdsActorBelongsTo } = input;

  if (isOnboardingSystemNote(note)) return { allowed: false, code: 'ONBOARDING' };
  if (note.userId === actorId) return { allowed: true, role: 'author', viaSpaceId: null };
  if (note.contentEncrypted) return { allowed: false, code: 'ENCRYPTED' };
  if (sharedSpaceIdsActorBelongsTo.length === 0) return { allowed: false, code: 'NO_SHARED_SPACE' };

  return { allowed: true, role: 'collaborator', viaSpaceId: sharedSpaceIdsActorBelongsTo[0] };
}

/**
 * Live shared spaces that hold this note with co-edit on AND count the actor as
 * a member. Ministry channels (type 'public') are excluded.
 */
export async function resolveSharedSpacesGrantingEdit(
  noteId: string,
  actorId: string,
): Promise<string[]> {
  const rows = await db
    .select({ spaceId: SpaceNotes.spaceId })
    .from(SpaceNotes)
    .innerJoin(Spaces, eq(Spaces.id, SpaceNotes.spaceId))
    .innerJoin(
      SpaceMemberships,
      and(eq(SpaceMemberships.spaceId, Spaces.id), eq(SpaceMemberships.userId, actorId)),
    )
    .where(
      and(
        eq(SpaceNotes.noteId, noteId),
        isNull(SpaceNotes.removedAt),
        eq(SpaceNotes.coEditEnabled, true),
        isNull(Spaces.deletedAt),
        eq(Spaces.type, 'shared'),
      ),
    );

  return rows.map((row) => row.spaceId);
}

/**
 * Loads the note without an ownership filter and decides whether the actor may
 * write it. Returns null when the note does not exist at all; callers map both
 * null and `allowed: false` to 404 so note existence never leaks.
 */
export async function resolveNoteEditAuthorization(
  noteId: string,
  actorId: string,
): Promise<{ note: typeof Notes.$inferSelect; decision: NoteEditDecision } | null> {
  const note = first(await db.select().from(Notes).where(eq(Notes.id, noteId)).limit(1)) as
    | typeof Notes.$inferSelect
    | undefined;
  if (!note) return null;

  // Authors and encrypted notes don't need the join; everyone else does — the
  // note-level mirror is not authoritative for the grant list.
  const needsSpaceLookup = note.userId !== actorId && !note.contentEncrypted;
  const sharedSpaceIdsActorBelongsTo = needsSpaceLookup
    ? await resolveSharedSpacesGrantingEdit(noteId, actorId)
    : [];

  return {
    note,
    decision: canEditNoteAsCollaborator({ note, actorId, sharedSpaceIdsActorBelongsTo }),
  };
}

/**
 * Distinct user ids that have saved a checkpoint of this note, author first.
 * `editedBy` is null on rows written before co-editing, so those fall back to the
 * permanent author — which is exactly who wrote them.
 */
export async function resolveNoteContributorIds(
  noteId: string,
  authorId: string,
): Promise<string[]> {
  const rows = await db
    .select({ editedBy: NoteVersions.editedBy, authorId: NoteVersions.authorId })
    .from(NoteVersions)
    .where(eq(NoteVersions.noteId, noteId));

  const ids = new Set<string>([authorId]);
  for (const row of rows) {
    const savedBy = row.editedBy ?? row.authorId;
    if (savedBy) ids.add(savedBy);
  }
  return [authorId, ...[...ids].filter((id) => id !== authorId)];
}

/** Live shared association for this note+space, or null. */
export async function findLiveSharedSpaceAssociation(
  noteId: string,
  spaceId: string,
): Promise<{ id: string; coEditEnabled: boolean } | null> {
  const row = first(
    await db
      .select({ id: SpaceNotes.id, coEditEnabled: SpaceNotes.coEditEnabled })
      .from(SpaceNotes)
      .innerJoin(Spaces, eq(Spaces.id, SpaceNotes.spaceId))
      .where(
        and(
          eq(SpaceNotes.noteId, noteId),
          eq(SpaceNotes.spaceId, spaceId),
          isNull(SpaceNotes.removedAt),
          isNull(Spaces.deletedAt),
          eq(Spaces.type, 'shared'),
        ),
      )
      .limit(1),
  ) as { id: string; coEditEnabled: boolean } | undefined;
  return row ?? null;
}

/**
 * Recompute Notes.coEditEnabled / At from live shared associations.
 * Call after any SpaceNotes.coEditEnabled change or association removal.
 */
export async function syncNoteCoEditMirror(
  executor: Executor,
  noteId: string,
): Promise<boolean> {
  const grant = first(
    await executor
      .select({ enabledAt: SpaceNotes.coEditEnabledAt })
      .from(SpaceNotes)
      .innerJoin(Spaces, eq(Spaces.id, SpaceNotes.spaceId))
      .where(
        and(
          eq(SpaceNotes.noteId, noteId),
          isNull(SpaceNotes.removedAt),
          eq(SpaceNotes.coEditEnabled, true),
          isNull(Spaces.deletedAt),
          eq(Spaces.type, 'shared'),
        ),
      )
      .limit(1),
  ) as { enabledAt: Date | null } | undefined;

  const enabled = Boolean(grant);
  await executor
    .update(Notes)
    .set({
      coEditEnabled: enabled,
      coEditEnabledAt: enabled ? (grant?.enabledAt ?? nowISO()) : null,
    })
    .where(eq(Notes.id, noteId));

  return enabled;
}

/** Clear every association grant + the note mirror (lock / encrypt). */
export async function clearAllCoEditForNote(
  executor: Executor,
  noteId: string,
): Promise<void> {
  await executor
    .update(SpaceNotes)
    .set({ coEditEnabled: false, coEditEnabledAt: null })
    .where(and(eq(SpaceNotes.noteId, noteId), eq(SpaceNotes.coEditEnabled, true)));
  await executor
    .update(Notes)
    .set({ coEditEnabled: false, coEditEnabledAt: null })
    .where(eq(Notes.id, noteId));
}

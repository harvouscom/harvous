/**
 * Note co-editing ("pass the pen") authorization.
 *
 * Shared Spaces are a visibility layer: by default the author is the only person
 * who may write a note body. When an author opts a note in (Notes.coEditEnabled),
 * members of any shared space the note is associated with may edit it too — one
 * at a time, coordinated client-side by a presence lease.
 *
 * The lease is advisory. This module and Notes.currentVersion/expectedVersion are
 * the enforcement: authorization decides *who may write*, optimistic concurrency
 * decides *whose write lands*. Nothing here knows or cares who holds the pen.
 *
 * Deliberately does not use requireSpaceAccess — that heals-on-read (inserting an
 * owner membership row) and throws on the first denial. The edit path wants a
 * silent verdict over the whole set of associated spaces, in one query.
 */

import { db, first, Notes, NoteVersions, SpaceNotes, SpaceMemberships, Spaces, eq, and, isNull } from '../db';
import { isOnboardingSystemNote } from './purge-onboarding-content';

export type NoteEditRole = 'author' | 'collaborator';

export type NoteEditDenialCode =
  /** Not the author, and the note is not opted into co-editing. */
  | 'NOT_AUTHOR'
  /** Locked notes are end-to-end encrypted; co-editing is mutually exclusive with that. */
  | 'ENCRYPTED'
  /** Onboarding system notes are read-only for everyone, author included. */
  | 'ONBOARDING'
  /** Opted in, but the actor shares no live shared space with this note. */
  | 'NO_SHARED_SPACE';

export type NoteEditDecision =
  | { allowed: true; role: NoteEditRole; viaSpaceId: string | null }
  | { allowed: false; code: NoteEditDenialCode };

type NoteForEditDecision = Pick<
  typeof Notes.$inferSelect,
  'id' | 'userId' | 'contentEncrypted' | 'coEditEnabled' | 'threadId' | 'addedBy'
>;

/**
 * Pure edit verdict. `sharedSpaceIdsActorBelongsTo` is the already-resolved
 * intersection of the note's live shared-space associations and the actor's
 * memberships — the caller does the I/O so this stays trivially testable.
 *
 * Order matters: the onboarding and encryption gates apply to the author too,
 * matching today's behavior, and the author short-circuit means an opted-out
 * note takes exactly the same path it takes now.
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
  if (note.coEditEnabled !== true) return { allowed: false, code: 'NOT_AUTHOR' };
  if (sharedSpaceIdsActorBelongsTo.length === 0) return { allowed: false, code: 'NO_SHARED_SPACE' };

  return { allowed: true, role: 'collaborator', viaSpaceId: sharedSpaceIdsActorBelongsTo[0] };
}

/**
 * Live shared spaces that both hold this note and count the actor as a member.
 * Ministry channels (type 'public') are excluded — canAuthorInSpace already
 * denies members authoring there, and co-editing is a Shared Spaces feature.
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

  // Only pay for the join when the answer can actually depend on it.
  const needsSpaceLookup =
    note.userId !== actorId && note.coEditEnabled === true && !note.contentEncrypted;
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
  // Author first; the rest in whatever order the set yields (stable per query).
  return [authorId, ...[...ids].filter((id) => id !== authorId)];
}

/** Whether an author may flip co-editing on — needs at least one live shared association. */
export async function noteHasLiveSharedSpaceAssociation(noteId: string): Promise<boolean> {
  const row = first(
    await db
      .select({ id: SpaceNotes.id })
      .from(SpaceNotes)
      .innerJoin(Spaces, eq(Spaces.id, SpaceNotes.spaceId))
      .where(
        and(
          eq(SpaceNotes.noteId, noteId),
          isNull(SpaceNotes.removedAt),
          isNull(Spaces.deletedAt),
          eq(Spaces.type, 'shared'),
        ),
      )
      .limit(1),
  ) as { id: string } | undefined;
  return Boolean(row);
}

import {
  db,
  Spaces,
  Notes,
  Threads,
  NoteThreads,
  NoteConnections,
  SpaceNotes,
  SpaceMemberships,
  SpaceInvites,
  SpaceInvitations,
  Members,
  StudyThreadEntries,
  and,
  eq,
  first,
  inArray,
  isNull,
  isNotNull,
  lt,
} from '../db';
import { buildSpaceNoteAssociation } from './space-note-associations';

type Executor = any;

export const SPACE_RECOVERY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export class SharedSpaceLifecycleError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: 400 | 403 | 404 | 409 = 400,
  ) {
    super(message);
    this.name = 'SharedSpaceLifecycleError';
  }
}

export type SharedThreadNotePolicyInput = {
  actorId: string;
  requireCurrent: boolean;
  space: { id: string; type: string; userId: string; deletedAt: Date | null } | null;
  membership: { spaceId: string; userId: string; role: string } | null;
  thread: { id: string; spaceId: string | null; isPinned: boolean } | null;
  note: { id: string; userId: string; contentEncrypted: boolean } | null;
  association: { spaceId: string; noteId: string; removedAt: Date | null } | null;
};

/**
 * Canonical authorization policy for attaching or detaching an authored note
 * through a real Thread in a non-personal space.
 */
export function assertSharedThreadNotePolicy(input: SharedThreadNotePolicyInput): void {
  const { actorId, space, membership, thread, note, association } = input;
  if (!space || space.deletedAt || (space.type !== 'shared' && space.type !== 'public')) {
    throw new SharedSpaceLifecycleError('Shared space not found', 'SPACE_NOT_FOUND', 404);
  }
  const isOwner = space.userId === actorId;
  const isActiveMember =
    membership?.spaceId === space.id &&
    membership.userId === actorId &&
    ['owner', 'leader', 'member'].includes(membership.role);
  if (!isOwner && !isActiveMember) {
    throw new SharedSpaceLifecycleError('Active space membership required', 'NOT_SPACE_MEMBER', 403);
  }
  if (!thread || thread.spaceId !== space.id) {
    throw new SharedSpaceLifecycleError('Thread not found in this space', 'THREAD_NOT_IN_SPACE', 404);
  }
  if (input.requireCurrent && !thread.isPinned) {
    throw new SharedSpaceLifecycleError('Only the current Thread can receive new notes', 'THREAD_NOT_CURRENT', 409);
  }
  if (!note || note.userId !== actorId) {
    throw new SharedSpaceLifecycleError('Only the note author can change its Thread', 'NOT_NOTE_AUTHOR', 403);
  }
  if (note.contentEncrypted) {
    throw new SharedSpaceLifecycleError('Encrypted notes cannot be shared', 'ENCRYPTED_NOTE', 409);
  }
  if (
    !association ||
    association.spaceId !== space.id ||
    association.noteId !== note.id ||
    association.removedAt
  ) {
    throw new SharedSpaceLifecycleError(
      'The note must be actively shared with this space',
      'NOTE_NOT_ACTIVE_IN_SPACE',
      409,
    );
  }
}

export function canReadSharedThread(input: {
  viewerUserId: string;
  thread: { isPinned: boolean };
  space: { userId: string; deletedAt: Date | null };
  membership: { role: string } | null;
}): boolean {
  if (input.space.deletedAt) return false;
  if (input.space.userId === input.viewerUserId) return true;
  return Boolean(
    input.thread.isPinned &&
      input.membership &&
      ['owner', 'leader', 'member'].includes(input.membership.role),
  );
}

/**
 * Central direct-ID read gate. Shared-space owners can inspect every Thread;
 * current members only see the singular pinned Thread.
 */
export async function requireThreadReadAccess(
  executor: Executor,
  input: { threadId: string; viewerUserId: string },
) {
  const thread = first(
    await executor.select().from(Threads).where(eq(Threads.id, input.threadId)).limit(1),
  ) as typeof Threads.$inferSelect | undefined;
  if (!thread) {
    throw new SharedSpaceLifecycleError('Thread not found', 'THREAD_NOT_FOUND', 404);
  }
  if (!thread.spaceId) {
    if (thread.userId !== input.viewerUserId && thread.id !== 'thread_unorganized') {
      throw new SharedSpaceLifecycleError('Thread not found', 'THREAD_NOT_FOUND', 404);
    }
    return { thread, space: null, membership: null, viewerIsOwner: thread.userId === input.viewerUserId };
  }
  const space = first(
    await executor.select().from(Spaces).where(eq(Spaces.id, thread.spaceId)).limit(1),
  ) as typeof Spaces.$inferSelect | undefined;
  const membership = (space && space.userId !== input.viewerUserId
    ? first(
        await executor
          .select()
          .from(SpaceMemberships)
          .where(
            and(
              eq(SpaceMemberships.spaceId, space.id),
              eq(SpaceMemberships.userId, input.viewerUserId),
            ),
          )
          .limit(1),
      ) ?? null
    : null) as typeof SpaceMemberships.$inferSelect | null;
  if (
    !space ||
    !canReadSharedThread({
      viewerUserId: input.viewerUserId,
      thread,
      space,
      membership,
    })
  ) {
    throw new SharedSpaceLifecycleError('Thread not found', 'THREAD_NOT_FOUND', 404);
  }
  return {
    thread,
    space,
    membership,
    viewerIsOwner: space.userId === input.viewerUserId,
  };
}

export async function authorizeNoteThreadMutationInTransaction(
  tx: Executor,
  input: {
    actorId: string;
    noteId: string;
    threadId: string;
    requireCurrent: boolean;
  },
): Promise<{
  shared: boolean;
  note: typeof Notes.$inferSelect;
  thread: typeof Threads.$inferSelect;
}> {
  const snapshot = first(
    await tx.select({ spaceId: Threads.spaceId }).from(Threads).where(eq(Threads.id, input.threadId)).limit(1),
  ) as { spaceId: string | null } | undefined;
  if (!snapshot) throw new SharedSpaceLifecycleError('Thread not found', 'THREAD_NOT_FOUND', 404);
  const space = snapshot.spaceId
    ? first(
        await tx.select().from(Spaces).where(eq(Spaces.id, snapshot.spaceId)).for('update').limit(1),
      ) as typeof Spaces.$inferSelect | undefined
    : null;
  const thread = first(
    await tx.select().from(Threads).where(eq(Threads.id, input.threadId)).for('update').limit(1),
  ) as typeof Threads.$inferSelect | undefined;
  if (!thread || thread.spaceId !== snapshot.spaceId) {
    throw new SharedSpaceLifecycleError('Thread changed during mutation', 'THREAD_CONFLICT', 409);
  }
  const note = first(
    await tx.select().from(Notes).where(eq(Notes.id, input.noteId)).for('update').limit(1),
  ) as typeof Notes.$inferSelect | undefined;
  if (!note || note.userId !== input.actorId) {
    throw new SharedSpaceLifecycleError('Note not found', 'NOTE_NOT_FOUND', 404);
  }
  if (!space || space.type === 'personal') {
    if (thread.userId !== input.actorId || space?.deletedAt) {
      throw new SharedSpaceLifecycleError('Thread not found', 'THREAD_NOT_FOUND', 404);
    }
    return { shared: false, note, thread };
  }
  const membership = (
    space.userId === input.actorId
      ? null
      : first(
          await tx
            .select()
            .from(SpaceMemberships)
            .where(
              and(
                eq(SpaceMemberships.spaceId, space.id),
                eq(SpaceMemberships.userId, input.actorId),
              ),
            )
            .for('update')
            .limit(1),
        ) ?? null) as typeof SpaceMemberships.$inferSelect | null;
  const association = (
    first(
      await tx
        .select()
        .from(SpaceNotes)
        .where(and(eq(SpaceNotes.spaceId, space.id), eq(SpaceNotes.noteId, note.id)))
        .for('update')
        .limit(1),
    ) ?? null) as typeof SpaceNotes.$inferSelect | null;
  assertSharedThreadNotePolicy({
    actorId: input.actorId,
    requireCurrent: input.requireCurrent,
    space,
    membership,
    thread,
    note,
    association,
  });
  return { shared: true, note, thread };
}

export function selectPinnedThreadWinner<
  T extends { id: string; createdAt: Date; updatedAt: Date | null },
>(threads: T[]): T | null {
  return [...threads].sort((a, b) => {
    const aTime = (a.updatedAt ?? a.createdAt).getTime();
    const bTime = (b.updatedAt ?? b.createdAt).getTime();
    return bTime - aTime || b.id.localeCompare(a.id);
  })[0] ?? null;
}

export function canPublishNoteIntoSpace(input: {
  spaceType: string;
  spaceOwnerId: string;
  actorId: string;
  membershipRole: string | null;
}): boolean {
  if (input.spaceType !== 'public') return Boolean(input.membershipRole);
  return (
    input.actorId === input.spaceOwnerId ||
    input.membershipRole === 'owner' ||
    input.membershipRole === 'leader'
  );
}

export function buildAssociationRemovalPatch(actorId: string, now: Date) {
  return {
    removedBy: actorId,
    removedAt: now,
    updatedAt: now,
    isPinned: false,
    primaryCollection: null,
    secondaryCollections: null,
    collectionPinned: false,
    collectionUserOverride: false,
    order: 0,
  };
}

/**
 * After associations change, recompute each note's co-edit OR-mirror from live
 * SpaceNotes.coEditEnabled rows. Removing the last granting association clears
 * Notes.coEditEnabled so sharing again does not silently reopen editing.
 */
export async function revokeCoEditForUnsharedNotes(
  tx: Executor,
  noteIds: string[],
): Promise<void> {
  if (noteIds.length === 0) return;
  const { syncNoteCoEditMirror } = await import('./note-collaboration');
  const unique = [...new Set(noteIds)];
  for (const noteId of unique) {
    await syncNoteCoEditMirror(tx, noteId);
  }
}

export function buildAssociationReactivationPatch(actorId: string, now: Date) {
  return {
    addedBy: actorId,
    addedAt: now,
    removedBy: null,
    removedAt: null,
    updatedAt: now,
    isPinned: false,
    primaryCollection: null,
    secondaryCollections: null,
    collectionPinned: false,
    collectionUserOverride: false,
    order: 0,
    // Soft-delete keeps the old row; never re-open co-edit on reactivate.
    coEditEnabled: false,
    coEditEnabledAt: null,
  };
}

export async function associateAuthoredNoteWithSpace(
  tx: Executor,
  input: { spaceId: string; noteId: string; actorId: string; now: Date },
) {
  const space = first(
    await tx.select().from(Spaces).where(eq(Spaces.id, input.spaceId)).for('update').limit(1),
  ) as typeof Spaces.$inferSelect | undefined;
  if (!space || space.deletedAt) {
    throw new SharedSpaceLifecycleError('Space not found', 'NOT_FOUND', 404);
  }
  if (space.type === 'personal') {
    throw new SharedSpaceLifecycleError('Shared association requires a collaborative space', 'NOT_SHARED_SPACE');
  }
  const membership = first(
    await tx
      .select({ id: SpaceMemberships.id, role: SpaceMemberships.role })
      .from(SpaceMemberships)
      .where(
        and(
          eq(SpaceMemberships.spaceId, input.spaceId),
          eq(SpaceMemberships.userId, input.actorId),
        ),
      )
      .for('update')
      .limit(1),
  ) as { id: string; role: string } | undefined;
  if (!membership) throw new SharedSpaceLifecycleError('Access denied', 'FORBIDDEN', 403);
  if (!canPublishNoteIntoSpace({
    spaceType: space.type,
    spaceOwnerId: space.userId,
    actorId: input.actorId,
    membershipRole: membership.role,
  })) {
    throw new SharedSpaceLifecycleError(
      'Only the public space owner or an active leader can add notes',
      'PUBLIC_SPACE_AUTHOR_REQUIRED',
      403,
    );
  }

  const note = first(
    await tx.select().from(Notes).where(eq(Notes.id, input.noteId)).for('update').limit(1),
  ) as typeof Notes.$inferSelect | undefined;
  if (!note) throw new SharedSpaceLifecycleError('Note not found', 'NOT_FOUND', 404);
  if (note.userId !== input.actorId) {
    throw new SharedSpaceLifecycleError(
      'Save an attributed independent copy instead of resharing another author’s note',
      'SAVE_COPY_REQUIRED',
      409,
    );
  }
  if (note.contentEncrypted) {
    throw new SharedSpaceLifecycleError("Locked notes can't be shared", 'LOCKED_NOTE', 409);
  }
  if (note.addedBy === 'system') {
    throw new SharedSpaceLifecycleError('System notes cannot be shared', 'SYSTEM_NOTE');
  }

  const existing = first(
    await tx
      .select()
      .from(SpaceNotes)
      .where(and(eq(SpaceNotes.spaceId, input.spaceId), eq(SpaceNotes.noteId, input.noteId)))
      .for('update')
      .limit(1),
  ) as typeof SpaceNotes.$inferSelect | undefined;
  if (existing) {
    if (!existing.removedAt) {
      return { association: existing, reactivated: false };
    }
    const association = first(
      await tx
        .update(SpaceNotes)
        .set(buildAssociationReactivationPatch(input.actorId, input.now))
        .where(eq(SpaceNotes.id, existing.id))
        .returning(),
    );
    return { association, reactivated: true };
  }

  const association = first(
    await tx
      .insert(SpaceNotes)
      .values(
        buildSpaceNoteAssociation({
          id: `space-note-${crypto.randomUUID()}`,
          spaceId: input.spaceId,
          noteId: input.noteId,
          actorId: input.actorId,
          now: input.now,
        }),
      )
      .returning(),
  ) as typeof SpaceNotes.$inferSelect | undefined;
  return { association, reactivated: false };
}

export async function archiveNoteFromSpace(
  tx: Executor,
  input: { spaceId: string; noteId: string; actorId: string; now: Date; ownerMayModerate: boolean },
) {
  const note = first(
    await tx.select().from(Notes).where(eq(Notes.id, input.noteId)).for('update').limit(1),
  ) as typeof Notes.$inferSelect | undefined;
  const association = first(
    await tx
      .select()
      .from(SpaceNotes)
      .where(
        and(
          eq(SpaceNotes.spaceId, input.spaceId),
          eq(SpaceNotes.noteId, input.noteId),
          isNull(SpaceNotes.removedAt),
        ),
      )
      .for('update')
      .limit(1),
  ) as typeof SpaceNotes.$inferSelect | undefined;
  if (!note || !association) {
    throw new SharedSpaceLifecycleError('Note not found in space', 'NOT_FOUND', 404);
  }
  if (note.userId !== input.actorId && !input.ownerMayModerate) {
    throw new SharedSpaceLifecycleError('No permission to remove this note', 'FORBIDDEN', 403);
  }

  await tx
    .update(SpaceNotes)
    .set(buildAssociationRemovalPatch(input.actorId, input.now))
    .where(eq(SpaceNotes.id, association.id));
  await revokeCoEditForUnsharedNotes(tx, [input.noteId]);
  const spaceThreads = await tx
    .select({ id: Threads.id })
    .from(Threads)
    .where(eq(Threads.spaceId, input.spaceId));
  if (spaceThreads.length > 0) {
    await tx
      .delete(NoteThreads)
      .where(
        and(
          eq(NoteThreads.noteId, input.noteId),
          inArray(NoteThreads.threadId, spaceThreads.map((thread: { id: string }) => thread.id)),
        ),
      );
  }
  return { note, association };
}

export async function removeMemberPreservingResponses(
  tx: Executor,
  input: {
    spaceId: string;
    targetUserId: string;
    actorId: string;
    now: Date;
    displayNameSnapshot?: string | null;
  },
) {
  const authoredAssociations = await tx
    .select({ id: SpaceNotes.id, noteId: SpaceNotes.noteId })
    .from(SpaceNotes)
    .innerJoin(Notes, eq(Notes.id, SpaceNotes.noteId))
    .where(
      and(
        eq(SpaceNotes.spaceId, input.spaceId),
        eq(Notes.userId, input.targetUserId),
        isNull(SpaceNotes.removedAt),
      ),
    );
  if (authoredAssociations.length > 0) {
    await tx
      .update(SpaceNotes)
      .set(buildAssociationRemovalPatch(input.actorId, input.now))
      .where(inArray(SpaceNotes.id, authoredAssociations.map((row: { id: string }) => row.id)));
    await revokeCoEditForUnsharedNotes(
      tx,
      authoredAssociations.map((row: { noteId: string }) => row.noteId),
    );
    const spaceThreads = await tx
      .select({ id: Threads.id })
      .from(Threads)
      .where(eq(Threads.spaceId, input.spaceId));
    if (spaceThreads.length > 0) {
      await tx
        .delete(NoteThreads)
        .where(
          and(
            inArray(
              NoteThreads.noteId,
              authoredAssociations.map((row: { noteId: string }) => row.noteId),
            ),
            inArray(NoteThreads.threadId, spaceThreads.map((row: { id: string }) => row.id)),
          ),
        );
    }
  }
  await tx
    .delete(SpaceMemberships)
    .where(
      and(
        eq(SpaceMemberships.spaceId, input.spaceId),
        eq(SpaceMemberships.userId, input.targetUserId),
      ),
    );
  if (input.displayNameSnapshot) {
    await tx
      .update(StudyThreadEntries)
      .set({ actorDisplayNameSnapshot: input.displayNameSnapshot })
      .where(
        and(
          eq(StudyThreadEntries.spaceId, input.spaceId),
          eq(StudyThreadEntries.userId, input.targetUserId),
          isNull(StudyThreadEntries.actorDisplayNameSnapshot),
        ),
      );
  }
  // Response rows are deliberately preserved.
  return { archivedNoteIds: authoredAssociations.map((row: { noteId: string }) => row.noteId) };
}

export function softDeleteSpacePatch(now: Date) {
  return {
    deletedAt: now,
    recoveryUntil: new Date(now.getTime() + SPACE_RECOVERY_WINDOW_MS),
    isActive: false,
    updatedAt: now,
  };
}

export async function softDeleteSharedSpaceInTransaction(
  tx: Executor,
  input: { spaceId: string; ownerId: string; now: Date },
) {
  const space = first(
    await tx
      .select()
      .from(Spaces)
      .where(and(eq(Spaces.id, input.spaceId), eq(Spaces.userId, input.ownerId)))
      .for('update')
      .limit(1),
  ) as typeof Spaces.$inferSelect | undefined;
  if (!space || space.deletedAt) {
    throw new SharedSpaceLifecycleError('Space not found', 'NOT_FOUND', 404);
  }
  if (space.type === 'personal') {
    throw new SharedSpaceLifecycleError(
      'Personal spaces do not use recoverable deletion',
      'PERSONAL_SPACE',
      409,
    );
  }
  const patch = softDeleteSpacePatch(input.now);
  await tx.update(Spaces).set(patch).where(eq(Spaces.id, space.id));
  await tx
    .update(SpaceInvites)
    .set({ revokedAt: input.now })
    .where(and(eq(SpaceInvites.spaceId, space.id), isNull(SpaceInvites.revokedAt)));
  return { space, ...patch };
}

export function canRestoreDeletedSpace(
  space: Pick<typeof Spaces.$inferSelect, 'deletedAt' | 'recoveryUntil'>,
  now: Date,
): boolean {
  return Boolean(space.deletedAt && space.recoveryUntil && space.recoveryUntil >= now);
}

export async function setSingularThreadPin(
  tx: Executor,
  input: { spaceId: string; threadId: string; isPinned: boolean; now: Date },
) {
  const space = first(
    await tx
      .select({ id: Spaces.id, deletedAt: Spaces.deletedAt })
      .from(Spaces)
      .where(eq(Spaces.id, input.spaceId))
      .for('update')
      .limit(1),
  ) as Pick<typeof Spaces.$inferSelect, 'id' | 'deletedAt'> | undefined;
  if (!space || space.deletedAt) {
    throw new SharedSpaceLifecycleError('Space not found', 'SPACE_NOT_FOUND', 404);
  }
  const thread = first(
    await tx
      .select({ id: Threads.id })
      .from(Threads)
      .where(and(eq(Threads.id, input.threadId), eq(Threads.spaceId, input.spaceId)))
      .for('update')
      .limit(1),
  );
  if (!thread) {
    throw new SharedSpaceLifecycleError('Thread not found in space', 'NOT_FOUND', 404);
  }
  if (input.isPinned) {
    await tx.update(Threads).set({ isPinned: false }).where(eq(Threads.spaceId, input.spaceId));
  }
  await tx
    .update(Threads)
    .set({ isPinned: input.isPinned, updatedAt: input.now })
    .where(and(eq(Threads.id, input.threadId), eq(Threads.spaceId, input.spaceId)));
}

/**
 * Delete a Thread and its junctions atomically. Shared Thread deletion never
 * rewrites canonical Notes placement; personal deletion retains My Pile
 * reparenting compatibility.
 */
export async function deleteThreadInTransaction(
  tx: Executor,
  input: { threadId: string; actorId: string },
): Promise<{ kind: 'shared' | 'personal'; affectedNoteIds: string[] }> {
  const thread = first(
    await tx
      .select()
      .from(Threads)
      .where(and(eq(Threads.id, input.threadId), eq(Threads.userId, input.actorId)))
      .for('update')
      .limit(1),
  ) as typeof Threads.$inferSelect | undefined;
  if (!thread) throw new SharedSpaceLifecycleError('Thread not found or access denied', 'NOT_FOUND', 404);
  if (thread.id === 'thread_unorganized') {
    throw new SharedSpaceLifecycleError('Cannot delete the unorganized thread', 'INVALID_THREAD', 400);
  }

  let shared = false;
  if (thread.spaceId) {
    const space = first(
      await tx.select().from(Spaces).where(eq(Spaces.id, thread.spaceId)).for('update').limit(1),
    ) as typeof Spaces.$inferSelect | undefined;
    if (!space || space.deletedAt) {
      throw new SharedSpaceLifecycleError('Space not found', 'SPACE_NOT_FOUND', 404);
    }
    shared = space.type === 'shared' || space.type === 'public';
    if (shared && space.userId !== input.actorId) {
      throw new SharedSpaceLifecycleError('Only the space owner can delete shared threads', 'FORBIDDEN', 403);
    }
  }

  const affected = (await tx
    .select({ noteId: NoteThreads.noteId })
    .from(NoteThreads)
    .where(eq(NoteThreads.threadId, thread.id))
    .for('update')) as Array<{ noteId: string }>;
  const affectedNoteIds: string[] = [...new Set(affected.map((row) => row.noteId))];
  await tx.delete(NoteThreads).where(eq(NoteThreads.threadId, thread.id));

  if (!shared && affectedNoteIds.length > 0) {
    const remaining = (await tx
      .select({ noteId: NoteThreads.noteId, threadId: NoteThreads.threadId })
      .from(NoteThreads)
      .where(inArray(NoteThreads.noteId, affectedNoteIds))) as Array<{
      noteId: string;
      threadId: string;
    }>;
    const firstRemainingByNote = new Map<string, string>();
    for (const relation of remaining) {
      if (!firstRemainingByNote.has(relation.noteId)) {
        firstRemainingByNote.set(relation.noteId, relation.threadId);
      }
    }
    const notesByDestination = new Map<string, string[]>();
    for (const noteId of affectedNoteIds) {
      const destination = firstRemainingByNote.get(noteId) ?? 'thread_unorganized';
      notesByDestination.set(destination, [...(notesByDestination.get(destination) ?? []), noteId]);
    }
    for (const [destination, noteIds] of notesByDestination) {
      await tx
        .update(Notes)
        .set({ threadId: destination, spaceId: null })
        .where(and(inArray(Notes.id, noteIds), eq(Notes.userId, input.actorId)));
    }
  }

  const deleted = await tx
    .delete(Threads)
    .where(and(eq(Threads.id, thread.id), eq(Threads.userId, input.actorId)))
    .returning({ id: Threads.id });
  if (deleted.length !== 1) throw new Error('Thread deletion lost its locked row');
  return { kind: shared ? 'shared' : 'personal', affectedNoteIds };
}

export const EXPIRED_SPACE_PURGE_TABLES = [
  'NoteThreads',
  'StudyThreadEntries',
  'NoteConnections',
  'SpaceNotes',
  'Threads',
  'SpaceInvites',
  'SpaceInvitations',
  'Members',
  'SpaceMemberships',
  'Spaces',
] as const;

export const EXPIRED_SPACE_PURGE_BATCH_SIZE = 10;
const PURGE_MAINTENANCE_INTERVAL_MS = 60 * 60 * 1000;
let lastPurgeMaintenanceAt = 0;

export function isExpiredSpacePurgeCandidate(
  space: {
    deletedAt: Date | null;
    recoveryUntil: Date | null;
    isActive: boolean;
  },
  now: Date,
): boolean {
  return Boolean(
    space.deletedAt &&
    space.recoveryUntil &&
    space.recoveryUntil < now &&
    !space.isActive,
  );
}

export async function purgeExpiredDeletedSpaces(
  now = new Date(),
  limit = EXPIRED_SPACE_PURGE_BATCH_SIZE,
): Promise<string[]> {
  return db.transaction(async (tx) => {
    const expired = await tx
      .select({ id: Spaces.id })
      .from(Spaces)
      .where(
        and(
          isNotNull(Spaces.deletedAt),
          isNotNull(Spaces.recoveryUntil),
          lt(Spaces.recoveryUntil, now),
          eq(Spaces.isActive, false),
        ),
      )
      .limit(limit);
    const purgedIds: string[] = [];
    for (const { id: spaceId } of expired) {
      const locked = first(
        await tx
          .select({
            id: Spaces.id,
            deletedAt: Spaces.deletedAt,
            recoveryUntil: Spaces.recoveryUntil,
            isActive: Spaces.isActive,
          })
          .from(Spaces)
          .where(eq(Spaces.id, spaceId))
          .for('update')
          .limit(1),
      );
      if (!locked || !isExpiredSpacePurgeCandidate(locked, now)) {
        continue;
      }
      const threadRows = await tx
        .select({ id: Threads.id })
        .from(Threads)
        .where(eq(Threads.spaceId, spaceId));
      if (threadRows.length > 0) {
        await tx
          .delete(NoteThreads)
          .where(inArray(NoteThreads.threadId, threadRows.map((row: { id: string }) => row.id)));
      }
      await tx.delete(StudyThreadEntries).where(eq(StudyThreadEntries.spaceId, spaceId));
      await tx.delete(NoteConnections).where(eq(NoteConnections.spaceId, spaceId));
      await tx.delete(SpaceNotes).where(eq(SpaceNotes.spaceId, spaceId));
      await tx.delete(Threads).where(eq(Threads.spaceId, spaceId));
      await tx.delete(SpaceInvites).where(eq(SpaceInvites.spaceId, spaceId));
      await tx.delete(SpaceInvitations).where(eq(SpaceInvitations.spaceId, spaceId));
      await tx.delete(Members).where(eq(Members.spaceId, spaceId));
      await tx.delete(SpaceMemberships).where(eq(SpaceMemberships.spaceId, spaceId));
      await tx.delete(Spaces).where(eq(Spaces.id, spaceId));
      purgedIds.push(spaceId);
    }
    return purgedIds;
  });
}

export async function runBoundedExpiredSpaceMaintenance(now = new Date()): Promise<string[]> {
  if (now.getTime() - lastPurgeMaintenanceAt < PURGE_MAINTENANCE_INTERVAL_MS) return [];
  lastPurgeMaintenanceAt = now.getTime();
  try {
    return await purgeExpiredDeletedSpaces(now, EXPIRED_SPACE_PURGE_BATCH_SIZE);
  } catch (error) {
    console.warn('[space-maintenance] expired space purge failed', error);
    return [];
  }
}

export function serializeSpaceMemberForViewer<T extends Record<string, unknown>>(
  member: T,
  viewerIsOwner: boolean,
): T | {
  userId: unknown;
  role: unknown;
  joinedAt: unknown;
  displayName: string;
  profileImageUrl: unknown;
  userColor: unknown;
} {
  if (viewerIsOwner) return member;
  return {
    userId: member.userId,
    role: member.role,
    joinedAt: member.joinedAt,
    displayName: safeMemberDisplayName({
      firstName: typeof member.firstName === 'string' ? member.firstName : null,
      lastName: typeof member.lastName === 'string' ? member.lastName : null,
    }),
    profileImageUrl: member.profileImageUrl ?? null,
    userColor: member.userColor ?? 'blue',
  };
}

export function safeMemberDisplayName(input: {
  firstName?: string | null;
  lastName?: string | null;
  snapshot?: string | null;
}): string {
  const first = input.firstName?.trim() ?? '';
  const lastInitial = input.lastName?.trim().charAt(0).toUpperCase() ?? '';
  if (first) return lastInitial ? `${first} ${lastInitial}.` : first;
  const snapshot = input.snapshot?.trim() ?? '';
  if (snapshot && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(snapshot)) return snapshot;
  return 'Member';
}

export function evaluateLockedInviteRedemption(input: {
  invite: {
    revokedAt: Date | null;
    expiresAt: Date | null;
    maxUses: number | null;
    useCount: number;
  } | null;
  space: { deletedAt: Date | null; type: string } | null;
  alreadyMember: boolean;
  memberCount: number;
  memberCap: number;
  now: Date;
}): 'dead' | 'already-member' | 'full' | 'join' {
  if (
    !input.invite ||
    input.invite.revokedAt ||
    (input.invite.expiresAt && input.invite.expiresAt <= input.now) ||
    (input.invite.maxUses !== null && input.invite.useCount >= input.invite.maxUses) ||
    !input.space ||
    input.space.deletedAt ||
    input.space.type === 'personal'
  ) {
    return 'dead';
  }
  if (input.alreadyMember) return 'already-member';
  if (input.memberCount >= input.memberCap) return 'full';
  return 'join';
}

export function serializeInvitePreview<T extends {
  space: unknown;
  owner: unknown;
  memberCount: number;
  isAlreadyMember: boolean;
  expiresAt: unknown;
  viewer: unknown;
}>(preview: T) {
  return {
    space: preview.space,
    owner: preview.owner,
    memberCount: preview.memberCount,
    isAlreadyMember: preview.isAlreadyMember,
    expiresAt: preview.expiresAt,
    viewer: preview.viewer,
  };
}

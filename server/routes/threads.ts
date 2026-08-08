/**
 * Thread routes — Hono port of:
 *   - src/pages/api/threads/list.ts
 *   - src/pages/api/threads/create.ts
 *   - src/pages/api/threads/update.ts
 *   - src/pages/api/threads/delete.ts
 *   - src/pages/api/threads/ensure-unorganized.ts
 *   - src/pages/api/threads/erase-with-notes.ts
 *   - src/pages/api/threads/[threadId]/prefetch.ts
 *   - src/pages/api/threads/[threadId]/note-type-counts.ts
 *   - src/pages/api/threads/[threadId]/notes.ts
 *   - src/pages/api/threads/[threadId]/share.ts (GET + POST)
 *   - src/pages/api/threads/[threadId]/referenced-scripture-notes.ts
 */

import { Hono } from 'hono';
import { getAuthenticatedAuth, requireAuth, requireParam } from '../middleware/auth';
import {
  db, Threads, ThreadProgress, Notes, NoteThreads, NoteScriptureReferences, Spaces, SpaceNotes, SpaceMemberships,
  eq, and, or, inArray, isNull,
  first,
} from '../db';
import { nowISO } from '../db/dates';
import {
  getAllThreadsWithCounts,
  getThreadWithCount,
  getNotesForThread,
  getNotesForThreadForMember,
  getThreadNoteTypeCounts,
} from '../utils/dashboard-data';
import { ensureUnorganizedThread } from '../utils/unorganized-thread';
import { isUniqueViolationError } from '../utils/db-errors';
import { repairMissingNoteThreadJunctionsForUser } from '../utils/thread-junction-repair';
import { requireSpaceAccess, SpaceAccessError, isActualSpaceOwner } from '../utils/space-access';
import { isPublishedSeriesThread } from '../utils/church-series-publish';
import {
  canManageSpaceThreadStructure,
  isSequenceMode,
  loadLiveThreadNoteIds,
  readTogetherPulse,
  resolveSequenceState,
  serializeSequenceNoteIds,
  withOpenedStep,
} from '../utils/thread-sequence';
import {
  assertSharedThreadNotePolicy,
  deleteThreadInTransaction,
  requireThreadReadAccess,
  SharedSpaceLifecycleError,
} from '../utils/shared-space-lifecycle';
import { awardCreationBonusXP, awardThreadCreatedXP, revokeXPOnDeletion, revokeAllXPForItem, deleteAllXpForRelatedIds } from '../utils/xp-system';
import { moveScriptureNotesToThread } from '../utils/move-scripture-notes-to-thread';
import { getNextUntitledThreadName } from '../utils/untitled-naming';
import { getThreadColorCSS, getThreadGradientCSS, THREAD_COLORS, getRandomThreadColor } from '@/utils/colors';
import { handleAPIError } from '@/utils/error-handling';
import { validateTitle, validateColor, validateSpaceId } from '@/utils/validation';
import { rateLimit } from '@/utils/rate-limit';
import { generateThreadId, generateShareToken } from '@/utils/ids';
import { MY_PILE_THREAD_TITLE } from '@/utils/my-pile-thread';
import { deleteNotesCascadeForUser } from '../utils/delete-note-cascade';
import { recordDeletedEntities } from '../utils/sync-deletion-log';
import { broadcastInvalidation } from '../utils/realtime';
import { queueAudiencefulProductFlagsForUser } from '../utils/audienceful-product-flags';

const route = new Hono();

const ERASE_NOTE_CHUNK = 2000;

async function readableThreadOrNull(threadId: string, viewerUserId: string) {
  try {
    return await requireThreadReadAccess(db, { threadId, viewerUserId });
  } catch (error) {
    if (error instanceof SharedSpaceLifecycleError && error.status === 404) return null;
    throw error;
  }
}

export function threadAllowsPublicBroadcast(spaceType: string | null | undefined): boolean {
  return !spaceType || spaceType === 'personal';
}

export function canAttachNoteToSharedThread(input: {
  associationActive: boolean;
  contentEncrypted: boolean;
  actorIsNoteAuthor: boolean;
  actorMayModerate: boolean;
}): boolean {
  return (
    input.associationActive &&
    !input.contentEncrypted &&
    input.actorIsNoteAuthor
  );
}

export function attributeSharedThreadNotesForViewer<T extends { authorUserId?: string | null }>(
  notes: T[],
  viewerUserId: string,
): Array<T & { isOwnNote: boolean }> {
  return notes.map((note) => ({
    ...note,
    isOwnNote: note.authorUserId === viewerUserId,
  }));
}

async function attachNotesToSharedThread(
  thread: { id: string; spaceId: string | null; isPinned: boolean },
  space: { id: string; type: string; userId: string; deletedAt: Date | null },
  membershipRole: string,
  noteIds: string[],
  actorId: string,
): Promise<void> {
  if (noteIds.length === 0) return;
  const uniqueNoteIds = [...new Set(noteIds)];
  await db.transaction(async (tx) => {
    const lockedSpace = first(
      await tx.select().from(Spaces).where(eq(Spaces.id, space.id)).for('update').limit(1),
    );
    const lockedThread = first(
      await tx
        .select()
        .from(Threads)
        .where(and(eq(Threads.id, thread.id), eq(Threads.spaceId, space.id)))
        .for('update')
        .limit(1),
    );
    const membership =
      lockedSpace?.userId === actorId
        ? null
        : first(
            await tx
              .select()
              .from(SpaceMemberships)
              .where(
                and(
                  eq(SpaceMemberships.spaceId, space.id),
                  eq(SpaceMemberships.userId, actorId),
                ),
              )
              .for('update')
              .limit(1),
          ) ?? null;
    const lockedNotes = await tx
      .select()
      .from(Notes)
      .where(inArray(Notes.id, uniqueNoteIds))
      .for('update');
    const lockedAssociations = await tx
      .select()
      .from(SpaceNotes)
      .where(and(eq(SpaceNotes.spaceId, space.id), inArray(SpaceNotes.noteId, uniqueNoteIds)))
      .for('update');
    if (lockedNotes.length !== uniqueNoteIds.length) {
      throw new SharedSpaceLifecycleError(
        'Every note must be actively shared with this space before attaching it',
        'NOTE_NOT_FOUND',
        404,
      );
    }
    const associationByNoteId = new Map(
      lockedAssociations.map((association) => [association.noteId, association]),
    );
    for (const note of lockedNotes) {
      const association = associationByNoteId.get(note.id) ?? null;
      assertSharedThreadNotePolicy({
        actorId,
        requireCurrent: true,
        space: lockedSpace ?? null,
        membership,
        thread: lockedThread ?? null,
        note,
        association,
      });
    }
    await tx
      .insert(NoteThreads)
      .values(
        lockedNotes.map((note) => ({
          id: `note-thread-${crypto.randomUUID()}`,
          noteId: note.id,
          threadId: lockedThread!.id,
          createdAt: nowISO(),
        })),
      )
      .onConflictDoNothing();
  });
  void membershipRole;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseSelectedNoteIds(raw: string | null): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (trimmed.length === 0) return [];
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
  return [];
}

async function addNotesToThread(
  noteIds: string[],
  threadId: string,
  userId: string,
): Promise<void> {
  if (noteIds.length === 0) return;
  try {
    // Batch the upfront reads instead of querying per note:
    //   1) which of the requested notes the user actually owns (+ their threadId)
    //   2) all existing junction rows for those notes (to skip dupes and to know
    //      whether the note currently lives only in unorganized)
    const [validNotes, existingRelations] = await Promise.all([
      db.select({ id: Notes.id, threadId: Notes.threadId }).from(Notes)
        .where(and(inArray(Notes.id, noteIds), eq(Notes.userId, userId))),
      db.select({ noteId: NoteThreads.noteId, threadId: NoteThreads.threadId }).from(NoteThreads)
        .where(inArray(NoteThreads.noteId, noteIds)),
    ]);

    const validNoteMap = new Map(validNotes.map(n => [n.id, n]));
    const relationsByNote = new Map<string, Set<string>>();
    for (const rel of existingRelations) {
      if (!relationsByNote.has(rel.noteId)) relationsByNote.set(rel.noteId, new Set());
      relationsByNote.get(rel.noteId)!.add(rel.threadId);
    }

    const now = nowISO();
    const rowsToInsert: Array<{ id: string; noteId: string; threadId: string; createdAt: typeof now }> = [];
    const notesToReparent: string[] = [];
    let i = 0;
    for (const noteId of noteIds) {
      const note = validNoteMap.get(noteId);
      if (!note) continue;
      const threadsForNote = relationsByNote.get(noteId);
      if (threadsForNote?.has(threadId)) continue; // relation already exists
      const isInUnorganized = !threadsForNote || threadsForNote.size === 0 || note.threadId === 'thread_unorganized';
      rowsToInsert.push({
        id: `note-thread-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 11)}`,
        noteId,
        threadId,
        createdAt: now,
      });
      if (isInUnorganized && threadId !== 'thread_unorganized') notesToReparent.push(noteId);
      i++;
    }

    if (rowsToInsert.length > 0) {
      // onConflictDoNothing guards against a concurrent insert racing the read above.
      await db.insert(NoteThreads).values(rowsToInsert).onConflictDoNothing();
    }
    if (notesToReparent.length > 0) {
      await db.update(Notes).set({ threadId })
        .where(and(inArray(Notes.id, notesToReparent), eq(Notes.userId, userId)));
    }

    // Non-blocking per-note scripture reparenting (unchanged behavior).
    for (const { noteId } of rowsToInsert) {
      moveScriptureNotesToThread(noteId, threadId, userId).catch((error) => {
        console.error(`Error moving scripture notes for note ${noteId} (non-blocking):`, error);
      });
    }
  } catch (error) {
    console.error('Error adding notes to thread:', error);
  }
}

// ─── GET /api/threads/list ──────────────────────────────────────────────────
route.get('/api/threads/list', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    await repairMissingNoteThreadJunctionsForUser(auth.userId);
    const threads = await getAllThreadsWithCounts(auth.userId);

    const threadOptions = threads.map((thread: any) => ({
      id: thread.id,
      title: thread.title,
      color: thread.color,
      spaceId: thread.spaceId || null,
      noteCount: thread.noteCount,
      backgroundGradient: thread.backgroundGradient || getThreadGradientCSS(thread.color || 'blue'),
    }));

    const unorganizedThreadData = await ensureUnorganizedThread(auth.userId);
    const hasUnorganizedThread = threadOptions.some((thread: any) => thread.id === 'thread_unorganized');

    if (!hasUnorganizedThread) {
      threadOptions.unshift({
        id: 'thread_unorganized',
        title: MY_PILE_THREAD_TITLE,
        color: null,
        spaceId: null,
        noteCount: unorganizedThreadData.noteCount || 0,
        backgroundGradient: getThreadGradientCSS('paper'),
      });
    } else {
      const unorganizedIndex = threadOptions.findIndex((thread: any) => thread.id === 'thread_unorganized');
      if (unorganizedIndex !== -1) {
        threadOptions[unorganizedIndex].noteCount = unorganizedThreadData.noteCount || 0;
        threadOptions[unorganizedIndex].spaceId = null;
      }
    }

    return c.json(threadOptions);
  } catch (error) {
    const standardError = handleAPIError(error, { endpoint: '/api/threads/list', action: 'list_threads' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/threads/create ───────────────────────────────────────────────
route.post('/api/threads/create', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const formData = await c.req.formData();
    const title = formData.get('title') as string;
    const color = formData.get('color') as string;
    const isPublic = formData.get('isPublic') === 'true';
    const spaceId = formData.get('spaceId') as string;
    const selectedNoteIds = parseSelectedNoteIds(formData.get('selectedNoteIds') as string | null);

    const titleValidation = validateTitle(title, false);
    if (!titleValidation.isValid) return c.json({ error: titleValidation.error, code: titleValidation.code }, 400);

    let finalTitle: string;
    if (!title || !title.trim()) {
      finalTitle = await getNextUntitledThreadName(auth.userId);
    } else {
      finalTitle = title.trim();
    }

    const colorValidation = validateColor(color);
    if (!colorValidation.isValid) return c.json({ error: colorValidation.error, code: colorValidation.code }, 400);
    let threadColor = color;
    if (color && !THREAD_COLORS.includes(color as any)) threadColor = getRandomThreadColor();
    else if (!color) threadColor = getRandomThreadColor();

    const spaceIdValidation = validateSpaceId(spaceId);
    if (!spaceIdValidation.isValid) return c.json({ error: spaceIdValidation.error, code: spaceIdValidation.code }, 400);
    let finalSpaceId = null;
    let finalSpaceAccess: Awaited<ReturnType<typeof requireSpaceAccess>> | null = null;
    if (spaceId && spaceId.trim() && spaceId !== 'default_space') finalSpaceId = spaceId;

    if (finalSpaceId) {
      try {
        const access = await requireSpaceAccess(finalSpaceId, auth.userId);
        finalSpaceAccess = access;
        if (
          access.space.type !== 'personal' &&
          !isActualSpaceOwner(access.space, auth.userId)
        ) {
          return c.json({
            error: 'Only the space owner can create threads in a shared space',
            code: 'FORBIDDEN',
          }, 403);
        }
        if (!threadAllowsPublicBroadcast(access.space.type) && isPublic) {
          return c.json({
            error: 'Shared-space Threads cannot be published with public links',
            code: 'SHARED_THREAD_NOT_PUBLIC',
          }, 409);
        }
        if (access.space.type !== 'personal' && selectedNoteIds.length > 0) {
          return c.json({
            error: 'Set the Thread as current before attaching notes',
            code: 'THREAD_NOT_CURRENT',
          }, 409);
        }
      } catch (err) {
        if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
        throw err;
      }
    }

    const capitalizedTitle = finalTitle.charAt(0).toUpperCase() + finalTitle.slice(1);
    const shareToken = isPublic ? generateShareToken() : null;
    const now = nowISO();

    const newThread = first(await db.insert(Threads).values({
      id: generateThreadId(),
      title: capitalizedTitle,
      subtitle: null,
      spaceId: finalSpaceId,
      userId: auth.userId,
      isPublic,
      color: threadColor,
      isPinned: false,
      shareToken,
      shareTokenCreatedAt: isPublic ? now : null,
      createdAt: now,
      updatedAt: now,
      lastVisited: now,
    }).returning())!;

    if (selectedNoteIds.length > 0) {
      if (finalSpaceId && finalSpaceAccess && finalSpaceAccess.space.type !== 'personal') {
        await attachNotesToSharedThread(
          newThread,
          finalSpaceAccess.space,
          finalSpaceAccess.role,
          selectedNoteIds,
          auth.userId,
        );
      } else {
        await addNotesToThread(selectedNoteIds, newThread.id, auth.userId);
      }
      await db.update(Threads).set({ updatedAt: nowISO() })
        .where(and(eq(Threads.id, newThread.id), eq(Threads.userId, auth.userId)));
    }

    awardCreationBonusXP(auth.userId, 'thread').catch(() => {});
    awardThreadCreatedXP(auth.userId, newThread.id, capitalizedTitle, null).catch(() => {});

    // 2.0 study Thread: shared-space Start Thread only (not Classic personal piles / folders).
    if (finalSpaceAccess && finalSpaceAccess.space.type !== 'personal') {
      queueAudiencefulProductFlagsForUser(auth.userId, {
        has_created_thread: true,
        ...(shareToken ? { has_shared: true } : {}),
      });
    } else if (shareToken) {
      queueAudiencefulProductFlagsForUser(auth.userId, { has_shared: true });
    }

    broadcastInvalidation(auth.userId, { type: 'thread:updated', id: newThread.id });
    return c.json({ success: 'Thread created!', thread: newThread });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/threads/create', action: 'create_thread' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/threads/update ───────────────────────────────────────────────
route.post('/api/threads/update', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const formData = await c.req.formData();
    const threadId = formData.get('id') as string;
    const title = formData.get('title') as string;
    const color = formData.get('color') as string;
    const subtitle = formData.get('subtitle') as string | null;
    const isPublic = formData.get('isPublic') === 'true';
    const selectedNoteIds = parseSelectedNoteIds(formData.get('selectedNoteIds') as string | null);

    if (!threadId) return c.json({ error: 'Thread ID is required' }, 400);

    const titleValidation = validateTitle(title, true);
    if (!titleValidation.isValid) return c.json({ error: titleValidation.error, code: titleValidation.code }, 400);

    const colorValidation = validateColor(color);
    if (!colorValidation.isValid) return c.json({ error: colorValidation.error, code: colorValidation.code }, 400);

    // Inline the Astro action logic: verify ownership then update
    const currentThread = first(await db.select().from(Threads)
      .where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId))).limit(1));
    if (!currentThread) return c.json({ error: 'Thread not found or access denied' }, 404);
    let sharedThreadAccess: Awaited<ReturnType<typeof requireSpaceAccess>> | null = null;
    if (currentThread.spaceId) {
      try {
        sharedThreadAccess = await requireSpaceAccess(currentThread.spaceId, auth.userId);
      } catch (error) {
        if (error instanceof SpaceAccessError) {
          return c.json({ error: error.message, code: error.code }, error.status);
        }
        throw error;
      }
      if (
        sharedThreadAccess.space.type !== 'personal' &&
        !isActualSpaceOwner(sharedThreadAccess.space, auth.userId)
      ) {
        return c.json({ error: 'Only the space owner can update shared threads', code: 'FORBIDDEN' }, 403);
      }
      if (!threadAllowsPublicBroadcast(sharedThreadAccess.space.type) && isPublic) {
        return c.json({
          error: 'Shared-space Threads cannot be published with public links',
          code: 'SHARED_THREAD_NOT_PUBLIC',
        }, 409);
      }
    }

    const capitalizedTitle = title.charAt(0).toUpperCase() + title.slice(1);
    const normalizedSubtitle = subtitle || null;

    // Compare values to determine if only color changed
    const titleChanged = currentThread.title !== capitalizedTitle;
    const subtitleChanged = (currentThread.subtitle || null) !== normalizedSubtitle;
    const isPublicChanged = currentThread.isPublic !== isPublic;
    const onlyColorChanged = !titleChanged && !subtitleChanged && !isPublicChanged;

    const updateData: any = {
      title: capitalizedTitle,
      subtitle: normalizedSubtitle,
      isPublic,
      color,
      ...(sharedThreadAccess && !threadAllowsPublicBroadcast(sharedThreadAccess.space.type)
        ? { isPublic: false, shareToken: null, shareTokenCreatedAt: null }
        : {}),
    };
    if (!onlyColorChanged) {
      updateData.updatedAt = nowISO();
    }

    const updatedThread = first(await db.update(Threads).set(updateData)
      .where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId))).returning())!;

    // Add selected notes to thread
    if (selectedNoteIds.length > 0) {
      if (currentThread.spaceId && sharedThreadAccess && sharedThreadAccess.space.type !== 'personal') {
        await attachNotesToSharedThread(
          currentThread,
          sharedThreadAccess.space,
          sharedThreadAccess.role,
          selectedNoteIds,
          auth.userId,
        );
      } else {
        await addNotesToThread(selectedNoteIds, threadId, auth.userId);
      }
      await db.update(Threads).set({ updatedAt: nowISO() })
        .where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId)));
    }

    broadcastInvalidation(auth.userId, { type: 'thread:updated', id: threadId });
    return c.json({ success: 'Thread updated!', thread: updatedThread });
  } catch (error: any) {
    if (error instanceof SharedSpaceLifecycleError) {
      return c.json({ error: error.message, code: error.code }, error.status);
    }
    const standardError = handleAPIError(error, { endpoint: '/api/threads/update', action: 'update_thread' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── DELETE /api/threads/delete ─────────────────────────────────────────────
route.delete('/api/threads/delete', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const threadId = c.req.query('threadId');
    if (!threadId) return c.json({ error: 'Thread ID is required' }, 400);

    const existingThread = first(await db.select().from(Threads)
      .where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId))).limit(1));
    if (!existingThread) return c.json({ error: 'Thread not found or access denied' }, 404);

    if (threadId === 'thread_unorganized') return c.json({ error: 'Cannot delete the unorganized thread' }, 400);
    if (existingThread.spaceId) {
      try {
        const access = await requireSpaceAccess(existingThread.spaceId, auth.userId);
        if (access.space.type !== 'personal' && !isActualSpaceOwner(access.space, auth.userId)) {
          return c.json({ error: 'Only the space owner can delete shared threads', code: 'FORBIDDEN' }, 403);
        }
      } catch (error) {
        if (error instanceof SpaceAccessError) {
          return c.json({ error: error.message, code: error.code }, error.status);
        }
        throw error;
      }
    }

    const threadCreatedAt = existingThread.createdAt;

    await revokeXPOnDeletion(auth.userId, threadId, new Date(threadCreatedAt));
    await revokeAllXPForItem(auth.userId, threadId);

    const deletion = await db.transaction((tx) =>
      deleteThreadInTransaction(tx, { threadId, actorId: auth.userId }),
    );
    await recordDeletedEntities(auth.userId, 'thread', [threadId]);

    broadcastInvalidation(auth.userId, { type: 'thread:deleted', id: threadId });
    return c.json({
      success:
        deletion.kind === 'shared'
          ? 'Thread erased!'
          : `Thread erased! Notes have been moved to the ${MY_PILE_THREAD_TITLE} thread.`,
      threadId,
    });
  } catch (error: any) {
    if (error instanceof SharedSpaceLifecycleError) {
      return c.json({ error: error.message, code: error.code }, error.status);
    }
    const standardError = handleAPIError(error, { endpoint: '/api/threads/delete', action: 'delete_thread' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/threads/ensure-unorganized ───────────────────────────────────
route.post('/api/threads/ensure-unorganized', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const existingThread = first(await db.select().from(Threads)
      .where(and(eq(Threads.userId, auth.userId), eq(Threads.id, 'thread_unorganized'))).limit(1));

    if (existingThread) {
      return c.json({ success: true, message: `${MY_PILE_THREAD_TITLE} thread already exists`, thread: existingThread });
    }

    const now = nowISO();
    const unorganizedThread = {
      id: 'thread_unorganized',
      userId: auth.userId,
      title: MY_PILE_THREAD_TITLE,
      subtitle: 'Individual notes and unassigned content',
      color: null,
      spaceId: null,
      isPublic: false,
      isPinned: false,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await db.insert(Threads).values(unorganizedThread);
      return c.json({ success: true, message: `${MY_PILE_THREAD_TITLE} thread created`, thread: unorganizedThread }, 201);
    } catch (insertError: unknown) {
      if (isUniqueViolationError(insertError)) {
        const createdThread = first(await db.select().from(Threads)
          .where(and(eq(Threads.userId, auth.userId), eq(Threads.id, 'thread_unorganized'))).limit(1));
        if (createdThread) return c.json({ success: true, message: `${MY_PILE_THREAD_TITLE} thread already exists`, thread: createdThread });
      }
      throw insertError;
    }
  } catch (error) {
    console.error('Error ensuring unorganized thread:', error);
    return c.json({ error: 'Failed to ensure unorganized thread exists' }, 500);
  }
});

// ─── DELETE /api/threads/erase-with-notes ───────────────────────────────────
route.delete('/api/threads/erase-with-notes', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const threadId = c.req.query('threadId');
    if (!threadId) return c.json({ error: 'Thread ID is required' }, 400);

    const existingThread = first(await db.select().from(Threads)
      .where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId))).limit(1));
    if (!existingThread) return c.json({ error: 'Thread not found or access denied' }, 404);
    if (threadId === 'thread_unorganized') return c.json({ error: 'Cannot erase the unorganized thread' }, 400);

    const affectedNotes = await db.select({ noteId: NoteThreads.noteId }).from(NoteThreads)
      .where(eq(NoteThreads.threadId, threadId));
    const candidateNoteIds = [...new Set(affectedNotes.map(n => n.noteId))];

    const ownedNoteIds: string[] = [];
    for (let i = 0; i < candidateNoteIds.length; i += ERASE_NOTE_CHUNK) {
      const chunk = candidateNoteIds.slice(i, i + ERASE_NOTE_CHUNK);
      const rows = await db.select({ id: Notes.id }).from(Notes).where(
        and(eq(Notes.userId, auth.userId), inArray(Notes.id, chunk)),
      );
      ownedNoteIds.push(...rows.map(r => r.id));
    }

    await deleteAllXpForRelatedIds(auth.userId, [...ownedNoteIds, threadId]);

    const deleted = await deleteNotesCascadeForUser(auth.userId, ownedNoteIds);
    await db.delete(NoteThreads).where(eq(NoteThreads.threadId, threadId));
    await recordDeletedEntities(auth.userId, 'note', deleted.deletedNoteIds);
    await recordDeletedEntities(auth.userId, 'studyThread', deleted.deletedStudyThreadIds);

    await db.delete(Threads).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId)));
    await recordDeletedEntities(auth.userId, 'thread', [threadId]);

    return c.json({ success: 'Thread and all notes erased!', threadId, notesDeleted: ownedNoteIds.length });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/threads/erase-with-notes', action: 'erase_thread_with_notes' });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/threads/:threadId/prefetch ────────────────────────────────────
route.get('/api/threads/:threadId/prefetch', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    let threadId = requireParam(c, 'threadId');
    if (threadId.startsWith('thread/')) threadId = 'thread_' + threadId.slice(7);
    const readAccess = await readableThreadOrNull(threadId, auth.userId);
    if (!readAccess) return c.json({ error: 'Thread not found' }, 404);
    const accessThread = {
      spaceId: readAccess.thread.spaceId,
      ownerUserId: readAccess.space?.userId ?? readAccess.thread.userId,
    };
    if (accessThread?.spaceId) {
      try {
        await requireSpaceAccess(accessThread.spaceId, auth.userId);
      } catch {
        return c.json({ error: 'Thread not found' }, 404);
      }
    }

    await repairMissingNoteThreadJunctionsForUser(auth.userId);
    const threadOwnerUserId = accessThread?.spaceId ? accessThread.ownerUserId : auth.userId;
    let thread = await getThreadWithCount(threadId, threadOwnerUserId);
    let notesResult: { notes: any[]; hasMore: boolean } | any = accessThread?.spaceId
      ? await getNotesForThreadForMember(threadId, auth.userId, 20, 0)
      : await getNotesForThread(threadId, auth.userId, 20, 0);
    let noteTypeCounts = await getThreadNoteTypeCounts(threadId, threadOwnerUserId);

    if (!thread) {
      // thread_unorganized: only one row exists (id PK); other users get null from getThreadWithCount.
      // Return a synthetic thread for auth.userId so CTAs show for all users (no 404).
      if (threadId === 'thread_unorganized') {
        const notes = Array.isArray(notesResult) ? [] : notesResult.notes;
        thread = {
          id: 'thread_unorganized',
          title: MY_PILE_THREAD_TITLE,
          subtitle: 'Notes that haven\'t been organized into threads yet',
          color: null,
          userId: auth.userId,
          spaceId: null,
          noteCount: noteTypeCounts?.all ?? notes?.length ?? 0,
          backgroundGradient: getThreadGradientCSS('paper'),
          lastUpdated: new Date(),
          accentColor: getThreadColorCSS(null),
          isPublic: false,
          isPinned: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastVisited: null,
        };
      } else {
        const threadRow = first(await db.select().from(Threads).where(eq(Threads.id, threadId)).limit(1));
        if (!threadRow) return c.json({ error: 'Thread not found' }, 404);
        if (threadRow.spaceId) {
          try {
            const { space } = await requireSpaceAccess(threadRow.spaceId, auth.userId);
            thread = await getThreadWithCount(threadId, space.userId);
            const memberNotes = await getNotesForThreadForMember(threadId, auth.userId, 20, 0);
            notesResult = memberNotes;
            noteTypeCounts = await getThreadNoteTypeCounts(threadId, space.userId);
          } catch {
            return c.json({ error: 'Thread not found' }, 404);
          }
        } else {
          return c.json({ error: 'Thread not found' }, 404);
        }
      }
    }
    if (!thread) return c.json({ error: 'Thread not found' }, 404);
    const notes = Array.isArray(notesResult) ? [] : notesResult.notes;
    const viewerNotes = accessThread?.spaceId
      ? attributeSharedThreadNotesForViewer(notes, auth.userId)
      : notes;

    return c.json({
      thread: {
        id: thread.id,
        title: thread.title,
        subtitle: thread.subtitle,
        color: thread.color,
        noteCount: thread.noteCount,
        backgroundGradient: thread.backgroundGradient,
        userId: thread.userId,
        spaceId: thread.spaceId ?? null,
      },
      notes: viewerNotes,
      noteTypeCounts,
    }, 200, {
      // Title/color change often; avoid browser HTTP cache serving stale thread headers for minutes.
      'Cache-Control': 'private, no-cache',
    });
  } catch (error: any) {
    console.error('[prefetch] Error fetching thread data:', error);
    return c.json({ error: 'Failed to fetch thread data', details: error.message }, 500);
  }
});

// ─── GET /api/threads/:threadId/note-type-counts ────────────────────────────
route.get('/api/threads/:threadId/note-type-counts', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    let threadId = requireParam(c, 'threadId');
    if (threadId.startsWith('thread/')) threadId = 'thread_' + threadId.slice(7);
    const readAccess = await readableThreadOrNull(threadId, auth.userId);
    if (!readAccess) return c.json({ error: 'Thread not found' }, 404);

    let noteTypeCounts = await getThreadNoteTypeCounts(threadId, auth.userId);
    const threadRow = readAccess.thread;
    if (!threadRow) return c.json({ error: 'Thread not found' }, 404);
    if (threadRow.spaceId) {
      try {
        const { space } = await requireSpaceAccess(threadRow.spaceId, auth.userId);
        noteTypeCounts = await getThreadNoteTypeCounts(threadId, space.userId);
      } catch {
        return c.json({ error: 'Thread not found' }, 404);
      }
    }
    return c.json({ noteTypeCounts });
  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/threads/[threadId]/note-type-counts',
      action: 'get_thread_note_type_counts',
      threadId: c.req.param('threadId'),
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/threads/:threadId/visit ──────────────────────────────────────
route.post('/api/threads/:threadId/visit', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    let threadId = requireParam(c, 'threadId');
    if (threadId.startsWith('thread/')) threadId = 'thread_' + threadId.slice(7);
    const readAccess = await readableThreadOrNull(threadId, auth.userId);
    if (!readAccess) return c.json({ error: 'Thread not found' }, 404);
    const thread = readAccess.thread;
    if (thread.spaceId) {
      try {
        await requireSpaceAccess(thread.spaceId, auth.userId);
      } catch {
        return c.json({ error: 'Thread not found' }, 404);
      }
    }
    await db.update(Threads).set({ lastVisited: nowISO() }).where(eq(Threads.id, threadId));
    return c.json({ ok: true });
  } catch (error: any) {
    console.error('[visit] Error updating thread lastVisited:', error);
    return c.json({ error: error.message || 'Failed to update visit' }, 500);
  }
});

// ─── GET /api/threads/:threadId/notes ───────────────────────────────────────
route.get('/api/threads/:threadId/notes', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    let threadId = requireParam(c, 'threadId');
    if (threadId.startsWith('thread/')) threadId = 'thread_' + threadId.slice(7);
    const readAccess = await readableThreadOrNull(threadId, auth.userId);
    if (!readAccess) return c.json({ error: 'Thread not found' }, 404);

    const offset = parseInt(c.req.query('offset') || '0', 10);
    const threadAccessRow = { spaceId: readAccess.thread.spaceId };
    if (threadAccessRow?.spaceId) {
      try {
        await requireSpaceAccess(threadAccessRow.spaceId, auth.userId);
      } catch {
        return c.json({ error: 'Thread not found' }, 404);
      }
    }

    const limit = parseInt(c.req.query('limit') || '20', 10);

    await repairMissingNoteThreadJunctionsForUser(auth.userId);
    let result = threadAccessRow?.spaceId
      ? await getNotesForThreadForMember(threadId, auth.userId, limit, offset)
      : await getNotesForThread(threadId, auth.userId, limit, offset);
    if (Array.isArray(result)) {
      result = { notes: [], hasMore: false };
    }

    const responseNotes = threadAccessRow?.spaceId
      ? attributeSharedThreadNotesForViewer(result.notes, auth.userId)
      : result.notes;

    /*
      The whole ordered list goes to members, current step included. Dimming
      steps ahead is pacing, not access control — every one of these notes is
      already reachable from the space's own notes list and search, and a
      "Step 3 of 8" derived from a list the member can't see would be a lie.
    */
    const sequenceThread = readAccess.thread;
    let sequence: { currentNoteId: string | null; currentIndex: number; total: number } | null = null;
    /*
      The pulse is a shepherding instrument, not a scoreboard. Resolved only for
      owner/leader — "4 of 18 have opened this" reads as encouragement from
      above and as surveillance from below, so a member's payload never carries
      it at all rather than the client being trusted to hide it.
    */
    let pulse: { memberCount: number; openedCountByNoteId: Record<string, number> } | null = null;
    if (isSequenceMode(sequenceThread.mode)) {
      // Resolved against every note in the Thread, not this page of them —
      // "Step 3 of 8" counts the whole plan.
      const state = resolveSequenceState(
        sequenceThread,
        await loadLiveThreadNoteIds(threadId, sequenceThread.spaceId),
      );
      sequence = {
        currentNoteId: state.currentNoteId,
        currentIndex: state.currentIndex,
        total: state.total,
      };

      if (sequenceThread.spaceId) {
        const access = await requireSpaceAccess(sequenceThread.spaceId, auth.userId);
        if (canManageSpaceThreadStructure(access.space, access.role, auth.userId)) {
          pulse = await readTogetherPulse(threadId, sequenceThread.spaceId);
        }
      }
    }

    return c.json({
      notes: responseNotes,
      hasMore: result.hasMore,
      offset,
      limit,
      mode: sequenceThread.mode ?? 'collection',
      sequence,
      pulse,
    });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/threads/[threadId]/notes', action: 'get_thread_notes', threadId: c.req.param('threadId') });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/threads/:threadId/progress ───────────────────────────────────
/**
 * Record that the caller opened a step.
 *
 * Fire-and-forget from the client's point of view: nothing in the UI waits on
 * it, and a failure is silent, because the cost of losing one tick is a count
 * being one low and the cost of blocking is a reader staring at a spinner.
 *
 * Only ever writes the caller's own row. There is no route anywhere that
 * writes someone else's progress, and none that reads a single person's — the
 * only read is the aggregate in `readTogetherPulse`.
 */
route.post('/api/threads/:threadId/progress', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    let threadId = requireParam(c, 'threadId');
    if (threadId.startsWith('thread/')) threadId = 'thread_' + threadId.slice(7);

    const readAccess = await readableThreadOrNull(threadId, auth.userId);
    if (!readAccess) return c.json({ error: 'Thread not found' }, 404);
    const thread = readAccess.thread;
    /* Only a sequence has steps to be partway through. A collection Thread
       silently accepts and stores nothing rather than 400ing a client that
       raced a mode change. */
    if (!isSequenceMode(thread.mode) || !thread.spaceId) return c.json({ success: true });

    try {
      await requireSpaceAccess(thread.spaceId, auth.userId);
    } catch {
      return c.json({ error: 'Thread not found' }, 404);
    }

    const body = await c.req.json().catch(() => null);
    const noteId = typeof body?.noteId === 'string' ? body.noteId : '';
    if (!noteId) return c.json({ error: 'noteId is required', code: 'BAD_REQUEST' }, 400);

    const liveNoteIds = await loadLiveThreadNoteIds(threadId, thread.spaceId);
    // A step that isn't in this plan is not progress through it.
    if (!liveNoteIds.includes(noteId)) return c.json({ success: true });

    const now = nowISO();
    const existing = first(
      await db
        .select({ openedNoteIds: ThreadProgress.openedNoteIds })
        .from(ThreadProgress)
        .where(and(eq(ThreadProgress.threadId, threadId), eq(ThreadProgress.userId, auth.userId)))
        .limit(1),
    );
    const opened = serializeSequenceNoteIds(withOpenedStep(existing?.openedNoteIds, noteId));

    if (existing) {
      await db
        .update(ThreadProgress)
        .set({ openedNoteIds: opened, updatedAt: now })
        .where(and(eq(ThreadProgress.threadId, threadId), eq(ThreadProgress.userId, auth.userId)));
    } else {
      await db
        .insert(ThreadProgress)
        .values({ threadId, userId: auth.userId, openedNoteIds: opened, startedAt: now, updatedAt: now })
        .onConflictDoNothing();
    }

    return c.json({ success: true });
  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/threads/[threadId]/progress',
      action: 'record_thread_progress',
      threadId: c.req.param('threadId'),
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/threads/:threadId/sequence ───────────────────────────────────
/**
 * Set a Thread's mode, its authored order, and the step the cohort is on.
 *
 * One endpoint for all three because they are one edit: reordering usually
 * needs to re-point the current step in the same breath, and two requests
 * would leave a window where the group is on a step that moved.
 *
 * "Advance" is not a verb here — the client sends the neighbouring note id.
 * A server-side next/prev would have to guess what the leader was looking at,
 * and would race a concurrent reorder; a note id says exactly which step.
 */
route.post('/api/threads/:threadId/sequence', requireAuth, rateLimit('write'), async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    let threadId = requireParam(c, 'threadId');
    if (threadId.startsWith('thread/')) threadId = 'thread_' + threadId.slice(7);

    const thread = first(
      await db
        .select({
          id: Threads.id,
          userId: Threads.userId,
          spaceId: Threads.spaceId,
          mode: Threads.mode,
          sequenceNoteIds: Threads.sequenceNoteIds,
          sequenceCurrentNoteId: Threads.sequenceCurrentNoteId,
        })
        .from(Threads)
        .where(eq(Threads.id, threadId))
        .limit(1),
    );
    if (!thread) return c.json({ error: 'Thread not found' }, 404);

    if (thread.spaceId) {
      let access: Awaited<ReturnType<typeof requireSpaceAccess>>;
      try {
        access = await requireSpaceAccess(thread.spaceId, auth.userId);
      } catch {
        return c.json({ error: 'Thread not found' }, 404);
      }
      if (!canManageSpaceThreadStructure(access.space, access.role, auth.userId)) {
        return c.json({
          error:
            access.space.type === 'public'
              ? 'Ministry channels are read-only during the pilot'
              : 'Only the space owner or a leader can change a study plan',
          code: access.space.type === 'public' ? 'CHANNELS_READ_ONLY_PILOT' : 'FORBIDDEN',
        }, 403);
      }
    } else if (thread.userId !== auth.userId) {
      // A personal Thread is a private reading plan — its owner and nobody else.
      return c.json({ error: 'Thread not found' }, 404);
    }

    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return c.json({ error: 'Expected a JSON body', code: 'BAD_REQUEST' }, 400);
    }

    const nextMode = body.mode === undefined ? null : body.mode;
    if (nextMode !== null && nextMode !== 'collection' && nextMode !== 'sequence') {
      return c.json({ error: 'mode must be "collection" or "sequence"', code: 'BAD_REQUEST' }, 400);
    }

    // Notes actually in this Thread, and — in a space — still associated with
    // it. The stored order is advisory; this is what it gets checked against.
    const liveNoteIds = await loadLiveThreadNoteIds(threadId, thread.spaceId);
    const liveSet = new Set(liveNoteIds);

    let orderedNoteIds: string[] | null = null;
    if (body.orderedNoteIds !== undefined) {
      if (!Array.isArray(body.orderedNoteIds)) {
        return c.json({ error: 'orderedNoteIds must be an array', code: 'BAD_REQUEST' }, 400);
      }
      const seen = new Set<string>();
      const ids: string[] = [];
      for (const raw of body.orderedNoteIds) {
        if (typeof raw !== 'string' || !raw) {
          return c.json({ error: 'orderedNoteIds must be note ids', code: 'BAD_REQUEST' }, 400);
        }
        if (!liveSet.has(raw)) {
          return c.json({
            error: 'A step in that order is no longer in this Thread',
            code: 'STEP_NOT_IN_THREAD',
          }, 409);
        }
        if (seen.has(raw)) {
          return c.json({ error: 'orderedNoteIds has a duplicate', code: 'BAD_REQUEST' }, 400);
        }
        seen.add(raw);
        ids.push(raw);
      }
      orderedNoteIds = ids;
    }

    const resolved = resolveSequenceState(
      {
        sequenceNoteIds:
          orderedNoteIds !== null ? serializeSequenceNoteIds(orderedNoteIds) : thread.sequenceNoteIds,
        sequenceCurrentNoteId: thread.sequenceCurrentNoteId,
      },
      liveNoteIds,
    );

    let currentNoteId = resolved.currentNoteId;
    if (body.currentNoteId !== undefined) {
      if (body.currentNoteId === null) {
        currentNoteId = resolved.orderedNoteIds[0] ?? null;
      } else if (typeof body.currentNoteId !== 'string') {
        return c.json({ error: 'currentNoteId must be a note id or null', code: 'BAD_REQUEST' }, 400);
      } else if (!resolved.orderedNoteIds.includes(body.currentNoteId)) {
        return c.json({
          error: 'That step is not in this study plan',
          code: 'STEP_NOT_IN_THREAD',
        }, 409);
      } else {
        currentNoteId = body.currentNoteId;
      }
    }

    const mode = nextMode ?? thread.mode ?? 'collection';
    await db
      .update(Threads)
      .set({
        mode,
        sequenceNoteIds: serializeSequenceNoteIds(resolved.orderedNoteIds),
        sequenceCurrentNoteId: currentNoteId,
        updatedAt: nowISO(),
      })
      .where(eq(Threads.id, threadId));

    if (thread.spaceId) {
      const recipients = await db
        .select({ userId: SpaceMemberships.userId })
        .from(SpaceMemberships)
        .where(eq(SpaceMemberships.spaceId, thread.spaceId));
      for (const recipientId of new Set(recipients.map((row) => row.userId))) {
        broadcastInvalidation(recipientId, { type: 'space:updated', id: thread.spaceId });
      }
    }
    broadcastInvalidation(auth.userId, { type: 'thread:updated', id: threadId });

    const currentIndex = currentNoteId ? resolved.orderedNoteIds.indexOf(currentNoteId) + 1 : 0;
    return c.json({
      success: true,
      mode,
      sequence: {
        orderedNoteIds: resolved.orderedNoteIds,
        currentNoteId,
        currentIndex,
        total: resolved.orderedNoteIds.length,
      },
    });
  } catch (error: any) {
    if (error instanceof SpaceAccessError) {
      return c.json({ error: error.message, code: error.code }, error.status);
    }
    const standardError = handleAPIError(error, {
      endpoint: '/api/threads/[threadId]/sequence',
      action: 'update_thread_sequence',
      threadId: c.req.param('threadId'),
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/threads/:threadId/share ───────────────────────────────────────
route.get('/api/threads/:threadId/share', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const threadId = requireParam(c, 'threadId');

    const thread = first(await db.select({
      id: Threads.id, isPublic: Threads.isPublic, shareToken: Threads.shareToken,
      shareTokenCreatedAt: Threads.shareTokenCreatedAt, userId: Threads.userId,
      spaceId: Threads.spaceId,
    }).from(Threads).where(eq(Threads.id, threadId)).limit(1));

    if (!thread) return c.json({ error: 'Thread not found' }, 404);
    if (thread.userId !== auth.userId) return c.json({ error: 'You do not have permission to access this thread' }, 403);
    if (thread.spaceId) {
      const space = first(
        await db.select({ type: Spaces.type }).from(Spaces).where(eq(Spaces.id, thread.spaceId)).limit(1),
      );
      if (!threadAllowsPublicBroadcast(space?.type)) {
        return c.json({ isPublic: false, shareToken: null, shareUrl: null, shareTokenCreatedAt: null });
      }
    }

    const origin = new URL(c.req.url).origin;
    return c.json({
      isPublic: thread.isPublic,
      shareToken: thread.shareToken,
      shareUrl: thread.shareToken ? `${origin}/shared/thread/${thread.shareToken}` : null,
      shareTokenCreatedAt: thread.shareTokenCreatedAt,
    });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/threads/[threadId]/share', action: 'get_share_status', threadId: c.req.param('threadId') });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── POST /api/threads/:threadId/share ──────────────────────────────────────
route.post('/api/threads/:threadId/share', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

    const threadId = requireParam(c, 'threadId');

    const { action } = await c.req.json();
    if (!action || !['enable', 'disable', 'refresh'].includes(action)) {
      return c.json({ error: 'Invalid action. Must be enable, disable, or refresh' }, 400);
    }

    const thread = first(await db.select({
      id: Threads.id, isPublic: Threads.isPublic, shareToken: Threads.shareToken, userId: Threads.userId,
      spaceId: Threads.spaceId,
    }).from(Threads).where(eq(Threads.id, threadId)).limit(1));

    if (!thread) return c.json({ error: 'Thread not found' }, 404);
    if (thread.userId !== auth.userId) return c.json({ error: 'You do not have permission to modify this thread' }, 403);
    if (thread.spaceId) {
      const space = first(
        await db.select({ type: Spaces.type }).from(Spaces).where(eq(Spaces.id, thread.spaceId)).limit(1),
      );
      if (!threadAllowsPublicBroadcast(space?.type)) {
        /*
          One crack in the rule, and only one: a published study plan. Its steps
          are church-authored staff material written to be handed to a room, not
          notes members wrote — which is the whole reason the rule exists. Asked
          of the database, never of the request.
        */
        const publishedPlan = await isPublishedSeriesThread(threadId);
        if (action !== 'disable' && !publishedPlan) {
          return c.json({
            error: 'Shared-space Threads cannot be published with public links',
            code: 'SHARED_THREAD_NOT_PUBLIC',
          }, 409);
        }
      }
    }

    const now = nowISO();
    let newShareToken: string | null = null;
    let isPublic = thread.isPublic;

    if (action === 'enable') {
      newShareToken = generateShareToken();
      isPublic = true;
      await db.update(Threads).set({ isPublic: true, shareToken: newShareToken, shareTokenCreatedAt: now, updatedAt: now })
        .where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId)));
    } else if (action === 'disable') {
      newShareToken = null;
      isPublic = false;
      await db.update(Threads).set({ isPublic: false, shareToken: null, shareTokenCreatedAt: null, updatedAt: now })
        .where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId)));
    } else if (action === 'refresh') {
      if (!thread.isPublic) return c.json({ error: 'Cannot refresh share link for a private thread' }, 400);
      newShareToken = generateShareToken();
      isPublic = true;
      await db.update(Threads).set({ shareToken: newShareToken, shareTokenCreatedAt: now, updatedAt: now })
        .where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId)));
    }

    if ((action === 'enable' || action === 'refresh') && newShareToken) {
      queueAudiencefulProductFlagsForUser(auth.userId, { has_shared: true });
    }

    const origin = new URL(c.req.url).origin;
    const shareUrl = newShareToken ? `${origin}/shared/thread/${newShareToken}` : null;

    return c.json({ success: true, isPublic, shareToken: newShareToken, shareUrl, shareTokenCreatedAt: action !== 'disable' ? now : null });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/threads/[threadId]/share', action: 'update_share_status', threadId: c.req.param('threadId') });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// ─── GET /api/threads/:threadId/referenced-scripture-notes ──────────────────
route.get('/api/threads/:threadId/referenced-scripture-notes', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);
    let threadId = requireParam(c, 'threadId');
    if (threadId.startsWith('thread/')) threadId = 'thread_' + threadId.slice(7);
    if (!(await readableThreadOrNull(threadId, auth.userId))) {
      return c.json({ error: 'Thread not found' }, 404);
    }

    const noteIdsParam = c.req.query('noteIds');
    if (!noteIdsParam) return c.json({ scriptureNoteIds: [] });

    const noteIds = noteIdsParam.split(',').filter(id => id);
    if (noteIds.length === 0) return c.json({ scriptureNoteIds: [] });

    const references = await db.select({ scriptureNoteId: NoteScriptureReferences.scriptureNoteId })
      .from(NoteScriptureReferences)
      .innerJoin(Notes, eq(NoteScriptureReferences.scriptureNoteId, Notes.id))
      .where(and(inArray(NoteScriptureReferences.noteId, noteIds), eq(Notes.userId, auth.userId), eq(Notes.noteType, 'scripture')))
      ;

    const scriptureNoteIds = [...new Set(references.map(r => r.scriptureNoteId))];
    return c.json({ scriptureNoteIds });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/threads/[threadId]/referenced-scripture-notes', action: 'get_referenced_scripture_notes', threadId: c.req.param('threadId') });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

export default route;

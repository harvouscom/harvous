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
  db, Threads, Notes, NoteThreads, NoteTags, Comments, Spaces, Members,
  ScriptureMetadata, NoteScriptureReferences, ResourceMetadata,
  eq, and, inArray, isNull,
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
import { requireSpaceAccess, SpaceAccessError } from '../utils/space-permissions';
import { awardCreationBonusXP, revokeXPOnDeletion, revokeAllXPForItem } from '../utils/xp-system';
import { moveScriptureNotesToThread } from '../utils/move-scripture-notes-to-thread';
import { getNextUntitledThreadName } from '../utils/untitled-naming';
import { getThreadColorCSS, getThreadGradientCSS, THREAD_COLORS, getRandomThreadColor } from '@/utils/colors';
import { handleAPIError } from '@/utils/error-handling';
import { validateTitle, validateColor, validateSpaceId } from '@/utils/validation';
import { rateLimit } from '@/utils/rate-limit';
import { generateThreadId, generateShareToken } from '@/utils/ids';

const route = new Hono();

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
  for (const noteId of noteIds) {
    try {
      const note = first(await db.select().from(Notes)
        .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId))).limit(1));
      if (!note) continue;

      const existingRelation = first(await db.select().from(NoteThreads)
        .where(and(eq(NoteThreads.noteId, noteId), eq(NoteThreads.threadId, threadId))).limit(1));
      if (existingRelation) continue;

      const existingThreadRelations = await db.select().from(NoteThreads)
        .where(eq(NoteThreads.noteId, noteId));
      const isInUnorganized = existingThreadRelations.length === 0 || note.threadId === 'thread_unorganized';

      const noteThreadId = `note-thread-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await db.insert(NoteThreads).values({ id: noteThreadId, noteId, threadId, createdAt: nowISO() });

      if (isInUnorganized && threadId !== 'thread_unorganized') {
        await db.update(Notes).set({ threadId }).where(eq(Notes.id, noteId));
      }

      moveScriptureNotesToThread(noteId, threadId, userId).catch((error) => {
        console.error(`Error moving scripture notes for note ${noteId} (non-blocking):`, error);
      });
    } catch (error) {
      console.error(`Error adding note ${noteId} to thread:`, error);
    }
  }
}

// ─── GET /api/threads/list ──────────────────────────────────────────────────
route.get('/api/threads/list', requireAuth, async (c) => {
  try {
    const auth = getAuthenticatedAuth(c);

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
        title: 'Unorganized',
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
    if (spaceId && spaceId.trim() && spaceId !== 'default_space') finalSpaceId = spaceId;

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
      await addNotesToThread(selectedNoteIds, newThread.id, auth.userId);
      await db.update(Threads).set({ updatedAt: nowISO() })
        .where(and(eq(Threads.id, newThread.id), eq(Threads.userId, auth.userId)));
    }

    awardCreationBonusXP(auth.userId, 'thread').catch(() => {});

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
    };
    if (!onlyColorChanged) {
      updateData.updatedAt = nowISO();
    }

    const updatedThread = first(await db.update(Threads).set(updateData)
      .where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId))).returning())!;

    // Add selected notes to thread
    if (selectedNoteIds.length > 0) {
      await addNotesToThread(selectedNoteIds, threadId, auth.userId);
      await db.update(Threads).set({ updatedAt: nowISO() })
        .where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId)));
    }

    return c.json({ success: 'Thread updated!', thread: updatedThread });
  } catch (error: any) {
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

    const threadCreatedAt = existingThread.createdAt;

    await revokeXPOnDeletion(auth.userId, threadId, new Date(threadCreatedAt as string));
    await revokeAllXPForItem(auth.userId, threadId);

    const affectedNotes = await db.select({ noteId: NoteThreads.noteId }).from(NoteThreads)
      .where(eq(NoteThreads.threadId, threadId));
    await db.delete(NoteThreads).where(eq(NoteThreads.threadId, threadId));

    if (affectedNotes.length > 0) {
      for (const { noteId } of affectedNotes) {
        await db.update(Notes).set({ threadId: 'thread_unorganized' })
          .where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId)));
      }
    }

    await db.delete(Threads).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId)));

    return c.json({ success: 'Thread erased! Notes have been moved to the Unorganized thread.', threadId });
  } catch (error: any) {
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
      return c.json({ success: true, message: 'Unorganized thread already exists', thread: existingThread });
    }

    const now = nowISO();
    const unorganizedThread = {
      id: 'thread_unorganized',
      userId: auth.userId,
      title: 'Unorganized',
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
      return c.json({ success: true, message: 'Unorganized thread created', thread: unorganizedThread }, 201);
    } catch (insertError: any) {
      if (insertError.code === 'SQLITE_CONSTRAINT' || insertError.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' ||
          insertError.rawCode === 1555 || insertError.message?.includes('UNIQUE constraint failed')) {
        const createdThread = first(await db.select().from(Threads)
          .where(and(eq(Threads.userId, auth.userId), eq(Threads.id, 'thread_unorganized'))).limit(1));
        if (createdThread) return c.json({ success: true, message: 'Unorganized thread already exists', thread: createdThread });
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

    const threadCreatedAt = existingThread.createdAt;

    const affectedNotes = await db.select({ noteId: NoteThreads.noteId }).from(NoteThreads)
      .where(eq(NoteThreads.threadId, threadId));
    const noteIds = affectedNotes.map(n => n.noteId);

    // Delete all related data for each note
    for (const noteId of noteIds) {
      const note = first(await db.select().from(Notes)
        .where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId))).limit(1));
      if (note) {
        await revokeXPOnDeletion(auth.userId, noteId, new Date(note.createdAt as string));
        await revokeAllXPForItem(auth.userId, noteId);
        await db.delete(NoteTags).where(eq(NoteTags.noteId, noteId));
        await db.delete(Comments).where(eq(Comments.noteId, noteId));
        await db.delete(ScriptureMetadata).where(eq(ScriptureMetadata.noteId, noteId));
        await db.delete(NoteScriptureReferences).where(eq(NoteScriptureReferences.noteId, noteId));
        await db.delete(NoteScriptureReferences).where(eq(NoteScriptureReferences.scriptureNoteId, noteId));
      }
    }

    await db.delete(NoteThreads).where(eq(NoteThreads.threadId, threadId));
    for (const noteId of noteIds) {
      await db.delete(Notes).where(and(eq(Notes.id, noteId), eq(Notes.userId, auth.userId)));
    }

    await revokeXPOnDeletion(auth.userId, threadId, new Date(threadCreatedAt as string));
    await revokeAllXPForItem(auth.userId, threadId);
    await db.delete(Threads).where(and(eq(Threads.id, threadId), eq(Threads.userId, auth.userId)));

    return c.json({ success: 'Thread and all notes erased!', threadId, notesDeleted: noteIds.length });
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

    let thread = await getThreadWithCount(threadId, auth.userId);
    let notesResult: { notes: any[]; hasMore: boolean } | any = await getNotesForThread(threadId, auth.userId, 20, 0);
    let noteTypeCounts = await getThreadNoteTypeCounts(threadId, auth.userId);

    if (!thread) {
      // thread_unorganized: only one row exists (id PK); other users get null from getThreadWithCount.
      // Return a synthetic thread for auth.userId so CTAs show for all users (no 404).
      if (threadId === 'thread_unorganized') {
        const notes = Array.isArray(notesResult) ? [] : notesResult.notes;
        thread = {
          id: 'thread_unorganized',
          title: 'Unorganized',
          subtitle: 'Notes that haven\'t been organized into threads yet',
          color: null,
          userId: auth.userId,
          spaceId: null,
          noteCount: noteTypeCounts?.all ?? notes?.length ?? 0,
          backgroundGradient: getThreadGradientCSS('paper'),
          lastUpdated: new Date().toISOString(),
          accentColor: getThreadColorCSS(null),
          isPublic: false,
          isPinned: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastVisited: null,
        };
      } else {
        const threadRow = first(await db.select().from(Threads).where(eq(Threads.id, threadId)).limit(1));
        if (!threadRow) return c.json({ error: 'Thread not found' }, 404);
        if (threadRow.spaceId) {
          try {
            const { space } = await requireSpaceAccess(threadRow.spaceId, auth.userId);
            thread = await getThreadWithCount(threadId, space.userId);
            const memberNotes = await getNotesForThreadForMember(threadId, space.userId, 20, 0);
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
      notes,
      noteTypeCounts,
    }, 200, {
      'Cache-Control': 'private, max-age=120, stale-while-revalidate=300',
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

    let noteTypeCounts = await getThreadNoteTypeCounts(threadId, auth.userId);
    const threadRow = first(await db.select().from(Threads).where(eq(Threads.id, threadId)).limit(1));
    if (!threadRow) return c.json({ error: 'Thread not found' }, 404);
    if (threadRow.userId !== auth.userId && threadRow.spaceId) {
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

    const thread = first(await db.select().from(Threads).where(eq(Threads.id, threadId)).limit(1));
    if (!thread) return c.json({ error: 'Thread not found' }, 404);
    if (thread.userId !== auth.userId && thread.spaceId) {
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

    const offset = parseInt(c.req.query('offset') || '0', 10);
    const limit = parseInt(c.req.query('limit') || '20', 10);

    // Owner path
    let result = await getNotesForThread(threadId, auth.userId, limit, offset);
    if (Array.isArray(result)) {
      result = { notes: [], hasMore: false };
    }

    // If owner path returned no notes and offset is 0, try member path
    if (result.notes.length === 0 && offset === 0) {
      const thread = first(await db.select().from(Threads).where(eq(Threads.id, threadId)).limit(1));
      if (thread?.spaceId) {
        let memberNotesResult: { notes: any[]; hasMore: boolean } | null = null;
        try {
          const { space } = await requireSpaceAccess(thread.spaceId, auth.userId);
          memberNotesResult = await getNotesForThreadForMember(threadId, space.userId, limit, offset);
        } catch {
          const spaceRow = first(await db.select().from(Spaces).where(eq(Spaces.id, thread.spaceId)).limit(1));
          const memberRow = first(await db.select().from(Members).where(and(eq(Members.spaceId, thread.spaceId), eq(Members.userId, auth.userId))).limit(1));
          if (spaceRow && memberRow) {
            memberNotesResult = await getNotesForThreadForMember(threadId, spaceRow.userId, limit, offset);
          }
        }
        if (memberNotesResult) result = memberNotesResult;
      }
    }

    return c.json({ notes: result.notes, hasMore: result.hasMore, offset, limit });
  } catch (error: any) {
    const standardError = handleAPIError(error, { endpoint: '/api/threads/[threadId]/notes', action: 'get_thread_notes', threadId: c.req.param('threadId') });
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
    }).from(Threads).where(eq(Threads.id, threadId)).limit(1));

    if (!thread) return c.json({ error: 'Thread not found' }, 404);
    if (thread.userId !== auth.userId) return c.json({ error: 'You do not have permission to access this thread' }, 403);

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
    }).from(Threads).where(eq(Threads.id, threadId)).limit(1));

    if (!thread) return c.json({ error: 'Thread not found' }, 404);
    if (thread.userId !== auth.userId) return c.json({ error: 'You do not have permission to modify this thread' }, 403);

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

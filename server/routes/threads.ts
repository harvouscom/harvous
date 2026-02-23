/**
 * Thread routes — Hono port of:
 *   - src/pages/api/threads/list.ts
 *   - src/pages/api/threads/[threadId]/prefetch.ts
 *   - src/pages/api/threads/[threadId]/note-type-counts.ts
 */

import { Hono } from 'hono';
import { getAuth } from '../middleware/auth';
import {
  getAllThreadsWithCounts,
  getThreadWithCount,
  getNotesForThread,
  getThreadNoteTypeCounts,
} from '../utils/dashboard-data';
import { ensureUnorganizedThread } from '../utils/unorganized-thread';
import { getThreadGradientCSS } from '@/utils/colors';
import { handleAPIError } from '@/utils/error-handling';

const route = new Hono();

// GET /api/threads/list
route.get('/api/threads/list', async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const threads = await getAllThreadsWithCounts(auth.userId);

    const threadOptions = threads.map((thread: any) => ({
      id: thread.id,
      title: thread.title,
      color: thread.color,
      spaceId: thread.spaceId || null,
      noteCount: thread.noteCount,
      backgroundGradient: thread.backgroundGradient || getThreadGradientCSS(thread.color || 'blue'),
    }));

    // Ensure "Unorganized" thread exists with actual count
    const unorganizedThreadData = await ensureUnorganizedThread(auth.userId);
    const hasUnorganizedThread = threadOptions.some((thread: any) =>
      thread.id === 'thread_unorganized'
    );

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
      const unorganizedIndex = threadOptions.findIndex((thread: any) =>
        thread.id === 'thread_unorganized'
      );
      if (unorganizedIndex !== -1) {
        threadOptions[unorganizedIndex].noteCount = unorganizedThreadData.noteCount || 0;
        threadOptions[unorganizedIndex].spaceId = null;
      }
    }

    return c.json(threadOptions);
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/threads/list',
      action: 'list_threads',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

// GET /api/threads/:threadId/prefetch
route.get('/api/threads/:threadId/prefetch', async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const threadId = c.req.param('threadId');
    if (!threadId) {
      return c.json({ error: 'Thread ID required' }, 400);
    }

    const [thread, notesResult, noteTypeCounts] = await Promise.all([
      getThreadWithCount(threadId, auth.userId),
      getNotesForThread(threadId, auth.userId),
      getThreadNoteTypeCounts(threadId, auth.userId),
    ]);

    if (!thread) {
      return c.json({ error: 'Thread not found' }, 404);
    }

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

// GET /api/threads/:threadId/note-type-counts
route.get('/api/threads/:threadId/note-type-counts', async (c) => {
  try {
    const auth = getAuth(c);
    if (!auth.userId) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const threadId = c.req.param('threadId');
    if (!threadId) {
      return c.json({ error: 'Thread ID is required' }, 400);
    }

    const noteTypeCounts = await getThreadNoteTypeCounts(threadId, auth.userId);
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

export default route;

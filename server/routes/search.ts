/**
 * GET /api/search
 *
 * Search notes and threads by text query.
 *
 * Port of: src/pages/api/search.ts
 */

import { Hono } from 'hono';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import { db, Notes, Threads, eq, and, or, like, desc, not } from '../db';
import { handleAPIError } from '@/utils/error-handling';

const route = new Hono();

route.get('/api/search', requireAuth, async (c) => {
  try {
    const { userId } = getAuthenticatedAuth(c);

    const url = new URL(c.req.url);
    const query = url.searchParams.get('q');
    const type = url.searchParams.get('type') || 'all';
    const limit = parseInt(url.searchParams.get('limit') || '50');

    if (!query || query.trim().length === 0) {
      return c.json({ results: [] });
    }

    const searchTerm = `%${query.trim()}%`;
    const searchNotes = type === 'all' || type === 'notes';
    const searchThreads = type === 'all' || type === 'threads';

    const notesRows = searchNotes
      ? await db
          .select({
            id: Notes.id,
            title: Notes.title,
            content: Notes.content,
            noteType: Notes.noteType,
            threadId: Notes.threadId,
            spaceId: Notes.spaceId,
            createdAt: Notes.createdAt,
            updatedAt: Notes.updatedAt,
          })
          .from(Notes)
          .where(
            and(
              eq(Notes.userId, userId),
              not(eq(Notes.contentEncrypted, true)),
              or(
                like(Notes.title, searchTerm),
                like(Notes.content, searchTerm),
              ),
            ),
          )
          .orderBy(desc(Notes.updatedAt), desc(Notes.createdAt), Notes.id)
          .limit(limit)
      : [];

    const threadsRows = searchThreads
      ? await db
          .select({
            id: Threads.id,
            title: Threads.title,
            subtitle: Threads.subtitle,
            spaceId: Threads.spaceId,
            color: Threads.color,
            createdAt: Threads.createdAt,
            updatedAt: Threads.updatedAt,
          })
          .from(Threads)
          .where(
            and(
              eq(Threads.userId, userId),
              like(Threads.title, searchTerm),
            ),
          )
          .orderBy(desc(Threads.updatedAt), desc(Threads.createdAt), Threads.id)
          .limit(limit)
      : [];

    const noteResults = notesRows.map((note) => ({
      id: note.id,
      type: 'note' as const,
      title: note.title || 'Untitled Note',
      content: note.content.substring(0, 200) + (note.content.length > 200 ? '...' : ''),
      contentEncrypted: false,
      noteType: note.noteType || 'default',
      threadId: note.threadId,
      spaceId: note.spaceId,
      lastUpdated: note.updatedAt || note.createdAt,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    }));

    const threadResults = threadsRows.map((thread) => ({
      id: thread.id,
      type: 'thread' as const,
      title: thread.title,
      subtitle: thread.subtitle || '',
      spaceId: thread.spaceId,
      color: thread.color,
      lastUpdated: thread.updatedAt || thread.createdAt,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
    }));

    let results: any[] = [...noteResults, ...threadResults];

    // Sort all results by last updated
    results.sort(
      (a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime(),
    );

    // Limit total results
    results = results.slice(0, limit);

    return c.json({ results, query, type, total: results.length });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/search',
      action: 'search',
    });
    return c.json({ error: standardError.message, code: standardError.code }, 500);
  }
});

export default route;

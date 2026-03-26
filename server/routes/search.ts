/**
 * GET /api/search
 *
 * Search notes and threads by text query.
 * Uses Postgres full-text search (GIN indices) for fast, relevance-ranked results
 * with English stemming. Falls back to ILIKE for short queries (<3 chars) where
 * FTS stemming may lose precision.
 *
 * Prerequisite: Run scripts/add-fts-indices.sql to create GIN indices.
 *
 * Port of: src/pages/api/search.ts
 */

import { Hono } from 'hono';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import { db, Notes, Threads, ScriptureMetadata, eq, and, or, like, desc, not, sql } from '../db';
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

    const trimmedQuery = query.trim();
    const searchNotes = type === 'all' || type === 'notes';
    const searchThreads = type === 'all' || type === 'threads';

    // Use full-text search for queries >= 3 chars, ILIKE for shorter ones.
    // FTS provides stemming ("running" matches "run") and is indexed via GIN.
    // Short queries like "Go" would get over-stemmed, so ILIKE is better there.
    const useFTS = trimmedQuery.length >= 3;

    let notesRows: {
      id: string;
      title: string | null;
      content: string;
      noteType: string;
      scriptureTranslation: string | null;
      threadId: string;
      spaceId: string | null;
      createdAt: Date;
      updatedAt: Date | null;
    }[] = [];

    let threadsRows: {
      id: string;
      title: string;
      subtitle: string | null;
      spaceId: string | null;
      color: string | null;
      createdAt: Date;
      updatedAt: Date | null;
    }[] = [];

    if (searchNotes) {
      const scriptureTranslationSql = sql<string | null>`(
        SELECT ${ScriptureMetadata.translation}
        FROM ${ScriptureMetadata}
        WHERE ${ScriptureMetadata.noteId} = ${Notes.id}
        LIMIT 1
      )`;

      if (useFTS) {
        // Postgres full-text search with ts_rank for relevance ordering
        const tsQuery = sql`plainto_tsquery('english', ${trimmedQuery})`;
        notesRows = await db
          .select({
            id: Notes.id,
            title: Notes.title,
            content: Notes.content,
            noteType: Notes.noteType,
            scriptureTranslation: scriptureTranslationSql,
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
              sql`to_tsvector('english', COALESCE(${Notes.title}, '') || ' ' || ${Notes.content} || ' ' || COALESCE(${scriptureTranslationSql}, '')) @@ ${tsQuery}`,
            ),
          )
          .orderBy(
            sql`ts_rank(to_tsvector('english', COALESCE(${Notes.title}, '') || ' ' || ${Notes.content} || ' ' || COALESCE(${scriptureTranslationSql}, '')), ${tsQuery}) DESC`,
            desc(Notes.updatedAt),
          )
          .limit(limit);
      } else {
        // ILIKE fallback for short queries
        const searchTerm = `%${trimmedQuery}%`;
        notesRows = await db
          .select({
            id: Notes.id,
            title: Notes.title,
            content: Notes.content,
            noteType: Notes.noteType,
            scriptureTranslation: scriptureTranslationSql,
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
                sql`COALESCE(${scriptureTranslationSql}, '') ILIKE ${searchTerm}`,
              ),
            ),
          )
          .orderBy(desc(Notes.updatedAt), desc(Notes.createdAt), Notes.id)
          .limit(limit);
      }
    }

    if (searchThreads) {
      if (useFTS) {
        const tsQuery = sql`plainto_tsquery('english', ${trimmedQuery})`;
        threadsRows = await db
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
              sql`to_tsvector('english', ${Threads.title}) @@ ${tsQuery}`,
            ),
          )
          .orderBy(
            sql`ts_rank(to_tsvector('english', ${Threads.title}), ${tsQuery}) DESC`,
            desc(Threads.updatedAt),
          )
          .limit(limit);
      } else {
        const searchTerm = `%${trimmedQuery}%`;
        threadsRows = await db
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
          .limit(limit);
      }
    }

    const noteResults = notesRows.map((note) => {
      const resolvedNoteType = note.noteType || 'default';
      const normalizedScriptureTranslation = note.scriptureTranslation?.trim() || null;
      const scriptureTranslationForResult = resolvedNoteType === 'scripture'
        ? (normalizedScriptureTranslation || 'NET')
        : null;

      return {
        id: note.id,
        type: 'note' as const,
        title: note.title || 'Untitled Note',
        // Keep full note content so CardNote preview behavior matches other lists (e.g. dashboard).
        content: note.content,
        contentEncrypted: false,
        noteType: resolvedNoteType,
        version: scriptureTranslationForResult,
        scriptureTranslation: scriptureTranslationForResult,
        threadId: note.threadId,
        spaceId: note.spaceId,
        lastUpdated: note.updatedAt || note.createdAt,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
      };
    });

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

    let results: (typeof noteResults[number] | typeof threadResults[number])[] = [...noteResults, ...threadResults];

    // For FTS results, preserve relevance order; for ILIKE, sort by recency
    if (!useFTS) {
      results.sort(
        (a, b) => new Date(String(b.lastUpdated)).getTime() - new Date(String(a.lastUpdated)).getTime(),
      );
    }

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

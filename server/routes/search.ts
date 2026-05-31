/**
 * GET /api/search
 *
 * Search notes and threads by text query.
 * For queries with 3+ characters: combines Postgres full-text search (GIN indices,
 * English stemming) with substring ILIKE so prefixes like "tab" match "tables"
 * (FTS stems "tables" to "tabl", which plainto_tsquery("tab") does not match).
 * Queries shorter than MIN_SEARCH_QUERY_LENGTH return no results (client also avoids fetching).
 *
 * Prerequisite: Run scripts/add-fts-indices.sql to create GIN indices.
 *
 * Port of: src/pages/api/search.ts
 */

import { Hono } from 'hono';
import { getAuthenticatedAuth, requireAuth } from '../middleware/auth';
import { db, Notes, Threads, ScriptureMetadata, eq, and, or, like, desc, not, ne, sql } from '../db';
import { handleAPIError } from '@/utils/error-handling';
import { MIN_SEARCH_QUERY_LENGTH } from '@/utils/search-query';
import { getThreadColorsForNotesBatch } from '../utils/dashboard-data';
import { parseNoteSecondaryCollections } from '../utils/note-secondary-collections';

const route = new Hono();

route.get('/api/search', requireAuth, async (c) => {
  try {
    const { userId } = getAuthenticatedAuth(c);

    const url = new URL(c.req.url);
    const query = url.searchParams.get('q');
    const type = url.searchParams.get('type') || 'all';
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const threadIdParam = url.searchParams.get('threadId')?.trim() || null;
    const spaceIdParam = url.searchParams.get('spaceId')?.trim() || null;
    const excludeLegacyScripture =
      url.searchParams.get('excludeLegacyScripture') === '1' ||
      url.searchParams.get('excludeLegacyScripture') === 'true';

    if (!query || query.trim().length === 0) {
      return c.json({ results: [] });
    }

    const trimmedQuery = query.trim();
    if (trimmedQuery.length < MIN_SEARCH_QUERY_LENGTH) {
      return c.json({ results: [], query, type, total: 0 });
    }
    const searchNotes = type === 'all' || type === 'notes';
    // Thread-scoped search is notes-only (one thread). If both threadId and spaceId are sent, threadId wins for notes; threads are not searched.
    const searchThreads =
      (type === 'all' || type === 'threads') && !threadIdParam;
    const noteScopeFilters = threadIdParam
      ? [eq(Notes.threadId, threadIdParam)]
      : spaceIdParam
        ? [eq(Notes.spaceId, spaceIdParam)]
        : [];
    if (excludeLegacyScripture) {
      noteScopeFilters.push(ne(Notes.noteType, 'scripture'));
    }
    const threadScopeFilters =
      spaceIdParam && !threadIdParam ? [eq(Threads.spaceId, spaceIdParam)] : [];

    // Use FTS + substring ILIKE for queries >= 3 chars; ILIKE only for shorter ones.
    // FTS provides stemming ("running" matches "run") and is indexed via GIN; ILIKE
    // catches partial-word matches FTS stems can miss. Short queries like "Go" use ILIKE only.
    const useFTS = trimmedQuery.length >= MIN_SEARCH_QUERY_LENGTH;
    const ftsSubstringPattern = useFTS ? `%${trimmedQuery}%` : '';

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
      primaryCollection: string | null;
      secondaryCollections: string | null;
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
        const tsQuery = sql`plainto_tsquery('english', ${trimmedQuery})`;
        const noteTsVector = sql`to_tsvector('english', COALESCE(${Notes.title}, '') || ' ' || ${Notes.content} || ' ' || COALESCE(${scriptureTranslationSql}, ''))`;
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
            primaryCollection: Notes.primaryCollection,
            secondaryCollections: Notes.secondaryCollections,
          })
          .from(Notes)
          .where(
            and(
              eq(Notes.userId, userId),
              not(eq(Notes.contentEncrypted, true)),
              ...noteScopeFilters,
              or(
                sql`${noteTsVector} @@ ${tsQuery}`,
                like(Notes.title, ftsSubstringPattern),
                like(Notes.content, ftsSubstringPattern),
                sql`COALESCE(${scriptureTranslationSql}, '') ILIKE ${ftsSubstringPattern}`,
              ),
            ),
          )
          .orderBy(
            sql`CASE WHEN ${noteTsVector} @@ ${tsQuery} THEN ts_rank(${noteTsVector}, ${tsQuery}) ELSE -1::real END DESC`,
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
            primaryCollection: Notes.primaryCollection,
            secondaryCollections: Notes.secondaryCollections,
          })
          .from(Notes)
          .where(
            and(
              eq(Notes.userId, userId),
              not(eq(Notes.contentEncrypted, true)),
              ...noteScopeFilters,
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
        const threadTsVector = sql`to_tsvector('english', ${Threads.title})`;
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
              ...threadScopeFilters,
              or(
                sql`${threadTsVector} @@ ${tsQuery}`,
                like(Threads.title, ftsSubstringPattern),
                sql`COALESCE(${Threads.subtitle}, '') ILIKE ${ftsSubstringPattern}`,
              ),
            ),
          )
          .orderBy(
            sql`CASE WHEN ${threadTsVector} @@ ${tsQuery} THEN ts_rank(${threadTsVector}, ${tsQuery}) ELSE -1::real END DESC`,
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
              ...threadScopeFilters,
              like(Threads.title, searchTerm),
            ),
          )
          .orderBy(desc(Threads.updatedAt), desc(Threads.createdAt), Threads.id)
          .limit(limit);
      }
    }

    const noteIdsForColors = notesRows.map((n) => n.id);
    const threadColorsMap = await getThreadColorsForNotesBatch(noteIdsForColors, userId);

    const noteResults = notesRows.map((note) => {
      const resolvedNoteType = note.noteType || 'default';
      const normalizedScriptureTranslation = note.scriptureTranslation?.trim() || null;
      const scriptureTranslationForResult = resolvedNoteType === 'scripture'
        ? (normalizedScriptureTranslation || 'NET')
        : null;

      const threadColors = threadColorsMap.get(note.id);

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
        threadColors: threadColors && threadColors.length > 0 ? threadColors : undefined,
        primaryCollection: note.primaryCollection ?? null,
        secondaryCollections: parseNoteSecondaryCollections(note.secondaryCollections),
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

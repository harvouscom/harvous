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
import {
  db,
  Notes,
  Threads,
  Spaces,
  SpaceNotes,
  SpaceMemberships,
  NoteThreads,
  ScriptureMetadata,
  eq,
  and,
  or,
  like,
  desc,
  not,
  ne,
  isNull,
  sql,
} from '../db';
import { handleAPIError } from '@/utils/error-handling';
import { MIN_SEARCH_QUERY_LENGTH } from '@/utils/search-query';
import { batchAuthorAttribution, getThreadColorsForNotesBatch } from '../utils/dashboard-data';
import { parseNoteSecondaryCollections } from '../utils/note-secondary-collections';
import { requireSpaceAccess, SpaceAccessError } from '../utils/space-access';
import {
  requireThreadReadAccess,
  SharedSpaceLifecycleError,
} from '../utils/shared-space-lifecycle';

const route = new Hono();

export type SearchScopeKind = 'home' | 'personal' | 'shared';

export function classifySearchScope(
  space: { type: string; title: string } | null,
): SearchScopeKind {
  if (!space) return 'home';
  if (space.type === 'shared' || space.type === 'public') return 'shared';
  return space.title.trim().toLowerCase() === 'my home' ? 'home' : 'personal';
}

export function sharedThreadSearchUsesViewerOwnership(scope: SearchScopeKind): boolean {
  return scope !== 'shared';
}

export function sharedSearchRequiresActiveAccess(scope: SearchScopeKind): boolean {
  return scope === 'shared';
}

export function sharedThreadNoteSearchUsesCanonicalThreadId(
  scope: SearchScopeKind,
): boolean {
  return scope !== 'shared';
}

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

    // Defensive: every note/thread branch below also filters by userId, so a
    // foreign spaceId can't leak rows today — but validate it anyway so the
    // scope param never silently depends on that co-filter.
    let scopedSpace: typeof Spaces.$inferSelect | null = null;
    if (spaceIdParam) {
      try {
        scopedSpace = (await requireSpaceAccess(spaceIdParam, userId)).space;
      } catch (err) {
        if (err instanceof SpaceAccessError) return c.json({ error: err.message, code: err.code }, err.status);
        throw err;
      }
    }
    const searchScope = classifySearchScope(scopedSpace);
    if (threadIdParam) {
      try {
        const threadAccess = await requireThreadReadAccess(db, {
          threadId: threadIdParam,
          viewerUserId: userId,
        });
        if (spaceIdParam && threadAccess.thread.spaceId !== spaceIdParam) {
          return c.json({ error: 'Thread not found' }, 404);
        }
      } catch (error) {
        if (error instanceof SharedSpaceLifecycleError) {
          return c.json({ error: 'Thread not found' }, 404);
        }
        throw error;
      }
    }
    const searchNotes = type === 'all' || type === 'notes';
    // Thread-scoped search is notes-only (one thread). If both threadId and spaceId are sent, threadId wins for notes; threads are not searched.
    const searchThreads =
      (type === 'all' || type === 'threads') && !threadIdParam;
    const noteScopeFilters = threadIdParam
      ? !sharedThreadNoteSearchUsesCanonicalThreadId(searchScope)
        ? [
            sql`EXISTS (
              SELECT 1 FROM ${NoteThreads}
              WHERE ${NoteThreads.noteId} = ${Notes.id}
                AND ${NoteThreads.threadId} = ${threadIdParam}
            )`,
          ]
        : [eq(Notes.threadId, threadIdParam)]
      : spaceIdParam && searchScope === 'personal'
        ? [eq(Notes.spaceId, spaceIdParam)]
        : [];
    if (excludeLegacyScripture) {
      noteScopeFilters.push(ne(Notes.noteType, 'scripture'));
    }
    const threadScopeFilters =
      spaceIdParam && !threadIdParam
        ? [
            eq(Threads.spaceId, spaceIdParam),
            searchScope === 'shared' && scopedSpace?.userId !== userId
              ? eq(Threads.isPinned, true)
              : undefined,
          ]
        : [];
    const activeSharedAccessFilters =
      sharedSearchRequiresActiveAccess(searchScope) && spaceIdParam
        ? [
            sql`EXISTS (
              SELECT 1 FROM ${Spaces}
              WHERE ${Spaces.id} = ${spaceIdParam}
                AND ${Spaces.deletedAt} IS NULL
            )`,
            sql`(
              EXISTS (
                SELECT 1 FROM ${Spaces}
                WHERE ${Spaces.id} = ${spaceIdParam}
                  AND ${Spaces.userId} = ${userId}
              )
              OR EXISTS (
                SELECT 1 FROM ${SpaceMemberships}
                WHERE ${SpaceMemberships.spaceId} = ${spaceIdParam}
                  AND ${SpaceMemberships.userId} = ${userId}
              )
            )`,
          ]
        : [];

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
      authorUserId: string;
      associationIsPinned?: boolean | null;
      associationPrimaryCollection?: string | null;
      associationSecondaryCollections?: string | null;
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

      if (searchScope === 'shared' && spaceIdParam) {
        const sharedSelect = {
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
          authorUserId: Notes.userId,
          associationIsPinned: SpaceNotes.isPinned,
          associationPrimaryCollection: SpaceNotes.primaryCollection,
          associationSecondaryCollections: SpaceNotes.secondaryCollections,
        } as const;
        if (useFTS) {
          const tsQuery = sql`plainto_tsquery('english', ${trimmedQuery})`;
          const noteTsVector = sql`to_tsvector('english', COALESCE(${Notes.title}, '') || ' ' || ${Notes.content} || ' ' || COALESCE(${scriptureTranslationSql}, ''))`;
          notesRows = await db
            .select(sharedSelect)
            .from(SpaceNotes)
            .innerJoin(Notes, eq(Notes.id, SpaceNotes.noteId))
            .where(
              and(
                eq(SpaceNotes.spaceId, spaceIdParam),
                isNull(SpaceNotes.removedAt),
                not(eq(Notes.contentEncrypted, true)),
                ...activeSharedAccessFilters,
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
          const searchTerm = `%${trimmedQuery}%`;
          notesRows = await db
            .select(sharedSelect)
            .from(SpaceNotes)
            .innerJoin(Notes, eq(Notes.id, SpaceNotes.noteId))
            .where(
              and(
                eq(SpaceNotes.spaceId, spaceIdParam),
                isNull(SpaceNotes.removedAt),
                not(eq(Notes.contentEncrypted, true)),
                ...activeSharedAccessFilters,
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
      } else if (useFTS) {
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
            authorUserId: Notes.userId,
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
            authorUserId: Notes.userId,
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
              ...(sharedThreadSearchUsesViewerOwnership(searchScope)
                ? [eq(Threads.userId, userId)]
                : activeSharedAccessFilters),
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
              ...(sharedThreadSearchUsesViewerOwnership(searchScope)
                ? [eq(Threads.userId, userId)]
                : activeSharedAccessFilters),
              ...threadScopeFilters,
              like(Threads.title, searchTerm),
            ),
          )
          .orderBy(desc(Threads.updatedAt), desc(Threads.createdAt), Threads.id)
          .limit(limit);
      }
    }

    const noteIdsForColors = notesRows.map((n) => n.id);
    const [threadColorsMap, authorMap] = await Promise.all([
      searchScope === 'shared'
        ? Promise.resolve(new Map<string, Array<{ color: string; frequency: number }>>())
        : getThreadColorsForNotesBatch(noteIdsForColors, userId),
      searchScope === 'shared'
        ? batchAuthorAttribution(notesRows.map((note) => note.authorUserId))
        : Promise.resolve({} as Record<string, { displayName: string; userColor: string }>),
    ]);

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
        threadId: searchScope === 'shared' ? null : note.threadId,
        spaceId: searchScope === 'shared' ? spaceIdParam : note.spaceId,
        contextSpaceId: searchScope === 'shared' ? spaceIdParam : null,
        lastUpdated: note.updatedAt || note.createdAt,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
        threadColors: threadColors && threadColors.length > 0 ? threadColors : undefined,
        isPinned:
          searchScope === 'shared' ? note.associationIsPinned === true : undefined,
        ...(searchScope === 'shared'
          ? {}
          : {
              primaryCollection: note.primaryCollection ?? null,
              secondaryCollections: parseNoteSecondaryCollections(note.secondaryCollections),
            }),
        authorUserId: searchScope === 'shared' ? note.authorUserId : undefined,
        authorDisplayName:
          searchScope === 'shared'
            ? authorMap[note.authorUserId]?.displayName ?? 'A Harvous User'
            : undefined,
        authorColor:
          searchScope === 'shared'
            ? authorMap[note.authorUserId]?.userColor ?? 'blue'
            : undefined,
        isOwnNote: searchScope === 'shared' ? note.authorUserId === userId : undefined,
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

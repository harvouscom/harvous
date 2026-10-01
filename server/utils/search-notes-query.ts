/**
 * The note half of `GET /api/search`, lifted out of the route so the Connector's
 * `search_notes` tool (server/connector/) runs the *same* query rather than a copy of it.
 *
 * Scope rules, unchanged from the route:
 *   - home / personal: the searcher's own notes (`Notes.userId`), optionally one space.
 *   - shared: notes associated with the space (`SpaceNotes`), gated on live membership.
 * Locked notes (`contentEncrypted`) never match — their body is ciphertext anyway.
 *
 * `offset` exists for the Connector's cursor; the route always starts at 0.
 */

import {
  db,
  Notes,
  Spaces,
  SpaceNotes,
  SpaceMemberships,
  NoteThreads,
  ScriptureMetadata,
  Tags,
  NoteTags,
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
import type { SQL } from 'drizzle-orm';
import { MIN_SEARCH_QUERY_LENGTH } from '@/utils/search-query';

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

/** Live-space + live-membership guards for a shared-scope search; empty otherwise. */
export function buildActiveSharedAccessFilters(
  searchScope: SearchScopeKind,
  spaceIdParam: string | null,
  userId: string,
): SQL[] {
  return sharedSearchRequiresActiveAccess(searchScope) && spaceIdParam
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
}

export interface SearchNoteRow {
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
}

export interface SearchNoteRowsOptions {
  userId: string;
  /** Already trimmed by the caller. */
  query: string;
  scope: SearchScopeKind;
  spaceId: string | null;
  threadId: string | null;
  excludeLegacyScripture: boolean;
  limit: number;
  offset?: number;
}

export async function searchNoteRows(options: SearchNoteRowsOptions): Promise<SearchNoteRow[]> {
  const {
    userId,
    query: trimmedQuery,
    scope: searchScope,
    spaceId: spaceIdParam,
    threadId: threadIdParam,
    excludeLegacyScripture,
    limit,
    offset = 0,
  } = options;

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
  const activeSharedAccessFilters = buildActiveSharedAccessFilters(searchScope, spaceIdParam, userId);

  // Use FTS + substring ILIKE for queries >= 3 chars; ILIKE only for shorter ones.
  // FTS provides stemming ("running" matches "run") and is indexed via GIN; ILIKE
  // catches partial-word matches FTS stems can miss. Short queries like "Go" use ILIKE only.
  const useFTS = trimmedQuery.length >= MIN_SEARCH_QUERY_LENGTH;
  const ftsSubstringPattern = useFTS ? `%${trimmedQuery}%` : '';

  // Scoped to the searcher's own tags: `Tags` are per-user, so in a shared space an
  // unscoped match would let one member's private label surface another member's note.
  const noteTagMatchSql = (pattern: string) => sql`EXISTS (
    SELECT 1 FROM ${NoteTags}
    INNER JOIN ${Tags} ON ${Tags.id} = ${NoteTags.tagId}
    WHERE ${NoteTags.noteId} = ${Notes.id}
      AND ${Tags.userId} = ${userId}
      AND ${Tags.name} ILIKE ${pattern}
  )`;

  let notesRows: SearchNoteRow[] = [];

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
              noteTagMatchSql(ftsSubstringPattern),
            ),
          ),
        )
        .orderBy(
          sql`CASE WHEN ${noteTsVector} @@ ${tsQuery} THEN ts_rank(${noteTsVector}, ${tsQuery}) ELSE -1::real END DESC`,
          desc(Notes.updatedAt),
        )
        .limit(limit)
        .offset(offset);
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
              noteTagMatchSql(searchTerm),
            ),
          ),
        )
        .orderBy(desc(Notes.updatedAt), desc(Notes.createdAt), Notes.id)
        .limit(limit)
        .offset(offset);
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
            noteTagMatchSql(ftsSubstringPattern),
          ),
        ),
      )
      .orderBy(
        sql`CASE WHEN ${noteTsVector} @@ ${tsQuery} THEN ts_rank(${noteTsVector}, ${tsQuery}) ELSE -1::real END DESC`,
        desc(Notes.updatedAt),
      )
      .limit(limit)
      .offset(offset);
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
            noteTagMatchSql(searchTerm),
          ),
        ),
      )
      .orderBy(desc(Notes.updatedAt), desc(Notes.createdAt), Notes.id)
      .limit(limit)
      .offset(offset);
  }

  return notesRows;
}

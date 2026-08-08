import { useCallback, useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useSpaceNotes, type SpaceNoteRow } from '../../hooks/queries/useSpace';
import { usePrototypeStudyThreads, type StudyThreadCluster } from '../../hooks/queries/usePrototypeStudyThreads';
import { usePrototypeFolderRegistry } from '../../hooks/mutations/usePrototypeFolderRegistry';
import { useNavigation, type NavSpace } from '../../hooks/queries/useNavigation';
import { fetchSearchResults } from '@/hooks/useSearch';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import { fuzzyFilter } from './fuzzy-search';
import { buildFoldersFromNotes, mergeFoldersWithRegistry, type FolderBucket } from './sidebar-universal-search';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';
import type { MentionPickerItem } from '@/components/react/mention-pill-types';
import { useLibrary, type LibraryItem } from '../../hooks/queries/useLibrary';
import { useSpaceLibrary } from '../../hooks/queries/useChurchLibrary';
import { resourceFileLabel, resourceSourceLabel } from '@/utils/resource-source-label';
import { protoRelativeCaptionAbbrev } from './proto-time';

export const MENTION_ITEMS_PER_KIND = 6;
const ITEMS_PER_KIND = MENTION_ITEMS_PER_KIND;
const FTS_MIN_QUERY_LENGTH = 3;

export function noteTitle(note: { title?: string | null }): string {
  return stripServerAutoUntitledNoteTitleForDisplay(note.title ?? '') || 'New Note';
}

export function threadTitle(cluster: StudyThreadCluster): string {
  return (cluster.title ?? cluster.suggestedTitle ?? '').trim() || 'Untitled thread';
}

export function noteMentionSubtitle(note: Pick<SpaceNoteRow, 'updatedAt' | 'createdAt' | 'lastUpdated'>): string | undefined {
  const caption = protoRelativeCaptionAbbrev(note.updatedAt ?? note.lastUpdated ?? note.createdAt);
  return caption || undefined;
}

export function threadMentionSubtitle(noteCount: number): string {
  return `${noteCount} note${noteCount === 1 ? '' : 's'}`;
}

function flattenNotePages(pages: { notes: SpaceNoteRow[] }[] | undefined): SpaceNoteRow[] {
  if (!pages) return [];
  return pages.flatMap((p) => p.notes);
}

export function notesToItems(notes: SpaceNoteRow[], query: string, spaceId: string): MentionPickerItem[] {
  const searchable = notes.map((note) => ({ note, title: noteTitle(note) }));
  const matched = query.trim() ? fuzzyFilter(searchable, ['title'], query) : searchable;
  return matched.slice(0, ITEMS_PER_KIND).map(({ note, title }) => ({
    kind: 'note' as const,
    entityId: note.id,
    spaceId,
    title,
    subtitle: noteMentionSubtitle(note),
  }));
}

export function threadsToItems(threads: StudyThreadCluster[], query: string, spaceId: string): MentionPickerItem[] {
  const searchable = threads.map((cluster) => ({ cluster, title: threadTitle(cluster) }));
  const matched = query.trim() ? fuzzyFilter(searchable, ['title'], query) : searchable;
  return matched.slice(0, ITEMS_PER_KIND).map(({ cluster, title }) => ({
    kind: 'thread' as const,
    entityId: cluster.id,
    spaceId,
    title,
    subtitle: threadMentionSubtitle(cluster.noteCount),
  }));
}

export function foldersToItems(folders: FolderBucket[], query: string, spaceId: string): MentionPickerItem[] {
  // Unsorted (name === null) has no text to mention against — exclude it.
  const named = folders.filter((f): f is { name: string; count: number } => f.name !== null);
  const matched = query.trim() ? fuzzyFilter(named, ['name'], query) : named;
  return matched.slice(0, ITEMS_PER_KIND).map((folder) => ({
    kind: 'folder' as const,
    entityId: folder.name,
    spaceId,
    title: folder.name,
    subtitle: `${folder.count} note${folder.count === 1 ? '' : 's'}`,
  }));
}

/**
 * Library items for the picker.
 *
 * `spaceId` is the room the item was offered from, or '' in a personal note
 * where there is no room. It is context for the resolve, not ownership: a
 * library item belongs to a library, and `/api/library/items/:id` decides
 * visibility through `resolveVisibleItem` — personal ownership first, then the
 * church rules the item declares.
 *
 * These used to be personal-notes-only, on the reasoning that the resolve
 * "fails closed for anyone but the owner". That was true of the *route* and not
 * of the model: a church item has no personal owner at all, so the rule 404'd
 * even the staffer who added it. With the route on the shared check, a room's
 * own shelf is exactly what its members may cite.
 */
export function libraryItemsToItems(
  items: Pick<LibraryItem, 'id' | 'title' | 'kind' | 'fileMime' | 'fileBytes' | 'fileName' | 'sourceDomain' | 'sourceSiteName'>[],
  query: string,
  spaceId = '',
): MentionPickerItem[] {
  const searchable = items.map((item) => ({
    item,
    title: item.title,
    site:
      item.kind === 'file'
        ? resourceFileLabel(item.fileMime, item.fileBytes, item.fileName)
        : resourceSourceLabel(item.sourceDomain, item.sourceSiteName),
  }));
  const matched = query.trim() ? fuzzyFilter(searchable, ['title', 'site'], query) : searchable;
  return matched.slice(0, ITEMS_PER_KIND).map(({ item, site }) => ({
    kind: 'library' as const,
    entityId: item.id,
    spaceId,
    title: item.title,
    subtitle: site || undefined,
  }));
}

export function dedupeNoteItemsById(items: MentionPickerItem[]): MentionPickerItem[] {
  const seen = new Set<string>();
  const result: MentionPickerItem[] = [];
  for (const item of items) {
    if (seen.has(item.entityId)) continue;
    seen.add(item.entityId);
    result.push(item);
  }
  return result;
}

/** Data + fuzzy-filter for one space's notes/threads/folders (used by both scope modes below). */
function useSpaceMentionData(spaceId: string | undefined) {
  const notesQuery = useSpaceNotes(spaceId ?? '', 20);
  const threadsQuery = usePrototypeStudyThreads(spaceId);
  const folderRegistryQuery = usePrototypeFolderRegistry(spaceId);

  const notes = useMemo(() => flattenNotePages(notesQuery.data?.pages), [notesQuery.data]);
  const folders = useMemo(
    () => mergeFoldersWithRegistry(buildFoldersFromNotes(notes), folderRegistryQuery.data ?? []),
    [notes, folderRegistryQuery.data],
  );

  return { notes, threads: threadsQuery.data ?? [], folders };
}

type MentionSourceScope =
  | { mode: 'shared'; spaceId: string }
  | { mode: 'personal'; personalSpaceId: string };

/**
 * Returns a stable `(query) => Promise<MentionPickerItem[]>` for the @ mention typeahead.
 *
 * Shared-space notes are scoped to that one space only — every item carries that
 * spaceId, so a pill in a shared note can never point at content other members
 * can't open. Personal notes search across the user's own spaces: notes via the
 * unscoped `/api/search` (already returns the user's notes across all spaces with
 * a per-row spaceId), threads/folders via the same per-space endpoints fanned out
 * with useQueries over the user's owned + member spaces.
 */
export function useMentionSource(scope: MentionSourceScope): (query: string) => Promise<MentionPickerItem[]> {
  const sharedSpaceId = scope.mode === 'shared' ? scope.spaceId : undefined;
  const shared = useSpaceMentionData(sharedSpaceId);

  const personalHomeId = scope.mode === 'personal' ? scope.personalSpaceId : undefined;
  const personalHome = useSpaceMentionData(personalHomeId);

  // Shares the cache key with the Resources sidebar list — usually already warm.
  const { data: libraryData } = useLibrary();
  const libraryItems = scope.mode === 'personal' ? (libraryData?.items ?? []) : [];

  /*
    The room's own shelf, for a note being written in it.

    Membership-gated server-side, and the same query the space's Resources list
    uses, so opening `@` in a room you are already reading costs nothing. A
    personal note keeps the personal library instead — the two are different
    catalogues, and unioning them would offer a group's handout inside a private
    note whose audience never had it.
  */
  const { data: spaceLibraryData } = useSpaceLibrary(sharedSpaceId, {
    enabled: scope.mode === 'shared',
  });
  const spaceLibraryItems = scope.mode === 'shared' ? (spaceLibraryData?.items ?? []) : [];

  const { data: nav } = useNavigation({ enabled: scope.mode === 'personal' });
  const otherSpaces = useMemo<NavSpace[]>(() => {
    if (scope.mode !== 'personal' || !nav) return [];
    const normalizedHome = normalizePrototypeApiSpaceId(personalHomeId);
    const all = [...(nav.spaces ?? []), ...(nav.memberOfSpaces ?? [])];
    const seen = new Set<string>();
    const result: NavSpace[] = [];
    for (const s of all) {
      const id = normalizePrototypeApiSpaceId(s.id);
      if (!id || id === normalizedHome || seen.has(id)) continue;
      seen.add(id);
      result.push(s);
    }
    return result;
  }, [scope.mode, nav, personalHomeId]);

  const otherSpaceQueries = useQueries({
    queries: otherSpaces.map((s) => {
      const id = normalizePrototypeApiSpaceId(s.id);
      return {
        queryKey: ['prototype', 'space', id, 'mention-source-threads-folders'],
        enabled: scope.mode === 'personal' && Boolean(id),
        staleTime: 30_000,
        queryFn: async () => {
          const [threadsRes, foldersRes] = await Promise.all([
            api.get<{ threads: StudyThreadCluster[] }>(`/api/spaces/${encodeURIComponent(id!)}/study-threads`),
            api.get<{ labels: string[] }>(`/api/spaces/${encodeURIComponent(id!)}/folder-registry`),
          ]);
          return {
            spaceId: id!,
            threads: threadsRes.threads ?? [],
            folders: (foldersRes.labels ?? []).map((name) => ({ name, count: 0 })) as FolderBucket[],
          };
        },
      };
    }),
  });

  return useCallback(
    async (query: string): Promise<MentionPickerItem[]> => {
      if (scope.mode === 'shared') {
        const spaceId = scope.spaceId;
        const notes = notesToItems(shared.notes, query, spaceId);
        let ftsNotes: MentionPickerItem[] = [];
        if (query.trim().length >= FTS_MIN_QUERY_LENGTH) {
          try {
            const { results } = await fetchSearchResults(
              query,
              { spaceId, excludeLegacyScriptureNotes: true },
              'notes',
            );
            ftsNotes = results
              .filter((r) => r.type === 'note')
              .map((r) => ({
                kind: 'note' as const,
                entityId: r.id,
                spaceId,
                title: r.title || 'New Note',
                subtitle: noteMentionSubtitle({ lastUpdated: r.lastUpdated }),
              }));
          } catch {
            /* search endpoint unavailable — client-side notes still show */
          }
        }
        // Matches the sidebar's own list-mode order (notes, folders, threads,
        // resources) — the same order a personal note gets below.
        return [
          ...dedupeNoteItemsById([...notes, ...ftsNotes]).slice(0, ITEMS_PER_KIND),
          ...foldersToItems(shared.folders, query, spaceId),
          ...threadsToItems(shared.threads, query, spaceId),
          ...libraryItemsToItems(spaceLibraryItems, query, spaceId),
        ];
      }

      const homeSpaceId = scope.personalSpaceId;
      let notes = notesToItems(personalHome.notes, query, homeSpaceId);
      if (query.trim().length >= FTS_MIN_QUERY_LENGTH) {
        try {
          const { results } = await fetchSearchResults(query, { excludeLegacyScriptureNotes: true }, 'notes');
          const ftsNotes = results
            .filter((r) => r.type === 'note')
            .map((r) => ({
              kind: 'note' as const,
              entityId: r.id,
              spaceId: r.spaceId || homeSpaceId,
              title: r.title || 'New Note',
              subtitle: noteMentionSubtitle({ lastUpdated: r.lastUpdated }),
            }));
          notes = dedupeNoteItemsById([...notes, ...ftsNotes]);
        } catch {
          /* search endpoint unavailable — home-space notes still show */
        }
      }
      notes = notes.slice(0, ITEMS_PER_KIND);

      const threadItems = threadsToItems(personalHome.threads, query, homeSpaceId);
      const folderItems = foldersToItems(personalHome.folders, query, homeSpaceId);
      for (const q of otherSpaceQueries) {
        const data = q.data;
        if (!data) continue;
        threadItems.push(...threadsToItems(data.threads, query, data.spaceId));
        folderItems.push(...foldersToItems(data.folders, query, data.spaceId));
      }

      // Matches the sidebar's own list-mode order (notes, folders, threads, resources).
      return [
        ...notes,
        ...folderItems.slice(0, ITEMS_PER_KIND),
        ...threadItems.slice(0, ITEMS_PER_KIND),
        ...libraryItemsToItems(libraryItems, query),
      ];
    },
    [scope, shared.notes, shared.threads, shared.folders, spaceLibraryItems, personalHome.notes, personalHome.threads, personalHome.folders, otherSpaceQueries, libraryItems],
  );
}

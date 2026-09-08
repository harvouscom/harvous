/**
 * The data every Library panel body view needs, resolved once.
 *
 * Five views render the same rows against the same corpus, and each of them needs the
 * note list, the space scoping, and a way to open a note. Duplicating that wiring per
 * view is how the panel's rows would quietly drift from the sidebar's — the space
 * scoping in particular, where a dropped `?space=` 404s a shared-space note rather than
 * failing loudly.
 *
 * Everything here reads through React Query's cache under the same keys
 * `PrototypeSidebar` uses, so mounting the panel over a warm sidebar costs no fetches.
 *
 * Deliberately holds no sidebar state. `sidebarListMode`, the folder/thread drilldowns
 * and `scriptureDrill` all stay untouched — the panel's own view lives in shell context
 * (see `library-panel-view.ts`), and the two surfaces must not move each other.
 */
import { recordRecentOpen } from './proto-recent-opens';
import { useCallback, useMemo } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  isPrototypeNotePath,
  matchPrototypeNoteId,
  prototypeNoteRouteTo,
  prototypeReadRouteTo,
} from '@/lib/prototype-path';
import { computePrototypeNotesListPhase } from '@/utils/prototype-notes-list-phase';
import { isEffectivelyEmptyPrototypeNote } from '@/utils/prototype-note-empty';
import { sortNotesByLastUpdated } from '@/utils/sorting';
import { prototypeNoteListNavigationSearch } from '@/utils/prototype-sidebar-highlight-active';
import { resolvePrototypeToolbarNoteId } from '@/utils/prototype-compose-url';
import { parseScriptureReference } from '@/utils/scripture-detector';
import { bookSlug } from '@/utils/bible-book-chapters';
import {
  isPrototypeDraftNoteSlug,
  noteParamSlug,
  normalizeNoteIdFromParam,
} from '../proto-route-slugs';
import { isScripturePassageHighlightRow } from '../proto-highlight-subtitle';
import { landAgain, readerRouteForReference } from '../../../utils/reader-nav';
import type { PrototypeHighlightStudyThreadRow } from '../../../hooks/queries/usePrototypeSpaceStudyThreadHighlights';
import { useProtoShell } from '../../../layouts/proto-shell-context';
import { useActiveSpace } from '../../../hooks/useActiveSpace';
import {
  useSpaceMembers,
  useSpaceNotes,
  type SpaceMemberRow,
  type SpaceNoteRow,
} from '../../../hooks/queries/useSpace';
import {
  getNoteQueryOptions,
  seedNoteFromList,
  type ListNoteForSeed,
} from '../../../hooks/queries/useNote';
import { openLibraryFileItem, type LibraryItem } from '../../../hooks/queries/useLibrary';

/** How many items a root-level section previews before "See all". */
export const LIBRARY_PREVIEW_COUNT = 4;

/** The shape a drill list hands back to be rendered as a full note row. */
export type LibraryNoteBrief = {
  id: string;
  title: string | null;
  content?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
};

export type LibraryPanelData = {
  /** The shell's active space — every query below is scoped to it. */
  spaceId: string | null;
  /** True when the active space is a shared/public one, not personal My Home. */
  isScopedSharedSpace: boolean;
  viewerIsSpaceOwner: boolean;
  sharedSpaceMemberByUserId: Map<string, SpaceMemberRow>;
  authReady: boolean;
  /** Loaded, de-duplicated, most-recent-first, with empty scratch notes dropped. */
  notes: SpaceNoteRow[];
  notesById: Map<string, SpaceNoteRow>;
  notesPhase: ReturnType<typeof computePrototypeNotesListPhase>;
  hasMoreNotes: boolean;
  isFetchingMoreNotes: boolean;
  fetchMoreNotes: () => void;
  /** The note open in the main pane, so a row can mark itself current. */
  activeNoteFullId: string | undefined;
  prefetchNote: (row: SpaceNoteRow, opts?: { seedFromList?: boolean }) => void;
  /** Opens a note and dismisses the panel — browsing ended when you picked something. */
  openNote: (row: SpaceNoteRow) => void;
  /** Opens a highlight on whichever surface can actually show it. */
  openHighlight: (row: PrototypeHighlightStudyThreadRow) => void;
  /** Docks a resource onto the open note, or follows it when there is no note. */
  openResource: (item: LibraryItem) => void;
  /** Thread/scripture briefs carry id+title only; fill them out from the loaded list. */
  resolveDrillNoteRow: (brief: LibraryNoteBrief) => SpaceNoteRow;
};

export function useLibraryPanelData(): LibraryPanelData {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { closeLibraryPanel, composePersistedNoteId } = useProtoShell();
  const {
    activeSpaceId,
    isSharedSpace,
    isOwner: viewerIsSpaceOwner,
    authReady,
  } = useActiveSpace();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const spaceId = activeSpaceId;
  const isScopedSharedSpace = isSharedSpace;

  const {
    data: pages,
    isError: notesIsError,
    isPending: notesIsPending,
    isFetching: notesIsFetching,
    isFetched: notesIsFetched,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useSpaceNotes(spaceId ?? '', 20);

  const membersQuery = useSpaceMembers(isScopedSharedSpace && spaceId ? spaceId : '');
  const sharedSpaceMemberByUserId = useMemo(() => {
    const map = new Map<string, SpaceMemberRow>();
    for (const member of membersQuery.data?.members ?? []) map.set(member.userId, member);
    return map;
  }, [membersQuery.data?.members]);

  /* Same de-dupe as the sidebar: pages overlap when a note is updated mid-scroll, and
     the newer copy of a duplicated row is the one worth keeping. */
  const notes = useMemo(() => {
    if (!pages?.pages) return [];
    const byId = new Map<string, SpaceNoteRow>();
    for (const note of pages.pages.flatMap((p) => p.notes)) {
      const existing = byId.get(note.id);
      if (!existing) {
        byId.set(note.id, note);
        continue;
      }
      const existingUpdated = existing.updatedAt ?? existing.createdAt ?? '';
      const noteUpdated = note.updatedAt ?? note.createdAt ?? '';
      if (noteUpdated >= existingUpdated) byId.set(note.id, note);
    }
    return sortNotesByLastUpdated(Array.from(byId.values())).filter(
      (n) => !isEffectivelyEmptyPrototypeNote(n.title, n.content),
    );
  }, [pages]);

  const notesById = useMemo(() => {
    const map = new Map<string, SpaceNoteRow>();
    for (const note of notes) map.set(note.id, note);
    return map;
  }, [notes]);

  const notesPhase = computePrototypeNotesListPhase({
    homeSpaceId: spaceId,
    authReady,
    isPending: notesIsPending,
    isFetching: notesIsFetching,
    isFetched: notesIsFetched,
    noteCount: notes.length,
    isError: notesIsError,
  });

  const noteSlugFromPath = matchPrototypeNoteId(pathname);
  const isDraftNoteRoute = noteSlugFromPath != null && isPrototypeDraftNoteSlug(noteSlugFromPath);
  const activeNoteFullId =
    resolvePrototypeToolbarNoteId(
      composePersistedNoteId,
      noteSlugFromPath,
      isDraftNoteRoute,
      normalizeNoteIdFromParam,
    ) ?? undefined;

  const prefetchNote = useCallback(
    (row: SpaceNoteRow, opts?: { seedFromList?: boolean }) => {
      if (!spaceId) return;
      // A fresh full detail in cache needs neither seed nor refetch — without this a
      // slow drag across a list is a fetch per row.
      const noteQueryKey = getNoteQueryOptions(row.id).queryKey;
      const cachedDetail = queryClient.getQueryData(noteQueryKey) as
        | { __contentIsPreview?: boolean }
        | undefined;
      const state = queryClient.getQueryState(noteQueryKey);
      const isFresh = state ? Date.now() - state.dataUpdatedAt < 30_000 : false;
      if (cachedDetail && cachedDetail.__contentIsPreview === false && isFresh) return;
      const listSeed: ListNoteForSeed = {
        id: row.id,
        title: row.title ?? '',
        content: row.content ?? '',
        contentLength: row.contentLength ?? null,
        noteType: (row.noteType as ListNoteForSeed['noteType']) || 'default',
        contentEncrypted: row.contentEncrypted === true,
        resourceTitle: row.resourceTitle ?? null,
        userId: row.authorUserId,
        isOwnNote: row.isOwnNote,
        threadId: 'thread_unorganized',
        spaceId,
        createdAt: row.createdAt ?? undefined,
        updatedAt: row.updatedAt ?? undefined,
        simpleNoteId: row.simpleNoteId ?? undefined,
        primaryCollection: row.primaryCollection ?? null,
        secondaryCollections: row.secondaryCollections?.length
          ? [...row.secondaryCollections]
          : undefined,
        collectionPinned: row.collectionPinned ?? false,
        collectionUserOverride: row.collectionUserOverride ?? false,
        version: row.version,
      };
      if (opts?.seedFromList !== false) {
        seedNoteFromList(queryClient, listSeed, {
          id: 'thread_unorganized',
          title: '',
          color: null,
          backgroundGradient: '',
        });
      }
      void queryClient.prefetchQuery(getNoteQueryOptions(row.id)).catch(() => {});
    },
    [queryClient, spaceId],
  );

  const openNote = useCallback(
    (row: SpaceNoteRow) => {
      if (!spaceId) return;
      recordRecentOpen(spaceId, 'note', row.id);
      prefetchNote(row);
      navigate({
        to: prototypeNoteRouteTo(),
        params: { noteId: noteParamSlug(row.id) },
        /* Dropping this search drops `space`, and a note reachable only through a
           shared space then 404s as "Note not found". */
        search: prototypeNoteListNavigationSearch({ isScopedSharedSpace, spaceId }),
      });
      /*
       * Picking something is the end of browsing. The panel is a place you dip into,
       * and leaving it open over the note you just asked for would bury it.
       *
       * `preserveHistory` because we just navigated. A plain close pops the panel's own
       * entry with `history.back()`, which lands on the route we were on *before* the
       * navigate — so opening a note from the panel closed it and went nowhere. Same
       * bargain the drawer strikes when compose navigates out from under it.
       */
      closeLibraryPanel({ preserveHistory: true });
    },
    [spaceId, isScopedSharedSpace, prefetchNote, navigate, closeLibraryPanel],
  );

  /**
   * Where a highlight opens.
   *
   * Mirrors `PrototypeSidebar`'s `onHighlightRow` branch for branch, because the kinds
   * genuinely land in different places: a scripture passage opens its dock on the note
   * that cited it, or the reader itself when no note did; a reference saved while
   * reading has no note behind it at all and opens the chapter with its card up; and
   * everything else opens the note with the matching dock. There is deliberately no
   * early `if (!parentNoteId) return` — that guard is what once made source-less
   * highlights inert on tap.
   */
  const openHighlight = useCallback(
    (row: PrototypeHighlightStudyThreadRow) => {
      if (!spaceId) return;
      recordRecentOpen(spaceId, 'highlight', row.id);
      const navSearch = prototypeNoteListNavigationSearch({ isScopedSharedSpace, spaceId });
      if (row.parentNoteId) {
        void queryClient
          .prefetchQuery(getNoteQueryOptions(row.parentNoteId, navSearch.space))
          .catch(() => {});
      }
      if (isScripturePassageHighlightRow(row)) {
        const canon = (row.scriptureReference ?? '').trim();
        const trans = (row.scripturePassageTranslation ?? '').trim();
        if (canon && trans) {
          if (row.parentNoteId) {
            navigate({
              to: prototypeNoteRouteTo(),
              params: { noteId: noteParamSlug(row.parentNoteId) },
              search: {
                ...navSearch,
                scriptureRef: canon,
                scriptureTranslation: trans,
                studyThread: row.id,
                dockReq: String(Date.now()),
              },
            });
            closeLibraryPanel({ preserveHistory: true });
            return;
          }
          const readerRoute = readerRouteForReference(canon, trans);
          if (readerRoute) navigate(landAgain(readerRoute));
          closeLibraryPanel({ preserveHistory: true });
          return;
        }
      }
      if (!row.parentNoteId && row.entryKind === 'reference') {
        const word = (row.sourceSnippet ?? '').trim();
        const parsed = row.scriptureReference
          ? parseScriptureReference(row.scriptureReference)
          : null;
        if (word && parsed) {
          void navigate({
            to: prototypeReadRouteTo(),
            params: { book: bookSlug(parsed.book), chapter: String(parsed.chapter) },
            search: {
              v: typeof parsed.verse === 'number' ? String(parsed.verse) : undefined,
              t: row.scripturePassageTranslation || undefined,
              ref: word,
              /* The same row tapped twice has to land again, and the router treats an
                 identical URL as no navigation at all. */
              req: String(Date.now()),
            },
          });
        }
        closeLibraryPanel({ preserveHistory: true });
        return;
      }
      /* The highlight dock lives inside a note, so with no source note there is
         nothing to open it on — leave the reader where they are. */
      if (!row.parentNoteId) return;
      navigate({
        to: prototypeNoteRouteTo(),
        params: { noteId: noteParamSlug(row.parentNoteId) },
        search:
          row.entryKind === 'reference'
            ? {
                ...navSearch,
                studyThread: row.id,
                reference: row.sourceSnippet || '',
                dockReq: String(Date.now()),
              }
            : { ...navSearch, highlight: row.id, dockReq: String(Date.now()) },
      });
      closeLibraryPanel({ preserveHistory: true });
    },
    [spaceId, isScopedSharedSpace, queryClient, navigate, closeLibraryPanel],
  );

  /**
   * Where a resource opens.
   *
   * The study dock is per-note, so a resource chip only has somewhere to live when a
   * note is open. Jumping to an arbitrary note just to hold the chip would be worse
   * than following the link, so: dock it when we are on a note, open it otherwise.
   */
  const openResource = useCallback(
    (item: LibraryItem) => {
      recordRecentOpen(spaceId, 'resource', item.id);
      if (isPrototypeNotePath(pathname) && activeNoteFullId) {
        navigate({
          to: prototypeNoteRouteTo(),
          params: { noteId: noteParamSlug(activeNoteFullId) },
          search: {
            ...prototypeNoteListNavigationSearch({ isScopedSharedSpace, spaceId: spaceId ?? '' }),
            libItem: item.id,
            dockReq: String(Date.now()),
          },
        });
        closeLibraryPanel({ preserveHistory: true });
        return;
      }
      if (item.kind === 'file') {
        void openLibraryFileItem(item.id);
        return;
      }
      if (item.sourceUrl) window.open(item.sourceUrl, '_blank', 'noopener,noreferrer');
    },
    [pathname, activeNoteFullId, isScopedSharedSpace, spaceId, navigate, closeLibraryPanel],
  );

  const resolveDrillNoteRow = useCallback(
    (brief: LibraryNoteBrief): SpaceNoteRow => {
      const full = notesById.get(brief.id);
      const briefContent = brief.content?.trim() ?? '';
      if (full) {
        if (!briefContent) return full;
        if (!full.content?.trim()) {
          return { ...full, content: briefContent, updatedAt: brief.updatedAt ?? full.updatedAt };
        }
        return full;
      }
      return {
        id: brief.id,
        title: brief.title,
        content: briefContent,
        updatedAt: brief.updatedAt ?? null,
        createdAt: brief.createdAt ?? undefined,
        noteType: 'default',
      } as SpaceNoteRow;
    },
    [notesById],
  );

  const fetchMoreNotes = useCallback(() => {
    void fetchNextPage();
  }, [fetchNextPage]);

  return {
    spaceId,
    isScopedSharedSpace,
    viewerIsSpaceOwner,
    sharedSpaceMemberByUserId,
    authReady,
    notes,
    notesById,
    notesPhase,
    hasMoreNotes: Boolean(hasNextPage),
    isFetchingMoreNotes: isFetchingNextPage,
    fetchMoreNotes,
    activeNoteFullId,
    prefetchNote,
    openNote,
    openHighlight,
    openResource,
    resolveDrillNoteRow,
  };
}

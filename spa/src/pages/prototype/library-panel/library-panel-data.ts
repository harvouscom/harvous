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
 * Reads one piece of sidebar state, and only one: `sidebarListSpaceScope`, which is the
 * panel's "<space> | My Home" switch now. It lives in the shell because the organize host acts
 * on what the panel shows and has to agree with it (`resolveLibraryListScope`). The rest of the
 * sidebar's — `sidebarListMode`, the folder/thread drilldowns, `scriptureDrill` — stays
 * untouched: the panel's own view lives in shell context (see `library-panel-view.ts`), and the
 * two surfaces must not move each other.
 */
import { recordRecentOpen } from './proto-recent-opens';
import { markPendingResourceSelection } from '../resources/pending-resource-selection';
import type { ResourceSelection } from '../PrototypeResourceLibraryList';
import { useCallback, useMemo } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
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
  resolveLibraryListScope,
  type SidebarListSpaceScope,
} from '../../../lib/shared-space-capabilities';
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
import type { LibraryItem } from '../../../hooks/queries/useLibrary';

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
  /**
   * The space the panel is showing — every query below is scoped to it. The shell's active
   * space, or My Home when the switch has been flipped to it from inside a shared space.
   */
  spaceId: string | null;
  /** True when the panel is showing a shared/public space's own library, not My Home. */
  isScopedSharedSpace: boolean;
  /** The viewer's own My Home, whichever space is open. */
  homeSpaceId: string | null;
  /** The shell itself is in a shared space, whichever side of the switch the panel is on. */
  shellIsSharedSpace: boolean;
  /** The switch is on My Home while the shell stays in a shared space. */
  viewingHome: boolean;
  listScope: SidebarListSpaceScope;
  setListScope: (scope: SidebarListSpaceScope) => void;
  /** The shared space's name, for the switch. Null on My Home or before it resolves. */
  sharedSpaceTitle: string | null;
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
  /** Opens a My Home note found from inside another space. */
  openHomeNote: (row: SpaceNoteRow) => void;
  /** Opens a highlight on whichever surface can actually show it. */
  openHighlight: (row: PrototypeHighlightStudyThreadRow) => void;
  /** Shows a personal resource in the Resources tool's viewer, which the panel becomes. */
  openResource: (item: LibraryItem) => void;
  /** The same, for any shelf's row — church and room items included. */
  previewResource: (selection: ResourceSelection) => void;
  /** Thread/scripture briefs carry id+title only; fill them out from the loaded list. */
  resolveDrillNoteRow: (brief: LibraryNoteBrief) => SpaceNoteRow;
};

export function useLibraryPanelData(): LibraryPanelData {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    closeLibraryPanel,
    expandLibraryPanelInto,
    composePersistedNoteId,
    sidebarListSpaceScope,
    setSidebarListSpaceScope,
  } = useProtoShell();
  const {
    activeSpaceId,
    homeSpaceId,
    isSharedSpace,
    isOwner,
    authReady,
    spaceTitle,
  } = useActiveSpace();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  /*
   * Everything downstream reads these two rather than the active space, which is what lets
   * the switch re-scope every tab, drill, row action and opener without any of them knowing
   * there is a switch. Opening a note while showing Home carries no `?space=`, and the note
   * page then moves the shell home by itself.
   */
  const { spaceId, isScopedSharedSpace, viewingHome, viewerIsSpaceOwner } =
    resolveLibraryListScope({
      activeSpaceId,
      homeSpaceId,
      isSharedSpace,
      isOwner,
      listScope: sidebarListSpaceScope,
    });

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
   * `openNote` for a note that lives in My Home rather than in the open space.
   *
   * Not `openNote` with a different id: that one records the open against the active space
   * and seeds the note cache with the active space's id, both of which would file a Home note
   * under a shared space. The navigation carries no `?space=`, which is what a Home read is —
   * the note page then moves the switcher back to My Home once it sees the note has no
   * association with the space that was open.
   */
  const openHomeNote = useCallback(
    (row: SpaceNoteRow) => {
      if (!homeSpaceId) return;
      recordRecentOpen(homeSpaceId, 'note', row.id);
      void queryClient.prefetchQuery(getNoteQueryOptions(row.id)).catch(() => {});
      navigate({
        to: prototypeNoteRouteTo(),
        params: { noteId: noteParamSlug(row.id) },
        search: prototypeNoteListNavigationSearch({ isScopedSharedSpace: false }),
      });
      closeLibraryPanel({ preserveHistory: true });
    },
    [homeSpaceId, queryClient, navigate, closeLibraryPanel],
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

  /*
   * A resource opens in the viewer first, wherever it was found — the panel gives way to the
   * Resources tool with that item showing. Leaving for the source, or docking it on the open
   * note, are one press away there; neither is what a plain click should commit you to.
   */
  const previewResource = useCallback(
    (selection: ResourceSelection) => {
      recordRecentOpen(spaceId, 'resource', selection.id);
      markPendingResourceSelection(selection);
      expandLibraryPanelInto('resources');
    },
    [spaceId, expandLibraryPanelInto],
  );
  const openResource = useCallback(
    (item: LibraryItem) => previewResource({ source: 'mine', id: item.id }),
    [previewResource],
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
    homeSpaceId,
    shellIsSharedSpace: isSharedSpace,
    viewingHome,
    listScope: sidebarListSpaceScope,
    setListScope: setSidebarListSpaceScope,
    sharedSpaceTitle: isSharedSpace ? spaceTitle : null,
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
    openHomeNote,
    openHighlight,
    openResource,
    previewResource,
    resolveDrillNoteRow,
  };
}

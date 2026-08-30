import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import Icon from '@/components/react/Icon';
import ProtoChipBar, { type ProtoChipOption } from './components/ProtoChipBar';
import { toast } from '@/utils/toast';
import { APIError } from '../../lib/api';
import { useSmartJumpDestination } from '../../hooks/useSmartJumpDestination';

import { useDeleteHighlight } from '../../hooks/mutations/useDeleteHighlight';
import { useRemoveFolder } from '../../hooks/mutations/useRemoveFolder';
import { useRemoveThreadCluster } from '../../hooks/mutations/useRemoveThreadCluster';
import { useDeleteSharedThread } from '../../hooks/mutations/useDeleteSharedThread';
import { useSetCurrentSpaceThread } from '../../hooks/mutations/useSetCurrentSpaceThread';

import {
  useSpaceNotes,
  useSpaceMembers,
  type SpaceMemberRow,
  type SpaceNoteRow,
} from '../../hooks/queries/useSpace';
import {
  useSpaceGroupThreads,
  type SpaceGroupStudyThread,
} from '../../hooks/queries/useSpaceGroupThreads';
import {
  getNoteQueryOptions,
  seedNoteFromList,
  type ListNoteForSeed,
} from '../../hooks/queries/useNote';
import { beginComposeInGroupThread } from '../../lib/compose-group-thread';
import {
  filterSharedSpaceThreads,
  isSharedSpaceThreadDrillId,
  sharedSpaceThreadsEmptyDescription,
} from './shared-space-thread-list';

import PrototypeSharedThreadDrilldown from './PrototypeSharedThreadDrilldown';
import {
  ProtoThreadTrailSortableList,
  ProtoThreadTrailSortableRow,
} from './ProtoThreadTrailSortable';
import {
  countNotesInFolderBucket,
  noteBelongsToFolderBucket,
  noteFolderMembershipLabels,
} from '@/utils/note-folder-display';
import { sortDrillNoteBriefsByLastUpdated, sortNotesByLastUpdated } from '@/utils/sorting';
import {
  orderStudyThreadNodesByIds,
  resolveStudyThreadMemberOrder,
} from '@/utils/study-thread-trail';
import { useStudyThreadMemberDragReorder } from '../../hooks/useStudyThreadMemberDragReorder';
import { isEffectivelyEmptyPrototypeNote } from '@/utils/prototype-note-empty';
import { computePrototypeNotesListPhase } from '@/utils/prototype-notes-list-phase';
import { readerRouteForReference } from '../../utils/reader-nav';
import { useProtoShell, type SidebarTagSearchIntent } from '../../layouts/proto-shell-context';
import { usePrototypeHomeSpaceId } from '../../hooks/usePrototypeHomeSpaceId';
import {
  usePrototypeStudyThreadListSyncListener,
} from '../../hooks/usePrototypeStudyThreadListSyncListener';
import { useIntersectionFetchNextPage } from '../../hooks/useIntersectionFetchNextPage';
import { focusedListRow, moveListRowFocus } from '../../hooks/useListKeyboardNavigation';
import {
  isPrototypeNotePath,
  matchPrototypeNoteId,
  prototypeHomeRouteTo,
  prototypeNoteRouteTo,
  prototypeReadRouteTo,
} from '@/lib/prototype-path';

import { parseScriptureReference } from '@/utils/scripture-detector';
import { bookSlug } from '@/utils/bible-book-chapters';
import { protoRelativeCaptionAbbrev } from './proto-time';
import ProtoConfirmDialog from './ProtoConfirmDialog';
import type {
  PrototypeHighlightStudyThreadRow,
} from '../../hooks/queries/usePrototypeSpaceStudyThreadHighlights';
import {
  usePrototypeSpaceStudyThreadHighlights,
} from '../../hooks/queries/usePrototypeSpaceStudyThreadHighlights';
import {
  usePrototypeStudyThreads,
  type StudyThreadCluster,
} from '../../hooks/queries/usePrototypeStudyThreads';
import { threadClusterDrillSlug } from '@/utils/thread-cluster-bulk-actions';
import PrototypeThreadProposalReview from './PrototypeThreadProposalReview';
import {
  usePrototypeStudyThread,
  studyThreadQueryKey,
  type StudyThreadResponse,
} from '../../hooks/queries/usePrototypeStudyThread';
import { studyThreadDisplayTitle } from '../../utils/study-thread-display-title';
import {
  usePrototypeSpaceScriptureIndex,
} from '../../hooks/queries/usePrototypeSpaceScriptureIndex';
import { useTagNoteIds } from '../../hooks/queries/useTagNoteIds';
import {
  isScripturePassageHighlightRow,
  prototypeHighlightListTitle,
  prototypeHighlightSubtitlePreview,
  prototypeHighlightRecencyIso,
} from './proto-highlight-subtitle';
import PrototypeSidebarHomeView from './PrototypeSidebarHomeView';
import ProtoSpaceLoading from './ProtoSpaceLoading';
import PrototypeListEmptyState, { PrototypeListNoMatchEmptyState } from './PrototypeListEmptyState';
import PrototypeResourceLibraryList from './PrototypeResourceLibraryList';
import {
  extendNoteSelectionRange,
  toggleNoteSelection,
  NOTE_SELECTION_CAP,
} from '../../lib/note-selection';
import { openLibraryFileItem, type LibraryItem } from '../../hooks/queries/useLibrary';
import { SIDEBAR_NO_MATCH_COPY } from './sidebar-no-match-copy';
import PrototypeSidebarToolbar from './PrototypeSidebarToolbar';
import {
  applyFolderPinOrdering,
  applyThreadClusterPinOrdering,
  folderRowId,
  loadPinnedFolderIds,
  loadPinnedHighlightIds,
  loadPinnedThreadClusterIds,
  removePinnedFolderId,
  removePinnedThreadClusterId,
  subscribePinnedStores,
  togglePinnedFolderId,
  togglePinnedHighlightId,
  togglePinnedThreadClusterId,
} from './proto-pinned-stores';
import PrototypeSidebarSearchResults from './PrototypeSidebarSearchResults';
import PrototypeSearchInput from './components/PrototypeSearchInput';
import { HIGHLIGHT_KIND_OPTIONS, type SidebarSearchResult } from './sidebar-search-types';
import {
  buildFoldersFromNotes,
  highlightKindMatches,
  mergeFoldersWithRegistry,
  type ActiveSearchContext,
  type FolderBucket,
} from './sidebar-universal-search';
import { usePrototypeFolderRegistry } from '../../hooks/mutations/usePrototypeFolderRegistry';
import { useActiveSpace } from '../../hooks/useActiveSpace';
import {
  canComposeInSpace,
  canCreateSidebarCollections as resolveCanCreateSidebarCollections,
} from '../../lib/shared-space-capabilities';
import { everyRowAllows } from '../../lib/note-row-capabilities';
import {
  useOrganizeApi,
  type CreateThreadPrefill,
} from '../../lib/prototype-organize-runner-store';
import {
  FOLDER_FANOUT_CAP,
  MIN_BULK_THREAD_NOTES,
  SHARED_FOLDER_FANOUT_CAP,
  PROTOTYPE_COMMAND_BY_VERB,
  type CommandContext,
  type PrototypeCommandId, singleKindCommandParts,
} from '../../lib/prototype-commands';
import { publishPrototypeCommandContext } from '../../lib/prototype-command-context-store';
import { usePrototypeShiftHints } from '../../hooks/usePrototypeShiftHints';
import PrototypeAddNotesSheet from './PrototypeAddNotesSheet';
import PrototypeCreateFolderSheet from './PrototypeCreateFolderSheet';

import { resolveSpaceOwnerMember } from '../../lib/shared-space-about';
import SharedSpaceOwnerCollectionEmptyDescription from './SharedSpaceOwnerCollectionEmptyDescription';

import { resolvePrototypeToolbarNoteId } from '@/utils/prototype-compose-url';
import {
  noteParamSlug,
  normalizeNoteIdFromParam,
  isPrototypeDraftNoteSlug,
} from './proto-route-slugs';
import { prototypeNoteListNavigationSearch } from '@/utils/prototype-sidebar-highlight-active';

import { toastError } from '../../lib/error-copy';
import { HighlightRow } from './sidebar-rows/HighlightRow';
import { ProtoNotesListLoading } from './sidebar-rows/ProtoNotesListLoading';
import { PrototypeSidebarFolderCard } from './sidebar-rows/PrototypeSidebarFolderCard';
import { PrototypeSidebarNoteRow } from './sidebar-rows/PrototypeSidebarNoteRow';
import {
  PrototypeSidebarSharedThreadCard,
  PrototypeSidebarThreadCard,
} from './sidebar-rows/PrototypeSidebarThreadCard';
import { stripHtmlPreview } from './sidebar-rows/sidebar-row-helpers';

function describeQueryFailure(err: unknown): string {
  if (err instanceof APIError) return err.message;
  if (err instanceof Error) return err.message;
  return '';
}

function resolveClusterListTitle(
  cluster: StudyThreadCluster,
  activeNoteFullId: string | undefined,
  queryClient: QueryClient,
  homeSpaceId: string | null | undefined,
): string {
  const fallback = cluster.title?.trim() || 'Untitled note';
  if (!activeNoteFullId || !homeSpaceId) return fallback;
  const inListCluster =
    cluster.id === activeNoteFullId || cluster.memberIds?.includes(activeNoteFullId);
  if (!inListCluster) return fallback;

  const cached = queryClient.getQueryData<StudyThreadResponse>(
    studyThreadQueryKey(activeNoteFullId, homeSpaceId),
  );
  if (!cached?.nodes?.length) return fallback;
  const sharesCluster = cached.nodes.some((n) => cluster.memberIds?.includes(n.id));
  if (!sharesCluster) return fallback;
  return studyThreadDisplayTitle(cached);
}

/**
 * What a book shows when you open it. Notes leads because "what have I written in
 * Genesis" is the common question; the verse breakdown is still one tap away and
 * still drills to a single passage's notes.
 */
type ScriptureBookView = 'notes' | 'passages';

const SCRIPTURE_BOOK_VIEW_OPTIONS: readonly ProtoChipOption<ScriptureBookView>[] = [
  { id: 'notes', label: 'Notes', iconName: 'note-sticky' },
  { id: 'passages', label: 'Passages', iconName: 'scroll' },
];

type HighlightKindFilter = 'all' | 'notes' | 'connected' | 'scripture' | 'references';

function ProtoNotesPaginationFooter({
  hasNextPage,
  isFetchingNextPage,
  isFetchNextPageError,
  setSentinelRef,
  onRetry,
}: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  setSentinelRef: (node: HTMLDivElement | null) => void;
  onRetry: () => void;
}) {
  if (!hasNextPage && !isFetchingNextPage && !isFetchNextPageError) {
    return null;
  }

  return (
    <div className="proto-load-more-status">
      {hasNextPage ? (
        <div ref={setSentinelRef} className="proto-load-more-sentinel" aria-hidden />
      ) : null}
      {isFetchingNextPage ? (
        <span className="load-more-indicator" aria-label="Loading">
          <span className="load-more-indicator__dot" />
          <span className="load-more-indicator__dot" />
          <span className="load-more-indicator__dot" />
        </span>
      ) : null}
      {isFetchNextPageError ? (
        <button type="button" className="proto-load-more-retry proto-caption" onClick={onRetry}>
          Couldn&apos;t load more — Retry
        </button>
      ) : null}
    </div>
  );
}

export default function PrototypeSidebar({
  scopedSpaceId,
  showListSpaceScopeBar = false,
  shellIsSharedSpace = false,
}: {
  scopedSpaceId?: string | null;
  showListSpaceScopeBar?: boolean;
  shellIsSharedSpace?: boolean;
} = {}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const {
    closeDrawer,
    isMobileSidebar,
    sidebarLayer,
    sidebarListMode: mode,
    sidebarListSpaceScope,
    setSidebarListSpaceScope,
    sidebarSelectMode,
    setSidebarSelectMode,
    sidebarSelectionKind,
    sidebarSelectedIds,
    setSidebarSelection,
    setSidebarFolderDrilldown: setActiveFolderKey,
    sidebarFolderDrilldown: activeFolderKey,
    sidebarThreadDrilldownId,
    setSidebarThreadDrilldownId,
    sidebarThreadProposal,
    libraryPanelView,
    setSidebarThreadProposal,
    setSidebarLayer,
    setSidebarListMode,
    sidebarTagSearchIntent,
    clearSidebarTagSearchIntent,
    ensureSidebarExpanded,
    composePersistedNoteId,
    beginPrototypeComposeSession,
    scriptureDrill,
    setScriptureDrill,
  } = useProtoShell();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { homeSpaceId: personalHomeSpaceId, navReady, authReady } = usePrototypeHomeSpaceId();
  const homeSpaceId = scopedSpaceId ?? personalHomeSpaceId;
  const isScopedSharedSpace = Boolean(
    scopedSpaceId &&
      personalHomeSpaceId &&
      (scopedSpaceId.startsWith('space_') ? scopedSpaceId : `space_${scopedSpaceId}`) !==
        (personalHomeSpaceId.startsWith('space_') ? personalHomeSpaceId : `space_${personalHomeSpaceId}`),
  );
  const { userId: authUserId } = useAuth();
  const { isOwner: viewerIsSpaceOwner, space: activeSharedSpace } = useActiveSpace();
  const sharedSpaceMembersQuery = useSpaceMembers(isScopedSharedSpace && homeSpaceId ? homeSpaceId : '');
  const sharedSpaceMemberByUserId = useMemo(() => {
    const map = new Map<string, SpaceMemberRow>();
    for (const member of sharedSpaceMembersQuery.data?.members ?? []) {
      map.set(member.userId, member);
    }
    return map;
  }, [sharedSpaceMembersQuery.data?.members]);
  const sharedSpaceOwnerAttribution = useMemo(() => {
    const owner = resolveSpaceOwnerMember(
      sharedSpaceMembersQuery.data?.members ?? [],
      activeSharedSpace?.ownerId,
    );
    return {
      ownerDisplayName: owner?.displayName ?? 'Space owner',
      ownerUserId: owner?.userId ?? '',
      ownerFirstName: owner?.firstName,
      ownerProfileImageUrl: owner?.profileImageUrl,
      ownerColor: owner?.userColor ?? 'blue',
      ownerIsSelf: Boolean(authUserId && owner?.userId === authUserId),
    };
  }, [sharedSpaceMembersQuery.data?.members, activeSharedSpace?.ownerId, authUserId]);
  const canCreateSidebarCollections = resolveCanCreateSidebarCollections({
      inSharedSpaceShell: shellIsSharedSpace,
      listScope: sidebarListSpaceScope,
      isScopedSharedSpaceList: isScopedSharedSpace,
      isOwner: viewerIsSpaceOwner,
      membershipRole: activeSharedSpace?.role,
      type: activeSharedSpace?.type,
      orgId: activeSharedSpace?.orgId,
    });
  const isMyHomeListInSharedShell =
    shellIsSharedSpace && showListSpaceScopeBar && sidebarListSpaceScope === 'my-home';
  const foldersEmptyDescription = useMemo(() => {
    if (canCreateSidebarCollections) {
      return "Create a folder to organize notes, then add them when you're ready.";
    }
    if (isMyHomeListInSharedShell) return 'Folders are managed from This space.';
    if (isScopedSharedSpace) {
      return (
        <SharedSpaceOwnerCollectionEmptyDescription
          resourceLabel="Folders"
          {...sharedSpaceOwnerAttribution}
        />
      );
    }
    return 'Folders in this space are added by the space owner.';
  }, [
    canCreateSidebarCollections,
    isMyHomeListInSharedShell,
    isScopedSharedSpace,
    sharedSpaceOwnerAttribution,
  ]);
  const threadsEmptyDescription = useMemo(() => {
    if (isScopedSharedSpace && !isMyHomeListInSharedShell) {
      return sharedSpaceThreadsEmptyDescription(canCreateSidebarCollections);
    }
    if (canCreateSidebarCollections) return 'Name a Thread and pick notes to connect them.';
    if (isMyHomeListInSharedShell) return 'Threads are managed from This space.';
    if (isScopedSharedSpace) {
      return (
        <SharedSpaceOwnerCollectionEmptyDescription
          resourceLabel="Threads"
          {...sharedSpaceOwnerAttribution}
        />
      );
    }
    return 'Threads in this space are added by the space owner.';
  }, [
    canCreateSidebarCollections,
    isMyHomeListInSharedShell,
    isScopedSharedSpace,
    sharedSpaceOwnerAttribution,
  ]);
  usePrototypeStudyThreadListSyncListener(homeSpaceId ?? undefined);

  const scrollRootRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  /*
   * Both this list and the Library panel answer ⇧↑/⇧↓ on `window`, and listener order is
   * not something either can rely on — so the rail yields whenever the panel is up. The
   * panel covers this list; moving a selection the reader cannot see would be worse than
   * doing nothing.
   */
  const libraryPanelOpenRef = useRef(false);
  libraryPanelOpenRef.current = Boolean(libraryPanelView);

  useEffect(() => {
    const onMoveInList = (event: Event) => {
      if (libraryPanelOpenRef.current) return;
      const step = (event as CustomEvent<{ step?: number }>).detail?.step ?? 1;
      const container = scrollRootRef.current;
      if (!container) return;
      moveListRowFocus(container, step);
    };
    window.addEventListener('prototypeShortcutMoveInList', onMoveInList);
    return () => window.removeEventListener('prototypeShortcutMoveInList', onMoveInList);
  }, []);

  const {
    data: pages,
    isError: notesIsError,
    isPending: notesIsPending,
    isFetching: notesIsFetching,
    isFetched: notesIsFetched,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useSpaceNotes(homeSpaceId ?? '', 20, { pollWhileActive: isScopedSharedSpace });

  const folderRegistryQuery = usePrototypeFolderRegistry(homeSpaceId ?? undefined);

  const notesPaginationEnabled =
    !!homeSpaceId && (mode === 'notes' || (mode === 'folders' && activeFolderKey !== undefined));

  const { setSentinelRef } = useIntersectionFetchNextPage({
    scrollRootRef,
    enabled: notesPaginationEnabled,
    hasNextPage: !!hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  });

  const [q, setQ] = useState('');
  const [tagFilter, setTagFilter] = useState<SidebarTagSearchIntent | null>(null);
  const [addNotesSheetOpen, setAddNotesSheetOpen] = useState(false);
  /*
   * The six verbs are the host's now — it owns the sheets, the confirms and the mutations,
   * mounted by the shell so they exist when this sidebar does not. What stays here is the
   * bar: which rows are selected, and what may be done to them.
   */
  const organize = useOrganizeApi();

  const [createFolderSheetOpen, setCreateFolderSheetOpen] = useState(false);
  /*
   * One create-Thread sheet in the app, and it is the host's. This used to be a second copy
   * living here, which meant the suggestion that proposes a Thread only worked on surfaces
   * where this sidebar happened to be mounted.
   */
  const openCreateThreadSheet = useCallback(
    (prefill?: CreateThreadPrefill | null) => {
      if (!canCreateSidebarCollections) return;
      organize?.openCreateThread(prefill ?? undefined);
    },
    [canCreateSidebarCollections, organize],
  );
  const openCreateFolderSheet = useCallback(() => {
    if (!canCreateSidebarCollections) return;
    setCreateFolderSheetOpen(true);
  }, [canCreateSidebarCollections]);

  const smartJump = useSmartJumpDestination();
  const openSmartJumpReader = useCallback(() => {
    if (isMobileSidebar) closeDrawer({ preserveHistory: true });
    void navigate({
      to: prototypeReadRouteTo(),
      params: { book: bookSlug(smartJump.book), chapter: String(smartJump.chapter) },
      search: {
        v: smartJump.verse ? String(smartJump.verse) : undefined,
        t: smartJump.translation || undefined,
        req: String(Date.now()),
      },
    });
  }, [smartJump, isMobileSidebar, closeDrawer, navigate]);
  const isHomeLayer = sidebarLayer === 'space';
  const tagFilterActive = Boolean(tagFilter);
  const searchActive = !isHomeLayer && q.trim().length > 0 && !tagFilterActive;
  const myHomeCrossSearchEnabled = Boolean(
    shellIsSharedSpace && searchActive && isScopedSharedSpace && personalHomeSpaceId,
  );

  const { data: myHomeNotesPages } = useSpaceNotes(
    myHomeCrossSearchEnabled ? (personalHomeSpaceId ?? '') : '',
    20,
  );
  const myHomeNotes = useMemo(
    () => myHomeNotesPages?.pages.flatMap((p) => p.notes) ?? [],
    [myHomeNotesPages?.pages],
  );
  const myHomeFolderRegistryQuery = usePrototypeFolderRegistry(
    myHomeCrossSearchEnabled ? personalHomeSpaceId ?? undefined : undefined,
  );

  // List scope overlay — drop stale search when switching between shared space and My Home.
  useEffect(() => {
    if (!showListSpaceScopeBar) return;
    setQ('');
    setTagFilter(null);
  }, [showListSpaceScopeBar, sidebarListSpaceScope]);

  const tagNoteIdsQuery = useTagNoteIds(tagFilter?.tagId, homeSpaceId ?? undefined);
  const tagNoteIdSet = useMemo(
    () => new Set(tagNoteIdsQuery.data?.noteIds ?? []),
    [tagNoteIdsQuery.data?.noteIds],
  );

  // Search belongs to the list layer — drop any stale query when entering Home.
  useEffect(() => {
    if (isHomeLayer) {
      setQ('');
      setTagFilter(null);
    }
  }, [isHomeLayer]);

  // Home revisit logic needs the full note corpus; prefetch remaining pages in the background.
  useEffect(() => {
    if (!isHomeLayer || !hasNextPage || isFetchingNextPage) return;
    void fetchNextPage();
  }, [isHomeLayer, hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    if (!sidebarTagSearchIntent || isHomeLayer) return;
    setQ(sidebarTagSearchIntent.tagName);
    setTagFilter(sidebarTagSearchIntent);
    clearSidebarTagSearchIntent();
    searchInputRef.current?.focus();
  }, [sidebarTagSearchIntent, isHomeLayer, clearSidebarTagSearchIntent]);

  const highlightsQuery = usePrototypeSpaceStudyThreadHighlights(
    searchActive || mode === 'highlights' ? homeSpaceId ?? undefined : undefined,
  );
  const myHomeHighlightsQuery = usePrototypeSpaceStudyThreadHighlights(
    myHomeCrossSearchEnabled ? personalHomeSpaceId ?? undefined : undefined,
  );
  const scriptureQuery = usePrototypeSpaceScriptureIndex(
    searchActive || mode === 'scripture' || isHomeLayer ? homeSpaceId ?? undefined : undefined,
  );
  const myHomeScriptureQuery = usePrototypeSpaceScriptureIndex(
    myHomeCrossSearchEnabled ? personalHomeSpaceId ?? undefined : undefined,
  );
  const studyThreadsQuery = usePrototypeStudyThreads(
    !isScopedSharedSpace && (searchActive || mode === 'threads') ? homeSpaceId ?? undefined : undefined,
  );
  const groupThreadsQuery = useSpaceGroupThreads(
    isScopedSharedSpace && (searchActive || mode === 'threads') ? homeSpaceId ?? undefined : undefined,
  );
  const myHomeStudyThreadsQuery = usePrototypeStudyThreads(
    myHomeCrossSearchEnabled ? personalHomeSpaceId ?? undefined : undefined,
  );
  const threadDrillQuery = usePrototypeStudyThread(
    !isScopedSharedSpace &&
      (searchActive || mode === 'threads') &&
      sidebarThreadDrilldownId &&
      !isSharedSpaceThreadDrillId(sidebarThreadDrilldownId)
      ? sidebarThreadDrilldownId
      : undefined,
    homeSpaceId,
  );
  const threadDrillMemberIds = useMemo(
    () => threadDrillQuery.data?.nodes.map((n) => n.id) ?? [],
    [threadDrillQuery.data?.nodes],
  );

  const [scriptureBookView, setScriptureBookView] = useState<ScriptureBookView>('notes');
  const [highlightKindFilter, setHighlightKindFilter] = useState<HighlightKindFilter>('all');
  const [pinnedHighlightIds, setPinnedHighlightIds] = useState<string[]>([]);
  const [pinnedFolderIds, setPinnedFolderIds] = useState<string[]>([]);
  const [pinnedThreadClusterIds, setPinnedThreadClusterIds] = useState<string[]>([]);
  const [highlightDeleteTarget, setHighlightDeleteTarget] = useState<{
    row: PrototypeHighlightStudyThreadRow;
    anchorRect: DOMRect;
  } | null>(null);
  const [folderDeleteTarget, setFolderDeleteTarget] = useState<{
    name: string;
    count: number;
    anchorRect: DOMRect;
  } | null>(null);
  const [threadDeleteTarget, setThreadDeleteTarget] = useState<{
    cluster: StudyThreadCluster;
    title: string;
    anchorRect: DOMRect;
  } | null>(null);

  useEffect(() => {
    const reread = () => {
      setPinnedHighlightIds(loadPinnedHighlightIds(homeSpaceId ?? undefined));
      setPinnedFolderIds(loadPinnedFolderIds(homeSpaceId ?? undefined));
      setPinnedThreadClusterIds(loadPinnedThreadClusterIds(homeSpaceId ?? undefined));
    };
    reread();
    /* The organize host pins on this list's behalf now, so the write no longer passes
       through here — without the subscription a pin from the bulk bar would not show
       until something unrelated re-rendered. */
    return subscribePinnedStores(reread);
  }, [homeSpaceId]);

  const togglePinnedHighlight = useCallback(
    (id: string) => {
      if (!homeSpaceId) return;
      setPinnedHighlightIds(togglePinnedHighlightId(homeSpaceId, id));
    },
    [homeSpaceId],
  );

  const togglePinnedFolder = useCallback(
    (rowId: string) => {
      if (!homeSpaceId) return;
      setPinnedFolderIds(togglePinnedFolderId(homeSpaceId, rowId));
    },
    [homeSpaceId],
  );

  const togglePinnedThreadCluster = useCallback(
    (clusterId: string) => {
      if (!homeSpaceId) return;
      setPinnedThreadClusterIds(togglePinnedThreadClusterId(homeSpaceId, clusterId));
    },
    [homeSpaceId],
  );

  const notes = useMemo(() => {
    if (!pages?.pages) return [];
    const flat = pages.pages.flatMap((p) => p.notes);
    const byId = new Map<string, SpaceNoteRow>();
    for (const note of flat) {
      const existing = byId.get(note.id);
      if (!existing) {
        byId.set(note.id, note);
        continue;
      }
      const existingUpdated = existing.updatedAt ?? existing.createdAt ?? '';
      const noteUpdated = note.updatedAt ?? note.createdAt ?? '';
      if (noteUpdated >= existingUpdated) {
        byId.set(note.id, note);
      }
    }
    return sortNotesByLastUpdated(Array.from(byId.values())).filter(
      (n) => !isEffectivelyEmptyPrototypeNote(n.title, n.content),
    );
  }, [pages]);

  const notesById = useMemo(() => {
    const m = new Map<string, SpaceNoteRow>();
    for (const n of notes) m.set(n.id, n);
    return m;
  }, [notes]);

  const activeFolderMemberIds = useMemo(() => {
    if (mode !== 'folders' || activeFolderKey === undefined || activeFolderKey === null) return [];
    return notes
      .filter((n) =>
        noteBelongsToFolderBucket(
          {
            primaryCollection: n.primaryCollection ?? null,
            secondaryCollections: n.secondaryCollections ?? [],
          },
          activeFolderKey,
        ),
      )
      .map((n) => n.id);
  }, [mode, activeFolderKey, notes]);

  const showFolderAddNotes =
    mode === 'folders' && activeFolderKey !== undefined && typeof activeFolderKey === 'string';
  const showThreadAddNotes =
    mode === 'threads' &&
    Boolean(sidebarThreadDrilldownId) &&
    !isSharedSpaceThreadDrillId(sidebarThreadDrilldownId);

  // Thread/scripture drill rows carry only id+title (±dates), but we render them with the
  // same PrototypeSidebarNoteRow as the Notes/Folders lists. Resolve the full loaded note so
  // the row shows the same title + date + excerpt + menu; fall back to the brief when unloaded.
  const resolveDrillNoteRow = useCallback(
    (brief: {
      id: string;
      title: string | null;
      content?: string | null;
      updatedAt?: string | null;
      createdAt?: string | null;
    }): SpaceNoteRow => {
      const full = notesById.get(brief.id);
      const briefContent = brief.content?.trim() ?? '';
      if (full) {
        if (!briefContent) return full;
        if (!full.content?.trim()) {
          return {
            ...full,
            content: briefContent,
            updatedAt: brief.updatedAt ?? full.updatedAt,
          };
        }
        return full;
      }
      return {
        id: brief.id,
        title: brief.title,
        content: briefContent,
        updatedAt: brief.updatedAt ?? null,
        createdAt: brief.createdAt ?? null,
        noteType: 'default',
      } as SpaceNoteRow;
    },
    [notesById],
  );

  // --- Proposed-thread review layer (from a Home theme card) ---

  const closeThreadProposal = useCallback(() => {
    setSidebarThreadProposal(undefined);
    setSidebarLayer('space'); // return to Home (where the proposal was launched)
    setQ('');
  }, [setSidebarThreadProposal, setSidebarLayer]);

  const noteSlugFromPath = matchPrototypeNoteId(pathname);
  const isDraftNoteRoute = noteSlugFromPath != null && isPrototypeDraftNoteSlug(noteSlugFromPath);
  const activeNoteFullId =
    resolvePrototypeToolbarNoteId(
      composePersistedNoteId,
      noteSlugFromPath,
      isDraftNoteRoute,
      normalizeNoteIdFromParam,
    ) ?? undefined;

  const notesForMode = useMemo(() => {
    const base =
      activeFolderKey !== undefined
        ? notes.filter((n) => {
            const enriched = n as SpaceNoteRow & { primaryCollection?: string | null; secondaryCollections?: string[] };
            const labels = noteFolderMembershipLabels({
              primaryCollection: enriched.primaryCollection ?? null,
              secondaryCollections: enriched.secondaryCollections ?? [],
            });
            if (activeFolderKey === null) return labels.length === 0;
            return labels.includes(activeFolderKey);
          })
        : notes;

    if (tagFilter) {
      if (!tagNoteIdsQuery.data) return [];
      const tagged = base.filter((n) => tagNoteIdSet.has(n.id));
      const t = q.trim().toLowerCase();
      if (!t || t === tagFilter.tagName.trim().toLowerCase()) return tagged;
      return tagged.filter((n) => {
        const title = (n.title ?? '').toLowerCase();
        const body = stripHtmlPreview(n.content, 800).toLowerCase();
        return title.includes(t) || body.includes(t);
      });
    }

    const t = q.trim().toLowerCase();
    if (!t) return base;
    return base.filter((n) => {
      const title = (n.title ?? '').toLowerCase();
      const body = stripHtmlPreview(n.content, 800).toLowerCase();
      return title.includes(t) || body.includes(t);
    });
  }, [notes, q, activeFolderKey, tagFilter, tagNoteIdsQuery.data, tagNoteIdSet]);

  /** Ceiling matched to `copy-notes`' server-side `.slice(0, 50)`. */
  const SELECTION_CAP = NOTE_SELECTION_CAP;
  /*
   * The folder ceiling now comes from `prototype-commands.ts`, where it also gates the
   * keyboard chord and the Library panel's Actions row. Personal notes assign in one batch
   * request; a shared space still fans out per note, so it keeps the lower limit.
   */
  const folderCap = isScopedSharedSpace ? SHARED_FOLDER_FANOUT_CAP : FOLDER_FANOUT_CAP;

  /* Holding Shift prints the chord on each bulk-bar button — see the hint spans below. */
  const showShiftHints = usePrototypeShiftHints();

  const selectedNoteIdSet = useMemo(() => new Set(sidebarSelectedIds), [sidebarSelectedIds]);

  /** Rows currently listed, in list order — what "Select all" and a range mean. */
  const selectableNotes = useMemo(
    () => notesForMode.slice(0, SELECTION_CAP),
    [notesForMode],
  );

  /**
   * Selecting starts from the list menu's "Select…" — the only entry point,
   * now that the checkbox no longer reveals itself on hover — but a ⌘-click
   * still adds a note to the set directly. Either way it ends when the last
   * one is deselected or Esc clears the set.
   */
  const selectionActive = sidebarSelectMode || sidebarSelectedIds.length > 0;
  /*
   * A row is in a selecting frame of mind only when *its own kind* is being selected — a
   * standing highlight selection must not retarget a note row's click.
   *
   * Every kind needs the leading `sidebarSelectMode ||` term, and for a while only this one
   * had it. The other five derived their flag from ids alone, which deadlocked the moment the
   * checkbox stopped revealing itself on hover: the flag is what adds `--selectable`, the CSS
   * hides the checkbox without it, and the checkbox is the only way to select a first item. So
   * folders, Threads, highlights, resources and search results could not be selected at all —
   * ⌘-click still worked, because it is gated on `selectable` rather than on select mode, which
   * is why this read as broken on touch and merely odd on a desktop.
   */
  const noteSelectionActive =
    sidebarSelectMode || (sidebarSelectionKind === 'note' && sidebarSelectedIds.length > 0);

  /** Anchor for shift-click, so a range means "from the last one you touched". */
  const selectionAnchorRef = useRef<string | null>(null);
  /* Anchored to the button that raised it, like every other delete here. */

  /**
   * Every selection made in this file's note lists is a selection *of notes*.
   * Named once here rather than repeating the kind at each call site — the
   * folder, thread, highlight and resource bars each name their own.
   */
  const setSidebarSelectedNotes = useCallback(
    (ids: string[]) => setSidebarSelection('note', ids),
    [setSidebarSelection],
  );

  const toggleNoteSelected = useCallback(
    (id: string) => {
      selectionAnchorRef.current = id;
      setSidebarSelectedNotes(toggleNoteSelection(sidebarSelectedIds, id));
    },
    [sidebarSelectedIds, setSidebarSelectedNotes],
  );

  const selectRangeTo = useCallback(
    (id: string) => {
      setSidebarSelectedNotes(
        extendNoteSelectionRange({
          selected: sidebarSelectedIds,
          orderedIds: selectableNotes.map((n) => n.id),
          anchorId: selectionAnchorRef.current,
          targetId: id,
        }),
      );
      selectionAnchorRef.current = id;
    },
    [selectableNotes, sidebarSelectedIds, setSidebarSelectedNotes],
  );

  /* Esc is the way out, which is why nothing needs a Done button. */
  useEffect(() => {
    if (!selectionActive) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setSidebarSelectedNotes([]);
      setSidebarSelectMode(false);
      selectionAnchorRef.current = null;
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selectionActive, setSidebarSelectedNotes, setSidebarSelectMode]);

  const selectedRows = useMemo(
    () => notesForMode.filter((n) => selectedNoteIdSet.has(n.id)),
    [notesForMode, selectedNoteIdSet],
  );

  /**
   * All-or-nothing: an action lights up only when every selected note can take it. One
   * foreign note in the batch disables it rather than the action half-applying.
   */
  const bulkCapabilityRows = useMemo(
    () =>
      selectedRows.map((n) => ({
        isOwnNote: n.isOwnNote,
        isScopedSharedSpace,
        viewerIsSpaceOwner,
      })),
    [selectedRows, isScopedSharedSpace, viewerIsSpaceOwner],
  );

  const bulkActions = useMemo(
    () => ({
      count: selectedRows.length,
      canOrganize:
        everyRowAllows(bulkCapabilityRows, 'mayOrganize') && selectedRows.length <= folderCap,
      /* A Thread is a relationship between notes, so one note cannot be one —
         `MIN_BULK_THREAD_NOTES` is the same floor the create sheet submits on.
         Below it the action is not offered at all rather than offered and
         refused at the far end of a form. */
      canThread:
        everyRowAllows(bulkCapabilityRows, 'mayManageThread') &&
        selectedRows.length >= MIN_BULK_THREAD_NOTES,
      canDelete: everyRowAllows(bulkCapabilityRows, 'mayDelete'),
      canRemoveFromSpace: everyRowAllows(bulkCapabilityRows, 'mayRemoveFromSpace'),
      canShare: everyRowAllows(bulkCapabilityRows, 'mayShareToSpace'),
    }),
    [bulkCapabilityRows, selectedRows.length, folderCap],
  );

  const allSelectableSelected =
    selectableNotes.length > 0 && selectableNotes.every((n) => selectedNoteIdSet.has(n.id));

  /**
   * What a search result may do about selection.
   *
   * Results are a different row component over the same underlying things, so
   * rather than teaching that component the shell's rules it is handed a
   * function that answers per row. Notes and highlights answer; a folder or a
   * book result gets null, because those are places you go rather than things
   * you act on in bulk from here.
   *
   * No shift-range here. A range needs an order, and the only order that would
   * not surprise the reader is the one on screen — which this component does
   * not hold, because the results are built one level down. ⌘-click and plain
   * click both still add, so the gesture that is missing is the convenience,
   * not the capability.
   */
  const searchResultSelection = useMemo(
    () => ({
      for: (kind: 'note' | 'highlight', id: string, label: string) => {
        const active =
          sidebarSelectMode || (sidebarSelectionKind === kind && sidebarSelectedIds.length > 0);
        const selected = active && sidebarSelectedIds.includes(id);
        const base = sidebarSelectionKind === kind ? sidebarSelectedIds : [];
        const onToggle = () => {
          selectionAnchorRef.current = id;
          setSidebarSelection(kind, toggleNoteSelection(base, id));
        };
        return {
          selectMode: active,
          selected,
          checkbox: {
            selected,
            label,
            onToggle,
          },
        };
      },
    }),
    [sidebarSelectionKind, sidebarSelectedIds, setSidebarSelection],
  );

  /**
   * Bulk action bar. Quiet controls on the `.proto-collection-grid-actions` recipe — four
   * gradient buttons would read as four competing primary actions.
   *
   * The set swaps with scope rather than greying half of itself out: `mayDelete` is false
   * for everyone inside a shared-space list and `mayShareToSpace` is false in any shared
   * context, so a fixed bar would sit two-thirds dead there.
   */
  /*
   * The bar's half of a verb: name the selection, and say which control raised it so a
   * confirm can point back at the button rather than at the far corner of the window.
   */
  const runBulkCommand = useCallback(
    (commandId: PrototypeCommandId, control: HTMLElement) => {
      if (!organize || sidebarSelectionKind !== 'note') return;
      const idSet = new Set(sidebarSelectedIds);
      const rows = selectedRows.filter((n) => idSet.has(n.id));
      if (rows.length !== sidebarSelectedIds.length) return;
      organize.run(
        commandId,
        {
          kind: 'note',
          ...singleKindCommandParts('note', sidebarSelectedIds),
          ids: sidebarSelectedIds,
          rows: rows.map((n) => ({
            isOwnNote: n.isOwnNote,
            isScopedSharedSpace,
            viewerIsSpaceOwner,
          })),
          fromSelection: true,
          isScopedSharedSpace,
        },
        { anchorRect: control.getBoundingClientRect() },
      );
    },
    [organize, sidebarSelectedIds, sidebarSelectionKind, selectedRows, isScopedSharedSpace, viewerIsSpaceOwner],
  );

  /**
   * The same delegation for folders, Threads and highlights.
   *
   * Their capability rows are permissive, and that is not a shortcut: these three bars never
   * gated at all — the buttons were always live — so anything stricter here would take away
   * an action that works today. What they are is *yours*, in your own space, which is what
   * `isOwnNote: true` says to `everyRowAllows`.
   */
  const runCollectionCommand = useCallback(
    (kind: 'folder' | 'thread' | 'highlight', commandId: PrototypeCommandId, control: HTMLElement) => {
      if (!organize || sidebarSelectedIds.length === 0) return;
      organize.run(
        commandId,
        {
          kind,
          ...singleKindCommandParts(kind, sidebarSelectedIds),
          ids: sidebarSelectedIds,
          rows: sidebarSelectedIds.map(() => ({
            isOwnNote: true,
            isScopedSharedSpace,
            viewerIsSpaceOwner,
          })),
          fromSelection: true,
          isScopedSharedSpace,
        },
        { anchorRect: control.getBoundingClientRect() },
      );
    },
    [organize, sidebarSelectedIds, isScopedSharedSpace, viewerIsSpaceOwner],
  );

  const bulkBar = (
    <div className="proto-collection-grid-actions proto-bulk-bar">
      <button
        type="button"
        className="proto-bulk-bar__btn"
        disabled={!bulkActions.canOrganize}
        title={
          bulkActions.count > folderCap
            ? `A folder can take up to ${folderCap} notes at a time`
            : 'Put these notes in a folder'
        }
        onClick={(e) => runBulkCommand('organize.folder', e.currentTarget)}
      >
        {/* "Folder", not "File" — this app has literal files on its shelves now,
            and the verb would read as the noun. The icon carries the doing. */}
        <Icon name="folder" size={15} aria-hidden />
        <span className="proto-bulk-bar__label">Folder</span>
        {/* Hold Shift and the bar says how to reach it without the mouse — the same
            teaching the toolbar orbs already do, at the moment you are acting. */}
        {showShiftHints ? (
          <span className="proto-bulk-bar__hint" aria-hidden="true">
            <kbd className="proto-kbd proto-kbd--hint">M</kbd>
          </span>
        ) : null}
      </button>
      {bulkActions.canThread ? (
        <button
          type="button"
          className="proto-bulk-bar__btn"
          title="Start a Thread from these notes"
          onClick={(e) => runBulkCommand('organize.thread', e.currentTarget)}
        >
          <Icon name="arrow-right-arrow-left" size={15} aria-hidden />
          <span className="proto-bulk-bar__label">Thread</span>
          {showShiftHints ? (
            <span className="proto-bulk-bar__hint" aria-hidden="true">
              <kbd className="proto-kbd proto-kbd--hint">T</kbd>
            </span>
          ) : null}
        </button>
      ) : null}
      {isScopedSharedSpace ? (
        <button
          type="button"
          className="proto-bulk-bar__btn proto-bulk-bar__btn--danger"
          disabled={!bulkActions.canRemoveFromSpace}
          title="Take these notes out of this space"
          onClick={(e) => runBulkCommand('organize.removeFromSpace', e.currentTarget)}
        >
          <Icon name="circle-minus" size={15} aria-hidden />
          <span className="proto-bulk-bar__label">Remove</span>
        </button>
      ) : (
        <>
          <button
            type="button"
            className="proto-bulk-bar__btn"
            disabled={!bulkActions.canShare}
            title="Share these notes to a space"
            onClick={(e) => runBulkCommand('organize.share', e.currentTarget)}
          >
            <Icon name="share" size={15} aria-hidden />
            <span className="proto-bulk-bar__label">Share</span>
          </button>
          <button
            type="button"
            className="proto-bulk-bar__btn proto-bulk-bar__btn--danger"
            disabled={!bulkActions.canDelete}
            title="Delete these notes"
            onClick={(e) => runBulkCommand('organize.delete', e.currentTarget)}
          >
            <Icon name="trash-can" size={15} aria-hidden />
            <span className="proto-bulk-bar__label">Delete</span>
            {showShiftHints ? (
              <span className="proto-bulk-bar__hint" aria-hidden="true">
                <kbd className="proto-kbd proto-kbd--hint">⌫</kbd>
              </span>
            ) : null}
          </button>
        </>
      )}
    </div>
  );

  const notesListPhase = computePrototypeNotesListPhase({
    homeSpaceId,
    authReady,
    isPending: notesIsPending,
    isFetching: notesIsFetching,
    // Required, and it was missing — so `!input.isFetched` was permanently true and a
    // settled-empty Home dropped back to loading dots on every background refetch. That
    // is verbatim the regression computePrototypeNotesListPhase's own INVARIANT comment
    // documents as fixed; omitting it here silently un-fixed it.
    isFetched: notesIsFetched,
    noteCount: notes.length,
    isError: notesIsError,
  });

  const folders = useMemo(
    () => mergeFoldersWithRegistry(buildFoldersFromNotes(notes), folderRegistryQuery.data ?? []),
    [notes, folderRegistryQuery.data],
  );
  const activeFolderBucketMemberCount = useMemo(() => {
    if (mode !== 'folders' || activeFolderKey === undefined) return null;
    return countNotesInFolderBucket(notes, activeFolderKey);
  }, [mode, activeFolderKey, notes]);
  const folderDrillMemberCountPrevRef = useRef<number | null>(null);

  useEffect(() => {
    folderDrillMemberCountPrevRef.current = null;
  }, [activeFolderKey]);

  useEffect(() => {
    if (activeFolderBucketMemberCount === null) {
      folderDrillMemberCountPrevRef.current = null;
      return;
    }
    const prev = folderDrillMemberCountPrevRef.current;
    if (prev !== null && prev > 0 && activeFolderBucketMemberCount === 0) {
      setActiveFolderKey(undefined);
      setQ('');
    }
    folderDrillMemberCountPrevRef.current = activeFolderBucketMemberCount;
  }, [activeFolderBucketMemberCount, setActiveFolderKey]);

  const scriptureBooks = scriptureQuery.data ?? [];

  const highlightsById = useMemo(() => {
    const m = new Map<string, PrototypeHighlightStudyThreadRow>();
    for (const row of highlightsQuery.data ?? []) m.set(row.id, row);
    return m;
  }, [highlightsQuery.data]);

  const resolveClusterTitle = useCallback(
    (cluster: StudyThreadCluster) =>
      resolveClusterListTitle(cluster, activeNoteFullId, queryClient, homeSpaceId),
    [activeNoteFullId, queryClient, homeSpaceId],
  );

  const filteredFolders = useMemo(() => {
    const t = q.trim().toLowerCase();
    const searched = !t ? folders : folders.filter((c) => (c.name ?? 'Unsorted').toLowerCase().includes(t));
    return applyFolderPinOrdering(searched, pinnedFolderIds);
  }, [folders, q, pinnedFolderIds]);

  const filteredThreads = useMemo(() => {
    const rows = studyThreadsQuery.data ?? [];
    const t = q.trim().toLowerCase();
    const searched = !t
      ? rows
      : rows.filter((cluster) => {
          const title = resolveClusterListTitle(cluster, activeNoteFullId, queryClient, homeSpaceId).toLowerCase();
          return title.includes(t);
        });
    return applyThreadClusterPinOrdering(searched, pinnedThreadClusterIds);
  }, [studyThreadsQuery.data, q, pinnedThreadClusterIds, activeNoteFullId, queryClient, homeSpaceId]);

  const filteredSharedThreads = useMemo(
    () => filterSharedSpaceThreads(groupThreadsQuery.data ?? [], q),
    [groupThreadsQuery.data, q],
  );

  const filteredHighlights = useMemo(() => {
    const rows = highlightsQuery.data ?? [];
    const t = q.trim().toLowerCase();
    const kindFiltered = rows.filter((r) => highlightKindMatches(highlightKindFilter, r.entryKind));
    const searched = !t
      ? kindFiltered
      : kindFiltered.filter((r) => {
          const hay = [
            r.focusTitle,
            r.anchorTextSnapshot,
            r.parentNoteTitle,
            r.miniNoteBody,
            r.sourceSnippet,
            r.scriptureReference,
            r.scripturePassageExcerpt,
          ]
            .join(' ')
            .toLowerCase();
          return hay.includes(t);
        });
    if (pinnedHighlightIds.length === 0) return searched;
    const pinnedSet = new Set(pinnedHighlightIds);
    const byId = new Map(searched.map((r) => [r.id, r]));
    const pinned: typeof searched = [];
    pinnedHighlightIds.forEach((id) => {
      const row = byId.get(id);
      if (row) pinned.push(row);
    });
    const unpinned = searched.filter((r) => !pinnedSet.has(r.id));
    return [...pinned, ...unpinned];
  }, [highlightsQuery.data, q, highlightKindFilter, pinnedHighlightIds]);

  /*
    Highlights select in their own right: the ids in the store are highlight
    ids, and the bar below offers what a highlight can actually take. The kind
    is what keeps the two from being confused for one another.
  */
  const highlightSelectionActive =
    sidebarSelectMode || (sidebarSelectionKind === 'highlight' && sidebarSelectedIds.length > 0);
  const selectedHighlightIdSet = useMemo(
    () => new Set(highlightSelectionActive ? sidebarSelectedIds : []),
    [highlightSelectionActive, sidebarSelectedIds],
  );
  /** In list order, so a range means what the eye means by it. */
  const selectableHighlightIds = useMemo(
    () =>
      filteredHighlights
        .filter((r) => r.isOwnHighlight !== false || !isScopedSharedSpace)
        .map((r) => r.id)
        .slice(0, NOTE_SELECTION_CAP),
    [filteredHighlights, isScopedSharedSpace],
  );
  const toggleHighlightSelected = useCallback(
    (id: string) => {
      selectionAnchorRef.current = id;
      /* Switching kind starts a fresh set — see `sidebarSelectionKind`. */
      const base = sidebarSelectionKind === 'highlight' ? sidebarSelectedIds : [];
      setSidebarSelection('highlight', toggleNoteSelection(base, id));
    },
    [sidebarSelectionKind, sidebarSelectedIds, setSidebarSelection],
  );
  const selectHighlightRangeTo = useCallback(
    (id: string) => {
      const base = sidebarSelectionKind === 'highlight' ? sidebarSelectedIds : [];
      setSidebarSelection(
        'highlight',
        extendNoteSelectionRange({
          selected: base,
          orderedIds: selectableHighlightIds,
          anchorId: selectionAnchorRef.current,
          targetId: id,
        }),
      );
      selectionAnchorRef.current = id;
    },
    [sidebarSelectionKind, sidebarSelectedIds, selectableHighlightIds, setSidebarSelection],
  );

  /**
   * What a batch of highlights can take.
   *
   * Pin is local to this device (`proto-pinned-stores`), so it fans out for
   * free. Delete goes one request per highlight — at a cap of 50 a batch
   * endpoint would be machinery for a rounding error, and the per-row mutation
   * already invalidates correctly.
   */
  const highlightBulkBar = (
    <div className="proto-collection-grid-actions proto-bulk-bar">
      <button
        type="button"
        className="proto-bulk-bar__btn"
        title="Pin these highlights"
        onClick={(e) => runCollectionCommand('highlight', 'organize.pin', e.currentTarget)}
      >
        <Icon name="thumbtack" size={15} aria-hidden />
        <span className="proto-bulk-bar__label">Pin</span>
      </button>
      <button
        type="button"
        className="proto-bulk-bar__btn proto-bulk-bar__btn--danger"
        title="Delete these highlights"
        onClick={(e) => runCollectionCommand('highlight', 'organize.delete', e.currentTarget)}
      >
        <Icon name="trash-can" size={15} aria-hidden />
        <span className="proto-bulk-bar__label">Delete</span>
      </button>
    </div>
  );

  /* "Select all" means the list you are looking at, whatever kind it holds. */
  const selectAllTargets =
    sidebarSelectionKind === 'highlight' && selectionActive
      ? selectableHighlightIds
      : selectableNotes.map((n) => n.id);
  const toggleSelectAll = useCallback(() => {
    const kind = selectionActive ? sidebarSelectionKind : 'note';
    setSidebarSelection(kind, allSelectableSelected ? [] : selectAllTargets);
  }, [allSelectableSelected, selectAllTargets, selectionActive, sidebarSelectionKind, setSidebarSelection]);

  /**
   * The keyboard's half of selecting and organizing.
   *
   * One rule decides what a verb points at: **the selection when one stands, otherwise the
   * row holding keyboard focus**. That is what makes "act on this row" and "act on these
   * fifty" one code path rather than two features that drift.
   *
   * Enablement is not re-derived here — `availablePrototypeCommands` runs the same
   * `everyRowAllows` gate the bulk bar and the row menu read, so a chord can never reach a
   * mutation the button for it would have greyed out.
   *
   * Organize verbs are notes-only for now. `select` and `selectAll` follow the checkbox
   * wherever it goes, which today means notes and highlights; the folder, Thread and
   * resource lists still enter selection from the list menu and act from their own bars.
   */

  /**
   * The target a verb points at, read fresh each time.
   *
   * Not memoised, and not state: half of it is which row holds keyboard focus, and focus
   * moves without re-rendering. A snapshot taken at render time would answer for the row
   * you were on two ⇧↓ ago.
   *
   * Returns null when there is nothing to act on, or when a selection of some other kind
   * is standing — a highlight selection must not be retargeted by a note verb.
   */
  const buildCommandContext = useCallback((): CommandContext | null => {
    const container = scrollRootRef.current;
    if (!container) return null;
    const focused = focusedListRow(container);

    const fromSelection = sidebarSelectedIds.length > 0;
    if (fromSelection && sidebarSelectionKind !== 'note') return null;
    if (!fromSelection && focused?.kind !== 'note') return null;

    const ids = fromSelection ? sidebarSelectedIds : focused ? [focused.id] : [];
    if (ids.length === 0) return null;

    const idSet = new Set(ids);
    const rows = notesForMode.filter((n) => idSet.has(n.id));
    /* A row scrolled out of the loaded page has no capability input, and guessing one is
       how a batch half-applies. Offer nothing rather than act on part of it. */
    if (rows.length !== ids.length) return null;

    return {
      kind: 'note',
      ...singleKindCommandParts('note', ids),
      ids,
      rows: rows.map((n) => ({
        isOwnNote: n.isOwnNote,
        isScopedSharedSpace,
        viewerIsSpaceOwner,
      })),
      fromSelection,
      isScopedSharedSpace,
    };
  }, [
    sidebarSelectedIds,
    sidebarSelectionKind,
    notesForMode,
    isScopedSharedSpace,
    viewerIsSpaceOwner,
  ]);

  /**
   * Run one command against a context, reusing the sheets and confirms the bulk bar opens.
   *
   * Enablement is checked here rather than trusted from the caller: the Library panel filters
   * its Actions rows by `availablePrototypeCommands`, but a chord arrives unfiltered, and both
   * should meet the same gate.
   */
  const runCommand = useCallback(
    (commandId: PrototypeCommandId, ctx: CommandContext) => {
      /* Confirms anchor to what you are acting on — the focused row, or the list itself
         when a whole set is in play and no single row is the subject. Enablement is
         re-checked by the host, which is also where a chord arrives. */
      const anchorRect =
        (document.activeElement instanceof HTMLElement
          ? document.activeElement.getBoundingClientRect()
          : null) ??
        scrollRootRef.current?.getBoundingClientRect() ??
        null;
      organize?.run(commandId, ctx, { anchorRect });
    },
    [organize],
  );

  /**
   * The keyboard's half of selecting and organizing.
   *
   * One rule decides what a verb points at: **the selection when one stands, otherwise the
   * row holding keyboard focus**. That is what makes "act on this row" and "act on these
   * fifty" one code path rather than two features that drift.
   *
   * Organize verbs are notes-only for now. `select` and `selectAll` follow the checkbox
   * wherever it goes, which today means notes and highlights; the folder, Thread and
   * resource lists still enter selection from the list menu and act from their own bars.
   */
  const runListVerb = useCallback(
    (verb: string) => {
      const container = scrollRootRef.current;
      if (!container) return;

      if (verb === 'selectAll') {
        if (selectAllTargets.length > 0) toggleSelectAll();
        return;
      }

      if (verb === 'select') {
        const focused = focusedListRow(container);
        if (!focused) return;
        if (focused.kind === 'highlight') toggleHighlightSelected(focused.id);
        else toggleNoteSelected(focused.id);
        return;
      }

      const commandId = PROTOTYPE_COMMAND_BY_VERB[verb];
      if (!commandId) return;
      const ctx = buildCommandContext();
      if (!ctx) return;
      runCommand(commandId, ctx);
    },
    [
      selectAllTargets.length,
      toggleSelectAll,
      toggleHighlightSelected,
      toggleNoteSelected,
      buildCommandContext,
      runCommand,
    ],
  );

  useEffect(() => {
    const onListVerb = (event: Event) => {
      const verb = (event as CustomEvent<{ verb?: string }>).detail?.verb;
      if (verb) runListVerb(verb);
    };
    window.addEventListener('prototypeShortcutListVerb', onListVerb);
    return () => window.removeEventListener('prototypeShortcutListVerb', onListVerb);
  }, [runListVerb]);

  /**
   * What ⇧K offers under "Actions". The palette is mounted by the shell, so it cannot see
   * this list's selection directly — see `prototype-command-context-store`.
   *
   * Published once, through refs. Publishing the callbacks themselves re-ran this on every
   * render — `runCommand` depends on the mutation object from `usePinSpaceNote()`, whose
   * identity is new each time — and each publish notifies the store, so every subscriber
   * re-rendered continuously. The store only ever calls these on demand, so a stable
   * wrapper over a ref is all it needs.
   */
  const buildCommandContextRef = useRef(buildCommandContext);
  const runCommandRef = useRef(runCommand);
  buildCommandContextRef.current = buildCommandContext;
  runCommandRef.current = runCommand;

  useEffect(
    () =>
      publishPrototypeCommandContext(
        () => buildCommandContextRef.current(),
        (id) => {
          const ctx = buildCommandContextRef.current();
          if (ctx) runCommandRef.current(id, ctx);
        },
      ),
    [],
  );

  const filteredScriptureBooks = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return scriptureBooks;
    return scriptureBooks.filter((b) => {
      if (b.title.toLowerCase().includes(t)) return true;
      return b.passages.some((p) => {
        if (p.displayRef.toLowerCase().includes(t)) return true;
        return p.notes.some((n) => (n.title ?? '').toLowerCase().includes(t));
      });
    });
  }, [scriptureBooks, q]);

  const passagesForDrill = useMemo(() => {
    if (scriptureDrill.level !== 'passages') return [];
    const book = scriptureBooks.find((b) => b.bookOrder === scriptureDrill.bookOrder);
    const passages = book?.passages ?? [];
    const t = q.trim().toLowerCase();
    if (!t) return passages;
    return passages.filter((p) => {
      if (p.displayRef.toLowerCase().includes(t)) return true;
      return p.notes.some((n) => (n.title ?? '').toLowerCase().includes(t));
    });
  }, [scriptureBooks, scriptureDrill, q]);

  /**
   * Every note citing anywhere in the drilled book. One note can cite several
   * passages in the same book, so dedupe by id — the passage list counts a note
   * once per passage, this list counts it once per book.
   */
  const notesForScriptureBook = useMemo(() => {
    if (scriptureDrill.level !== 'passages') return [];
    const book = scriptureBooks.find((b) => b.bookOrder === scriptureDrill.bookOrder);
    if (!book) return [];
    const byId = new Map<string, (typeof book.passages)[number]['notes'][number]>();
    for (const passage of book.passages) {
      for (const note of passage.notes) {
        if (!byId.has(note.id)) byId.set(note.id, note);
      }
    }
    const t = q.trim().toLowerCase();
    const deduped = [...byId.values()];
    const filtered = !t ? deduped : deduped.filter((n) => (n.title ?? '').toLowerCase().includes(t));
    return sortDrillNoteBriefsByLastUpdated(filtered, notesById);
  }, [scriptureBooks, scriptureDrill, q, notesById]);

  const notesForScripturePassage = useMemo(() => {
    if (scriptureDrill.level !== 'notes') return [];
    const book = scriptureBooks.find((b) => b.bookOrder === scriptureDrill.bookOrder);
    const passage = book?.passages.find((p) => p.passageKey === scriptureDrill.passageKey);
    const noteRows = passage?.notes ?? [];
    const t = q.trim().toLowerCase();
    const filtered = !t
      ? noteRows
      : noteRows.filter((n) => (n.title ?? '').toLowerCase().includes(t));
    return sortDrillNoteBriefsByLastUpdated(filtered, notesById);
  }, [scriptureBooks, scriptureDrill, q, notesById]);

  const threadDrillRepNoteId =
    threadDrillQuery.data?.repNoteId ??
    (sidebarThreadDrilldownId ? normalizeNoteIdFromParam(sidebarThreadDrilldownId) : '');

  const threadDrillNodesSorted = useMemo(() => {
    const nodes = threadDrillQuery.data?.nodes ?? [];
    const edges = threadDrillQuery.data?.edges ?? [];
    if (nodes.length === 0) return nodes;
    return resolveStudyThreadMemberOrder(
      nodes,
      edges,
      threadDrillRepNoteId,
      threadDrillQuery.data?.memberOrder ?? null,
    );
  }, [
    threadDrillQuery.data?.nodes,
    threadDrillQuery.data?.edges,
    threadDrillQuery.data?.memberOrder,
    threadDrillRepNoteId,
  ]);

  const threadDrillOrderedIds = useMemo(
    () => threadDrillNodesSorted.map((node) => node.id),
    [threadDrillNodesSorted],
  );

  const threadDrillDrag = useStudyThreadMemberDragReorder({
    anchorNoteId: sidebarThreadDrilldownId ? normalizeNoteIdFromParam(sidebarThreadDrilldownId) : '',
    spaceId: homeSpaceId,
    orderedNoteIds: threadDrillOrderedIds,
    enabled: Boolean(sidebarThreadDrilldownId && homeSpaceId && threadDrillOrderedIds.length > 1),
  });

  const threadDrillDisplayNodes = useMemo(
    () => orderStudyThreadNodesByIds(threadDrillNodesSorted, threadDrillDrag.displayOrderedIds),
    [threadDrillNodesSorted, threadDrillDrag.displayOrderedIds],
  );

  const scriptureNotesPassageTitle =
    scriptureDrill.level === 'notes'
      ? scriptureBooks
          .find((b) => b.bookOrder === scriptureDrill.bookOrder)
          ?.passages.find((p) => p.passageKey === scriptureDrill.passageKey)?.displayRef ?? ''
      : '';

  const activeSearchContext = useMemo((): ActiveSearchContext => {
    const bookTitle =
      scriptureDrill.level !== 'books'
        ? scriptureBooks.find((b) => b.bookOrder === (scriptureDrill as { bookOrder: number }).bookOrder)?.title
        : undefined;
    if (scriptureDrill.level === 'books') {
      return {
        mode,
        folderDrill: activeFolderKey,
        threadDrillId: sidebarThreadDrilldownId,
        threadDrillTitle: threadDrillQuery.data?.threadTitle ?? threadDrillQuery.data?.suggestedTitle ?? undefined,
        scriptureDrill: { level: 'books' },
        highlightKindFilter,
      };
    }
    if (scriptureDrill.level === 'passages') {
      return {
        mode,
        folderDrill: activeFolderKey,
        threadDrillId: sidebarThreadDrilldownId,
        threadDrillTitle: threadDrillQuery.data?.threadTitle ?? threadDrillQuery.data?.suggestedTitle ?? undefined,
        scriptureDrill: { level: 'passages', bookOrder: scriptureDrill.bookOrder, bookTitle },
        highlightKindFilter,
      };
    }
    return {
      mode,
      folderDrill: activeFolderKey,
      threadDrillId: sidebarThreadDrilldownId,
      threadDrillTitle: threadDrillQuery.data?.threadTitle ?? threadDrillQuery.data?.suggestedTitle ?? undefined,
      scriptureDrill: {
        level: 'notes',
        bookOrder: scriptureDrill.bookOrder,
        passageKey: scriptureDrill.passageKey,
        passageTitle: scriptureNotesPassageTitle,
      },
      highlightKindFilter,
    };
  }, [
    mode,
    activeFolderKey,
    sidebarThreadDrilldownId,
    threadDrillQuery.data,
    scriptureDrill,
    scriptureBooks,
    scriptureNotesPassageTitle,
    highlightKindFilter,
  ]);

  const universalSearchData = useMemo(
    () => ({
      notes,
      folders,
      highlights: highlightsQuery.data ?? [],
      scriptureBooks,
      threadClusters: studyThreadsQuery.data ?? [],
      threadDrillNodes: threadDrillQuery.data?.nodes ?? [],
    }),
    [notes, folders, highlightsQuery.data, scriptureBooks, studyThreadsQuery.data, threadDrillQuery.data?.nodes],
  );

  const myHomeNotesById = useMemo(() => {
    const map = new Map<string, SpaceNoteRow>();
    for (const row of myHomeNotes) map.set(row.id, row);
    return map;
  }, [myHomeNotes]);

  const myHomeHighlightsById = useMemo(() => {
    const map = new Map<string, PrototypeHighlightStudyThreadRow>();
    for (const row of myHomeHighlightsQuery.data ?? []) map.set(row.id, row);
    return map;
  }, [myHomeHighlightsQuery.data]);

  const myHomeFolders = useMemo(() => {
    if (!myHomeCrossSearchEnabled) return [];
    const fromNotes = buildFoldersFromNotes(myHomeNotes);
    return mergeFoldersWithRegistry(fromNotes, myHomeFolderRegistryQuery.data ?? []);
  }, [myHomeCrossSearchEnabled, myHomeNotes, myHomeFolderRegistryQuery.data]);

  // `data` is already ScriptureIndexBook[] — the queryFn returns `res.books ?? []`.
  // Reading `.books` off an array gave undefined, and `?? []` turned that into a
  // permanently empty list, so My Home cross-space search never returned a scripture book.
  const myHomeScriptureBooks = myHomeScriptureQuery.data ?? [];

  const myHomeUniversalSearchData = useMemo(
    () => ({
      notes: myHomeNotes,
      folders: myHomeFolders,
      highlights: myHomeHighlightsQuery.data ?? [],
      scriptureBooks: myHomeScriptureBooks,
      threadClusters: myHomeStudyThreadsQuery.data ?? [],
      threadDrillNodes: [],
    }),
    [
      myHomeNotes,
      myHomeFolders,
      myHomeHighlightsQuery.data,
      myHomeScriptureBooks,
      myHomeStudyThreadsQuery.data,
    ],
  );

  const prefetchNote = useCallback(
    (row: SpaceNoteRow, opts?: { seedFromList?: boolean }) => {
      if (!homeSpaceId) return;
      // Skip the seed + /details prefetch entirely when we already hold a fresh,
      // full (non-preview) detail in cache — avoids a hover refetch storm.
      const noteQueryKey = getNoteQueryOptions(row.id).queryKey;
      const cachedDetail = queryClient.getQueryData(noteQueryKey) as
        | { __contentIsPreview?: boolean }
        | undefined;
      const state = queryClient.getQueryState(noteQueryKey);
      const isFresh = state ? Date.now() - state.dataUpdatedAt < 30_000 : false;
      if (cachedDetail && cachedDetail.__contentIsPreview === false && isFresh) return;
      const seedFromList = opts?.seedFromList !== false;
      const listSeed: ListNoteForSeed = {
        id: row.id,
        title: row.title ?? '',
        content: row.content ?? '',
        // Stored length, so the seed can tell a complete short note from a prefix.
        contentLength: row.contentLength ?? null,
        noteType: (row.noteType as ListNoteForSeed['noteType']) || 'default',
        contentEncrypted: row.contentEncrypted === true,
        resourceTitle: row.resourceTitle ?? null,
        userId: row.authorUserId ?? row.userId,
        isOwnNote: row.isOwnNote,
        threadId: 'thread_unorganized',
        spaceId: homeSpaceId,
        createdAt: row.createdAt ?? undefined,
        updatedAt: row.updatedAt ?? undefined,
        simpleNoteId: row.simpleNoteId ?? undefined,
        primaryCollection: row.primaryCollection ?? null,
        secondaryCollections:
          row.secondaryCollections?.length ? [...row.secondaryCollections] : undefined,
        collectionPinned: row.collectionPinned ?? false,
        collectionUserOverride: row.collectionUserOverride ?? false,
        version: row.version,
      };
      if (seedFromList) {
        seedNoteFromList(queryClient, listSeed, {
          id: 'thread_unorganized',
          title: '',
          color: null,
          backgroundGradient: '',
        });
      }
      void queryClient.prefetchQuery(getNoteQueryOptions(row.id)).catch(() => {});
    },
    [queryClient, homeSpaceId],
  );

  const prefetchProposalNote = useCallback(
    (row: SpaceNoteRow, opts?: { seedFromList?: boolean }) => {
      if (!notesById.has(row.id)) return;
      prefetchNote(row, opts);
    },
    [notesById, prefetchNote],
  );

  const afterNav = useCallback(() => {
    if (isMobileSidebar) closeDrawer({ preserveHistory: true });
  }, [closeDrawer, isMobileSidebar]);

  const onNoteRow = (row: SpaceNoteRow) => {
    if (!homeSpaceId) return;
    prefetchNote(row);
    navigate({
      to: prototypeNoteRouteTo(),
      params: { noteId: noteParamSlug(row.id) },
      search: prototypeNoteListNavigationSearch({
        isScopedSharedSpace,
        spaceId: homeSpaceId,
      }),
    });
    afterNav();
  };

  /** Shared by the book-level and passage-level Scripture note lists — same rows, same behavior. */
  const renderScriptureNoteList = (
    briefs: { id: string; title: string | null; updatedAt: string | null; createdAt: string }[],
  ) => {
    // Row actions are space-scoped; with no space there is nothing to act on. The
    // scripture index can't have loaded without one, so this is a type guard only.
    if (!homeSpaceId) return null;
    return (
    <ul className="proto-note-list">
      {briefs.map((n) => (
        <PrototypeSidebarNoteRow
          key={n.id}
          row={resolveDrillNoteRow({
            id: n.id,
            title: n.title,
            updatedAt: n.updatedAt,
            createdAt: n.createdAt,
          })}
          active={!!(activeNoteFullId && n.id === activeNoteFullId)}
          homeSpaceId={homeSpaceId}
          activeNoteFullId={activeNoteFullId}
          isScopedSharedSpace={isScopedSharedSpace}
          sharedSpaceMemberByUserId={sharedSpaceMemberByUserId}
          viewerIsSpaceOwner={viewerIsSpaceOwner}
          selectMode={noteSelectionActive}
          selectable
          selected={selectedNoteIdSet.has(n.id)}
          onToggleSelected={toggleNoteSelected}
          onSelectRangeTo={selectRangeTo}
          prefetchNote={prefetchNote}
          onOpenNote={(r) => {
            onNoteRow(r);
          }}
        />
      ))}
    </ul>
    );
  };

  const deleteHighlight = useDeleteHighlight();
  const removeFolder = useRemoveFolder();

  /*
    Folders select by *name*, which is what identifies one everywhere else in
    this file — `useRemoveFolder` takes a folderName, and the pin store keys on
    `folderRowId(name)`. "Unsorted" has no name and is not a thing you can act
    on, so it never carries a checkbox.
  */
  const folderSelectionActive =
    sidebarSelectMode || (sidebarSelectionKind === 'folder' && sidebarSelectedIds.length > 0);
  const folderSelectedIdSet = useMemo(
    () => new Set(folderSelectionActive ? sidebarSelectedIds : []),
    [folderSelectionActive, sidebarSelectedIds],
  );
  const toggleFolderSelected = useCallback(
    (name: string) => {
      if (!name) return;
      const base = sidebarSelectionKind === 'folder' ? sidebarSelectedIds : [];
      setSidebarSelection('folder', toggleNoteSelection(base, name));
    },
    [sidebarSelectionKind, sidebarSelectedIds, setSidebarSelection],
  );

  /**
   * Deleting folders in bulk strips the label from their notes — the notes
   * themselves are never touched, which is what `useRemoveFolder` already means
   * and why the confirm says so.
   */

  const folderBulkBar = (
    <div className="proto-collection-grid-actions proto-bulk-bar">
      <button
        type="button"
        className="proto-bulk-bar__btn"
        title="Pin these folders"
        onClick={(e) => runCollectionCommand('folder', 'organize.pin', e.currentTarget)}
      >
        <Icon name="thumbtack" size={15} aria-hidden />
        <span className="proto-bulk-bar__label">Pin</span>
      </button>
      <button
        type="button"
        className="proto-bulk-bar__btn proto-bulk-bar__btn--danger"
        title="Remove these folders — the notes in them stay"
        onClick={(e) => runCollectionCommand('folder', 'organize.delete', e.currentTarget)}
      >
        <Icon name="trash-can" size={15} aria-hidden />
        <span className="proto-bulk-bar__label">Delete</span>
      </button>
    </div>
  );
  const removeThreadCluster = useRemoveThreadCluster();

  /*
    Threads select by cluster id. Removing one takes its member notes out of the
    cluster — the notes stay, which is what `useRemoveThreadCluster` means and
    why the confirm says so rather than calling it a delete.
  */
  const threadSelectionActive =
    sidebarSelectMode || (sidebarSelectionKind === 'thread' && sidebarSelectedIds.length > 0);
  const threadSelectedIdSet = useMemo(
    () => new Set(threadSelectionActive ? sidebarSelectedIds : []),
    [threadSelectionActive, sidebarSelectedIds],
  );
  const toggleThreadSelected = useCallback(
    (id: string) => {
      const base = sidebarSelectionKind === 'thread' ? sidebarSelectedIds : [];
      setSidebarSelection('thread', toggleNoteSelection(base, id));
    },
    [sidebarSelectionKind, sidebarSelectedIds, setSidebarSelection],
  );


  const threadBulkBar = (
    <div className="proto-collection-grid-actions proto-bulk-bar">
      <button
        type="button"
        className="proto-bulk-bar__btn"
        title="Pin these Threads"
        onClick={(e) => runCollectionCommand('thread', 'organize.pin', e.currentTarget)}
      >
        <Icon name="thumbtack" size={15} aria-hidden />
        <span className="proto-bulk-bar__label">Pin</span>
      </button>
      <button
        type="button"
        className="proto-bulk-bar__btn proto-bulk-bar__btn--danger"
        title="Break these Threads apart — the notes stay"
        onClick={(e) => runCollectionCommand('thread', 'organize.delete', e.currentTarget)}
      >
        <Icon name="trash-can" size={15} aria-hidden />
        <span className="proto-bulk-bar__label">Remove</span>
      </button>
    </div>
  );
  const deleteSharedThread = useDeleteSharedThread();
  const setCurrentSpaceThread = useSetCurrentSpaceThread();
  const [sharedThreadDeleteTarget, setSharedThreadDeleteTarget] = useState<{
    thread: SpaceGroupStudyThread;
    anchorRect: DOMRect;
  } | null>(null);

  const onRequestDeleteFolder = (folder: FolderBucket, anchorRect: DOMRect) => {
    if (!folder.name) return;
    setFolderDeleteTarget({ name: folder.name, count: folder.count, anchorRect });
  };

  const onConfirmDeleteFolder = () => {
    if (!homeSpaceId || !folderDeleteTarget) return;
    const { name } = folderDeleteTarget;
    removeFolder.mutate(
      { spaceId: homeSpaceId, folderName: name },
      {
        onSuccess: () => {
          setFolderDeleteTarget(null);
          setPinnedFolderIds(removePinnedFolderId(homeSpaceId, name));
          if (activeFolderKey === name) {
            setActiveFolderKey(undefined);
            setQ('');
          }
        },
        onError: (err) => {
          setFolderDeleteTarget(null);
          toastError(err, 'Could not delete folder');
        },
      },
    );
  };

  const onRequestDeleteThreadCluster = (cluster: StudyThreadCluster, title: string, anchorRect: DOMRect) => {
    setThreadDeleteTarget({ cluster, title, anchorRect });
  };

  const onConfirmDeleteThreadCluster = () => {
    if (!homeSpaceId || !threadDeleteTarget) return;
    const { cluster } = threadDeleteTarget;
    removeThreadCluster.mutate(
      { spaceId: homeSpaceId, memberIds: cluster.memberIds },
      {
        onSuccess: () => {
          setThreadDeleteTarget(null);
          setPinnedThreadClusterIds(removePinnedThreadClusterId(homeSpaceId, cluster.id));
          const drillSlug = threadClusterDrillSlug(cluster.id);
          if (sidebarThreadDrilldownId === drillSlug) {
            setSidebarThreadDrilldownId(undefined);
            setQ('');
          }
        },
        onError: (err) => {
          setThreadDeleteTarget(null);
          toastError(err, 'Could not delete Thread');
        },
      },
    );
  };

  const onConfirmDeleteSharedThread = () => {
    if (!homeSpaceId || !sharedThreadDeleteTarget) return;
    const { thread } = sharedThreadDeleteTarget;
    deleteSharedThread.mutate(
      { spaceId: homeSpaceId, threadId: thread.id },
      {
        onSuccess: () => {
          setSharedThreadDeleteTarget(null);
          if (sidebarThreadDrilldownId === thread.id) {
            setSidebarThreadDrilldownId(undefined);
            setQ('');
          }
          toast.success('Thread deleted');
        },
        onError: (err) => {
          setSharedThreadDeleteTarget(null);
          toastError(err, 'Could not delete Thread');
        },
      },
    );
  };

  const composeInSharedThread = (threadId: string) => {
    if (!homeSpaceId) return;
    if (isMobileSidebar) closeDrawer({ preserveHistory: true });
    beginComposeInGroupThread(homeSpaceId, threadId, beginPrototypeComposeSession);
    navigate({ to: prototypeHomeRouteTo() });
  };

  const onRequestDeleteHighlight = (r: PrototypeHighlightStudyThreadRow, anchorRect: DOMRect) => {
    setHighlightDeleteTarget({ row: r, anchorRect });
  };

  const onConfirmDeleteHighlight = () => {
    if (!homeSpaceId || !highlightDeleteTarget) return;
    const { row } = highlightDeleteTarget;
    deleteHighlight.mutate(
      { id: row.id, spaceId: homeSpaceId, parentNoteId: row.parentNoteId },
      {
        onSuccess: () => setHighlightDeleteTarget(null),
        onError: (err) => {
          setHighlightDeleteTarget(null);
          toastError(err, 'Could not delete highlight');
        },
      },
    );
  };

  /**
   * One request per highlight, awaited in order.
   *
   * At a cap of 50 a batch endpoint would be machinery for a rounding error,
   * and a partial failure has to leave the ones that did delete deleted — so
   * the selection is cleared regardless and the error names what stalled.
   */

  /**
   * @returns whether this landed on a document in the main pane. The recall shelf stacks a
   * breadcrumb edge over whatever a suggestion opened, and it can only do that once it knows
   * something opened — a highlight with no source note and no space leaves you where you
   * were, and an edge there would name a way back to the page you are still on.
   */
  const onHighlightRow = (r: PrototypeHighlightStudyThreadRow): boolean => {
    if (!homeSpaceId) return false;
    // Deliberately no `if (!r.parentNoteId) return;` here. That guard used to sit at the top and
    // made a highlight with no source note do nothing at all on tap — no navigation, no
    // fallback, no message — while also rendering the no-source-note fallback further down
    // unreachable. The parent note is only required by the branches that actually anchor to
    // one; each checks for itself.
    //
    // Same space scoping as onNoteRow — a note reachable only through a shared space 404s
    // ("Note not found") if the dock deep-link drops `?space=`.
    const navSearch = prototypeNoteListNavigationSearch({
      isScopedSharedSpace,
      spaceId: homeSpaceId,
    });
    if (r.parentNoteId) {
      void queryClient.prefetchQuery(getNoteQueryOptions(r.parentNoteId, navSearch.space)).catch(() => {});
    }
    if (isScripturePassageHighlightRow(r)) {
      const canon = (r.scriptureReference ?? '').trim();
      const trans = (r.scripturePassageTranslation ?? '').trim();
      if (canon && trans) {
        // Open the scripture dock from the source note instance (parity with tapping the
        // note's own reference pill).
        if (r.parentNoteId) {
          navigate({
            to: prototypeNoteRouteTo(),
            params: { noteId: noteParamSlug(r.parentNoteId) },
            search: {
              ...navSearch,
              scriptureRef: canon,
              scriptureTranslation: trans,
              studyThread: r.id,
              dockReq: String(Date.now()),
            },
          });
          afterNav();
          return true;
        }
        // No source note to anchor a dock to — open the passage in the reader itself, the
        // same surface a bare scripture reference always reads on.
        const readerRoute = readerRouteForReference(canon, trans);
        if (readerRoute) {
          navigate(readerRoute);
          afterNav();
          return true;
        }
        afterNav();
        return false;
      }
    }
    /*
     * A reference saved while reading has no note behind it, so it opens where it was made:
     * the chapter, with the word's card already up. Without this it fell through to the guard
     * below and did nothing at all on tap — the row was in the list but led nowhere.
     */
    if (!r.parentNoteId && r.entryKind === 'reference') {
      const word = (r.sourceSnippet ?? '').trim();
      const parsed = r.scriptureReference ? parseScriptureReference(r.scriptureReference) : null;
      if (word && parsed) {
        if (isMobileSidebar) closeDrawer({ preserveHistory: true });
        void navigate({
          to: prototypeReadRouteTo(),
          params: { book: bookSlug(parsed.book), chapter: String(parsed.chapter) },
          search: {
            v: typeof parsed.verse === 'number' ? String(parsed.verse) : undefined,
            t: r.scripturePassageTranslation || undefined,
            ref: word,
            // Same row tapped twice has to land and reopen the card again, so the request
            // needs to differ — the router treats an identical URL as no navigation at all.
            req: String(Date.now()),
          },
        });
        afterNav();
      }
      // Nothing was stacked over anything — the reader is the document here.
      return false;
    }
    // The highlight dock lives inside a note, so without a source note there is nothing to
    // open it on.
    if (!r.parentNoteId) return false;
    const isReferenceRow = r.entryKind === 'reference';
    navigate({
      to: prototypeNoteRouteTo(),
      params: { noteId: noteParamSlug(r.parentNoteId) },
      // Reference rows open the reference dock (via `reference`); all other highlight kinds open the
      // highlight dock (via `highlight`), so the tap lands on a dock rather than just the note.
      search: isReferenceRow
        ? { ...navSearch, studyThread: r.id, reference: r.sourceSnippet || '', dockReq: String(Date.now()) }
        : { ...navSearch, highlight: r.id, dockReq: String(Date.now()) },
    });
    afterNav();
    return true;
  };

  /**
   * Open a library resource.
   *
   * The study dock is per-note, so a resource chip only has somewhere to live
   * when a note is open — tapping a row from the home list has no dock to dock
   * to, and jumping to an arbitrary note to hold the chip would be worse than
   * just following the link. So: dock it when we're on a note, open it
   * otherwise.
   */
  const onResourceRow = (item: LibraryItem) => {
    if (isPrototypeNotePath(pathname) && activeNoteFullId) {
      const navSearch = prototypeNoteListNavigationSearch({
        isScopedSharedSpace,
        spaceId: homeSpaceId ?? '',
      });
      navigate({
        to: prototypeNoteRouteTo(),
        params: { noteId: noteParamSlug(activeNoteFullId) },
        search: { ...navSearch, libItem: item.id, dockReq: String(Date.now()) },
      });
      afterNav();
      return;
    }
    if (item.kind === 'file') {
      void openLibraryFileItem(item.id);
      return;
    }
    if (item.sourceUrl) window.open(item.sourceUrl, '_blank', 'noopener,noreferrer');
  };

  const isSearchResultActive = useCallback(
    (result: SidebarSearchResult) => {
      if (result.kind === 'note' && result.noteId) {
        return !!activeNoteFullId && result.noteId === activeNoteFullId;
      }
      if (result.kind === 'highlight') {
        return false;
      }
      return false;
    },
    [activeNoteFullId],
  );

  const onActivateSearchResult = useCallback(
    (result: SidebarSearchResult) => {
      if (!homeSpaceId) return;
      // Selecting a result should leave search mode entirely: clear the query (and any tag filter)
      // so the sidebar returns to the normal list rather than keeping the note "attached" to the
      // search results. Clearing `q` also unmounts PrototypeSidebarSearchResults, which resets its
      // local 'active'/'elsewhere' scope so the next search no longer starts stuck on "Elsewhere".
      setQ('');
      setTagFilter(null);
      switch (result.kind) {
        case 'note': {
          if (!result.noteId) return;
          const loaded = notesById.get(result.noteId);
          onNoteRow(
            loaded ??
              ({
                id: result.noteId,
                title: result.title,
                content: '',
              } as SpaceNoteRow),
          );
          return;
        }
        case 'folder':
          setSidebarListMode('folders');
          setActiveFolderKey(result.folderKey ?? null);
          return;
        case 'threadCluster': {
          if (!result.threadClusterId) return;
          setSidebarListMode('threads');
          const slug = result.threadClusterId.startsWith('note_')
            ? result.threadClusterId.slice('note_'.length)
            : result.threadClusterId;
          setSidebarThreadDrilldownId(slug);
          return;
        }
        case 'highlight': {
          const row = result.highlightId ? highlightsById.get(result.highlightId) : undefined;
          if (row) onHighlightRow(row);
          return;
        }
        case 'scriptureBook':
          if (result.scriptureBookOrder == null) return;
          setSidebarListMode('scripture');
          setScriptureDrill({ level: 'passages', bookOrder: result.scriptureBookOrder });
          return;
        case 'scripturePassage':
          if (result.scriptureBookOrder == null || !result.scripturePassageKey) return;
          setSidebarListMode('scripture');
          setScriptureDrill({
            level: 'notes',
            bookOrder: result.scriptureBookOrder,
            passageKey: result.scripturePassageKey,
          });
          return;
        case 'scriptureReference': {
          // A row that names a passage has to show the passage. Drilling the sidebar to
          // its note list instead is the same mismatch the Home passage card used to
          // have — a scroll icon promising Scripture, delivering a list of notes.
          //
          // Opens the reader now that there is one. This row shipped against the standalone
          // passage pane because the reader did not exist yet; searching a chapter and landing
          // on the chapter is what it was always reaching for.
          if (!result.scriptureReference) return;
          const parsed = parseScriptureReference(result.scriptureReference);
          if (!parsed) return;
          void navigate({
            to: prototypeReadRouteTo(),
            params: { book: bookSlug(parsed.book), chapter: String(parsed.chapter) },
            // `scriptureFocusVerse` is set only when the query named a verse, so "John 15"
            // opens at the top of the chapter instead of scrolled to verse 1.
            search: {
              v: result.scriptureFocusVerse ? String(result.scriptureFocusVerse) : undefined,
              t: undefined,
              req: String(Date.now()),
            },
          });
          return;
        }
        default:
          return;
      }
    },
    [
      homeSpaceId,
      notesById,
      highlightsById,
      setSidebarListMode,
      setActiveFolderKey,
      setSidebarThreadDrilldownId,
      pathname,
      navigate,
    ],
  );

  const backTarget: { label: string; kind: string | null; action: () => void } | null = (() => {
    if (sidebarThreadProposal)
      return { label: 'Home', kind: null, action: closeThreadProposal };
    if (mode === 'folders' && activeFolderKey !== undefined)
      return { label: activeFolderKey ?? 'Unsorted', kind: 'Folder', action: () => { setActiveFolderKey(undefined); setQ(''); } };
    if (mode === 'threads' && sidebarThreadDrilldownId)
      return {
        label: threadDrillQuery.data?.threadTitle ?? threadDrillQuery.data?.suggestedTitle ?? 'Thread',
        kind: 'Thread',
        action: () => { setSidebarThreadDrilldownId(undefined); setQ(''); },
      };
    if (mode === 'scripture' && scriptureDrill.level === 'passages') {
      const bookTitle = scriptureBooks.find((b) => b.bookOrder === scriptureDrill.bookOrder)?.title ?? 'Book';
      return { label: bookTitle, kind: 'Book', action: () => { setScriptureDrill({ level: 'books' }); setQ(''); } };
    }
    if (mode === 'scripture' && scriptureDrill.level === 'notes') {
      const { bookOrder } = scriptureDrill;
      return { label: scriptureNotesPassageTitle || 'Passage', kind: 'Passage', action: () => { setScriptureDrill({ level: 'passages', bookOrder }); setQ(''); } };
    }
    return null;
  })();

  if (
    isScopedSharedSpace &&
    mode === 'threads' &&
    isSharedSpaceThreadDrillId(sidebarThreadDrilldownId) &&
    homeSpaceId
  ) {
    const drilled =
      (groupThreadsQuery.data ?? []).find((thread) => thread.id === sidebarThreadDrilldownId) ??
      ({
        id: sidebarThreadDrilldownId,
        title: 'Thread',
        isPinned: false,
        color: null,
      } as Pick<SpaceGroupStudyThread, 'id' | 'title' | 'isPinned' | 'color'>);
    return (
      <>
        <PrototypeSharedThreadDrilldown
          thread={drilled}
          spaceId={homeSpaceId}
          isOwner={canCreateSidebarCollections}
          canCompose={canComposeInSpace({
            type: activeSharedSpace?.type,
            orgId: activeSharedSpace?.orgId,
          })}
          backLabel={activeSharedSpace?.title?.trim() || 'Shared space'}
          onBack={() => {
            setSidebarThreadDrilldownId(undefined);
            setQ('');
          }}
          onCompose={() => composeInSharedThread(drilled.id)}
          onSetCurrent={async (threadId) => {
            await setCurrentSpaceThread.mutateAsync({ spaceId: homeSpaceId, threadId });
          }}
          onRequestDelete={
            canCreateSidebarCollections
              ? (anchorRect) => {
                  const full =
                    (groupThreadsQuery.data ?? []).find((thread) => thread.id === drilled.id) ??
                    ({
                      id: drilled.id,
                      title: drilled.title,
                      subtitle: null,
                      color: drilled.color ?? null,
                      spaceId: homeSpaceId,
                      isPinned: drilled.isPinned,
                      createdAt: '',
                      updatedAt: '',
                      noteCount: 0,
                      ownerUserId: '',
                      // Stand-in used only to name the Thread in a delete
                      // confirmation, so it carries no plan of its own.
                      mode: 'collection',
                      sequenceCurrentIndex: 0,
                      sequenceTotal: 0,
                    } satisfies SpaceGroupStudyThread);
                  setSharedThreadDeleteTarget({ thread: full, anchorRect });
                }
              : undefined
          }
        />
        {sharedThreadDeleteTarget ? (
          <ProtoConfirmDialog
            anchorRect={sharedThreadDeleteTarget.anchorRect}
            confirmLabel="Delete thread"
            busy={deleteSharedThread.isPending}
            onConfirm={onConfirmDeleteSharedThread}
            onCancel={() => {
              if (!deleteSharedThread.isPending) setSharedThreadDeleteTarget(null);
            }}
          />
        ) : null}
      </>
    );
  }

  return (
    <div
      className={`proto-sidebar-root${sidebarThreadProposal ? ' proto-sidebar-root--thread-review' : ''}`}
    >
      {isMobileSidebar ? <PrototypeSidebarToolbar variant="drawer" /> : null}
      {backTarget && !isHomeLayer ? (
        <div className="proto-sidebar-back-row">
          {/* Same back affordance as the shared-space Thread drilldown: a tile to press, with
              the name and its kind beside it. The tile is the target — the name is a heading,
              not a second control wearing the same job. */}
          <button
            type="button"
            className="proto-sidebar-back-tile"
            onClick={backTarget.action}
            aria-label={`Back to ${backTarget.label}`}
          >
            <Icon name="caret-left" size={16} aria-hidden />
          </button>
          <div className="proto-sidebar-back-row__meta">
            <span className="pds-list-title proto-sidebar-back-row__label">{backTarget.label}</span>
            {backTarget.kind ? (
              <p className="proto-caption proto-sidebar-back-row__kind">{backTarget.kind}</p>
            ) : null}
          </div>
          {showFolderAddNotes || showThreadAddNotes ? (
            <button
              type="button"
              className="proto-collection-grid-actions__btn"
              onClick={() => setAddNotesSheetOpen(true)}
              aria-label="Add notes"
              title="Add notes"
            >
              <Icon name="plus" size={12} aria-hidden />
              <span>Add notes</span>
            </button>
          ) : null}
        </div>
      ) : null}
      {showListSpaceScopeBar && !isHomeLayer ? (
        <div className="proto-sidebar-list-scope">
          <ProtoChipBar
            ariaLabel="List scope"
            options={[
              { id: 'space' as const, label: 'This space' },
              { id: 'my-home' as const, label: 'My Home', iconName: 'house' },
            ]}
            selectedId={sidebarListSpaceScope === 'my-home' ? 'my-home' : 'space'}
            onSelect={(id) => setSidebarListSpaceScope(id)}
          />
        </div>
      ) : null}
      {selectionActive ? (
        /*
          Sits above the search field rather than replacing it. The old bar took
          the search away to protect the selection from a changing list, but that
          also meant entering selection cost you the thing you were using to find
          what to select. Selection survives a filter now; the count says what
          you are holding, and Clear says how to stop.
        */
        <div className="proto-select-bar">
          <button
            type="button"
            className="proto-select-bar__action"
            onClick={toggleSelectAll}
            disabled={selectAllTargets.length === 0}
          >
            {allSelectableSelected ? 'Deselect all' : 'Select all'}
          </button>
          <span className="proto-select-bar__count">
            {sidebarSelectedIds.length === 1
              ? '1 selected'
              : `${sidebarSelectedIds.length} selected`}
          </span>
          <button
            type="button"
            className="proto-select-bar__action proto-select-bar__action--done"
            onClick={() => {
              setSidebarSelection(sidebarSelectionKind, []);
              setSidebarSelectMode(false);
            }}
          >
            Clear
          </button>
        </div>
      ) : null}
      {!isHomeLayer && !sidebarThreadProposal ? (
      <div className="proto-sidebar-search">
        <PrototypeSearchInput
          inputRef={searchInputRef}
          id="proto-sidebar-search-input"
          placeholder="Search"
          ariaLabel="Search"
          value={q}
          onChange={(next) => {
            setQ(next);
            if (tagFilter && next.trim().toLowerCase() !== tagFilter.tagName.trim().toLowerCase()) {
              setTagFilter(null);
            }
          }}
          onClear={() => {
            setQ('');
            setTagFilter(null);
          }}
          onKeyDown={(e) => {
            // Drop from the search field straight into the list results.
            if (e.key === 'ArrowDown') {
              const scrollRoot = scrollRootRef.current;
              if (scrollRoot && moveListRowFocus(scrollRoot, 1)) {
                e.preventDefault();
              }
            }
          }}
        />
      </div>
      ) : null}

      <div ref={scrollRootRef} className="proto-sidebar-scroll">
        {!homeSpaceId ? (
          navReady ? (
            <p className="proto-caption" style={{ padding: '14px 18px' }}>
              No My Home yet — finish setup in the classic app
            </p>
          ) : null
        ) : isHomeLayer && isScopedSharedSpace ? null : isHomeLayer ? (
          <PrototypeSidebarHomeView
            homeSpaceId={homeSpaceId}
            notes={notes}
            notesListPhase={notesListPhase}
            hasMoreNotes={!!hasNextPage}
            noteTotal={pages?.pages?.[0]?.total}
            scriptureBooks={scriptureBooks}
            scriptureSettled={!scriptureQuery.isPending || scriptureQuery.data != null}
            activeNoteId={activeNoteFullId}
            onOpenNote={onNoteRow}
            prefetchNote={prefetchNote}
            onOpenScriptureBook={(bookOrder) => {
              setScriptureDrill({ level: 'passages', bookOrder });
              setSidebarListMode('scripture');
              ensureSidebarExpanded();
            }}
            onOpenScripturePassage={(bookOrder, passageKey) => {
              setScriptureDrill({ level: 'notes', bookOrder, passageKey });
              setSidebarListMode('scripture');
              ensureSidebarExpanded();
            }}
            onOpenHighlight={onHighlightRow}
            onOpenCreateThreadPrefill={({ noteIds, threadName, onCreated }) => {
              openCreateThreadSheet({ noteIds, threadName, onCreated });
            }}
          />
        ) : sidebarThreadProposal ? (
          <PrototypeThreadProposalReview
            homeSpaceId={homeSpaceId}
            canCreate={canCreateSidebarCollections}
            activeNoteFullId={activeNoteFullId}
            resolveNoteRow={resolveDrillNoteRow}
            prefetchNote={prefetchProposalNote}
            onOpenNote={onNoteRow}
            onDismiss={closeThreadProposal}
            onCreated={(repNoteId) => {
              setSidebarThreadProposal(undefined);
              setSidebarListMode('threads');
              setSidebarThreadDrilldownId(threadClusterDrillSlug(repNoteId));
            }}
          />
        ) : searchActive ? (
          <>
          <PrototypeSidebarSearchResults
            selection={searchResultSelection}
            query={q}
            homeSpaceId={homeSpaceId}
            activeNoteFullId={activeNoteFullId}
            activeSearchContext={activeSearchContext}
            data={universalSearchData}
            notesById={notesById}
            highlightsById={highlightsById}
            resolveClusterTitle={resolveClusterTitle}
            highlightKindFilter={highlightKindFilter}
            onHighlightKindFilterChange={setHighlightKindFilter}
            onActivateResult={onActivateSearchResult}
            isResultActive={isSearchResultActive}
            shellIsSharedSpace={shellIsSharedSpace && isScopedSharedSpace}
            personalHomeSpaceId={personalHomeSpaceId}
            myHomeData={myHomeUniversalSearchData}
            myHomeNotesById={myHomeNotesById}
            myHomeHighlightsById={myHomeHighlightsById}
          />
          {/* Search replaces the list body, so a selection made before typing —
              or built out of the results themselves — would otherwise lose the
              actions that go with it. */}
          {noteSelectionActive && sidebarSelectedIds.length > 0 ? bulkBar : null}
          {highlightSelectionActive ? highlightBulkBar : null}
          </>
        ) : (
          <>
            {mode === 'notes' ? (
              <>
                {notesListPhase === 'error' ? (
                  <p className="proto-caption" style={{ padding: '12px 18px', textAlign: 'center' }}>
                    Couldn&apos;t load notes.
                  </p>
                ) : notesListPhase === 'loading' || (tagFilter && tagNoteIdsQuery.isPending) ? (
                  <ProtoNotesListLoading />
                ) : notesForMode.length === 0 ? (
                  q.trim() || tagFilter ? (
                    <PrototypeListNoMatchEmptyState
                      title={
                        tagFilter
                          ? `No notes tagged “${tagFilter.tagName}”.`
                          : SIDEBAR_NO_MATCH_COPY.noNotesMatch
                      }
                    />
                  ) : (
                    <PrototypeListEmptyState
                      iconName="note-sticky"
                      title="No Notes"
                      description="Create your first note to get started."
                    />
                  )
                ) : (
                  <ul className="proto-note-list">
                    {notesForMode.map((row) => (
                      <PrototypeSidebarNoteRow
                        key={row.id}
                        row={row}
                        active={!!(activeNoteFullId && row.id === activeNoteFullId)}
                        homeSpaceId={homeSpaceId}
                        activeNoteFullId={activeNoteFullId}
                        isScopedSharedSpace={isScopedSharedSpace}
                        sharedSpaceMemberByUserId={sharedSpaceMemberByUserId}
                        viewerIsSpaceOwner={viewerIsSpaceOwner}
                        selectMode={noteSelectionActive}
                        selectable
                        selected={selectedNoteIdSet.has(row.id)}
                        onToggleSelected={toggleNoteSelected}
                        onSelectRangeTo={selectRangeTo}
                        prefetchNote={prefetchNote}
                        onOpenNote={(r) => {
                          onNoteRow(r);
                        }}
                      />
                    ))}
                  </ul>
                )}
                {notesPaginationEnabled ? (
                  <ProtoNotesPaginationFooter
                    hasNextPage={!!hasNextPage}
                    isFetchingNextPage={isFetchingNextPage}
                    isFetchNextPageError={isFetchNextPageError}
                    setSentinelRef={setSentinelRef}
                    onRetry={() => void fetchNextPage()}
                  />
                ) : null}
                {/* Below the pagination footer so it stays the last thing in the
                    pane. Unlike the folder and thread footers this one shows while
                    searching too: "nothing matched" is one of the better moments to
                    start writing, and a new note is the app's whole point. Fires
                    the ⇧N event rather than composing here — one owner decides
                    which space a new note lands in. */}
                {selectionActive ? (
                  bulkBar
                ) : homeSpaceId ? (
                  <div className="proto-collection-grid-actions">
                    <button
                      type="button"
                      className="proto-collection-grid-actions__btn"
                      onClick={() => window.dispatchEvent(new Event('prototypeShortcutNewNote'))}
                    >
                      New note
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}

            {mode === 'folders' && activeFolderKey !== undefined ? (
              <>
                {notesListPhase === 'error' ? (
                  <p className="proto-caption" style={{ padding: '12px 18px', textAlign: 'center' }}>
                    Couldn&apos;t load notes.
                  </p>
                ) : notesListPhase === 'loading' ? (
                  <ProtoNotesListLoading />
                ) : notesForMode.length === 0 ? (
                  <div className="proto-drill-empty">
                    <p className="proto-caption" style={{ padding: '12px 18px', textAlign: 'center' }}>
                      No notes in this folder.
                    </p>
                    {typeof activeFolderKey === 'string' ? (
                      <>
                        <button
                          type="button"
                          className="proto-drill-empty__cta"
                          onClick={() => window.dispatchEvent(new Event('prototypeShortcutNewNote'))}
                        >
                          New note
                        </button>
                        <button
                          type="button"
                          className="proto-drill-empty__cta proto-drill-empty__cta--secondary"
                          onClick={() => setAddNotesSheetOpen(true)}
                        >
                          Add notes
                        </button>
                      </>
                    ) : null}
                  </div>
                ) : (
                  <ul className="proto-note-list" role="list">
                    {notesForMode.map((row) => (
                      <PrototypeSidebarNoteRow
                        key={row.id}
                        row={row}
                        active={!!(activeNoteFullId && row.id === activeNoteFullId)}
                        homeSpaceId={homeSpaceId}
                        activeNoteFullId={activeNoteFullId}
                        isScopedSharedSpace={isScopedSharedSpace}
                        sharedSpaceMemberByUserId={sharedSpaceMemberByUserId}
                        viewerIsSpaceOwner={viewerIsSpaceOwner}
                        selectMode={noteSelectionActive}
                        selectable
                        selected={selectedNoteIdSet.has(row.id)}
                        onToggleSelected={toggleNoteSelected}
                        onSelectRangeTo={selectRangeTo}
                        prefetchNote={prefetchNote}
                        folderRemoval={
                          typeof activeFolderKey === 'string' ? { folderName: activeFolderKey } : undefined
                        }
                        onOpenNote={(r) => {
                          onNoteRow(r);
                        }}
                      />
                    ))}
                  </ul>
                )}
                {notesPaginationEnabled ? (
                  <ProtoNotesPaginationFooter
                    hasNextPage={!!hasNextPage}
                    isFetchingNextPage={isFetchingNextPage}
                    isFetchNextPageError={isFetchNextPageError}
                    setSentinelRef={setSentinelRef}
                    onRetry={() => void fetchNextPage()}
                  />
                ) : null}
              </>
            ) : null}

            {mode === 'folders' && activeFolderKey === undefined ? (
              notesListPhase === 'error' ? (
                <p className="proto-caption" style={{ padding: '12px 18px', textAlign: 'center' }}>
                  Couldn&apos;t load notes.
                </p>
              ) : notesListPhase === 'loading' ? (
                <ProtoNotesListLoading />
              ) : filteredFolders.length === 0 ? (
                q.trim() ? (
                  <PrototypeListNoMatchEmptyState title={SIDEBAR_NO_MATCH_COPY.noFoldersMatch} />
                ) : (
                  <div className="proto-list-create-empty">
                    <PrototypeListEmptyState
                      iconName="folder"
                      title="No Folders"
                      description={foldersEmptyDescription}
                    />
                    {canCreateSidebarCollections ? (
                      <button
                        type="button"
                        className="proto-list-create-empty__btn"
                        onClick={openCreateFolderSheet}
                      >
                        New folder
                      </button>
                    ) : null}
                  </div>
                )
              ) : (
                <>
                  <ul className="proto-collection-grid">
                  {filteredFolders.map((col) => (
                    <PrototypeSidebarFolderCard
                      key={col.name ?? '__none__'}
                      folder={col}
                      isPinned={col.name !== null && pinnedFolderIds.includes(folderRowId(col.name))}
                      onOpen={() => setActiveFolderKey(col.name)}
                      onTogglePin={() => togglePinnedFolder(folderRowId(col.name))}
                      onDelete={(anchorRect) => onRequestDeleteFolder(col, anchorRect)}
                      showMenu={!isScopedSharedSpace || viewerIsSpaceOwner}
                      selectable={
                        col.name !== null && (!isScopedSharedSpace || viewerIsSpaceOwner)
                      }
                      selectMode={folderSelectionActive}
                      selected={folderSelectedIdSet.has(col.name ?? '')}
                      onToggleSelected={() => toggleFolderSelected(col.name ?? '')}
                      isDeleting={
                        removeFolder.isPending && removeFolder.variables?.folderName === col.name
                      }
                    />
                  ))}
                </ul>
                {/* While folders are selected their actions take the footer's
                    place — making a new folder is not what you are doing. */}
                {folderSelectionActive ? folderBulkBar : null}
                {/* After the grid, not before it: the footer is the last thing in
                    the pane, so the list starts at the top where reading starts. */}
                {!folderSelectionActive && !q.trim() && canCreateSidebarCollections ? (
                  <div className="proto-collection-grid-actions">
                    <button
                      type="button"
                      className="proto-collection-grid-actions__btn"
                      onClick={openCreateFolderSheet}
                    >
                      New folder
                    </button>
                  </div>
                ) : null}
                </>
              )
            ) : null}

            {mode === 'highlights' ? (
              <>
                <div className="proto-chip-bar" role="tablist" aria-label="Highlight kind">
                  {HIGHLIGHT_KIND_OPTIONS.map((opt) => {
                    const selected = highlightKindFilter === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        className={`proto-chip${selected ? ' proto-chip--selected' : ''}`}
                        onClick={() => setHighlightKindFilter(opt.id)}
                      >
                        {opt.iconName ? <Icon name={opt.iconName} size={11} aria-hidden /> : null}
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                {highlightsQuery.isLoading ? (
                  <ProtoSpaceLoading label="Loading highlights" />
                ) : highlightsQuery.isError ? (
                  <p className="proto-caption" style={{ padding: '12px 18px', textAlign: 'center' }}>
                    Could not load highlights.
                    {describeQueryFailure(highlightsQuery.error) ? (
                      <>
                        {' '}
                        <span style={{ display: 'block', marginTop: 8, opacity: 0.85 }}>
                          {describeQueryFailure(highlightsQuery.error)}
                        </span>
                      </>
                    ) : null}
                  </p>
                ) : filteredHighlights.length === 0 ? (
                  q.trim() || highlightKindFilter !== 'all' ? (
                    <PrototypeListNoMatchEmptyState title={SIDEBAR_NO_MATCH_COPY.noHighlightsMatch} />
                  ) : (
                    <PrototypeListEmptyState
                      iconName="highlighter"
                      title="No Highlights"
                      description={
                        isScopedSharedSpace
                          ? 'Selections and passage highlights from notes in this space appear here.'
                          : 'Selections and passage highlights from your notes appear here.'
                      }
                    />
                  )
                ) : (
                  <ul className="proto-note-list">
                    {filteredHighlights.map((r) => {
                      const iso = prototypeHighlightRecencyIso(r);
                      const rel = protoRelativeCaptionAbbrev(iso);
                      const sub = prototypeHighlightSubtitlePreview(r, r.parentNoteTitle ?? '');
                      const title = prototypeHighlightListTitle(r);
                      const isPinned = pinnedHighlightIds.includes(r.id);
                      return (
                        <HighlightRow
                          key={r.id}
                          isActive={false}
                          isPinned={isPinned}
                          entryKind={r.entryKind}
                          title={title}
                          rel={rel}
                          preview={sub}
                          isScopedSharedSpace={isScopedSharedSpace}
                          sharedSpaceMemberByUserId={sharedSpaceMemberByUserId}
                          authorDisplayName={r.authorDisplayName}
                          authorColor={r.authorColor}
                          authorUserId={r.userId}
                          isOwnHighlight={r.isOwnHighlight !== false}
                          selectable={r.isOwnHighlight !== false || !isScopedSharedSpace}
                          selectMode={highlightSelectionActive}
                          selected={selectedHighlightIdSet.has(r.id)}
                          onToggleSelected={() => toggleHighlightSelected(r.id)}
                          onSelectRangeTo={() => selectHighlightRangeTo(r.id)}
                          onOpen={() => onHighlightRow(r)}
                          onTogglePin={() => togglePinnedHighlight(r.id)}
                          onDelete={(anchorRect) => onRequestDeleteHighlight(r, anchorRect)}
                          isDeleting={
                            deleteHighlight.isPending &&
                            deleteHighlight.variables?.id === r.id
                          }
                        />
                      );
                    })}
                  </ul>
                )}
                {highlightSelectionActive ? highlightBulkBar : null}
              </>
            ) : null}

            {mode === 'resources' ? (
              <PrototypeResourceLibraryList
                query={q}
                onOpenResource={onResourceRow}
                /* "This space" means this room's shelf; "My Home" means the
                   personal and church ones, which is what the source chips
                   inside the list already separate. Without this the scope bar
                   was above a list that ignored it. */
                spaceId={
                  shellIsSharedSpace && sidebarListSpaceScope !== 'my-home'
                    ? (scopedSpaceId ?? null)
                    : null
                }
              />
            ) : null}

            {mode === 'threads' && sidebarThreadDrilldownId && !isSharedSpaceThreadDrillId(sidebarThreadDrilldownId) ? (
              <>
                {/* Same disabled-query flash as the Thread lists — here it read
                    as "No notes in this thread" on the way into a thread that
                    has notes. */}
                {threadDrillQuery.isPending ? (
                  <ProtoSpaceLoading label="Loading Thread" />
                ) : threadDrillQuery.isError ? (
                  <p className="proto-caption" style={{ padding: '12px 18px', textAlign: 'center' }}>
                    Could not load thread.
                  </p>
                ) : threadDrillNodesSorted.length === 0 ? (
                  <div className="proto-drill-empty">
                    <p className="proto-caption" style={{ padding: '12px 18px', textAlign: 'center', opacity: 0.7 }}>
                      No notes in this thread.
                    </p>
                    {/* Writing one is the other half of filling a Thread, and
                        this only ever offered to move notes that already
                        existed. Lands in this Thread rather than loose. */}
                    <button
                      type="button"
                      className="proto-drill-empty__cta"
                      onClick={() => composeInSharedThread(sidebarThreadDrilldownId)}
                    >
                      New note
                    </button>
                    <button
                      type="button"
                      className="proto-drill-empty__cta proto-drill-empty__cta--secondary"
                      onClick={() => setAddNotesSheetOpen(true)}
                    >
                      Add notes
                    </button>
                  </div>
                ) : (
                  /* Same grouped-row card the note-page trail wears, so a Thread
                     reads the same whichever way it was opened. */
                  <div className="proto-thread-trail proto-thread-trail--carded proto-sidebar-thread-trail-card">
                  <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools proto-thread-trail__card">
                  <ul
                    className={`proto-note-list proto-thread-trail__spine proto-thread-trail__spine--fill proto-sidebar-thread-trail${threadDrillDrag.draggingId ? ' proto-thread-trail__spine--dragging' : ''}`}
                    role="list"
                  >
                    <ProtoThreadTrailSortableList
                      items={threadDrillDrag.displayOrderedIds}
                      onDragStart={threadDrillDrag.handleDragStart}
                      onDragEnd={threadDrillDrag.handleDragEnd}
                      onDragCancel={threadDrillDrag.handleDragCancel}
                    >
                    {threadDrillDisplayNodes.map((node) => {
                      const row = resolveDrillNoteRow({
                        id: node.id,
                        title: node.title || node.resourceTitle || null,
                        content: node.content ?? node.resourceDescription ?? '',
                        updatedAt: node.updatedAt,
                      });
                      return (
                        <ProtoThreadTrailSortableRow key={node.id} id={node.id}>
                          {(sortable) => (
                          <PrototypeSidebarNoteRow
                            row={row}
                            active={!!(activeNoteFullId && node.id === activeNoteFullId)}
                            homeSpaceId={homeSpaceId}
                            activeNoteFullId={activeNoteFullId}
                            isScopedSharedSpace={isScopedSharedSpace}
                            sharedSpaceMemberByUserId={sharedSpaceMemberByUserId}
                            viewerIsSpaceOwner={viewerIsSpaceOwner}
                            prefetchNote={prefetchNote}
                            trailLayout
                            isDragging={threadDrillDrag.draggingId === node.id}
                            trailSortable={threadDrillDrag.showDragHandle ? sortable : null}
                            threadRemoval={{ memberIds: threadDrillMemberIds }}
                            onOpenNote={(r) => {
                              onNoteRow(r);
                            }}
                          />
                          )}
                        </ProtoThreadTrailSortableRow>
                      );
                    })}
                    </ProtoThreadTrailSortableList>
                  </ul>
                  </div>
                  </div>
                )}
              </>
            ) : null}

            {mode === 'threads' && !sidebarThreadDrilldownId ? (
              isScopedSharedSpace ? (
              <>
                {/* Same disabled-query flash as the personal list below. */}
                {groupThreadsQuery.isPending ? (
                  <ProtoSpaceLoading label="Loading Threads" />
                ) : groupThreadsQuery.isError ? (
                  <p className="proto-caption" style={{ padding: '12px 18px', textAlign: 'center' }}>
                    Could not load threads.
                  </p>
                ) : !groupThreadsQuery.data || groupThreadsQuery.data.length === 0 ? (
                  <div className="proto-list-create-empty">
                    <PrototypeListEmptyState
                      iconName="arrow-right-arrow-left"
                      title="No Threads"
                      description={threadsEmptyDescription}
                    />
                    {canCreateSidebarCollections ? (
                      <button
                        type="button"
                        className="proto-list-create-empty__btn"
                        onClick={() => openCreateThreadSheet()}
                      >
                        New Thread
                      </button>
                    ) : null}
                  </div>
                ) : filteredSharedThreads.length === 0 ? (
                  q.trim() ? (
                    <PrototypeListNoMatchEmptyState title={SIDEBAR_NO_MATCH_COPY.noThreadsMatch} />
                  ) : (
                    <div className="proto-list-create-empty">
                      <PrototypeListEmptyState
                        iconName="arrow-right-arrow-left"
                        title="No Threads"
                        description={threadsEmptyDescription}
                      />
                      {canCreateSidebarCollections ? (
                        <button
                          type="button"
                          className="proto-list-create-empty__btn"
                          onClick={() => openCreateThreadSheet()}
                        >
                          New Thread
                        </button>
                      ) : null}
                    </div>
                  )
                ) : (
                  <>
                    <ul className="proto-collection-grid">
                      {filteredSharedThreads.map((thread) => (
                        <PrototypeSidebarSharedThreadCard
                          key={thread.id}
                          thread={thread}
                          onOpen={() => setSidebarThreadDrilldownId(thread.id)}
                          onSetCurrent={() => {
                            if (!homeSpaceId) return;
                            void setCurrentSpaceThread.mutateAsync({ spaceId: homeSpaceId, threadId: thread.id }).catch((error) => {
                              toast.error(
                                error instanceof Error ? error.message : 'Could not set this Thread as current.',
                              );
                            });
                          }}
                          onDelete={(anchorRect) => setSharedThreadDeleteTarget({ thread, anchorRect })}
                          showMenu={viewerIsSpaceOwner}
                          isDeleting={
                            deleteSharedThread.isPending && sharedThreadDeleteTarget?.thread.id === thread.id
                          }
                          setCurrentPending={setCurrentSpaceThread.isPending}
                        />
                      ))}
                    </ul>
                    {!q.trim() && canCreateSidebarCollections ? (
                      <div className="proto-collection-grid-actions">
                        <button
                          type="button"
                          className="proto-collection-grid-actions__btn"
                          onClick={() => openCreateThreadSheet()}
                        >
                          New Thread
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </>
              ) : (
              <>
                {/* `isPending`, not `isLoading`. A query that is still disabled
                    — `enabled` flips on with `mode === 'threads'`, and again
                    with `useAuthReady` — reports `isLoading: false` because it
                    is not fetching yet, while its data is still undefined. The
                    list read that as "loaded, and empty" and flashed "No
                    Threads" for a frame before the dots appeared. `isPending`
                    is true until there is data either way. */}
                {studyThreadsQuery.isPending ? (
                  <ProtoSpaceLoading label="Loading Threads" />
                ) : studyThreadsQuery.isError ? (
                  <p className="proto-caption" style={{ padding: '12px 18px', textAlign: 'center' }}>
                    Could not load threads.
                  </p>
                ) : !studyThreadsQuery.data || studyThreadsQuery.data.length === 0 ? (
                  <div className="proto-list-create-empty">
                    <PrototypeListEmptyState
                      iconName="arrow-right-arrow-left"
                      title="No Threads"
                      description={threadsEmptyDescription}
                    />
                    {canCreateSidebarCollections ? (
                      <button
                        type="button"
                        className="proto-list-create-empty__btn"
                        onClick={() => openCreateThreadSheet()}
                      >
                        New Thread
                      </button>
                    ) : null}
                  </div>
                ) : filteredThreads.length === 0 ? (
                  q.trim() ? (
                    <PrototypeListNoMatchEmptyState title={SIDEBAR_NO_MATCH_COPY.noThreadsMatch} />
                  ) : (
                    <div className="proto-list-create-empty">
                      <PrototypeListEmptyState
                        iconName="arrow-right-arrow-left"
                        title="No Threads"
                        description={threadsEmptyDescription}
                      />
                      {canCreateSidebarCollections ? (
                        <button
                          type="button"
                          className="proto-list-create-empty__btn"
                          onClick={() => openCreateThreadSheet()}
                        >
                          New Thread
                        </button>
                      ) : null}
                    </div>
                  )
                ) : (
                  <>
                    <ul className="proto-collection-grid">
                    {filteredThreads.map((cluster) => {
                      const title = resolveClusterListTitle(
                        cluster,
                        activeNoteFullId,
                        queryClient,
                        homeSpaceId,
                      );
                      return (
                        <PrototypeSidebarThreadCard
                          key={cluster.id}
                          cluster={cluster}
                          title={title}
                          isPinned={pinnedThreadClusterIds.includes(cluster.id)}
                          onOpen={() => setSidebarThreadDrilldownId(threadClusterDrillSlug(cluster.id))}
                          onTogglePin={() => togglePinnedThreadCluster(cluster.id)}
                          onDelete={(anchorRect) => onRequestDeleteThreadCluster(cluster, title, anchorRect)}
                          showMenu={!isScopedSharedSpace || viewerIsSpaceOwner}
                          selectable={!isScopedSharedSpace || viewerIsSpaceOwner}
                          selectMode={threadSelectionActive}
                          selected={threadSelectedIdSet.has(cluster.id)}
                          onToggleSelected={() => toggleThreadSelected(cluster.id)}
                          isDeleting={removeThreadCluster.isPending && threadDeleteTarget?.cluster.id === cluster.id}
                        />
                      );
                    })}
                  </ul>
                  {threadSelectionActive ? threadBulkBar : null}
                  {!threadSelectionActive && !q.trim() && canCreateSidebarCollections ? (
                    <div className="proto-collection-grid-actions">
                      <button
                        type="button"
                        className="proto-collection-grid-actions__btn"
                        onClick={() => openCreateThreadSheet()}
                      >
                        New Thread
                      </button>
                    </div>
                  ) : null}
                  </>
                )}
              </>
              )
            ) : null}

            {mode === 'scripture' && scriptureDrill.level === 'books' ? (
              <>
                {scriptureQuery.isLoading ? (
                  <ProtoSpaceLoading label="Loading scripture" />
                ) : scriptureQuery.isError ? (
                  <p className="proto-caption" style={{ padding: '12px 18px', textAlign: 'center' }}>
                    Could not load scripture index.
                    {describeQueryFailure(scriptureQuery.error) ? (
                      <>
                        {' '}
                        <span style={{ display: 'block', marginTop: 8, opacity: 0.85 }}>
                          {describeQueryFailure(scriptureQuery.error)}
                        </span>
                      </>
                    ) : null}
                  </p>
                ) : filteredScriptureBooks.length === 0 ? (
                  q.trim() ? (
                    <PrototypeListNoMatchEmptyState title={SIDEBAR_NO_MATCH_COPY.noScriptureMatch} />
                  ) : (
                    <PrototypeListEmptyState
                      iconName="book-open"
                      title="No Scripture References"
                      description="Add scripture references in your notes to build your index."
                      /* This index is built from notes, so before there are notes it had nothing
                         to say and no way out — the one screen in the app that names Scripture
                         was also the one that could not open any. */
                      action={
                        <button
                          type="button"
                          className="proto-glass-surface proto-glass-surface--control proto-glass-action"
                          onClick={openSmartJumpReader}
                        >
                          <Icon name="book-open" size={12} aria-hidden />
                          <span className="proto-glass-action__label">Read the Bible</span>
                        </button>
                      }
                    />
                  )
                ) : (
                  <ul className="proto-collection-grid">
                    {filteredScriptureBooks.map((b) => (
                      <li key={b.bookOrder}>
                        <button
                          type="button"
                          className="proto-collection-card"
                          onClick={() => setScriptureDrill({ level: 'passages', bookOrder: b.bookOrder })}
                        >
                          <span className="proto-collection-card__icon">
                            <Icon name="scroll" size={13} aria-hidden />
                          </span>
                          <div className="proto-collection-card__body">
                            <div className="proto-collection-card__title">{b.title}</div>
                            <div className="proto-collection-card__count proto-collection-card__count--wrap">
                              {b.passages.length} passage{b.passages.length !== 1 ? 's' : ''} · {b.noteCount} note
                              {b.noteCount !== 1 ? 's' : ''}
                            </div>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : null}

            {mode === 'scripture' && scriptureDrill.level === 'passages' ? (
              <>
                <ProtoChipBar
                  ariaLabel="Book view"
                  options={SCRIPTURE_BOOK_VIEW_OPTIONS}
                  selectedId={scriptureBookView}
                  onSelect={setScriptureBookView}
                />
                {scriptureBookView === 'notes' ? (
                  notesForScriptureBook.length === 0 ? (
                    <PrototypeListNoMatchEmptyState title={SIDEBAR_NO_MATCH_COPY.noNotesMatch} />
                  ) : (
                    renderScriptureNoteList(notesForScriptureBook)
                  )
                ) : passagesForDrill.length === 0 ? (
                  <p className="proto-caption" style={{ padding: '12px 18px', textAlign: 'center' }}>
                    No passages match.
                  </p>
                ) : (
                  <ul className="proto-note-list">
                    {passagesForDrill.map((p) => (
                      <li key={p.passageKey} className="proto-scripture-passage-row">
                        <button
                          type="button"
                          className="proto-note-row"
                          onClick={() =>
                            setScriptureDrill({
                              level: 'notes',
                              bookOrder: scriptureDrill.bookOrder,
                              passageKey: p.passageKey,
                            })
                          }
                        >
                          <div className="pds-list-title">{p.displayRef}</div>
                          <div className="pds-list-preview">
                            {p.noteCount} note{p.noteCount !== 1 ? 's' : ''}
                          </div>
                        </button>
                        {/* The row itself still drills to this passage's notes — reading the
                            chapter is a second, distinct intent, so it gets its own target
                            rather than overloading the row and taking the notes drill away. */}
                        <button
                          type="button"
                          className="proto-scripture-passage-row__read"
                          aria-label={`Read ${p.displayRef} in the Bible reader`}
                          title="Read chapter"
                          onClick={() => {
                            const bookTitle = scriptureBooks.find(
                              (b) => b.bookOrder === p.bookOrder,
                            )?.title;
                            if (!bookTitle) return;
                            void navigate({
                              to: prototypeReadRouteTo(),
                              params: { book: bookSlug(bookTitle), chapter: String(p.chapter) },
                              search: { v: String(p.verseStart), t: undefined, req: String(Date.now()) },
                            });
                          }}
                        >
                          <Icon name="book-open" size={14} aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : null}

            {mode === 'scripture' && scriptureDrill.level === 'notes' ? (
              <>
                {notesForScripturePassage.length === 0 ? (
                  <PrototypeListNoMatchEmptyState title={SIDEBAR_NO_MATCH_COPY.noNotesMatch} />
                ) : (
                  renderScriptureNoteList(notesForScripturePassage)
                )}
              </>
            ) : null}

          </>
        )}
      </div>

      {highlightDeleteTarget ? (
        <ProtoConfirmDialog
          anchorRect={highlightDeleteTarget.anchorRect}
          confirmLabel="Delete"
          busy={deleteHighlight.isPending}
          onConfirm={onConfirmDeleteHighlight}
          onCancel={() => {
            if (!deleteHighlight.isPending) setHighlightDeleteTarget(null);
          }}
        />
      ) : null}
      {folderDeleteTarget ? (
        <ProtoConfirmDialog
          anchorRect={folderDeleteTarget.anchorRect}
          confirmLabel={`Delete from ${folderDeleteTarget.count} note${folderDeleteTarget.count !== 1 ? 's' : ''}`}
          busy={removeFolder.isPending}
          onConfirm={onConfirmDeleteFolder}
          onCancel={() => {
            if (!removeFolder.isPending) setFolderDeleteTarget(null);
          }}
        />
      ) : null}
      {threadDeleteTarget ? (
        <ProtoConfirmDialog
          anchorRect={threadDeleteTarget.anchorRect}
          confirmLabel={`Disconnect ${threadDeleteTarget.cluster.noteCount} note${threadDeleteTarget.cluster.noteCount !== 1 ? 's' : ''}`}
          busy={removeThreadCluster.isPending}
          onConfirm={onConfirmDeleteThreadCluster}
          onCancel={() => {
            if (!removeThreadCluster.isPending) setThreadDeleteTarget(null);
          }}
        />
      ) : null}
      {sharedThreadDeleteTarget ? (
        <ProtoConfirmDialog
          anchorRect={sharedThreadDeleteTarget.anchorRect}
          confirmLabel="Delete thread"
          busy={deleteSharedThread.isPending}
          onConfirm={onConfirmDeleteSharedThread}
          onCancel={() => {
            if (!deleteSharedThread.isPending) setSharedThreadDeleteTarget(null);
          }}
        />
      ) : null}
      {homeSpaceId ? (
        <>
          <PrototypeAddNotesSheet
            open={addNotesSheetOpen}
            onOpenChange={setAddNotesSheetOpen}
            spaceId={homeSpaceId}
            spaceKind={isScopedSharedSpace ? 'shared' : 'personal'}
            mode={showThreadAddNotes ? 'thread' : 'folder'}
            folderName={typeof activeFolderKey === 'string' ? activeFolderKey : undefined}
            threadRepNoteId={
              threadDrillQuery.data?.repNoteId ??
              (sidebarThreadDrilldownId && !isSharedSpaceThreadDrillId(sidebarThreadDrilldownId)
                ? normalizeNoteIdFromParam(sidebarThreadDrilldownId)
                : undefined)
            }
            threadMemberIds={threadDrillMemberIds}
            excludeNoteIds={showThreadAddNotes ? threadDrillMemberIds : activeFolderMemberIds}
            notesById={notesById}
            spaceNotes={notes}
            viewerIsSpaceOwner={viewerIsSpaceOwner}
          />
          {canCreateSidebarCollections ? (
            /* This sheet is the list's own "New folder", which starts from nothing. A folder
               made *from a selection* goes through the host instead, so there is one bulk
               path whether the verb came from this bar, a chord, or the search panel. */
            <PrototypeCreateFolderSheet
              open={createFolderSheetOpen}
              onOpenChange={setCreateFolderSheetOpen}
              spaceId={homeSpaceId}
              spaceKind={isScopedSharedSpace ? 'shared' : 'personal'}
              spaceNotes={notes}
              notesById={notesById}
              onCreated={(folderName) => {
                // setSidebarListMode clears any live selection on its way through.
                setSidebarListMode('folders');
                setActiveFolderKey(folderName);
              }}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

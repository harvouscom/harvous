import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import Icon from '@/components/react/Icon';
import ProtoChipBar, { type ProtoChipOption } from './components/ProtoChipBar';
import { toast } from '@/utils/toast';
import { APIError } from '../../lib/api';
import { useDeleteNote } from '../../hooks/mutations/useDeleteNote';
import { useDeleteNotesBatch } from '../../hooks/mutations/useDeleteNotesBatch';
import { useNavigation } from '../../hooks/queries/useNavigation';
import ProtoSpaceMenuIcon from './ProtoSpaceMenuIcon';
import { isPersonalSharedSpace } from '../../lib/church-settings';
import { api } from '../../lib/api';
import {
  DELETE_NOTE_EVERYWHERE_CONFIRMATION,
  REMOVE_NOTE_FROM_SPACE_CONFIRMATION,
} from './proto-destructive-copy';
import { useRemoveNotesFromSpaceBatch } from '../../hooks/mutations/useSpaceNoteAssociation';
import { useDeleteHighlight } from '../../hooks/mutations/useDeleteHighlight';
import { useRemoveFolder } from '../../hooks/mutations/useRemoveFolder';
import { useRemoveNoteFromFolder } from '../../hooks/mutations/useRemoveNoteFromFolder';
import { useRemoveNoteFromThreadCluster } from '../../hooks/mutations/useRemoveNoteFromThreadCluster';
import { useRemoveThreadCluster } from '../../hooks/mutations/useRemoveThreadCluster';
import { useDeleteSharedThread } from '../../hooks/mutations/useDeleteSharedThread';
import { useSetCurrentSpaceThread } from '../../hooks/mutations/useSetCurrentSpaceThread';
import { useConnectNote } from '../../hooks/mutations/useConnectNote';
import { useUpdateStudyThreadTitle } from '../../hooks/mutations/useUpdateStudyThreadTitle';
import { usePinSpaceNote } from '../../hooks/mutations/usePinSpaceNote';
import { useSpaceNotes, useSpaceMembers, type SpaceMemberRow, type SpaceNoteRow } from '../../hooks/queries/useSpace';
import {
  useSpaceGroupThreads,
  type SpaceGroupStudyThread,
} from '../../hooks/queries/useSpaceGroupThreads';
import { getNoteQueryOptions, seedNoteFromList, type ListNoteForSeed } from '../../hooks/queries/useNote';
import { beginComposeInGroupThread } from '../../lib/compose-group-thread';
import {
  filterSharedSpaceThreads,
  isSharedSpaceThreadDrillId,
  sharedSpaceThreadsEmptyDescription,
} from './shared-space-thread-list';
import PrototypeCreateSharedThreadSheet from './PrototypeCreateSharedThreadSheet';
import PrototypeSharedThreadDrilldown from './PrototypeSharedThreadDrilldown';
import { sharedThreadNoteCountPreview } from './shared-space-dashboard';
import { countNotesInFolderBucket, noteBelongsToFolderBucket, noteFolderMembershipLabels } from '@/utils/note-folder-display';
import { sortDrillNoteBriefsByLastUpdated, sortNotesByLastUpdated } from '@/utils/sorting';
import { orderStudyThreadNodesByIds, resolveStudyThreadMemberOrder } from '@/utils/study-thread-trail';
import { useStudyThreadMemberDragReorder } from '../../hooks/useStudyThreadMemberDragReorder';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import { isEffectivelyEmptyPrototypeNote } from '@/utils/prototype-note-empty';
import { computePrototypeNotesListPhase } from '@/utils/prototype-notes-list-phase';
import { stripHtmlForListPreview } from '@/utils/html-stripper';
import { useProtoShell, type SidebarTagSearchIntent, type ThreadProposal } from '../../layouts/proto-shell-context';
import { usePrototypeHomeSpaceId } from '../../hooks/usePrototypeHomeSpaceId';
import { usePrototypeStudyThreadListSyncListener } from '../../hooks/usePrototypeStudyThreadListSyncListener';
import { useIntersectionFetchNextPage } from '../../hooks/useIntersectionFetchNextPage';
import { moveListRowFocus } from '../../hooks/useListKeyboardNavigation';
import {
  isPrototypeNotePath,
  matchPrototypeNoteId,
  prototypeHomeRouteTo,
  prototypeNoteRouteTo,
} from '@/lib/prototype-path';
import { protoRelativeCaptionAbbrev } from './proto-time';
import { PROTO_TOOLBAR_ICON_SIZE } from './proto-toolbar-tokens';
import ProtoConfirmDialog from './ProtoConfirmDialog';
import ProtoThreadTrailOrb from './ProtoThreadTrailOrb';
import PrototypeSidebarRowMenuPopover from './PrototypeSidebarRowMenuPopover';
import type { PrototypeHighlightStudyThreadRow } from '../../hooks/queries/usePrototypeSpaceStudyThreadHighlights';
import { usePrototypeSpaceStudyThreadHighlights } from '../../hooks/queries/usePrototypeSpaceStudyThreadHighlights';
import { usePrototypeStudyThreads, type StudyThreadCluster } from '../../hooks/queries/usePrototypeStudyThreads';
import { threadClusterDrillSlug } from '@/utils/thread-cluster-bulk-actions';
import {
  usePrototypeStudyThread,
  studyThreadQueryKey,
  type StudyThreadResponse,
} from '../../hooks/queries/usePrototypeStudyThread';
import { studyThreadDisplayTitle } from '../../utils/study-thread-display-title';
import { usePrototypeSpaceScriptureIndex } from '../../hooks/queries/usePrototypeSpaceScriptureIndex';
import { useTagNoteIds } from '../../hooks/queries/useTagNoteIds';
import {
  highlightEntryKindAriaLabel,
  highlightEntryKindIconName,
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
  togglePinnedFolderId,
  togglePinnedHighlightId,
  togglePinnedThreadClusterId,
} from './proto-pinned-stores';
import PrototypeSidebarSearchResults from './PrototypeSidebarSearchResults';
import PrototypeSearchInput from './components/PrototypeSearchInput';
import type { SidebarSearchResult } from './sidebar-search-types';
import {
  buildFoldersFromNotes,
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
import { everyRowAllows, resolveNoteRowCapabilities } from '../../lib/note-row-capabilities';
import PrototypeAddNotesSheet from './PrototypeAddNotesSheet';
import PrototypeCreateFolderSheet from './PrototypeCreateFolderSheet';
import PrototypeCreateThreadSheet from './PrototypeCreateThreadSheet';
import SharedSpaceNoteAuthorChip from './SharedSpaceNoteAuthorChip';
import { resolveSpaceOwnerMember } from '../../lib/shared-space-about';
import SharedSpaceOwnerCollectionEmptyDescription from './SharedSpaceOwnerCollectionEmptyDescription';


import { resolvePrototypeToolbarNoteId } from '@/utils/prototype-compose-url';
import { noteParamSlug, normalizeNoteIdFromParam, isPrototypeDraftNoteSlug } from './proto-route-slugs';
import {
  PROTOTYPE_NOTE_LIST_NAV_SEARCH,
  prototypeNoteListNavigationSearch,
} from '@/utils/prototype-sidebar-highlight-active';

import { ProtoThreadTrailRecencyLine as ProtoListRecencyLine } from './proto-thread-trail-row';
import { toastError } from '../../lib/error-copy';

function stripHtmlPreview(html: string | null | undefined, max = 80) {
  if (!html) return '';
  return stripHtmlForListPreview(html, max);
}

function sharedSpaceAuthorChipProps(
  memberByUserId: Map<string, SpaceMemberRow>,
  options: {
    userId?: string;
    displayName: string;
    color?: string | null;
    isSelf?: boolean;
  },
) {
  const member = options.userId ? memberByUserId.get(options.userId) : undefined;
  return {
    displayName: options.displayName,
    userId: options.userId ?? '',
    firstName: member?.firstName,
    profileImageUrl: member?.profileImageUrl,
    color: options.color ?? member?.userColor ?? 'blue',
    isSelf: options.isSelf,
  };
}

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

type PrototypeSidebarNoteRowProps = {
  row: SpaceNoteRow;
  active: boolean;
  homeSpaceId: string;
  activeNoteFullId: string | undefined;
  prefetchNote: (row: SpaceNoteRow, opts?: { seedFromList?: boolean }) => void;
  onOpenNote: (row: SpaceNoteRow) => void;
  /** Shared space sidebar — show author chips and foreign-note read-only rules. */
  isScopedSharedSpace?: boolean;
  /** Hide row overflow menu (e.g. thread-proposal review is read-only). */
  hideMenu?: boolean;
  /** Thread drilldown — show remove-from-thread for this cluster. */
  threadRemoval?: { memberIds: string[] };
  /** Named folder drilldown — show remove-from-folder. */
  folderRemoval?: { folderName: string };
  /** Vertical trail dots + spine (thread drilldown). */
  trailLayout?: boolean;
  /** Thread-trail reorder: mark the source step while its ghost follows the cursor. */
  isDragging?: boolean;
  /**
   * Thread-trail row reorder (⋮ hold-to-drag). Click still opens the note menu when present.
   */
  trailReorder?: {
    noteId: string;
    reorderIndex: number;
    onDragStart: (
      event: React.DragEvent<HTMLElement>,
      noteId: string,
      previewSource?: HTMLElement | null,
    ) => void;
    onDragEnd: (event: React.DragEvent<HTMLElement>) => void;
    onDragOver: (event: React.DragEvent<HTMLElement>, insertBeforeIndex: number) => void;
    onDrop: (event: React.DragEvent<HTMLElement>) => void;
  } | null;
  /** Roster lookup for shared-space author avatars on list rows. */
  sharedSpaceMemberByUserId?: Map<string, SpaceMemberRow>;
  /** Actual shared-space owner, not leader/member moderation role. */
  viewerIsSpaceOwner?: boolean;
  /** Multi-select is on: the row toggles instead of opening, and shows a check orb. */
  selectMode?: boolean;
  /** Shift-click: extend the selection from the last one touched to this row. */
  onSelectRangeTo?: (id: string) => void;
  /** Whether this row may be selected at all — drives the hover checkbox. */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelected?: (noteId: string) => void;
};

function PrototypeSidebarFolderCard({
  folder,
  isPinned,
  onOpen,
  onTogglePin,
  onDelete,
  isDeleting,
  showMenu = true,
}: {
  folder: FolderBucket;
  isPinned: boolean;
  onOpen: () => void;
  onTogglePin: () => void;
  onDelete: (anchorRect: DOMRect) => void;
  isDeleting: boolean;
  showMenu?: boolean;
}) {
  const isNamed = folder.name !== null;
  const title = folder.name ?? 'Unsorted';
  const [menuOpen, setMenuOpen] = useState(false);
  const rowRef = useRef<HTMLLIElement>(null);
  const menuRootRef = useRef<HTMLDivElement>(null);

  return (
    <li ref={rowRef} className="proto-collection-grid-item">
      <button type="button" className="proto-collection-card" onClick={onOpen} aria-label={`${title}, ${folder.count} notes`}>
        <span className="proto-collection-card__icon">
          {isPinned ? (
            <span className="proto-collection-card__pin" aria-hidden>
              <Icon name="thumbtack" size={11} />
            </span>
          ) : null}
          <Icon name="folder" size={13} aria-hidden />
        </span>
        <div className="proto-collection-card__body">
          <div className="proto-collection-card__title">{title}</div>
          <div className="proto-collection-card__count">
            {folder.count} note{folder.count !== 1 ? 's' : ''}
          </div>
        </div>
      </button>
      {isNamed && showMenu ? (
        <div
          className={`proto-menu proto-collection-card__menu${menuOpen ? ' proto-collection-card__menu--open' : ''}`}
          ref={menuRootRef}
        >
          <button
            type="button"
            className="proto-collection-card__menu-trigger"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label="Folder actions"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen((o) => !o);
            }}
          >
            <Icon name="ellipsis-vertical" size={14} />
          </button>
          <PrototypeSidebarRowMenuPopover
            open={menuOpen}
            rowRef={rowRef}
            triggerRootRef={menuRootRef}
            onDismiss={() => setMenuOpen(false)}
            aria-label="Folder actions"
          >
            <div className="proto-menu-section" role="group">
              <button
                type="button"
                role="menuitem"
                className="proto-menu-item"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onTogglePin();
                }}
              >
                <span className="proto-menu-item__icon" aria-hidden>
                  <Icon name="thumbtack" size={PROTO_TOOLBAR_ICON_SIZE} />
                </span>
                <span className="proto-menu-item__label">{isPinned ? 'Unpin folder' : 'Pin folder'}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="proto-menu-item proto-menu-item--destructive"
                disabled={isDeleting}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onDelete(e.currentTarget.getBoundingClientRect());
                }}
              >
                <span className="proto-menu-item__icon" aria-hidden>
                  <Icon name="trash-can" size={PROTO_TOOLBAR_ICON_SIZE} />
                </span>
                <span className="proto-menu-item__label">Delete folder</span>
              </button>
            </div>
          </PrototypeSidebarRowMenuPopover>
        </div>
      ) : null}
    </li>
  );
}

function PrototypeSidebarThreadCard({
  cluster,
  title,
  isPinned,
  onOpen,
  onTogglePin,
  onDelete,
  isDeleting,
  showMenu = true,
}: {
  cluster: StudyThreadCluster;
  title: string;
  isPinned: boolean;
  onOpen: () => void;
  onTogglePin: () => void;
  onDelete: (anchorRect: DOMRect) => void;
  isDeleting: boolean;
  showMenu?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const rowRef = useRef<HTMLLIElement>(null);
  const menuRootRef = useRef<HTMLDivElement>(null);
  const preview = `${cluster.noteCount} note${cluster.noteCount !== 1 ? 's' : ''}`;

  return (
    <li ref={rowRef} className="proto-collection-grid-item">
      <button
        type="button"
        className="proto-collection-card"
        onClick={onOpen}
        aria-label={`${title}, ${preview}`}
      >
        <span className="proto-collection-card__icon">
          {isPinned ? (
            <span className="proto-collection-card__pin" aria-hidden>
              <Icon name="thumbtack" size={11} />
            </span>
          ) : null}
          <Icon name="arrow-right-arrow-left" size={13} aria-hidden />
        </span>
        <div className="proto-collection-card__body">
          <div className="proto-collection-card__title">{title}</div>
          <div className="proto-collection-card__count">{preview}</div>
        </div>
      </button>
      {showMenu ? <div
        className={`proto-menu proto-collection-card__menu${menuOpen ? ' proto-collection-card__menu--open' : ''}`}
        ref={menuRootRef}
      >
        <button
          type="button"
          className="proto-collection-card__menu-trigger"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-label="Thread actions"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenuOpen((o) => !o);
          }}
        >
          <Icon name="ellipsis-vertical" size={14} />
        </button>
        <PrototypeSidebarRowMenuPopover
          open={menuOpen}
          rowRef={rowRef}
          triggerRootRef={menuRootRef}
          onDismiss={() => setMenuOpen(false)}
          aria-label="Thread actions"
        >
          <div className="proto-menu-section" role="group">
            <button
              type="button"
              role="menuitem"
              className="proto-menu-item"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onTogglePin();
              }}
            >
              <span className="proto-menu-item__icon" aria-hidden>
                <Icon name="thumbtack" size={PROTO_TOOLBAR_ICON_SIZE} />
              </span>
              <span className="proto-menu-item__label">{isPinned ? 'Unpin Thread' : 'Pin Thread'}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="proto-menu-item proto-menu-item--destructive"
              disabled={isDeleting}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onDelete(e.currentTarget.getBoundingClientRect());
              }}
            >
              <span className="proto-menu-item__icon" aria-hidden>
                <Icon name="trash-can" size={PROTO_TOOLBAR_ICON_SIZE} />
              </span>
              <span className="proto-menu-item__label">Delete thread</span>
            </button>
          </div>
        </PrototypeSidebarRowMenuPopover>
      </div> : null}
    </li>
  );
}

function PrototypeSidebarSharedThreadCard({
  thread,
  onOpen,
  onSetCurrent,
  onDelete,
  isDeleting,
  setCurrentPending,
  showMenu = true,
}: {
  thread: SpaceGroupStudyThread;
  onOpen: () => void;
  onSetCurrent: () => void;
  onDelete: (anchorRect: DOMRect) => void;
  isDeleting: boolean;
  setCurrentPending: boolean;
  showMenu?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const rowRef = useRef<HTMLLIElement>(null);
  const menuRootRef = useRef<HTMLDivElement>(null);
  const preview = sharedThreadNoteCountPreview(thread.noteCount);

  return (
    <li ref={rowRef} className="proto-collection-grid-item">
      <button
        type="button"
        className="proto-collection-card"
        onClick={onOpen}
        aria-label={`${thread.title}, ${preview}${thread.isPinned ? ', current' : ''}`}
      >
        <span className="proto-collection-card__icon">
          {thread.isPinned ? (
            <span className="proto-collection-card__pin" aria-hidden>
              <Icon name="thumbtack" size={11} />
            </span>
          ) : null}
          <Icon name="arrow-right-arrow-left" size={13} aria-hidden />
        </span>
        <div className="proto-collection-card__body">
          <div className="proto-collection-card__title">{thread.title}</div>
          <div className="proto-collection-card__count">{preview}</div>
        </div>
      </button>
      {showMenu ? (
        <div
          className={`proto-menu proto-collection-card__menu${menuOpen ? ' proto-collection-card__menu--open' : ''}`}
          ref={menuRootRef}
        >
          <button
            type="button"
            className="proto-collection-card__menu-trigger"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label="Thread actions"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen((o) => !o);
            }}
          >
            <Icon name="ellipsis-vertical" size={14} />
          </button>
          <PrototypeSidebarRowMenuPopover
            open={menuOpen}
            rowRef={rowRef}
            triggerRootRef={menuRootRef}
            onDismiss={() => setMenuOpen(false)}
            aria-label="Thread actions"
          >
            <div className="proto-menu-section" role="group">
              {!thread.isPinned ? (
                <button
                  type="button"
                  role="menuitem"
                  className="proto-menu-item"
                  disabled={setCurrentPending}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    onSetCurrent();
                  }}
                >
                  <span className="proto-menu-item__icon" aria-hidden>
                    <Icon name="thumbtack" size={PROTO_TOOLBAR_ICON_SIZE} />
                  </span>
                  <span className="proto-menu-item__label">Set current</span>
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                className="proto-menu-item proto-menu-item--destructive"
                disabled={isDeleting}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onDelete(e.currentTarget.getBoundingClientRect());
                }}
              >
                <span className="proto-menu-item__icon" aria-hidden>
                  <Icon name="trash-can" size={PROTO_TOOLBAR_ICON_SIZE} />
                </span>
                <span className="proto-menu-item__label">Delete thread</span>
              </button>
            </div>
          </PrototypeSidebarRowMenuPopover>
        </div>
      ) : null}
    </li>
  );
}

function HighlightRow({
  isActive,
  isPinned,
  entryKind,
  title,
  rel,
  preview,
  onOpen,
  onTogglePin,
  onDelete,
  isDeleting,
  isScopedSharedSpace = false,
  authorDisplayName,
  authorColor,
  authorUserId,
  isOwnHighlight = true,
  sharedSpaceMemberByUserId,
}: {
  isActive: boolean;
  isPinned: boolean;
  entryKind: string | null | undefined;
  title: string;
  rel?: string;
  preview?: string;
  onOpen: () => void;
  onTogglePin: () => void;
  onDelete: (anchorRect: DOMRect) => void;
  isDeleting: boolean;
  isScopedSharedSpace?: boolean;
  authorDisplayName?: string;
  authorColor?: string;
  authorUserId?: string;
  isOwnHighlight?: boolean;
  sharedSpaceMemberByUserId?: Map<string, SpaceMemberRow>;
}) {
  const kindIcon = highlightEntryKindIconName(entryKind);
  const [menuOpen, setMenuOpen] = useState(false);
  const rowRef = useRef<HTMLLIElement>(null);
  const menuRootRef = useRef<HTMLDivElement>(null);

  return (
    <li
      ref={rowRef}
      className="proto-note-row-item"
      data-active={isActive ? 'true' : 'false'}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuOpen(true);
      }}
    >
      <button
        type="button"
        className="proto-note-row__main"
        onClick={onOpen}
        aria-label={`${highlightEntryKindAriaLabel(entryKind)}: ${title}`}
      >
        <div className="proto-note-row__title-line">
          {isPinned ? (
            <span className="proto-note-row__pin" aria-hidden>
              <Icon name="thumbtack" size={11} />
            </span>
          ) : null}
          <span className="proto-note-row__kind-icon" aria-hidden>
            <Icon name={kindIcon} size={11} />
          </span>
          <span className="pds-list-title proto-note-row__title-text">{title}</span>
        </div>
        <div className="pds-list-preview proto-note-row__preview">
          {isScopedSharedSpace && authorDisplayName ? (
            <SharedSpaceNoteAuthorChip
              {...sharedSpaceAuthorChipProps(sharedSpaceMemberByUserId ?? new Map(), {
                userId: authorUserId,
                displayName: authorDisplayName,
                color: authorColor,
                isSelf: isOwnHighlight,
              })}
            />
          ) : null}
          {rel ? <span className="pds-list-timestamp">{rel}</span> : null}
          {rel && preview ? '  ' : null}
          {preview ? <span>{preview}</span> : null}
        </div>
      </button>
      <div
        className={`proto-menu proto-note-row__menu${menuOpen ? ' proto-note-row__menu--open' : ''}`}
        ref={menuRootRef}
      >
        <button
          type="button"
          className="proto-note-row__menu-trigger"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-label="Highlight actions"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenuOpen((o) => !o);
          }}
        >
          <Icon name="ellipsis-vertical" size={14} />
        </button>
        <PrototypeSidebarRowMenuPopover
          open={menuOpen}
          rowRef={rowRef}
          triggerRootRef={menuRootRef}
          onDismiss={() => setMenuOpen(false)}
          aria-label="Highlight actions"
        >
          <div className="proto-menu-section" role="group">
            <button
              type="button"
              role="menuitem"
              className="proto-menu-item"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onTogglePin();
              }}
            >
              <span className="proto-menu-item__icon" aria-hidden>
                <Icon name="thumbtack" size={PROTO_TOOLBAR_ICON_SIZE} />
              </span>
              <span className="proto-menu-item__label">{isPinned ? 'Unpin highlight' : 'Pin highlight'}</span>
            </button>
            {(!isScopedSharedSpace || isOwnHighlight) ? (
            <button
              type="button"
              role="menuitem"
              className="proto-menu-item proto-menu-item--destructive"
              disabled={isDeleting}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onDelete(e.currentTarget.getBoundingClientRect());
              }}
            >
              <span className="proto-menu-item__icon" aria-hidden>
                <Icon name="trash-can" size={PROTO_TOOLBAR_ICON_SIZE} />
              </span>
              <span className="proto-menu-item__label">Delete highlight</span>
            </button>
            ) : null}
          </div>
        </PrototypeSidebarRowMenuPopover>
      </div>
    </li>
  );
}

function PrototypeSidebarNoteRow({
  row,
  active,
  homeSpaceId,
  activeNoteFullId,
  prefetchNote,
  onOpenNote,
  isScopedSharedSpace = false,
  hideMenu = false,
  threadRemoval,
  folderRemoval,
  trailLayout = false,
  isDragging = false,
  trailReorder = null,
  sharedSpaceMemberByUserId,
  viewerIsSpaceOwner = false,
  selectMode = false,
  selected = false,
  onToggleSelected,
  onSelectRangeTo,
  selectable = false,
}: PrototypeSidebarNoteRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteAnchorRect, setDeleteAnchorRect] = useState<DOMRect | null>(null);
  const suppressMenuClickRef = useRef(false);
  const rowRef = useRef<HTMLLIElement>(null);
  const menuRootRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { closeDrawer, isMobileSidebar } = useProtoShell();
  const pinNote = usePinSpaceNote();
  const deleteNote = useDeleteNote();
  const removeFromThread = useRemoveNoteFromThreadCluster();
  const removeFromFolder = useRemoveNoteFromFolder();

  const containerActionPending = removeFromThread.isPending || removeFromFolder.isPending;

  const hoverPrefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelHoverPrefetch = useCallback(() => {
    if (hoverPrefetchTimerRef.current !== null) {
      clearTimeout(hoverPrefetchTimerRef.current);
      hoverPrefetchTimerRef.current = null;
    }
  }, []);
  const scheduleHoverPrefetch = useCallback(() => {
    cancelHoverPrefetch();
    hoverPrefetchTimerRef.current = setTimeout(() => {
      hoverPrefetchTimerRef.current = null;
      prefetchNote(row);
    }, 150);
  }, [cancelHoverPrefetch, prefetchNote, row]);
  useEffect(() => cancelHoverPrefetch, [cancelHoverPrefetch]);

  const iso = row.updatedAt ?? row.createdAt ?? null;
  const rel = protoRelativeCaptionAbbrev(iso);
  const preview = stripHtmlPreview(row.content, 80);
  const rowTitle = stripServerAutoUntitledNoteTitleForDisplay(row.title?.trim() ?? '') || 'New Note';
  const title = rowTitle;
  const pinned = row.isPinned === true;
  const showAuthorChip = isScopedSharedSpace && Boolean(row.authorDisplayName);
  /**
   * My Home only. Inside a shared space every row is in that space, so the badge
   * would be noise on every row. Icon-only at one space keeps the list quiet — the
   * count appears only when it actually disambiguates.
   */
  const sharedSpaceCount = row.sharedSpaceCount ?? 0;
  const showSharedIndicator = !isScopedSharedSpace && sharedSpaceCount > 0;
  // Shared with the multi-select bulk bar — see `resolveNoteRowCapabilities`. Two
  // surfaces deriving these rules separately is how they drift.
  const { mayOrganize, mayPin, mayDelete, mayManageThread } = resolveNoteRowCapabilities({
    isOwnNote: row.isOwnNote,
    isScopedSharedSpace,
    viewerIsSpaceOwner,
  });
  const rowHideMenu =
    hideMenu ||
    // While selecting, a per-row ⋯ competes with the batch being assembled — and its
    // actions would apply to one note while the selection implies many.
    selectMode ||
    (!mayPin && !mayDelete && !(folderRemoval && mayOrganize) && !(threadRemoval && mayManageThread));

  const onPin = () => {
    setMenuOpen(false);
    pinNote.mutate(
      {
        spaceId: homeSpaceId,
        noteId: row.id,
        isPinned: !pinned,
        spaceKind: isScopedSharedSpace ? 'shared' : 'personal',
      },
      {
        onError: (err) => {
          toastError(err, 'Could not update pin');
        },
      },
    );
  };

  const onRemoveFromThread = () => {
    if (!threadRemoval) return;
    setMenuOpen(false);
    removeFromThread.mutate(
      { spaceId: homeSpaceId, memberIds: threadRemoval.memberIds, noteId: row.id },
      {
        onError: (err) => {
          toastError(err, 'Could not remove from Thread');
        },
      },
    );
  };

  const onRemoveFromFolder = () => {
    if (!folderRemoval) return;
    setMenuOpen(false);
    removeFromFolder.mutate(
      {
        row,
        folderName: folderRemoval.folderName,
        spaceId: homeSpaceId,
        spaceKind: isScopedSharedSpace ? 'shared' : 'personal',
      },
      {
        onError: (err) => {
          toastError(err, 'Could not remove from folder');
        },
      },
    );
  };

  /**
   * Anchors to the row, not the "Delete note" item — the row is what
   * `measureMenuPosition` anchors the ⋯ menu to, so the confirm takes over the menu's
   * slot instead of stacking below its last item.
   */
  const onDeleteRequest = () => {
    const rowRect = rowRef.current?.getBoundingClientRect();
    setMenuOpen(false);
    if (!rowRect) return;
    setDeleteAnchorRect(rowRect);
    setDeleteConfirmOpen(true);
  };

  const onDeleteConfirm = () => {
    deleteNote.mutate(
      { noteId: row.id, spaceId: homeSpaceId },
      {
        onSuccess: () => {
          setDeleteConfirmOpen(false);
          const deletedId = normalizeNoteIdFromParam(row.id);
          if (activeNoteFullId && deletedId === normalizeNoteIdFromParam(activeNoteFullId)) {
            navigate({ to: prototypeHomeRouteTo(), replace: true });
            if (isMobileSidebar) closeDrawer({ preserveHistory: true });
          }
        },
        onError: (err) => {
          setDeleteConfirmOpen(false);
          toastError(err, 'Could not delete note');
        },
      },
    );
  };

  const rowMainClass = trailLayout ? 'proto-thread-trail__step-main proto-note-row__main' : 'proto-note-row__main';

  const mainButton = (
    <button
      type="button"
      className={rowMainClass}
      // Select mode retargets the row's primary action rather than adding a control:
      // a second button inside the row would also become a keyboard nav stop, because
      // SIDEBAR_LIST_ROW_SELECTOR matches on `button.proto-note-row__main`.
      aria-pressed={selectMode ? selected : undefined}
      onClick={(e) => {
        cancelHoverPrefetch();
        /* ⌘/Ctrl adds one, Shift takes a range — the two gestures every list on
           this platform already answers to. They work from a standing start, so
           selecting never begins with a trip to a menu. */
        if (e.metaKey || e.ctrlKey) {
          onToggleSelected?.(row.id);
          return;
        }
        if (e.shiftKey && onSelectRangeTo) {
          onSelectRangeTo(row.id);
          return;
        }
        /* Once something is selected the list is in a selecting frame of mind,
           so a plain click keeps selecting rather than yanking you into a note
           and dropping the set you were building. Esc or the last deselect ends
           it — there is no mode to leave. */
        if (selectMode) {
          onToggleSelected?.(row.id);
          return;
        }
        onOpenNote(row);
      }}
      onMouseEnter={selectMode ? undefined : scheduleHoverPrefetch}
      onMouseLeave={cancelHoverPrefetch}
      onFocus={selectMode ? undefined : scheduleHoverPrefetch}
      onBlur={cancelHoverPrefetch}
    >
      <div className={trailLayout ? 'proto-thread-trail__title-line' : 'proto-note-row__title-line'}>
        {pinned && !trailLayout ? (
          <span className="proto-note-row__pin" aria-hidden>
            <Icon name="thumbtack" size={12} />
          </span>
        ) : null}
        <span className="pds-list-title proto-note-row__title-text">{title}</span>
        {trailLayout && active ? <span className="proto-side-panel__current-badge">Current</span> : null}
        {trailLayout && pinned ? (
          <span className="proto-note-row__pin" aria-hidden>
            <Icon name="thumbtack" size={12} />
          </span>
        ) : null}
      </div>
      {trailLayout ? (
        <div className="pds-list-preview proto-note-row__preview">
          {showAuthorChip ? (
            <SharedSpaceNoteAuthorChip
              {...sharedSpaceAuthorChipProps(sharedSpaceMemberByUserId ?? new Map(), {
                userId: row.authorUserId,
                displayName: row.authorDisplayName ?? 'Member',
                color: row.authorColor,
                isSelf: row.isOwnNote === true,
              })}
            />
          ) : null}
          {showSharedIndicator ? (
            <span
              className="proto-note-row__shared"
              aria-label={`Shared with ${sharedSpaceCount} ${sharedSpaceCount === 1 ? 'space' : 'spaces'}`}
            >
              <Icon name="user-group" size={11} aria-hidden />
              {sharedSpaceCount > 1 ? sharedSpaceCount : null}
            </span>
          ) : null}
          {rel ? <span className="pds-list-timestamp">{rel}</span> : null}
          {rel && preview ? '  ' : null}
          {preview ? <span>{preview}</span> : null}
        </div>
      ) : (
        <div className="pds-list-preview proto-note-row__preview">
          {showAuthorChip ? (
            <SharedSpaceNoteAuthorChip
              {...sharedSpaceAuthorChipProps(sharedSpaceMemberByUserId ?? new Map(), {
                userId: row.authorUserId,
                displayName: row.authorDisplayName ?? 'Member',
                color: row.authorColor,
                isSelf: row.isOwnNote === true,
              })}
            />
          ) : null}
          {showSharedIndicator ? (
            <span
              className="proto-note-row__shared"
              aria-label={`Shared with ${sharedSpaceCount} ${sharedSpaceCount === 1 ? 'space' : 'spaces'}`}
            >
              <Icon name="user-group" size={11} aria-hidden />
              {sharedSpaceCount > 1 ? sharedSpaceCount : null}
            </span>
          ) : null}
          {rel ? <span className="pds-list-timestamp">{rel}</span> : null}
          {rel && preview ? '  ' : null}
          {preview ? <span>{preview}</span> : null}
        </div>
      )}
    </button>
  );

  const canTrailReorder = Boolean(trailReorder);
  const showMenuChrome = !rowHideMenu || canTrailReorder;

  const menuBlock = !showMenuChrome ? null : (
      <div
        className={`proto-menu proto-note-row__menu${menuOpen ? ' proto-note-row__menu--open' : ''}${
          canTrailReorder ? ' proto-note-row__menu--reorder' : ''
        }`}
        ref={menuRootRef}
      >
        <button
          type="button"
          className="proto-note-row__menu-trigger"
          aria-expanded={rowHideMenu ? undefined : menuOpen}
          aria-haspopup={rowHideMenu ? undefined : 'menu'}
          aria-label={
            canTrailReorder
              ? rowHideMenu
                ? `Reorder ${rowTitle}`
                : `Note actions, drag to reorder ${rowTitle}`
              : 'Note actions'
          }
          title={canTrailReorder ? 'Drag to reorder' : undefined}
          draggable={canTrailReorder}
          disabled={
            !canTrailReorder && (pinNote.isPending || deleteNote.isPending || containerActionPending)
          }
          onMouseDown={(e) => {
            if (canTrailReorder) e.stopPropagation();
          }}
          onDragStart={
            canTrailReorder && trailReorder
              ? (e) => {
                  suppressMenuClickRef.current = true;
                  setMenuOpen(false);
                  const step = e.currentTarget.closest('.proto-thread-trail__step') as HTMLElement | null;
                  trailReorder.onDragStart(e, trailReorder.noteId, step);
                }
              : undefined
          }
          onDragEnd={
            canTrailReorder && trailReorder
              ? (e) => {
                  trailReorder.onDragEnd(e);
                  window.setTimeout(() => {
                    suppressMenuClickRef.current = false;
                  }, 0);
                }
              : undefined
          }
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (suppressMenuClickRef.current) {
              suppressMenuClickRef.current = false;
              return;
            }
            if (rowHideMenu) return;
            setMenuOpen((o) => !o);
          }}
        >
          <Icon name="ellipsis-vertical" size={14} />
        </button>
        {rowHideMenu ? null : (
        <PrototypeSidebarRowMenuPopover
          open={menuOpen}
          rowRef={rowRef}
          triggerRootRef={menuRootRef}
          onDismiss={() => setMenuOpen(false)}
          aria-label="Note actions"
        >
          <div className="proto-menu-section" role="group">
            {mayPin ? <button
              type="button"
              role="menuitem"
              className="proto-menu-item"
              disabled={pinNote.isPending}
              onClick={(e) => {
                e.stopPropagation();
                onPin();
              }}
            >
              <span className="proto-menu-item__icon" aria-hidden>
                <Icon name="thumbtack" size={PROTO_TOOLBAR_ICON_SIZE} />
              </span>
              <span className="proto-menu-item__label">{pinned ? 'Unpin note' : 'Pin note'}</span>
            </button> : null}
            {threadRemoval && mayManageThread ? (
              <button
                type="button"
                role="menuitem"
                className="proto-menu-item"
                disabled={removeFromThread.isPending}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveFromThread();
                }}
              >
                <span className="proto-menu-item__icon" aria-hidden>
                  <Icon name="arrow-right-arrow-left" size={PROTO_TOOLBAR_ICON_SIZE} />
                </span>
                <span className="proto-menu-item__label">Remove from Thread</span>
              </button>
            ) : null}
            {folderRemoval && mayOrganize ? (
              <button
                type="button"
                role="menuitem"
                className="proto-menu-item"
                disabled={removeFromFolder.isPending}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveFromFolder();
                }}
              >
                <span className="proto-menu-item__icon" aria-hidden>
                  <Icon name="folder" size={PROTO_TOOLBAR_ICON_SIZE} />
                </span>
                <span className="proto-menu-item__label">Remove from folder</span>
              </button>
            ) : null}
            {mayDelete ? <button
              type="button"
              role="menuitem"
              className="proto-menu-item proto-menu-item--destructive"
              disabled={deleteNote.isPending}
              onClick={(e) => {
                e.stopPropagation();
                onDeleteRequest();
              }}
            >
              <span className="proto-menu-item__icon" aria-hidden>
                <Icon name="trash-can" size={PROTO_TOOLBAR_ICON_SIZE} />
              </span>
              <span className="proto-menu-item__label">Delete note</span>
            </button> : null}
          </div>
        </PrototypeSidebarRowMenuPopover>
        )}
      </div>
  );

  const deleteDialog =
    rowHideMenu || !deleteConfirmOpen || !deleteAnchorRect ? null : (
      <ProtoConfirmDialog
        anchorRect={deleteAnchorRect}
        alignRight
        confirmLabel="Delete"
        busy={deleteNote.isPending}
        onConfirm={onDeleteConfirm}
        onCancel={() => {
          if (!deleteNote.isPending) {
            setDeleteConfirmOpen(false);
            setDeleteAnchorRect(null);
          }
        }}
      />
    );

  if (trailLayout) {
    const reorderIndex = trailReorder?.reorderIndex ?? 0;
    const insertBeforeFromPointer = (e: React.DragEvent<HTMLElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      return e.clientY < rect.top + rect.height / 2 ? reorderIndex : reorderIndex + 1;
    };
    return (
      <li
        ref={rowRef}
        className={`proto-thread-trail__step${active ? ' proto-thread-trail__step--focus' : ''}${
          isDragging ? ' proto-thread-trail__step--dragging' : ''
        }`}
        data-active={active ? 'true' : 'false'}
        role="listitem"
        aria-current={active ? 'true' : undefined}
        onDragEnter={
          trailReorder
            ? (e) => trailReorder.onDragOver(e, insertBeforeFromPointer(e))
            : undefined
        }
        onDragOver={
          trailReorder
            ? (e) => trailReorder.onDragOver(e, insertBeforeFromPointer(e))
            : undefined
        }
        onDrop={trailReorder ? trailReorder.onDrop : undefined}
      >
        <ProtoThreadTrailOrb active={active} />
        <div className="proto-thread-trail__step-body">
          {mainButton}
          {menuBlock}
        </div>
        {deleteDialog}
      </li>
    );
  }

  return (
    <li
      ref={rowRef}
      className={[
        'proto-note-row-item',
        row.isNewSinceVisit ? 'proto-note-row--unseen' : '',
        selectMode ? 'proto-note-row-item--selectable' : '',
        selected ? 'proto-note-row-item--selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      // While a selection stands "active" would mean the open note, which is not what
      // the row is reporting any more — the selection is.
      data-active={selectMode ? (selected ? 'true' : 'false') : active ? 'true' : 'false'}
    >
      {/*
        Sibling of the main button, not a child of it. `SIDEBAR_LIST_ROW_SELECTOR`
        matches `button.proto-note-row__main`, so a differently-classed button here
        adds a pointer target without adding a keyboard nav stop — arrow keys still
        walk the list one row at a time.
      */}
      {selectable ? (
        <button
          type="button"
          className="proto-note-row__select"
          role="checkbox"
          aria-checked={selected}
          aria-label={selected ? `Deselect ${title}` : `Select ${title}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.shiftKey && onSelectRangeTo) onSelectRangeTo(row.id);
            else onToggleSelected?.(row.id);
          }}
        >
          {selected ? (
            <span className="proto-accent-check-orb proto-accent-check-orb--selected">
              <Icon name="check" size={11} />
            </span>
          ) : (
            <span className="proto-select-orb-idle" />
          )}
        </button>
      ) : null}
      {mainButton}
      {menuBlock}
      {deleteDialog}
    </li>
  );
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

const HIGHLIGHT_KIND_OPTIONS: { id: HighlightKindFilter; label: string; iconName?: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'notes', label: 'Notes', iconName: 'note-sticky' },
  { id: 'connected', label: 'Connected', iconName: 'arrow-right-arrow-left' },
  { id: 'scripture', label: 'Scripture', iconName: 'scroll' },
  { id: 'references', label: 'References', iconName: 'lines-leaning' },
];

function highlightKindMatches(filter: HighlightKindFilter, entryKind: string | null | undefined): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'notes':
      return entryKind === 'workspace' || entryKind === 'miniNote';
    case 'connected':
      return entryKind === 'linkedNote';
    case 'scripture':
      return entryKind === 'scriptureLink';
    case 'references':
      return entryKind === 'reference';
    default:
      return true;
  }
}

function ProtoNotesListLoading() {
  return <ProtoSpaceLoading label="Loading notes" />;
}

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

function threadProposalSubtitle(proposal: ThreadProposal): string {
  const n = proposal.notes.length;
  switch (proposal.variant) {
    case 'arc':
      return `${n} ${n === 1 ? 'note' : 'notes'} · on your mind`;
    case 'crossref':
      return `${n} ${n === 1 ? 'note connects' : 'notes connect'} these passages`;
    default:
      return `${n} ${n === 1 ? 'note shares' : 'notes share'} this theme`;
  }
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
    sidebarSelectedNoteIds,
    setSidebarSelectedNoteIds,
    setSidebarFolderDrilldown: setActiveFolderKey,
    sidebarFolderDrilldown: activeFolderKey,
    sidebarThreadDrilldownId,
    setSidebarThreadDrilldownId,
    sidebarThreadProposal,
    setSidebarThreadProposal,
    setSidebarLayer,
    setSidebarListMode,
    standaloneScripturePassage,
    openStandaloneScripturePassage,
    dismissStandaloneScripturePassage,
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

  useEffect(() => {
    const onMoveInList = (event: Event) => {
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
  const [createFolderSheetOpen, setCreateFolderSheetOpen] = useState(false);
  const [createThreadSheetOpen, setCreateThreadSheetOpen] = useState(false);
  const [createThreadPrefill, setCreateThreadPrefill] = useState<{
    noteIds: string[];
    threadName?: string;
  } | null>(null);
  const openCreateThreadSheet = useCallback(
    (prefill?: { noteIds: string[]; threadName?: string } | null) => {
      if (!canCreateSidebarCollections) return;
      setCreateThreadPrefill(prefill ?? null);
      setCreateThreadSheetOpen(true);
    },
    [canCreateSidebarCollections],
  );
  const openCreateFolderSheet = useCallback(() => {
    if (!canCreateSidebarCollections) return;
    setCreateFolderSheetOpen(true);
  }, [canCreateSidebarCollections]);
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
    setPinnedHighlightIds(loadPinnedHighlightIds(homeSpaceId ?? undefined));
    setPinnedFolderIds(loadPinnedFolderIds(homeSpaceId ?? undefined));
    setPinnedThreadClusterIds(loadPinnedThreadClusterIds(homeSpaceId ?? undefined));
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
  const connectNoteMutation = useConnectNote();
  const updateThreadTitleMutation = useUpdateStudyThreadTitle();
  const [isAcceptingProposal, setIsAcceptingProposal] = useState(false);

  const closeThreadProposal = useCallback(() => {
    setSidebarThreadProposal(undefined);
    setSidebarLayer('space'); // return to Home (where the proposal was launched)
    setQ('');
  }, [setSidebarThreadProposal, setSidebarLayer]);

  const handleAcceptThreadProposal = useCallback(async () => {
    if (!canCreateSidebarCollections || !homeSpaceId || !sidebarThreadProposal) return;
    const [first, ...rest] = sidebarThreadProposal.notes.map((n) => n.id);
    if (!first) return;
    setIsAcceptingProposal(true);
    try {
      // Star-connect: each other note becomes a child of `first`, forming one
      // connected component. `first` ends as highest-degree (representative) node.
      for (const linkedNoteId of rest) {
        await connectNoteMutation.mutateAsync({ parentNoteId: first, linkedNoteId, spaceId: homeSpaceId });
      }
      // Name the cluster after the theme (the rep note carries the title).
      await updateThreadTitleMutation.mutateAsync({
        repNoteId: first,
        spaceId: homeSpaceId,
        title: sidebarThreadProposal.subject,
        userOverride: true,
      });
      try { window.toast?.success('Thread created'); } catch { /* ignore */ }
      setSidebarThreadProposal(undefined);
      setSidebarListMode('threads'); // flips to the list layer
      setSidebarThreadDrilldownId(threadClusterDrillSlug(first));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not create Thread';
      try { window.toast?.error(msg); } catch { /* ignore */ }
    } finally {
      setIsAcceptingProposal(false);
    }
  }, [
    canCreateSidebarCollections,
    homeSpaceId,
    sidebarThreadProposal,
    connectNoteMutation,
    updateThreadTitleMutation,
    setSidebarThreadProposal,
    setSidebarListMode,
    setSidebarThreadDrilldownId,
  ]);

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

  const deleteNotesBatch = useDeleteNotesBatch();
  const removeNotesFromSpace = useRemoveNotesFromSpaceBatch();

  const [bulkFolderSheetOpen, setBulkFolderSheetOpen] = useState(false);
  const [bulkShareSheetOpen, setBulkShareSheetOpen] = useState(false);
  /*
    The confirm anchors to the button that raised it, like every other delete in
    this file. `main-column-top-right` put it in the opposite corner of the
    window from a bar pinned to the bottom of the sidebar — far enough that it
    read as an unrelated alert rather than an answer to the tap.
  */
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState<DOMRect | null>(null);
  const [bulkRemoveConfirmOpen, setBulkRemoveConfirmOpen] = useState<DOMRect | null>(null);

  const normalizeSpaceIdForCompare = (id: string | null | undefined) =>
    !id ? '' : id.startsWith('space_') ? id : `space_${id}`;
  const { data: bulkNav } = useNavigation();
  /**
   * Where a selection can be shared. Own spaces only — associating into a space you
   * merely belong to is a different act (and `add-items` checks membership anyway), and
   * ministry channels are read-only targets.
   */
  const bulkShareTargets = useMemo(
    () =>
      (bulkNav?.spaces ?? []).filter(
        (sp) => isPersonalSharedSpace(sp) && normalizeSpaceIdForCompare(sp.id) !== normalizeSpaceIdForCompare(homeSpaceId),
      ),
    [bulkNav?.spaces, homeSpaceId],
  );

  const [bulkSharePending, setBulkSharePending] = useState(false);
  /**
   * `add-items` is the batch twin of `add-note` — it takes the whole id list, carries no
   * write rate limit, and reports per-item problems in `errors` rather than failing the
   * request. The SPA had never called it.
   */
  const onBulkShareToSpace = useCallback(
    async (targetSpaceId: string) => {
      const ids = [...sidebarSelectedNoteIds];
      setBulkSharePending(true);
      try {
        const res = await api.post<{ updatedNotes?: number; errors?: string[] }>(
          `/api/spaces/${encodeURIComponent(targetSpaceId)}/add-items`,
          { noteIds: ids, threadIds: [] },
        );
        const went = res.updatedNotes ?? 0;
        toast.success(
          went === ids.length
            ? `Shared ${went} note${went === 1 ? '' : 's'}`
            : `Shared ${went} of ${ids.length} notes`,
        );
        setBulkShareSheetOpen(false);
        setSidebarSelectMode(false);
        // `['space', id, 'notes', …]` is the sidebar list's key (useSpace.ts).
        void queryClient.invalidateQueries({ queryKey: ['space'] });
        void queryClient.invalidateQueries({ queryKey: ['navigation'] });
      } catch (err) {
        toastError(err, 'Could not share these notes');
      } finally {
        setBulkSharePending(false);
      }
    },
    [sidebarSelectedNoteIds, queryClient, setSidebarSelectMode],
  );

  /**
   * Both bulk destructives report what actually went, not what was asked for. A batch can
   * partially succeed — a note someone else already moved, a stale id — and one flat
   * "Deleted" would be a lie.
   */
  const onConfirmBulkDelete = useCallback(() => {
    const ids = [...sidebarSelectedNoteIds];
    deleteNotesBatch.mutate(ids, {
      onSuccess: (res) => {
        setBulkDeleteConfirmOpen(null);
        setSidebarSelectMode(false);
        const went = res.deletedNoteIds?.length ?? 0;
        toast.success(
          went === ids.length
            ? `Deleted ${went} note${went === 1 ? '' : 's'}`
            : `Deleted ${went} of ${ids.length} notes`,
        );
      },
      onError: (err) => {
        setBulkDeleteConfirmOpen(null);
        toastError(err, 'Could not delete these notes');
      },
    });
  }, [sidebarSelectedNoteIds, deleteNotesBatch, setSidebarSelectMode]);

  const onConfirmBulkRemoveFromSpace = useCallback(() => {
    const ids = [...sidebarSelectedNoteIds];
    // `homeSpaceId` is the scoped space while a shared space is in scope.
    if (!isScopedSharedSpace || !homeSpaceId) return;
    removeNotesFromSpace.mutate(
      { spaceId: homeSpaceId, noteIds: ids },
      {
        onSuccess: (res) => {
          setBulkRemoveConfirmOpen(null);
          setSidebarSelectMode(false);
          const went = res.removedNotes ?? 0;
          toast.success(
            went === ids.length
              ? `Removed ${went} note${went === 1 ? '' : 's'}`
              : `Removed ${went} of ${ids.length} notes`,
          );
        },
        onError: (err) => {
          setBulkRemoveConfirmOpen(null);
          toastError(err, 'Could not remove these notes');
        },
      },
    );
  }, [sidebarSelectedNoteIds, isScopedSharedSpace, homeSpaceId, removeNotesFromSpace, setSidebarSelectMode]);

  /** Ceiling matched to `copy-notes`' server-side `.slice(0, 50)`. */
  const SELECTION_CAP = NOTE_SELECTION_CAP;
  /**
   * Folder assignment is the one action that still fans out to a request per note, and
   * writes are capped at 20/min per endpoint — so it disables past that. Same rule as
   * every other action, just triggered by size rather than permission: it greys out when
   * it cannot apply to the whole selection.
   */
  const FOLDER_FANOUT_CAP = 20;
  /** Mirrors `MIN_THREAD_NOTES` in the create sheet — a Thread needs two ends. */
  const MIN_BULK_THREAD_NOTES = 2;

  const selectedNoteIdSet = useMemo(() => new Set(sidebarSelectedNoteIds), [sidebarSelectedNoteIds]);

  /** Rows currently listed, in list order — what "Select all" and a range mean. */
  const selectableNotes = useMemo(
    () => notesForMode.slice(0, SELECTION_CAP),
    [notesForMode],
  );

  /**
   * Selecting is a state, not a mode.
   *
   * It begins the moment one note is selected — by its hover checkbox or a
   * ⌘-click — and ends when the last one is deselected or Esc clears the set.
   * The old explicit mode is still honoured so "Select notes" keeps working
   * from the list menu, but nothing requires it any more.
   */
  const selectionActive = sidebarSelectMode || sidebarSelectedNoteIds.length > 0;

  /** Anchor for shift-click, so a range means "from the last one you touched". */
  const selectionAnchorRef = useRef<string | null>(null);

  const toggleNoteSelected = useCallback(
    (id: string) => {
      selectionAnchorRef.current = id;
      setSidebarSelectedNoteIds(toggleNoteSelection(sidebarSelectedNoteIds, id));
    },
    [sidebarSelectedNoteIds, setSidebarSelectedNoteIds],
  );

  const selectRangeTo = useCallback(
    (id: string) => {
      setSidebarSelectedNoteIds(
        extendNoteSelectionRange({
          selected: sidebarSelectedNoteIds,
          orderedIds: selectableNotes.map((n) => n.id),
          anchorId: selectionAnchorRef.current,
          targetId: id,
        }),
      );
      selectionAnchorRef.current = id;
    },
    [selectableNotes, sidebarSelectedNoteIds, setSidebarSelectedNoteIds],
  );

  /* Esc is the way out, which is why nothing needs a Done button. */
  useEffect(() => {
    if (!selectionActive) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setSidebarSelectedNoteIds([]);
      setSidebarSelectMode(false);
      selectionAnchorRef.current = null;
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selectionActive, setSidebarSelectedNoteIds, setSidebarSelectMode]);

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
        everyRowAllows(bulkCapabilityRows, 'mayOrganize') && selectedRows.length <= FOLDER_FANOUT_CAP,
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
    [bulkCapabilityRows, selectedRows.length],
  );

  const allSelectableSelected =
    selectableNotes.length > 0 && selectableNotes.every((n) => selectedNoteIdSet.has(n.id));

  const toggleSelectAll = useCallback(() => {
    setSidebarSelectedNoteIds(allSelectableSelected ? [] : selectableNotes.map((n) => n.id));
  }, [allSelectableSelected, selectableNotes, setSidebarSelectedNoteIds]);

  /**
   * Bulk action bar. Quiet controls on the `.proto-collection-grid-actions` recipe — four
   * gradient buttons would read as four competing primary actions.
   *
   * The set swaps with scope rather than greying half of itself out: `mayDelete` is false
   * for everyone inside a shared-space list and `mayShareToSpace` is false in any shared
   * context, so a fixed bar would sit two-thirds dead there.
   */
  const bulkBar = (
    <div className="proto-collection-grid-actions proto-bulk-bar">
      <button
        type="button"
        className="proto-bulk-bar__btn"
        disabled={!bulkActions.canOrganize}
        title={
          bulkActions.count > FOLDER_FANOUT_CAP
            ? `A folder can take up to ${FOLDER_FANOUT_CAP} notes at a time`
            : 'Put these notes in a folder'
        }
        onClick={() => setBulkFolderSheetOpen(true)}
      >
        {/* "Folder", not "File" — this app has literal files on its shelves now,
            and the verb would read as the noun. The icon carries the doing. */}
        <Icon name="folder" size={15} aria-hidden />
        <span className="proto-bulk-bar__label">Folder</span>
      </button>
      {bulkActions.canThread ? (
        <button
          type="button"
          className="proto-bulk-bar__btn"
          title="Start a Thread from these notes"
          onClick={() => openCreateThreadSheet({ noteIds: sidebarSelectedNoteIds })}
        >
          <Icon name="arrow-right-arrow-left" size={15} aria-hidden />
          <span className="proto-bulk-bar__label">Thread</span>
        </button>
      ) : null}
      {isScopedSharedSpace ? (
        <button
          type="button"
          className="proto-bulk-bar__btn proto-bulk-bar__btn--danger"
          disabled={!bulkActions.canRemoveFromSpace}
          title="Take these notes out of this space"
          onClick={(e) => setBulkRemoveConfirmOpen(e.currentTarget.getBoundingClientRect())}
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
            onClick={() => setBulkShareSheetOpen(true)}
          >
            <Icon name="share" size={15} aria-hidden />
            <span className="proto-bulk-bar__label">Share</span>
          </button>
          <button
            type="button"
            className="proto-bulk-bar__btn proto-bulk-bar__btn--danger"
            disabled={!bulkActions.canDelete}
            title="Delete these notes"
            onClick={(e) => setBulkDeleteConfirmOpen(e.currentTarget.getBoundingClientRect())}
          >
            <Icon name="trash-can" size={15} aria-hidden />
            <span className="proto-bulk-bar__label">Delete</span>
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
    dismissStandaloneScripturePassage();
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
          selectMode={selectionActive}
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
  const removeThreadCluster = useRemoveThreadCluster();
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

  const onHighlightRow = (r: PrototypeHighlightStudyThreadRow) => {
    if (!homeSpaceId) return;
    if (!r.parentNoteId) return;
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
        // note's own reference pill) rather than the standalone full-screen passage pane.
        if (r.parentNoteId) {
          dismissStandaloneScripturePassage();
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
          return;
        }
        // No source note to anchor the dock to — fall back to the standalone passage view.
        if (isPrototypeNotePath(pathname)) {
          navigate({ to: prototypeHomeRouteTo() });
        }
        openStandaloneScripturePassage({
          canonicalReference: canon,
          translationCode: trans,
          focusedHighlightThreadId: r.id,
        });
        afterNav();
        return;
      }
    }
    dismissStandaloneScripturePassage();
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
          <button type="button" className="proto-sidebar-back-row__button" onClick={backTarget.action}>
            <Icon name="caret-left" size={13} className="proto-sidebar-back-row__chevron" aria-hidden />
            {backTarget.kind ? (
              <span className="proto-sidebar-back-row__kind">{backTarget.kind}</span>
            ) : null}
            <span className="proto-sidebar-back-row__label">{backTarget.label}</span>
          </button>
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
            disabled={selectableNotes.length === 0}
          >
            {allSelectableSelected ? 'Deselect all' : 'Select all'}
          </button>
          <span className="proto-select-bar__count">
            {sidebarSelectedNoteIds.length === 1
              ? '1 selected'
              : `${sidebarSelectedNoteIds.length} selected`}
          </span>
          <button
            type="button"
            className="proto-select-bar__action proto-select-bar__action--done"
            onClick={() => {
              setSidebarSelectedNoteIds([]);
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
            onOpenCreateThreadPrefill={({ noteIds, threadName }) => {
              openCreateThreadSheet({ noteIds, threadName });
            }}
          />
        ) : sidebarThreadProposal ? (
          <div className="proto-thread-review">
            <div className="proto-thread-review__header">
              <span className="proto-home-card__icon-orb" aria-hidden>
                <Icon name="arrow-right-arrow-left" size={13} />
              </span>
              <div>
                <div className="proto-thread-review__title-row">
                  <p className="proto-thread-review__title">{sidebarThreadProposal.subject}</p>
                  <span className="proto-thread-review__badge">Suggested</span>
                </div>
                <p className="proto-thread-review__subtitle">{threadProposalSubtitle(sidebarThreadProposal)}</p>
              </div>
            </div>
            <ul className="proto-note-list proto-thread-review__list">
              {sidebarThreadProposal.notes.map((note) => {
                const row = resolveDrillNoteRow({ id: note.id, title: note.title });
                return (
                  <PrototypeSidebarNoteRow
                    key={note.id}
                    row={row}
                    active={!!(activeNoteFullId && note.id === activeNoteFullId)}
                    homeSpaceId={homeSpaceId}
                    activeNoteFullId={activeNoteFullId}
                    prefetchNote={prefetchProposalNote}
                    hideMenu
                    onOpenNote={(r) => {
                      onNoteRow(r);
                    }}
                  />
                );
              })}
            </ul>
            <div className="proto-thread-review__actions">
              <button
                type="button"
                className="proto-thread-review__dismiss"
                onClick={closeThreadProposal}
                disabled={isAcceptingProposal}
              >
                Not now
              </button>
              {canCreateSidebarCollections ? (
                <button
                  type="button"
                  className="proto-thread-review__btn proto-thread-review__btn--primary"
                  onClick={handleAcceptThreadProposal}
                  disabled={isAcceptingProposal}
                >
                  {isAcceptingProposal ? 'Creating…' : 'Create Thread'}
                </button>
              ) : null}
            </div>
          </div>
        ) : searchActive ? (
          <PrototypeSidebarSearchResults
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
                        selectMode={selectionActive}
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
                        selectMode={selectionActive}
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
                      isDeleting={
                        removeFolder.isPending && removeFolder.variables?.folderName === col.name
                      }
                    />
                  ))}
                </ul>
                {/* After the grid, not before it: the footer is the last thing in
                    the pane, so the list starts at the top where reading starts. */}
                {!q.trim() && canCreateSidebarCollections ? (
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
                {threadDrillQuery.isLoading ? (
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
                  <ul
                    className={`proto-note-list proto-thread-trail__spine proto-thread-trail__spine--fill proto-sidebar-thread-trail${threadDrillDrag.draggingId ? ' proto-thread-trail__spine--dragging' : ''}`}
                    role="list"
                  >
                    {threadDrillDisplayNodes.map((node, index) => {
                      const row = resolveDrillNoteRow({
                        id: node.id,
                        title: node.title || node.resourceTitle || null,
                        content: node.content ?? node.resourceDescription ?? '',
                        updatedAt: node.updatedAt,
                      });
                      return (
                          <PrototypeSidebarNoteRow
                            key={node.id}
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
                            trailReorder={
                              threadDrillDrag.showDragHandle
                                ? {
                                    noteId: node.id,
                                    reorderIndex: index,
                                    onDragStart: threadDrillDrag.handleDragStart,
                                    onDragEnd: threadDrillDrag.handleDragEnd,
                                    onDragOver: threadDrillDrag.handleDragOver,
                                    onDrop: threadDrillDrag.handleDrop,
                                  }
                                : null
                            }
                            threadRemoval={{ memberIds: threadDrillMemberIds }}
                            onOpenNote={(r) => {
                              onNoteRow(r);
                            }}
                          />
                      );
                    })}
                  </ul>
                )}
              </>
            ) : null}

            {mode === 'threads' && !sidebarThreadDrilldownId ? (
              isScopedSharedSpace ? (
              <>
                {groupThreadsQuery.isLoading ? (
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
                        New thread
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
                          New thread
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
                          New thread
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </>
              ) : (
              <>
                {studyThreadsQuery.isLoading ? (
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
                        New thread
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
                          New thread
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
                          isDeleting={removeThreadCluster.isPending && threadDeleteTarget?.cluster.id === cluster.id}
                        />
                      );
                    })}
                  </ul>
                  {!q.trim() && canCreateSidebarCollections ? (
                    <div className="proto-collection-grid-actions">
                      <button
                        type="button"
                        className="proto-collection-grid-actions__btn"
                        onClick={() => openCreateThreadSheet()}
                      >
                        New thread
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
                      <li key={p.passageKey}>
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

      {bulkShareSheetOpen ? (
        <>
          {/* Scrim: the picker is a menu, and a menu that only closes by choosing is a trap. */}
          <div
            className="proto-bulk-share__scrim"
            role="presentation"
            onClick={() => {
              if (!bulkSharePending) setBulkShareSheetOpen(false);
            }}
          />
          <div className="proto-menu__popover proto-bulk-share__popover" role="menu" aria-label="Share to a space">
            <div className="proto-menu-section" role="group">
              <p className="proto-menu-section-label">
                {`Share ${sidebarSelectedNoteIds.length} note${sidebarSelectedNoteIds.length === 1 ? '' : 's'} to`}
              </p>
              {bulkShareTargets.length === 0 ? (
                <p className="proto-caption" style={{ padding: '6px 10px' }}>
                  No shared spaces yet.
                </p>
              ) : (
                bulkShareTargets.map((sp) => (
                  <button
                    key={sp.id}
                    type="button"
                    role="menuitem"
                    className="proto-menu-item"
                    disabled={bulkSharePending}
                    onClick={() => void onBulkShareToSpace(sp.id)}
                  >
                    <span className="proto-menu-item__icon proto-menu-item__icon--space" aria-hidden>
                      <ProtoSpaceMenuIcon color={sp.color || 'paper'} />
                    </span>
                    <span className="proto-menu-item__label">{sp.title}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      ) : null}
      {bulkDeleteConfirmOpen ? (
        <ProtoConfirmDialog
          anchorRect={bulkDeleteConfirmOpen}
          preferAbove
          alignRight
          title={`Delete ${sidebarSelectedNoteIds.length} note${sidebarSelectedNoteIds.length === 1 ? '' : 's'} everywhere?`}
          description={DELETE_NOTE_EVERYWHERE_CONFIRMATION.description}
          confirmLabel="Delete"
          busy={deleteNotesBatch.isPending}
          onConfirm={onConfirmBulkDelete}
          onCancel={() => {
            if (!deleteNotesBatch.isPending) setBulkDeleteConfirmOpen(null);
          }}
        />
      ) : null}
      {bulkRemoveConfirmOpen ? (
        <ProtoConfirmDialog
          anchorRect={bulkRemoveConfirmOpen}
          preferAbove
          alignRight
          title={`Remove ${sidebarSelectedNoteIds.length} note${sidebarSelectedNoteIds.length === 1 ? '' : 's'} from this space?`}
          description={REMOVE_NOTE_FROM_SPACE_CONFIRMATION.description}
          confirmLabel="Remove"
          busy={removeNotesFromSpace.isPending}
          onConfirm={onConfirmBulkRemoveFromSpace}
          onCancel={() => {
            if (!removeNotesFromSpace.isPending) setBulkRemoveConfirmOpen(null);
          }}
        />
      ) : null}
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
            <PrototypeCreateFolderSheet
              open={createFolderSheetOpen || bulkFolderSheetOpen}
              onOpenChange={(next) => {
                setCreateFolderSheetOpen(next);
                if (!next) setBulkFolderSheetOpen(false);
              }}
              initialSelectedNoteIds={bulkFolderSheetOpen ? sidebarSelectedNoteIds : undefined}
              spaceId={homeSpaceId}
              spaceKind={isScopedSharedSpace ? 'shared' : 'personal'}
              spaceNotes={notes}
              notesById={notesById}
              onCreated={(folderName) => {
                setBulkFolderSheetOpen(false);
                // setSidebarListMode clears any live selection on its way through.
                setSidebarListMode('folders');
                setActiveFolderKey(folderName);
              }}
            />
          ) : null}
          {canCreateSidebarCollections && isScopedSharedSpace ? (
            <PrototypeCreateSharedThreadSheet
              open={createThreadSheetOpen}
              onOpenChange={(open) => {
                setCreateThreadSheetOpen(open);
                if (!open) setCreateThreadPrefill(null);
              }}
              spaceId={homeSpaceId}
              spaceColor={activeSharedSpace?.color}
              isOwner={viewerIsSpaceOwner}
              initialNoteIds={createThreadPrefill?.noteIds}
              onPinFailure={() => groupThreadsQuery.refetch()}
              onCreated={(thread) => {
                setSidebarListMode('threads');
                setSidebarThreadDrilldownId(thread.id);
              }}
            />
          ) : null}
          {canCreateSidebarCollections && !isScopedSharedSpace ? (
            <PrototypeCreateThreadSheet
              open={createThreadSheetOpen}
              onOpenChange={(open) => {
                setCreateThreadSheetOpen(open);
                if (!open) setCreateThreadPrefill(null);
              }}
              spaceId={homeSpaceId}
              spaceNotes={notes}
              initialSelectedNoteIds={createThreadPrefill?.noteIds}
              initialThreadName={createThreadPrefill?.threadName}
              onCreated={(repNoteId) => {
                setSidebarListMode('threads');
                setSidebarThreadDrilldownId(threadClusterDrillSlug(repNoteId));
              }}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

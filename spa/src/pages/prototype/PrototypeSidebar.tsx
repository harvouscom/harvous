import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import Icon from '@/components/react/Icon';
import { toast } from '@/utils/toast';
import { APIError } from '../../lib/api';
import { useDeleteNote } from '../../hooks/mutations/useDeleteNote';
import { useDeleteHighlight } from '../../hooks/mutations/useDeleteHighlight';
import { useUpdateHighlight } from '../../hooks/mutations/useUpdateHighlight';
import { usePinSpaceNote } from '../../hooks/mutations/usePinSpaceNote';
import { useSpaceNotes, type SpaceNoteRow } from '../../hooks/queries/useSpace';
import { getNoteQueryOptions, seedNoteFromList, type ListNoteForSeed } from '../../hooks/queries/useNote';
import { countNotesInFolderBucket, noteFolderMembershipLabels } from '@/utils/note-folder-display';
import { sortNotesByLastVisited } from '@/utils/sorting';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import { isEffectivelyEmptyPrototypeNote } from '@/utils/prototype-note-empty';
import { computePrototypeNotesListPhase } from '@/utils/prototype-notes-list-phase';
import { stripHtmlForListPreview } from '@/utils/html-stripper';
import { useProtoShell, type SidebarTagSearchIntent } from '../../layouts/proto-shell-context';
import { usePrototypeHomeSpaceId } from '../../hooks/usePrototypeHomeSpaceId';
import { useIntersectionFetchNextPage } from '../../hooks/useIntersectionFetchNextPage';
import { useListKeyboardNavigation } from '../../hooks/useListKeyboardNavigation';
import {
  isPrototypeNotePath,
  matchPrototypeNoteId,
  prototypeHomeRouteTo,
  prototypeNoteRouteTo,
} from '@/lib/prototype-path';
import { protoRelativeCaptionAbbrev } from './proto-time';
import { PROTO_TOOLBAR_ICON_SIZE } from './proto-toolbar-tokens';
import ProtoConfirmDialog from './ProtoConfirmDialog';
import PrototypeSidebarRowMenuPopover from './PrototypeSidebarRowMenuPopover';
import type { PrototypeHighlightStudyThreadRow } from '../../hooks/queries/usePrototypeSpaceStudyThreadHighlights';
import { usePrototypeSpaceStudyThreadHighlights } from '../../hooks/queries/usePrototypeSpaceStudyThreadHighlights';
import { usePrototypeStudyThreads, type StudyThreadCluster } from '../../hooks/queries/usePrototypeStudyThreads';
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
import PrototypeListEmptyState, { PrototypeListNoMatchEmptyState } from './PrototypeListEmptyState';
import { SIDEBAR_NO_MATCH_COPY } from './sidebar-no-match-copy';
import PrototypeMigrationBanner from './PrototypeMigrationBanner';
import PrototypeSidebarToolbar from './PrototypeSidebarToolbar';
import {
  loadPinnedHighlightIds,
  togglePinnedHighlightId,
} from './proto-pinned-stores';
import PrototypeSidebarSearchResults from './PrototypeSidebarSearchResults';
import type { SidebarSearchResult } from './sidebar-search-types';
import {
  buildFoldersFromNotes,
  type ActiveSearchContext,
} from './sidebar-universal-search';


import { noteParamSlug, normalizeNoteIdFromParam, isPrototypeDraftNoteSlug } from './proto-route-slugs';

function stripHtmlPreview(html: string | null | undefined, max = 80) {
  if (!html) return '';
  return stripHtmlForListPreview(html, max);
}

function ProtoListRecencyLine({ rel, preview }: { rel?: string; preview?: string }) {
  if (!rel && !preview) return null;
  return (
    <div className="pds-list-preview proto-note-row__preview">
      {rel ? <span className="pds-list-timestamp">{rel}</span> : null}
      {rel && preview ? '  ' : null}
      {preview ? <span>{preview}</span> : null}
    </div>
  );
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
};

/** Native `StudyHighlightAccentToken.pickerChoicesWithNeutral` order + labels. */
const HIGHLIGHT_ACCENT_SWATCHES: { token: string; label: string; cssVar: string }[] = [
  { token: 'neutral', label: 'Neutral', cssVar: '--pds-highlight-neutral' },
  { token: 'warmAmber', label: 'Amber', cssVar: '--pds-highlight-warm-amber' },
  { token: 'skyBlue', label: 'Sky', cssVar: '--pds-highlight-sky-blue' },
  { token: 'violet', label: 'Violet', cssVar: '--pds-highlight-violet' },
  { token: 'mintGreen', label: 'Mint', cssVar: '--pds-highlight-mint-green' },
  { token: 'coralRose', label: 'Coral', cssVar: '--pds-highlight-coral-rose' },
];

function HighlightRow({
  isActive,
  isPinned,
  entryKind,
  title,
  rel,
  preview,
  currentAccent,
  onOpen,
  onTogglePin,
  onSetAccent,
  onDelete,
  isDeleting,
}: {
  isActive: boolean;
  isPinned: boolean;
  entryKind: string | null | undefined;
  title: string;
  rel?: string;
  preview?: string;
  currentAccent: string | null;
  onOpen: () => void;
  onTogglePin: () => void;
  onSetAccent: (token: string) => void;
  onDelete: (anchorRect: DOMRect) => void;
  isDeleting: boolean;
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
        <ProtoListRecencyLine rel={rel} preview={preview} />
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
            <div
              role="group"
              aria-label="Highlight accent"
              style={{ display: 'flex', gap: 6, padding: '6px 12px', alignItems: 'center' }}
            >
              {HIGHLIGHT_ACCENT_SWATCHES.map((s) => {
                const selected = currentAccent === s.token;
                return (
                  <button
                    key={s.token}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    aria-label={s.label}
                    title={s.label}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      onSetAccent(s.token);
                    }}
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      border: selected
                        ? '2px solid var(--pds-text-primary)'
                        : '1px solid var(--pds-border-control-medium)',
                      background: `var(${s.cssVar})`,
                      padding: 0,
                      cursor: 'pointer',
                    }}
                  />
                );
              })}
            </div>
            <button
              type="button"
              role="menuitem"
              className="proto-menu-item"
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
}: PrototypeSidebarNoteRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteAnchorRect, setDeleteAnchorRect] = useState<DOMRect | null>(null);
  const rowRef = useRef<HTMLLIElement>(null);
  const menuRootRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { closeDrawer, isMobileSidebar } = useProtoShell();
  const pinNote = usePinSpaceNote();
  const deleteNote = useDeleteNote();

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

  const onPin = () => {
    setMenuOpen(false);
    pinNote.mutate(
      { spaceId: homeSpaceId, noteId: row.id, isPinned: !pinned },
      {
        onError: (err) => {
          const msg = err instanceof APIError ? err.message : err instanceof Error ? err.message : 'Could not update pin';
          toast.error(msg);
        },
      },
    );
  };

  const onDeleteRequest = (anchorRect: DOMRect) => {
    setMenuOpen(false);
    setDeleteAnchorRect(anchorRect);
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
            if (isMobileSidebar) closeDrawer();
          }
        },
        onError: (err) => {
          setDeleteConfirmOpen(false);
          const msg = err instanceof APIError ? err.message : err instanceof Error ? err.message : 'Could not delete note';
          toast.error(msg);
        },
      },
    );
  };

  return (
    <li ref={rowRef} className="proto-note-row-item" data-active={active ? 'true' : 'false'}>
      <button
        type="button"
        className="proto-note-row__main"
        onClick={() => {
          cancelHoverPrefetch();
          onOpenNote(row);
        }}
        onMouseEnter={scheduleHoverPrefetch}
        onMouseLeave={cancelHoverPrefetch}
        onFocus={scheduleHoverPrefetch}
        onBlur={cancelHoverPrefetch}
      >
        <div className="proto-note-row__title-line">
          {pinned ? (
            <span className="proto-note-row__pin" aria-hidden>
              <Icon name="thumbtack" size={12} />
            </span>
          ) : null}
          <span className="pds-list-title proto-note-row__title-text">{title}</span>
        </div>
        <ProtoListRecencyLine rel={rel} preview={preview} />
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
          aria-label="Note actions"
          disabled={pinNote.isPending || deleteNote.isPending}
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
          aria-label="Note actions"
        >
          <div className="proto-menu-section" role="group">
            <button
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
            </button>
            <button
              type="button"
              role="menuitem"
              className="proto-menu-item proto-menu-item--destructive"
              disabled={deleteNote.isPending}
              onClick={(e) => {
                e.stopPropagation();
                onDeleteRequest(e.currentTarget.getBoundingClientRect());
              }}
            >
              <span className="proto-menu-item__icon" aria-hidden>
                <Icon name="trash-can" size={PROTO_TOOLBAR_ICON_SIZE} />
              </span>
              <span className="proto-menu-item__label">Delete note</span>
            </button>
          </div>
        </PrototypeSidebarRowMenuPopover>
      </div>
      {deleteConfirmOpen && deleteAnchorRect ? (
        <ProtoConfirmDialog
          anchorRect={deleteAnchorRect}
          title="Delete this note?"
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
      ) : null}
    </li>
  );
}

type ScriptureDrill =
  | { level: 'books' }
  | { level: 'passages'; bookOrder: number }
  | { level: 'notes'; bookOrder: number; passageKey: string };

type HighlightKindFilter = 'all' | 'notes' | 'connected' | 'scripture' | 'references';

const HIGHLIGHT_KIND_OPTIONS: { id: HighlightKindFilter; label: string; iconName?: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'notes', label: 'Notes', iconName: 'note-sticky' },
  { id: 'connected', label: 'Connected', iconName: 'arrow-right-arrow-left' },
  { id: 'scripture', label: 'Scripture', iconName: 'book-open' },
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
  return (
    <div style={{ padding: '12px 18px', display: 'flex', justifyContent: 'center' }}>
      <span className="load-more-indicator" aria-label="Loading notes">
        <span className="load-more-indicator__dot" />
        <span className="load-more-indicator__dot" />
        <span className="load-more-indicator__dot" />
      </span>
    </div>
  );
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

export default function PrototypeSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const {
    closeDrawer,
    isMobileSidebar,
    sidebarLayer,
    sidebarListMode: mode,
    setSidebarFolderDrilldown: setActiveFolderKey,
    sidebarFolderDrilldown: activeFolderKey,
    sidebarThreadDrilldownId,
    setSidebarThreadDrilldownId,
    setSidebarListMode,
    standaloneScripturePassage,
    openStandaloneScripturePassage,
    dismissStandaloneScripturePassage,
    sidebarTagSearchIntent,
    clearSidebarTagSearchIntent,
    ensureSidebarExpanded,
  } = useProtoShell();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { homeSpaceId, navReady, authReady } = usePrototypeHomeSpaceId();

  const scrollRootRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Arrow / j-k / Home-End movement between rows once the list is focused (Shift+J).
  useListKeyboardNavigation(scrollRootRef);

  const {
    data: pages,
    isError: notesIsError,
    isPending: notesIsPending,
    isFetching: notesIsFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useSpaceNotes(homeSpaceId ?? '');

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
  const isHomeLayer = sidebarLayer === 'space';
  const tagFilterActive = Boolean(tagFilter);
  const searchActive = !isHomeLayer && q.trim().length > 0 && !tagFilterActive;

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
  const scriptureQuery = usePrototypeSpaceScriptureIndex(
    searchActive || mode === 'scripture' || isHomeLayer ? homeSpaceId ?? undefined : undefined,
  );
  const studyThreadsQuery = usePrototypeStudyThreads(
    searchActive || mode === 'threads' ? homeSpaceId ?? undefined : undefined,
  );
  const threadDrillQuery = usePrototypeStudyThread(
    (searchActive || mode === 'threads') && sidebarThreadDrilldownId ? sidebarThreadDrilldownId : undefined,
    homeSpaceId,
  );
  const [scriptureDrill, setScriptureDrill] = useState<ScriptureDrill>({ level: 'books' });
  const [highlightKindFilter, setHighlightKindFilter] = useState<HighlightKindFilter>('all');
  const [pinnedHighlightIds, setPinnedHighlightIds] = useState<string[]>([]);
  const [highlightDeleteTarget, setHighlightDeleteTarget] = useState<{
    row: PrototypeHighlightStudyThreadRow;
    anchorRect: DOMRect;
  } | null>(null);

  useEffect(() => {
    setPinnedHighlightIds(loadPinnedHighlightIds(homeSpaceId ?? undefined));
  }, [homeSpaceId]);

  const togglePinnedHighlight = useCallback(
    (id: string) => {
      if (!homeSpaceId) return;
      setPinnedHighlightIds(togglePinnedHighlightId(homeSpaceId, id));
    },
    [homeSpaceId],
  );

  useEffect(() => {
    if (mode !== 'scripture') setScriptureDrill({ level: 'books' });
  }, [mode]);

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
    return sortNotesByLastVisited(Array.from(byId.values())).filter(
      (n) => !isEffectivelyEmptyPrototypeNote(n.title, n.content),
    );
  }, [pages]);

  const notesById = useMemo(() => {
    const m = new Map<string, SpaceNoteRow>();
    for (const n of notes) m.set(n.id, n);
    return m;
  }, [notes]);

  // Thread/scripture drill rows carry only id+title (±dates), but we render them with the
  // same PrototypeSidebarNoteRow as the Notes/Folders lists. Resolve the full loaded note so
  // the row shows the same title + date + excerpt + menu; fall back to the brief when unloaded.
  const resolveDrillNoteRow = useCallback(
    (brief: { id: string; title: string | null; updatedAt?: string | null; createdAt?: string | null }): SpaceNoteRow => {
      const full = notesById.get(brief.id);
      if (full) return full;
      return {
        id: brief.id,
        title: brief.title,
        content: '',
        updatedAt: brief.updatedAt ?? null,
        createdAt: brief.createdAt ?? null,
        noteType: 'default',
      } as SpaceNoteRow;
    },
    [notesById],
  );

  const noteSlugFromPath = matchPrototypeNoteId(pathname);
  const activeNoteSlug = noteSlugFromPath;
  const activeNoteFullId =
    activeNoteSlug && !isPrototypeDraftNoteSlug(activeNoteSlug)
      ? activeNoteSlug.startsWith('note_')
        ? activeNoteSlug
        : `note_${activeNoteSlug}`
      : undefined;

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

  const notesListPhase = computePrototypeNotesListPhase({
    homeSpaceId,
    authReady,
    isPending: notesIsPending,
    isFetching: notesIsFetching,
    noteCount: notes.length,
    isError: notesIsError,
  });

  const folders = useMemo(() => buildFoldersFromNotes(notes), [notes]);
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
    if (!t) return folders;
    return folders.filter((c) => (c.name ?? 'Unsorted').toLowerCase().includes(t));
  }, [folders, q]);

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

  const notesForScripturePassage = useMemo(() => {
    if (scriptureDrill.level !== 'notes') return [];
    const book = scriptureBooks.find((b) => b.bookOrder === scriptureDrill.bookOrder);
    const passage = book?.passages.find((p) => p.passageKey === scriptureDrill.passageKey);
    const noteRows = passage?.notes ?? [];
    const t = q.trim().toLowerCase();
    if (!t) return noteRows;
    return noteRows.filter((n) => (n.title ?? '').toLowerCase().includes(t));
  }, [scriptureBooks, scriptureDrill, q]);

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
        noteType: (row.noteType as ListNoteForSeed['noteType']) || 'default',
        contentEncrypted: row.contentEncrypted === true,
        resourceTitle: row.resourceTitle ?? null,
        userId: undefined,
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

  const afterNav = useCallback(() => {
    if (isMobileSidebar) closeDrawer();
  }, [closeDrawer, isMobileSidebar]);

  const onNoteRow = (row: SpaceNoteRow) => {
    if (!homeSpaceId) return;
    prefetchNote(row);
    dismissStandaloneScripturePassage();
    navigate({
      to: prototypeNoteRouteTo(),
      params: { noteId: noteParamSlug(row.id) },
    });
    afterNav();
  };

  const deleteHighlight = useDeleteHighlight();
  const updateHighlight = useUpdateHighlight();

  const onSetHighlightAccent = (r: PrototypeHighlightStudyThreadRow, token: string) => {
    if (!homeSpaceId) return;
    if (r.highlightAccentRaw === token) return;
    updateHighlight.mutate(
      {
        id: r.id,
        spaceId: homeSpaceId,
        parentNoteId: r.parentNoteId,
        highlightAccentRaw: token,
      },
      {
        onError: (err) => {
          const msg =
            err instanceof APIError ? err.message : err instanceof Error ? err.message : 'Could not update highlight';
          toast.error(msg);
        },
      },
    );
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
          const msg =
            err instanceof APIError ? err.message : err instanceof Error ? err.message : 'Could not delete highlight';
          toast.error(msg);
        },
      },
    );
  };

  const onHighlightRow = (r: PrototypeHighlightStudyThreadRow) => {
    if (!homeSpaceId) return;
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
            search: { scriptureRef: canon, scriptureTranslation: trans, studyThread: r.id },
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
      search: isReferenceRow
        ? { studyThread: r.id, reference: r.sourceSnippet || '' }
        : { studyThread: r.id },
    });
    afterNav();
  };

  const isSearchResultActive = useCallback(
    (result: SidebarSearchResult) => {
      if (result.kind === 'note' && result.noteId) {
        return !!activeNoteFullId && result.noteId === activeNoteFullId;
      }
      if (result.kind === 'highlight' && result.highlightId) {
        const row = highlightsById.get(result.highlightId);
        if (!row) return false;
        return (
          standaloneScripturePassage?.focusedHighlightThreadId === result.highlightId ||
          (!isScripturePassageHighlightRow(row) && activeNoteFullId === row.parentNoteId)
        );
      }
      return false;
    },
    [activeNoteFullId, highlightsById, standaloneScripturePassage?.focusedHighlightThreadId],
  );

  const onActivateSearchResult = useCallback(
    (result: SidebarSearchResult) => {
      if (!homeSpaceId) return;
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

  return (
    <div className="proto-sidebar-root">
      {isMobileSidebar ? <PrototypeSidebarToolbar variant="drawer" /> : null}
      {backTarget && !isHomeLayer ? (
        <div className="proto-sidebar-back-row">
          <button type="button" className="proto-sidebar-back-row__button" onClick={backTarget.action}>
            <Icon name="chevron-left" size={13} className="proto-sidebar-back-row__chevron" aria-hidden />
            {backTarget.kind ? (
              <span className="proto-sidebar-back-row__kind">{backTarget.kind}</span>
            ) : null}
            <span className="proto-sidebar-back-row__label">{backTarget.label}</span>
          </button>
        </div>
      ) : null}
      {!isHomeLayer ? (
      <div className="proto-sidebar-search">
        <div className="proto-sidebar-search__field">
          <span className="proto-sidebar-search__icon" aria-hidden>
            <Icon name="magnifying-glass" size={14} />
          </span>
          <input
            ref={searchInputRef}
            id="proto-sidebar-search-input"
            type="search"
            placeholder="Search"
            value={q}
            onChange={(e) => {
              const next = e.target.value;
              setQ(next);
              if (tagFilter && next.trim().toLowerCase() !== tagFilter.tagName.trim().toLowerCase()) {
                setTagFilter(null);
              }
            }}
            onKeyDown={(e) => {
              // Drop from the search field straight into the list results.
              if (e.key === 'ArrowDown') {
                const firstRow = scrollRootRef.current?.querySelector<HTMLElement>(
                  'button.proto-note-row__main, button.proto-note-row',
                );
                if (firstRow) {
                  e.preventDefault();
                  firstRow.focus();
                  firstRow.scrollIntoView({ block: 'nearest' });
                }
              }
            }}
            autoComplete="off"
            aria-label="Search"
          />
          {q ? (
            <button
              type="button"
              className="proto-sidebar-search__clear"
              aria-label="Clear search"
              onClick={() => {
                setQ('');
                setTagFilter(null);
                searchInputRef.current?.focus();
              }}
            >
              <Icon name="circle-xmark" size={15} aria-hidden />
            </button>
          ) : null}
        </div>
      </div>
      ) : null}

      <div ref={scrollRootRef} className="proto-sidebar-scroll">
        {!homeSpaceId ? (
          navReady ? (
            <p className="proto-caption" style={{ padding: '14px 18px' }}>
              No My Home yet — finish setup in the classic app
            </p>
          ) : null
        ) : isHomeLayer ? (
          <PrototypeSidebarHomeView
            homeSpaceId={homeSpaceId}
            notes={notes}
            notesListPhase={notesListPhase}
            hasMoreNotes={!!hasNextPage}
            noteTotal={pages?.pages?.[0]?.total}
            scriptureBooks={scriptureBooks}
            scriptureSettled={!scriptureQuery.isPending || scriptureQuery.data != null}
            onOpenNote={onNoteRow}
            prefetchNote={prefetchNote}
            onOpenScriptureBook={(bookOrder) => {
              setScriptureDrill({ level: 'passages', bookOrder });
              setSidebarListMode('scripture');
              ensureSidebarExpanded();
            }}
            onOpenHighlight={onHighlightRow}
          />
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
                  <p className="proto-caption" style={{ padding: '12px 18px', textAlign: 'center' }}>
                    No notes in this folder.
                  </p>
                ) : (
                  <ul className="proto-note-list">
                    {notesForMode.map((row) => (
                      <PrototypeSidebarNoteRow
                        key={row.id}
                        row={row}
                        active={!!(activeNoteFullId && row.id === activeNoteFullId)}
                        homeSpaceId={homeSpaceId}
                        activeNoteFullId={activeNoteFullId}
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
                  <PrototypeListEmptyState
                    iconName="folder"
                    title="No Folders"
                    description="Folders created from your notes will appear here."
                  />
                )
              ) : (
                <ul className="proto-collection-grid">
                  {filteredFolders.map((col) => (
                    <li key={col.name ?? '__none__'}>
                      <button
                        type="button"
                        className="proto-collection-card"
                        onClick={() => setActiveFolderKey(col.name)}
                      >
                        <span className="proto-collection-card__icon">
                          <Icon name="folder" size={13} aria-hidden />
                        </span>
                        <div className="proto-collection-card__body">
                          <div className="proto-collection-card__title">{col.name ?? 'Unsorted'}</div>
                          <div className="proto-collection-card__count">
                            {col.count} note{col.count !== 1 ? 's' : ''}
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
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
                {highlightsQuery.isLoading ? null : highlightsQuery.isError ? (
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
                      description="Selections and passage highlights from your notes appear here."
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
                      const activeRow =
                        standaloneScripturePassage?.focusedHighlightThreadId === r.id ||
                        (!isScripturePassageHighlightRow(r) && activeNoteFullId === r.parentNoteId);
                      return (
                        <HighlightRow
                          key={r.id}
                          isActive={activeRow}
                          isPinned={isPinned}
                          entryKind={r.entryKind}
                          title={title}
                          rel={rel}
                          preview={sub}
                          currentAccent={r.highlightAccentRaw}
                          onOpen={() => onHighlightRow(r)}
                          onTogglePin={() => togglePinnedHighlight(r.id)}
                          onSetAccent={(token) => onSetHighlightAccent(r, token)}
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

            {mode === 'threads' && sidebarThreadDrilldownId ? (
              <>
                {threadDrillQuery.isLoading ? null : threadDrillQuery.isError ? (
                  <p className="proto-caption" style={{ padding: '12px 18px', textAlign: 'center' }}>
                    Could not load thread.
                  </p>
                ) : !threadDrillQuery.data?.nodes.length ? (
                  <p className="proto-caption" style={{ padding: '12px 18px', textAlign: 'center', opacity: 0.7 }}>
                    No notes in this thread.
                  </p>
                ) : (
                  <ul className="proto-note-list">
                    {threadDrillQuery.data.nodes.map((node) => {
                      const row = resolveDrillNoteRow({
                        id: node.id,
                        title: node.title || node.resourceTitle || null,
                      });
                      return (
                        <PrototypeSidebarNoteRow
                          key={node.id}
                          row={row}
                          active={!!(activeNoteFullId && node.id === activeNoteFullId)}
                          homeSpaceId={homeSpaceId}
                          activeNoteFullId={activeNoteFullId}
                          prefetchNote={prefetchNote}
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
              <>
                {studyThreadsQuery.isLoading ? null : studyThreadsQuery.isError ? (
                  <p className="proto-caption" style={{ padding: '12px 18px', textAlign: 'center' }}>
                    Could not load threads.
                  </p>
                ) : !studyThreadsQuery.data || studyThreadsQuery.data.length === 0 ? (
                  <PrototypeListEmptyState
                    iconName="arrow-right-arrow-left"
                    title="No Threads"
                    description="Connect notes together to create threads."
                  />
                ) : (
                  <ul className="proto-collection-grid">
                    {studyThreadsQuery.data.map((cluster) => {
                      const title = resolveClusterListTitle(
                        cluster,
                        activeNoteFullId,
                        queryClient,
                        homeSpaceId,
                      );
                      const preview = `${cluster.noteCount} ${cluster.noteCount === 1 ? 'note' : 'notes'}`;
                      return (
                        <li key={cluster.id}>
                          <button
                            type="button"
                            className="proto-collection-card"
                            onClick={() => {
                              const slug = cluster.id.startsWith('note_') ? cluster.id.slice('note_'.length) : cluster.id;
                              setSidebarThreadDrilldownId(slug);
                            }}
                          >
                            <span className="proto-collection-card__icon">
                              <Icon name="arrow-right-arrow-left" size={13} aria-hidden />
                            </span>
                            <div className="proto-collection-card__body">
                              <div className="proto-collection-card__title">{title}</div>
                              <div className="proto-collection-card__count">{preview}</div>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            ) : null}

            {mode === 'scripture' && scriptureDrill.level === 'books' ? (
              <>
                {scriptureQuery.isLoading ? null : scriptureQuery.isError ? (
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
                            <Icon name="book" size={13} aria-hidden />
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
                {passagesForDrill.length === 0 ? (
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
                  <ul className="proto-note-list">
                    {notesForScripturePassage.map((n) => {
                      const row = resolveDrillNoteRow({
                        id: n.id,
                        title: n.title,
                        updatedAt: n.updatedAt,
                        createdAt: n.createdAt,
                      });
                      return (
                        <PrototypeSidebarNoteRow
                          key={n.id}
                          row={row}
                          active={!!(activeNoteFullId && n.id === activeNoteFullId)}
                          homeSpaceId={homeSpaceId}
                          activeNoteFullId={activeNoteFullId}
                          prefetchNote={prefetchNote}
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

          </>
        )}
      </div>

      <div className="proto-sidebar-floating-stack">
        <PrototypeMigrationBanner />
      </div>

      {highlightDeleteTarget ? (
        <ProtoConfirmDialog
          anchorRect={highlightDeleteTarget.anchorRect}
          title="Delete highlight?"
          confirmLabel="Delete"
          busy={deleteHighlight.isPending}
          onConfirm={onConfirmDeleteHighlight}
          onCancel={() => {
            if (!deleteHighlight.isPending) setHighlightDeleteTarget(null);
          }}
        />
      ) : null}
    </div>
  );
}

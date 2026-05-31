import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import Icon from '@/components/react/Icon';
import { toast } from '@/utils/toast';
import { APIError } from '../../lib/api';
import { useDeleteNote } from '../../hooks/mutations/useDeleteNote';
import { useDeleteHighlight } from '../../hooks/mutations/useDeleteHighlight';
import { useUpdateHighlight } from '../../hooks/mutations/useUpdateHighlight';
import { usePinSpaceNote } from '../../hooks/mutations/usePinSpaceNote';
import { useSpaceNotes, type SpaceNoteRow } from '../../hooks/queries/useSpace';
import { getNoteQueryOptions, seedNoteFromList, type ListNoteForSeed } from '../../hooks/queries/useNote';
import { noteFolderMembershipLabels } from '@/utils/note-folder-display';
import { sortNotesByLastVisited } from '@/utils/sorting';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { usePrototypeHomeSpaceId } from '../../hooks/usePrototypeHomeSpaceId';
import {
  isPrototypeNotePath,
  matchPrototypeNoteId,
  prototypeHomeRouteTo,
  prototypeNoteRouteTo,
} from '@/lib/prototype-path';
import { protoRelativeCaption } from './proto-time';
import { PROTO_TOOLBAR_ICON_SIZE } from './proto-toolbar-tokens';
import ProtoConfirmDialog from './ProtoConfirmDialog';
import ProtoPopoverShell from './ProtoPopoverShell';
import type { PrototypeHighlightStudyThreadRow } from '../../hooks/queries/usePrototypeSpaceStudyThreadHighlights';
import { usePrototypeSpaceStudyThreadHighlights } from '../../hooks/queries/usePrototypeSpaceStudyThreadHighlights';
import { usePrototypeSpaceScriptureIndex } from '../../hooks/queries/usePrototypeSpaceScriptureIndex';
import {
  isScripturePassageHighlightRow,
  prototypeHighlightListTitle,
  prototypeHighlightSubtitlePreview,
  prototypeHighlightRecencyIso,
} from './proto-highlight-subtitle';
import PrototypeDictionaryColumn from './PrototypeDictionaryColumn';
import PrototypeDictionaryEntry from './PrototypeDictionaryEntry';
import PrototypeDailyPassagePill from './PrototypeDailyPassagePill';
import {
  loadPinnedHighlightIds,
  togglePinnedHighlightId,
} from './proto-pinned-stores';

interface FolderBucket {
  name: string | null;
  count: number;
  mostRecentIso: string | null;
}

function noteParamSlug(id: string) {
  return id.startsWith('note_') ? id.slice('note_'.length) : id;
}

function stripHtmlPreview(html: string | null | undefined, max = 80) {
  if (!html) return '';
  const t = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function describeQueryFailure(err: unknown): string {
  if (err instanceof APIError) return err.message;
  if (err instanceof Error) return err.message;
  return '';
}

function buildFolders(notes: SpaceNoteRow[]): FolderBucket[] {
  const buckets = new Map<string, { count: number; mostRecentIso: string | null }>();
  for (const note of notes) {
    const n = note as SpaceNoteRow & { primaryCollection?: string | null; secondaryCollections?: string[] };
    const labels = noteFolderMembershipLabels({
      primaryCollection: n.primaryCollection ?? null,
      secondaryCollections: n.secondaryCollections ?? [],
    });
    const keys = labels.length > 0 ? labels : [null];
    const iso = note.updatedAt ?? note.createdAt ?? null;
    for (const label of keys) {
      const bucketKey = label ?? '__none__';
      const existing = buckets.get(bucketKey) ?? { count: 0, mostRecentIso: null };
      existing.count += 1;
      if (iso && (!existing.mostRecentIso || iso > existing.mostRecentIso)) {
        existing.mostRecentIso = iso;
      }
      buckets.set(bucketKey, existing);
    }
  }
  const result: FolderBucket[] = [];
  buckets.forEach((v, k) => {
    result.push({ name: k === '__none__' ? null : k, count: v.count, mostRecentIso: v.mostRecentIso });
  });
  return result.sort((a, b) => {
    if (a.name === null) return 1;
    if (b.name === null) return -1;
    if (a.mostRecentIso && b.mostRecentIso) return b.mostRecentIso.localeCompare(a.mostRecentIso);
    return 0;
  });
}

type PrototypeSidebarNoteRowProps = {
  row: SpaceNoteRow;
  active: boolean;
  homeSpaceId: string;
  activeNoteFullId: string | undefined;
  prefetchNote: (row: SpaceNoteRow, opts?: { seedFromList?: boolean }) => void;
  onOpenNote: (row: SpaceNoteRow) => void;
};

const HIGHLIGHT_ACCENT_SWATCHES: { token: string; label: string; cssVar: string }[] = [
  { token: 'warmAmber', label: 'Warm amber', cssVar: '--pds-highlight-warm-amber' },
  { token: 'skyBlue', label: 'Sky blue', cssVar: '--pds-highlight-sky-blue' },
  { token: 'violet', label: 'Violet', cssVar: '--pds-highlight-violet' },
  { token: 'mintGreen', label: 'Mint green', cssVar: '--pds-highlight-mint-green' },
  { token: 'coralRose', label: 'Coral rose', cssVar: '--pds-highlight-coral-rose' },
  { token: 'neutral', label: 'Neutral', cssVar: '--pds-highlight-neutral' },
];

function HighlightRow({
  isActive,
  isPinned,
  isReferenceRow,
  title,
  line,
  currentAccent,
  onOpen,
  onTogglePin,
  onSetAccent,
  onDelete,
  isDeleting,
}: {
  isActive: boolean;
  isPinned: boolean;
  isReferenceRow: boolean;
  title: string;
  line: string;
  currentAccent: string | null;
  onOpen: () => void;
  onTogglePin: () => void;
  onSetAccent: (token: string) => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDoc = (e: MouseEvent) => {
      const el = menuRootRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) setMenuOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [menuOpen]);

  return (
    <li
      className="proto-note-row-item"
      data-active={isActive ? 'true' : 'false'}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuOpen(true);
      }}
    >
      <button type="button" className="proto-note-row__main" onClick={onOpen}>
        <div className="proto-note-row__title-line">
          {isPinned ? (
            <span className="proto-note-row__pin" aria-hidden>
              <Icon name="thumbtack" size={11} />
            </span>
          ) : null}
          <div
            className="pds-list-title proto-note-row__title-text"
            style={isReferenceRow ? { display: 'inline-flex', alignItems: 'center', gap: 6 } : undefined}
          >
            {isReferenceRow ? <Icon name="lines-leaning" size={11} aria-hidden /> : null}
            <span>{title}</span>
          </div>
        </div>
        {line ? <div className="pds-list-preview proto-note-row__preview">{line}</div> : null}
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
        {menuOpen ? (
          <ProtoPopoverShell className="proto-menu__popover proto-menu__popover--right" role="menu" aria-label="Highlight actions">
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
                <span style={{ flex: 1, minWidth: 0 }}>{isPinned ? 'Unpin highlight' : 'Pin highlight'}</span>
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
                  onDelete();
                }}
              >
                <span className="proto-menu-item__icon" aria-hidden>
                  <Icon name="trash-can" size={PROTO_TOOLBAR_ICON_SIZE} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>Delete highlight</span>
              </button>
            </div>
          </ProtoPopoverShell>
        ) : null}
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

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDoc = (e: MouseEvent) => {
      const el = menuRootRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) setMenuOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [menuOpen]);

  const iso = row.updatedAt ?? row.createdAt ?? null;
  const rel = protoRelativeCaption(iso);
  const preview = stripHtmlPreview(row.content, 80);
  const line = rel && preview ? `${rel}  ${preview}` : rel || preview;
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

  const onDeleteRequest = () => {
    setMenuOpen(false);
    setDeleteConfirmOpen(true);
  };

  const onDeleteConfirm = () => {
    deleteNote.mutate(
      { noteId: row.id, spaceId: homeSpaceId },
      {
        onSuccess: () => {
          setDeleteConfirmOpen(false);
          if (activeNoteFullId && row.id === activeNoteFullId) {
            navigate({ to: prototypeHomeRouteTo() });
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
    <li className="proto-note-row-item" data-active={active ? 'true' : 'false'}>
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
        {line ? <div className="pds-list-preview proto-note-row__preview">{line}</div> : null}
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
        {menuOpen ? (
          <ProtoPopoverShell className="proto-menu__popover proto-menu__popover--right" role="menu" aria-label="Note actions">
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
                <span style={{ flex: 1, minWidth: 0 }}>{pinned ? 'Unpin note' : 'Pin note'}</span>
              </button>
              <button
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
                <span style={{ flex: 1, minWidth: 0 }}>Delete note</span>
              </button>
            </div>
          </ProtoPopoverShell>
        ) : null}
      </div>
      {deleteConfirmOpen ? (
        <ProtoConfirmDialog
          title="Delete this note? This cannot be undone."
          confirmLabel="Delete"
          busy={deleteNote.isPending}
          onConfirm={onDeleteConfirm}
          onCancel={() => {
            if (!deleteNote.isPending) setDeleteConfirmOpen(false);
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

export default function PrototypeSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const {
    closeDrawer,
    isMobileSidebar,
    sidebarListMode: mode,
    setSidebarFolderDrilldown: setActiveFolderKey,
    sidebarFolderDrilldown: activeFolderKey,
    sidebarDictionarySlug,
    setSidebarDictionarySlug,
    standaloneScripturePassage,
    openStandaloneScripturePassage,
    dismissStandaloneScripturePassage,
  } = useProtoShell();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { homeSpaceId, navReady } = usePrototypeHomeSpaceId();

  const {
    data: pages,
    isLoading: notesLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useSpaceNotes(homeSpaceId ?? '');

  const highlightsQuery = usePrototypeSpaceStudyThreadHighlights(mode === 'highlights' ? homeSpaceId ?? undefined : undefined);
  const scriptureQuery = usePrototypeSpaceScriptureIndex(mode === 'scripture' ? homeSpaceId ?? undefined : undefined);
  const [q, setQ] = useState('');
  const [scriptureDrill, setScriptureDrill] = useState<ScriptureDrill>({ level: 'books' });
  const [highlightKindFilter, setHighlightKindFilter] = useState<HighlightKindFilter>('all');
  const [pinnedHighlightIds, setPinnedHighlightIds] = useState<string[]>([]);
  const [highlightDeleteTarget, setHighlightDeleteTarget] = useState<PrototypeHighlightStudyThreadRow | null>(null);

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
    return sortNotesByLastVisited(flat);
  }, [pages]);

  const noteSlugFromPath = matchPrototypeNoteId(pathname);
  const activeNoteSlug = noteSlugFromPath;
  const activeNoteFullId = activeNoteSlug
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
    const t = q.trim().toLowerCase();
    if (!t) return base;
    return base.filter((n) => {
      const title = (n.title ?? '').toLowerCase();
      const body = stripHtmlPreview(n.content, 800).toLowerCase();
      return title.includes(t) || body.includes(t);
    });
  }, [notes, q, activeFolderKey]);

  const folders = useMemo(() => buildFolders(notes), [notes]);
  const filteredFolders = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return folders;
    return folders.filter((c) => (c.name ?? 'Unsorted').toLowerCase().includes(t));
  }, [folders, q]);

  const scriptureBooks = scriptureQuery.data ?? [];

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

  const onRequestDeleteHighlight = (r: PrototypeHighlightStudyThreadRow) => {
    setHighlightDeleteTarget(r);
  };

  const onConfirmDeleteHighlight = () => {
    if (!homeSpaceId || !highlightDeleteTarget) return;
    deleteHighlight.mutate(
      { id: highlightDeleteTarget.id, spaceId: homeSpaceId, parentNoteId: highlightDeleteTarget.parentNoteId },
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

  const openScriptureIndexedNote = (
    n: { id: string; title: string | null; updatedAt: string | null; createdAt: string },
    prefetchOnly?: boolean,
  ) => {
    if (!homeSpaceId) return;
    const row = {
      id: n.id,
      title: n.title,
      content: '',
      updatedAt: n.updatedAt,
      createdAt: n.createdAt,
      noteType: 'default',
    } as SpaceNoteRow;
    prefetchNote(row, { seedFromList: false });
    if (prefetchOnly) return;
    dismissStandaloneScripturePassage();
    navigate({
      to: prototypeNoteRouteTo(),
      params: { noteId: noteParamSlug(n.id) },
    });
    afterNav();
  };

  return (
    <div className="proto-sidebar-root">
      <div className="proto-sidebar-search">
        <div className="proto-sidebar-search__field">
          <span className="proto-sidebar-search__icon" aria-hidden>
            <Icon name="magnifying-glass" size={14} />
          </span>
          <input
            type="search"
            placeholder="Search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoComplete="off"
            aria-label="Search"
          />
        </div>
      </div>

      <div className="proto-sidebar-scroll">
        {!navReady ? (
          <p className="proto-caption" style={{ padding: '14px 18px' }}>
            Loading…
          </p>
        ) : !homeSpaceId ? (
          <p className="proto-caption" style={{ padding: '14px 18px' }}>
            Loading My Home…
          </p>
        ) : (
          <>
            {mode === 'notes' ? (
              <>
                {notesLoading && notesForMode.length === 0 ? (
                  <p className="proto-caption" style={{ padding: '12px 18px' }}>Loading notes…</p>
                ) : notesForMode.length === 0 ? (
                  <p className="proto-caption" style={{ padding: '12px 18px', textAlign: 'center' }}>
                    {q.trim() ? 'No notes match.' : 'No notes yet.'}
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
                {hasNextPage ? (
                  <div style={{ padding: '0 18px 16px', textAlign: 'center' }}>
                    <button
                      type="button"
                      className="proto-caption"
                      disabled={isFetchingNextPage}
                      onClick={() => void fetchNextPage()}
                      style={{
                        border: '0.5px solid var(--pds-border)',
                        borderRadius: 8,
                        padding: '7px 14px',
                        background: 'var(--pds-bg-glass-medium)',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {isFetchingNextPage ? 'Loading…' : 'Load more'}
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}

            {mode === 'folders' && activeFolderKey !== undefined ? (
              <>
                <div style={{ padding: '0 18px 8px' }}>
                  <button
                    type="button"
                    className="proto-sidebar-back-btn"
                    onClick={() => {
                      setActiveFolderKey(undefined);
                      setQ('');
                    }}
                  >
                    <Icon name="chevron-left" size={10} />
                    Folders
                  </button>
                  <div className="pds-list-title" style={{ fontWeight: 600 }}>
                    {activeFolderKey ?? 'Unsorted'}
                  </div>
                </div>
                {notesForMode.length === 0 ? (
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
              </>
            ) : null}

            {mode === 'folders' && activeFolderKey === undefined ? (
              notesLoading && filteredFolders.length === 0 ? (
                <p className="proto-caption" style={{ padding: '12px 18px' }}>Loading…</p>
              ) : filteredFolders.length === 0 ? (
                <div className="proto-main-empty" style={{ minHeight: 120 }}>
                  <svg width="28" height="28" viewBox="0 0 16 16" fill="none" style={{ opacity: 0.28 }}>
                    <rect x="1" y="4" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.4" />
                    <rect x="3.5" y="2" width="9" height="4" rx="1" stroke="currentColor" strokeWidth="1.2" />
                  </svg>
                  <span>No folders yet.</span>
                </div>
              ) : (
                <ul className="proto-note-list">
                  {filteredFolders.map((col) => (
                    <li key={col.name ?? '__none__'}>
                      <button
                        type="button"
                        className="proto-note-row"
                        onClick={() => setActiveFolderKey(col.name)}
                      >
                        <div className="pds-list-title">{col.name ?? 'Unsorted'}</div>
                        <div className="pds-list-preview">
                          {col.count} note{col.count !== 1 ? 's' : ''}
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
                {highlightsQuery.isLoading ? (
                  <p className="proto-caption" style={{ padding: '12px 18px' }}>Loading highlights…</p>
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
                  <p className="proto-caption" style={{ padding: '12px 18px', textAlign: 'center' }}>
                    {q.trim() || highlightKindFilter !== 'all' ? 'No highlights match.' : 'No highlights yet.'}
                  </p>
                ) : (
                  <ul className="proto-note-list">
                    {filteredHighlights.map((r) => {
                      const iso = prototypeHighlightRecencyIso(r);
                      const rel = protoRelativeCaption(iso);
                      const sub = prototypeHighlightSubtitlePreview(r, r.parentNoteTitle ?? '');
                      const line = rel && sub ? `${rel}  ${sub}` : rel || sub;
                      const title = prototypeHighlightListTitle(r);
                      const isReferenceRow = r.entryKind === 'reference';
                      const isPinned = pinnedHighlightIds.includes(r.id);
                      const activeRow =
                        standaloneScripturePassage?.focusedHighlightThreadId === r.id ||
                        (!isScripturePassageHighlightRow(r) && activeNoteFullId === r.parentNoteId);
                      return (
                        <HighlightRow
                          key={r.id}
                          isActive={activeRow}
                          isPinned={isPinned}
                          isReferenceRow={isReferenceRow}
                          title={title}
                          line={line}
                          currentAccent={r.highlightAccentRaw}
                          onOpen={() => onHighlightRow(r)}
                          onTogglePin={() => togglePinnedHighlight(r.id)}
                          onSetAccent={(token) => onSetHighlightAccent(r, token)}
                          onDelete={() => onRequestDeleteHighlight(r)}
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

            {mode === 'dictionary' && sidebarDictionarySlug ? (
              <PrototypeDictionaryEntry
                slug={sidebarDictionarySlug}
                onBack={() => {
                  setSidebarDictionarySlug(undefined);
                  setQ('');
                }}
                onNavigateSlug={(slug) => setSidebarDictionarySlug(slug)}
              />
            ) : null}

            {mode === 'dictionary' && !sidebarDictionarySlug ? (
              <PrototypeDictionaryColumn
                searchQuery={q}
                onOpenSlug={(slug) => setSidebarDictionarySlug(slug)}
              />
            ) : null}

            {mode === 'scripture' && scriptureDrill.level === 'books' ? (
              <>
                {scriptureQuery.isLoading ? (
                  <p className="proto-caption" style={{ padding: '12px 18px' }}>Loading…</p>
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
                  <div className="proto-main-empty" style={{ minHeight: 120, padding: '12px 18px', textAlign: 'center' }}>
                    <span>Add scripture references in your notes to build your index.</span>
                  </div>
                ) : (
                  <ul className="proto-note-list">
                    {filteredScriptureBooks.map((b) => (
                      <li key={b.bookOrder}>
                        <button
                          type="button"
                          className="proto-note-row"
                          onClick={() => setScriptureDrill({ level: 'passages', bookOrder: b.bookOrder })}
                        >
                          <div className="pds-list-title">{b.title}</div>
                          <div className="pds-list-preview">
                            {b.referenceCount} reference{b.referenceCount !== 1 ? 's' : ''} · {b.noteCount} note
                            {b.noteCount !== 1 ? 's' : ''}
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
                <div style={{ padding: '0 18px 8px' }}>
                  <button
                    type="button"
                    className="proto-sidebar-back-btn"
                    onClick={() => {
                      setScriptureDrill({ level: 'books' });
                      setQ('');
                    }}
                  >
                    <Icon name="chevron-left" size={10} />
                    Scripture
                  </button>
                  <div className="pds-list-title" style={{ fontWeight: 600 }}>
                    {scriptureBooks.find((b) => b.bookOrder === scriptureDrill.bookOrder)?.title ?? 'Book'}
                  </div>
                </div>
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
                <div style={{ padding: '0 18px 8px' }}>
                  <button
                    type="button"
                    className="proto-sidebar-back-btn"
                    onClick={() => {
                      setScriptureDrill({ level: 'passages', bookOrder: scriptureDrill.bookOrder });
                      setQ('');
                    }}
                  >
                    <Icon name="chevron-left" size={10} />
                    Passages
                  </button>
                  <div className="pds-list-title" style={{ fontWeight: 600 }}>
                    {scriptureNotesPassageTitle}
                  </div>
                </div>
                {notesForScripturePassage.length === 0 ? (
                  <p className="proto-caption" style={{ padding: '12px 18px', textAlign: 'center' }}>
                    No notes match.
                  </p>
                ) : (
                  <ul className="proto-note-list">
                    {notesForScripturePassage.map((n) => (
                      <li key={n.id} className="proto-note-row-item" data-active={activeNoteFullId === n.id ? 'true' : 'false'}>
                        <button
                          type="button"
                          className="proto-note-row__main"
                          onClick={() => openScriptureIndexedNote(n)}
                          onMouseEnter={() => openScriptureIndexedNote(n, true)}
                          onFocus={() => openScriptureIndexedNote(n, true)}
                        >
                          <div className="pds-list-title proto-note-row__title-text">
                            {stripServerAutoUntitledNoteTitleForDisplay(n.title?.trim() ?? '') || 'New Note'}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : null}

          </>
        )}
      </div>

      <PrototypeDailyPassagePill homeSpaceId={homeSpaceId ?? null} notes={notes} />

      {highlightDeleteTarget ? (
        <ProtoConfirmDialog
          title="Delete highlight?"
          message="The highlight is removed from the source note. The note itself is kept."
          confirmLabel="Delete highlight"
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

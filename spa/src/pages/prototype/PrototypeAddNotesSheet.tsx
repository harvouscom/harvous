import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { api } from '../../lib/api';
import { useDebouncedSearchState } from '../../hooks/useDebouncedSearchState';
import { useAddNotesToFolder } from '../../hooks/mutations/useAddNotesToFolder';
import { useAddNotesToThreadCluster } from '../../hooks/mutations/useAddNotesToThreadCluster';
import Icon from '@/components/react/Icon';
import PrototypeSearchInput from './components/PrototypeSearchInput';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import { stripHtmlForListPreview } from '@/utils/html-stripper';
import ProtoPopoverShell from './ProtoPopoverShell';
import { useDismissOnOutside } from '../../hooks/usePopoverDismiss';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { useProtoAnchoredPopoverPosition } from './useProtoAnchoredPopoverPosition';
import { protoRelativeCaptionAbbrev } from './proto-time';
import type { SpaceNoteRow } from '../../hooks/queries/useSpace';
import { noteBelongsToFolderBucket } from '@/utils/note-folder-display';
import { sortNotesByLastUpdated } from '@/utils/sorting';

export type AddNotesListScope = 'unsorted' | 'all';

export interface AddNotesCandidate {
  id: string;
  title: string;
  noteType: string;
  updatedAt: string | null;
  createdAt: string | null;
  content: string | null;
}

interface ConnectNoteCandidatesResponse {
  notes: AddNotesCandidate[];
}

export type PrototypeAddNotesSheetMode = 'folder' | 'thread';

export interface PrototypeAddNotesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  mode: PrototypeAddNotesSheetMode;
  /** Named folder when mode is folder. */
  folderName?: string;
  /** Representative note id when mode is thread. */
  threadRepNoteId?: string;
  /** Current cluster member ids when mode is thread. */
  threadMemberIds?: string[];
  /** Notes already in the folder/thread — excluded from the list. */
  excludeNoteIds?: string[];
  /** Loaded space notes for mutation payloads. */
  notesById: Map<string, SpaceNoteRow>;
  /** Full loaded note list for picker (unsorted / all scopes). */
  spaceNotes?: SpaceNoteRow[];
  onAdded?: () => void;
  /** When true, renders list + selection UI only (no shell) for embedding in create sheets. */
  embedded?: boolean;
  /** Controlled selection for embedded mode. */
  selectedIds?: string[];
  onSelectedIdsChange?: (ids: string[]) => void;
}

function normalizedSpacePathId(spaceId: string): string {
  return spaceId.startsWith('space_') ? spaceId : `space_${spaceId}`;
}

function spaceNoteToCandidate(row: SpaceNoteRow): AddNotesCandidate {
  return {
    id: row.id,
    title: row.title ?? '',
    noteType: row.noteType ?? 'default',
    updatedAt: row.updatedAt ?? null,
    createdAt: row.createdAt ?? null,
    content: row.content ?? null,
  };
}

function noteMatchesPickerSearch(candidate: AddNotesCandidate, query: string): boolean {
  const t = query.trim().toLowerCase();
  if (!t) return true;
  const title = (candidate.title ?? '').toLowerCase();
  const preview = stripHtmlForListPreview(candidate.content ?? '', 800).toLowerCase();
  return title.includes(t) || preview.includes(t);
}

function AddNotesScopeChipBar({
  selectedId,
  onSelect,
}: {
  selectedId: AddNotesListScope;
  onSelect: (id: AddNotesListScope) => void;
}) {
  const options: { id: AddNotesListScope; label: string }[] = [
    { id: 'unsorted', label: 'Unsorted' },
    { id: 'all', label: 'All notes' },
  ];
  return (
    <div className="proto-sidebar-search-scope proto-add-notes-sheet__scope">
      <div className="proto-chip-bar" role="tablist" aria-label="Note list">
        {options.map((opt) => {
          const selected = selectedId === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={`proto-chip${selected ? ' proto-chip--selected' : ''}`}
              onClick={() => onSelect(opt.id)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AddNotesListBody({
  notes,
  selectedIds,
  onToggle,
  isPending,
  isSearching,
  showEmpty,
  debouncedTrim,
  isLoading,
  emptyHint,
}: {
  notes: AddNotesCandidate[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  isPending: boolean;
  isSearching: boolean;
  showEmpty: boolean;
  debouncedTrim: string;
  isLoading: boolean;
  emptyHint: string;
}) {
  if (isLoading && notes.length === 0) {
    return <p className="proto-inspector-muted proto-connect-note-sheet__status">Loading…</p>;
  }
  if (isSearching) {
    return <p className="proto-inspector-muted proto-connect-note-sheet__status">Searching…</p>;
  }
  if (showEmpty) {
    return (
      <div className="proto-add-notes-sheet__empty">
        <p className="proto-inspector-muted proto-connect-note-sheet__status">
          {debouncedTrim
            ? `No notes match "${debouncedTrim}".`
            : emptyHint}
        </p>
      </div>
    );
  }
  return (
    <section className="proto-add-notes-sheet__list-section">
      <ul className="proto-side-panel__note-list proto-add-notes-sheet__list">
        {notes.map((n) => {
          const title = stripServerAutoUntitledNoteTitleForDisplay((n.title ?? '').trim()) || 'New Note';
          const rel = protoRelativeCaptionAbbrev(n.updatedAt ?? n.createdAt);
          const preview = n.content ? stripHtmlForListPreview(n.content, 80) : '';
          const selected = selectedIds.has(n.id);
          return (
            <li key={n.id} className="proto-note-row-item">
              <button
                type="button"
                disabled={isPending}
                className="proto-add-notes-sheet__row"
                data-active={selected ? 'true' : undefined}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onToggle(n.id)}
                aria-pressed={selected}
              >
                <span className="proto-add-notes-sheet__select-slot" aria-hidden>
                  {selected ? (
                    <span className="proto-accent-check-orb">
                      <Icon name="check" size={11} />
                    </span>
                  ) : (
                    <span className="proto-select-orb-idle" />
                  )}
                </span>
                <div className="proto-add-notes-sheet__row-body">
                  <div className="proto-note-row__title-line">
                    <span className="pds-list-title proto-note-row__title-text">{title}</span>
                  </div>
                  {(rel || preview) ? (
                    <div className="pds-list-preview proto-note-row__preview">
                      {rel ? <span className="pds-list-timestamp">{rel}</span> : null}
                      {rel && preview ? '  ' : null}
                      {preview ? <span>{preview}</span> : null}
                    </div>
                  ) : null}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function PrototypeAddNotesPicker({
  spaceId,
  spaceNotes = [],
  excludeNoteIds = [],
  selectedIds,
  onSelectedIdsChange,
  onSelectedNoteChange,
  showListScopeToggle = false,
  defaultListScope = 'unsorted',
  selectionMode = 'multiple',
  listShell = 'plain',
  isPending = false,
}: {
  spaceId: string;
  /** Loaded space notes — primary list source (unsorted / all). */
  spaceNotes?: SpaceNoteRow[];
  excludeNoteIds?: string[];
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
  /** Fires when the selected note changes (single-select / last toggled in multi). */
  onSelectedNoteChange?: (candidate: AddNotesCandidate | null) => void;
  showListScopeToggle?: boolean;
  defaultListScope?: AddNotesListScope;
  selectionMode?: 'single' | 'multiple';
  listShell?: 'scoped' | 'plain';
  isPending?: boolean;
}) {
  const { input: searchInput, setInput: setSearchInput, debounced } = useDebouncedSearchState(280);
  const [listScope, setListScope] = useState<AddNotesListScope>(defaultListScope);
  const sidPath = normalizedSpacePathId(spaceId);
  const debouncedTrim = debounced.trim();
  const excludeSet = useMemo(() => new Set(excludeNoteIds), [excludeNoteIds]);

  const useLocalNotes = spaceNotes.length > 0;
  const excludeNoteId = excludeNoteIds[0];
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['connectNoteCandidates', sidPath, 'add-notes', debouncedTrim, excludeNoteId ?? ''] as const,
    queryFn: () =>
      api.get<ConnectNoteCandidatesResponse>(
        `/api/spaces/${encodeURIComponent(sidPath)}/connect-note-candidates`,
        {
          q: debouncedTrim,
          limit: 20,
          ...(excludeNoteId ? { excludeNoteId } : {}),
        },
      ),
    enabled: !useLocalNotes || debouncedTrim.length > 0,
    staleTime: 10_000,
  });

  const notes = useMemo(() => {
    let pool: AddNotesCandidate[];
    if (useLocalNotes && debouncedTrim.length === 0) {
      const scoped = spaceNotes.filter((row) => {
        if (excludeSet.has(row.id)) return false;
        if (listScope === 'unsorted') {
          return noteBelongsToFolderBucket(
            {
              primaryCollection: row.primaryCollection ?? null,
              secondaryCollections: row.secondaryCollections ?? [],
            },
            null,
          );
        }
        return true;
      });
      pool = sortNotesByLastUpdated(scoped).map(spaceNoteToCandidate);
    } else if (useLocalNotes && debouncedTrim.length > 0) {
      pool = sortNotesByLastUpdated(
        spaceNotes.filter((row) => {
          if (excludeSet.has(row.id)) return false;
          if (listScope === 'unsorted') {
            const unsorted = noteBelongsToFolderBucket(
              {
                primaryCollection: row.primaryCollection ?? null,
                secondaryCollections: row.secondaryCollections ?? [],
              },
              null,
            );
            if (!unsorted) return false;
          }
          return noteMatchesPickerSearch(spaceNoteToCandidate(row), debouncedTrim);
        }),
      ).map(spaceNoteToCandidate);
    } else {
      pool = (data?.notes ?? []).filter((n) => !excludeSet.has(n.id));
    }
    return pool;
  }, [useLocalNotes, spaceNotes, debouncedTrim, excludeSet, listScope, data?.notes]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const isSearching =
    debouncedTrim.length >= 1 && (isLoading || isFetching) && notes.length === 0 && !useLocalNotes;
  const showEmpty = !isSearching && notes.length === 0;
  const emptyHint = useLocalNotes
    ? listScope === 'unsorted'
      ? 'No unsorted notes — everything is already in a folder.'
      : 'No notes in this space yet.'
    : 'No notes available to connect.';

  const toggle = (id: string) => {
    const candidate = notes.find((n) => n.id === id) ?? null;
    if (selectionMode === 'single') {
      const nextIds = selectedSet.has(id) ? [] : [id];
      onSelectedIdsChange(nextIds);
      onSelectedNoteChange?.(nextIds.length > 0 ? candidate : null);
      return;
    }
    if (selectedSet.has(id)) {
      const nextIds = selectedIds.filter((x) => x !== id);
      onSelectedIdsChange(nextIds);
      onSelectedNoteChange?.(nextIds.length > 0 ? notes.find((n) => n.id === nextIds[nextIds.length - 1]) ?? null : null);
    } else {
      onSelectedIdsChange([...selectedIds, id]);
      onSelectedNoteChange?.(candidate);
    }
  };

  const listBody = (
    <AddNotesListBody
      notes={notes}
      selectedIds={selectedSet}
      onToggle={toggle}
      isPending={isPending}
      isSearching={isSearching}
      showEmpty={showEmpty}
      debouncedTrim={debouncedTrim}
      isLoading={!useLocalNotes && isLoading && notes.length === 0}
      emptyHint={emptyHint}
    />
  );

  const useScopedShell = listShell === 'scoped' || (showListScopeToggle && debouncedTrim.length === 0);

  return (
    <>
      {useScopedShell ? (
        <div className="proto-add-notes-sheet__scoped-list">
          {showListScopeToggle && debouncedTrim.length === 0 ? (
            <AddNotesScopeChipBar selectedId={listScope} onSelect={setListScope} />
          ) : null}
          <div className="proto-connect-note-sheet__search-wrap proto-add-notes-sheet__search-in-panel">
            <PrototypeSearchInput
              value={searchInput}
              onChange={setSearchInput}
              placeholder="Search notes…"
            />
          </div>
          <div
            className="proto-add-notes-sheet__scoped-list-body"
            role="region"
            aria-label={
              showListScopeToggle && debouncedTrim.length === 0
                ? listScope === 'unsorted'
                  ? 'Unsorted notes'
                  : 'All notes'
                : 'Notes to connect'
            }
          >
            {listBody}
          </div>
        </div>
      ) : (
        <>
          <div className="proto-connect-note-sheet__search-wrap">
            <PrototypeSearchInput
              value={searchInput}
              onChange={setSearchInput}
              placeholder="Search notes…"
            />
          </div>
          <div className="proto-connect-note-sheet__scroll" role="region" aria-label="Notes to add">
            {listBody}
          </div>
        </>
      )}
    </>
  );
}

/** Resolve selected note ids to rows for folder/thread mutations. */
export function resolveSelectedNoteRows(
  selectedIds: string[],
  notesById: Map<string, SpaceNoteRow>,
  spaceNotes: SpaceNoteRow[] = [],
): SpaceNoteRow[] {
  return selectedIds
    .map((id) => {
      const cached = notesById.get(id);
      if (cached) return cached;
      return spaceNotes.find((n) => n.id === id) ?? null;
    })
    .filter((row): row is SpaceNoteRow => row != null);
}

export default function PrototypeAddNotesSheet({
  open,
  onOpenChange,
  spaceId,
  mode,
  folderName,
  threadRepNoteId,
  threadMemberIds = [],
  excludeNoteIds = [],
  notesById,
  spaceNotes = [],
  onAdded,
}: PrototypeAddNotesSheetProps) {
  const { isMobileSidebar } = useProtoShell();
  const addToFolder = useAddNotesToFolder();
  const addToThread = useAddNotesToThreadCluster();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) {
      setActionError(null);
      setSelectedIds([]);
    }
  }, [open]);

  const isPending = addToFolder.isPending || addToThread.isPending;

  const shouldUseSheetPresentation =
    isMobileSidebar && typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const shouldUsePopover = open && !shouldUseSheetPresentation;

  const { position } = useProtoAnchoredPopoverPosition(
    cardRef,
    {},
    {
      enabled: shouldUsePopover,
      strategy: 'centered',
      topVhFraction: 0.15,
      fallbackWidth: 340,
      fallbackHeight: 440,
    },
    [selectedIds.length],
  );

  const title = mode === 'folder' ? 'Add notes to folder' : 'Add notes to thread';
  const canSubmit = selectedIds.length > 0 && !isPending;

  const handleSubmit = async () => {
    setActionError(null);
    const rows = resolveSelectedNoteRows(selectedIds, notesById, spaceNotes);
    if (rows.length === 0) {
      setActionError('Could not resolve selected notes.');
      return;
    }
    try {
      if (mode === 'folder') {
        const name = folderName?.trim();
        if (!name) throw new Error('Folder name is required');
        await addToFolder.mutateAsync({ rows, folderName: name, spaceId });
      } else {
        const rep = threadRepNoteId?.trim();
        if (!rep) throw new Error('Thread is required');
        await addToThread.mutateAsync({
          noteIds: selectedIds,
          repNoteId: rep,
          memberIds: threadMemberIds,
          spaceId,
        });
      }
      onOpenChange(false);
      onAdded?.();
      try {
        window.toast?.success(
          selectedIds.length === 1 ? 'Note added' : `${selectedIds.length} notes added`,
        );
      } catch {
        /* ignore */
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not add notes.');
    }
  };

  useDismissOnOutside(cardRef, () => onOpenChange(false), shouldUsePopover);

  if (!open) return null;

  const content = (
    <>
      <div className="proto-study-thread-popover__header">
        <div className="proto-study-thread-popover__title-row">
          <Icon name={mode === 'folder' ? 'folder' : 'arrow-right-arrow-left'} size={13} aria-hidden />
          <span className="proto-study-thread-popover__title">{title}</span>
        </div>
        <button
          type="button"
          className="proto-side-panel__action-btn"
          onClick={() => onOpenChange(false)}
          aria-label="Close"
          title="Close"
        >
          <Icon name="xmark" size={12} />
        </button>
      </div>

      <PrototypeAddNotesPicker
        spaceId={spaceId}
        spaceNotes={spaceNotes}
        excludeNoteIds={excludeNoteIds}
        selectedIds={selectedIds}
        onSelectedIdsChange={setSelectedIds}
        showListScopeToggle
        defaultListScope="unsorted"
      />

      {actionError ? (
        <p className="proto-connect-note-sheet__error" role="alert">
          {actionError}
        </p>
      ) : null}

      <div className="proto-add-notes-sheet__footer">
        <button
          type="button"
          className="proto-share-popover__primary"
          disabled={!canSubmit}
          onClick={() => void handleSubmit()}
        >
          {isPending ? 'Adding…' : selectedIds.length > 0 ? `Add ${selectedIds.length} note${selectedIds.length === 1 ? '' : 's'}` : 'Add notes'}
        </button>
      </div>
    </>
  );

  if (shouldUsePopover && typeof document !== 'undefined') {
    return createPortal(
      <ProtoPopoverShell
        ref={cardRef}
        role="dialog"
        aria-label={title}
        className="proto-connect-note-popover proto-add-notes-popover"
        style={{
          position: 'fixed',
          top: position?.top ?? -9999,
          left: position?.left ?? -9999,
          zIndex: 6000,
        }}
      >
        <div className="proto-connect-note-sheet proto-connect-note-sheet--popover proto-add-notes-sheet">{content}</div>
      </ProtoPopoverShell>,
      document.body,
    );
  }

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        onOverlayClick={() => onOpenChange(false)}
        overlayClassName="proto-connect-note-sheet-overlay"
        className="proto-connect-note-sheet proto-add-notes-sheet"
      >
        {content}
      </DrawerContent>
    </Drawer.Root>
  );
}

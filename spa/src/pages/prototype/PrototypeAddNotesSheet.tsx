import { useEffect, useId, useMemo, useRef, useState } from 'react';
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
import ProtoDialogBackdrop, { portaledDialogShellClassName } from './ProtoDialogBackdrop';
import { useDismissOnOutside } from '../../hooks/usePopoverDismiss';
import { useProtoDialogFocus } from '../../hooks/useProtoDialogFocus';
import { useProtoOverlayMotion } from '../../hooks/useProtoOverlayMotion';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { useProtoAnchoredPopoverPosition } from './useProtoAnchoredPopoverPosition';
import { protoRelativeCaptionAbbrev } from './proto-time';
import type { SpaceNoteRow } from '../../hooks/queries/useSpace';
import type { FolderMutationSpaceKind } from '../../hooks/mutations/useAddNotesToFolder';
import { noteBelongsToFolderBucket } from '@/utils/note-folder-display';
import { sortNotesByLastUpdated } from '@/utils/sorting';
import { isSaveCopyRequiredError, useAssociateNoteWithSpace } from '../../hooks/mutations/useSpaceNoteAssociation';
import { useSaveNoteCopy } from '../../hooks/mutations/useCopyNotesToSpace';
import { useAttachNotesToCurrentThread } from '../../hooks/mutations/useAttachNotesToCurrentThread';
import { usePrototypeHomeSpaceId } from '../../hooks/usePrototypeHomeSpaceId';
import { useNavigate } from '@tanstack/react-router';
import { prototypeNoteRouteTo } from '@/lib/prototype-path';
import { noteParamSlug } from './proto-route-slugs';
import { PROTOTYPE_NOTE_LIST_NAV_SEARCH } from '@/utils/prototype-sidebar-highlight-active';

export type AddNotesListScope = 'unsorted' | 'all';

export interface AddNotesCandidate {
  id: string;
  title: string;
  noteType: string;
  updatedAt: string | null;
  createdAt: string | null;
  content: string | null;
  isOwnNote?: boolean;
  isAssociatedWithTarget?: boolean;
}

interface ConnectNoteCandidatesResponse {
  notes: AddNotesCandidate[];
}

export type PrototypeAddNotesSheetMode = 'folder' | 'thread' | 'current-thread';

export interface PrototypeAddNotesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  spaceKind: FolderMutationSpaceKind;
  mode: PrototypeAddNotesSheetMode;
  /** Named folder when mode is folder. */
  folderName?: string;
  /** Representative note id when mode is thread. */
  threadRepNoteId?: string;
  /** Current cluster member ids when mode is thread. */
  threadMemberIds?: string[];
  /** Real shared Thread id when mode is current-thread. */
  currentThreadId?: string;
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
  /** Actual target-space owner; leaders do not receive moderation controls. */
  viewerIsSpaceOwner?: boolean;
  candidateSourceError?: boolean;
  onRetryCandidates?: () => void;
}

export type SharedAddNotesRequestPlan =
  'organize-associated' | 'associate-then-organize' | 'save-copy-required' | 'forbidden';

/** Decide whether a shared-space candidate needs association, organization, or an explicit copy flow. */
export function planSharedAddNotesRequest(options: {
  isAlreadyAssociated: boolean;
  isOwnNote: boolean;
  isSpaceOwner: boolean;
}): SharedAddNotesRequestPlan {
  if (options.isAlreadyAssociated) {
    return options.isOwnNote || options.isSpaceOwner ? 'organize-associated' : 'forbidden';
  }
  return options.isOwnNote ? 'associate-then-organize' : 'save-copy-required';
}

/** Current Thread candidates are active, viewer-authored, unencrypted, and not already attached. */
export function filterCurrentThreadAttachmentCandidates(
  notes: SpaceNoteRow[],
  attachedNoteIds: Iterable<string>,
): SpaceNoteRow[] {
  const attached = new Set(attachedNoteIds);
  return notes.filter((note) => note.isOwnNote === true && note.contentEncrypted !== true && !attached.has(note.id));
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
    isOwnNote: row.isOwnNote,
    isAssociatedWithTarget: true,
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
  isError,
  onRetry,
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
  isError: boolean;
  onRetry: () => void;
}) {
  if (isError) {
    return (
      <div className="proto-shared-thread-state" role="alert">
        <p>Could not load notes.</p>
        <button type="button" className="proto-shared-thread-action" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }
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
          {debouncedTrim ? `No notes match "${debouncedTrim}".` : emptyHint}
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
                  {rel || preview ? (
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
  localOnly = false,
  localEmptyHint,
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
  /** Never fall back to broad server candidates; the supplied rows are the authorization boundary. */
  localOnly?: boolean;
  localEmptyHint?: string;
}) {
  const { input: searchInput, setInput: setSearchInput, debounced } = useDebouncedSearchState(280);
  const [listScope, setListScope] = useState<AddNotesListScope>(defaultListScope);
  const sidPath = normalizedSpacePathId(spaceId);
  const debouncedTrim = debounced.trim();
  const excludeSet = useMemo(() => new Set(excludeNoteIds), [excludeNoteIds]);

  const useLocalNotes = localOnly || spaceNotes.length > 0;
  const excludeNoteId = excludeNoteIds[0];
  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ['connectNoteCandidates', sidPath, 'add-notes', debouncedTrim, excludeNoteId ?? ''] as const,
    queryFn: () =>
      api.get<ConnectNoteCandidatesResponse>(`/api/spaces/${encodeURIComponent(sidPath)}/connect-note-candidates`, {
        q: debouncedTrim,
        limit: 20,
        ...(excludeNoteId ? { excludeNoteId } : {}),
      }),
    enabled: !localOnly && (!useLocalNotes || debouncedTrim.length > 0),
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
  const isSearching = debouncedTrim.length >= 1 && (isLoading || isFetching) && notes.length === 0 && !useLocalNotes;
  const showEmpty = !isSearching && notes.length === 0;
  const emptyHint =
    localEmptyHint ??
    (useLocalNotes
      ? listScope === 'unsorted'
        ? 'No unsorted notes — everything is already in a folder.'
        : 'No notes in this space yet.'
      : 'No notes available to connect.');

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
      onSelectedNoteChange?.(
        nextIds.length > 0 ? (notes.find((n) => n.id === nextIds[nextIds.length - 1]) ?? null) : null,
      );
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
      isError={!useLocalNotes && isError}
      onRetry={() => void refetch()}
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
            <PrototypeSearchInput value={searchInput} onChange={setSearchInput} placeholder="Search notes…" />
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
            <PrototypeSearchInput value={searchInput} onChange={setSearchInput} placeholder="Search notes…" />
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
  spaceKind,
  mode,
  folderName,
  threadRepNoteId,
  threadMemberIds = [],
  currentThreadId,
  excludeNoteIds = [],
  notesById,
  spaceNotes = [],
  onAdded,
  viewerIsSpaceOwner = false,
  candidateSourceError = false,
  onRetryCandidates,
}: PrototypeAddNotesSheetProps) {
  const { isMobileSidebar } = useProtoShell();
  const { mounted, exiting } = useProtoOverlayMotion(open);
  const addToFolder = useAddNotesToFolder();
  const addToThread = useAddNotesToThreadCluster();
  const attachToCurrentThread = useAttachNotesToCurrentThread();
  const associateNote = useAssociateNoteWithSpace();
  const saveCopy = useSaveNoteCopy();
  const { homeSpaceId } = usePrototypeHomeSpaceId();
  const navigate = useNavigate();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const headingId = useId();
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saveCopyRequiredNoteId, setSaveCopyRequiredNoteId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setActionError(null);
      setSelectedIds([]);
      setSaveCopyRequiredNoteId(null);
    }
  }, [open]);

  const isPending =
    addToFolder.isPending ||
    addToThread.isPending ||
    attachToCurrentThread.isPending ||
    associateNote.isPending ||
    saveCopy.isPending;

  const shouldUseSheetPresentation =
    isMobileSidebar && typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const usePopoverPresentation = !shouldUseSheetPresentation;
  const showPopoverPortal = usePopoverPresentation && mounted;

  const { position } = useProtoAnchoredPopoverPosition(
    cardRef,
    {},
    {
      enabled: showPopoverPortal,
      strategy: 'centered',
      topVhFraction: 0.15,
      fallbackWidth: 340,
      fallbackHeight: 440,
    },
    [selectedIds.length],
  );

  const title =
    mode === 'folder' ? 'Add notes to folder' : mode === 'current-thread' ? 'Add existing note' : 'Add notes to Thread';
  const canSubmit = selectedIds.length > 0 && !isPending && !candidateSourceError;
  const associatedNoteIds = useMemo(
    () => new Set([...spaceNotes.map((row) => row.id), ...notesById.keys()]),
    [notesById, spaceNotes],
  );
  const visibleSpaceNotes = useMemo(() => {
    if (mode === 'current-thread') {
      return filterCurrentThreadAttachmentCandidates(spaceNotes, excludeNoteIds);
    }
    return spaceKind === 'shared' && !viewerIsSpaceOwner
      ? spaceNotes.filter((row) => row.isOwnNote !== false)
      : spaceNotes;
  }, [excludeNoteIds, mode, spaceKind, spaceNotes, viewerIsSpaceOwner]);

  const handleSubmit = async () => {
    setActionError(null);
    setSaveCopyRequiredNoteId(null);
    const rows = resolveSelectedNoteRows(selectedIds, notesById, spaceNotes);
    if (rows.length === 0) {
      setActionError('Could not resolve selected notes.');
      return;
    }
    try {
      if (spaceKind === 'shared') {
        for (const row of rows) {
          const requestPlan = planSharedAddNotesRequest({
            isAlreadyAssociated: associatedNoteIds.has(row.id),
            isOwnNote: row.isOwnNote !== false,
            isSpaceOwner: viewerIsSpaceOwner,
          });
          if (requestPlan === 'organize-associated') continue;
          if (requestPlan === 'forbidden') {
            setActionError('Only the note author or space owner can organize this note.');
            return;
          }
          if (requestPlan === 'save-copy-required') {
            setSaveCopyRequiredNoteId(row.id);
            setActionError('This note belongs to another author. Save an independent copy to My Home instead.');
            return;
          }
          try {
            await associateNote.mutateAsync({ spaceId, noteId: row.id });
          } catch (error) {
            if (isSaveCopyRequiredError(error)) {
              setSaveCopyRequiredNoteId(row.id);
              setActionError('This note belongs to another author. Save an independent copy to My Home instead.');
              return;
            }
            throw error;
          }
        }
      }
      if (mode === 'folder') {
        const name = folderName?.trim();
        if (!name) throw new Error('Folder name is required');
        await addToFolder.mutateAsync({
          rows,
          folderName: name,
          spaceId,
          spaceKind,
        });
      } else if (mode === 'thread') {
        const rep = threadRepNoteId?.trim();
        if (!rep) throw new Error('Thread is required');
        await addToThread.mutateAsync({
          noteIds: selectedIds,
          repNoteId: rep,
          memberIds: threadMemberIds,
          spaceId,
        });
      } else {
        const threadId = currentThreadId?.trim();
        if (!threadId) throw new Error('Current Thread is required');
        await attachToCurrentThread.mutateAsync({
          noteIds: selectedIds,
          threadId,
          spaceId,
        });
      }
      onOpenChange(false);
      onAdded?.();
      try {
        window.toast?.success(selectedIds.length === 1 ? 'Note added' : `${selectedIds.length} notes added`);
      } catch {
        /* ignore */
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not add notes.');
    }
  };

  const handleSaveCopy = async () => {
    if (!saveCopyRequiredNoteId || !homeSpaceId) return;
    setActionError(null);
    try {
      const result = await saveCopy.mutateAsync({
        homeSpaceId,
        sourceNoteId: saveCopyRequiredNoteId,
      });
      onOpenChange(false);
      navigate({
        to: prototypeNoteRouteTo(),
        params: { noteId: noteParamSlug(result.newNoteId) },
        search: PROTOTYPE_NOTE_LIST_NAV_SEARCH,
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not save a copy.');
    }
  };

  useDismissOnOutside(cardRef, () => onOpenChange(false), open && usePopoverPresentation, {
    dismissOnEscape: false,
  });
  useProtoDialogFocus({
    open: open && showPopoverPortal,
    dialogRef: cardRef,
    onDismiss: () => onOpenChange(false),
  });

  const content = (
    <>
      <div className="proto-study-thread-popover__header">
        <div className="proto-study-thread-popover__title-row">
          <Icon name={mode === 'folder' ? 'folder' : 'arrow-right-arrow-left'} size={13} aria-hidden />
          <span
            id={headingId}
            className="proto-study-thread-popover__title"
            role="heading"
            aria-level={2}
            tabIndex={-1}
            data-proto-dialog-heading
          >
            {title}
          </span>
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

      {candidateSourceError ? (
        <div className="proto-shared-thread-state" role="alert">
          <p>Could not load notes to add.</p>
          {onRetryCandidates ? (
            <button type="button" className="proto-shared-thread-action" onClick={onRetryCandidates}>
              Retry
            </button>
          ) : null}
        </div>
      ) : (
        <PrototypeAddNotesPicker
          spaceId={spaceId}
          spaceNotes={visibleSpaceNotes}
          excludeNoteIds={excludeNoteIds}
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
          showListScopeToggle={mode !== 'current-thread'}
          defaultListScope={mode === 'current-thread' ? 'all' : 'unsorted'}
          localOnly={mode === 'current-thread'}
          localEmptyHint={
            mode === 'current-thread'
              ? 'No eligible notes. Only your active, unencrypted notes that are not already in this Thread appear here.'
              : undefined
          }
        />
      )}

      {actionError ? (
        <p className="proto-connect-note-sheet__error" role="alert">
          {actionError}
        </p>
      ) : null}

      {saveCopyRequiredNoteId ? (
        <button
          type="button"
          className="proto-share-popover__primary"
          disabled={!homeSpaceId || saveCopy.isPending}
          onClick={() => void handleSaveCopy()}
        >
          {saveCopy.isPending ? 'Saving a copy…' : 'Save a copy to My Home'}
        </button>
      ) : null}

      <div className="proto-add-notes-sheet__footer">
        <button
          type="button"
          className="proto-share-popover__primary"
          disabled={!canSubmit}
          onClick={() => void handleSubmit()}
        >
          {isPending
            ? 'Adding…'
            : selectedIds.length > 0
              ? `Add ${selectedIds.length} note${selectedIds.length === 1 ? '' : 's'}`
              : 'Add notes'}
        </button>
      </div>
    </>
  );

  if (showPopoverPortal && typeof document !== 'undefined') {
    return createPortal(
      <>
        <ProtoDialogBackdrop
          exiting={exiting}
          onDismiss={() => onOpenChange(false)}
          aria-label={`Close ${title} dialog`}
        />
        <ProtoPopoverShell
          ref={cardRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={headingId}
          className={portaledDialogShellClassName('proto-connect-note-popover proto-add-notes-popover', exiting)}
          style={{
            position: 'fixed',
            top: position?.top ?? -9999,
            left: position?.left ?? -9999,
            zIndex: 6000,
          }}
        >
          <div className="proto-connect-note-sheet proto-connect-note-sheet--popover proto-add-notes-sheet">
            {content}
          </div>
        </ProtoPopoverShell>
      </>,
      document.body,
    );
  }

  if (!open) return null;

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        onOverlayClick={() => onOpenChange(false)}
        overlayClassName="proto-connect-note-sheet-overlay"
        className="proto-connect-note-sheet proto-add-notes-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
      >
        {content}
      </DrawerContent>
    </Drawer.Root>
  );
}

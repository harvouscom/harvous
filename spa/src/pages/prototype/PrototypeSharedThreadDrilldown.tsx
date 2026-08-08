import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import { prototypeNoteRouteTo } from '@/lib/prototype-path';
import { toPrototypeSpaceSearchParam } from '../../utils/prototype-space-api-id';
import { stripHtmlForListPreview } from '@/utils/html-stripper';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import {
  flattenThreadNotePages,
  pulseLabel,
  sequenceStepFor,
  useThreadNotes,
  type SharedThreadNote,
} from '../../hooks/queries/useThreadNotes';
import { api } from '../../lib/api';
import type { SpaceGroupStudyThread } from '../../hooks/queries/useSpaceGroupThreads';
import { useSpaceNotes } from '../../hooks/queries/useSpace';
import { useUpdateSharedThread } from '../../hooks/mutations/useUpdateSharedThread';
import {
  reorderSequenceStep,
  useUpdateThreadSequence,
} from '../../hooks/mutations/useUpdateThreadSequence';
import { validSharedThreadColor } from '../../hooks/mutations/useCreateSharedThread';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { PROTOTYPE_NOTE_LIST_NAV_SEARCH } from '@/utils/prototype-sidebar-highlight-active';
import { noteParamSlug } from './proto-route-slugs';
import { protoRelativeCaption } from './proto-time';
import ProtoSpaceLoading from './ProtoSpaceLoading';
import ProtoSpaceMenuIcon from './ProtoSpaceMenuIcon';
import PrototypeSidebarToolbar from './PrototypeSidebarToolbar';
import PrototypeListEmptyState from './PrototypeListEmptyState';
import SharedSpaceNoteAuthorChip from './SharedSpaceNoteAuthorChip';
import PrototypeAddNotesSheet from './PrototypeAddNotesSheet';
import PrototypeSidebarRowMenuPopover from './PrototypeSidebarRowMenuPopover';
import { PROTO_TOOLBAR_ICON_SIZE } from './proto-toolbar-tokens';
import {
  SHARED_THREAD_DRILLDOWN_ADD_EXISTING_LABEL,
  SHARED_THREAD_DRILLDOWN_COMPOSE_LABEL,
} from './shared-space-dashboard';

export type SharedThreadDrilldownState = 'loading' | 'error' | 'empty' | 'ready';
export type SharedThreadDrillTarget = Pick<SpaceGroupStudyThread, 'id' | 'title' | 'isPinned' | 'color'>;

export function resolveSharedThreadDrilldownState(input: {
  isLoading: boolean;
  isError: boolean;
  noteCount: number;
}): SharedThreadDrilldownState {
  if (input.isLoading) return 'loading';
  if (input.isError) return 'error';
  return input.noteCount === 0 ? 'empty' : 'ready';
}

export function sharedThreadNoteNavigation(noteId: string, spaceId: string) {
  return {
    to: prototypeNoteRouteTo(),
    params: { noteId: noteParamSlug(noteId) },
    search: {
      ...PROTOTYPE_NOTE_LIST_NAV_SEARCH,
      space: toPrototypeSpaceSearchParam(spaceId),
    },
  };
}

export function canLoadMoreThreadNotes(input: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
}): boolean {
  return input.hasNextPage && !input.isFetchingNextPage;
}

function noteTitle(note: SharedThreadNote): string {
  return (
    stripServerAutoUntitledNoteTitleForDisplay(note.title) ||
    stripHtmlForListPreview(note.content, 52) ||
    `Note N${note.simpleNoteId?.toString().padStart(3, '0') ?? ''}`
  );
}

function notePreview(note: SharedThreadNote): string {
  const preview = stripHtmlForListPreview(note.content, 100);
  return preview === noteTitle(note) ? '' : preview;
}

export default function PrototypeSharedThreadDrilldown({
  thread,
  spaceId,
  isOwner,
  canManageStructure,
  canCompose = true,
  backLabel = 'Shared space',
  onBack,
  onCompose,
  onSetCurrent,
  onRequestDelete,
  onThreadUpdated,
}: {
  thread: SharedThreadDrillTarget;
  spaceId: string;
  isOwner: boolean;
  /**
   * Who may author the plan — its mode, its order, its current step. Separate
   * from `isOwner` because the server lets leaders do this too: the room
   * outlives the staff member who created it. Falls back to `isOwner`.
   */
  canManageStructure?: boolean;
  /** When false (ministry broadcast channels), hide compose / add-existing. */
  canCompose?: boolean;
  /** Parent destination for the back control (space title). */
  backLabel?: string;
  onBack: () => void;
  onCompose: () => void;
  onSetCurrent: (threadId: string) => Promise<unknown>;
  onRequestDelete?: (anchorRect: DOMRect) => void;
  onThreadUpdated?: (patch: Pick<SharedThreadDrillTarget, 'title' | 'color'>) => void;
}) {
  const navigate = useNavigate();
  const { isMobileSidebar, closeDrawer } = useProtoShell();
  const notesQuery = useThreadNotes(thread.id, spaceId);
  const candidateNotesQuery = useSpaceNotes(spaceId, 100);
  const updateThread = useUpdateSharedThread();
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinPending, setPinPending] = useState(false);
  const [addExistingOpen, setAddExistingOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(thread.title);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [sequenceError, setSequenceError] = useState<string | null>(null);
  const updateSequence = useUpdateThreadSequence();
  const loadMoreRequestRef = useRef(false);
  const skipTitleBlurSaveRef = useRef(false);
  const headerRef = useRef<HTMLDivElement>(null);
  const menuRootRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const notes = useMemo(
    () => flattenThreadNotePages(notesQuery.data?.pages),
    [notesQuery.data?.pages],
  );
  /*
    Mode and step come off the first page — they describe the Thread, not the
    slice of it we happen to be holding. The server resolves the step against
    every note in the plan, so `total` survives pagination.
  */
  const firstPage = notesQuery.data?.pages?.[0];
  const isSequence = firstPage?.mode === 'sequence';
  const sequenceInfo = firstPage?.sequence ?? null;
  /* Present only when the server decided this viewer may see it — a member's
     payload has no pulse at all, so there is nothing here to conditionally hide. */
  const pulse = firstPage?.pulse ?? null;
  /*
    The server already returned the notes in authored order, so their position
    here IS the plan. Reading the order off the rendered list rather than a
    parallel id array keeps the two from disagreeing mid-reorder.
  */
  const orderedNoteIds = useMemo(() => notes.map((note) => note.id), [notes]);
  const canManageSequence = canManageStructure ?? isOwner;
  const sequenceLabel = isSequence && sequenceInfo && sequenceInfo.total > 0
    ? sequenceInfo.currentIndex > 0
      ? `Step ${sequenceInfo.currentIndex} of ${sequenceInfo.total}`
      : `${sequenceInfo.total} steps`
    : null;

  async function applySequence(patch: {
    mode?: 'collection' | 'sequence';
    orderedNoteIds?: string[];
    currentNoteId?: string | null;
  }) {
    setSequenceError(null);
    try {
      await updateSequence.mutateAsync({ threadId: thread.id, spaceId, ...patch });
    } catch (error: any) {
      setSequenceError(error?.message || 'Could not update the study plan.');
    }
  }
  const candidateNotes = useMemo(
    () => candidateNotesQuery.data?.pages.flatMap((page) => page.notes) ?? [],
    [candidateNotesQuery.data?.pages],
  );
  const candidateNotesById = useMemo(
    () => new Map(candidateNotes.map((note) => [note.id, note])),
    [candidateNotes],
  );
  const state = resolveSharedThreadDrilldownState({
    isLoading: notesQuery.isPending,
    isError: notesQuery.isError && notes.length === 0,
    noteCount: notes.length,
  });
  const showOwnerMenu =
    (isOwner && (!thread.isPinned || Boolean(onRequestDelete))) || canManageSequence;
  const showComposeActions = thread.isPinned && canCompose;

  useEffect(() => {
    if (!isEditingTitle) setTitleDraft(thread.title);
  }, [thread.title, isEditingTitle]);

  useEffect(() => {
    if (!isEditingTitle) return;
    titleInputRef.current?.focus();
    titleInputRef.current?.select();
  }, [isEditingTitle]);

  const openNote = (noteId: string) => {
    /*
      Tell the server this step was opened. Fire-and-forget on purpose: nothing
      on screen waits for it, and a lost tick costs one count rather than a
      reader staring at a spinner. Only ever writes the caller's own row.
    */
    if (isSequence) {
      void api
        .post(`/api/threads/${encodeURIComponent(thread.id)}/progress`, { noteId })
        .catch(() => {});
    }
    if (isMobileSidebar) closeDrawer({ preserveHistory: true });
    navigate(sharedThreadNoteNavigation(noteId, spaceId));
  };

  const setCurrent = async () => {
    setPinError(null);
    setPinPending(true);
    try {
      await onSetCurrent(thread.id);
    } catch (error) {
      setPinError(error instanceof Error ? error.message : 'Could not set this Thread as current.');
    } finally {
      setPinPending(false);
    }
  };

  const cancelTitleEdit = () => {
    skipTitleBlurSaveRef.current = true;
    setIsEditingTitle(false);
    setTitleDraft(thread.title);
    setRenameError(null);
  };

  const saveTitle = async () => {
    if (skipTitleBlurSaveRef.current) {
      skipTitleBlurSaveRef.current = false;
      return;
    }
    const nextTitle = titleDraft.trim();
    if (!nextTitle) {
      setTitleDraft(thread.title);
      setIsEditingTitle(false);
      setRenameError(null);
      return;
    }
    if (nextTitle === thread.title.trim()) {
      setIsEditingTitle(false);
      setRenameError(null);
      return;
    }
    setRenameError(null);
    try {
      const updated = await updateThread.mutateAsync({
        spaceId,
        threadId: thread.id,
        title: nextTitle,
        color: thread.color,
      });
      const nextColor = validSharedThreadColor(updated.color ?? thread.color);
      onThreadUpdated?.({ title: updated.title, color: nextColor });
      setTitleDraft(updated.title);
      setIsEditingTitle(false);
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : 'Could not rename this Thread.');
    }
  };

  const loadMore = async () => {
    if (loadMoreRequestRef.current || !canLoadMoreThreadNotes(notesQuery)) return;
    loadMoreRequestRef.current = true;
    try {
      await notesQuery.fetchNextPage();
    } finally {
      loadMoreRequestRef.current = false;
    }
  };

  return (
    <>
    <div className="proto-sidebar-root proto-shared-thread-drilldown">
      {isMobileSidebar ? <PrototypeSidebarToolbar variant="drawer" /> : null}
      <div className="proto-shared-thread-drilldown__header" ref={headerRef}>
        <div className="proto-shared-thread-drilldown__identity">
          {/*
            Back sits in the identity slot, exactly as the church tools panes
            do — one header row instead of a separate back row above a second
            header. The Thread's own glyph gives way to it the same way the
            church glyph does.
          */}
          <button
            type="button"
            className="proto-shared-space-header__church-icon proto-sidebar-back-tile"
            onClick={onBack}
            aria-label={`Back to ${backLabel}`}
          >
            <Icon name="caret-left" size={16} aria-hidden />
          </button>
          <div className="proto-shared-thread-drilldown__meta">
            {isOwner && isEditingTitle ? (
              <input
                ref={titleInputRef}
                type="text"
                className="proto-create-folder-sheet__name-input proto-shared-thread-drilldown__title-input"
                value={titleDraft}
                disabled={updateThread.isPending}
                aria-label="Thread name"
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={() => void saveTitle()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void saveTitle();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelTitleEdit();
                  }
                }}
              />
            ) : isOwner ? (
              <button
                type="button"
                className="proto-shared-thread-drilldown__title-button"
                onClick={() => {
                  setRenameError(null);
                  setTitleDraft(thread.title);
                  setIsEditingTitle(true);
                }}
                aria-label={`Rename Thread ${thread.title}`}
              >
                <span className="pds-list-title proto-shared-thread-drilldown__title">{thread.title}</span>
              </button>
            ) : (
              <h2 className="pds-list-title proto-shared-thread-drilldown__title">{thread.title}</h2>
            )}
            <p className="proto-caption proto-shared-thread-drilldown__status">
              {thread.isPinned ? 'Current Thread' : 'Thread'}
              {sequenceLabel ? ` · ${sequenceLabel}` : ''}
            </p>
          </div>
          {showOwnerMenu ? (
            <div
              className={`proto-menu proto-shared-thread-drilldown__menu${menuOpen ? ' proto-shared-thread-drilldown__menu--open' : ''}`}
              ref={menuRootRef}
            >
              <button
                type="button"
                className="proto-toolbar-icon-btn proto-shared-thread-drilldown__menu-trigger"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                aria-label="Thread actions"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenuOpen((open) => !open);
                }}
              >
                <Icon name="ellipsis-vertical" size={15} />
              </button>
              <PrototypeSidebarRowMenuPopover
                open={menuOpen}
                rowRef={headerRef}
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
                      disabled={pinPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen(false);
                        void setCurrent();
                      }}
                    >
                      <span className="proto-menu-item__icon" aria-hidden>
                        <Icon name="thumbtack" size={PROTO_TOOLBAR_ICON_SIZE} />
                      </span>
                      <span className="proto-menu-item__label">
                        {pinPending ? 'Setting…' : 'Set current'}
                      </span>
                    </button>
                  ) : null}
                  {canManageSequence ? (
                    <button
                      type="button"
                      role="menuitem"
                      className="proto-menu-item"
                      disabled={updateSequence.isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen(false);
                        void applySequence({ mode: isSequence ? 'collection' : 'sequence' });
                      }}
                    >
                      <span className="proto-menu-item__icon" aria-hidden>
                        <Icon name="list-check" size={PROTO_TOOLBAR_ICON_SIZE} />
                      </span>
                      <span className="proto-menu-item__label">
                        {isSequence ? 'Turn off study plan' : 'Make it a study plan'}
                      </span>
                    </button>
                  ) : null}
                  {onRequestDelete ? (
                    <button
                      type="button"
                      role="menuitem"
                      className="proto-menu-item proto-menu-item--destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen(false);
                        onRequestDelete(e.currentTarget.getBoundingClientRect());
                      }}
                    >
                      <span className="proto-menu-item__icon" aria-hidden>
                        <Icon name="trash-can" size={PROTO_TOOLBAR_ICON_SIZE} />
                      </span>
                      <span className="proto-menu-item__label">Delete</span>
                    </button>
                  ) : null}
                </div>
              </PrototypeSidebarRowMenuPopover>
            </div>
          ) : null}
        </div>

        {renameError ? (
          <p className="proto-connect-note-sheet__error" role="alert">
            {renameError}
          </p>
        ) : null}

        {showComposeActions ? (
          <div className="proto-shared-thread-drilldown__actions">
            <button type="button" className="proto-shared-thread-action" onClick={() => setAddExistingOpen(true)}>
              {SHARED_THREAD_DRILLDOWN_ADD_EXISTING_LABEL}
            </button>
            <button
              type="button"
              className="proto-shared-thread-action proto-shared-thread-action--primary"
              onClick={onCompose}
            >
              {SHARED_THREAD_DRILLDOWN_COMPOSE_LABEL}
            </button>
          </div>
        ) : null}

        {pinError ? (
          <p className="proto-connect-note-sheet__error" role="alert">
            {pinError}
          </p>
        ) : null}

        {sequenceError ? (
          <p className="proto-connect-note-sheet__error" role="alert">
            {sequenceError}
          </p>
        ) : null}
      </div>

      <div className="proto-sidebar-scroll proto-shared-thread-drilldown__scroll">
        {state === 'loading' ? <ProtoSpaceLoading label="Loading Thread" /> : null}
        {state === 'error' ? (
          <div className="proto-shared-thread-state" role="alert">
            <p>Could not load this Thread.</p>
            <button type="button" className="proto-shared-thread-action" onClick={() => void notesQuery.refetch()}>
              Retry
            </button>
          </div>
        ) : null}
        {state === 'empty' ? (
          <PrototypeListEmptyState
            iconName="note-sticky"
            title="No notes yet"
            description={
              thread.isPinned ? 'Add an existing note or compose something new.' : undefined
            }
          />
        ) : null}
        {state === 'ready' ? (
          <>
            <ul className="proto-shared-thread-note-list" aria-label={`Notes in ${thread.title}`}>
              {notes.map((note, index) => {
                const preview = notePreview(note);
                const date = protoRelativeCaption(note.lastUpdated);
                /*
                  Steps past the current one read as "not yet", not "not
                  allowed" — these notes are reachable from the space's notes
                  list and search either way. Dimming is pacing.
                */
                const step = sequenceStepFor(
                  note.id,
                  orderedNoteIds,
                  sequenceInfo?.currentNoteId ?? null,
                );
                const stepNumber = step.stepNumber;
                const stepPulse = isSequence ? pulseLabel(pulse, note.id) : null;
                const isCurrentStep = isSequence && step.isCurrent;
                const isAhead = isSequence && step.isAhead;
                return (
                  <li
                    key={note.id}
                    className={`proto-note-row-item proto-shared-thread-note-row${
                      isSequence ? ' proto-shared-thread-step' : ''
                    }${isCurrentStep ? ' proto-shared-thread-step--current' : ''}${
                      isAhead ? ' proto-shared-thread-step--ahead' : ''
                    }`}
                  >
                    <button type="button" className="proto-note-row__main" onClick={() => openNote(note.id)}>
                      <div className="proto-note-row__title-line">
                        {isSequence ? (
                          <span className="proto-shared-thread-step__badge" aria-hidden>
                            {stepNumber}
                          </span>
                        ) : null}
                        <span className="pds-list-title proto-note-row__title-text">
                          {isSequence ? (
                            <span className="proto-visually-hidden">{`Step ${stepNumber}${
                              isCurrentStep ? ', current step' : ''
                            }: `}</span>
                          ) : null}
                          {noteTitle(note)}
                        </span>
                      </div>
                      {preview ? <div className="pds-list-preview proto-note-row__preview">{preview}</div> : null}
                      <div className="proto-shared-thread-note-row__meta">
                        <SharedSpaceNoteAuthorChip
                          displayName={note.authorDisplayName}
                          userId={note.authorUserId ?? ''}
                          color={note.authorColor}
                          isSelf={note.isOwnNote}
                        />
                        {date ? <span>{date}</span> : null}
                        {/* Shepherding, not a scoreboard — the server only
                            sends this to owner/leader. */}
                        {stepPulse ? (
                          <span className="proto-shared-thread-step__pulse">{stepPulse}</span>
                        ) : null}
                      </div>
                    </button>
                    {isSequence && canManageSequence ? (
                      <div className="proto-shared-thread-step__controls">
                        <button
                          type="button"
                          className="proto-toolbar-icon-btn"
                          aria-label={`Move ${noteTitle(note)} earlier`}
                          disabled={index === 0 || updateSequence.isPending}
                          onClick={() =>
                            void applySequence({
                              orderedNoteIds: reorderSequenceStep(orderedNoteIds, note.id, 'up'),
                            })
                          }
                        >
                          <Icon name="caret-up" size={11} />
                        </button>
                        <button
                          type="button"
                          className="proto-toolbar-icon-btn"
                          aria-label={`Move ${noteTitle(note)} later`}
                          disabled={index === notes.length - 1 || updateSequence.isPending}
                          onClick={() =>
                            void applySequence({
                              orderedNoteIds: reorderSequenceStep(orderedNoteIds, note.id, 'down'),
                            })
                          }
                        >
                          <Icon name="caret-down" size={11} />
                        </button>
                        {!isCurrentStep ? (
                          <button
                            type="button"
                            className="proto-toolbar-icon-btn"
                            aria-label={`Make ${noteTitle(note)} the current step`}
                            disabled={updateSequence.isPending}
                            onClick={() => void applySequence({ currentNoteId: note.id })}
                          >
                            <Icon name="thumbtack" size={11} />
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {notesQuery.isFetchNextPageError ? (
              <p className="proto-connect-note-sheet__error" role="alert">
                Could not load more notes. Try again.
              </p>
            ) : null}
            {notesQuery.hasNextPage ? (
              <button
                type="button"
                className="proto-shared-thread-action"
                disabled={!canLoadMoreThreadNotes(notesQuery)}
                aria-busy={notesQuery.isFetchingNextPage}
                onClick={() => void loadMore()}
              >
                {notesQuery.isFetchingNextPage ? 'Loading more…' : 'Load more'}
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
    <PrototypeAddNotesSheet
      open={addExistingOpen}
      onOpenChange={setAddExistingOpen}
      spaceId={spaceId}
      spaceKind="shared"
      mode="current-thread"
      currentThreadId={thread.id}
      excludeNoteIds={notes.map((note) => note.id)}
      notesById={candidateNotesById}
      spaceNotes={candidateNotes}
      viewerIsSpaceOwner={isOwner}
      onAdded={() => void notesQuery.refetch()}
    />
    </>
  );
}

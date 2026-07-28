import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import { prototypeNoteRouteTo } from '@/lib/prototype-path';
import { stripHtmlForListPreview } from '@/utils/html-stripper';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import {
  flattenThreadNotePages,
  useThreadNotes,
  type SharedThreadNote,
} from '../../hooks/queries/useThreadNotes';
import type { SpaceGroupStudyThread } from '../../hooks/queries/useSpaceGroupThreads';
import { useSpaceNotes } from '../../hooks/queries/useSpace';
import { useUpdateSharedThread } from '../../hooks/mutations/useUpdateSharedThread';
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
    search: { ...PROTOTYPE_NOTE_LIST_NAV_SEARCH, space: spaceId },
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
  const loadMoreRequestRef = useRef(false);
  const skipTitleBlurSaveRef = useRef(false);
  const headerRef = useRef<HTMLDivElement>(null);
  const menuRootRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const notes = useMemo(
    () => flattenThreadNotePages(notesQuery.data?.pages),
    [notesQuery.data?.pages],
  );
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
  const showOwnerMenu = isOwner && (!thread.isPinned || Boolean(onRequestDelete));
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
      <div className="proto-sidebar-back-row">
        <button
          type="button"
          className="proto-sidebar-back-row__button"
          onClick={onBack}
          aria-label={`Back to ${backLabel}`}
        >
          <Icon name="caret-left" size={13} className="proto-sidebar-back-row__chevron" aria-hidden />
          <span className="proto-sidebar-back-row__label">{backLabel}</span>
        </button>
      </div>

      <div className="proto-shared-thread-drilldown__header" ref={headerRef}>
        <div className="proto-shared-thread-drilldown__identity">
          <ProtoSpaceMenuIcon
            color={thread.color || 'paper'}
            size={30}
            radius={9}
            iconName="arrow-right-arrow-left"
          />
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
              {notes.map((note) => {
                const preview = notePreview(note);
                const date = protoRelativeCaption(note.lastUpdated);
                return (
                  <li key={note.id} className="proto-note-row-item proto-shared-thread-note-row">
                    <button type="button" className="proto-note-row__main" onClick={() => openNote(note.id)}>
                      <div className="proto-note-row__title-line">
                        <span className="pds-list-title proto-note-row__title-text">{noteTitle(note)}</span>
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
                      </div>
                    </button>
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

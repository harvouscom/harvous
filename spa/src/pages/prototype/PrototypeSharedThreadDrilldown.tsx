import { useMemo, useRef, useState } from 'react';
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
import { useProtoShell } from '../../layouts/proto-shell-context';
import { PROTOTYPE_NOTE_LIST_NAV_SEARCH } from '@/utils/prototype-sidebar-highlight-active';
import { noteParamSlug } from './proto-route-slugs';
import { protoRelativeCaption } from './proto-time';
import ProtoSpaceLoading from './ProtoSpaceLoading';
import PrototypeSidebarToolbar from './PrototypeSidebarToolbar';
import PrototypeListEmptyState from './PrototypeListEmptyState';
import SharedSpaceNoteAuthorChip from './SharedSpaceNoteAuthorChip';
import PrototypeAddNotesSheet from './PrototypeAddNotesSheet';
import {
  SHARED_THREAD_DRILLDOWN_ADD_EXISTING_LABEL,
  SHARED_THREAD_DRILLDOWN_COMPOSE_LABEL,
} from './shared-space-dashboard';

export type SharedThreadDrilldownState = 'loading' | 'error' | 'empty' | 'ready';
export type SharedThreadDrillTarget = Pick<SpaceGroupStudyThread, 'id' | 'title' | 'isPinned'>;

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
  onBack,
  onCompose,
  onSetCurrent,
  onRequestDelete,
}: {
  thread: SharedThreadDrillTarget;
  spaceId: string;
  isOwner: boolean;
  /** When false (ministry broadcast channels), hide compose / add-existing. */
  canCompose?: boolean;
  onBack: () => void;
  onCompose: () => void;
  onSetCurrent: (threadId: string) => Promise<unknown>;
  onRequestDelete?: (anchorRect: DOMRect) => void;
}) {
  const navigate = useNavigate();
  const { isMobileSidebar, closeDrawer } = useProtoShell();
  const notesQuery = useThreadNotes(thread.id, spaceId);
  const candidateNotesQuery = useSpaceNotes(spaceId, 100);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinPending, setPinPending] = useState(false);
  const [addExistingOpen, setAddExistingOpen] = useState(false);
  const loadMoreRequestRef = useRef(false);
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

  const openNote = (noteId: string) => {
    if (isMobileSidebar) closeDrawer();
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
        <button type="button" className="proto-sidebar-back-row__button" onClick={onBack}>
          <Icon name="caret-left" size={13} className="proto-sidebar-back-row__chevron" aria-hidden />
          <span className="proto-sidebar-back-row__kind">Thread</span>
          <span className="proto-sidebar-back-row__label">{thread.title}</span>
        </button>
      </div>

      <div className="proto-shared-thread-drilldown__header">
        <div>
          <p className="proto-caption proto-shared-thread-drilldown__eyebrow">
            {thread.isPinned ? 'Current Thread' : 'Thread'}
          </p>
          <h2 className="pds-title proto-shared-thread-drilldown__title">{thread.title}</h2>
        </div>
        <div className="proto-shared-thread-drilldown__actions">
          {isOwner && !thread.isPinned ? (
            <button
              type="button"
              className="proto-shared-thread-action"
              disabled={pinPending}
              onClick={() => void setCurrent()}
            >
              {pinPending ? 'Setting…' : 'Set current'}
            </button>
          ) : null}
          {thread.isPinned && canCompose ? (
            <>
              <button type="button" className="proto-shared-thread-action" onClick={() => setAddExistingOpen(true)}>
                {SHARED_THREAD_DRILLDOWN_ADD_EXISTING_LABEL}
              </button>
              <button type="button" className="proto-shared-thread-action proto-shared-thread-action--primary" onClick={onCompose}>
                {SHARED_THREAD_DRILLDOWN_COMPOSE_LABEL}
              </button>
            </>
          ) : null}
          {isOwner && onRequestDelete ? (
            <button
              type="button"
              className="proto-shared-thread-action"
              onClick={(e) => onRequestDelete(e.currentTarget.getBoundingClientRect())}
            >
              Delete
            </button>
          ) : null}
        </div>
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
      candidateSourceError={candidateNotesQuery.isError}
      onRetryCandidates={() => void candidateNotesQuery.refetch()}
      onAdded={() => void notesQuery.refetch()}
    />
    </>
  );
}

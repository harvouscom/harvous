import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import { prototypeHomeRouteTo } from '@/lib/prototype-path';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import ProtoConfirmDialog from '../ProtoConfirmDialog';
import ProtoRowSelectCheckbox from '../ProtoRowSelectCheckbox';
import ProtoThreadTrailOrb from '../ProtoThreadTrailOrb';
import PrototypeSidebarRowMenuPopover from '../PrototypeSidebarRowMenuPopover';
import SharedSpaceNoteAuthorChip from '../SharedSpaceNoteAuthorChip';
import { PROTO_TOOLBAR_ICON_SIZE } from '../proto-toolbar-tokens';
import { protoRelativeCaptionAbbrev } from '../proto-time';
import { normalizeNoteIdFromParam } from '../proto-route-slugs';
import type { ThreadTrailSortable } from '../ProtoThreadTrailSortable';
import { useProtoShell } from '../../../layouts/proto-shell-context';
import { useDeleteNote } from '../../../hooks/mutations/useDeleteNote';
import { usePinSpaceNote } from '../../../hooks/mutations/usePinSpaceNote';
import { useRemoveNoteFromFolder } from '../../../hooks/mutations/useRemoveNoteFromFolder';
import { useRemoveNoteFromThreadCluster } from '../../../hooks/mutations/useRemoveNoteFromThreadCluster';
import type { SpaceMemberRow, SpaceNoteRow } from '../../../hooks/queries/useSpace';
import { resolveNoteRowCapabilities } from '../../../lib/note-row-capabilities';
import { toastError } from '../../../lib/error-copy';
import { sharedSpaceAuthorChipProps, stripHtmlPreview } from './sidebar-row-helpers';

export type PrototypeSidebarNoteRowProps = {
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
  /** Thread-trail reorder: dim the source step while it is lifted. */
  isDragging?: boolean;
  /**
   * Thread-trail row reorder. Present only in `trailLayout`, and only when the
   * list has something to reorder — supplies dnd-kit's bindings. The row gets
   * the listeners (touch has no hover, so the gesture starts from the row); the
   * grip gets the activator ref and the aria attributes.
   */
  trailSortable?: ThreadTrailSortable | null;
  /** Roster lookup for shared-space author avatars on list rows. */
  sharedSpaceMemberByUserId?: Map<string, SpaceMemberRow>;
  /** Actual shared-space owner, not leader/member moderation role. */
  viewerIsSpaceOwner?: boolean;
  /** Multi-select is on: the row toggles instead of opening, and shows a check orb. */
  selectMode?: boolean;
  /** Shift-click: extend the selection from the last one touched to this row. */
  onSelectRangeTo?: (id: string) => void;
  /** Whether this row may be selected at all — drives the row's checkbox. */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelected?: (noteId: string) => void;
};

export function PrototypeSidebarNoteRow({
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
  trailSortable = null,
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
      /* What the keyboard is standing on — see `focusedListRow`. Focus said which
         button was active but nothing said which note that was. */
      data-select-id={row.id}
      data-select-kind="note"
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
        {/* No "Current" chip on a trail row — the filled check orb in the spine
            already says which note you are on. */}
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

  /*
    The grip is its own control now.
    It used to be the ⋮ menu trigger wearing a second job — `draggable`, an
    aria-label that had to describe both, and a suppressed click so a finished
    drag would not also open the menu. That was a consequence of HTML5 drag
    needing a `draggable` element; dnd-kit does not, so the two separate.
  */
  const canTrailReorder = Boolean(trailSortable);
  const showMenuChrome = !rowHideMenu;

  const dragHandle = !trailSortable ? null : (
    <span
      ref={trailSortable.setActivatorNodeRef}
      className="proto-thread-trail__drag-handle"
      aria-label={`Reorder ${rowTitle}`}
      title="Drag to reorder"
      {...trailSortable.attributes}
    >
      <Icon name="bars" size={12} />
    </span>
  );

  const menuBlock = !showMenuChrome ? null : (
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
          disabled={pinNote.isPending || deleteNote.isPending || containerActionPending}
          /* The row carries the drag listeners; without this a press that
             started on the menu would lift the row instead of opening it. */
          onPointerDown={(e) => {
            if (canTrailReorder) e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
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
    return (
      <li
        ref={(node) => {
          rowRef.current = node;
          trailSortable?.setNodeRef(node);
        }}
        className={`proto-thread-trail__step${active ? ' proto-thread-trail__step--focus' : ''}${
          isDragging ? ' proto-thread-trail__step--dragging' : ''
        }`}
        data-active={active ? 'true' : 'false'}
        role="listitem"
        aria-current={active ? 'true' : undefined}
        style={trailSortable?.style}
        /* On the row, not the grip — see ProtoThreadTrailSortable. */
        {...(trailSortable?.listeners ?? {})}
      >
        <ProtoThreadTrailOrb active={active} />
        {/* No ⋮ here. A trail row's one job is to be moved and opened, and the
            note's own actions are a tap away inside it — the menu was a second
            glyph fighting the grip for the same corner. */}
        <div className="proto-thread-trail__step-body">
          {mainButton}
          {dragHandle}
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
        <ProtoRowSelectCheckbox
          selected={selected}
          label={title}
          onToggle={() => onToggleSelected?.(row.id)}
          onRangeTo={() => onSelectRangeTo?.(row.id)}
        />
      ) : null}
      {mainButton}
      {menuBlock}
      {deleteDialog}
    </li>
  );
}

/**
 * Note toolbar "more" menu — pin, delete, save-a-copy, and leaving a shared space
 * (native MacNoteShareMoreToolbar parity). Note lock/unlock is temporarily disabled.
 *
 * "Share to a space…" used to live here as a submenu with its own Shared-with / Add-to
 * lists. It was a second implementation of a question the note itself now answers: the
 * destination row above the editor (`PrototypeNoteDestinationSheet`) shows every space a
 * note lives in and toggles them directly. Two controls writing the same associations is
 * exactly how they drift — this one had already fallen behind the server on who may post
 * to a ministry channel — so this menu no longer adds notes to spaces.
 *
 * `Remove from this space` stays: it is scoped to the space you are *reading in*, which
 * this menu knows and the row deliberately does not treat as special.
 */
import { useEffect, useMemo, useState, type RefObject } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { prototypeHomeRouteTo, prototypeNoteRouteTo } from '@/lib/prototype-path';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import Icon from '@/components/react/Icon';
import { toast } from '@/utils/toast';
import { APIError } from '../../lib/api';
import { useDeleteNote } from '../../hooks/mutations/useDeleteNote';
import { useHarvousIdentity } from '../../hooks/useHarvousIdentity';
import { deleteGuestNote } from '../../lib/guest-store';
import { usePinSpaceNote } from '../../hooks/mutations/usePinSpaceNote';
import { useSaveNoteCopy } from '../../hooks/mutations/useCopyNotesToSpace';
import { useRemoveNoteFromSpace } from '../../hooks/mutations/useSpaceNoteAssociation';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { usePopoverDismiss } from '../../hooks/usePopoverDismiss';
import { PROTO_TOOLBAR_ICON_SIZE, PROTO_TOOLBAR_ORB_ICON_SIZE } from './proto-toolbar-tokens';
import ProtoConfirmDialog from './ProtoConfirmDialog';
import ProtoPopoverShell from './ProtoPopoverShell';
import { noteParamSlug } from './proto-route-slugs';
import { PROTOTYPE_NOTE_LIST_NAV_SEARCH } from '@/utils/prototype-sidebar-highlight-active';
import { toastError } from '../../lib/error-copy';
import {
  DELETE_NOTE_EVERYWHERE_CONFIRMATION,
  REMOVE_NOTE_FROM_SPACE_CONFIRMATION,
} from './proto-destructive-copy';

interface CachedSpaceNotesPage {
  notes?: { id: string; isPinned?: boolean }[];
}

// Copy lives in proto-destructive-copy.ts; re-exported so existing importers still work.
export const REMOVE_NOTE_FROM_SPACE_MENU_CONFIRMATION = REMOVE_NOTE_FROM_SPACE_CONFIRMATION;
export const DELETE_NOTE_EVERYWHERE_MENU_CONFIRMATION = DELETE_NOTE_EVERYWHERE_CONFIRMATION;

function readNotePinnedFromCache(
  queryClient: ReturnType<typeof useQueryClient>,
  spaceId: string,
  noteId: string,
): boolean {
  const sid = spaceId.startsWith('space_') ? spaceId : `space_${spaceId}`;
  const entries = queryClient.getQueriesData<InfiniteData<CachedSpaceNotesPage>>({
    queryKey: ['space', sid, 'notes'],
  });
  for (const [, data] of entries) {
    for (const page of data?.pages ?? []) {
      const hit = page.notes?.find((n) => n.id === noteId);
      if (hit) return hit.isPinned === true;
    }
  }
  return false;
}

export interface PrototypeNoteMoreMenuProps {
  noteId: string;
  spaceId: string;
  iconSize?: number;
  /** When true, Find and Share live in this menu (compact toolbar). */
  overflowActions?: boolean;
  isPublic?: boolean;
  /** Another member's note in a shared space — limit destructive/edit actions. */
  readOnlyForeign?: boolean;
  homeSpaceId?: string;
  currentSharedSpaceId?: string;
  currentSharedSpaceTitle?: string;
  canRemoveFromCurrentSpace?: boolean;
  canPin?: boolean;
  onFind?: () => void;
  onShare?: () => void;
  menuButtonRef?: RefObject<HTMLButtonElement | null>;
}

export default function PrototypeNoteMoreMenu({
  noteId,
  spaceId,
  iconSize = PROTO_TOOLBAR_ICON_SIZE,
  overflowActions = false,
  isPublic = false,
  readOnlyForeign = false,
  homeSpaceId,
  currentSharedSpaceId,
  currentSharedSpaceTitle,
  canRemoveFromCurrentSpace = false,
  canPin = true,
  onFind,
  onShare,
  menuButtonRef,
}: PrototypeNoteMoreMenuProps) {
  const { isGuest } = useHarvousIdentity();
  const { open, setOpen, rootRef } = usePopoverDismiss<HTMLDivElement>();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteAnchorRect, setDeleteAnchorRect] = useState<DOMRect | null>(null);
  const [pinOverride, setPinOverride] = useState<boolean | null>(null);
  const [removeConfirmRect, setRemoveConfirmRect] = useState<DOMRect | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { closeDrawer, isMobileSidebar } = useProtoShell();
  const pinNote = usePinSpaceNote();
  const deleteNote = useDeleteNote();
  const removeFromSpace = useRemoveNoteFromSpace();
  const saveCopy = useSaveNoteCopy();

  const pinnedFromCache = useMemo(
    () => readNotePinnedFromCache(queryClient, spaceId, noteId),
    [queryClient, spaceId, noteId, pinNote.isPending, deleteNote.isPending],
  );
  const pinned = pinOverride ?? pinnedFromCache;

  useEffect(() => {
    setPinOverride(null);
  }, [noteId]);

  /**
   * The ⋯ trigger's wrapper, which `.proto-menu__popover--right` positions against.
   * Confirms opened from the menu anchor here so they take over the menu's slot rather
   * than stacking below whichever item was clicked.
   */
  const menuSlotRect = () => rootRef.current?.getBoundingClientRect() ?? null;

  const onRemoveFromCurrentSpace = () => {
    if (!currentSharedSpaceId) return;
    setOpen(false);
    removeFromSpace.mutate(
      { spaceId: currentSharedSpaceId, noteId },
      {
        onSuccess: () => {
          setRemoveConfirmRect(null);
          toast.success(
            currentSharedSpaceTitle
              ? `Removed from ${currentSharedSpaceTitle}`
              : 'Removed from this space',
          );
          if (!readOnlyForeign) {
            navigate({
              to: prototypeNoteRouteTo(),
              params: { noteId: noteParamSlug(noteId) },
              search: PROTOTYPE_NOTE_LIST_NAV_SEARCH,
              replace: true,
            });
          } else {
            navigate({ to: prototypeHomeRouteTo(), replace: true });
          }
        },
        onError: (err) => {
          setRemoveConfirmRect(null);
          toastError(err, 'Could not remove note from space');
        },
      },
    );
  };

  const onSaveCopy = () => {
    if (!homeSpaceId) return;
    setOpen(false);
    saveCopy.mutate(
      { homeSpaceId, sourceNoteId: noteId },
      {
        onSuccess: ({ newNoteId }) => {
          toast.success('Saved a copy to My Home');
          navigate({
            to: prototypeNoteRouteTo(),
            params: { noteId: noteParamSlug(newNoteId) },
            search: PROTOTYPE_NOTE_LIST_NAV_SEARCH,
          });
        },
        onError: (err) =>
          toastError(err, 'Could not save a copy'),
      },
    );
  };

  const onPin = () => {
    setOpen(false);
    const nextPinned = !pinned;
    pinNote.mutate(
      {
        spaceId,
        noteId,
        isPinned: nextPinned,
        // NativeToolbar resolves this spaceId as `currentSharedSpaceId ?? homeSpaceId`,
        // so anything that isn't the active shared space is the personal My Home space.
        spaceKind: currentSharedSpaceId && spaceId === currentSharedSpaceId ? 'shared' : 'personal',
      },
      {
        onSuccess: () => setPinOverride(nextPinned),
        onError: (err) => {
          toastError(err, 'Could not update pin');
        },
      },
    );
  };

  const onDeleteConfirm = () => {
    /*
     * A guest's note lives in this browser, and the server has never seen it — the DELETE
     * came back 401 and the menu said "Could not delete note" about a note sitting right
     * there. `deleteGuestNote` was written for this and had no caller.
     */
    if (isGuest) {
      deleteGuestNote(noteId);
      /* The row is gone from the device; the cached detail is the only copy left, and
         going back to this address must not resurrect it. Guest Home re-renders off the
         store's own subscription, so it needs no telling. */
      queryClient.removeQueries({ queryKey: ['note', noteId] });
      setDeleteConfirmOpen(false);
      navigate({ to: prototypeHomeRouteTo(), replace: true });
      if (isMobileSidebar) closeDrawer({ preserveHistory: true });
      return;
    }
    deleteNote.mutate(
      { noteId, spaceId },
      {
        onSuccess: () => {
          setDeleteConfirmOpen(false);
          navigate({ to: prototypeHomeRouteTo(), replace: true });
          if (isMobileSidebar) closeDrawer({ preserveHistory: true });
        },
        onError: (err) => {
          toastError(err, 'Could not delete note');
        },
      },
    );
  };

  return (
    <>
      <div className="proto-menu" ref={rootRef}>
        <button
          ref={menuButtonRef}
          type="button"
          className="proto-toolbar-icon-btn"
          aria-expanded={open}
          aria-haspopup="menu"
          title="More options"
          aria-label="More options"
          disabled={
            pinNote.isPending ||
            deleteNote.isPending ||
            removeFromSpace.isPending ||
            saveCopy.isPending
          }
          onClick={() => setOpen((x) => !x)}
        >
          <Icon name="ellipsis-vertical" size={PROTO_TOOLBAR_ORB_ICON_SIZE} />
          {overflowActions && isPublic ? (
            <span className="proto-toolbar-icon-btn__share-dot" aria-hidden />
          ) : null}
        </button>

        {open ? (
          <ProtoPopoverShell
            className="proto-menu__popover proto-menu__popover--right proto-menu__popover--list-view"
            role="menu"
            aria-label="Note actions"
          >
            <div className="proto-menu-section" role="group">
              {overflowActions && onFind ? (
                <button
                  type="button"
                  role="menuitem"
                  className="proto-menu-item"
                  onClick={() => {
                    setOpen(false);
                    onFind();
                  }}
                >
                  <span className="proto-menu-item__icon" aria-hidden>
                    <Icon name="magnifying-glass" size={iconSize} />
                  </span>
                  <span className="proto-menu-item__label">Find in note</span>
                </button>
              ) : null}
              {overflowActions && onShare ? (
                <button
                  type="button"
                  role="menuitem"
                  className="proto-menu-item"
                  onClick={() => {
                    setOpen(false);
                    onShare();
                  }}
                >
                  <span className="proto-menu-item__icon" aria-hidden>
                    <Icon name="share" size={iconSize} />
                  </span>
                  <span className="proto-menu-item__label">{isPublic ? 'Manage share' : 'Share'}</span>
                </button>
              ) : null}
              {overflowActions && (onFind || onShare) ? <div className="proto-menu-sep" role="separator" /> : null}
              {/*
                * "Add to Review" is withheld, not deleted — same call as Challenges, and for a
                * related reason: adding a note by hand sits oddly beside a queue that fills
                * itself. Review's whole claim is that it notices what you have been studying
                * and brings it back without being asked; a menu item that says "put this one
                * in" invites a mental model of a list you curate, which is the thing it is
                * not. Whether there should be a way to say "this one matters, ask me about
                * it" is a real question and worth answering deliberately rather than by
                * leaving the row up.
                *
                * `PrototypeAddToReviewItem` still compiles and still holds the rules it
                * learned — not on a foreign read-only note, nothing shown without the key —
                * so restoring this is uncommenting one line. See
                * docs/future/CHALLENGES_AS_SUGGESTIONS.md, which is the same shape of
                * question about the same feature.
                */}
              {readOnlyForeign ? (
                <>
                  {canPin ? (
                    <button type="button" role="menuitem" className="proto-menu-item" disabled={pinNote.isPending} onClick={onPin}>
                      <span className="proto-menu-item__icon" aria-hidden>
                        <Icon name="thumbtack" size={iconSize} />
                      </span>
                      <span className="proto-menu-item__label">{pinned ? 'Unpin note' : 'Pin note'}</span>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    className="proto-menu-item"
                    disabled={!homeSpaceId || saveCopy.isPending}
                    onClick={onSaveCopy}
                  >
                    <span className="proto-menu-item__icon" aria-hidden>
                      <Icon name="copy" size={iconSize} />
                    </span>
                    <span className="proto-menu-item__label">
                      {saveCopy.isPending ? 'Saving a copy…' : 'Save a copy'}
                    </span>
                  </button>
                  {currentSharedSpaceId && canRemoveFromCurrentSpace ? (
                    <button
                      type="button"
                      role="menuitem"
                      className="proto-menu-item"
                      disabled={removeFromSpace.isPending}
                      onClick={() => {
                        const anchorRect = menuSlotRect();
                        setOpen(false);
                        setRemoveConfirmRect(anchorRect);
                      }}
                    >
                      <span className="proto-menu-item__icon" aria-hidden>
                        <Icon name="minus" size={iconSize} />
                      </span>
                      <span className="proto-menu-item__label">{currentSharedSpaceTitle ? `Remove from ${currentSharedSpaceTitle}` : "Remove from this space"}</span>
                    </button>
                  ) : null}
                </>
              ) : (
                <>
              {canPin ? <button type="button" role="menuitem" className="proto-menu-item" disabled={pinNote.isPending} onClick={onPin}>
                <span className="proto-menu-item__icon" aria-hidden>
                  <Icon name="thumbtack" size={iconSize} />
                </span>
                <span className="proto-menu-item__label">{pinned ? 'Unpin note' : 'Pin note'}</span>
              </button> : null}
              {currentSharedSpaceId && canRemoveFromCurrentSpace ? (
                <button
                  type="button"
                  role="menuitem"
                  className="proto-menu-item"
                  disabled={removeFromSpace.isPending}
                  onClick={() => {
                    const anchorRect = menuSlotRect();
                    setOpen(false);
                    setRemoveConfirmRect(anchorRect);
                  }}
                >
                  <span className="proto-menu-item__icon" aria-hidden>
                    <Icon name="minus" size={iconSize} />
                  </span>
                  <span className="proto-menu-item__label">{currentSharedSpaceTitle ? `Remove from ${currentSharedSpaceTitle}` : "Remove from this space"}</span>
                </button>
              ) : null}
              {!currentSharedSpaceId ? (
              <button
                type="button"
                role="menuitem"
                className="proto-menu-item proto-menu-item--destructive"
                disabled={deleteNote.isPending}
                onClick={() => {
                  const anchorRect = menuSlotRect();
                  setOpen(false);
                  if (!anchorRect) return;
                  setDeleteAnchorRect(anchorRect);
                  setDeleteConfirmOpen(true);
                }}
              >
                <span className="proto-menu-item__icon" aria-hidden>
                  <Icon name="trash-can" size={iconSize} />
                </span>
                <span className="proto-menu-item__label">Delete note</span>
              </button>
              ) : null}
                </>
              )}
            </div>
          </ProtoPopoverShell>
        ) : null}
      </div>

      {deleteConfirmOpen && deleteAnchorRect ? (
        <ProtoConfirmDialog
          anchorRect={deleteAnchorRect}
          alignRight
          title={DELETE_NOTE_EVERYWHERE_MENU_CONFIRMATION.title}
          description={DELETE_NOTE_EVERYWHERE_MENU_CONFIRMATION.description}
          confirmLabel="Delete everywhere"
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
      {removeConfirmRect ? (
        <ProtoConfirmDialog
          anchorRect={removeConfirmRect}
          alignRight
          title={REMOVE_NOTE_FROM_SPACE_MENU_CONFIRMATION.title}
          description={REMOVE_NOTE_FROM_SPACE_MENU_CONFIRMATION.description}
          confirmLabel="Remove"
          cancelLabel="Keep"
          busy={removeFromSpace.isPending}
          onConfirm={onRemoveFromCurrentSpace}
          onCancel={() => {
            if (!removeFromSpace.isPending) setRemoveConfirmRect(null);
          }}
        />
      ) : null}
    </>
  );
}

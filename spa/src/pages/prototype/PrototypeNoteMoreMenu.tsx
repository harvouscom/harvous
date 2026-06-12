/**
 * Note toolbar "more" menu — pin and delete (native MacNoteShareMoreToolbar parity).
 * Note lock/unlock is temporarily disabled.
 */
import { useEffect, useMemo, useState, type RefObject } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { prototypeHomeRouteTo } from '@/lib/prototype-path';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import Icon from '@/components/react/Icon';
import { toast } from '@/utils/toast';
import { APIError } from '../../lib/api';
import { useDeleteNote } from '../../hooks/mutations/useDeleteNote';
import { usePinSpaceNote } from '../../hooks/mutations/usePinSpaceNote';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { usePopoverDismiss } from '../../hooks/usePopoverDismiss';
import { PROTO_TOOLBAR_ICON_SIZE, PROTO_TOOLBAR_ORB_ICON_SIZE } from './proto-toolbar-tokens';
import ProtoConfirmDialog from './ProtoConfirmDialog';
import ProtoPopoverShell from './ProtoPopoverShell';

interface CachedSpaceNotesPage {
  notes?: { id: string; isPinned?: boolean }[];
}

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
  onFind,
  onShare,
  menuButtonRef,
}: PrototypeNoteMoreMenuProps) {
  const { open, setOpen, rootRef } = usePopoverDismiss<HTMLDivElement>();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteAnchorRect, setDeleteAnchorRect] = useState<DOMRect | null>(null);
  const [pinOverride, setPinOverride] = useState<boolean | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { closeDrawer, isMobileSidebar } = useProtoShell();
  const pinNote = usePinSpaceNote();
  const deleteNote = useDeleteNote();

  const pinnedFromCache = useMemo(
    () => readNotePinnedFromCache(queryClient, spaceId, noteId),
    [queryClient, spaceId, noteId, pinNote.isPending, deleteNote.isPending],
  );
  const pinned = pinOverride ?? pinnedFromCache;

  useEffect(() => {
    setPinOverride(null);
  }, [noteId]);

  const onPin = () => {
    setOpen(false);
    const nextPinned = !pinned;
    pinNote.mutate(
      { spaceId, noteId, isPinned: nextPinned },
      {
        onSuccess: () => setPinOverride(nextPinned),
        onError: (err) => {
          const msg =
            err instanceof APIError ? err.message : err instanceof Error ? err.message : 'Could not update pin';
          toast.error(msg);
        },
      },
    );
  };

  const onDeleteConfirm = () => {
    deleteNote.mutate(
      { noteId, spaceId },
      {
        onSuccess: () => {
          setDeleteConfirmOpen(false);
          navigate({ to: prototypeHomeRouteTo(), replace: true });
          if (isMobileSidebar) closeDrawer();
        },
        onError: (err) => {
          const msg =
            err instanceof APIError ? err.message : err instanceof Error ? err.message : 'Could not delete note';
          toast.error(msg);
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
          disabled={pinNote.isPending || deleteNote.isPending}
          onClick={() => setOpen((x) => !x)}
        >
          <Icon name="ellipsis" size={PROTO_TOOLBAR_ORB_ICON_SIZE} />
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
              <button type="button" role="menuitem" className="proto-menu-item" disabled={pinNote.isPending} onClick={onPin}>
                <span className="proto-menu-item__icon" aria-hidden>
                  <Icon name="thumbtack" size={iconSize} />
                </span>
                <span className="proto-menu-item__label">{pinned ? 'Unpin note' : 'Pin note'}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="proto-menu-item proto-menu-item--destructive"
                disabled={deleteNote.isPending}
                onClick={(e) => {
                  setDeleteAnchorRect(e.currentTarget.getBoundingClientRect());
                  setOpen(false);
                  setDeleteConfirmOpen(true);
                }}
              >
                <span className="proto-menu-item__icon" aria-hidden>
                  <Icon name="trash-can" size={iconSize} />
                </span>
                <span className="proto-menu-item__label">Delete note</span>
              </button>
            </div>
          </ProtoPopoverShell>
        ) : null}
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
    </>
  );
}

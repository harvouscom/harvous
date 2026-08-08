/**
 * Note toolbar "more" menu — pin and delete (native MacNoteShareMoreToolbar parity).
 * Note lock/unlock is temporarily disabled.
 */
import { useEffect, useMemo, useState, type RefObject } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { prototypeHomeRouteTo, prototypeNoteRouteTo } from '@/lib/prototype-path';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import Icon from '@/components/react/Icon';
import { toast } from '@/utils/toast';
import { APIError } from '../../lib/api';
import { useDeleteNote } from '../../hooks/mutations/useDeleteNote';
import { usePinSpaceNote } from '../../hooks/mutations/usePinSpaceNote';
import { useSaveNoteCopy } from '../../hooks/mutations/useCopyNotesToSpace';
import {
  useAssociateNoteWithSpace,
  useRemoveNoteFromSpace,
} from '../../hooks/mutations/useSpaceNoteAssociation';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { usePopoverDismiss } from '../../hooks/usePopoverDismiss';
import { useNavigation, type NavSpace } from '../../hooks/queries/useNavigation';
import { useProfile } from '../../hooks/queries/useProfile';
import { isPersonalSharedSpace } from '../../lib/church-settings';
import {
  noteSpaceBlockedReasonLabel,
  resolveNoteSpaceMembershipRows,
} from '../../lib/shared-note-membership';
import {
  normalizeSharedSpaceSwitcherId,
  orderSwitcherSpaces,
} from '../../lib/shared-space-switcher-order';
import { PROTO_TOOLBAR_ICON_SIZE, PROTO_TOOLBAR_ORB_ICON_SIZE } from './proto-toolbar-tokens';
import ProtoConfirmDialog from './ProtoConfirmDialog';
import ProtoPopoverShell from './ProtoPopoverShell';
import ProtoSpaceMenuIcon from './ProtoSpaceMenuIcon';
import { noteParamSlug } from './proto-route-slugs';
import { PROTOTYPE_NOTE_LIST_NAV_SEARCH } from '@/utils/prototype-sidebar-highlight-active';
import { toastError } from '../../lib/error-copy';
import {
  DELETE_NOTE_EVERYWHERE_CONFIRMATION,
  REMOVE_NOTE_FROM_SPACE_CONFIRMATION,
  RESHARE_NOTE_CONFIRMATION_COPY,
} from './proto-destructive-copy';

interface CachedSpaceNotesPage {
  notes?: { id: string; isPinned?: boolean }[];
}

// Copy lives in proto-destructive-copy.ts; re-exported so existing importers still work.
export const RESHARE_NOTE_CONFIRMATION = RESHARE_NOTE_CONFIRMATION_COPY;
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
  /** The note's live associations (`note.spaces`) — decides added vs addable. */
  noteSpaces?: { id: string; title: string }[];
  /** Non-authors must save an attributed copy instead of sharing onward. */
  isOwnNote?: boolean;
  /** Locked notes are refused by the server; don't offer them as addable. */
  contentEncrypted?: boolean;
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
  noteSpaces,
  isOwnNote = true,
  contentEncrypted = false,
  onFind,
  onShare,
  menuButtonRef,
}: PrototypeNoteMoreMenuProps) {
  const { open, setOpen, rootRef } = usePopoverDismiss<HTMLDivElement>();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteAnchorRect, setDeleteAnchorRect] = useState<DOMRect | null>(null);
  const [pinOverride, setPinOverride] = useState<boolean | null>(null);
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const [pendingAddTarget, setPendingAddTarget] = useState<{
    spaceId: string;
    title?: string;
    anchorRect: DOMRect;
  } | null>(null);
  const [removeConfirmRect, setRemoveConfirmRect] = useState<DOMRect | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { closeDrawer, isMobileSidebar } = useProtoShell();
  const pinNote = usePinSpaceNote();
  const deleteNote = useDeleteNote();
  const associateWithSpace = useAssociateNoteWithSpace();
  const removeFromSpace = useRemoveNoteFromSpace();
  const saveCopy = useSaveNoteCopy();
  const { data: nav } = useNavigation();
  const { data: profile } = useProfile();

  /** Same personal Shared Spaces list + preference order as the space switcher. */
  const personalSharedTargets = useMemo(() => {
    const byId = new Map<string, NavSpace>();
    for (const s of nav?.spaces ?? []) {
      if (isPersonalSharedSpace(s)) byId.set(normalizeSharedSpaceSwitcherId(s.id), s);
    }
    for (const s of nav?.memberOfSpaces ?? []) {
      if (isPersonalSharedSpace(s)) byId.set(normalizeSharedSpaceSwitcherId(s.id), s);
    }
    return orderSwitcherSpaces([...byId.values()], profile?.sharedSpaceSwitcherOrder);
  }, [nav?.spaces, nav?.memberOfSpaces, profile?.sharedSpaceSwitcherOrder]);

  /**
   * Split candidates by real membership. Previously every personal shared space
   * was offered as a target regardless of whether the note was already in it, so
   * picking one hit a server no-op and still toasted "Added to …".
   */
  const membershipRows = useMemo(
    () =>
      resolveNoteSpaceMembershipRows({
        candidateSpaces: personalSharedTargets,
        associatedSpaceIds: (noteSpaces ?? []).map((s) => s.id),
        currentSharedSpaceId,
        isOwnNote,
        contentEncrypted,
      }),
    [personalSharedTargets, noteSpaces, currentSharedSpaceId, isOwnNote, contentEncrypted],
  );

  const sharedSpaceTargets = membershipRows;
  const showCopySpaceSearch = membershipRows.length > 5;
  const [copySpaceFilter, setCopySpaceFilter] = useState('');

  const filteredSharedTargets = useMemo(() => {
    const q = copySpaceFilter.trim().toLowerCase();
    if (!q) return membershipRows;
    return membershipRows.filter((row) => row.space.title.toLowerCase().includes(q));
  }, [copySpaceFilter, membershipRows]);

  const addedRows = useMemo(
    () => filteredSharedTargets.filter((row) => row.state === 'added'),
    [filteredSharedTargets],
  );
  const addableRows = useMemo(
    () => filteredSharedTargets.filter((row) => row.state !== 'added'),
    [filteredSharedTargets],
  );

  const pinnedFromCache = useMemo(
    () => readNotePinnedFromCache(queryClient, spaceId, noteId),
    [queryClient, spaceId, noteId, pinNote.isPending, deleteNote.isPending],
  );
  const pinned = pinOverride ?? pinnedFromCache;

  useEffect(() => {
    setPinOverride(null);
  }, [noteId]);

  useEffect(() => {
    if (!open) {
      setCopyMenuOpen(false);
      if (!pendingAddTarget) setCopySpaceFilter('');
    }
  }, [open, pendingAddTarget]);

  /**
   * The ⋯ trigger's wrapper, which `.proto-menu__popover--right` positions against.
   * Confirms opened from the menu anchor here so they take over the menu's slot rather
   * than stacking below whichever item was clicked.
   */
  const menuSlotRect = () => rootRef.current?.getBoundingClientRect() ?? null;

  const requestAddToSpace = (targetSpaceId: string, targetTitle?: string) => {
    const anchorRect = menuSlotRect();
    setOpen(false);
    setCopyMenuOpen(false);
    if (!anchorRect) return;
    setPendingAddTarget({ anchorRect, spaceId: targetSpaceId, title: targetTitle });
  };

  const onAddToSpaceConfirm = () => {
    if (!pendingAddTarget) return;
    const { spaceId: targetSpaceId, title: targetTitle } = pendingAddTarget;
    associateWithSpace.mutate(
      { spaceId: targetSpaceId, noteId },
      {
        onSuccess: (response) => {
          setPendingAddTarget(null);
          setCopySpaceFilter('');
          const where = targetTitle ?? 'space';
          // Report what actually happened. The endpoint is idempotent, so a repeat
          // pick used to claim success for work the server skipped.
          if (response?.alreadyAssociated) {
            toast.success(`Already shared with ${where}`);
          } else if (response?.reactivated) {
            toast.success(`Added back to ${where} — earlier responses are back`);
          } else {
            toast.success(targetTitle ? `Added to ${targetTitle}` : 'Added to space');
          }
        },
        onError: (err) => {
          setPendingAddTarget(null);
          toastError(err, 'Could not add note');
        },
      },
    );
  };

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
            associateWithSpace.isPending ||
            removeFromSpace.isPending ||
            saveCopy.isPending
          }
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
              {sharedSpaceTargets.length > 0 ? (
                copyMenuOpen ? (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      className="proto-menu-item"
                      onClick={() => {
                        setCopyMenuOpen(false);
                        setCopySpaceFilter('');
                      }}
                    >
                      <span className="proto-menu-item__icon" aria-hidden>
                        <Icon name="caret-left" size={iconSize} />
                      </span>
                      <span className="proto-menu-item__label">Share to a space…</span>
                    </button>
                    {showCopySpaceSearch ? (
                      <div style={{ padding: '4px 10px 6px' }}>
                        <input
                          type="search"
                          value={copySpaceFilter}
                          onChange={(e) => setCopySpaceFilter(e.target.value)}
                          placeholder="Filter spaces…"
                          aria-label="Filter spaces"
                          style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            padding: '6px 8px',
                            borderRadius: 8,
                            border: '1px solid var(--pds-border)',
                            font: 'inherit',
                            fontSize: 13,
                          }}
                        />
                      </div>
                    ) : null}
                    {addedRows.length > 0 ? (
                      <p className="proto-menu-section-label">Shared with</p>
                    ) : null}
                    {addedRows.map(({ space }) => (
                      <button
                        key={space.id}
                        type="button"
                        role="menuitem"
                        className="proto-menu-item"
                        title={`${space.title} — already shared here`}
                        disabled
                      >
                        <span className="proto-menu-item__icon proto-menu-item__icon--space" aria-hidden>
                          <ProtoSpaceMenuIcon color={space.color || 'paper'} />
                        </span>
                        <span className="proto-menu-item__label">{space.title}</span>
                        <span className="proto-menu-item__trail" aria-hidden>
                          <Icon name="check" size={iconSize} />
                        </span>
                      </button>
                    ))}
                    {addedRows.length > 0 && addableRows.length > 0 ? (
                      <p className="proto-menu-section-label">Add to</p>
                    ) : null}
                    {addableRows.map(({ space, state, reason }) => {
                      const blocked = state === 'blocked';
                      return (
                        <button
                          key={space.id}
                          type="button"
                          role="menuitem"
                          className="proto-menu-item"
                          title={
                            blocked && reason ? noteSpaceBlockedReasonLabel(reason) : space.title
                          }
                          disabled={blocked || associateWithSpace.isPending}
                          onClick={() => requestAddToSpace(space.id, space.title)}
                        >
                          <span className="proto-menu-item__icon proto-menu-item__icon--space" aria-hidden>
                            <ProtoSpaceMenuIcon color={space.color || 'paper'} />
                          </span>
                          <span className="proto-menu-item__label">{space.title}</span>
                        </button>
                      );
                    })}
                    {showCopySpaceSearch && copySpaceFilter.trim() && filteredSharedTargets.length === 0 ? (
                      <p className="proto-space-switcher__empty-hint">No spaces match your search.</p>
                    ) : null}
                  </>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    className="proto-menu-item"
                    onClick={() => setCopyMenuOpen(true)}
                  >
                    <span className="proto-menu-item__icon" aria-hidden>
                      <Icon name="copy" size={iconSize} />
                    </span>
                    <span className="proto-menu-item__label">Share to a space…</span>
                  </button>
                )
              ) : (
                <button type="button" role="menuitem" className="proto-menu-item" disabled title="Create or join a shared space first">
                  <span className="proto-menu-item__icon" aria-hidden>
                    <Icon name="copy" size={iconSize} />
                  </span>
                  <span className="proto-menu-item__label">Share to a space…</span>
                </button>
              )}
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
      {pendingAddTarget ? (
        <ProtoConfirmDialog
          anchorRect={pendingAddTarget.anchorRect}
          alignRight
          title={RESHARE_NOTE_CONFIRMATION.title}
          description={RESHARE_NOTE_CONFIRMATION.description}
          confirmLabel="Add to space"
          cancelLabel="Cancel"
          busy={associateWithSpace.isPending}
          onConfirm={onAddToSpaceConfirm}
          onCancel={() => {
            if (!associateWithSpace.isPending) setPendingAddTarget(null);
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

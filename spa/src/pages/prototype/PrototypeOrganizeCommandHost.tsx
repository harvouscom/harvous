/**
 * Where an organize verb is actually carried out.
 *
 * Folder, Thread, pin, share, remove-from-space and delete all end in a sheet or a confirm,
 * and all six of those lived inside `PrototypeSidebar`. That was survivable while the sidebar
 * was always mounted. It is not now: the sidebar boots collapsed, collapsed means unmounted,
 * and the search panel that replaced it needs the same six verbs on its own rows. A verb
 * invoked from anywhere but the sidebar had nowhere to open.
 *
 * So the sheets move here, mounted once by the shell, and the surfaces keep only the part
 * that is theirs — which rows are selected and what the bar looks like. The host publishes a
 * runner (`prototype-organize-runner-store`) rather than taking children, because the callers
 * are scattered across the toolbar, the sidebar and the panel and threading a provider
 * through all three would put a context boundary above half the app for one function.
 *
 * **The host never decides *what* to act on.** Every verb arrives with a `CommandContext`
 * naming its ids, and the host re-checks enablement rather than trusting it: the panel
 * filters its rows by `availablePrototypeCommands`, but a keyboard chord arrives unfiltered,
 * and both have to meet the same gate.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/utils/toast';
import { api } from '../../lib/api';
import { toastError } from '../../lib/error-copy';
import { isPersonalSharedSpace } from '../../lib/church-settings';
import {
  DELETE_NOTE_EVERYWHERE_CONFIRMATION,
  REMOVE_NOTE_FROM_SPACE_CONFIRMATION,
} from './proto-destructive-copy';
import { threadClusterDrillSlug } from '@/utils/thread-cluster-bulk-actions';
import {
  availablePrototypeCommands,
  type CommandContext,
  type PrototypeCommandId,
} from '../../lib/prototype-commands';
import {
  publishOrganizeApi,
  type CreateThreadPrefill,
  type OrganizeRunOptions,
} from '../../lib/prototype-organize-runner-store';
import { useDeleteNotesBatch } from '../../hooks/mutations/useDeleteNotesBatch';
import { useRemoveNotesFromSpaceBatch } from '../../hooks/mutations/useSpaceNoteAssociation';
import { usePinSpaceNote } from '../../hooks/mutations/usePinSpaceNote';
import { useNavigation } from '../../hooks/queries/useNavigation';
import { useActiveSpace } from '../../hooks/useActiveSpace';
import { canCreateSidebarCollections } from '../../lib/shared-space-capabilities';
import { usePrototypeHomeSpaceId } from '../../hooks/usePrototypeHomeSpaceId';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { useHomeNotes } from './useHomeNotes';
import { useLibraryPanelNav } from './library-panel/use-library-panel-nav';
import ProtoConfirmDialog from './ProtoConfirmDialog';
import ProtoSpaceMenuIcon from './ProtoSpaceMenuIcon';
import PrototypeCreateFolderSheet from './PrototypeCreateFolderSheet';
import PrototypeCreateThreadSheet from './PrototypeCreateThreadSheet';
import PrototypeCreateSharedThreadSheet from './PrototypeCreateSharedThreadSheet';

function normalizeForCompare(id: string | null | undefined): string {
  if (!id) return '';
  return id.startsWith('space_') ? id : `space_${id}`;
}

export default function PrototypeOrganizeCommandHost({
  scopedSpaceId = null,
  shellIsSharedSpace = false,
}: {
  /** A shared space in scope, when the shell is showing one. */
  scopedSpaceId?: string | null;
  /** Whether the shell itself is a shared space — the one fact not in shell state. */
  shellIsSharedSpace?: boolean;
}) {
  const { homeSpaceId: personalHomeSpaceId } = usePrototypeHomeSpaceId();
  const homeSpaceId = scopedSpaceId ?? personalHomeSpaceId;
  const isScopedSharedSpace = Boolean(
    scopedSpaceId &&
      personalHomeSpaceId &&
      normalizeForCompare(scopedSpaceId) !== normalizeForCompare(personalHomeSpaceId),
  );
  const { isOwner: viewerIsSpaceOwner, space: activeSharedSpace } = useActiveSpace();
  const {
    sidebarSelectedIds,
    setSidebarSelectMode,
    setSidebarSelection,
    sidebarListSpaceScope,
  } = useProtoShell();

  /* The same gate the sidebar applies, from the same inputs — every one of them is shell
     state or the active space, so the host can ask rather than be told. */
  const canCreateCollections = canCreateSidebarCollections({
    inSharedSpaceShell: shellIsSharedSpace,
    listScope: sidebarListSpaceScope,
    isScopedSharedSpaceList: isScopedSharedSpace,
    isOwner: viewerIsSpaceOwner,
    membershipRole: activeSharedSpace?.role,
    type: activeSharedSpace?.type,
    orgId: activeSharedSpace?.orgId,
  });
  const { notes, notesById } = useHomeNotes(homeSpaceId);
  const queryClient = useQueryClient();
  const libraryNav = useLibraryPanelNav();

  const deleteNotesBatch = useDeleteNotesBatch();
  const removeNotesFromSpace = useRemoveNotesFromSpaceBatch();
  const pinNote = usePinSpaceNote();

  const [folderSheetOpen, setFolderSheetOpen] = useState(false);
  const [threadSheetOpen, setThreadSheetOpen] = useState(false);
  const [threadPrefill, setThreadPrefill] = useState<CreateThreadPrefill | null>(null);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [sharePending, setSharePending] = useState(false);
  const [deleteConfirmAt, setDeleteConfirmAt] = useState<DOMRect | null>(null);
  const [removeConfirmAt, setRemoveConfirmAt] = useState<DOMRect | null>(null);

  const { data: nav } = useNavigation();
  /**
   * Where a selection can be shared. Own spaces only — associating into a space you merely
   * belong to is a different act (and `add-items` checks membership anyway), and ministry
   * channels are read-only targets.
   */
  const shareTargets = useMemo(
    () =>
      (nav?.spaces ?? []).filter(
        (sp) =>
          isPersonalSharedSpace(sp) &&
          normalizeForCompare(sp.id) !== normalizeForCompare(homeSpaceId),
      ),
    [nav?.spaces, homeSpaceId],
  );

  const openCreateThreadSheet = useCallback((prefill?: CreateThreadPrefill) => {
    setThreadPrefill(prefill ?? null);
    setThreadSheetOpen(true);
  }, []);

  /**
   * `add-items` is the batch twin of `add-note` — it takes the whole id list, carries no
   * write rate limit, and reports per-item problems in `errors` rather than failing.
   */
  const shareToSpace = useCallback(
    async (targetSpaceId: string) => {
      const ids = [...sidebarSelectedIds];
      setSharePending(true);
      try {
        const res = await api.post<{ updatedNotes?: number; errors?: string[] }>(
          `/api/spaces/${encodeURIComponent(targetSpaceId)}/add-items`,
          { noteIds: ids, threadIds: [] },
        );
        const went = res.updatedNotes ?? 0;
        toast.success(
          went === ids.length
            ? `Shared ${went} note${went === 1 ? '' : 's'}`
            : `Shared ${went} of ${ids.length} notes`,
        );
        setShareSheetOpen(false);
        setSidebarSelectMode(false);
        /* `['space', id, 'notes', …]` is the list's key (useSpace.ts). */
        void queryClient.invalidateQueries({ queryKey: ['space'] });
        void queryClient.invalidateQueries({ queryKey: ['navigation'] });
      } catch (err) {
        toastError(err, 'Could not share these notes');
      } finally {
        setSharePending(false);
      }
    },
    [sidebarSelectedIds, queryClient, setSidebarSelectMode],
  );

  /**
   * Both destructives report what actually went, not what was asked for. A batch can
   * partially succeed — a note someone else already moved, a stale id — and one flat
   * "Deleted" would be a lie.
   */
  const confirmDelete = useCallback(() => {
    const ids = [...sidebarSelectedIds];
    deleteNotesBatch.mutate(ids, {
      onSuccess: (res) => {
        setDeleteConfirmAt(null);
        setSidebarSelectMode(false);
        const went = res.deletedNoteIds?.length ?? 0;
        toast.success(
          went === ids.length
            ? `Deleted ${went} note${went === 1 ? '' : 's'}`
            : `Deleted ${went} of ${ids.length} notes`,
        );
      },
      onError: (err) => {
        setDeleteConfirmAt(null);
        toastError(err, 'Could not delete these notes');
      },
    });
  }, [sidebarSelectedIds, deleteNotesBatch, setSidebarSelectMode]);

  const confirmRemoveFromSpace = useCallback(() => {
    const ids = [...sidebarSelectedIds];
    if (!isScopedSharedSpace || !homeSpaceId) return;
    removeNotesFromSpace.mutate(
      { spaceId: homeSpaceId, noteIds: ids },
      {
        onSuccess: (res) => {
          setRemoveConfirmAt(null);
          setSidebarSelectMode(false);
          const went = res.removedNotes ?? 0;
          toast.success(
            went === ids.length
              ? `Removed ${went} note${went === 1 ? '' : 's'}`
              : `Removed ${went} of ${ids.length} notes`,
          );
        },
        onError: (err) => {
          setRemoveConfirmAt(null);
          toastError(err, 'Could not remove these notes');
        },
      },
    );
  }, [
    sidebarSelectedIds,
    isScopedSharedSpace,
    homeSpaceId,
    removeNotesFromSpace,
    setSidebarSelectMode,
  ]);

  const run = useCallback(
    (commandId: PrototypeCommandId, ctx: CommandContext, options?: OrganizeRunOptions) => {
      if (!availablePrototypeCommands(ctx).some((c) => c.id === commandId)) return;

      /* Acting on a focused row promotes it to the selection first, so the sheets — which
         all read `sidebarSelectedIds` — see the same thing the verb named. */
      const commit = () => {
        if (!ctx.fromSelection) setSidebarSelection('note', ctx.ids);
      };
      const anchorRect = options?.anchorRect ?? null;

      switch (commandId) {
        case 'organize.folder':
          commit();
          setFolderSheetOpen(true);
          return;
        case 'organize.thread':
          openCreateThreadSheet({ noteIds: ctx.ids });
          return;
        case 'organize.share':
          commit();
          setShareSheetOpen(true);
          return;
        case 'organize.removeFromSpace':
          commit();
          setRemoveConfirmAt(anchorRect);
          return;
        case 'organize.delete':
          commit();
          setDeleteConfirmAt(anchorRect);
          return;
        case 'organize.pin': {
          const row = notesById.get(ctx.ids[0] ?? '');
          if (!row || !homeSpaceId) return;
          pinNote.mutate(
            {
              spaceId: homeSpaceId,
              noteId: row.id,
              isPinned: row.isPinned !== true,
              spaceKind: isScopedSharedSpace ? 'shared' : 'personal',
            },
            { onError: (err) => toastError(err, 'Could not update pin') },
          );
          return;
        }
        default:
          return;
      }
    },
    [
      notesById,
      homeSpaceId,
      isScopedSharedSpace,
      openCreateThreadSheet,
      pinNote,
      setSidebarSelection,
    ],
  );

  const openCreateFolder = useCallback(
    (noteIds?: string[]) => {
      if (noteIds?.length) setSidebarSelection('note', noteIds);
      setFolderSheetOpen(true);
    },
    [setSidebarSelection],
  );

  /* Named to stay clear of the HTTP `api` client this file also uses. */
  const organizeApi = useMemo(
    () => ({ run, openCreateFolder, openCreateThread: openCreateThreadSheet }),
    [run, openCreateFolder, openCreateThreadSheet],
  );
  useEffect(() => publishOrganizeApi(organizeApi), [organizeApi]);

  if (!homeSpaceId) return null;

  return (
    <>
      {canCreateCollections ? (
        <PrototypeCreateFolderSheet
          open={folderSheetOpen}
          onOpenChange={setFolderSheetOpen}
          initialSelectedNoteIds={folderSheetOpen ? sidebarSelectedIds : undefined}
          spaceId={homeSpaceId}
          spaceKind={isScopedSharedSpace ? 'shared' : 'personal'}
          spaceNotes={notes}
          notesById={notesById}
          onCreated={(folderName) => {
            setFolderSheetOpen(false);
            setSidebarSelectMode(false);
            /* Show the thing that was just made. The panel rather than the sidebar's rail:
               the host serves every surface, and only one of them has a rail. */
            libraryNav.openFolder(folderName);
          }}
        />
      ) : null}

      {canCreateCollections && isScopedSharedSpace ? (
        <PrototypeCreateSharedThreadSheet
          open={threadSheetOpen}
          onOpenChange={(open) => {
            setThreadSheetOpen(open);
            if (!open) setThreadPrefill(null);
          }}
          spaceId={homeSpaceId}
          spaceColor={activeSharedSpace?.color}
          isOwner={viewerIsSpaceOwner}
          initialNoteIds={threadPrefill?.noteIds}
          onCreated={(thread) => {
            setSidebarSelectMode(false);
            libraryNav.openThread(thread.id);
          }}
        />
      ) : null}

      {canCreateCollections && !isScopedSharedSpace ? (
        <PrototypeCreateThreadSheet
          open={threadSheetOpen}
          onOpenChange={(open) => {
            setThreadSheetOpen(open);
            if (!open) setThreadPrefill(null);
          }}
          spaceId={homeSpaceId}
          spaceNotes={notes}
          initialSelectedNoteIds={threadPrefill?.noteIds}
          initialThreadName={threadPrefill?.threadName}
          onCreated={(repNoteId) => {
            /* Tell whoever opened the sheet that it went through, before the prefill is
               cleared by the close that follows. */
            threadPrefill?.onCreated?.();
            setSidebarSelectMode(false);
            libraryNav.openThread(threadClusterDrillSlug(repNoteId));
          }}
        />
      ) : null}

      {shareSheetOpen ? (
        <>
          {/* Scrim: the picker is a menu, and a menu that only closes by choosing is a trap. */}
          <div
            className="proto-bulk-share__scrim"
            role="presentation"
            onClick={() => {
              if (!sharePending) setShareSheetOpen(false);
            }}
          />
          <div
            className="proto-menu__popover proto-bulk-share__popover"
            role="menu"
            aria-label="Share to a space"
          >
            <div className="proto-menu-section" role="group">
              <p className="proto-menu-section-label">
                {`Share ${sidebarSelectedIds.length} note${
                  sidebarSelectedIds.length === 1 ? '' : 's'
                } to`}
              </p>
              {shareTargets.length === 0 ? (
                <p className="proto-caption" style={{ padding: '6px 10px' }}>
                  No shared spaces yet.
                </p>
              ) : (
                shareTargets.map((sp) => (
                  <button
                    key={sp.id}
                    type="button"
                    role="menuitem"
                    className="proto-menu-item"
                    disabled={sharePending}
                    onClick={() => void shareToSpace(sp.id)}
                  >
                    <span className="proto-menu-item__icon proto-menu-item__icon--space" aria-hidden>
                      <ProtoSpaceMenuIcon color={sp.color || 'paper'} />
                    </span>
                    <span className="proto-menu-item__label">{sp.title}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      ) : null}

      {deleteConfirmAt ? (
        <ProtoConfirmDialog
          anchorRect={deleteConfirmAt}
          preferAbove
          alignRight
          title={`Delete ${sidebarSelectedIds.length} note${
            sidebarSelectedIds.length === 1 ? '' : 's'
          } everywhere?`}
          description={DELETE_NOTE_EVERYWHERE_CONFIRMATION.description}
          confirmLabel="Delete"
          busy={deleteNotesBatch.isPending}
          onConfirm={confirmDelete}
          onCancel={() => {
            if (!deleteNotesBatch.isPending) setDeleteConfirmAt(null);
          }}
        />
      ) : null}

      {removeConfirmAt ? (
        <ProtoConfirmDialog
          anchorRect={removeConfirmAt}
          preferAbove
          alignRight
          title={`Remove ${sidebarSelectedIds.length} note${
            sidebarSelectedIds.length === 1 ? '' : 's'
          } from this space?`}
          description={REMOVE_NOTE_FROM_SPACE_CONFIRMATION.description}
          confirmLabel="Remove"
          busy={removeNotesFromSpace.isPending}
          onConfirm={confirmRemoveFromSpace}
          onCancel={() => {
            if (!removeNotesFromSpace.isPending) setRemoveConfirmAt(null);
          }}
        />
      ) : null}
    </>
  );
}

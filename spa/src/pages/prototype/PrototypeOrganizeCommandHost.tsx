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
  bulkDestructiveCopy,
  REMOVE_NOTE_FROM_SPACE_CONFIRMATION, mixedDestructiveCopy } from './proto-destructive-copy';
import {
  folderRowId,
  removePinnedThreadClusterId,
  togglePinnedFolderId,
  togglePinnedHighlightId,
  togglePinnedThreadClusterId,
} from './proto-pinned-stores';
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
import { useDeleteHighlight } from '../../hooks/mutations/useDeleteHighlight';
import { useRemoveFolder } from '../../hooks/mutations/useRemoveFolder';
import { useRemoveThreadCluster } from '../../hooks/mutations/useRemoveThreadCluster';
import { usePrototypeStudyThreads } from '../../hooks/queries/usePrototypeStudyThreads';
import { usePrototypeSpaceStudyThreadHighlights } from '../../hooks/queries/usePrototypeSpaceStudyThreadHighlights';
import { useRemoveNotesFromSpaceBatch } from '../../hooks/mutations/useSpaceNoteAssociation';
import { usePinSpaceNote } from '../../hooks/mutations/usePinSpaceNote';
import { useNavigation } from '../../hooks/queries/useNavigation';
import { useActiveSpace } from '../../hooks/useActiveSpace';
import { canCreateSidebarCollections } from '../../lib/shared-space-capabilities';
import { usePrototypeHomeSpaceId } from '../../hooks/usePrototypeHomeSpaceId';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { useHomeNotes } from './useHomeNotes';
import { useLibraryPanelNav } from './library-panel/use-library-panel-nav';
import { unpackMixedId } from './library-panel/use-library-selection';
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
    sidebarSelectionKind,
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
  const deleteHighlight = useDeleteHighlight();
  const removeFolder = useRemoveFolder();
  const removeThreadCluster = useRemoveThreadCluster();

  /*
   * Two lookups the destructives need and an id alone cannot give: a Thread is removed by
   * its member notes, and a highlight by its id *and* its parent note. Folders need neither
   * — the id is the folder name, which is what `useRemoveFolder` takes.
   */
  const threadsQuery = usePrototypeStudyThreads(
    isScopedSharedSpace ? undefined : homeSpaceId ?? undefined,
  );
  const highlightsQuery = usePrototypeSpaceStudyThreadHighlights(homeSpaceId ?? undefined);

  const [collectionConfirm, setCollectionConfirm] = useState<{
    kind: 'highlight' | 'folder' | 'thread';
    anchorRect: DOMRect | null;
  } | null>(null);

  /*
   * What the verb that is now open was pointed at, taken at the moment it ran.
   *
   * Not `sidebarSelectedIds`: on the library panel's "Everything" tab those are composite
   * (`${kind}:${sourceId}`), because one selection there can hold a note and a folder — and
   * every mutation below wants the bare source id. The `CommandContext` knows the difference
   * and has already unpacked it, but the sheets and confirms open *after* `run` returned, so
   * the answer is captured here rather than re-read from a selection that cannot say which
   * part of an id is the kind.
   *
   * On every other list the two are identical, which is why this went unnoticed: the ids only
   * diverge on the one tab that can mix.
   */
  const [pendingIds, setPendingIds] = useState<string[]>([]);

  const [folderSheetOpen, setFolderSheetOpen] = useState(false);
  const [threadSheetOpen, setThreadSheetOpen] = useState(false);
  const [threadPrefill, setThreadPrefill] = useState<CreateThreadPrefill | null>(null);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [sharePending, setSharePending] = useState(false);
  const [deleteConfirmAt, setDeleteConfirmAt] = useState<DOMRect | null>(null);
  /*
   * The mixed delete carries items rather than ids: `pendingIds` above is enough for the
   * verbs that act on one kind, but deleting a note and removing a folder are different
   * calls, so this one has to keep which id is which.
   */
  const [mixedConfirm, setMixedConfirm] = useState<{
    items: { kind: 'note' | 'highlight' | 'folder' | 'thread'; id: string }[];
    anchorRect: DOMRect;
  } | null>(null);
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
      const ids = [...pendingIds];
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
    [pendingIds, queryClient, setSidebarSelectMode],
  );

  /**
   * Both destructives report what actually went, not what was asked for. A batch can
   * partially succeed — a note someone else already moved, a stale id — and one flat
   * "Deleted" would be a lie.
   */
  const confirmDelete = useCallback(() => {
    const ids = [...pendingIds];
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
  }, [pendingIds, deleteNotesBatch, setSidebarSelectMode]);

  /* Counted once for the dialog, which asks for the title, the description and the label
     separately and would otherwise recount for each. */
  const mixedConfirmCopy = useMemo(() => {
    const items = mixedConfirm?.items ?? [];
    const count = (kind: string) => items.filter((i) => i.kind === kind).length || undefined;
    return mixedDestructiveCopy(
      {
        note: count('note'),
        highlight: count('highlight'),
        folder: count('folder'),
        thread: count('thread'),
      },
      items.length,
    );
  }, [mixedConfirm?.items]);

  /**
   * Delete a pile holding more than one kind.
   *
   * Each kind keeps the call it already had — notes through the batch endpoint, folders and
   * Threads through their own removals, highlights through theirs — because those are not
   * interchangeable and a "generic delete" would have to reimplement all four badly. What is
   * new is only the grouping, and the order: notes first, so the irreversible half happens
   * while the request is freshest, and a failure part-way through has removed labels rather
   * than lost writing.
   */
  const confirmMixedDelete = useCallback(async () => {
    const items = mixedConfirm?.items ?? [];
    if (items.length === 0 || !homeSpaceId) return;
    const idsOf = (kind: string) => items.filter((i) => i.kind === kind).map((i) => i.id);

    try {
      const noteIds = idsOf('note');
      if (noteIds.length > 0) await deleteNotesBatch.mutateAsync(noteIds);

      for (const id of idsOf('folder')) {
        await removeFolder.mutateAsync({ spaceId: homeSpaceId, folderName: id });
      }
      for (const id of idsOf('thread')) {
        const cluster = (threadsQuery.data ?? []).find((c) => c.id === id);
        if (!cluster) continue;
        await removeThreadCluster.mutateAsync({ spaceId: homeSpaceId, memberIds: cluster.memberIds });
        removePinnedThreadClusterId(homeSpaceId, cluster.id);
      }
      for (const id of idsOf('highlight')) {
        const row = (highlightsQuery.data ?? []).find((h) => h.id === id);
        if (!row) continue;
        await deleteHighlight.mutateAsync({
          id: row.id,
          spaceId: homeSpaceId,
          parentNoteId: row.parentNoteId,
        });
      }
      toast.success(`Deleted ${items.length} item${items.length === 1 ? '' : 's'}`);
    } catch (err) {
      /* Deliberately vague about how far it got: the loops above stop at the first failure,
         and claiming a count would mean tracking one through four different mutations to say
         something the reader can see for themselves by looking at the list. */
      toastError(err, 'Could not delete everything you picked');
    } finally {
      setMixedConfirm(null);
      setSidebarSelection('mixed', []);
      setSidebarSelectMode(false);
    }
  }, [
    mixedConfirm?.items,
    homeSpaceId,
    deleteNotesBatch,
    removeFolder,
    removeThreadCluster,
    threadsQuery.data,
    highlightsQuery.data,
    deleteHighlight,
    setSidebarSelection,
    setSidebarSelectMode,
  ]);

  const confirmRemoveFromSpace = useCallback(() => {
    const ids = [...pendingIds];
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
    pendingIds,
    isScopedSharedSpace,
    homeSpaceId,
    removeNotesFromSpace,
    setSidebarSelectMode,
  ]);

  /**
   * The three collection destructives, which are one shape: walk the selection, call the
   * mutation for the kind, and clear regardless.
   *
   * Sequential rather than `Promise.all` — each is a separate write and firing fifty at
   * once is how a batch trips the rate limit the notes path already works around. The
   * `finally` clears the selection even on a partial failure: some of them went, so leaving
   * the old set checked would invite a second run over rows that no longer exist.
   */
  const confirmCollectionDelete = useCallback(async () => {
    const kind = collectionConfirm?.kind;
    if (!kind || !homeSpaceId) return;
    const ids = [...pendingIds];
    try {
      for (const id of ids) {
        if (kind === 'folder') {
          await removeFolder.mutateAsync({ spaceId: homeSpaceId, folderName: id });
        } else if (kind === 'thread') {
          const cluster = (threadsQuery.data ?? []).find((c) => c.id === id);
          if (!cluster) continue;
          await removeThreadCluster.mutateAsync({
            spaceId: homeSpaceId,
            memberIds: cluster.memberIds,
          });
          removePinnedThreadClusterId(homeSpaceId, cluster.id);
        } else {
          const row = (highlightsQuery.data ?? []).find((h) => h.id === id);
          if (!row) continue;
          await deleteHighlight.mutateAsync({
            id: row.id,
            spaceId: homeSpaceId,
            parentNoteId: row.parentNoteId,
          });
        }
      }
    } catch (err) {
      toastError(
        err,
        kind === 'folder'
          ? 'Could not remove every folder'
          : kind === 'thread'
            ? 'Could not remove every Thread'
            : 'Could not delete every highlight',
      );
    } finally {
      setCollectionConfirm(null);
      setSidebarSelection(kind, []);
      setSidebarSelectMode(false);
    }
  }, [
    collectionConfirm?.kind,
    homeSpaceId,
    pendingIds,
    removeFolder,
    removeThreadCluster,
    deleteHighlight,
    threadsQuery.data,
    highlightsQuery.data,
    setSidebarSelection,
    setSidebarSelectMode,
  ]);

  const run = useCallback(
    (commandId: PrototypeCommandId, ctx: CommandContext, options?: OrganizeRunOptions) => {
      if (!availablePrototypeCommands(ctx).some((c) => c.id === commandId)) return;

      /* The ids every sheet and confirm below will act on, unpacked and in hand before the
         context goes out of scope. */
      setPendingIds(ctx.ids);

      /* Acting on a focused row promotes it to the selection first, so the checkboxes show
         what the verb named rather than nothing. */
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
          /* Notes delete everywhere and say so; the other three take away a label, a
             connection or an annotation, and their confirms have to promise only that. */
          if (ctx.kinds.length > 1 && anchorRect) {
            /* More than one kind means more than one outcome, and no single confirm sentence
               the existing two own. `mixedDestructiveCopy` writes both. */
            setMixedConfirm({
              items: ctx.items.filter(
                (item): item is { kind: 'note' | 'highlight' | 'folder' | 'thread'; id: string } =>
                  item.kind === 'note' ||
                  item.kind === 'highlight' ||
                  item.kind === 'folder' ||
                  item.kind === 'thread',
              ),
              anchorRect,
            });
            return;
          }
          if (ctx.kind === 'note') setDeleteConfirmAt(anchorRect);
          else if (ctx.kind === 'highlight' || ctx.kind === 'folder' || ctx.kind === 'thread')
            setCollectionConfirm({ kind: ctx.kind, anchorRect });
          return;
        case 'organize.pin': {
          if (!homeSpaceId) return;
          /*
           * Notes pin through the server, one at a time — `usePinSpaceNote` is single-id and
           * a bulk fan-out would meet the write limit that already caps folder assignment.
           * The other three pin locally, so a selection of fifty is fifty cheap writes and
           * the command's own gate lets them take one.
           */
          if (ctx.kind === 'note') {
            const row = notesById.get(ctx.ids[0] ?? '');
            if (!row) return;
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
          /* Per item, not per selection: a mixed pile pins each thing by its own rules, and
             reading `ctx.kind` here would have pinned a folder as though it were a highlight. */
          for (const item of ctx.items) {
            if (item.kind === 'highlight') togglePinnedHighlightId(homeSpaceId, item.id);
            /* Folders select by name; the pin store keys on `folderRowId(name)`. */
            else if (item.kind === 'folder') togglePinnedFolderId(homeSpaceId, folderRowId(item.id));
            else if (item.kind === 'thread') togglePinnedThreadClusterId(homeSpaceId, item.id);
          }
          setSidebarSelection(ctx.kind, []);
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

  /**
   * The one way in that does not go through `run`, and so has to work out its own target.
   *
   * Called with ids ("make a folder of these") it takes them; called bare, from the panel's
   * New folder footer, it prefills with whatever notes happen to be selected. That second
   * case is the only place left that has to read the selection directly, so it is also the
   * only place that has to know the two id shapes apart — and `sidebarSelectionKind` says
   * which it is holding without anyone having to guess from the ids themselves.
   *
   * Notes only, in either shape. A standing folder or Thread selection prefills nothing: a
   * folder is not something you put inside a folder, and offering its name as a member was
   * the old code's accident rather than its intent.
   */
  const openCreateFolder = useCallback(
    (noteIds?: string[]) => {
      if (noteIds?.length) {
        setSidebarSelection('note', noteIds);
        setPendingIds(noteIds);
      } else if (sidebarSelectionKind === 'mixed') {
        setPendingIds(
          sidebarSelectedIds
            .map((id) => unpackMixedId(id))
            .filter((entry) => entry?.kind === 'note')
            .map((entry) => (entry as { sourceId: string }).sourceId),
        );
      } else {
        setPendingIds(sidebarSelectionKind === 'note' ? sidebarSelectedIds : []);
      }
      setFolderSheetOpen(true);
    },
    [setSidebarSelection, sidebarSelectedIds, sidebarSelectionKind],
  );

  /* Named to stay clear of the HTTP `api` client this file also uses. */
  const organizeApi = useMemo(
    () => ({
      run,
      canCreateCollections,
      openCreateFolder,
      openCreateThread: openCreateThreadSheet,
    }),
    [run, canCreateCollections, openCreateFolder, openCreateThreadSheet],
  );
  useEffect(() => publishOrganizeApi(organizeApi), [organizeApi]);

  if (!homeSpaceId) return null;

  return (
    <>
      {canCreateCollections ? (
        <PrototypeCreateFolderSheet
          open={folderSheetOpen}
          onOpenChange={setFolderSheetOpen}
          initialSelectedNoteIds={folderSheetOpen ? pendingIds : undefined}
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
                {`Share ${pendingIds.length} note${pendingIds.length === 1 ? '' : 's'} to`}
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
          title={bulkDestructiveCopy('note', pendingIds.length).title}
          description={bulkDestructiveCopy('note', pendingIds.length).description}
          confirmLabel={bulkDestructiveCopy('note', pendingIds.length).confirmLabel}
          busy={deleteNotesBatch.isPending}
          onConfirm={confirmDelete}
          onCancel={() => {
            if (!deleteNotesBatch.isPending) setDeleteConfirmAt(null);
          }}
        />
      ) : null}

      {mixedConfirm ? (
        <ProtoConfirmDialog
          anchorRect={mixedConfirm.anchorRect}
          preferAbove
          alignRight
          title={mixedConfirmCopy.title}
          description={mixedConfirmCopy.description}
          confirmLabel={mixedConfirmCopy.confirmLabel}
          busy={deleteNotesBatch.isPending}
          onConfirm={confirmMixedDelete}
          onCancel={() => {
            if (!deleteNotesBatch.isPending) setMixedConfirm(null);
          }}
        />
      ) : null}

      {collectionConfirm ? (
        <ProtoConfirmDialog
          anchorRect={collectionConfirm.anchorRect}
          preferAbove
          alignRight
          title={bulkDestructiveCopy(collectionConfirm.kind, pendingIds.length).title}
          description={
            bulkDestructiveCopy(collectionConfirm.kind, pendingIds.length).description
          }
          confirmLabel={
            bulkDestructiveCopy(collectionConfirm.kind, pendingIds.length).confirmLabel
          }
          busy={
            removeFolder.isPending || removeThreadCluster.isPending || deleteHighlight.isPending
          }
          onConfirm={() => void confirmCollectionDelete()}
          onCancel={() => {
            if (removeFolder.isPending || removeThreadCluster.isPending || deleteHighlight.isPending)
              return;
            setCollectionConfirm(null);
          }}
        />
      ) : null}

      {removeConfirmAt ? (
        <ProtoConfirmDialog
          anchorRect={removeConfirmAt}
          preferAbove
          alignRight
          title={`Remove ${pendingIds.length} note${
            pendingIds.length === 1 ? '' : 's'
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

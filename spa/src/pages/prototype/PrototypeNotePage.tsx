import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useAuth } from '@clerk/clerk-react';
import { prototypeHomeRouteTo, prototypeNoteRouteTo } from '@/lib/prototype-path';
import { useQueryClient } from '@tanstack/react-query';
import CardFullEditable from '../../../../src/components/react/CardFullEditable';
import Icon from '@/components/react/Icon';
import SubtleContentMount from '@/components/react/SubtleContentMount';
import { detectScriptureReferences } from '@/utils/scripture-detector';
import {
  getNoteIdFromCreateResponse,
  shouldUseNoteOnlyParentThreadCache,
  useNote,
} from '../../hooks/queries/useNote';
import { useProcessScriptureRefs } from '../../hooks/mutations/useProcessScriptureRefs';
import { useUpdateNote } from '../../hooks/mutations/useUpdateNote';
import { alertCreateNoteFailure, useCreateSimpleNote } from '../../hooks/mutations/useCreateSimpleNote';
import {
  spaceNoteOrganizationPatchFromCollectionExtras,
  usePatchSpaceNoteOrganization,
  type NoteCollectionExtras,
} from '../../hooks/mutations/usePatchSpaceNoteOrganization';
import { PANE_DOCK_MIN_WIDTH } from '../../layouts/proto-inspector-layout';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { noteFolderChipDisplayState } from '@/utils/note-folder-display';
import { isEffectivelyEmptyPrototypeNote } from '@/utils/prototype-note-empty';
import PrototypeInspectorPane from './PrototypeInspectorPane';
import PrototypeStudyThreadPopover from './PrototypeStudyThreadPopover';
import PrototypeMainPaneShell from './PrototypeMainPaneShell';
import PrototypePaneEmptyState from './PrototypePaneEmptyState';
import ProtoSpaceLoading from './ProtoSpaceLoading';
import PrototypeSharedNoteReadOnlyBanner from './PrototypeSharedNoteReadOnlyBanner';
import SharedStudyHighlightOverlay from './SharedStudyHighlightOverlay';
import { useActiveSpace } from '../../hooks/useActiveSpace';
import { useForeignSharedNote } from '../../hooks/useForeignSharedNote';
import { useMentionSource } from './mention-picker-source';
import { threadClusterDrillSlug } from '@/utils/thread-cluster-bulk-actions';
import type { MentionPillClickPayload } from '@/components/react/mention-pill-types';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import { getEffectiveDefaultTranslation } from '@/utils/profile-cache';
import { buildHighlightDockOpenMetadataFromStudyThread } from '@/utils/study-dock-stack';
import {
  filterForeignNoteOverlayStudyThreads,
  filterOverlayStudyThreads,
  resolveStudyThreadPmRange,
} from '../../lib/shared-highlight-overlay';
import { isPrototypeNoteEditorFocused } from '@/utils/prototype-editor-focused';
import { clearNoteDraft } from '@/utils/note-draft-store';
import {
  isDraftComposeAdoptionTransition,
  prototypeComposeEditorKey,
  shouldKeepEditorDuringPersistedDraftLoad,
  shouldResetComposeSessionOnEpochChange,
} from '@/utils/prototype-draft-compose-session';
import {
  COMPOSE_URL_IDLE_MS,
  type PendingComposeUrlReplace,
} from '@/utils/prototype-compose-url';
import { isPrototypeDraftNoteSlug, noteParamSlug, normalizeNoteIdFromParam } from './proto-route-slugs';
import {
  draftDestinationChipModel,
  getComposeGroupThreadId,
  setComposeGroupThreadId,
} from '../../lib/compose-group-thread';
import { validComposeThreadSelection } from './PrototypeGroupStudyThreadPicker';
import { selectCurrentSpaceThread, useSpaceGroupThreads } from '../../hooks/queries/useSpaceGroupThreads';
import { trackSessionNoteOpen } from '@/utils/session-xp-client';
import type { NoteActivityItem } from '../../lib/shared-note-activity-list';
import { PROTOTYPE_NOTE_LIST_NAV_SEARCH } from '@/utils/prototype-sidebar-highlight-active';
import { api, APIError } from '../../lib/api';

const DRAFT_NOTE_ID = 'note_draft';
const EMPTY_NOTE_COLLECTIONS: string[] = [];

export function draftSaveDestinationLabel(input: {
  targetSpaceId: string | null | undefined;
  homeSpaceId: string | null | undefined;
  targetSpaceTitle: string | null | undefined;
  threadTitle?: string | null;
}): string {
  if (!input.targetSpaceId || input.targetSpaceId === input.homeSpaceId) return 'Saving to My Home';
  const spaceTitle = input.targetSpaceTitle?.trim() || 'this space';
  const threadTitle = input.threadTitle?.trim();
  return threadTitle ? `Saving to ${threadTitle} in ${spaceTitle}` : `Saving to ${spaceTitle}`;
}

export function resolvePrototypeNoteLoadState(input: {
  isDraft: boolean;
  isLoading: boolean;
  hasNote: boolean;
  error: unknown;
  keepEditor: boolean;
}): 'draft' | 'loading' | 'error' | 'not-found' | 'ready' {
  if (input.isDraft) return 'draft';
  if (input.hasNote || input.keepEditor) return 'ready';
  if (input.isLoading) return 'loading';
  if (input.error) return input.error instanceof APIError && input.error.status === 404 ? 'not-found' : 'error';
  return 'not-found';
}

function sharedContextForSave(
  explicitContextSpaceId: string | null | undefined,
  targetSpaceId: string | null | undefined,
  personalHomeSpaceId: string | null | undefined,
): string | null {
  const explicit = explicitContextSpaceId?.trim();
  if (explicit) return explicit;
  const target = targetSpaceId?.trim();
  if (!target || target === personalHomeSpaceId) return null;
  return target;
}

/**
 * Cap how many times a single note auto-reprocesses scripture. Without a cap, a
 * persistent server failure re-fires the mutation on every `note` refetch (the
 * effect depends on the query object). The counter resets when the page
 * remounts (navigate away and back), so transient failures still get a fresh try.
 */
const MAX_SCRIPTURE_REPROCESS_ATTEMPTS = 3;

export default function PrototypeNotePage() {
  const { noteId: noteSlugParam } = useParams({ strict: false }) as { noteId: string };
  const isDraft = isPrototypeDraftNoteSlug(noteSlugParam);
  const noteId = isDraft ? DRAFT_NOTE_ID : normalizeNoteIdFromParam(noteSlugParam);
  const {
    reference: initialReferenceWord,
    scriptureRef: initialScriptureRef,
    scriptureTranslation: initialScriptureTranslation,
    studyThread: initialStudyThread,
    highlight: initialHighlightThread,
    dockReq,
    crossRefTarget: initialCrossRefTargetSearch,
    space: contextSpaceId,
  } = useSearch({ strict: false }) as {
    reference?: string;
    scriptureRef?: string;
    scriptureTranslation?: string;
    studyThread?: string;
    highlight?: string;
    dockReq?: string;
    crossRefTarget?: string;
    space?: string;
  };
  // Stable object so CardFullEditable's open-on-load effect doesn't refire each render.
  // `requestKey` (dockReq nonce from sidebar) makes each home tap re-open the dock even when
  // it targets the note already on screen or the dock entry already exists in the carousel.
  const initialScriptureDock = useMemo(
    () =>
      initialScriptureRef
        ? {
            reference: initialScriptureRef,
            translation: initialScriptureTranslation ?? null,
            requestKey: dockReq ?? initialStudyThread ?? initialScriptureRef,
          }
        : null,
    [initialScriptureRef, initialScriptureTranslation, initialStudyThread, dockReq],
  );

  const initialCrossRefTarget = useMemo(() => {
    const ref = initialCrossRefTargetSearch?.trim();
    if (!ref) return null;
    return {
      reference: ref,
      requestKey: dockReq ?? ref,
    };
  }, [initialCrossRefTargetSearch, dockReq]);

  // personalHomeSpaceId is the viewer's My Home; it's used for the offline guard
  // (shared spaces require connectivity in the foundation) and as the compose
  // fallback when no shared space is selected. The compose *target* itself comes
  // from the persisted selection (see composeTargetSpaceId below), not from the
  // nav-validated activeSpaceId, so a brand-new draft never races the navigation
  // query and land in My Home while a shared space is active.
  const { homeSpaceId: personalHomeSpaceId, spaceTitle: activeSpaceTitle } = useActiveSpace();
  const { userId: authUserId } = useAuth();
  const navigate = useNavigate();

  const { data: note, isLoading, isError, error: noteQueryError, refetch: refetchNote } = useNote(
    isDraft ? '' : noteId,
    isDraft ? null : contextSpaceId,
  );
  const { readOnlyInSharedSpace, isForeignSharedNote, noteInSharedSpace, effectiveSpaceId: foreignSharedSpaceId, foreignNoteAuthor } =
    useForeignSharedNote(isDraft ? null : noteId, isDraft ? null : contextSpaceId);

  // Deep-link to a highlight's dock (Home "revisit" card → text / mini-note / connected highlight).
  const initialHighlightDock = useMemo(() => {
    if (!initialHighlightThread) return null;
    const row = note?.studyThreads?.find((t) => t.id === initialHighlightThread);
    if (!row) return null;
    return {
      studyThreadEntryId: initialHighlightThread,
      requestKey: dockReq ?? initialHighlightThread,
      metadata: buildHighlightDockOpenMetadataFromStudyThread(row),
    };
  }, [initialHighlightThread, note?.studyThreads, dockReq]);

  const initialReferenceRequestKey = initialReferenceWord ? (dockReq ?? initialReferenceWord) : null;

  const editorSecondaryCollections = useMemo(() => {
    if (isDraft) return EMPTY_NOTE_COLLECTIONS;
    const secondaries = note?.secondaryCollections;
    return secondaries?.length ? secondaries : EMPTY_NOTE_COLLECTIONS;
  }, [isDraft, note?.secondaryCollections]);

  const queryClient = useQueryClient();
  const updateNoteMutation = useUpdateNote();
  const createNoteMutation = useCreateSimpleNote();
  const patchSpaceNoteOrganizationMutation = usePatchSpaceNoteOrganization();
  // Stable ref so noteSaveCallback never re-registers just because the mutation object identity changed
  const updateNoteMutationRef = useRef(updateNoteMutation);
  updateNoteMutationRef.current = updateNoteMutation;
  const createNoteMutationRef = useRef(createNoteMutation);
  createNoteMutationRef.current = createNoteMutation;
  const patchSpaceNoteOrganizationMutationRef = useRef(patchSpaceNoteOrganizationMutation);
  patchSpaceNoteOrganizationMutationRef.current = patchSpaceNoteOrganizationMutation;
  const draftPersistPromiseRef = useRef<Promise<string | null> | null>(null);
  const persistedDraftIdRef = useRef<string | null>(null);
  // The note id a draft compose persisted into. Unlike `persistedDraftIdRef` (reset
  // on every slug change), this survives the /n/new → /n/<id> swap so the editor
  // subtree key can stay stable across that single transition (no remount mid-typing).
  const [adoptedComposeId, setAdoptedComposeId] = useState<string | null>(null);
  const adoptedComposeIdRef = useRef<string | null>(null);
  const prevNoteSlugParamRef = useRef(noteSlugParam);
  const pendingComposeUrlReplaceRef = useRef<PendingComposeUrlReplace | null>(null);
  const composeUrlIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftPersistRemountRef = useRef<{ content: string } | null>(null);
  const [draftPersistRemountTick, setDraftPersistRemountTick] = useState(0);
  const processScriptureMutation = useProcessScriptureRefs();
  const {
    activeSpaceId: selectedSpaceId,
    inspectorOpen,
    inspectorExiting,
    isMobileSidebar,
    closeInspector,
    setPrototypeFolderChip,
    setComposePersistedNoteId,
    composeSessionEpoch,
    composeTargetSpaceIdOverride,
    clearComposeTargetSpaceIdOverride,
    dismissStandaloneScripturePassage,
    openStandaloneScripturePassage,
    formatToolbarHostEl,
    studyDockCarouselHostEl,
    setEditorChromeMode,
    studyThreadPopoverOpen,
    closeStudyThreadPopover,
    setActiveSpaceId,
    setSidebarListMode,
    setSidebarThreadDrilldownId,
    setSidebarFolderDrilldown,
    setSidebarLayer,
    ensureSidebarExpanded,
    openDrawer,
  } = useProtoShell();

  // New-note compose target. Trust the persisted space selection directly (it's
  // set synchronously when the user picks a space and restored from localStorage
  // on load) rather than the nav-validated activeSpaceId, which briefly falls back
  // to My Home on a cold page before the navigation query settles. That fallback
  // could otherwise persist a fresh draft into personal My Home instead of the
  // shared space the user is composing in. Falls back to My Home when nothing is
  // selected; a stale selection is cleared by useActiveSpace and the server
  // rejects a create into a space you no longer belong to.
  const composeTargetSpaceId = useMemo(() => {
    if (composeTargetSpaceIdOverride) return composeTargetSpaceIdOverride;
    if (!selectedSpaceId) return personalHomeSpaceId;
    return selectedSpaceId.startsWith('space_') ? selectedSpaceId : `space_${selectedSpaceId}`;
  }, [composeTargetSpaceIdOverride, selectedSpaceId, personalHomeSpaceId]);
  const prevComposeSessionEpochRef = useRef(composeSessionEpoch);

  useEffect(() => {
    if (!isDraft && composeTargetSpaceIdOverride) {
      clearComposeTargetSpaceIdOverride();
    }
  }, [isDraft, composeTargetSpaceIdOverride, clearComposeTargetSpaceIdOverride]);

  // A fresh shared-space draft saves to the space only by default. When the space has a
  // pinned current Thread, the destination cue shows an opt-in chip instead of a blocking
  // dialog; composing from the Thread drilldown arrives with the Thread preselected
  // (beginComposeInGroupThread), which just renders the chip active.
  const isSharedComposeTarget = isDraft && !!composeTargetSpaceId && composeTargetSpaceId !== personalHomeSpaceId;
  const composeGroupThreadsQuery = useSpaceGroupThreads(isSharedComposeTarget ? composeTargetSpaceId : undefined);
  const composeGroupThreads = composeGroupThreadsQuery.data ?? [];
  const pinnedComposeThread = isSharedComposeTarget ? selectCurrentSpaceThread(composeGroupThreads) : null;
  const [composeThreadSelection, setComposeThreadSelection] = useState<string | null>(() =>
    getComposeGroupThreadId(),
  );
  useEffect(() => {
    setComposeThreadSelection(getComposeGroupThreadId());
  }, [composeSessionEpoch]);
  const resolvedComposeThreadId = isSharedComposeTarget
    ? validComposeThreadSelection(composeThreadSelection, composeGroupThreads, composeGroupThreadsQuery.isLoading)
    : null;
  const resolvedComposeThread = resolvedComposeThreadId
    ? composeGroupThreads.find((thread) => thread.id === resolvedComposeThreadId) ?? null
    : null;
  const resolvedComposeThreadIdRef = useRef(resolvedComposeThreadId);
  resolvedComposeThreadIdRef.current = resolvedComposeThreadId;

  const [composeThreadToggleBusy, setComposeThreadToggleBusy] = useState(false);
  const toggleComposeThread = useCallback(() => {
    if (!pinnedComposeThread || composeThreadToggleBusy) return;
    const threadId = pinnedComposeThread.id;
    const wasActive = resolvedComposeThreadIdRef.current === threadId;
    const next = wasActive ? null : threadId;
    setComposeGroupThreadId(next);
    setComposeThreadSelection(next);
    // Before the draft persists, the selection rides into the create call. After, the
    // note is real — reconcile membership through the thread endpoints (awaiting any
    // in-flight create so a toggle mid-save still lands on the final note).
    if (!persistedDraftIdRef.current && !draftPersistPromiseRef.current) return;
    setComposeThreadToggleBusy(true);
    (async () => {
      const noteId = persistedDraftIdRef.current ?? (await draftPersistPromiseRef.current);
      if (!noteId) return;
      try {
        await api.post(`/api/notes/${noteId}/${next ? 'add-thread' : 'remove-thread'}`, { threadId });
      } catch (err) {
        // Removing a membership the create never wrote is fine; anything else reverts
        // the chip so the cue never lies about where the note lives.
        if (!(err instanceof APIError && err.status === 404 && !next)) throw err;
      }
      queryClient.invalidateQueries({ queryKey: ['thread', threadId, 'notes'] });
      queryClient.invalidateQueries({ queryKey: ['note', noteId] });
      if (composeTargetSpaceId) {
        queryClient.invalidateQueries({ queryKey: ['space', composeTargetSpaceId, 'group-threads'] });
      }
    })()
      .catch(() => {
        setComposeGroupThreadId(wasActive ? threadId : null);
        setComposeThreadSelection(wasActive ? threadId : null);
      })
      .finally(() => setComposeThreadToggleBusy(false));
  }, [pinnedComposeThread, composeThreadToggleBusy, queryClient, composeTargetSpaceId]);

  const composeThreadChip = draftDestinationChipModel({
    pinnedThread: pinnedComposeThread,
    resolvedThreadId: resolvedComposeThreadId,
  });

  const onHighlightOpenRequestConsumed = useCallback(() => {
    setHighlightOpenRequest(null);
  }, []);

  const [activeActivityId, setActiveActivityId] = useState<string | null>(null);

  useEffect(() => {
    setHighlightOpenRequest(null);
    setActiveActivityId(null);
  }, [contextSpaceId, noteId]);

  const onHighlightDeepLinkHandoff = useCallback(() => {
    if (!initialHighlightThread) return;
    navigate({
      to: prototypeNoteRouteTo(),
      params: { noteId: noteSlugParam },
      search: { ...PROTOTYPE_NOTE_LIST_NAV_SEARCH, space: contextSpaceId },
      replace: true,
    });
  }, [navigate, noteSlugParam, initialHighlightThread, contextSpaceId]);

  const onScriptureDeepLinkHandoff = useCallback(() => {
    if (!initialScriptureRef) return;
    navigate({
      to: prototypeNoteRouteTo(),
      params: { noteId: noteSlugParam },
      search: { ...PROTOTYPE_NOTE_LIST_NAV_SEARCH, space: contextSpaceId },
      replace: true,
    });
  }, [navigate, noteSlugParam, initialScriptureRef, contextSpaceId]);

  const onReferenceDeepLinkHandoff = useCallback(() => {
    if (!initialReferenceWord) return;
    navigate({
      to: prototypeNoteRouteTo(),
      params: { noteId: noteSlugParam },
      search: { ...PROTOTYPE_NOTE_LIST_NAV_SEARCH, space: contextSpaceId },
      replace: true,
    });
  }, [navigate, noteSlugParam, initialReferenceWord, contextSpaceId]);

  // Scripture highlight whose parent note has no matching pill: fall back to the standalone passage
  // pane (focused on the thread) so the tap never silently lands on "just the note".
  const onScriptureDockUnresolved = useCallback(() => {
    if (!initialScriptureRef) return;
    navigate({ to: prototypeHomeRouteTo() as any });
    openStandaloneScripturePassage({
      canonicalReference: initialScriptureRef,
      translationCode: initialScriptureTranslation ?? '',
      focusedHighlightThreadId: initialStudyThread ?? '',
    });
  }, [
    navigate,
    openStandaloneScripturePassage,
    initialScriptureRef,
    initialScriptureTranslation,
    initialStudyThread,
  ]);

  // Dock the inspector side-by-side only when the editor pane is wide enough to
  // seat the editor (max 720px content) beside it (~268px reserve); otherwise let
  // it float over the editor as a quiet overlay. Measured from the actual pane
  // element via ResizeObserver so it tracks real layout px (a viewport media
  // query is unreliable in the native webview where CSS px != visible px).
  const paneResizeObserverRef = useRef<ResizeObserver | null>(null);
  const notePaneRowElRef = useRef<HTMLDivElement | null>(null);
  const [paneIsWide, setPaneIsWide] = useState(false);

  const syncPaneWidth = useCallback((width: number) => {
    setPaneIsWide(width >= PANE_DOCK_MIN_WIDTH);
  }, []);

  const notePaneRowRef = useCallback((node: HTMLDivElement | null) => {
    paneResizeObserverRef.current?.disconnect();
    paneResizeObserverRef.current = null;
    notePaneRowElRef.current = node;
    if (!node || typeof ResizeObserver === 'undefined') return;
    syncPaneWidth(node.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        syncPaneWidth(entry.contentRect.width);
      }
    });
    ro.observe(node);
    paneResizeObserverRef.current = ro;
  }, [syncPaneWidth]);

  useLayoutEffect(() => {
    const node = notePaneRowElRef.current;
    if (!node) return;
    syncPaneWidth(node.getBoundingClientRect().width);
  }, [syncPaneWidth]);

  useEffect(() => {
    dismissStandaloneScripturePassage();
  }, [dismissStandaloneScripturePassage]);

  useEffect(() => {
    const onDeleted = (e: Event) => {
      const deletedId = (e as CustomEvent<{ noteId?: string }>).detail?.noteId;
      if (deletedId && deletedId === noteId) {
        navigate({ to: prototypeHomeRouteTo() as any, replace: true });
      }
    };
    window.addEventListener('noteDeleted', onDeleted);
    return () => window.removeEventListener('noteDeleted', onDeleted);
  }, [noteId, navigate]);

  useEffect(() => {
    if (isDraft || isLoading || isError || !note) return;
    trackSessionNoteOpen(noteId);
  }, [isDraft, isLoading, isError, note, noteId]);

  const resolvedSpaceFromNote =
    typeof note?.spaceId === 'string' && note.spaceId.trim().length > 0 ? note.spaceId : null;
  const resolvedSpaceFromThread = (note?.threads?.[0] as { spaceId?: string | null } | undefined)?.spaceId ?? null;

  const effectiveSpaceId = isDraft
    ? composeTargetSpaceId ?? ''
    : contextSpaceId ||
      foreignSharedSpaceId ||
      ((resolvedSpaceFromNote != null ? resolvedSpaceFromNote : resolvedSpaceFromThread) ?? composeTargetSpaceId ?? '');
  const sharedActionSpaceId =
    contextSpaceId ||
    foreignSharedSpaceId ||
    (personalHomeSpaceId && effectiveSpaceId !== personalHomeSpaceId ? effectiveSpaceId : null);
  const draftDestinationCue = draftSaveDestinationLabel({
    targetSpaceId: composeTargetSpaceId,
    homeSpaceId: personalHomeSpaceId,
    targetSpaceTitle: activeSpaceTitle,
    threadTitle: resolvedComposeThread?.title ?? null,
  });

  const effectiveSpaceIdRef = useRef(effectiveSpaceId);
  effectiveSpaceIdRef.current = effectiveSpaceId;

  // @ mention pills: personal notes search across the user's own spaces; notes inside a
  // shared space are scoped to that space only so a pill can never point where other
  // members can't follow. Omitted entirely (no typeahead) for read-only foreign notes.
  const mentionSource = useMentionSource(
    noteInSharedSpace
      ? { mode: 'shared', spaceId: effectiveSpaceId }
      : { mode: 'personal', personalSpaceId: personalHomeSpaceId ?? effectiveSpaceId },
  );

  const onMentionPillClick = useCallback(
    (payload: MentionPillClickPayload) => {
      const targetSpaceId = payload.spaceId;
      const isCrossSpace =
        !!targetSpaceId &&
        !!personalHomeSpaceId &&
        targetSpaceId.replace(/^space_/, '') !== personalHomeSpaceId.replace(/^space_/, '') &&
        targetSpaceId.replace(/^space_/, '') !== (selectedSpaceId ?? '').replace(/^space_/, '');

      if (payload.kind === 'note') {
        navigate({
          to: prototypeNoteRouteTo(),
          params: { noteId: noteParamSlug(payload.entityId) },
        });
        return;
      }

      if (isCrossSpace) {
        setActiveSpaceId(targetSpaceId === personalHomeSpaceId ? null : targetSpaceId);
      }
      if (payload.kind === 'thread') {
        setSidebarListMode('threads');
        setSidebarThreadDrilldownId(threadClusterDrillSlug(payload.entityId));
      } else {
        setSidebarListMode('folders');
        setSidebarFolderDrilldown(payload.entityId);
      }
      setSidebarLayer('list');
      ensureSidebarExpanded();
      if (isMobileSidebar) openDrawer();
    },
    [
      navigate,
      personalHomeSpaceId,
      selectedSpaceId,
      setActiveSpaceId,
      setSidebarListMode,
      setSidebarThreadDrilldownId,
      setSidebarFolderDrilldown,
      setSidebarLayer,
      ensureSidebarExpanded,
      isMobileSidebar,
      openDrawer,
    ],
  );

  const patchSharedOrganization = useCallback(
    async (
      targetNoteId: string,
      sharedSpaceId: string,
      extras?: NoteCollectionExtras,
    ) => {
      const organization = spaceNoteOrganizationPatchFromCollectionExtras(extras);
      if (Object.keys(organization).length === 0) return;
      await patchSpaceNoteOrganizationMutationRef.current.mutateAsync({
        noteId: targetNoteId,
        spaceId: sharedSpaceId,
        ...organization,
      });
    },
    [],
  );

  // Handle "New Note from selection" — TiptapEditor fires openNewNotePanel + writes to
  // localStorage; the prototype doesn't mount BottomSheet/CreateNoteButton so we wire
  // it up here directly.
  useEffect(() => {
    const handler = async () => {
      const spaceId = composeTargetSpaceId || effectiveSpaceIdRef.current;
      if (!spaceId) return;

      const title = localStorage.getItem('newNoteTitle') ?? '';
      const content = localStorage.getItem('newNoteContent') ?? '';
      const linkedFromNoteId = localStorage.getItem('newNoteSourceNoteId') || undefined;

      // Clean up so a repeated open doesn't replay stale data.
      ['newNoteTitle', 'newNoteContent', 'newNoteSourceNoteId',
       'newNoteSourceSelectionFrom', 'newNoteSourceSelectionTo',
       'newNoteSourceSelectionPlainText', 'newNoteContentEmptyFromSelection',
       'showNewNotePanel'].forEach((k) => localStorage.removeItem(k));

      try {
        const res = await createNoteMutationRef.current.mutateAsync({
          spaceId,
          contextSpaceId: sharedContextForSave(
            contextSpaceId,
            spaceId,
            personalHomeSpaceId,
          ),
          canonicalHomeSpaceId: personalHomeSpaceId,
          title,
          content: content || '<p></p>',
          linkedFromNoteId,
          allowOffline: spaceId === personalHomeSpaceId,
        });
        const createdId = getNoteIdFromCreateResponse(res);
        if (createdId) {
          navigate({
            to: prototypeNoteRouteTo(),
            params: { noteId: noteParamSlug(createdId) },
            search: {
              ...PROTOTYPE_NOTE_LIST_NAV_SEARCH,
              space: spaceId === personalHomeSpaceId ? undefined : spaceId,
            },
          });
        }
      } catch (err) {
        alertCreateNoteFailure(err);
      }
    };

    window.addEventListener('openNewNotePanel', handler);
    return () => window.removeEventListener('openNewNotePanel', handler);
  }, [composeTargetSpaceId, contextSpaceId, personalHomeSpaceId, navigate]);

  const liveFolderLabelRef = useRef<string | null>(null);

  const resetComposeSessionState = useCallback(() => {
    liveFolderLabelRef.current = null;
    persistedDraftIdRef.current = null;
    adoptedComposeIdRef.current = null;
    setAdoptedComposeId(null);
    setComposePersistedNoteId(null);
    pendingComposeUrlReplaceRef.current = null;
    draftPersistPromiseRef.current = null;
    if (composeUrlIdleTimerRef.current) {
      clearTimeout(composeUrlIdleTimerRef.current);
      composeUrlIdleTimerRef.current = null;
    }
    clearNoteDraft(DRAFT_NOTE_ID);
    draftPersistRemountRef.current = { content: '' };
    setDraftPersistRemountTick((t) => t + 1);
  }, [setComposePersistedNoteId]);

  useEffect(() => {
    const prevEpoch = prevComposeSessionEpochRef.current;
    prevComposeSessionEpochRef.current = composeSessionEpoch;
    if (shouldResetComposeSessionOnEpochChange(prevEpoch, composeSessionEpoch)) {
      resetComposeSessionState();
    }
  }, [composeSessionEpoch, resetComposeSessionState]);

  const flushPendingComposeUrlReplace = useCallback(() => {
    const pending = pendingComposeUrlReplaceRef.current;
    if (!pending) return;
    pendingComposeUrlReplaceRef.current = null;
    if (composeUrlIdleTimerRef.current) {
      clearTimeout(composeUrlIdleTimerRef.current);
      composeUrlIdleTimerRef.current = null;
    }
    setComposePersistedNoteId(null);
    draftPersistRemountRef.current = { content: '' };
    setDraftPersistRemountTick((t) => t + 1);
    navigate({
      to: prototypeNoteRouteTo(),
      params: { noteId: pending.slug },
      search: {
        ...PROTOTYPE_NOTE_LIST_NAV_SEARCH,
        space:
          composeTargetSpaceId === personalHomeSpaceId
            ? undefined
            : composeTargetSpaceId || undefined,
      },
      replace: true,
    });
  }, [composeTargetSpaceId, navigate, personalHomeSpaceId, setComposePersistedNoteId]);

  const scheduleComposeUrlIdleReplace = useCallback(() => {
    if (!pendingComposeUrlReplaceRef.current) return;
    if (composeUrlIdleTimerRef.current) {
      clearTimeout(composeUrlIdleTimerRef.current);
    }
    composeUrlIdleTimerRef.current = setTimeout(() => {
      composeUrlIdleTimerRef.current = null;
      if (!isPrototypeNoteEditorFocused()) {
        flushPendingComposeUrlReplace();
      }
    }, COMPOSE_URL_IDLE_MS);
  }, [flushPendingComposeUrlReplace]);

  const onPrototypeFolderDisplayChange = useCallback(
    (chip: ReturnType<typeof noteFolderChipDisplayState>) => {
      liveFolderLabelRef.current = chip.label;
      const chipNoteId = adoptedComposeIdRef.current ?? noteId;
      setPrototypeFolderChip({ noteId: chipNoteId, ...chip });
    },
    [noteId, setPrototypeFolderChip],
  );

  useEffect(() => {
    const prevSlug = prevNoteSlugParamRef.current;
    prevNoteSlugParamRef.current = noteSlugParam;
    const adoptedId = adoptedComposeIdRef.current;
    const isComposeAdoption = isDraftComposeAdoptionTransition(prevSlug, noteSlugParam, adoptedId);

    draftPersistPromiseRef.current = null;

    if (isComposeAdoption) {
      setComposePersistedNoteId(null);
      draftPersistRemountRef.current = { content: '' };
      setDraftPersistRemountTick((t) => t + 1);
      return;
    }

    liveFolderLabelRef.current = null;
    persistedDraftIdRef.current = null;
    adoptedComposeIdRef.current = null;
    setAdoptedComposeId(null);
    setComposePersistedNoteId(null);
    pendingComposeUrlReplaceRef.current = null;
    if (composeUrlIdleTimerRef.current) {
      clearTimeout(composeUrlIdleTimerRef.current);
      composeUrlIdleTimerRef.current = null;
    }
    if (isPrototypeDraftNoteSlug(noteSlugParam)) {
      clearNoteDraft(DRAFT_NOTE_ID);
    }
  }, [noteSlugParam, setComposePersistedNoteId]);

  useEffect(() => {
    if (!isDraft) return undefined;
    const pane = notePaneRowElRef.current;
    if (!pane) return undefined;

    const onFocusOut = (e: FocusEvent) => {
      if (!pendingComposeUrlReplaceRef.current) return;
      const next = e.relatedTarget as Node | null;
      if (next && pane.contains(next)) return;
      requestAnimationFrame(() => {
        if (!isPrototypeNoteEditorFocused()) {
          flushPendingComposeUrlReplace();
        }
      });
    };

    const onComposeEdit = () => {
      if (pendingComposeUrlReplaceRef.current) {
        scheduleComposeUrlIdleReplace();
      }
    };

    pane.addEventListener('focusout', onFocusOut);
    pane.addEventListener('input', onComposeEdit, true);
    pane.addEventListener('keydown', onComposeEdit, true);
    return () => {
      pane.removeEventListener('focusout', onFocusOut);
      pane.removeEventListener('input', onComposeEdit, true);
      pane.removeEventListener('keydown', onComposeEdit, true);
    };
  }, [isDraft, flushPendingComposeUrlReplace, scheduleComposeUrlIdleReplace]);

  useEffect(() => {
    return () => {
      if (composeUrlIdleTimerRef.current) {
        clearTimeout(composeUrlIdleTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isDraft && adoptedComposeId && note && noteId === adoptedComposeId) {
      adoptedComposeIdRef.current = null;
      setAdoptedComposeId(null);
    }
  }, [isDraft, adoptedComposeId, note, noteId]);

  useEffect(() => {
    if (isDraft || !note) {
      if (!isDraft || !adoptedComposeIdRef.current) {
        setPrototypeFolderChip(null);
      }
      return;
    }
    if (isPrototypeNoteEditorFocused() && !note.collectionUserOverride) return;
    const serverChip = noteFolderChipDisplayState({
      primaryCollection: note.primaryCollection ?? null,
      secondaryCollections: note.secondaryCollections ?? [],
    });
    const live = liveFolderLabelRef.current;
    if (live && !serverChip.label) {
      setPrototypeFolderChip({ noteId, label: live, extraCount: 0, membershipLabels: live ? [live] : [] });
      return;
    }
    if (serverChip.label) {
      liveFolderLabelRef.current = null;
    }
    setPrototypeFolderChip({
      noteId,
      label: serverChip.label ?? live,
      extraCount: serverChip.label ? serverChip.extraCount : 0,
      membershipLabels: serverChip.label ? serverChip.membershipLabels : live ? [live] : [],
    });
  }, [
    isDraft,
    noteId,
    note?.primaryCollection,
    note?.secondaryCollections,
    note?.collectionUserOverride,
    setPrototypeFolderChip,
  ]);

  useEffect(() => {
    return () => {
      setPrototypeFolderChip(null);
    };
  }, [setPrototypeFolderChip]);

  useEffect(() => {
    return () => {
      setEditorChromeMode('hidden');
    };
  }, [setEditorChromeMode]);

  useEffect(() => {
    if (isDraft) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ noteId?: string; source?: string }>).detail;
      if (!detail?.noteId || String(detail.noteId) !== String(noteId)) return;
      // Autosave already patches the detail cache — refetching mid-edit resets editTitle.
      if (e.type === 'noteUpdated' && detail.source === 'autosave') return;
      queryClient.invalidateQueries({ queryKey: ['note', noteId] });
    };
    window.addEventListener('noteLockStateChanged', handler);
    window.addEventListener('noteUpdated', handler);
    return () => {
      window.removeEventListener('noteLockStateChanged', handler);
      window.removeEventListener('noteUpdated', handler);
    };
  }, [isDraft, noteId, queryClient]);

  const parentThread = useMemo(() => note?.threads?.[0], [note?.threads]);
  const parentThreadId = parentThread?.id ?? 'thread_unorganized';

  const isOnboardingReadonly = useMemo(
    () =>
      parentThreadId?.startsWith('thread_onboarding_') ||
      (note?.threads?.some((th) => th.id.startsWith('thread_onboarding_')) ?? false),
    [note?.threads, parentThreadId],
  );

  const readOnlyLikeScripture = isOnboardingReadonly;
  const foreignSharedAnnotationMode = isForeignSharedNote && !isOnboardingReadonly;
  const isEditable = !readOnlyInSharedSpace && !isOnboardingReadonly;

  const sharedOverlayPaperRef = useRef<HTMLDivElement>(null);
  const [sharedOverlayContainerEl, setSharedOverlayContainerEl] = useState<HTMLElement | null>(null);
  const [sharedOverlayEditor, setSharedOverlayEditor] = useState<{
    view?: { coordsAtPos: (pos: number) => DOMRect };
    state: { doc: Parameters<typeof resolveStudyThreadPmRange>[0] };
  } | null>(null);
  const refreshSharedAnnotations = useCallback(() => {
    if (!noteId || isDraft) return;
    void queryClient.invalidateQueries({ queryKey: ['note', noteId] });
  }, [queryClient, noteId, isDraft]);

  const noteAuthorUserId = note?.authorUserId ?? note?.userId ?? null;
  const noteAuthorDisplayName = note?.authorDisplayName ?? foreignNoteAuthor?.displayName ?? null;

  const overlayStudyThreads = useMemo(() => {
    const rows = (note?.studyThreads ?? []).filter((thread) => thread.anchorStatus !== 'detached');
    if (foreignSharedAnnotationMode) {
      return filterForeignNoteOverlayStudyThreads(rows, noteAuthorUserId);
    }
    return rows.filter(
      (t) =>
        t.isOwnHighlight === false ||
        (Boolean(t.userId) && Boolean(authUserId) && t.userId !== authUserId),
    );
  }, [note?.studyThreads, foreignSharedAnnotationMode, authUserId, noteAuthorUserId]);

  const sharedHighlightLayoutRevision = useMemo(() => {
    const threadKey = overlayStudyThreads.map((t) => t.id).join(',');
    const contentLen = note?.content?.length ?? 0;
    return `${contentLen}:${threadKey}:${note?.updatedAt ?? ''}`;
  }, [overlayStudyThreads, note?.content, note?.updatedAt]);

  const showSharedHighlightOverlay = useMemo(() => {
    // Persistent response overlays belong only to an explicit shared-space read.
    // My Home still exposes the same responses through Activity, never in-body.
    if (isDraft || isOnboardingReadonly || !contextSpaceId) return false;
    return filterOverlayStudyThreads(overlayStudyThreads).length > 0;
  }, [contextSpaceId, isDraft, isOnboardingReadonly, overlayStudyThreads]);

  const sharedOverlayPmRanges = useMemo(() => {
    if (!showSharedHighlightOverlay || !sharedOverlayEditor?.state?.doc) return [];
    const doc = sharedOverlayEditor.state.doc as Parameters<typeof resolveStudyThreadPmRange>[0];
    return filterOverlayStudyThreads(overlayStudyThreads)
      .map((entry) => resolveStudyThreadPmRange(doc, entry))
      .filter((range): range is { from: number; to: number } => range != null);
  }, [sharedOverlayEditor, overlayStudyThreads, showSharedHighlightOverlay]);

  const [highlightOpenRequest, setHighlightOpenRequest] = useState<{
    studyThreadEntryId: string;
    requestKey: string;
    metadata: ReturnType<typeof buildHighlightDockOpenMetadataFromStudyThread>;
    range: { from: number; to: number } | null;
  } | null>(null);

  const handleActivitySelectEntry = useCallback(
    (item: NoteActivityItem) => {
      const row = note?.studyThreads?.find((thread) => thread.id === item.id);
      const dockSource = row ? {
        ...row,
        detached: item.anchor.status === 'detached',
        isOwnHighlight: item.isSelf,
        authorDisplayName: item.actorDisplayName,
      } : {
        id: item.id,
        entryKind: item.entryKind,
        highlightAccentRaw: item.highlightAccentRaw,
        anchorTextSnapshot: item.anchor.quote,
        sourceSnippet: item.anchor.quote,
        focusTitle: item.focusTitle,
        miniNoteBody: item.miniNoteBody || item.notesBody,
        authorDisplayName: item.actorDisplayName,
        isOwnHighlight: item.isSelf,
        anchorLocation: item.anchor.start,
        anchorLength:
          item.anchor.start != null && item.anchor.end != null
            ? item.anchor.end - item.anchor.start
            : null,
        detached: item.anchor.status === 'detached',
      };
      let range: { from: number; to: number } | null = null;
      if (item.anchor.status !== 'detached' && sharedOverlayEditor?.state?.doc) {
        const doc = sharedOverlayEditor.state.doc as Parameters<typeof resolveStudyThreadPmRange>[0];
        const currentAnchorLength =
          item.anchor.start != null && item.anchor.end != null
            ? item.anchor.end - item.anchor.start
            : null;
        if (item.anchor.start != null && currentAnchorLength != null && currentAnchorLength > 0) {
          range = resolveStudyThreadPmRange(doc, {
            anchorLocation: item.anchor.start,
            anchorLength: currentAnchorLength,
            anchorTextSnapshot: item.anchor.quote,
            sourceSnippet: item.anchor.quote,
          });
        }
        if (!range && row) range = resolveStudyThreadPmRange(doc, row);
      }
      setHighlightOpenRequest({
        studyThreadEntryId: item.id,
        requestKey: `activity-${item.id}-${Date.now()}`,
        metadata: buildHighlightDockOpenMetadataFromStudyThread(dockSource),
        range,
      });
      setActiveActivityId(item.id);
    },
    [note?.studyThreads, sharedOverlayEditor],
  );

  const handleOverlaySelectEntry = useCallback(
    (entryId: string) => {
      const row = note?.studyThreads?.find((thread) => thread.id === entryId);
      if (!row) return;
      handleActivitySelectEntry({
        id: row.id,
        kind: row.entryKind === 'linkedNote' ? 'connection' : row.entryKind === 'miniNote' ? 'response' : 'highlight',
        entryKind: row.entryKind,
        actorDisplayName: row.authorDisplayName?.trim() || 'Member',
        actorUserId: row.userId ?? '',
        actorColor: row.authorColor ?? 'blue',
        actorFirstName: null,
        actorProfileImageUrl: null,
        isSelf: row.isOwnHighlight === true,
        timestamp: row.updatedAt ?? row.createdAt,
        subject: row.anchorQuote ?? row.anchorTextSnapshot ?? row.sourceSnippet ?? 'Highlighted passage',
        preview: row.miniNoteBody ?? row.notesBody ?? null,
        context: null,
        statusLabel: row.anchorStatus === 'detached' ? 'Passage changed' : null,
        highlightAccentRaw: row.highlightAccentRaw ?? 'warmAmber',
        focusTitle: row.focusTitle ?? '',
        notesBody: row.notesBody ?? '',
        miniNoteBody: row.miniNoteBody ?? '',
        anchor: {
          quote: row.anchorQuote ?? row.anchorTextSnapshot ?? row.sourceSnippet ?? null,
          prefixContext: row.anchorPrefixContext ?? '',
          suffixContext: row.anchorSuffixContext ?? '',
          status: row.anchorStatus ?? 'resolved',
          start: row.resolvedAnchorStart ?? row.anchorLocation,
          end:
            row.resolvedAnchorEnd ??
            (row.anchorLocation != null && row.anchorLength != null
              ? row.anchorLocation + row.anchorLength
              : null),
        },
      });
    },
    [handleActivitySelectEntry, note?.studyThreads],
  );

  useEffect(() => {
    if (
      !shouldUseNoteOnlyParentThreadCache(contextSpaceId) ||
      !parentThread?.id ||
      !noteId
    ) {
      return;
    }
    try {
      localStorage.setItem(`harvous-note-thread-${noteId}`, parentThread.id);
    } catch {
      /* ignore */
    }
    const tw = parentThread as { count?: number; spaceId?: string | null };
    try {
      localStorage.setItem(
        `harvous-note-thread-data-${noteId}`,
        JSON.stringify({
          id: parentThread.id,
          title: parentThread.title ?? '',
          noteCount: tw.count ?? 0,
          backgroundGradient: parentThread.backgroundGradient ?? '',
          spaceId: tw.spaceId ?? effectiveSpaceId,
        }),
      );
    } catch {
      /* ignore */
    }
  }, [contextSpaceId, noteId, parentThread, effectiveSpaceId]);

  const reprocessAttemptsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (isDraft || !note || isLoading || note.contentEncrypted) return;
    if (isPrototypeNoteEditorFocused()) return;
    const content = note.content ?? '';
    if (!content || typeof content !== 'string') return;
    if ((reprocessAttemptsRef.current.get(noteId) ?? 0) >= MAX_SCRIPTURE_REPROCESS_ATTEMPTS) return;

    const hasPills = content.includes('data-scripture-reference');
    const hasPendingPills = /data-note-id\s*=\s*["']pending["']/.test(content);
    if (hasPills && !hasPendingPills) return;

    const runReprocess = () => {
      // Count every attempt (including failures) toward the cap. We intentionally
      // do NOT reset on error — that's what previously let a persistent failure
      // loop on each refetch.
      const attempts = reprocessAttemptsRef.current;
      attempts.set(noteId, (attempts.get(noteId) ?? 0) + 1);
      const threads = note.threads ?? [];
      const parentThreadForApi = threads[0];
      const threadId = parentThreadForApi?.id ?? 'thread_unorganized';
      processScriptureMutation.mutate({ noteId, contentOverride: content, threadId });
    };

    if (hasPendingPills) {
      runReprocess();
      return;
    }

    const plainText = content
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const refs = detectScriptureReferences(plainText);
    if (refs.length === 0) return;
    runReprocess();
  }, [isDraft, note, noteId, isLoading, processScriptureMutation]);

  const persistDraftNote = useCallback(
    async (
      newTitle: string,
      newContent: string,
      collectionExtras?: NoteCollectionExtras,
    ): Promise<string | null> => {
      const scriptureVersion = getEffectiveDefaultTranslation();
      const spaceId = isDraft
        ? composeTargetSpaceId || effectiveSpaceIdRef.current
        : effectiveSpaceIdRef.current || composeTargetSpaceId;
      if (!spaceId) return null;
      const sharedContextSpaceId = sharedContextForSave(
        contextSpaceId,
        spaceId,
        personalHomeSpaceId,
      );
      const updatePersisted = async (id: string) => {
        const result = await updateNoteMutationRef.current.mutateAsync({
          noteId: id,
          title: newTitle,
          content: newContent,
          scriptureVersion,
          contextSpaceId: sharedContextSpaceId,
          ...(sharedContextSpaceId ? {} : (collectionExtras ?? {})),
        });
        if (sharedContextSpaceId) {
          await patchSharedOrganization(id, sharedContextSpaceId, collectionExtras);
        }
        return result;
      };

      if (persistedDraftIdRef.current) {
        await updatePersisted(persistedDraftIdRef.current);
        return persistedDraftIdRef.current;
      }
      if (draftPersistPromiseRef.current) {
        const createdId = await draftPersistPromiseRef.current;
        if (!createdId) return null;
        await updatePersisted(createdId);
        return createdId;
      }
      draftPersistPromiseRef.current = (async () => {
        try {
          const res = await createNoteMutationRef.current.mutateAsync({
            spaceId,
            contextSpaceId: sharedContextSpaceId,
            canonicalHomeSpaceId: personalHomeSpaceId,
            title: newTitle,
            content: newContent,
            threadId: resolvedComposeThreadIdRef.current ?? undefined,
            allowOffline: spaceId === personalHomeSpaceId,
          });
          const createdId = getNoteIdFromCreateResponse(res);
          if (!createdId) {
            throw new Error('Create succeeded but response had no note id');
          }
          persistedDraftIdRef.current = createdId;
          adoptedComposeIdRef.current = createdId;
          setAdoptedComposeId(createdId);
          setComposePersistedNoteId(createdId);
          clearNoteDraft(DRAFT_NOTE_ID);
          if (collectionExtras && Object.keys(collectionExtras).length > 0) {
            if (sharedContextSpaceId) {
              await patchSharedOrganization(
                createdId,
                sharedContextSpaceId,
                collectionExtras,
              );
            } else {
              await updateNoteMutationRef.current.mutateAsync({
                noteId: createdId,
                title: newTitle,
                content: newContent,
                scriptureVersion,
                ...collectionExtras,
              });
            }
          }
          const chipForToolbar = noteFolderChipDisplayState({
            primaryCollection:
              collectionExtras?.primaryCollection ?? liveFolderLabelRef.current ?? null,
            secondaryCollections: collectionExtras?.secondaryCollections ?? [],
          });
          if (chipForToolbar.label) {
            setPrototypeFolderChip({ noteId: createdId, ...chipForToolbar });
          }
          pendingComposeUrlReplaceRef.current = {
            noteId: createdId,
            slug: noteParamSlug(createdId),
          };
          scheduleComposeUrlIdleReplace();
          return createdId;
        } catch (err) {
          alertCreateNoteFailure(err);
          throw err;
        } finally {
          draftPersistPromiseRef.current = null;
        }
      })();

      return draftPersistPromiseRef.current;
    },
    [
      composeTargetSpaceId,
      contextSpaceId,
      isDraft,
      patchSharedOrganization,
      personalHomeSpaceId,
      scheduleComposeUrlIdleReplace,
      setComposePersistedNoteId,
      setPrototypeFolderChip,
    ],
  );

  const handleNoteSave = useCallback(
    async (
      newTitle: string,
      newContent: string,
      collectionExtras?: NoteCollectionExtras,
      saveOptions?: { bumpUpdatedAt?: boolean },
    ) => {
      if (isEffectivelyEmptyPrototypeNote(newTitle, newContent)) {
        return;
      }
      if (isDraft) {
        const createdId = await persistDraftNote(newTitle, newContent, collectionExtras);
        return createdId ? { noteId: createdId } : undefined;
      }
      // Offline persistence (queue + materialize) is handled by useUpdateNote's runOfflineFirst
      // path below — no separate offline write here, which would double-queue the edit.
      const sharedContextSpaceId = contextSpaceId?.trim() || null;
      const result = await updateNoteMutationRef.current.mutateAsync({
        noteId,
        title: newTitle,
        content: newContent,
        scriptureVersion: getEffectiveDefaultTranslation(),
        contextSpaceId: sharedContextSpaceId,
        ...(sharedContextSpaceId ? {} : (collectionExtras ?? {})),
        ...(saveOptions?.bumpUpdatedAt === false ? { bumpUpdatedAt: false } : {}),
      });
      if (sharedContextSpaceId) {
        await patchSharedOrganization(
          noteId,
          sharedContextSpaceId,
          collectionExtras,
        );
      }
      return result;
    },
    [contextSpaceId, isDraft, noteId, patchSharedOrganization, persistDraftNote],
  );

  const handlePrototypeEditorUnmount = useCallback(
    (_snapshot: { noteId: string; title: string; content: string }) => {
      // Never auto-delete persisted notes on navigate-away. Empty notes stay hidden
      // in the sidebar; users delete explicitly via the menu.
    },
    [],
  );

  useEffect(() => {
    if (!noteId) return;

    (
      window as unknown as {
        noteSaveCallback?: (
          newTitle: string,
          newContent: string,
          collectionExtras?: {
            primaryCollection?: string | null;
            secondaryCollections?: string[];
            collectionPinned?: boolean;
            collectionUserOverride?: boolean;
          },
          saveOptions?: { bumpUpdatedAt?: boolean },
        ) => Promise<unknown>;
      }
    ).noteSaveCallback = handleNoteSave;

    return () => {
      delete (window as unknown as { noteSaveCallback?: unknown }).noteSaveCallback;
    };
  }, [noteId, handleNoteSave]);

  useEffect(() => {
    if (!inspectorOpen || !isMobileSidebar) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeInspector();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [inspectorOpen, isMobileSidebar, closeInspector]);

  useEffect(() => () => closeStudyThreadPopover(), [closeStudyThreadPopover]);

  const connectedNoteIds = useMemo(() => {
    if (!note) return [];
    return [
      ...(note.linkedFromNotes ?? []).map((n) => n.id),
      ...(note.linkedToNotes ?? []).map((n) => n.id),
    ];
  }, [note]);

  const studyThreadPopoverLayer =
    !isDraft && studyThreadPopoverOpen ? (
      <PrototypeStudyThreadPopover
        open={studyThreadPopoverOpen}
        onOpenChange={(open) => {
          if (!open) closeStudyThreadPopover();
        }}
        noteId={noteId}
        spaceId={effectiveSpaceId}
        connectedNoteIds={connectedNoteIds}
      />
    ) : null;

  /* Keep editor mounted when this
   * page instance just persisted a draft (note may still be seeding in React Query). */
  const keepEditorDuringPersistedDraftLoad = shouldKeepEditorDuringPersistedDraftLoad(
    isDraft,
    noteId,
    adoptedComposeId,
  );
  const noteLoadState = resolvePrototypeNoteLoadState({
    isDraft,
    isLoading,
    hasNote: Boolean(note),
    error: noteQueryError,
    keepEditor: keepEditorDuringPersistedDraftLoad,
  });
  if (noteLoadState === 'loading') {
    return (
      <>
        {studyThreadPopoverLayer}
        <PrototypeMainPaneShell>
          <div className="proto-editor-surface">
            <ProtoSpaceLoading label="Loading note" />
          </div>
        </PrototypeMainPaneShell>
      </>
    );
  }

  if (noteLoadState === 'error' || noteLoadState === 'not-found') {
    const notFound = noteLoadState === 'not-found';
    return (
      <>
        {studyThreadPopoverLayer}
        <PrototypeMainPaneShell>
          <div className="proto-editor-surface">
            <PrototypePaneEmptyState
              icon="circle-exclamation"
              title={notFound ? 'Note not found' : 'Couldn’t load note'}
              description={
                notFound
                  ? 'It may have been deleted, moved, or removed from this space.'
                  : 'Your current context is unchanged. Retry when you’re ready.'
              }
              role="alert"
              action={{
                label: 'Retry',
                onClick: () => {
                  void refetchNote();
                },
              }}
              secondaryAction={{
                label: 'Go to Home',
                onClick: () => {
                  void navigate({ to: prototypeHomeRouteTo() as any });
                },
              }}
            />
          </div>
        </PrototypeMainPaneShell>
      </>
    );
  }

  const useComposeEditorStub = isDraft && !!adoptedComposeId;

  const editorNote =
    useComposeEditorStub || isDraft || (!note && keepEditorDuringPersistedDraftLoad)
    ? {
        title: '',
        content: '',
        noteType: 'default' as const,
        version: undefined as number | undefined,
        resourceTitle: undefined as string | undefined,
        resourceDescription: undefined as string | undefined,
        resourceImage: undefined as string | undefined,
        resourceUrl: undefined as string | undefined,
        contentEncrypted: false,
        primaryCollection: null as string | null,
        secondaryCollections: [] as string[],
        collectionPinned: false,
        collectionUserOverride: false,
        collectionLastAutoUpdatedAt: null as string | null,
        createdAt: null as string | null,
        threads: [] as { id: string; title?: string; backgroundGradient?: string; count?: number; spaceId?: string | null }[],
      }
    : note!;

  const MONTHS_LONG = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const formattedDate = editorNote.createdAt
    ? (() => {
        const d = new Date(editorNote.createdAt!);
        return `${MONTHS_LONG[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
      })()
    : '';

  const prototypeDisplayTitle = stripServerAutoUntitledNoteTitleForDisplay(editorNote.title);

  // Stable key for the editor subtree. The draft route and the note it persists into
  // are ONE editing session, so they share a key — this prevents a destructive
  // CardFullEditable + TipTap remount mid-typing when /n/new → /n/<id>. A new
  // compose bumps composeSessionEpoch so distinct compose sessions never share an instance.
  const composeEditorKey = prototypeComposeEditorKey(DRAFT_NOTE_ID, composeSessionEpoch);
  const editorSessionKey = isDraft || !!adoptedComposeId ? composeEditorKey : noteId;

  const showInspectorDesktop = (inspectorOpen || inspectorExiting) && !isMobileSidebar;
  const showInspectorMobile = (inspectorOpen || inspectorExiting) && isMobileSidebar;
  // Only reserve editor space when the inspector actually renders. The desktop
  // inspector is gated on `!isDraft && note` below, so on a draft (a note with no
  // content yet) or before the note loads, reserving space shrinks the editor for
  // a panel that never appears — leaving a blank gap on the right.
  // Reserve (dock) only when: inspector open, on desktop (mobile uses a fixed
  // slide-over), and the pane is wide enough. When the pane is narrow the desktop
  // inspector stays mounted but floats over the editor as a quiet overlay.
  const inspectorReservesEditorSpace =
    inspectorOpen && !inspectorExiting && !isDraft && !!note && !isMobileSidebar && paneIsWide;

  const inspectorFloating =
    inspectorOpen &&
    !inspectorExiting &&
    !isDraft &&
    !!note &&
    !inspectorReservesEditorSpace &&
    (showInspectorDesktop || showInspectorMobile);

  const notePaneRowClass = [
    'proto-note-pane-row',
    inspectorReservesEditorSpace ? 'proto-note-pane-row--inspector-open' : '',
    inspectorFloating ? 'proto-note-pane-row--inspector-floating' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const rightPanelPortalTarget =
    typeof document !== 'undefined'
      ? document.querySelector('.proto-shell__right-panel-host') ??
        document.querySelector('.proto-shell') ??
        document.body
      : null;

  const desktopInspectorLayer =
    showInspectorDesktop && !isDraft && note && rightPanelPortalTarget
      ? createPortal(
          <div
            className={`proto-inspector-desktop${inspectorExiting ? ' proto-inspector-desktop--exiting' : ''}`}
            role="dialog"
            aria-label="Note details"
          >
            <PrototypeInspectorPane
              note={note}
              spaceId={effectiveSpaceId}
              contextSpaceId={contextSpaceId}
              sharedSpaceId={sharedActionSpaceId}
              noteAuthorUserId={noteAuthorUserId}
              noteAuthorDisplayName={noteAuthorDisplayName}
              onSelectActivity={handleActivitySelectEntry}
              activeActivityId={activeActivityId}
            />
          </div>,
          rightPanelPortalTarget,
        )
      : null;

  const mobileInspectorLayer =
    showInspectorMobile && !isDraft && note && typeof document !== 'undefined'
      ? createPortal(
          <>
            <div
              className="proto-inspector-mobile-backdrop"
              role="presentation"
              tabIndex={-1}
              onClick={closeInspector}
            />
            <div
              className={`proto-inspector-mobile-panel${inspectorExiting ? ' proto-inspector-mobile-panel--exiting' : ''}`}
              role="dialog"
              aria-label="Note details"
            >
              <PrototypeInspectorPane
                note={note}
                spaceId={effectiveSpaceId}
                contextSpaceId={contextSpaceId}
                sharedSpaceId={sharedActionSpaceId}
                noteAuthorUserId={noteAuthorUserId}
                noteAuthorDisplayName={noteAuthorDisplayName}
                onSelectActivity={handleActivitySelectEntry}
                activeActivityId={activeActivityId}
              />
            </div>
          </>,
          document.querySelector('.proto-shell') ?? document.body,
        )
      : null;

  return (
    <>
    {studyThreadPopoverLayer}
    <PrototypeMainPaneShell>
    <div
      ref={notePaneRowRef}
      className={notePaneRowClass}
      data-note-id={noteId}
      data-parent-thread-id={parentThreadId}
      data-parent-thread-title={parentThread?.title ?? ''}
      data-parent-thread-background-gradient={parentThread?.backgroundGradient ?? ''}
      data-parent-thread-count={String((parentThread as { count?: number })?.count ?? 0)}
      data-parent-thread-space-id={(parentThread as { spaceId?: string | null })?.spaceId ?? effectiveSpaceId}
    >
      {/* Editor column */}
      <div className="proto-editor-surface">
        <div className="proto-editor-scroll">
          <SubtleContentMount key={editorSessionKey} variant="fade">
            <div className="proto-editor-content-wrap">
              <div
                className="proto-editor-paper"
                ref={(el) => {
                  sharedOverlayPaperRef.current = el;
                  setSharedOverlayContainerEl(el);
                }}
              >
              {isForeignSharedNote ? (
                <PrototypeSharedNoteReadOnlyBanner
                  authorDisplayName={foreignNoteAuthor?.displayName ?? note?.authorDisplayName}
                  authorUserId={foreignNoteAuthor?.userId ?? note?.authorUserId ?? note?.userId}
                  authorFirstName={foreignNoteAuthor?.firstName}
                  authorProfileImageUrl={foreignNoteAuthor?.profileImageUrl}
                  authorColor={foreignNoteAuthor?.userColor}
                />
              ) : null}
              {showSharedHighlightOverlay ? (
                <SharedStudyHighlightOverlay
                  editor={sharedOverlayEditor}
                  containerEl={sharedOverlayContainerEl}
                  studyThreads={overlayStudyThreads}
                  layoutRevision={sharedHighlightLayoutRevision}
                  onSelectEntry={handleOverlaySelectEntry}
                />
              ) : null}
              {isDraft ? (
                <div className="proto-draft-destination-cue">
                  <span
                    className="proto-draft-destination-cue__status pds-caption"
                    role="status"
                    aria-live="polite"
                  >
                    {draftDestinationCue}
                  </span>
                  {composeThreadChip.state !== 'hidden' ? (
                    <button
                      type="button"
                      className={`proto-draft-destination-cue__chip${
                        composeThreadChip.state === 'active' ? ' proto-draft-destination-cue__chip--active' : ''
                      }`}
                      aria-pressed={composeThreadChip.state === 'active'}
                      aria-label={
                        composeThreadChip.state === 'active'
                          ? `Remove from ${composeThreadChip.threadTitle}`
                          : `Add to ${composeThreadChip.threadTitle}`
                      }
                      disabled={composeThreadToggleBusy}
                      onClick={toggleComposeThread}
                    >
                      <Icon
                        name={composeThreadChip.state === 'active' ? 'arrow-right-arrow-left' : 'plus'}
                        size={9}
                        aria-hidden
                      />
                      <span className="proto-draft-destination-cue__chip-label">
                        {composeThreadChip.state === 'active'
                          ? composeThreadChip.threadTitle
                          : `Add to ${composeThreadChip.threadTitle}`}
                      </span>
                      {composeThreadChip.state === 'active' ? <Icon name="xmark" size={9} aria-hidden /> : null}
                    </button>
                  ) : null}
                </div>
              ) : null}
              <CardFullEditable
                title={prototypeDisplayTitle}
                content={editorNote.content ?? ''}
                date={formattedDate}
                noteId={noteId}
                noteType={(editorNote.noteType || 'default') as 'default' | 'scripture' | 'resource'}
                version={typeof editorNote.version === 'string' ? editorNote.version : undefined}
                resourceTitle={editorNote.resourceTitle ?? undefined}
                resourceDescription={editorNote.resourceDescription ?? undefined}
                resourceImage={editorNote.resourceImage ?? undefined}
                resourceUrl={editorNote.resourceUrl ?? undefined}
                contentEncrypted={editorNote.contentEncrypted ?? false}
                isEditable={isEditable}
                onSave={handleNoteSave}
                onPrototypeEditorUnmount={handlePrototypeEditorUnmount}
                readOnlyLikeScripture={readOnlyLikeScripture}
                foreignSharedAnnotationMode={foreignSharedAnnotationMode}
                onSharedAnnotationCreated={noteInSharedSpace ? refreshSharedAnnotations : undefined}
                highlightOpenRequest={highlightOpenRequest}
                onHighlightOpenRequestConsumed={onHighlightOpenRequestConsumed}
                onActiveHighlightEntryChange={setActiveActivityId}
                sharedOverlayPmRanges={sharedOverlayPmRanges}
                onEditorInstanceReady={(editor) => {
                  setSharedOverlayEditor(editor as typeof sharedOverlayEditor);
                }}
                spaceId={effectiveSpaceId ?? undefined}
                mentionSource={readOnlyInSharedSpace ? undefined : mentionSource}
                onMentionPillClick={onMentionPillClick}
                contextSpaceId={contextSpaceId}
                editorChromeMode="prototypeNative"
                formatToolbarPortalTarget={formatToolbarHostEl}
                studyDockCarouselPortalTarget={studyDockCarouselHostEl}
                initialReferenceWord={initialReferenceWord || null}
                initialReferenceRequestKey={initialReferenceRequestKey}
                initialScriptureDock={initialScriptureDock}
                initialCrossRefTarget={initialCrossRefTarget}
                initialHighlightDock={initialHighlightDock}
                onHighlightDeepLinkHandoff={onHighlightDeepLinkHandoff}
                onScriptureDeepLinkHandoff={onScriptureDeepLinkHandoff}
                onReferenceDeepLinkHandoff={onReferenceDeepLinkHandoff}
                onScriptureDockUnresolved={onScriptureDockUnresolved}
                onPrototypeChromeModeChange={setEditorChromeMode}
                initialPrimaryCollection={editorNote.primaryCollection ?? null}
                initialSecondaryCollections={editorSecondaryCollections}
                initialCollectionPinned={editorNote.collectionPinned ?? false}
                initialCollectionUserOverride={editorNote.collectionUserOverride ?? false}
                initialCollectionLastAutoUpdatedAtIso={editorNote.collectionLastAutoUpdatedAt ?? null}
                onPrototypeFolderDisplayChange={onPrototypeFolderDisplayChange}
                prototypeNoteActionsChrome={true}
                alwaysEditing
                prototypeBodyMountId={editorSessionKey}
                prototypeDraftPersistRemount={draftPersistRemountRef.current}
                prototypeDraftPersistRemountTick={draftPersistRemountTick}
                noteCreatedAtIso={editorNote.createdAt ?? null}
              />
              </div>
            </div>
          </SubtleContentMount>
        </div>
      </div>

      {desktopInspectorLayer}
      {mobileInspectorLayer}

    </div>
    </PrototypeMainPaneShell>
    </>
  );
}

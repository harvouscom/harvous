import { stashComposeRestore } from '../../lib/compose-session-restore';
import { consumePendingNoteFocus } from '../../lib/pending-note-focus';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useRouter, useRouterState } from '@tanstack/react-router';
import { useAuth, useUser } from '@clerk/clerk-react';
import {
  matchPrototypeNoteId,
  prototypeHomeRouteTo,
  prototypeNoteRouteTo,
  prototypeReadRouteTo,
} from '@/lib/prototype-path';
import {
  normalizePrototypeApiSpaceId,
  toPrototypeSpaceSearchParam,
} from '../../utils/prototype-space-api-id';
import { useQueryClient } from '@tanstack/react-query';
import CardFullEditable from '../../../../src/components/react/CardFullEditable';
import SubtleContentMount from '@/components/react/SubtleContentMount';
import { detectScriptureReferences, parseScriptureReference } from '@/utils/scripture-detector';
import { buildNoteDockOrigin, readPaperStackDockPlacement } from './paper-stack-origins';
import { bibleChapterQueryOptions } from '../../hooks/queries/usePrototypeBibleChapter';
import { bookSlug } from '@/utils/bible-book-chapters';
import {
  getNoteIdFromCreateResponse,
  shouldUseNoteOnlyParentThreadCache,
  useNote,
  type NoteDetail,
} from '../../hooks/queries/useNote';
import { useProcessScriptureRefs } from '../../hooks/mutations/useProcessScriptureRefs';
import { useUpdateNote } from '../../hooks/mutations/useUpdateNote';
import { alertCreateNoteFailure, useCreateSimpleNote } from '../../hooks/mutations/useCreateSimpleNote';
import {
  spaceNoteOrganizationPatchFromCollectionExtras,
  usePatchSpaceNoteOrganization,
  type NoteCollectionExtras,
} from '../../hooks/mutations/usePatchSpaceNoteOrganization';
import { useShellPaneIsWide } from '../../layouts/use-shell-pane-wide';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { noteFolderChipDisplayState } from '@/utils/note-folder-display';
import { isEffectivelyEmptyPrototypeNote } from '@/utils/prototype-note-empty';
import PrototypeInspectorPane from './PrototypeInspectorPane';
import PrototypeStudyThreadPopover from './PrototypeStudyThreadPopover';
import PrototypeMainPaneShell from './PrototypeMainPaneShell';
import PrototypePaneEmptyState from './PrototypePaneEmptyState';
import ProtoSpaceLoading from './ProtoSpaceLoading';
import PrototypeNoteAudienceBar from './PrototypeNoteAudienceBar';
import {
  dismissPurpose,
  getComposePurpose,
  isPurposeDismissed,
  notePurposeModel,
  setComposePurpose,
} from '../../lib/compose-purpose';
import {
  noteAudienceLabel,
  resolveCoEditFollower,
  resolveNoteEditStatusVisibility,
  resolveSharedNoteEditStatus,
  type SharedNoteEditStatus,
} from '../../lib/note-audience';
import SharedStudyHighlightOverlay from './SharedStudyHighlightOverlay';
import { useActiveSpace } from '../../hooks/useActiveSpace';
import { useNavigation } from '../../hooks/queries/useNavigation';
import { useProfile } from '../../hooks/queries/useProfile';
import { useChurchStaffStatus } from '../../hooks/queries/useChurchStaffStatus';
import { useForeignSharedNote } from '../../hooks/useForeignSharedNote';
import { useNoteEditLease } from '@/hooks/useNoteEditLease';
import { resolveProfileFirstName } from '@/utils/nav-avatar-initials';
import { useNavigationSharedSpaceAccess } from '../../hooks/queries/useNavigation';
import type { ApplyableNoteTemplate } from '../../hooks/queries/useNoteTemplates';
import { useMentionSource } from './mention-picker-source';
import { threadClusterDrillSlug } from '@/utils/thread-cluster-bulk-actions';
import type { MentionKind, MentionPillClickPayload } from '@/components/react/mention-pill-types';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import { getEffectiveDefaultTranslation } from '@/utils/profile-cache';
import { buildHighlightDockOpenMetadataFromStudyThread } from '@/utils/study-dock-stack';
import {
  filterForeignNoteOverlayStudyThreads,
  filterOverlayStudyThreads,
  resolveStudyThreadPmRange,
} from '../../lib/shared-highlight-overlay';
import {
  isPrototypeInspectorNode,
  isPrototypeNoteEditorFocused,
  isPrototypeNoteSessionFocused,
} from '@/utils/prototype-editor-focused';
import { clearNoteDraft } from '@/utils/note-draft-store';
import {
  isAdoptedComposeSessionActive,
  isDraftComposeAdoptionTransition,
  prototypeComposeEditorKey,
  shouldKeepEditorDuringPersistedDraftLoad,
  shouldResetComposeSessionOnEpochChange,
} from '@/utils/prototype-draft-compose-session';
import {
  COMPOSE_URL_IDLE_MS,
  type PendingComposeUrlReplace,
} from '@/utils/prototype-compose-url';
import {
  isPrototypeDraftNoteSlug,
  noteParamSlug,
  normalizeNoteIdFromParam,
  PROTOTYPE_DRAFT_NOTE_SLUG,
} from './proto-route-slugs';
import { getComposeGroupThreadId } from '../../lib/compose-group-thread';
import { validComposeThreadSelection } from './PrototypeGroupStudyThreadPicker';
import { useSpaceGroupThreads } from '../../hooks/queries/useSpaceGroupThreads';
import { useLibrary, openLibraryFileItem } from '../../hooks/queries/useLibrary';
import { trackSessionNoteOpen } from '@/utils/session-xp-client';
import { trackNoteOpened } from '@/utils/analytics';
import { recordAudiencefulMilestoneOnce } from '@/utils/audienceful-milestones-client';
import type { NoteActivityItem } from '../../lib/shared-note-activity-list';
import { PROTOTYPE_NOTE_LIST_NAV_SEARCH } from '@/utils/prototype-sidebar-highlight-active';
import { api, APIError } from '../../lib/api';

const DRAFT_NOTE_ID = 'note_draft';
/** Stable identity so the epoch-mismatch fallback doesn't re-render on every pass. */
const EMPTY_LIVE_NOTE_SNAPSHOT = { epoch: -1, title: '', content: '' };
const EMPTY_NOTE_COLLECTIONS: string[] = [];

/**
 * Mention kinds offered inside a shared space.
 *
 * Every kind, including 'library' — a room's shelf is exactly what its members
 * may cite, and it is the thing that makes a resource *referenceable in study*
 * rather than a file to download. The picker sources it from
 * `GET /api/spaces/:spaceId/library` (membership-gated) and a personal shared
 * space, which has no shelf, simply gets an empty list.
 *
 * Kept as its own constant rather than passing `undefined` so the shared-space
 * contract stays explicit at the call site: this list is a decision about what a
 * room may point at, and the next kind added should have to be considered here.
 */
const SPACE_MENTION_KINDS: readonly MentionKind[] = ['note', 'thread', 'folder', 'library'];

/** Single source of truth for "is this draft landing in My Home" — the label and the
 *  audience-bar icon must agree, so both read this instead of re-deriving it. */
export function isDraftSaveDestinationHome(input: {
  targetSpaceId: string | null | undefined;
  homeSpaceId: string | null | undefined;
}): boolean {
  return !input.targetSpaceId || input.targetSpaceId === input.homeSpaceId;
}

export function draftSaveDestinationLabel(input: {
  targetSpaceId: string | null | undefined;
  homeSpaceId: string | null | undefined;
  targetSpaceTitle: string | null | undefined;
  threadTitle?: string | null;
}): string {
  if (isDraftSaveDestinationHome(input)) return 'Saving to My Home';
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

/**
 * The shared space the inspector's destructive action applies to — null for a My Home
 * read, which is what makes that action "Delete note" rather than "Remove from this space".
 *
 * Two rules, and no note data in either:
 *
 * 1. `?space=` names the space the note is being read *in*, but only a shared one counts.
 *    `?space=<My Home>` is still a Home read, and Home is the one place a note cannot be
 *    removed from.
 * 2. `foreignSharedSpaceId` applies only when the note really is foreign. It falls back to
 *    the note's own `spaceId`, so ungated it makes every shared note its own context —
 *    which is how a plain My Home read of a shared note came to offer "Remove from this
 *    space" with no space in view.
 *
 * Deliberately not the toolbar's `resolveNativeToolbarSharedContextId`: that also
 * intersects against `note.spaces` and fails closed while they load, which is right for a
 * menu but would make this value flip null → space after the first paint. The inspector
 * feeds it straight into `useNavigationSharedSpaceAccess`, and that transition is a
 * render loop.
 */
export function resolveInspectorSharedActionSpaceId(input: {
  /** `?space=`, already normalized to the `space_` form. */
  contextSpaceId: string | null | undefined;
  personalHomeSpaceId: string | null | undefined;
  isForeignSharedNote: boolean;
  foreignSharedSpaceId: string | null | undefined;
}): string | null {
  const context = normalizePrototypeApiSpaceId(input.contextSpaceId);
  const home = normalizePrototypeApiSpaceId(input.personalHomeSpaceId);
  if (context && context !== home) return context;
  if (input.isForeignSharedNote) return input.foreignSharedSpaceId?.trim() || null;
  return null;
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
  /**
   * Shell-hosted (not the `$noteId` route component): `useParams`/`useSearch` with
   * `strict: false` resolve the *nearest* match — the layout — which has no noteId.
   * Read identity from the location instead.
   * Select string primitives only — object literals from `select` re-render forever.
   */
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const initialReferenceWord = useRouterState({
    select: (s) => {
      const v = (s.location.search as Record<string, unknown>).reference;
      return typeof v === 'string' ? v : undefined;
    },
  });
  const initialScriptureRef = useRouterState({
    select: (s) => {
      const v = (s.location.search as Record<string, unknown>).scriptureRef;
      return typeof v === 'string' ? v : undefined;
    },
  });
  const initialScriptureTranslation = useRouterState({
    select: (s) => {
      const v = (s.location.search as Record<string, unknown>).scriptureTranslation;
      return typeof v === 'string' ? v : undefined;
    },
  });
  const initialStudyThread = useRouterState({
    select: (s) => {
      const v = (s.location.search as Record<string, unknown>).studyThread;
      return typeof v === 'string' ? v : undefined;
    },
  });
  const initialHighlightThread = useRouterState({
    select: (s) => {
      const v = (s.location.search as Record<string, unknown>).highlight;
      return typeof v === 'string' ? v : undefined;
    },
  });
  const initialLibraryItemId = useRouterState({
    select: (s) => {
      const v = (s.location.search as Record<string, unknown>).libItem;
      return typeof v === 'string' ? v : undefined;
    },
  });
  const dockReq = useRouterState({
    select: (s) => {
      const v = (s.location.search as Record<string, unknown>).dockReq;
      return typeof v === 'string' ? v : undefined;
    },
  });
  const initialCrossRefTargetSearch = useRouterState({
    select: (s) => {
      const v = (s.location.search as Record<string, unknown>).crossRefTarget;
      return typeof v === 'string' ? v : undefined;
    },
  });
  const spaceSearchParam = useRouterState({
    select: (s) => {
      const v = (s.location.search as Record<string, unknown>).space;
      return typeof v === 'string' || typeof v === 'number' ? String(v) : undefined;
    },
  });
  const {
    activeSpaceId: selectedSpaceId,
    inspectorOpen,
    inspectorExiting,
    isMobileSidebar,
    closeInspector,
    setPrototypeFolderChip,
    setComposePersistedNoteId,
    composeDraftActive,
    composeSeed,
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
    openInspector,
    setActiveSpaceId,
    setSidebarListMode,
    setSidebarThreadDrilldownId,
    setSidebarFolderDrilldown,
    setSidebarLayer,
    ensureSidebarExpanded,
    openDrawer,
    stackNote,
    paperStack,
    setStackNoteTitle,
  } = useProtoShell();
  const noteSlugFromPath = matchPrototypeNoteId(pathname);
  /**
   * A parked note has no note segment either: flipping the sheet down sends the URL to the
   * origin — a chapter, Home — while the note itself stays mounted below the fold. The shell
   * knows which note that is even though the address no longer says so, exactly as it does
   * for a compose draft.
   */
  const parkedNoteSlug =
    paperStack && !paperStack.open && paperStack.noteId
      ? noteParamSlug(paperStack.noteId)
      : null;
  // Compose-on-home has no note segment — treat as draft slug while the shell session is active.
  const noteSlugParam =
    noteSlugFromPath ?? parkedNoteSlug ?? (composeDraftActive ? PROTOTYPE_DRAFT_NOTE_SLUG : '');
  const isDraft =
    isPrototypeDraftNoteSlug(noteSlugParam) ||
    (!noteSlugFromPath && !parkedNoteSlug && composeDraftActive);
  const noteId = isDraft ? DRAFT_NOTE_ID : normalizeNoteIdFromParam(noteSlugParam);
  // URL uses bare ids (`?space=1785…`); APIs / shell expect `space_*`.
  const contextSpaceId = normalizePrototypeApiSpaceId(spaceSearchParam);
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
  const { homeSpaceId: personalHomeSpaceId } = useActiveSpace();
  const { data: nav } = useNavigation();
  const { userId: authUserId } = useAuth();
  const { user: clerkUser } = useUser();
  const navigate = useNavigate();

  const { data: note, isLoading, isError, error: noteQueryError, refetch: refetchNote } = useNote(
    isDraft ? '' : noteId,
    isDraft ? null : contextSpaceId,
  );
  // Two-pass by design: the lease needs to know whether this note is co-editable
  // (which comes from the note query), and read-only-ness needs to know whether we
  // hold the pen. Read the capability first, then feed the pen back in.
  const coEditProbe = useForeignSharedNote(isDraft ? null : noteId, isDraft ? null : contextSpaceId);
  const penSelf = useMemo(
    () => ({ displayName: resolveProfileFirstName(clerkUser, null) || 'Someone', color: 'blue' }),
    [clerkUser],
  );
  const pen = useNoteEditLease(isDraft ? null : noteId, penSelf, {
    // Only contend for the pen where it means something: an opted-in note this
    // viewer is actually allowed to write.
    enabled: coEditProbe.canCoEdit && !isDraft,
  });
  const {
    readOnlyInSharedSpace,
    isForeignSharedNote,
    noteInSharedSpace,
    effectiveSpaceId: foreignSharedSpaceId,
    foreignNoteAuthor,
    isCoEditable,
    canCoEdit,
    contributors: coEditContributors,
    coEditEnabledInContext,
    audienceScope,
    audience: noteAudience,
  } = useForeignSharedNote(isDraft ? null : noteId, isDraft ? null : contextSpaceId, {
    holdsPen: pen.holding,
    // Pen free → editable; first keystroke/selection claims (no Start editing).
    penFree: pen.leaseActive && pen.available,
  });

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

  // Deep-link to a resource chip (Resources list row → dock). Reads the cached
  // library the sidebar already loaded; a cold direct link fetches it once.
  const { data: libraryData } = useLibrary();
  const initialResourceDock = useMemo(() => {
    if (!initialLibraryItemId) return null;
    const item = libraryData?.items.find((i) => i.id === initialLibraryItemId);
    if (!item) return null;
    const isFile = item.kind === 'file';
    if (!isFile && !item.sourceUrl) return null;
    return {
      requestKey: dockReq ?? initialLibraryItemId,
      session: {
        libraryItemId: item.id,
        title: item.title,
        kind: isFile ? ('file' as const) : ('link' as const),
        // Files carry no durable URL — the chip signs one at click time.
        url: item.sourceUrl ?? '',
        domain: item.sourceDomain,
        fileName: item.fileName,
        fileMime: item.fileMime,
        fileBytes: item.fileBytes,
      },
    };
  }, [initialLibraryItemId, libraryData?.items, dockReq]);

  const editorSecondaryCollections = useMemo(() => {
    if (isDraft) return EMPTY_NOTE_COLLECTIONS;
    const secondaries = note?.secondaryCollections;
    return secondaries?.length ? secondaries : EMPTY_NOTE_COLLECTIONS;
  }, [isDraft, note?.secondaryCollections]);

  const queryClient = useQueryClient();
  const router = useRouter();
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
  // on every slug change), this survives the compose-on-home → /{id} swap so the editor
  // subtree key can stay stable across that single transition (no remount mid-typing).
  const [adoptedComposeId, setAdoptedComposeId] = useState<string | null>(null);
  const adoptedComposeIdRef = useRef<string | null>(null);
  const prevNoteSlugParamRef = useRef(noteSlugParam);
  const pendingComposeUrlReplaceRef = useRef<PendingComposeUrlReplace | null>(null);
  const composeUrlIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftPersistRemountRef = useRef<{ content: string } | null>(null);
  const [draftPersistRemountTick, setDraftPersistRemountTick] = useState(0);
  const processScriptureMutation = useProcessScriptureRefs();

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

  /**
   * Keep the space switcher and the open note in agreement.
   *
   * Switching spaces resolves a disagreement by closing the note (useSwitchToSpace);
   * opening a note resolves it by moving the switcher. Both directions preserve one
   * invariant: **if a note is on screen, the switcher names a space it belongs to.**
   * Without this, a deep link or a browser-back left the nav pointing at a space the
   * note isn't in — which is the ambiguity this whole change exists to remove.
   *
   * Uses setActiveSpaceId (silent) rather than switchToSpace on purpose: this is a
   * sync, not a navigation, and must never close the note it just landed on.
   */
  // Stable dep: setActiveSpaceId resets sidebar drill-downs unconditionally, so this
  // effect must not re-run on a fresh array identity every render.
  const noteAssociationKey = note?.spaces
    ? note.spaces.map((space) => space.id).sort().join(',')
    : null;
  /**
   * The `?space=` value this effect has already pushed into the switcher.
   *
   * Convergence guard. `useActiveSpace` clears any selection it cannot resolve against
   * nav rows, and it deliberately does not resolve the *personal* space (`type !==
   * 'personal'`). So for `?space=<My Home id>` — or any deleted/left space — the two
   * effects ping-ponged: this one asserted the id, that one cleared it, forever, until
   * React gave up with "Maximum update depth exceeded" and the route died.
   *
   * Asserting once per context value is enough to honour the URL, and it terminates
   * whether or not the id turns out to be resolvable. A later manual space switch is
   * then left alone, which is correct: `useSwitchToSpace` owns that direction and
   * re-stamps the URL itself.
   */
  const assertedContextSpaceRef = useRef<string | null>(null);
  useEffect(() => {
    if (isDraft) return;
    const normalizedActive = selectedSpaceId
      ? selectedSpaceId.startsWith('space_')
        ? selectedSpaceId
        : `space_${selectedSpaceId}`
      : null;

    // `?space=` names the context this note was opened in — follow it, once.
    if (contextSpaceId) {
      if (normalizedActive !== contextSpaceId && assertedContextSpaceRef.current !== contextSpaceId) {
        assertedContextSpaceRef.current = contextSpaceId;
        setActiveSpaceId(contextSpaceId);
      }
      return;
    }
    assertedContextSpaceRef.current = null;

    // No `?space=`: a Home read. Only correct the switcher once we positively know
    // the note has no association with the active space — never on unloaded data.
    if (!normalizedActive || noteAssociationKey === null) return;
    const home = personalHomeSpaceId
      ? personalHomeSpaceId.startsWith('space_')
        ? personalHomeSpaceId
        : `space_${personalHomeSpaceId}`
      : null;
    if (normalizedActive === home) return;
    const associated = noteAssociationKey
      .split(',')
      .filter(Boolean)
      .some((id) => (id.startsWith('space_') ? id : `space_${id}`) === normalizedActive);
    if (!associated) setActiveSpaceId(null);
  }, [
    isDraft,
    contextSpaceId,
    selectedSpaceId,
    noteAssociationKey,
    personalHomeSpaceId,
    setActiveSpaceId,
  ]);

  /**
   * Live editor text, stamped with the compose session that produced it.
   *
   * The stamp is checked at render time rather than the value being cleared in an effect.
   * `resetComposeSessionState` is a passive effect, which React commits *after* the
   * remounted editor's layout effect has already seeded its title from this value — so a
   * passive clear can never stop the previous note's title bleeding into a brand-new
   * compose. That leak is what put a finished note's title on a blank new note.
   */
  const [liveNoteSnapshotState, setLiveNoteSnapshotState] = useState({
    epoch: 0,
    title: '',
    content: '',
  });
  const composeSessionEpochRef = useRef(composeSessionEpoch);
  composeSessionEpochRef.current = composeSessionEpoch;
  const setLiveNoteSnapshot = useCallback((snapshot: { title: string; content: string }) => {
    setLiveNoteSnapshotState({ epoch: composeSessionEpochRef.current, ...snapshot });
  }, []);
  /**
   * True once the editor has reported content for *this* compose session. Distinct from "the
   * snapshot is empty": a user who deliberately clears a seeded note has a live snapshot that
   * happens to be blank, and must not have the seed handed back to them on the next render.
   */
  const hasLiveNoteSnapshot = liveNoteSnapshotState.epoch === composeSessionEpoch;
  const liveNoteSnapshot = hasLiveNoteSnapshot ? liveNoteSnapshotState : EMPTY_LIVE_NOTE_SNAPSHOT;
  /** persistDraftNote runs long after the click, outside this render — read the seed via a ref. */
  const composeSeedRef = useRef(composeSeed);
  composeSeedRef.current = composeSeed;
  const [templatePrefill, setTemplatePrefill] = useState<{
    title: string;
    content: string;
    noteType: string;
  } | null>(null);
  const [templateApplyEpoch, setTemplateApplyEpoch] = useState(0);
  const [templateProvenance, setTemplateProvenance] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const templateProvenanceRef = useRef<{ id: string; name: string } | null>(null);

  const handlePrototypeLiveChange = useCallback((snapshot: { title: string; content: string }) => {
    setLiveNoteSnapshot(snapshot);
  }, []);

  const handleApplyTemplate = useCallback((template: ApplyableNoteTemplate) => {
    const provenance = {
      id: template.id,
      name: template.name.trim() || 'Template',
    };
    templateProvenanceRef.current = provenance;
    setTemplateProvenance(provenance);
    setTemplatePrefill({
      title: template.title || '',
      content: template.content,
      noteType: template.noteType || 'default',
    });
    setTemplateApplyEpoch((n) => n + 1);
    setLiveNoteSnapshot({
      title: template.title || '',
      content: template.content,
    });
    // Persist after remount so template content isn't stuck behind the edit-guard.
    window.setTimeout(() => {
      const save = (window as Window & { noteSaveCallback?: (t: string, c: string) => unknown }).noteSaveCallback;
      if (typeof save === 'function') {
        void Promise.resolve(save(template.title || '', template.content));
      }
    }, 0);
  }, []);

  useEffect(() => {
    if (!isDraft && composeTargetSpaceIdOverride) {
      clearComposeTargetSpaceIdOverride();
    }
  }, [isDraft, composeTargetSpaceIdOverride, clearComposeTargetSpaceIdOverride]);

  // Shared-space drafts save to the compose target space. Thread attachment comes from
  // session selection (beginComposeInGroupThread) — no in-editor destination cue.
  const isSharedComposeTarget = isDraft && !!composeTargetSpaceId && composeTargetSpaceId !== personalHomeSpaceId;
  const composeGroupThreadsQuery = useSpaceGroupThreads(isSharedComposeTarget ? composeTargetSpaceId : undefined);
  const composeGroupThreads = composeGroupThreadsQuery.data ?? [];
  const [composeThreadSelection, setComposeThreadSelection] = useState<string | null>(() =>
    getComposeGroupThreadId(),
  );
  useEffect(() => {
    setComposeThreadSelection(getComposeGroupThreadId());
  }, [composeSessionEpoch]);
  const resolvedComposeThreadId = isSharedComposeTarget
    ? validComposeThreadSelection(composeThreadSelection, composeGroupThreads, composeGroupThreadsQuery.isLoading)
    : null;
  const resolvedComposeThreadIdRef = useRef(resolvedComposeThreadId);
  resolvedComposeThreadIdRef.current = resolvedComposeThreadId;

  /**
   * Where this draft will land, stated up front. `draftSaveDestinationLabel` has
   * existed (and been unit-tested) without ever being rendered, which is why "which
   * space is this going to?" had no answer until after saving.
   */
  const composeTargetTitle = useMemo(() => {
    if (!composeTargetSpaceId) return null;
    const match = [...(nav?.spaces ?? []), ...(nav?.memberOfSpaces ?? [])].find(
      (s) => (s.id.startsWith('space_') ? s.id : `space_${s.id}`) === composeTargetSpaceId,
    );
    return match?.title ?? null;
  }, [composeTargetSpaceId, nav?.spaces, nav?.memberOfSpaces]);

  const draftDestinationLabel = useMemo(
    () =>
      isDraft
        ? draftSaveDestinationLabel({
            targetSpaceId: composeTargetSpaceId,
            homeSpaceId: personalHomeSpaceId,
            targetSpaceTitle: composeTargetTitle,
            threadTitle: composeGroupThreads.find((t) => t.id === resolvedComposeThreadId)?.title,
          })
        : null,
    [
      isDraft,
      composeTargetSpaceId,
      personalHomeSpaceId,
      composeTargetTitle,
      composeGroupThreads,
      resolvedComposeThreadId,
    ],
  );

  const draftDestinationIsHome = useMemo(
    () => isDraftSaveDestinationHome({ targetSpaceId: composeTargetSpaceId, homeSpaceId: personalHomeSpaceId }),
    [composeTargetSpaceId, personalHomeSpaceId],
  );

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
      search: {
        ...PROTOTYPE_NOTE_LIST_NAV_SEARCH,
        space: toPrototypeSpaceSearchParam(contextSpaceId),
      },
      replace: true,
    });
  }, [navigate, noteSlugParam, initialHighlightThread, contextSpaceId]);

  const onScriptureDeepLinkHandoff = useCallback(() => {
    if (!initialScriptureRef) return;
    navigate({
      to: prototypeNoteRouteTo(),
      params: { noteId: noteSlugParam },
      search: {
        ...PROTOTYPE_NOTE_LIST_NAV_SEARCH,
        space: toPrototypeSpaceSearchParam(contextSpaceId),
      },
      replace: true,
    });
  }, [navigate, noteSlugParam, initialScriptureRef, contextSpaceId]);

  /**
   * Warm the reader while the dock is still open, not when the tap comes.
   *
   * Expanding a dock is a morph: the chapter is revealed out of the dock's own rectangle, at
   * full size, with nothing scaled. That only reads as one surface growing if the chapter is
   * *there* when the clip starts opening — and until now none of it existed yet. The route is
   * code-split, so the tap paid for a chunk import, and the chapter query started from cold,
   * so the pane's own 250ms empty state opened inside the clip. Two loads inside the one
   * animation that is supposed to hide that there was any.
   *
   * Both are idempotent and both are already-shared definitions — `bibleChapterQueryOptions`
   * is the same options object the reader's own hook uses, so this warms the entry it will
   * read rather than a second one beside it.
   */
  const warmReaderForPassage = useCallback(
    ({ reference, translation }: { reference: string; translation: string }) => {
      const parsed = parseScriptureReference(reference);
      if (!parsed?.book || !parsed.chapter) return;
      void router
        .preloadRoute({
          to: prototypeReadRouteTo(),
          params: { book: bookSlug(parsed.book), chapter: String(parsed.chapter) },
          // The route validates its search, so a preload without one is not the same route.
          search: { v: undefined, t: translation },
        })
        .catch(() => {});
      void queryClient
        .prefetchQuery(bibleChapterQueryOptions(parsed.book, parsed.chapter, translation))
        .catch(() => {});
    },
    [router, queryClient],
  );

  /**
   * A scripture dock expanding one step further, into the Bible reader.
   *
   * The reader stacks over this note as a sheet, the inverse of a note over the reader; the
   * edge above the chapter says this note's title, and tapping it collapses back to the note
   * with its dock reopened. `returnTo` is captured here, at expand time, and that is the
   * anchor rule: read three chapters on and collapse, and the dock comes back on the pill's
   * reference, because the reader never touches what was captured. A draft has no address to
   * return to, so it does not offer this.
   *
   * Declared up here with the other hooks, above the loading/not-found early returns — a hook
   * below them is skipped on the loading render and appears on the next, which React reports
   * as "rendered more hooks than during the previous render".
   */
  const handleExpandScriptureToReader = useCallback(
    ({ reference, translation }: { reference: string; translation: string }) => {
      if (isDraft || !noteId) return;
      const parsed = parseScriptureReference(reference);
      if (!parsed) return;
      const verseStart = Array.isArray(parsed.verse) ? parsed.verse[0] : parsed.verse;
      /*
       * Measure the card before anything moves, so the chapter can grow out of exactly where
       * the dock was rather than from a guess. Read now, in the click, because the dock is
       * unmounted by the navigation on the next line — a frame later there is nothing left
       * to measure. Absent (a keyboard path, a card mid-animation) simply means no morph.
       */
      const dockCard = document.querySelector('.study-dock-card');
      const rect = dockCard instanceof HTMLElement ? dockCard.getBoundingClientRect() : null;
      stackNote(
        buildNoteDockOrigin({
          noteId,
          noteTitle: liveNoteSnapshot.title || note?.title,
          reference,
          translation,
          spaceId: contextSpaceId,
          morphFrom:
            rect && rect.width > 0 && rect.height > 0
              ? {
                  top: Math.round(rect.top),
                  left: Math.round(rect.left),
                  width: Math.round(rect.width),
                  height: Math.round(rect.height),
                  dockPlacement: readPaperStackDockPlacement() ?? '',
                }
              : undefined,
        }),
        noteId,
      );
      void navigate({
        to: prototypeReadRouteTo(),
        params: { book: bookSlug(parsed.book), chapter: String(parsed.chapter) },
        search: { v: verseStart ? String(verseStart) : undefined, t: translation },
      });
    },
    [isDraft, noteId, liveNoteSnapshot.title, note?.title, contextSpaceId, stackNote, navigate],
  );


  /**
   * Tell the shell what to call this note on the parked edge.
   *
   * Live rather than captured when the stack is made: a compose draft started from the
   * reader has no title yet, and the one you type a moment later is exactly the title the
   * edge should carry. Skipped for a `noteDock` stack, where the note is the origin and
   * already labelled, and skipped when the stack holds a different note than this page.
   *
   * Up here with the other hooks, ABOVE the loading and not-found returns further down.
   * This sat below them and crashed the page: a loading render stopped before it, the
   * loaded render ran it, and React counted more hooks the second time. The title it reads
   * is the same pair the dock expansion uses — the live snapshot, then the fetched note —
   * because the editor's own display title is not built until after those returns, and
   * reaching for it is what put this in the wrong place to begin with. Stripping the
   * server's auto-untitled name happens where the label is drawn, not here.
   */
  const stackedNoteTitle = liveNoteSnapshot.title || note?.title || '';
  useEffect(() => {
    if (!paperStack || paperStack.origin.kind === 'noteDock') return;
    if (paperStack.noteId && paperStack.noteId !== noteId) return;
    setStackNoteTitle(stackedNoteTitle);
  }, [paperStack, noteId, stackedNoteTitle, setStackNoteTitle]);

  const onReferenceDeepLinkHandoff = useCallback(() => {
    if (!initialReferenceWord) return;
    navigate({
      to: prototypeNoteRouteTo(),
      params: { noteId: noteSlugParam },
      search: {
        ...PROTOTYPE_NOTE_LIST_NAV_SEARCH,
        space: toPrototypeSpaceSearchParam(contextSpaceId),
      },
      replace: true,
    });
  }, [navigate, noteSlugParam, initialReferenceWord, contextSpaceId]);

  // Scripture highlight whose parent note has no matching pill: fall back to the standalone passage
  // pane (focused on the thread) so the tap never silently lands on "just the note".
  const onScriptureDockUnresolved = useCallback(() => {
    if (!initialScriptureRef) return;
    navigate({ to: prototypeHomeRouteTo() });
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

  // Dock the inspector side-by-side only when the pane is wide enough to seat the
  // editor (max 720px content) beside it (~268px reserve); otherwise let it float over
  // the editor as a quiet overlay. The reader asks the same question of the same pane,
  // so the measurement lives in one hook — see its comment for why it is the pane's
  // border box and not this row.
  const notePaneRowElRef = useRef<HTMLDivElement | null>(null);
  const paneIsWide = useShellPaneIsWide();

  const notePaneRowRef = useCallback((node: HTMLDivElement | null) => {
    notePaneRowElRef.current = node;
  }, []);

  useEffect(() => {
    dismissStandaloneScripturePassage();
  }, [dismissStandaloneScripturePassage]);

  useEffect(() => {
    const onDeleted = (e: Event) => {
      const deletedId = (e as CustomEvent<{ noteId?: string }>).detail?.noteId;
      if (deletedId && deletedId === noteId) {
        navigate({ to: prototypeHomeRouteTo(), replace: true });
      }
    };
    window.addEventListener('noteDeleted', onDeleted);
    return () => window.removeEventListener('noteDeleted', onDeleted);
  }, [noteId, navigate]);

  useEffect(() => {
    if (isDraft || isLoading || isError || !note) return;
    trackSessionNoteOpen(noteId);
    trackNoteOpened({
      noteId,
      spaceId: contextSpaceId || (typeof note.spaceId === 'string' ? note.spaceId : undefined),
    });
    recordAudiencefulMilestoneOnce('note_opened');
  }, [isDraft, isLoading, isError, note, noteId, contextSpaceId]);

  const resolvedSpaceFromNote =
    typeof note?.spaceId === 'string' && note.spaceId.trim().length > 0 ? note.spaceId : null;
  const resolvedSpaceFromThread = (note?.threads?.[0] as { spaceId?: string | null } | undefined)?.spaceId ?? null;

  const effectiveSpaceId = isDraft
    ? composeTargetSpaceId ?? ''
    : contextSpaceId ||
      foreignSharedSpaceId ||
      ((resolvedSpaceFromNote != null ? resolvedSpaceFromNote : resolvedSpaceFromThread) ?? composeTargetSpaceId ?? '');
  const templateSpaceId = isDraft ? composeTargetSpaceId : effectiveSpaceId;
  const templateSpaceAccess = useNavigationSharedSpaceAccess(
    templateSpaceId && templateSpaceId !== personalHomeSpaceId ? templateSpaceId : null,
  );
  const sharedActionSpaceId = resolveInspectorSharedActionSpaceId({
    contextSpaceId,
    personalHomeSpaceId,
    isForeignSharedNote,
    foreignSharedSpaceId,
  });
  const effectiveSpaceIdRef = useRef(effectiveSpaceId);
  effectiveSpaceIdRef.current = effectiveSpaceId;

  // @ mention pills: personal notes search across the user's own spaces; notes inside a
  // shared space are scoped to that space only so a pill can never point where other
  // members can't follow. Omitted entirely (no typeahead) for read-only foreign notes.
  //
  // Library items are the sharpest case of that rule — they're owner-scoped, so a
  // shared-space note gets no Resources tab at all rather than one that mints
  // pills only the author can open.
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

      // Library pills dock a chip on the note you're reading rather than
      // navigating away — the resource is meant to sit beside the writing.
      if (payload.kind === 'library') {
        if (!noteSlugParam) return;
        navigate({
          to: prototypeNoteRouteTo(),
          params: { noteId: noteSlugParam },
          search: (prev: Record<string, unknown>) => ({
            ...prev,
            libItem: payload.entityId,
            dockReq: String(Date.now()),
          }),
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
      noteSlugParam,
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
              space:
                spaceId === personalHomeSpaceId
                  ? undefined
                  : toPrototypeSpaceSearchParam(spaceId),
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
    setTemplatePrefill(null);
    setTemplateApplyEpoch(0);
    templateProvenanceRef.current = null;
    setTemplateProvenance(null);
    // Belt-and-braces only. The epoch stamp on liveNoteSnapshotState is what actually
    // prevents the previous session's title leaking in — this effect runs too late.
    setLiveNoteSnapshot({ title: '', content: '' });
  }, [setComposePersistedNoteId, setLiveNoteSnapshot]);

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
            : toPrototypeSpaceSearchParam(composeTargetSpaceId),
      },
      replace: true,
    });
    // composeDraftActive clears in the shell when pathname leaves `/`.
  }, [composeTargetSpaceId, navigate, personalHomeSpaceId, setComposePersistedNoteId]);

  const scheduleComposeUrlIdleReplace = useCallback(() => {
    if (!pendingComposeUrlReplaceRef.current) return;
    if (composeUrlIdleTimerRef.current) {
      clearTimeout(composeUrlIdleTimerRef.current);
    }
    composeUrlIdleTimerRef.current = setTimeout(() => {
      composeUrlIdleTimerRef.current = null;
      // Inspector is portaled outside the note pane — keep draft URL while using it.
      if (!isPrototypeNoteSessionFocused()) {
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
      // The URL caught up with a compose that already persisted, so nothing under the
      // shared compose key is unsaved any more. Leaving it behind is what let a finished
      // note reappear inside an unrelated later compose. Safe to drop here: the editor
      // instance survives adoption holding the live body, and any further edit re-drafts
      // under the real note id (see resolveNoteDraftWriteKey).
      clearNoteDraft(DRAFT_NOTE_ID);
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
      if (isPrototypeInspectorNode(next)) return;
      requestAnimationFrame(() => {
        if (!isPrototypeNoteSessionFocused()) {
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
    if (isDraft || !adoptedComposeId) return;
    // Normal end of a compose session: we landed on the adopted note and it loaded.
    // Also clear when the URL moved to a *different* note — the session is over either
    // way, and leaving the id set would pin editorSessionKey to the compose mount for
    // every subsequent note (stale body until a reload).
    if (noteId !== adoptedComposeId || note) {
      adoptedComposeIdRef.current = null;
      setAdoptedComposeId(null);
    }
  }, [isDraft, adoptedComposeId, note, noteId]);

  useEffect(() => {
    if (isDraft || !note) {
      // Keep the toolbar folder chip across compose persist → note query settle.
      if (adoptedComposeIdRef.current) return;
      setPrototypeFolderChip(null);
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
  // Holding the pen means normal editing, so annotation mode has to stand down —
  // it forces effectiveIsEditable false and would leave the holder unable to type.
  // A follower keeps it: read the live text, highlight it, respond to it, as today.
  const foreignSharedAnnotationMode =
    isForeignSharedNote && !isOnboardingReadonly && readOnlyInSharedSpace;
  const isEditable = !readOnlyInSharedSpace && !isOnboardingReadonly;
  const isOwnNote = note?.isOwnNote === true;
  /**
   * Someone else holds the pen — TipTap follows live body updates and stays
   * non-editable. When the pen is free, allowed writers keep an editable editor
   * and claim by interacting (no Start editing button).
   */
  const coEditFollower = resolveCoEditFollower({
    coEditEnabledAnywhere: isCoEditable,
    isOnboardingReadonly,
    leaseActive: pen.leaseActive,
    penHeldByOther: Boolean(pen.heldBy),
    isOwnNote,
    canCoEdit,
  });

  const onCoEditEditorActivity = useCallback(() => {
    if (!isCoEditable || !pen.leaseActive || pen.heldBy) return;
    pen.noteUserActivity();
  }, [isCoEditable, pen.leaseActive, pen.heldBy, pen.noteUserActivity]);

  const onCoEditEditorBlur = useCallback(() => {
    if (!pen.leaseActive || !pen.holding) return;
    pen.noteEditorBlur();
  }, [pen.leaseActive, pen.holding, pen.noteEditorBlur]);

  const sharedNoteEditStatus = useMemo(
    (): SharedNoteEditStatus =>
      resolveSharedNoteEditStatus({
        scope: audienceScope,
        coEditEnabledInContext,
        isOwnNote,
        canCoEdit,
        penHolding: pen.holding,
        penHeldByName: pen.heldBy?.displayName ?? null,
        penHasConnected: pen.hasConnected,
        penDisconnected: pen.disconnected,
      }),
    [
      coEditEnabledInContext,
      audienceScope,
      pen.holding,
      pen.heldBy,
      pen.disconnected,
      pen.hasConnected,
      isOwnNote,
      canCoEdit,
    ],
  );

  /**
   * Quiet in Home, loud on conflict. `isFollower`/`penHeldByOther` force `loud`
   * even in Home — coEditFollower below has already made the editor non-editable,
   * and a locked editor with no visible reason is worse than the noise we're cutting.
   */
  /*
    What this note is for. Almost always nothing — a note is just a note.
    `purposeDismissals` exists only to re-render on dismiss; the durable answer
    lives in localStorage, keyed per note, because dismissing a hint is not a
    fact anyone else needs.
  */
  const [purposeDismissals, setPurposeDismissals] = useState(0);
  const composePurpose = useMemo(
    () => (isDraft || composeDraftActive ? getComposePurpose() : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isDraft, composeDraftActive, purposeDismissals],
  );
  const notePurpose = useMemo(
    () =>
      notePurposeModel({
        composePurpose,
        startedFromServiceTitle: note?.startedFromServiceTitle ?? null,
        // Which occasion the banner names — see notePurposeModel. A note born in a room
        // came from that room's "Coming up"; one in My Home came from "This Sunday".
        startedInChurchSpace: Boolean(
          resolvedSpaceFromNote &&
            personalHomeSpaceId &&
            normalizePrototypeApiSpaceId(resolvedSpaceFromNote) !==
              normalizePrototypeApiSpaceId(personalHomeSpaceId),
        ),
        /*
          Only name the sermon where the sermon is what you're doing.

          `contextSpaceId` is the room you are reading *through* (the `?space=` param); the
          note's own `spaceId` is where it lives. Reading a sermon note inside some other
          room's study means the sermon is provenance, not the current occasion — and the
          column that carries it is permanent, so without this the banner followed the note
          into every study it was ever added to.

          No context param means My Home's canonical view, which is where a "This Sunday"
          note belongs, so that still shows.
        */
        readingInStartedContext:
          !contextSpaceId ||
          !resolvedSpaceFromNote ||
          normalizePrototypeApiSpaceId(contextSpaceId) ===
            normalizePrototypeApiSpaceId(resolvedSpaceFromNote),
        dismissed: isPurposeDismissed(isDraft ? null : noteId),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      composePurpose,
      note?.startedFromServiceTitle,
      resolvedSpaceFromNote,
      contextSpaceId,
      personalHomeSpaceId,
      isDraft,
      noteId,
      purposeDismissals,
    ],
  );
  const handleDismissPurpose = useCallback(() => {
    dismissPurpose(isDraft ? null : noteId);
    /* A draft's purpose lives in sessionStorage, so clearing it *is* the
       dismissal; a saved note's is a localStorage key. Either way the memo
       above needs a reason to re-run. */
    if (isDraft) setComposePurpose(null);
    setPurposeDismissals((n) => n + 1);
  }, [isDraft, noteId]);

  const audienceBarMode = useMemo(
    () =>
      resolveNoteEditStatusVisibility({
        scope: audienceScope,
        coEditEnabledInContext,
        isForeignSharedNote,
        penHeldByOther: Boolean(pen.heldBy),
        isFollower: coEditFollower,
        isHolding: pen.holding,
        sharedCount: noteAudience.sharedSpaces.length,
        channelCount: noteAudience.channels.length,
      }),
    [
      audienceScope,
      coEditEnabledInContext,
      isForeignSharedNote,
      pen.heldBy,
      coEditFollower,
      pen.holding,
      noteAudience.sharedSpaces.length,
      noteAudience.channels.length,
    ],
  );

  const audienceLabel = useMemo(
    () =>
      noteAudienceLabel({
        sharedCount: noteAudience.sharedSpaces.length,
        channelCount: noteAudience.channels.length,
        firstSpaceTitle: noteAudience.sharedSpaces[0]?.title,
      }),
    [noteAudience.sharedSpaces, noteAudience.channels.length],
  );

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
  /** Bumped when the editor loses focus so a focus-bailed open-time reprocess can retry. */
  const [scriptureReprocessFocusTick, setScriptureReprocessFocusTick] = useState(0);

  useEffect(() => {
    if (isDraft || !note || isLoading || note.contentEncrypted) return;
    // Never process list-truncated HTML — that can persist a truncated body to the DB.
    if (note.__contentIsPreview) return;
    const content = note.content ?? '';
    if (!content || typeof content !== 'string') return;
    if ((reprocessAttemptsRef.current.get(noteId) ?? 0) >= MAX_SCRIPTURE_REPROCESS_ATTEMPTS) return;

    const hasPills = content.includes('data-scripture-reference');
    const hasPendingPills = /data-note-id\s*=\s*["']pending["']/.test(content);
    if (hasPills && !hasPendingPills) return;

    const needsPlainRefScan = !hasPills;
    let plainHasRefs = hasPendingPills;
    if (needsPlainRefScan) {
      const plainText = content
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      plainHasRefs = detectScriptureReferences(plainText).length > 0;
    }
    if (!hasPendingPills && !plainHasRefs) return;

    // Don't count focus-bail as an attempt — retry after the editor actually blurs.
    if (isPrototypeNoteEditorFocused()) {
      const onFocusOut = () => {
        // focusout fires before activeElement settles; check on the next frame.
        requestAnimationFrame(() => {
          if (!isPrototypeNoteEditorFocused()) {
            setScriptureReprocessFocusTick((t) => t + 1);
          }
        });
      };
      document.addEventListener('focusout', onFocusOut);
      return () => document.removeEventListener('focusout', onFocusOut);
    }

    // Count every attempt (including failures) toward the cap. We intentionally
    // do NOT reset on error — that's what previously let a persistent failure
    // loop on each refetch.
    const attempts = reprocessAttemptsRef.current;
    attempts.set(noteId, (attempts.get(noteId) ?? 0) + 1);
    const threads = note.threads ?? [];
    const parentThreadForApi = threads[0];
    const threadId = parentThreadForApi?.id ?? 'thread_unorganized';
    processScriptureMutation.mutate({ noteId, contentOverride: content, threadId });
  }, [isDraft, note, noteId, isLoading, processScriptureMutation, scriptureReprocessFocusTick]);

  const persistDraftNote = useCallback(
    async (
      newTitle: string,
      newContent: string,
      collectionExtras?: NoteCollectionExtras,
      /** Editor call-site tag; kept so the save trail can attribute draft-path saves. */
      originHint?: string,
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
      const provenanceExtras = {
        // Where the compose session came from, when it was started by something that knew —
        // a sermon starter, a template card. The persist happens well after the click that
        // carried this, so it has to ride the seed rather than the call stack.
        ...(composeSeedRef.current?.startedFromServiceId
          ? { startedFromServiceId: composeSeedRef.current.startedFromServiceId }
          : {}),
        ...(composeSeedRef.current?.startedFromServiceTitle
          ? { startedFromServiceTitle: composeSeedRef.current.startedFromServiceTitle }
          : {}),
        ...(composeSeedRef.current?.startedFromTemplateId
          ? {
              startedFromTemplateId: composeSeedRef.current.startedFromTemplateId,
              ...(composeSeedRef.current.startedFromTemplateName
                ? { startedFromTemplateName: composeSeedRef.current.startedFromTemplateName }
                : {}),
            }
          : {}),
        // A template applied in-session is the more specific signal, so it wins.
        ...(templateProvenanceRef.current
          ? {
              startedFromTemplateId: templateProvenanceRef.current.id,
              startedFromTemplateName: templateProvenanceRef.current.name,
            }
          : {}),
      };
      const updatePersisted = async (id: string) => {
        const result = await updateNoteMutationRef.current.mutateAsync({
          noteId: id,
          title: newTitle,
          content: newContent,
          // Preserve the editor mount's tag — the draft branch used to drop it, which
          // flattened two overlapping writers into one label in the save trail.
          saveOrigin: originHint ? `${originHint}>persist` : 'notepage-persist-existing',
          scriptureVersion,
          contextSpaceId: sharedContextSpaceId,
          ...(sharedContextSpaceId ? {} : (collectionExtras ?? {})),
          ...provenanceExtras,
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
            ...provenanceExtras,
            // Personal folder placement travels with the create. It used to be applied by
            // a second PUT immediately afterwards, which put two writers on a brand-new
            // note: that follow-up bumped the version while the editor's own autosave was
            // still holding the pre-update one, so the next save 409'd and surfaced as
            // "this note changed somewhere else". It only ever reproduced with a scripture
            // reference because that is what makes folder auto-assign produce a folder at
            // all. Shared spaces keep organization on SpaceNotes — patched separately below.
            //
            // A seeded folder (a sermon series) is the starting point; anything the editor has
            // since resolved wins over it, hence the seed spreading first.
            ...(!sharedContextSpaceId && composeSeedRef.current?.primaryCollection
              ? {
                  primaryCollection: composeSeedRef.current.primaryCollection,
                  ...(composeSeedRef.current.collectionUserOverride
                    ? { collectionUserOverride: true }
                    : {}),
                }
              : {}),
            ...(!sharedContextSpaceId && collectionExtras ? collectionExtras : {}),
          });
          const createdId = getNoteIdFromCreateResponse(res);
          if (!createdId) {
            throw new Error('Create succeeded but response had no note id');
          }
          persistedDraftIdRef.current = createdId;
          adoptedComposeIdRef.current = createdId;
          setAdoptedComposeId(createdId);
          setComposePersistedNoteId(createdId);
          // The URL is still `/` until the idle replace, so a refresh right now would
          // lose the open note. Stash it; the shell setter clears this the moment the
          // URL catches up or the session resets.
          stashComposeRestore(
            createdId,
            composeTargetSpaceId === personalHomeSpaceId
              ? undefined
              : toPrototypeSpaceSearchParam(composeTargetSpaceId) ?? undefined,
          );
          clearNoteDraft(DRAFT_NOTE_ID);
          if (
            sharedContextSpaceId &&
            collectionExtras &&
            Object.keys(collectionExtras).length > 0
          ) {
            // Shared only: this writes SpaceNotes, not the canonical note, so it does not
            // move the note's version and cannot race the editor's autosave. The personal
            // equivalent is applied by the create above.
            await patchSharedOrganization(createdId, sharedContextSpaceId, collectionExtras);
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
      saveOptions?: { bumpUpdatedAt?: boolean; saveOrigin?: string },
    ) => {
      if (isEffectivelyEmptyPrototypeNote(newTitle, newContent)) {
        return;
      }
      if (isDraft) {
        const createdId = await persistDraftNote(
          newTitle,
          newContent,
          collectionExtras,
          saveOptions?.saveOrigin,
        );
        return createdId ? { noteId: createdId } : undefined;
      }
      // Offline persistence (queue + materialize) is handled by useUpdateNote's runOfflineFirst
      // path below — no separate offline write here, which would double-queue the edit.
      const sharedContextSpaceId = contextSpaceId?.trim() || null;
      const provenanceExtras = templateProvenanceRef.current
        ? {
            startedFromTemplateId: templateProvenanceRef.current.id,
            startedFromTemplateName: templateProvenanceRef.current.name,
          }
        : {};
      const result = await updateNoteMutationRef.current.mutateAsync({
        noteId,
        title: newTitle,
        content: newContent,
        scriptureVersion: getEffectiveDefaultTranslation(),
        contextSpaceId: sharedContextSpaceId,
        ...(sharedContextSpaceId ? {} : (collectionExtras ?? {})),
        ...(saveOptions?.bumpUpdatedAt === false ? { bumpUpdatedAt: false } : {}),
        ...(saveOptions?.saveOrigin ? { saveOrigin: saveOptions.saveOrigin } : {}),
        ...provenanceExtras,
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
          saveOptions?: { bumpUpdatedAt?: boolean; saveOrigin?: string },
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
  /*
    Church starters are authored from a note, so the capability has to reach the
    inspector. Server's verdict only — never re-derived from a role string here.

    Declared above the `noteLoadState` early returns below, and it has to stay there.
    These two are hooks (`useProfile` and `useChurchStaffStatus` are both react-query),
    and they used to sit further down beside the code that consumes them — so a render
    that bailed at `loading` ran fewer hooks than the render after the note arrived, and
    React threw "rendered more hooks than during the previous render" (#310) on every
    note open. Neither depends on the note; only on the viewer.
  */
  const profileForTemplates = useProfile();
  const churchOrgId = profileForTemplates.data?.connectedOrgId ?? null;
  const { can: canChurchForTemplates } = useChurchStaffStatus(churchOrgId);

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
                  void navigate({ to: prototypeHomeRouteTo() });
                },
              }}
            />
          </div>
        </PrototypeMainPaneShell>
      </>
    );
  }

  const useComposeEditorStub = isDraft && !!adoptedComposeId;
  const usePersistedDraftStub =
    useComposeEditorStub || isDraft || (!note && keepEditorDuringPersistedDraftLoad);

  const editorNote = usePersistedDraftStub
    ? {
        // Prefer live typing / template over empty props so adoption doesn't blank TipTap.
        // The seed is only consulted before the editor has reported anything for this session —
        // it is what compose *opened* with, so a `hasLiveNoteSnapshot` check rather than a
        // truthiness check on the snapshot: clearing a seeded note leaves a live-but-blank
        // snapshot, and falling back to the seed there would type the passage back in.
        title: templatePrefill?.title ?? (hasLiveNoteSnapshot ? liveNoteSnapshot.title : composeSeed?.title ?? ''),
        content:
          templatePrefill?.content ??
          (hasLiveNoteSnapshot ? liveNoteSnapshot.content : composeSeed?.contentHtml ?? ''),
        noteType: (templatePrefill?.noteType || 'default') as 'default' | 'scripture' | 'resource',
        version: undefined as number | undefined,
        resourceTitle: undefined as string | undefined,
        resourceDescription: undefined as string | undefined,
        resourceImage: undefined as string | undefined,
        resourceUrl: undefined as string | undefined,
        contentEncrypted: false,
        primaryCollection: liveFolderLabelRef.current,
        secondaryCollections: [] as string[],
        collectionPinned: false,
        collectionUserOverride: false,
        collectionLastAutoUpdatedAt: null as string | null,
        createdAt: null as string | null,
        threads: [] as {
          id: string;
          title?: string;
          backgroundGradient?: string;
          count?: number;
          spaceId?: string | null;
        }[],
      }
    : templatePrefill
      ? {
          ...note!,
          title: templatePrefill.title,
          content: templatePrefill.content,
          noteType: templatePrefill.noteType || note!.noteType || 'default',
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
  // CardFullEditable + TipTap remount mid-typing when compose-on-home → /{id}. A new
  // compose bumps composeSessionEpoch so distinct compose sessions never share an instance.
  // templateApplyEpoch remounts after "Start from a template" so TipTap seeds the HTML.
  const composeEditorKey = prototypeComposeEditorKey(DRAFT_NOTE_ID, composeSessionEpoch);
  // Gate on the session still owning THIS note — `adoptedComposeId` alone would keep the
  // compose key after navigating to an unrelated note, so the editor never remounts.
  const composeSessionActive = isAdoptedComposeSessionActive(isDraft, noteId, adoptedComposeId);
  const editorSessionKey =
    (isDraft || composeSessionActive ? composeEditorKey : noteId) +
    (templateApplyEpoch > 0 ? `:tpl-${templateApplyEpoch}` : '');

  const noteIsEffectivelyEmpty = isEffectivelyEmptyPrototypeNote(
    liveNoteSnapshot.title || prototypeDisplayTitle,
    liveNoteSnapshot.content || editorNote.content,
  );
  const showTemplatesInInspector = !isForeignSharedNote && !readOnlyInSharedSpace && isEditable;
  const canAttachSpaceTemplate =
    !!templateSpaceAccess.access &&
    (templateSpaceAccess.access.isOwner || templateSpaceAccess.access.role === 'leader');
  const showSpaceAttachOption =
    !!templateSpaceId &&
    templateSpaceId !== personalHomeSpaceId &&
    (templateSpaceAccess.access?.space.type === 'shared' ||
      templateSpaceAccess.access?.space.type === 'public');

  const resolvedTemplateProvenance = templateProvenance
    ? templateProvenance
    : note?.startedFromTemplateId && note.startedFromTemplateName
      ? { id: note.startedFromTemplateId, name: note.startedFromTemplateName }
      : null;

  const canManageChurchTemplates = canChurchForTemplates('manage_templates');

  /*
    The note → plan door, for staff only.

    Gated on the server's `manage_teaching_plan` verdict — the same capability
    the planner's writes need, so a teacher who may read the plan is not offered
    a button that would 403. Draft notes are excluded: a plan row must point at
    a note that exists.

    Only for a note in the author's own home, never one being read inside a
    shared space: a sermon draft is private, and "add this to the church's plan"
    is not an offer to make about somebody else's note in somebody else's room.
  */
  const canManageChurchPlan = canChurchForTemplates('manage_teaching_plan');
  const inspectorTeachingPlan =
    canManageChurchPlan && churchOrgId && !isDraft && noteId && !sharedActionSpaceId
      ? {
          noteId,
          noteTitle: liveNoteSnapshot.title || prototypeDisplayTitle,
          /* The note's first scripture reference, so a sermon written on
             Romans 8 lands on the plan already carrying its passage. Detected
             from the live text rather than stored: the note is being edited,
             and the plan should take what is actually in it. */
          reference:
            detectScriptureReferences(
              (liveNoteSnapshot.content || editorNote.content || '').replace(/<[^>]*>/g, ' '),
            )[0]?.reference ?? null,
          churchOrgId,
          plannedForServiceId: null,
        }
      : null;

  const inspectorTemplates = showTemplatesInInspector
    ? {
        spaceId: templateSpaceId,
        spaceTitle: showSpaceAttachOption
          ? templateSpaceAccess.access?.space.title?.trim() || null
          : null,
        canAttachToSpace: canAttachSpaceTemplate,
        showSpaceAttachOption,
        churchOrgId,
        canManageChurchTemplates,
        isEmpty: noteIsEffectivelyEmpty,
        liveTitle: liveNoteSnapshot.title || prototypeDisplayTitle,
        liveContent: liveNoteSnapshot.content || editorNote.content || '',
        noteType: typeof editorNote.noteType === 'string' ? editorNote.noteType : 'default',
        startedFromTemplateId: resolvedTemplateProvenance?.id ?? null,
        startedFromTemplateName: resolvedTemplateProvenance?.name ?? null,
        onApply: handleApplyTemplate,
        onTemplateProvenanceChange: (provenance) => {
          templateProvenanceRef.current = provenance;
          setTemplateProvenance(provenance);
          if (!isDraft && noteId) {
            void updateNoteMutationRef.current.mutateAsync({
              noteId,
              title: liveNoteSnapshot.title || prototypeDisplayTitle || '',
              content: liveNoteSnapshot.content || '',
              saveOrigin: 'notepage-template-provenance',
              scriptureVersion: getEffectiveDefaultTranslation(),
              contextSpaceId: contextSpaceId?.trim() || null,
              startedFromTemplateId: provenance.id,
              startedFromTemplateName: provenance.name,
              bumpUpdatedAt: false,
            });
          }
        },
      }
    : null;

  const draftInspectorNote: NoteDetail = {
    id: DRAFT_NOTE_ID,
    title: liveNoteSnapshot.title || prototypeDisplayTitle || '',
    content: liveNoteSnapshot.content || editorNote.content || '',
    noteType: typeof editorNote.noteType === 'string' ? editorNote.noteType : 'default',
    contentEncrypted: false,
    isPublic: false,
    isOwnNote: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    startedFromTemplateId: resolvedTemplateProvenance?.id ?? null,
    startedFromTemplateName: resolvedTemplateProvenance?.name ?? null,
    threads: [],
    tags: [],
  };

  // During compose → /{id} adoption, keep the draft inspector until the note query lands.
  // Scoped to the active session so an unrelated note still loading doesn't show the draft.
  const inspectorNote =
    isDraft || (!note && composeSessionActive) ? draftInspectorNote : note;

  /*
   * A parked note keeps its inspector to itself.
   *
   * When the sheet is flipped down the reader below is the page being read, and BOTH pages
   * are mounted — this one as the parked sheet, the route as the paper in front. Both portal
   * into the same right-panel host at the same coordinates, and this one, mounted second,
   * won: opening the inspector over a chapter showed the note's details. The inspector
   * belongs to whichever layer is in front, so a parked note does not offer one.
   */
  const parkedBehindReader = Boolean(paperStack && !paperStack.open && paperStack.noteId);
  const inspectorBelongsHere = (inspectorOpen || inspectorExiting) && !parkedBehindReader;

  const showInspectorDesktop = inspectorBelongsHere && !isMobileSidebar;
  const showInspectorMobile = inspectorBelongsHere && isMobileSidebar;
  // Reserve (dock) only when: inspector open, on desktop (mobile uses a fixed
  // slide-over), and the pane is wide enough. When the pane is narrow the desktop
  // inspector stays mounted but floats over the editor as a quiet overlay.
  // Drafts can open the inspector for Templates; they float (no dock reserve) so
  // the empty compose canvas stays full-width until the note persists.
  const inspectorReservesEditorSpace =
    inspectorOpen &&
    !parkedBehindReader &&
    !inspectorExiting &&
    !isDraft &&
    !!inspectorNote &&
    !isMobileSidebar &&
    paneIsWide;

  const inspectorFloating =
    inspectorOpen &&
    !inspectorExiting &&
    !!inspectorNote &&
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
    showInspectorDesktop && inspectorNote && rightPanelPortalTarget
      ? createPortal(
          <>
          {/* Floating only: the inspector is sitting on top of the editor, so a click
              on the note behind it dismisses — same gesture as the mobile slide-over.
              When it docks it owns its own column and must not eat editor clicks. */}
          {inspectorFloating ? (
            <div
              className="proto-inspector-desktop-backdrop"
              role="presentation"
              tabIndex={-1}
              onClick={closeInspector}
            />
          ) : null}
          <div
            className={`proto-inspector-desktop${inspectorExiting ? ' proto-inspector-desktop--exiting' : ''}`}
            role="dialog"
            aria-label="Note details"
          >
            <PrototypeInspectorPane
              note={inspectorNote}
              spaceId={effectiveSpaceId}
              contextSpaceId={contextSpaceId}
              sharedSpaceId={sharedActionSpaceId}
              noteAuthorUserId={noteAuthorUserId}
              noteAuthorDisplayName={noteAuthorDisplayName}
              onSelectActivity={handleActivitySelectEntry}
              activeActivityId={activeActivityId}
              isDraftCompose={isDraft}
              templates={inspectorTemplates}
              teachingPlan={inspectorTeachingPlan}
            />
          </div>
          </>,
          rightPanelPortalTarget,
        )
      : null;

  const mobileInspectorLayer =
    showInspectorMobile && inspectorNote && typeof document !== 'undefined'
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
                note={inspectorNote}
                spaceId={effectiveSpaceId}
                contextSpaceId={contextSpaceId}
                sharedSpaceId={sharedActionSpaceId}
                noteAuthorUserId={noteAuthorUserId}
                noteAuthorDisplayName={noteAuthorDisplayName}
                onSelectActivity={handleActivitySelectEntry}
                activeActivityId={activeActivityId}
                isDraftCompose={isDraft}
                templates={inspectorTemplates}
                teachingPlan={inspectorTeachingPlan}
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
              {/* Quiet "Shared with …" in My Home; the full pen banner inside a
                  shared space or the moment someone else starts writing. */}
              <PrototypeNoteAudienceBar
                mode={audienceBarMode}
                audienceLabel={audienceLabel}
                draftDestinationLabel={draftDestinationLabel}
                draftDestinationIsHome={draftDestinationIsHome}
                onOpenAudience={openInspector}
                authorDisplayName={foreignNoteAuthor?.displayName ?? note?.authorDisplayName}
                authorUserId={foreignNoteAuthor?.userId ?? note?.authorUserId ?? note?.userId}
                authorFirstName={foreignNoteAuthor?.firstName}
                authorProfileImageUrl={foreignNoteAuthor?.profileImageUrl}
                authorColor={foreignNoteAuthor?.userColor}
                isAuthorSelf={isOwnNote}
                status={sharedNoteEditStatus}
                onReleasePen={pen.release}
                purpose={notePurpose}
                onPurposeAction={openInspector}
                onDismissPurpose={handleDismissPurpose}
              />
              {showSharedHighlightOverlay ? (
                <SharedStudyHighlightOverlay
                  editor={sharedOverlayEditor}
                  containerEl={sharedOverlayContainerEl}
                  studyThreads={overlayStudyThreads}
                  layoutRevision={sharedHighlightLayoutRevision}
                  onSelectEntry={handleOverlaySelectEntry}
                />
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
                contentIsPreview={!!note?.__contentIsPreview}
                contentTruncated={!!note?.__contentTruncated}
                previewLength={note?.__previewLength}
                prototypeComposePersistedNoteId={adoptedComposeId}
                isEditable={isEditable}
                onSave={handleNoteSave}
                onPrototypeEditorUnmount={handlePrototypeEditorUnmount}
                onPrototypeLiveChange={handlePrototypeLiveChange}
                readOnlyLikeScripture={readOnlyLikeScripture}
                foreignSharedAnnotationMode={foreignSharedAnnotationMode}
                coEditFollower={coEditFollower}
                onCoEditEditorActivity={isCoEditable ? onCoEditEditorActivity : undefined}
                onCoEditEditorBlur={isCoEditable ? onCoEditEditorBlur : undefined}
                currentVersion={note?.currentVersion}
                onSharedAnnotationCreated={noteInSharedSpace ? refreshSharedAnnotations : undefined}
                highlightOpenRequest={highlightOpenRequest}
                onHighlightOpenRequestConsumed={onHighlightOpenRequestConsumed}
                onActiveHighlightEntryChange={setActiveActivityId}
                sharedOverlayPmRanges={sharedOverlayPmRanges}
                onEditorInstanceReady={(editor) => {
                  setSharedOverlayEditor(editor as typeof sharedOverlayEditor);
                  // Just created from "This Sunday" (or any future pre-filled
                  // starter): drop the caret on the empty line the starter left
                  // after the scripture pill, so you can type immediately
                  // instead of hunting for a cursor. One-shot and id-keyed.
                  if (consumePendingNoteFocus(noteId)) {
                    requestAnimationFrame(() => {
                      try {
                        (editor as { commands?: { focus?: (pos: string) => void } })?.commands?.focus?.('end');
                      } catch {
                        /* a missed caret is not worth breaking the editor over */
                      }
                    });
                  }
                }}
                spaceId={effectiveSpaceId ?? undefined}
                mentionSource={readOnlyInSharedSpace ? undefined : mentionSource}
                mentionKinds={noteInSharedSpace ? SPACE_MENTION_KINDS : undefined}
                onMentionPillClick={onMentionPillClick}
                contextSpaceId={contextSpaceId}
                editorChromeMode="prototypeNative"
                formatToolbarPortalTarget={formatToolbarHostEl}
                studyDockCarouselPortalTarget={studyDockCarouselHostEl}
                initialReferenceWord={initialReferenceWord || null}
                initialReferenceRequestKey={initialReferenceRequestKey}
                initialResourceDock={initialResourceDock}
                onOpenResourceFile={(libraryItemId) => void openLibraryFileItem(libraryItemId)}
                onExpandScriptureToReader={handleExpandScriptureToReader}
                onScripturePassageShown={warmReaderForPassage}
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

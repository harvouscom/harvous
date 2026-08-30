import DevModeBadge from '../components/DevModeBadge';
import PrototypePinPanels from '../pages/prototype/PrototypePinPanels';
import ReferralCreditInit from '../../../src/components/react/ReferralCreditInit';
import KeyboardShortcutsInit from '../../../src/components/react/KeyboardShortcutsInit';
import SyncManagerIsland from '../../../src/components/react/SyncManagerIsland';
import PrototypeSyncChip from '../components/PrototypeSyncChip';
import PrototypeAppUpdateToast from '../components/PrototypeAppUpdateToast';
import PrototypeFeedbackToast from '../components/PrototypeFeedbackToast';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { syncPassageKnowledge } from '../lib/passage-knowledge-sync';
import { useAuth, useUser } from '@clerk/clerk-react';
import { useQueryClient } from '@tanstack/react-query';
import { HARVOUS_REMOTE_SYNC_COMPLETED } from '@/utils/harvous-remote-sync-event';
import { refreshPrototypeLists } from '../lib/refresh-client-data';
import { Outlet, useRouter, useRouterState } from '@tanstack/react-router';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { useAuthReady } from '../hooks/useAuthReady';
import { api } from '../lib/api';
import NativeToolbar from '../pages/prototype/NativeToolbar';
import PrototypeSidebarToolbar from '../pages/prototype/PrototypeSidebarToolbar';
import PrototypeSidebar from '../pages/prototype/PrototypeSidebar';
/**
 * Lazy: most sessions never press ⇧K, and the palette pulls in `cmdk`. The shell owns the
 * open flag because something has to hear the shortcut while this module is unfetched.
 */
/*
 * The Library panel and everything it browses — off the critical path.
 *
 * It only exists once someone opens it, and its body pulls in the list views for all
 * five sections, so shipping it in the initial payload charges every route (sign-in
 * included) for a surface most sessions open second, not first.
 */
const PrototypeOrganizeCommandHost = lazy(
  () => import('../pages/prototype/PrototypeOrganizeCommandHost'),
);
const PrototypeLibraryPanelHost = lazy(
  () => import('../pages/prototype/library-panel/PrototypeLibraryPanelHost'),
);
import PrototypeSidebarSharedSpaceView from '../pages/prototype/PrototypeSidebarSharedSpaceView';
import PrototypeChurchHub from '../pages/prototype/PrototypeChurchHub';
import PrototypeAdminSidebar from '../pages/prototype/PrototypeAdminSidebar';
import PrototypeExpandedSidebarHost from '../pages/prototype/PrototypeExpandedSidebarHost';

import { cycleLibraryTab } from '../pages/prototype/library-panel/library-panel-view';
import { clearLibraryChipRect } from '../pages/prototype/library-panel/library-chip-rect';
import AdminToolbar from '@/components/react/AdminToolbar';
import PrototypeEditorChromeBar from '../pages/prototype/PrototypeEditorChromeBar';
import PrototypeNotePage from '../pages/prototype/PrototypeNotePage';
import PrototypePaperStack from '../pages/prototype/PrototypePaperStack';
import { resolvePaperStackAfterNavigation } from '../pages/prototype/paper-stack-teardown';
import {
  morphFromIfStillPlaced,
  noteDockReturnSearch,
  readPaperStackDockPlacement,
} from '../pages/prototype/paper-stack-origins';
import {
  notifyRecallCooldownChanged,
  recordRecallDismissed,
  restoreRecallOpportunity,
} from '../pages/prototype/proto-recall-cooldown';
import { recordRecallOpportunityEvent } from '../pages/prototype/proto-recall-events';
import {
  PROTO_PAPER_STACK_EXIT_MS,
  PROTO_RESOURCE_MORPH_MS,
} from './proto-motion';
import '../styles/prototype-tokens.css';
import '../styles/prototype-shell.css';
import '../styles/prototype-components.css';
import '../styles/prototype-editor.css';
import '../styles/prototype-route-overrides.css';
import { hasClerkSessionCookieHint } from '../hooks/queries/useProfile';
import { usePrototypeHomeSpaceId } from '../hooks/usePrototypeHomeSpaceId';
import { useWarmDefaultTranslationPack } from '../hooks/useWarmDefaultTranslationPack';
import { useShellModeNav } from '../hooks/useShellModeNav';
import { useActiveSpace } from '../hooks/useActiveSpace';
import { useSharedSpaceVisitStamp } from '../hooks/useSharedSpaceVisit';
import { resolvePrototypeSidebarVariant } from './resolve-prototype-sidebar-variant';
import { updateStudyDockExpandedMaxHeight } from '@/utils/study-dock-layout';
import { emitProtoViewportSettle } from '@/utils/proto-viewport-settle';
import { isPrototypeDraftNoteSlug, normalizeNoteIdFromParam } from '../pages/prototype/proto-route-slugs';
import { prototypeToolbarNoteDetailsAvailable } from '../pages/prototype/prototype-toolbar-note-details';
import { resolvePrototypeToolbarNoteId } from '@/utils/prototype-compose-url';
import { normalizePrototypeApiSpaceId } from '../utils/prototype-space-api-id';
import { useNote } from '../hooks/queries/useNote';
import { PROTO_LAST_SPACE_KEY } from './proto-session-keys';
import { ProtoMigrationProvider } from './proto-migration-context';
import { ProtoShellProvider, resolveVisibleComposeTarget, useProtoShell } from './proto-shell-context';
import { applyReadingPrefs, readReadingPrefs } from '../lib/proto-reading-prefs';
import { applyFontPrefs, readFontPrefs } from '../lib/proto-font-prefs';
import { consumePendingComposeSession } from '../lib/pending-compose-session';
import { consumeComposeRestore } from '../lib/compose-session-restore';
import { noteParamSlug } from '../pages/prototype/proto-route-slugs';
import { PROTOTYPE_NOTE_LIST_NAV_SEARCH } from '@/utils/prototype-sidebar-highlight-active';
import {
  applyBackgroundWithImageTint,
  applyColorSchemePreference,
  clearBackgroundVars,
  fetchAndHydrateAppearanceFromProfile,
  getColorSchemeSnapshot,
  initAppearanceAccountSync,
  PROTO_ROUTE_CLASS,
  readActiveBackground,
  readColorSchemePreference,
  subscribeColorScheme,
} from '../lib/prototype-background';
import {
  fetchAndHydrateOnboardingFromProfile,
  initOnboardingAccountSync,
} from '../lib/proto-onboarding-sync';
import {
  isPrototypeHomePath,
  isPrototypeNotePath,
  isPrototypeReadPath,
  isPrototypeAdminPath,
  isPrototypeSettingsPath,
  isPrototypeShellPath,
  matchPrototypeNoteId,
  prototypeLogicalPath,
  prototypeHomePath,
  prototypeHomeRouteTo,
  prototypeNoteRouteTo,
  prototypeReadRouteTo,
  prototypeSettingsRouteTo,
} from '@/lib/prototype-path';
import { bookFromSlug, bookSlug } from '@/utils/bible-book-chapters';
import {
  clearMainFreezeLayer,
  freezeMainInnerIntoLayer,
  FREEZE_MAIN_FOR_SETTINGS_EVENT,
} from '../lib/prototype-settings-main-keepalive';
import {
  computePrototypeShouldShowShell,
  shouldRedirectPrototypeToSignIn,
} from '@/utils/prototype-shell-auth';

export default function SimplifiedPrototypeLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const authReady = useAuthReady();
  const { user } = useUser();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchRaw = useRouterState({ select: (s) => s.location.search });
  const { homeSpaceId, navReady } = usePrototypeHomeSpaceId();
  const layoutRouter = useRouter();

  // Reopen a mid-compose note after a refresh. Compose keeps the URL at `/` until an
  // idle moment, so refreshing while typing lands on a blank Home even though the note
  // persisted seconds ago — the stash bridges exactly that window, and only that window:
  // it is cleared the moment the URL catches up or the compose session ends, dies with
  // the tab, and expires after an hour (see compose-session-restore).
  const composeRestoreAttemptedRef = useRef(false);
  useEffect(() => {
    if (composeRestoreAttemptedRef.current) return;
    if (!isSignedIn) return; // decide only once auth has settled; signed-out never restores
    composeRestoreAttemptedRef.current = true;
    if (!isPrototypeHomePath(pathname)) return; // a /{id} boot never lost the note
    const target = consumeComposeRestore();
    if (!target) return;
    layoutRouter.navigate({
      to: prototypeNoteRouteTo(),
      params: { noteId: noteParamSlug(target.noteId) },
      search: {
        ...PROTOTYPE_NOTE_LIST_NAV_SEARCH,
        ...(target.spaceParam ? { space: target.spaceParam } : {}),
      },
      replace: true,
    });
  }, [isSignedIn, pathname, layoutRouter]);
  const hasSessionCookie = hasClerkSessionCookieHint();

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    try {
      const path = `${pathname}${typeof searchRaw === 'string' ? searchRaw : ''}`;
      sessionStorage.setItem('harvous-prototype-return', path);
    } catch {
      /* ignore */
    }
  }, [isLoaded, isSignedIn, pathname, searchRaw]);

  const colorScheme = useSyncExternalStore(subscribeColorScheme, getColorSchemeSnapshot, () => 'light');

  useLayoutEffect(() => {
    const el = document.documentElement;
    applyColorSchemePreference(readColorSchemePreference());
    // Reading size/leading are CSS vars, so they must be on the root before the reader
    // paints — otherwise a large-text reader gets one frame at the default size.
    applyReadingPrefs(readReadingPrefs());
    applyFontPrefs(readFontPrefs());
    el.classList.add(PROTO_ROUTE_CLASS);
    void applyBackgroundWithImageTint(readActiveBackground());
    initAppearanceAccountSync();
    initOnboardingAccountSync();
    return () => {
      el.classList.remove(PROTO_ROUTE_CLASS);
      clearBackgroundVars();
      applyColorSchemePreference('system');
    };
  }, []);

  // Profile appearance / attendance need a session JWT — wait for useAuthReady (Bearer via api).
  useEffect(() => {
    if (!authReady) return;
    // One request, two consumers. Both read different fields off the same profile — letting
    // each fetch its own would double an authenticated round trip on every cold start.
    void (async () => {
      try {
        const profile = await api.get<{
          appearanceSettings?: string | null;
          onboardingState?: string | null;
        }>('/api/user/get-profile');
        void fetchAndHydrateAppearanceFromProfile(profile);
        void fetchAndHydrateOnboardingFromProfile(profile);
      } catch {
        /* offline or mid-auth — both sides keep their local caches */
      }
    })();
  }, [authReady]);

  useEffect(() => {
    if (!authReady) return;
    void api.post('/api/user/check-monthly-attendance').catch(() => {});
  }, [authReady]);

  useEffect(() => {
    void applyBackgroundWithImageTint(readActiveBackground());
  }, [colorScheme]);

  // Cookie hint is only for the pre-load window. Once Clerk has spoken, trust isSignedIn —
  // a stale __session / __client_uat must not trap the shell without redirecting to sign-in.
  useEffect(() => {
    if (!shouldRedirectPrototypeToSignIn(isLoaded, isSignedIn)) return;
    const path =
      typeof window !== 'undefined'
        ? `${window.location.pathname}${window.location.search || ''}`
        : prototypeHomePath();
    const redirectUrl = `/sign-in?redirect_url=${encodeURIComponent(path)}`;
    window.location.replace(redirectUrl);
  }, [isLoaded, isSignedIn]);

  const lastServiceWorkerNavCheckRef = useRef(0);
  const SW_UPDATE_CHECK_THROTTLE_MS = 90_000;

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    const now = Date.now();
    if (now - lastServiceWorkerNavCheckRef.current < SW_UPDATE_CHECK_THROTTLE_MS) return;
    lastServiceWorkerNavCheckRef.current = now;
    const check = window.__harvousCheckServiceWorkerUpdate;
    if (typeof check === 'function') check();
  }, [isLoaded, isSignedIn, pathname]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    if (!navReady || !homeSpaceId) return;
    const onMain = isPrototypeHomePath(pathname) || isPrototypeNotePath(pathname);
    if (!onMain) return;
    try {
      localStorage.setItem(PROTO_LAST_SPACE_KEY, homeSpaceId);
    } catch {
      /* ignore */
    }
  }, [isLoaded, isSignedIn, navReady, homeSpaceId, pathname]);

  // Cache the user's passage knowledge so folder/tag suggestions can use passage signals.
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user?.id) return;
    void syncPassageKnowledge(user.id);
  }, [isLoaded, isSignedIn, user?.id]);

  // Same idea as the cache above, for the Bible itself: complete the default translation's
  // offline pack in the background so it's there before a reader ever needs it, rather than
  // only once they happen to visit Settings > Translation.
  useWarmDefaultTranslationPack();

  // Optimistic shell only while Clerk is still loading (cookie hint avoids boot-canvas flash).
  // After isLoaded, require a real signed-in session — ignore stale cookie hints.
  const shouldShowShell = computePrototypeShouldShowShell(isLoaded, isSignedIn, hasSessionCookie);

  if (!shouldShowShell) {
    return <div className="proto-shell-frame simplified-prototype-root" aria-hidden="true" />;
  }

  return (
    <ProtoMigrationProvider>
      <ProtoShellProvider>
        <PrototypeAuthenticatedChrome userId={user?.id} />
      </ProtoShellProvider>
    </ProtoMigrationProvider>
  );
}

function PrototypeAuthenticatedChrome({ userId }: { userId?: string }) {
  const queryClient = useQueryClient();
  const chromeRouter = useRouter();
  const { homeSpaceId } = usePrototypeHomeSpaceId();
  const { isSharedSpace, activeSpaceId: resolvedActiveSpaceId } = useActiveSpace();
  useRealtimeSync(userId, { homeSpaceId, activeSpaceId: isSharedSpace ? resolvedActiveSpaceId : null });
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const {
    isMobileSidebar,
    drawerOpen,
    closeDrawer,
    desktopSidebarCollapsed,
    sidebarExiting,
    sidebarWidth,
    setSidebarWidth,
    persistSidebarWidth,
    sidebarWidthMin,
    sidebarWidthMax,
    inspectorOpen,
    hideSidebar,
    editorChromeMode,
    sidebarLayer,
    sidebarListSpaceScope,
    location,
    activeSpaceId: shellActiveSpaceId,
    activeChurchOrgId,
    composeDraftActive,
    paperStack,
    setStackSheetOpen,
    adoptStackNoteId,
    retargetStackOrigin,
    clearPaperStack,
    openDrawer,
    clearComposeDraftActive,
    beginPrototypeComposeSession,
    expandedSidebarTool,
    expandedSidebarExiting,
    libraryPanelView,
    libraryPanelExiting,
    closeExpandedSidebar,
  } = useProtoShell();
  /* Mounted through the exit animation, like every other prototype panel. */
  const expandedSidebarMounted = !hideSidebar && (Boolean(expandedSidebarTool) || expandedSidebarExiting);
  /* Not gated on `hideSidebar`: the panel is not the sidebar. It hangs off the toolbar,
     and the surfaces that hide the rail (share views, focused reads) still want a way
     to browse. */
  const libraryPanelMounted = Boolean(libraryPanelView) || libraryPanelExiting;
  // Stamp visit for dashboard and notes-list alike (survives layer toggles).
  useSharedSpaceVisitStamp(isSharedSpace ? (shellActiveSpaceId ?? resolvedActiveSpaceId) : null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const resizeHandleRef = useRef<HTMLDivElement | null>(null);
  const widthRef = useRef(sidebarWidth);
  const mainInnerRef = useRef<HTMLDivElement | null>(null);
  const settingsFreezeLayerRef = useRef<HTMLDivElement | null>(null);

  // Compat redirects (`/n/new`, `/new`) mark a pending session before landing on `/`.
  useEffect(() => {
    if (!consumePendingComposeSession()) return;
    beginPrototypeComposeSession();
  }, [pathname, beginPrototypeComposeSession]);

  // End compose-on-home only after leaving `/` (idle-replace to `/{id}`, settings, etc.).
  // Do not clear when compose starts on a note path before navigate-to-home lands.
  const prevPathnameForComposeRef = useRef(pathname);
  useEffect(() => {
    const prev = prevPathnameForComposeRef.current;
    prevPathnameForComposeRef.current = pathname;
    if (!composeDraftActive) return;
    if (isPrototypeHomePath(prev) && !isPrototypeHomePath(pathname)) {
      clearComposeDraftActive();
    }
  }, [pathname, composeDraftActive, clearComposeDraftActive]);

  // A compose draft started from the reader stays on `/read/...` until it saves, so the
  // editor has to mount there too — otherwise the sheet slides up empty.
  const isNoteRoute =
    isPrototypeNotePath(pathname) ||
    (composeDraftActive && (isPrototypeHomePath(pathname) || isPrototypeReadPath(pathname)));
  /**
   * Host the note editor in the shell (not the route Outlet) so compose-on-`/` →
   * `/{slug}` keeps one PrototypeNotePage instance — no TipTap/inspector remount flash.
   *
   * A parked note counts too. Flipping down sends the URL to the origin, and on a reader
   * origin that is `/read/...`, where the Outlet renders a chapter — so without this the
   * note the user parked was unmounted and replaced by a second copy of the reader already
   * showing behind it, and the band at the bottom said "Your note" over a chapter. Keeping
   * it hosted is also what the whole stack claims: the draft survives the flip.
   */
  const hostNoteInLayout =
    isNoteRoute || Boolean(paperStack && !paperStack.open && paperStack.noteId);

  /**
   * Does the stack still describe where we are?
   *
   * The stack is shell state, so nothing clears it for free — and for a while nothing
   * cleared it at all: once a note had been stacked over the reader, the reader stayed
   * mounted behind every route visited afterwards. The rules live in
   * `resolvePaperStackAfterNavigation` (pure, tested); this effect just applies the verdict
   * on every pathname change. It also adopts the note id when a compose draft saves, which
   * is the one navigation that must NOT read as "went to a different note".
   */
  useEffect(() => {
    if (!paperStack) return;
    /*
     * No compose exemption here, and that matters.
     *
     * There used to be one — skip the whole check while an unsaved compose draft had no note
     * id and the path was not a note. It was meant to say "a draft still sitting on the
     * origin's own path has not gone anywhere", but that is not what it tested: every path
     * that is not a note path matched it, so a draft started from the reader pinned the stack
     * to Settings, to Home, to everywhere, with the chapter still mounted behind them. That is
     * the phantom reader this effect exists to prevent, in a narrower disguise.
     *
     * The exemption was unnecessary as well as wrong. The resolver handles both halves of the
     * compose story itself, where they can be tested: it keeps a draft that is still on the
     * chapter it was started from, and ADOPTS a note path when the stack has no id — the save
     * navigation. Anything else really is somewhere the stack no longer describes.
     */
    const verdict = resolvePaperStackAfterNavigation(paperStack, pathname, {
      isNotePath: isPrototypeNotePath,
      noteIdAt: (p) => {
        const slug = matchPrototypeNoteId(p);
        if (!slug || isPrototypeDraftNoteSlug(slug)) return null;
        return normalizeNoteIdFromParam(slug);
      },
      isReadPath: isPrototypeReadPath,
      // Which chapter, not just "a chapter": the resolver needs to tell the origin's own
      // page (where a compose draft sits, having never navigated) from anywhere else.
      readTargetAt: (p) => {
        const m = /^\/read\/([^/]+)\/([^/]+)\/?$/.exec(prototypeLogicalPath(p));
        if (!m) return null;
        const chapter = Number.parseInt(m[2], 10);
        if (!Number.isFinite(chapter)) return null;
        return { book: bookFromSlug(decodeURIComponent(m[1])) ?? decodeURIComponent(m[1]), chapter };
      },
      isHomePath: isPrototypeHomePath,
    });
    if (verdict === 'clear') clearPaperStack();
    else if (verdict !== 'keep') adoptStackNoteId(verdict.adoptNoteId);
  }, [paperStack, pathname, clearPaperStack, adoptStackNoteId]);

  /*
   * A parked stack follows the reading.
   *
   * Flip a note down, read on to the next chapter, and the edge above you should say where
   * you now are — and flipping the note back up should leave you here rather than snapping
   * back three chapters. The capture-at-stack-time rule still holds while the note is UP,
   * which is what makes "read on and come back" work; parked is the other situation, where
   * the reader in front is the thing being done.
   */
  useEffect(() => {
    if (!paperStack || paperStack.open) return;
    if (paperStack.origin.kind !== 'reader') return;
    if (!isPrototypeReadPath(pathname)) return;
    const m = /^\/read\/([^/]+)\/([^/]+)\/?$/.exec(prototypeLogicalPath(pathname));
    if (!m) return;
    const slug = decodeURIComponent(m[1]);
    const book = bookFromSlug(slug) ?? slug;
    const chapter = Number.parseInt(m[2], 10);
    if (!Number.isFinite(chapter)) return;
    // The translation the reader is actually showing, from the address; falling back to the
    // one the origin was captured with, which is what a bare /read/... path inherits anyway.
    const t = new URLSearchParams(window.location.search).get('t');
    const translation =
      t || (paperStack.origin.base.type === 'reader' ? paperStack.origin.base.translation : '');
    retargetStackOrigin(
      { book, chapter, translation },
      {
        to: prototypeReadRouteTo(),
        params: { book: bookSlug(book), chapter: String(chapter) },
        search: { v: undefined, t: translation || undefined },
      },
    );
  }, [paperStack, pathname, retargetStackOrigin]);

  // Switching spaces can keep the same pathname; the origin belonged to the space you left.
  const prevStackSpaceRef = useRef(resolvedActiveSpaceId);
  useEffect(() => {
    const prev = prevStackSpaceRef.current;
    prevStackSpaceRef.current = resolvedActiveSpaceId;
    if (paperStack && prev && resolvedActiveSpaceId && prev !== resolvedActiveSpaceId) {
      clearPaperStack();
    }
  }, [resolvedActiveSpaceId, paperStack, clearPaperStack]);

  /**
   * Flip the sheet down and look at where you came from.
   *
   * The URL follows whichever paper is on top, so once a note has saved the address is
   * `/{noteId}` — leaving it there would show the origin under a note's URL, and a refresh
   * would reopen the note. Send the address to the origin's `returnTo`, captured when the
   * stack was made; the sheet stays mounted below the fold with the draft intact. The
   * sheet's own href is remembered so flipping back up can restore it.
   *
   * A `noteDock` origin does not flip — it collapses. The reader is the sheet there, and the
   * dock it expanded from is already the reader's parked form; parking the reader below the
   * note as well would be the same paper in two places. So the edge plays the reverse morph,
   * clears the stack, and returns to the note with a fresh dock nonce so the dock reopens.
   */
  const stackedNoteHrefRef = useRef<string | null>(null);
  const [paperStackExiting, setPaperStackExiting] = useState(false);
  const handleFlipSheetDown = useCallback(() => {
    const stack = paperStack;
    if (!stack) return;
    const { origin } = stack;

    if (origin.kind === 'noteDock') {
      if (paperStackExiting) return;
      setPaperStackExiting(true);
      window.setTimeout(() => {
        setPaperStackExiting(false);
        clearPaperStack();
        void chromeRouter.navigate({
          to: origin.returnTo.to,
          params: origin.returnTo.params ?? {},
          search: noteDockReturnSearch(origin),
        });
        // Held exactly as long as the animation that is playing, and the two are not the
        // same length: closing a clip back onto the dock's rect is the paper-stack move,
        // while the no-rect fallback is the shorter resource morph. Clearing early cuts the
        // chapter off mid-close; clearing late leaves a dead page on screen.
        // Same test the stack itself makes, so the hold matches the animation that is
        // actually playing rather than the one that was captured.
      }, morphFromIfStillPlaced(origin.morphFrom, readPaperStackDockPlacement())
        ? PROTO_PAPER_STACK_EXIT_MS
        : PROTO_RESOURCE_MORPH_MS);
      return;
    }

    const alreadyOnOrigin =
      origin.kind === 'reader' ? isPrototypeReadPath(pathname) : isPrototypeHomePath(pathname);
    stackedNoteHrefRef.current = alreadyOnOrigin ? null : pathname;
    setStackSheetOpen(false);
    // On a phone the Home cards live in the drawer, so flipping down to Home has to open it
    // or the flip lands on an empty pane with the reason you came nowhere in sight.
    if (origin.kind === 'homeCard' && isMobileSidebar) openDrawer();
    if (alreadyOnOrigin) return; // compose never left the origin
    void chromeRouter.navigate({
      to: origin.returnTo.to,
      params: origin.returnTo.params ?? {},
      search: origin.returnTo.search ?? {},
    });
  }, [
    paperStack,
    paperStackExiting,
    setStackSheetOpen,
    clearPaperStack,
    openDrawer,
    isMobileSidebar,
    pathname,
    chromeRouter,
  ]);

  /**
   * The two answers a suggestion's edge offers, beyond the plain × every edge has.
   *
   * Both end the stack, because both are decisions about the suggestion rather than about
   * the breadcrumb. They differ in where they leave you and in what they say about the row:
   * nevermind goes back to the shelf and puts it back on it, undoing the seven-day rest that
   * taking it wrote; ignore stays put and rests it for the full three weeks.
   *
   * Neither is on a timer. The whole reason these exist is that no rule can tell from
   * outside whether a suggestion landed.
   */
  const handleSuggestionNevermind = useCallback(() => {
    const stack = paperStack;
    const suggestion = stack?.origin.suggestion;
    if (!stack || !suggestion) return;
    /*
     * Posted as well as recorded locally, which the undo did not used to do.
     *
     * It mattered less when everything it undid expired on its own — a snooze restored on
     * only one device still came right everywhere in three weeks. "Not interested" has no
     * such backstop, so an undo the other devices never hear about would leave the mistake
     * standing on them forever.
     */
    recordRecallOpportunityEvent({
      opportunityId: suggestion.id,
      kind: suggestion.kind as never,
      action: 'restored',
    });
    restoreRecallOpportunity(homeSpaceId, suggestion.id);
    clearPaperStack();
    if (isMobileSidebar) openDrawer();
    void chromeRouter.navigate({
      to: stack.origin.returnTo.to,
      params: stack.origin.returnTo.params ?? {},
      search: stack.origin.returnTo.search ?? {},
    });
  }, [paperStack, homeSpaceId, clearPaperStack, isMobileSidebar, openDrawer, chromeRouter]);

  const handleSuggestionIgnore = useCallback(() => {
    const suggestion = paperStack?.origin.suggestion;
    if (!suggestion) return;
    recordRecallOpportunityEvent({
      opportunityId: suggestion.id,
      kind: suggestion.kind as never,
      action: 'dismissed',
    });
    recordRecallDismissed(homeSpaceId, suggestion.id);
    notifyRecallCooldownChanged();
    clearPaperStack();
  }, [paperStack, homeSpaceId, clearPaperStack]);

  const handleFlipSheetUp = useCallback(() => {
    setStackSheetOpen(true);
    const href = stackedNoteHrefRef.current;
    stackedNoteHrefRef.current = null;
    // An unsaved compose draft has no address of its own; it simply reappears.
    if (href) void chromeRouter.navigate({ to: href });
  }, [setStackSheetOpen, chromeRouter]);
  const isAdminRoute = isPrototypeAdminPath(pathname);
  const isSettingsRoute = isPrototypeSettingsPath(pathname);
  /** Desktop modal: keep last main paint under the settings portal. Mobile sheet keeps current Outlet. */
  const desktopSettingsKeepAlive = isSettingsRoute && !isMobileSidebar;
  /** Shell id is null on My Home / My Church hub; useActiveSpace remaps null → personal home. */
  const sidebarVariant = resolvePrototypeSidebarVariant({
    isAdminRoute,
    isSharedSpace,
    sidebarLayer,
    location,
  });
  const listScopeSpaceId =
    sidebarVariant === 'shared-list' && sidebarListSpaceScope === 'my-home' && homeSpaceId
      ? homeSpaceId
      : resolvedActiveSpaceId;
  // inspector is rendered inline in PrototypeNotePage (flex-row), no extra grid column needed
  void inspectorOpen;

  useEffect(() => {
    widthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  // Capture main-pane DOM before settings Outlet replaces home/note (see settings beforeLoad).
  useEffect(() => {
    const onFreeze = () => {
      if (isMobileSidebar) return;
      freezeMainInnerIntoLayer(mainInnerRef.current, settingsFreezeLayerRef.current);
    };
    document.addEventListener(FREEZE_MAIN_FOR_SETTINGS_EVENT, onFreeze);
    return () => document.removeEventListener(FREEZE_MAIN_FOR_SETTINGS_EVENT, onFreeze);
  }, [isMobileSidebar]);

  useEffect(() => {
    if (desktopSettingsKeepAlive) return;
    clearMainFreezeLayer(settingsFreezeLayerRef.current);
  }, [desktopSettingsKeepAlive]);

  useEffect(() => {
    if (!isNoteRoute) return;
    const track = document.querySelector<HTMLElement>(
      '.proto-shell__study-dock-layer .study-dock-carousel__track',
    );
    updateStudyDockExpandedMaxHeight(track);
  }, [isNoteRoute, sidebarWidth, desktopSidebarCollapsed, hideSidebar, editorChromeMode]);

  useEffect(() => {
    if (!userId) return;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const onRemoteSync = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void refreshPrototypeLists(queryClient, homeSpaceId);
      }, 600);
    };
    window.addEventListener(HARVOUS_REMOTE_SYNC_COMPLETED, onRemoteSync);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener(HARVOUS_REMOTE_SYNC_COMPLETED, onRemoteSync);
    };
  }, [userId, queryClient, homeSpaceId]);

  useEffect(() => {
    if (!userId) return;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (!isPrototypeShellPath(pathname)) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void refreshPrototypeLists(queryClient, homeSpaceId);
      }, 400);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId, pathname, queryClient, homeSpaceId]);

  // Mobile soft keyboard: shrink the shell frame to the visual viewport (above the keyboard)
  // so the in-flow editor chrome row (format toolbar) lands just above the keyboard, and hide
  // the study docks while typing. Scoped to note routes on the mobile breakpoint.
  useEffect(() => {
    if (!isNoteRoute) return undefined;
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return undefined;
    const mq = window.matchMedia('(max-width: 899px)');
    const root = document.documentElement;
    let settleTimers: ReturnType<typeof setTimeout>[] = [];
    // Last committed frame geometry. `apply()` re-runs several times per settle window and is
    // usually a no-op; only announce the passes that actually moved the chrome, so overlay
    // consumers don't re-measure three times for nothing. See utils/proto-viewport-settle.ts.
    let appliedGeometry: string | null = null;
    const announceGeometry = (next: string | null) => {
      if (appliedGeometry === next) return;
      appliedGeometry = next;
      emitProtoViewportSettle();
    };
    const clearSettleTimers = () => {
      settleTimers.forEach((t) => clearTimeout(t));
      settleTimers = [];
    };

    const pinPageScroll = () => {
      if (window.scrollY !== 0 || vv.offsetTop !== 0) {
        window.scrollTo(0, 0);
      }
    };

    /*
     * The lock itself is `data-proto-keyboard-open`, set in `apply()` below — that is the
     * attribute `prototype-shell.css` hangs `overflow: hidden` on. There used to be a second
     * attribute here, `data-proto-page-scroll-locked`, which no stylesheet ever read: it
     * looked like the mechanism while doing nothing, so anyone debugging a scroll problem
     * started at the wrong end. What these two functions actually contribute is the *pinning*
     * — iOS can still pan the visual viewport to chase the caret while document scroll is
     * held, and that pan is what leaves a white strip under the format bar.
     */
    const lockPageScroll = () => {
      pinPageScroll();
    };

    const unlockPageScroll = () => {
      window.scrollTo(0, 0);
    };

    const clearKeyboardState = () => {
      root.style.removeProperty('--proto-visible-viewport-height');
      root.removeAttribute('data-proto-keyboard-open');
      unlockPageScroll();
      document
        .querySelectorAll<HTMLElement>('.proto-shell-frame')
        .forEach((frame) => {
          frame.style.removeProperty('height');
          frame.style.removeProperty('max-height');
          frame.style.removeProperty('margin-top');
        });
      announceGeometry(null);
    };

    const clear = () => {
      root.style.removeProperty('--proto-dock-expanded-max-height');
      clearKeyboardState();
    };

    const updateDockMaxHeight = () => {
      updateStudyDockExpandedMaxHeight();
    };

    // Size the shell frame to exactly the visual viewport (above the keyboard) and let the
    // editor chrome row (format toolbar) stay in normal flow at the frame's bottom edge.
    // No fixed positioning / content max-height reserve — the editor and toolbar then read
    // as one continuous surface sitting just above the keyboard.
    const apply = () => {
      updateDockMaxHeight();
      if (!mq.matches) {
        clearKeyboardState();
        return;
      }
      const innerH = window.innerHeight;
      const effectiveHeight = vv.height;
      const keyboardOpen = effectiveHeight < innerH * 0.75;
      if (keyboardOpen) {
        const visibleHeight = Math.round(effectiveHeight);
        const frameInset =
          parseFloat(getComputedStyle(root).getPropertyValue('--pds-shell-frame-inset')) || 8;
        // Anchor the frame to the *visual* viewport, not the layout top. The frame is normal
        // flow rooted at the layout top, but iOS can pan the visual viewport (vv.offsetTop > 0)
        // to reveal the caret even while document scroll is locked — leaving a white strip
        // below the in-flow format bar. Push the frame's top down by offsetTop so its top still
        // sits `frameInset` below the visual top. Height subtracts the inset on BOTH ends
        // (`visibleHeight - frameInset * 2`) so the frame's bottom edge sits `frameInset` above
        // the keyboard — a blue outer-shell gap that mirrors the top inset, condensing the shell
        // into a complete rounded card above the keyboard. Growing margin-top does not clip the
        // header. A stale offsetTop mid-animation could over-push (gap above the top toolbar), so
        // apply() is re-run across the keyboard/Safari-bar settle window below; the committed
        // value uses the settled offsetTop.
        const offsetTop = Math.max(0, Math.round(vv.offsetTop));
        const frameHeight = Math.max(120, visibleHeight - frameInset * 2);
        root.style.setProperty('--proto-visible-viewport-height', `${frameHeight}px`);
        root.setAttribute('data-proto-keyboard-open', '');
        lockPageScroll();
        document.querySelectorAll<HTMLElement>('.proto-shell-frame').forEach((frame) => {
          frame.style.height = `${frameHeight}px`;
          frame.style.maxHeight = `${frameHeight}px`;
          frame.style.marginTop = `${frameInset + offsetTop}px`;
        });
        announceGeometry(`${frameHeight}:${frameInset + offsetTop}`);
      } else {
        clearKeyboardState();
      }
    };

    apply();
    const raf = requestAnimationFrame(() => apply());
    const onViewportChange = () => {
      apply();
      if (root.hasAttribute('data-proto-keyboard-open')) {
        pinPageScroll();
      }
    };
    // visualViewport resize/scroll is the primary signal; focus nudges a re-apply across the
    // settle window. iOS finishes the keyboard animation AND collapses the Safari bottom bar
    // (which grows vv.height) over a few hundred ms — without re-applying past that, the frame
    // stays sized to the pre-collapse height and leaves a white strip below the format bar.
    const scheduleSettle = () => {
      requestAnimationFrame(apply);
      clearSettleTimers();
      settleTimers = [setTimeout(apply, 150), setTimeout(apply, 450)];
    };
    vv.addEventListener('resize', onViewportChange);
    vv.addEventListener('scroll', onViewportChange);
    // Layout-viewport resize also shifts vv.height (Safari bottom-bar collapse, rotation) and
    // does not always emit a vv resize — route it through apply() so the frame re-anchors, not
    // just the dock height. vv 'scroll' already covers visual-viewport offset (offsetTop) changes.
    window.addEventListener('resize', onViewportChange);
    document.addEventListener('focusin', scheduleSettle);
    document.addEventListener('focusout', scheduleSettle);

    return () => {
      cancelAnimationFrame(raf);
      clearSettleTimers();
      vv.removeEventListener('resize', onViewportChange);
      vv.removeEventListener('scroll', onViewportChange);
      window.removeEventListener('resize', onViewportChange);
      document.removeEventListener('focusin', scheduleSettle);
      document.removeEventListener('focusout', scheduleSettle);
      clear();
    };
  }, [isNoteRoute]);

  const clampSidebarWidth = useCallback(
    (width: number) => Math.min(sidebarWidthMax, Math.max(sidebarWidthMin, width)),
    [sidebarWidthMax, sidebarWidthMin],
  );

  const applySidebarWidthToShell = useCallback((width: number) => {
    shellRef.current?.style.setProperty('--proto-sidebar-w', `${width}px`);
    resizeHandleRef.current?.setAttribute('aria-valuenow', String(Math.round(width)));
  }, []);

  const updateWidthFromClientX = useCallback(
    (clientX: number) => {
      const shellEl = shellRef.current;
      if (!shellEl) return;
      const shellRect = shellEl.getBoundingClientRect();
      const nextWidth = clampSidebarWidth(clientX - shellRect.left);
      widthRef.current = nextWidth;
      applySidebarWidthToShell(nextWidth);
    },
    [applySidebarWidthToShell, clampSidebarWidth],
  );

  const handleSidebarResizePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || hideSidebar || isMobileSidebar || desktopSidebarCollapsed) return;
      event.preventDefault();
      updateWidthFromClientX(event.clientX);
      shellRef.current?.classList.add('proto-shell--sidebar-resizing');

      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const cleanup = () => {
        shellRef.current?.classList.remove('proto-shell--sidebar-resizing');
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', finishResize);
        window.removeEventListener('pointercancel', finishResize);
      };

      const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
        updateWidthFromClientX(moveEvent.clientX);
      };

      const finishResize = (upEvent: globalThis.PointerEvent) => {
        updateWidthFromClientX(upEvent.clientX);
        setSidebarWidth(widthRef.current);
        persistSidebarWidth(widthRef.current);
        cleanup();
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', finishResize);
      window.addEventListener('pointercancel', finishResize);
    },
    [
      desktopSidebarCollapsed,
      hideSidebar,
      isMobileSidebar,
      persistSidebarWidth,
      setSidebarWidth,
      updateWidthFromClientX
    ],
  );

  const handleSidebarResizeKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (hideSidebar || isMobileSidebar || desktopSidebarCollapsed) return;
      let nextWidth: number | null = null;
      if (event.key === 'ArrowLeft') nextWidth = sidebarWidth - 16;
      else if (event.key === 'ArrowRight') nextWidth = sidebarWidth + 16;
      else if (event.key === 'Home') nextWidth = sidebarWidthMin;
      else if (event.key === 'End') nextWidth = sidebarWidthMax;
      if (nextWidth == null) return;
      event.preventDefault();
      const clamped = clampSidebarWidth(nextWidth);
      widthRef.current = clamped;
      setSidebarWidth(clamped);
      persistSidebarWidth(clamped);
    },
    [
      clampSidebarWidth,
      desktopSidebarCollapsed,
      hideSidebar,
      isMobileSidebar,
      persistSidebarWidth,
      setSidebarWidth,
      sidebarWidth,
      sidebarWidthMax,
      sidebarWidthMin,
    ],
  );

  const shellStyle = { '--proto-sidebar-w': `${sidebarWidth}px` } as CSSProperties;

  const useSplitDesktopToolbar = !hideSidebar && !isMobileSidebar;
  const useAdminFullWidthToolbar = isAdminRoute && useSplitDesktopToolbar;
  const showSidebarToolbar =
    useSplitDesktopToolbar && !useAdminFullWidthToolbar && !desktopSidebarCollapsed && !sidebarExiting;

  const shellMods = [
    'proto-shell',
    'proto-theme',
    hideSidebar ? 'proto-shell--no-sidebar' : '',
    isAdminRoute ? 'proto-shell--admin' : '',
    'proto-shell--no-footer',
    isNoteRoute ? 'proto-shell--note-chrome' : '',
    isMobileSidebar && drawerOpen && !hideSidebar ? 'proto-shell--drawer-open' : '',
    !hideSidebar && !isMobileSidebar && desktopSidebarCollapsed ? 'proto-shell--sidebar-collapsed' : '',
    !hideSidebar && sidebarExiting && !isMobileSidebar ? 'proto-shell--sidebar-closing' : '',
    expandedSidebarMounted ? 'proto-shell--sidebar-tool-expanded' : '',
  ]
    .filter(Boolean)
    .join(' ');


  return (
    <>
      <div className="proto-shell-frame simplified-prototype-root">
        <div ref={shellRef} className={shellMods} style={shellStyle}>
        <DevModeBadge />
        {userId ? (
          <SyncManagerIsland userId={userId} hideOfflineIndicator deferSyncInit />
        ) : null}
        <PrototypeSyncChip userId={userId} />
        <PrototypeAppUpdateToast />
        <PrototypeFeedbackToast />
        <PrototypeShortcutBridge />
        <KeyboardShortcutsInit />
        <PrototypePinPanels />
        <ReferralCreditInit userId={userId} />

        {useAdminFullWidthToolbar ? (
          <header className="proto-shell__toolbar-cell">
            <div className="proto-shell__toolbar-stack">
              <AdminToolbar variant="split" />
            </div>
          </header>
        ) : useSplitDesktopToolbar ? (
          <>
            {showSidebarToolbar ? (
              <header className="proto-shell__sidebar-toolbar-cell">
                <div className="proto-shell__toolbar-stack">
                  <PrototypeSidebarToolbar admin={isAdminRoute} />
                </div>
              </header>
            ) : null}
            <header className="proto-shell__detail-toolbar-cell">
              <div className="proto-shell__toolbar-stack">
                {isAdminRoute ? <AdminToolbar variant="detail" /> : <NativeToolbar variant="detail" />}
              </div>
            </header>
          </>
        ) : (
          <header className="proto-shell__toolbar-cell">
            <div className="proto-shell__toolbar-stack">
              {isAdminRoute ? <AdminToolbar variant="unified" /> : <NativeToolbar variant="unified" />}
            </div>
          </header>
        )}

        {!hideSidebar && isMobileSidebar && (drawerOpen || sidebarExiting) ? (
          <DrawerOverlay onClose={closeDrawer} />
        ) : null}

        {!hideSidebar ? (
          <aside
            className={[
              'proto-shell__sidebar-cell',
              'proto-shell-drawer-sidebar',
              sidebarExiting ? 'proto-shell-drawer-sidebar--exiting' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {sidebarVariant === 'admin' ? (
              <PrototypeAdminSidebar />
            ) : sidebarVariant === 'church-hub' ? (
              <PrototypeChurchHub variant="rail" />
            ) : sidebarVariant === 'shared-space' ? (
              <PrototypeSidebarSharedSpaceView />
            ) : sidebarVariant === 'shared-list' ? (
              <PrototypeSidebar
                scopedSpaceId={listScopeSpaceId}
                showListSpaceScopeBar
                shellIsSharedSpace
              />
            ) : (
              <PrototypeSidebar />
            )}
          </aside>
        ) : null}
        {!hideSidebar &&
        !isMobileSidebar &&
        !desktopSidebarCollapsed &&
        !sidebarExiting &&
        !expandedSidebarMounted ? (
          <div
            ref={resizeHandleRef}
            className="proto-shell__sidebar-resize-handle"
            role="separator"
            aria-label="Resize sidebar"
            aria-orientation="vertical"
            aria-valuemin={sidebarWidthMin}
            aria-valuemax={sidebarWidthMax}
            aria-valuenow={Math.round(sidebarWidth)}
            tabIndex={0}
            onPointerDown={handleSidebarResizePointerDown}
            onKeyDown={handleSidebarResizeKeyDown}
          />
        ) : null}

        <main className="proto-shell__main-cell">
          <div
            ref={settingsFreezeLayerRef}
            className="proto-shell__main-inner proto-shell__main-inner--settings-keep"
            hidden={!desktopSettingsKeepAlive}
            aria-hidden={desktopSettingsKeepAlive || undefined}
            inert={desktopSettingsKeepAlive ? true : undefined}
          />
          <div
            ref={mainInnerRef}
            className="proto-shell__main-inner"
            hidden={desktopSettingsKeepAlive || undefined}
            aria-hidden={desktopSettingsKeepAlive || undefined}
          >
            {paperStack ? (
              <PrototypePaperStack
                stack={paperStack}
                exiting={paperStackExiting}
                onFlipDown={handleFlipSheetDown}
                onFlipUp={handleFlipSheetUp}
                onDismiss={clearPaperStack}
                onSuggestionNevermind={handleSuggestionNevermind}
                onSuggestionIgnore={handleSuggestionIgnore}
                /* Parked: the URL is the origin's own address, so the Outlet IS the reader
                   route — hand it down as the paper behind, which is the surface being used
                   now. Any other time the descriptor's stand-in is right, and the Outlet is
                   whatever the sheet is showing. */
                baseSlot={
                  paperStack && !paperStack.open && paperStack.noteId ? <Outlet /> : undefined
                }
              >
                {hostNoteInLayout ? <PrototypeNotePage /> : <Outlet />}
              </PrototypePaperStack>
            ) : hostNoteInLayout ? (
              <PrototypeNotePage />
            ) : (
              <Outlet />
            )}
          </div>
        </main>

        {/* The reader portals its inspector in here too, so hiding this from assistive tech
            on every non-note route hid the reading-details panel from anyone using one. */}
        <div
          className="proto-shell__right-panel-host"
          aria-hidden={!isNoteRoute && !isPrototypeReadPath(pathname) ? true : undefined}
        />

        {expandedSidebarMounted ? (
          <PrototypeExpandedSidebarHost
            tool={expandedSidebarTool}
            exiting={expandedSidebarExiting}
            onClose={closeExpandedSidebar}
          />
        ) : null}

        {/* Where the six organize verbs are carried out. Mounted by the shell rather than by
            a list, because the sidebar that used to own these sheets boots collapsed — and
            collapsed means unmounted, so a verb invoked from the panel or a chord had
            nowhere to open. Renders only portalled sheets and confirms until one is raised. */}
        <Suspense fallback={null}>
          <PrototypeOrganizeCommandHost
            scopedSpaceId={sidebarVariant === 'shared-list' ? listScopeSpaceId : null}
            shellIsSharedSpace={sidebarVariant === 'shared-list'}
          />
        </Suspense>

        {/* The browse surface the sidebar used to be, summoned from the toolbar chip.
            Mounted through the exit morph, which is what `libraryPanelExiting` buys.
            No Suspense fallback: the chunk lands in a few ms, and a placeholder box
            would play the opening morph on chrome that is about to be replaced. */}
        {libraryPanelMounted ? (
          <Suspense fallback={null}>
            <PrototypeLibraryPanelHost />
          </Suspense>
        ) : null}

        {/* The bottom chrome is the shell's, not the editor's — a note fills it with the
            format toolbar, the reader fills it with verse actions. Both go through
            `editorChromeMode`, which stays 'hidden' (bar collapsed to zero height) until a
            surface asks for it, so mounting it on a reading route costs nothing until verses
            are selected.

            It still goes down with a stacked note sheet: with the note flipped away the bar
            below it belongs to the chapter, and leaving the note's toolbar hovering over
            Scripture would also cover the way back up to the note. */}
        {(isNoteRoute || isPrototypeReadPath(pathname)) && (!paperStack || paperStack.open) ? (
          <PrototypeEditorChromeBar />
        ) : null}
        </div>
      </div>
    </>
  );
}

function DrawerOverlay({ onClose }: { onClose: () => void }) {
  return <div className="proto-shell-drawer-overlay" role="presentation" tabIndex={-1} onClick={onClose} />;
}

function PrototypeShortcutBridge() {
  const navigate = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Mirrors NativeToolbar's derivation. Without this, reading a foreign author's
  // note in a shared space (any non-owner member) fetched details unscoped here,
  // which the server correctly 404s for a non-owner — repeatedly, on every
  // window-focus/reconnect refetch, since this call had no way to ever succeed.
  const spaceSearchParam = useRouterState({
    select: (s) => {
      const v = (s.location.search as Record<string, unknown>).space;
      return typeof v === 'string' || typeof v === 'number' ? String(v) : undefined;
    },
  });
  const toolbarContextSpaceId = normalizePrototypeApiSpaceId(spaceSearchParam);
  const { homeSpaceId } = usePrototypeHomeSpaceId();
  const {
    isMobileSidebar,
    closeDrawer,
    toggleDrawer,
    toggleDesktopSidebar,
    toggleInspector,
    ensureSidebarExpanded,
    sidebarLayer,
    setSidebarLayer,
    sidebarListMode,
    setSidebarListMode,
    beginPrototypeComposeSession,
    composePersistedNoteId,
    composeDraftActive,
    activeSpaceId,
    sidebarListSpaceScope,
    desktopSidebarCollapsed,
    libraryPanelView,
    openLibraryPanel,
    setLibraryPanelView,
  } = useProtoShell();

  const shellModeNav = useShellModeNav();

  const noteSlugFromPath = matchPrototypeNoteId(pathname);
  const isDraftNoteRoute =
    composeDraftActive ||
    (noteSlugFromPath != null && isPrototypeDraftNoteSlug(noteSlugFromPath));
  const toolbarNoteId = resolvePrototypeToolbarNoteId(
    composePersistedNoteId,
    noteSlugFromPath,
    isDraftNoteRoute,
    normalizeNoteIdFromParam,
  );
  const { data: toolbarNote, isLoading: toolbarNoteLoading } = useNote(
    toolbarNoteId ?? '',
    toolbarContextSpaceId,
  );
  /*
   * `|| isOnReadPage` to match the toolbar's own test.
   *
   * NativeToolbar shows the details orb on a chapter, because the reader has an inspector
   * too. This copy — the one the keyboard shortcut goes through — did not, so ⌘-toggling
   * the inspector was silently a no-op everywhere in the reader while the button beside it
   * worked. Both now read the flag off the same hook rather than re-deriving it.
   */
  const showNoteDetailsOrb =
    shellModeNav.isOnReadPage ||
    prototypeToolbarNoteDetailsAvailable({
      isOnNotePage:
        isPrototypeNotePath(pathname) || (composeDraftActive && isPrototypeHomePath(pathname)),
      toolbarNoteId,
      toolbarNoteLoading,
      hasToolbarNote: !!toolbarNote,
      isDraftNoteRoute,
    });

  const createPrototypeNote = useCallback(() => {
    const targetSpaceId = resolveVisibleComposeTarget({
      homeSpaceId,
      activeSpaceId,
      sidebarLayer,
      sidebarListSpaceScope,
    });
    if (!targetSpaceId) return;
    if (isMobileSidebar) closeDrawer({ preserveHistory: true });
    beginPrototypeComposeSession({ targetSpaceId });
    navigate.navigate({ to: prototypeHomeRouteTo() });
  }, [
    activeSpaceId,
    beginPrototypeComposeSession,
    closeDrawer,
    homeSpaceId,
    isMobileSidebar,
    navigate,
    sidebarLayer,
    sidebarListSpaceScope,
  ]);

  const togglePrototypeSidebar = useCallback(() => {
    if (isMobileSidebar) toggleDrawer();
    else toggleDesktopSidebar();
  }, [isMobileSidebar, toggleDesktopSidebar, toggleDrawer]);

  const focusPrototypeNoteList = useCallback(() => {
    /*
     * The panel answers this chord itself when it is open — it is the list on screen, and
     * its own handler focuses its first row. Falling through would flip the rail's layer
     * underneath it and then steal the focus back on the next frame.
     */
    if (libraryPanelView) return;
    // List-layer target — flip out of Home first so the list exists when the rAF queries it.
    setSidebarLayer('list');
    ensureSidebarExpanded();
    requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(
        '.proto-note-list .proto-note-row__main, .proto-note-list .proto-note-row, .proto-sidebar-search input',
      );
      target?.focus();
    });
  }, [ensureSidebarExpanded, libraryPanelView, setSidebarLayer]);

  /*
   * ⇧/ opens the Library panel's search rather than the sidebar's.
   *
   * The panel is the browse surface now, and its search field is the same universal
   * search the sidebar ran — so pointing the chord at the rail would summon a fallback
   * to do what the primary surface does. The sidebar keeps its own field for anyone who
   * opens it with ⇧S.
   */
  const focusPrototypeSidebarSearch = useCallback(() => {
    /* Opened by a chord, so there is no chip box to grow from — clearing the last one
       makes the panel fade in rather than morph out of a control nobody touched.
       Focus is the field's own `autoFocus`; a `querySelector` after a frame raced the
       panel's lazy chunk and found nothing on the first open of a session. */
    clearLibraryChipRect();
    /* This chord *is* a search, so the caret goes where the query will. */
    openLibraryPanel({ tab: 'all', drill: null, autoFocusSearch: true });
  }, [openLibraryPanel]);

  /*
   * ⇧[ / ⇧] walks sections of whichever browse surface is actually up.
   *
   * Three cases rather than two, because during the transition both surfaces exist: the
   * panel wins when it is open, the sidebar keeps its own cycle when someone has it
   * expanded, and from neither the keys open the panel — which is the answer that
   * matches where browsing lives now.
   */
  const cycleListMode = useCallback(
    (step: number) => {
      if (libraryPanelView) {
        setLibraryPanelView(cycleLibraryTab(libraryPanelView, step >= 0 ? 1 : -1));
        return;
      }
      if (desktopSidebarCollapsed && !isMobileSidebar) {
        openLibraryPanel({ tab: 'all', drill: null });
        return;
      }
      // From Home, the first cycle returns to the last-used list view instead of advancing past it.
      if (sidebarLayer === 'space') {
        setSidebarListMode(sidebarListMode);
        ensureSidebarExpanded();
        return;
      }
      const order = ['notes', 'folders', 'highlights', 'scripture', 'threads', 'resources'] as const;
      const currentIndex = Math.max(0, order.indexOf(sidebarListMode));
      const nextIndex = (currentIndex + step + order.length) % order.length;
      setSidebarListMode(order[nextIndex]);
      ensureSidebarExpanded();
    },
    [
      desktopSidebarCollapsed,
      ensureSidebarExpanded,
      isMobileSidebar,
      libraryPanelView,
      openLibraryPanel,
      setLibraryPanelView,
      setSidebarListMode,
      sidebarLayer,
      sidebarListMode,
    ],
  );

  /*
   * ⇧H used to open the sidebar's Home layer, back when Home lived in the sidebar. Home is
   * the main pane now, so the chord goes where the word does: to Activity, the same half of
   * the shell switch it sits under.
   */
  const showActivity = useCallback(() => {
    if (!homeSpaceId) return;
    shellModeNav.openActivity();
  }, [homeSpaceId, shellModeNav]);

  /* ⇧L opens the Library, which is where lists live now. Browsing, so no caret — the
     arrow keys belong to the list here, not to a text cursor. */
  const showListLayer = useCallback(() => {
    clearLibraryChipRect();
    openLibraryPanel({ tab: 'all', drill: null });
  }, [openLibraryPanel]);

  /*
   * The toolbar's shell switch, driven from the keyboard — the same hook, so the chords and
   * the control cannot mean different things. This used to be a second copy of the
   * smart-jump navigation here, and the copies had already drifted once over what counts as
   * the reader.
   *
   * R still toggles rather than only opening: leaving the reader is the other half of what
   * the key is for, and it returns to the last non-reader path rather than to Activity,
   * which is what "back" means to someone who was in a note when they pressed it.
   */
  const toggleReader = useCallback(() => {
    if (!homeSpaceId) return;
    if (shellModeNav.mode === 'reader') shellModeNav.leaveReader();
    else shellModeNav.openReader();
  }, [homeSpaceId, shellModeNav]);

  useEffect(() => {
    const onNewNote = () => createPrototypeNote();
    const onToggleSidebar = () => togglePrototypeSidebar();
    const onToggleInspector = () => {
      if (!showNoteDetailsOrb) return;
      toggleInspector();
    };
    const onFocusList = () => focusPrototypeNoteList();
    const onFocusSidebarSearch = () => focusPrototypeSidebarSearch();
    const onCycleListMode = (event: Event) => {
      const custom = event as CustomEvent<{ step?: number }>;
      const step = custom.detail?.step === -1 ? -1 : 1;
      cycleListMode(step);
    };
    const onShowHome = () => showActivity();
    const onShowList = () => showListLayer();
    const onOpenReader = () => toggleReader();

    window.addEventListener('prototypeShortcutOpenReader', onOpenReader);
    window.addEventListener('prototypeShortcutNewNote', onNewNote);
    window.addEventListener('prototypeShortcutToggleSidebar', onToggleSidebar);
    window.addEventListener('prototypeShortcutToggleInspector', onToggleInspector);
    window.addEventListener('prototypeShortcutFocusNoteList', onFocusList);
    window.addEventListener('prototypeShortcutFocusSidebarSearch', onFocusSidebarSearch);
    window.addEventListener('prototypeShortcutCycleListMode', onCycleListMode as EventListener);
    window.addEventListener('prototypeShortcutShowHome', onShowHome);
    window.addEventListener('prototypeShortcutShowList', onShowList);

    return () => {
      window.removeEventListener('prototypeShortcutOpenReader', onOpenReader);
      window.removeEventListener('prototypeShortcutNewNote', onNewNote);
      window.removeEventListener('prototypeShortcutToggleSidebar', onToggleSidebar);
      window.removeEventListener('prototypeShortcutToggleInspector', onToggleInspector);
      window.removeEventListener('prototypeShortcutFocusNoteList', onFocusList);
      window.removeEventListener('prototypeShortcutFocusSidebarSearch', onFocusSidebarSearch);
      window.removeEventListener('prototypeShortcutCycleListMode', onCycleListMode as EventListener);
      window.removeEventListener('prototypeShortcutShowHome', onShowHome);
      window.removeEventListener('prototypeShortcutShowList', onShowList);
    };
  }, [
    createPrototypeNote,
    cycleListMode,
    focusPrototypeNoteList,
    focusPrototypeSidebarSearch,
    toggleReader,
    pathname,
    showNoteDetailsOrb,
    showActivity,
    showListLayer,
    toggleInspector,
    togglePrototypeSidebar,
  ]);

  /**
   * ⇧K opens the Library panel's search, the same surface ⇧/ and ⇧L reach.
   *
   * The palette used to live here as its own overlay — mounted at the shell rather than in
   * the sidebar so it still opened with the rail collapsed. That reasoning now belongs to
   * the panel, which is mounted the same way and does the same two jobs in one place:
   * browse by tab, retrieve by query. The list a command acts on still publishes itself;
   * see `prototype-command-context-store`.
   */
  useEffect(() => {
    const onOpen = () => focusPrototypeSidebarSearch();
    window.addEventListener('prototypeShortcutOpenCommandPalette', onOpen);
    return () => window.removeEventListener('prototypeShortcutOpenCommandPalette', onOpen);
  }, [focusPrototypeSidebarSearch]);

  return null;
}

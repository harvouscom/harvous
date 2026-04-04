import {
  clearPwaPromptFromJoinFlag,
  isMobileDevice,
  shouldShowPwaPrompt,
} from '../../../src/utils/pwa-prompt';
import { isPWA } from '../../../src/utils/content-list-helpers';
import { useAuth, useUser } from '@clerk/clerk-react';
import ReferralCreditInit from '../../../src/components/react/ReferralCreditInit';
import SyncManagerIsland from '../../../src/components/react/SyncManagerIsland';
import { useQueryClient } from '@tanstack/react-query';
import { Outlet, useRouter, useRouterState } from '@tanstack/react-router';
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { getNavAvatarInitials } from '@/utils/nav-avatar-initials';
import NavigationIsland from '../../../src/components/react/navigation/NavigationIsland';
import { NavigationProvider } from '../../../src/components/react/navigation/NavigationContext';
import MobileNavigation from '../../../src/components/react/navigation/MobileNavigation';
import PanelManagerWithContext from '../../../src/components/react/PanelManagerWithContext';
import MobileBottomSheetWithContext from '../../../src/components/react/MobileBottomSheetWithContext';
import CreateNoteButton from '../../../src/components/react/CreateNoteButton';
import NotePageAddButton from '../../../src/components/react/NotePageAddButton';
import ActionStrip from '../../../src/components/react/ActionStrip';
import { getMenuOptions, shouldShowActionStripMenu } from '../../../src/utils/menu-options';
import { useIsMobile } from '../hooks/useIsMobile';
import { api } from '../lib/api';
import { useRecordThreadVisit, useRecordNoteVisit } from '../hooks/mutations/useRecordVisit';
import { useNavigation, useRefreshNavigation, navigationQueryKey } from '../hooks/queries/useNavigation';
import { useProfile, getCachedUserColor } from '../hooks/queries/useProfile';
import { useNote, getCachedNoteParentThreadId, getCachedNoteParentThread } from '../hooks/queries/useNote';
import { useThread } from '../hooks/queries/useThread';
import { useSpace } from '../hooks/queries/useSpace';

export default function AppLayout() {
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchRaw = useRouterState({ select: (s) => s.location.search });

  // Computed early so hooks below can use it in their `enabled` options.
  const hasSessionCookie = /(?:^|;\s*)__client_uat=[1-9]/.test(
    typeof document !== 'undefined' ? document.cookie : '',
  );

  // TanStack Router returns search as a parsed object (e.g. { space: 'space_xxx' }).
  // Components downstream expect a URL search string. Convert it.
  const search: string = typeof searchRaw === 'string' ? searchRaw
    : (searchRaw && typeof searchRaw === 'object')
      ? (() => {
          const params = new URLSearchParams();
          for (const [k, v] of Object.entries(searchRaw as Record<string, unknown>)) {
            if (v != null) params.set(k, String(v));
          }
          const str = params.toString();
          return str ? `?${str}` : '';
        })()
      : '';

  // ?thread= on note routes — which thread context the user opened from (notes can be in multiple threads).
  const threadFromSearch: string | null = (() => {
    const raw = searchRaw;
    if (raw && typeof raw === 'object' && raw !== null) {
      const t = (raw as Record<string, unknown>).thread;
      if (typeof t === 'string' && t.startsWith('thread_')) return t;
    }
    if (typeof raw === 'string' && raw.length > 0) {
      try {
        const q = raw.startsWith('?') ? raw.slice(1) : raw;
        const t = new URLSearchParams(q).get('thread');
        if (t?.startsWith('thread_')) return t;
      } catch { /* ignore */ }
    }
    return null;
  })();

  const { data: profile, isSuccess: profileSuccess, isError: profileError } = useProfile();
  const navAvatarInitials = useMemo(() => getNavAvatarInitials(user ?? undefined, profile), [user, profile]);
  // Fire nav immediately when cookie is present (parallel with profile — no waterfall).
  const { data: nav } = useNavigation({
    enabled: hasSessionCookie || (isLoaded && isSignedIn) || (profileSuccess && !!profile) || profileError,
  });
  const queryClient = useQueryClient();
  const refreshNavigation = useRefreshNavigation();
  const recordThreadVisit = useRecordThreadVisit();
  const recordNoteVisit = useRecordNoteVisit();
  // Once we show the app shell, keep it mounted through Clerk init transitions (avoids double fade-in).
  const committedToShellRef = useRef(false);

  // Derive current IDs from path before hooks (hooks must be called unconditionally)
  const pathSlugEarly = pathname.split('/').pop() || '';
  const isNoteEarly = pathname.startsWith('/note/');
  const isThreadEarly = pathname.startsWith('/thread/');
  const isSpaceEarly = pathname.startsWith('/space/');
  let noteIdForHook = isNoteEarly
    ? (pathSlugEarly.startsWith('note_') ? pathSlugEarly : `note_${pathSlugEarly}`)
    : '';
  let threadIdForHook = isThreadEarly
    ? (pathSlugEarly.startsWith('thread_') ? pathSlugEarly : `thread_${pathSlugEarly}`)
    : '';
  if (threadIdForHook.startsWith('thread/')) threadIdForHook = 'thread_' + threadIdForHook.slice(7);
  if (noteIdForHook.startsWith('note/')) noteIdForHook = 'note_' + noteIdForHook.slice(5);
  const spaceIdForHook = isSpaceEarly
    ? (pathSlugEarly.startsWith('space_') ? pathSlugEarly : `space_${pathSlugEarly}`)
    : '';

  // When viewing a note page, fetch note details to get parent thread/type
  // This will be a cache hit (NotePage already fetched it) — no extra network request
  const { data: currentNote } = useNote(noteIdForHook);
  const { data: currentThreadPrefetch } = useThread(threadIdForHook);
  const currentThread = currentThreadPrefetch?.thread;
  const { data: currentSpaceDetail } = useSpace(spaceIdForHook);

  // For note pages, parent thread id (for nav highlight and for add-note permission).
  // Prefer ?thread= when it matches a membership; while note is loading, trust URL for prefetch.
  const noteParentThreadId = (() => {
    if (!isNoteEarly) return null;
    const fromUrl = threadFromSearch;
    const threads = currentNote?.threads;
    if (threads?.length) {
      if (fromUrl && threads.some((th) => th.id === fromUrl)) return fromUrl;
      return threads[0]?.id ?? null;
    }
    if (fromUrl) return fromUrl;
    return getCachedNoteParentThreadId(noteIdForHook);
  })();
  const { data: parentThreadPrefetch } = useThread(noteParentThreadId ?? '');
  const parentThreadData = parentThreadPrefetch?.thread;

  // Redirect to sign-in if not authenticated
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      // Pass current path as redirectUrl so after sign-in the user lands back here
      const redirectUrl = encodeURIComponent(pathname);
      router.navigate({ to: `/sign-in?redirect_url=${redirectUrl}` as any });
    }
  }, [isLoaded, isSignedIn, router, pathname]);

  // Pending redirect fallback: if user signed in from join/invite/shared but Clerk sent them to /, send them back
  useEffect(() => {
    if (!isLoaded || !isSignedIn || pathname !== '/') return;
    try {
      const url = sessionStorage.getItem('harvous_pending_redirect');
      if (url && url.startsWith('http')) {
        sessionStorage.removeItem('harvous_pending_redirect');
        const path = new URL(url).pathname + new URL(url).search;
        if (path !== '/' && (path.startsWith('/spaces/join/') || path.startsWith('/invitations/') || path.startsWith('/shared/'))) {
          window.location.replace(url);
        }
      }
    } catch {
      /* ignore */
    }
  }, [isLoaded, isSignedIn, pathname]);

  // Record lastVisited when entering a thread or note page (SPA never hits Astro SSR, so DB is never updated otherwise)
  const lastVisitRecordedPathRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    if (pathname === lastVisitRecordedPathRef.current) return;

    const isThread = pathname.startsWith('/thread/');
    const isNote = pathname.startsWith('/note/');
    if (isThread && threadIdForHook && threadIdForHook !== 'thread_unorganized') {
      lastVisitRecordedPathRef.current = pathname;
      recordThreadVisit.mutate(threadIdForHook);
    } else if (isNote && noteIdForHook) {
      lastVisitRecordedPathRef.current = pathname;
      recordNoteVisit.mutate(noteIdForHook);
    } else if (!isThread && !isNote) {
      lastVisitRecordedPathRef.current = null;
    }
  }, [isLoaded, isSignedIn, pathname, threadIdForHook, noteIdForHook]);

  // PWA install prompt: show once per app load when in browser (not PWA), on mobile only, on first visit, after join/invite, or every 30 days after "Not now"
  const pwaPromptCheckedRef = useRef(false);
  useEffect(() => {
    if (!isLoaded || !isSignedIn || pwaPromptCheckedRef.current || isPWA()) return;
    const { show, reason } = shouldShowPwaPrompt();
    if (!show || !window.toast?.pwaPrompt) return;
    pwaPromptCheckedRef.current = true;
    clearPwaPromptFromJoinFlag();
    if (!isMobileDevice()) return;
    const message =
      reason === 'from_join'
        ? "You just joined a space — get the app for a better experience."
        : "Install Harvous for a better experience on your phone.";
    window.toast.pwaPrompt(message);
  }, [isLoaded, isSignedIn]);

  // Close any open desktop panel only when pathname actually changes (real navigation).
  // Use a ref so we don't clear panels on initial mount or when pathname hasn't changed,
  // avoiding races where the panel is closed right after the user opens it on the same route.
  const prevPathnameForPanelsRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevPathnameForPanelsRef.current === pathname) return;
    prevPathnameForPanelsRef.current = pathname;
    localStorage.removeItem('showNewNotePanel');
    localStorage.removeItem('showNewThreadPanel');
    localStorage.removeItem('showNewResourcePanel');
    localStorage.removeItem('showProfilePanel');
    window.dispatchEvent(new CustomEvent('closeAllPanels'));
  }, [pathname]);

  const prevPathnameRef = useRef(pathname);

  useEffect(() => {
    if (prevPathnameRef.current === pathname) return;
    prevPathnameRef.current = pathname;

    // Notify shared components and scripts that the route changed (content lists,
    // navigation, toasts, etc. use this to refresh or re-run on navigation).
    document.dispatchEvent(new Event('app:route-change'));
  }, [pathname]);

  // Invalidate nav and dashboard when the signed-in user changes (account switch). Skip first Clerk load — cookie-auth queries already have the right data.
  const prevUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user?.id) return;
    const prev = prevUserIdRef.current;
    prevUserIdRef.current = user.id;
    const userChanged = prev != null && prev !== user.id;
    if (userChanged) {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: navigationQueryKey });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    }
  }, [isLoaded, isSignedIn, user?.id, queryClient]);

  // Invalidate navigation cache when spaces/threads are created, updated, or deleted
  useEffect(() => {
    const refresh = () => refreshNavigation();

    const handleSpaceDeleted = (e: Event) => {
      const deletedId = (e as CustomEvent).detail?.spaceId;
      if (deletedId) {
        // Remove from navigation history in localStorage so it doesn't reappear after refresh
        try {
          const stored = localStorage.getItem('harvous-navigation-history-v2');
          if (stored) {
            const history = JSON.parse(stored).filter((item: any) => item.id !== deletedId);
            localStorage.setItem('harvous-navigation-history-v2', JSON.stringify(history));
            window.dispatchEvent(new CustomEvent('navigationHistoryUpdated'));
          }
        } catch {
          // ignore
        }
      }
      refreshNavigation();
    };

    const handleThreadUpdated = (e: Event) => {
      const threadId = (e as CustomEvent).detail?.threadId;
      if (threadId) {
        queryClient.invalidateQueries({ queryKey: ['thread', threadId] });
      }
      refreshNavigation();
    };

    const handleSpaceUpdated = (e: Event) => {
      const spaceId = (e as CustomEvent).detail?.spaceId;
      if (spaceId) {
        queryClient.invalidateQueries({ queryKey: ['space', spaceId] });
      }
      refreshNavigation();
    };

    window.addEventListener('spaceCreated', refresh);
    window.addEventListener('threadCreated', refresh);
    window.addEventListener('threadUpdated', handleThreadUpdated);
    window.addEventListener('spaceUpdated', handleSpaceUpdated);
    window.addEventListener('spaceDeleted', handleSpaceDeleted);
    window.addEventListener('threadDeleted', refresh);
    window.addEventListener('noteCreated', refresh);
    window.addEventListener('noteDeleted', refresh);
    return () => {
      window.removeEventListener('spaceCreated', refresh);
      window.removeEventListener('threadCreated', refresh);
      window.removeEventListener('threadUpdated', handleThreadUpdated);
      window.removeEventListener('spaceUpdated', handleSpaceUpdated);
      window.removeEventListener('spaceDeleted', handleSpaceDeleted);
      window.removeEventListener('threadDeleted', refresh);
      window.removeEventListener('noteCreated', refresh);
      window.removeEventListener('noteDeleted', refresh);
    };
  }, [queryClient, refreshNavigation]);

  // Derive nav state from current route (before early return so hook order is stable)
  // URL slugs can be bare (e.g. /thread/abc123) or prefixed (e.g. /thread/thread_onboarding_xxx); normalize so we don't double-prefix
  const pathSlug = pathname.split('/').pop() || '';
  const isNote = pathname.startsWith('/note/');
  const isThread = pathname.startsWith('/thread/');
  const isSpace = pathname.startsWith('/space/');

  const currentId = isThread
    ? (pathSlug.startsWith('thread_') ? pathSlug : `thread_${pathSlug}`)
    : isNote
    ? (pathSlug.startsWith('note_') ? pathSlug : `note_${pathSlug}`)
    : isSpace
    ? (pathSlug.startsWith('space_') ? pathSlug : `space_${pathSlug}`)
    : pathSlug;

  const spaceId = isSpace ? `space_${pathSlug}` : undefined;

  // Build spaces list (owned + member) — must come before currentSpace derivation
  const allSpaces = [
    ...(nav?.spaces ?? []).map(s => ({
      id: s.id,
      title: s.title,
      totalItemCount: 0,
      backgroundGradient: s.backgroundGradient,
      isShared: s.isPublic ?? false,
    })),
    ...(nav?.memberOfSpaces ?? []).map(s => ({
      id: s.id,
      title: s.title,
      totalItemCount: 0,
      backgroundGradient: s.backgroundGradient,
      isShared: true,
    })),
  ];

  const allThreads = nav?.threads ?? [];

  // Space role and owned/member IDs (needed for currentSpace enrichment so Edit Space panel shows correct title without fetch)
  const isMemberSpace = isSpace && spaceId ? (nav?.memberOfSpaces ?? []).some(s => s.id === spaceId) : false;
  const spaceRole: 'owner' | 'member' | null = isSpace ? (isMemberSpace ? 'member' : 'owner') : null;
  const memberOfSpaceIds = (nav?.memberOfSpaces ?? []).map(s => s.id);
  const ownedSpaceIds = (nav?.spaces ?? []).map(s => s.id);

  // Match ?thread= to note.membership when a note is in multiple threads (same resolution as NotePage).
  const resolvedNoteParentThread = (() => {
    const threads = currentNote?.threads;
    if (!threads?.length) return undefined;
    if (threadFromSearch && threads.some((th) => th.id === threadFromSearch)) {
      return threads.find((th) => th.id === threadFromSearch);
    }
    return threads[0];
  })();

  // nav threads have full IDs like "thread_abc123"; match using normalized currentId
  const activeThreadFromNav = isThread
    ? (nav?.threads.find(t => t.id === currentId) ?? null)
    : isNote
    ? (noteParentThreadId
        ? (nav?.threads.find(t => t.id === noteParentThreadId)
            ?? getCachedNoteParentThread(noteIdForHook))
        : null)
    : null;

  // Enrich with page-level data when available so nav shows correct thread color
  // (nav/cache can be stale or missing backgroundGradient; useThread/useNote load shortly after)
  // Fallback: when viewing a thread in a shared space as member, it's not in nav.threads — build from currentThread/parent
  // Default/fallback values that indicate "no real data yet" (e.g. from seeded cache before useThread resolves).
  // When enriching nav data with note thread data, skip these so we don't overwrite good nav data with defaults.
  const DEFAULT_TITLES = new Set(['Thread', '']);
  const DEFAULT_GRADIENTS = new Set(['var(--color-gradient-gray)', 'var(--color-paper)', '']);

  const activeThread = (() => {
    const base = activeThreadFromNav;
    if (base) {
      if (isThread && currentThread?.backgroundGradient) {
        return { ...base, backgroundGradient: currentThread.backgroundGradient, title: currentThread.title, noteCount: currentThread.noteCount };
      }
      const noteParent = resolvedNoteParentThread;
      if (isNote && noteParent) {
        const parentWithCount = noteParent as { count?: number; spaceId?: string | null };
        // Only use noteParent values if they're meaningful (not defaults from seeded cache).
        // Seeded cache often has title='Thread' and no backgroundGradient when thread data
        // hasn't loaded yet; in that case, keep the nav data which is more accurate.
        const useParentTitle = noteParent.title && !DEFAULT_TITLES.has(noteParent.title);
        const useParentGradient = noteParent.backgroundGradient && !DEFAULT_GRADIENTS.has(noteParent.backgroundGradient);
        return {
          ...base,
          backgroundGradient: useParentGradient ? noteParent.backgroundGradient! : base.backgroundGradient,
          title: useParentTitle ? noteParent.title! : base.title,
          noteCount: parentWithCount.count ?? base.noteCount,
          spaceId: parentWithCount.spaceId ?? base.spaceId,
        };
      }
      return base;
    }
    // Member view-only: thread not in nav; build from page data so mobile nav shows current thread
    if (isThread && currentThread?.id) {
      return {
        id: currentThread.id,
        title: currentThread.title ?? 'Thread',
        noteCount: currentThread.noteCount ?? 0,
        backgroundGradient: currentThread.backgroundGradient ?? 'var(--color-paper)',
        spaceId: currentThread.spaceId ?? null,
      };
    }
    // For note pages: prefer parentThreadData (from useThread, has correct data once loaded)
    // over noteParent (from seeded cache, may have fallback title/gradient).
    const noteParent = resolvedNoteParentThread;
    const noteParentHasRealData = noteParent?.title && !DEFAULT_TITLES.has(noteParent.title);
    const parentData = noteParentHasRealData ? noteParent : (parentThreadData ?? noteParent);
    if (isNote && parentData?.id) {
      const withCount = parentData as { count?: number; noteCount?: number };
      const isUnorganized = parentData.id === 'thread_unorganized';
      return {
        id: parentData.id,
        title: isUnorganized ? 'Unorganized' : (parentData.title ?? 'Thread'),
        noteCount: withCount.count ?? withCount.noteCount ?? 0,
        backgroundGradient: parentData.backgroundGradient || 'var(--color-paper)',
        spaceId: (parentData as { spaceId?: string | null }).spaceId ?? null,
      };
    }
    return null;
  })();

  // Enrich currentSpace with title/gradient from nav so navigation components can display it.
  // When on space page, merge currentSpaceDetail (title, color) and isOwner so Edit Space panel paints correctly without waiting for fetch.
  const currentSpaceBase = spaceId
    ? (allSpaces.find(s => s.id === spaceId) ?? { id: spaceId, title: 'Space', totalItemCount: 0, backgroundGradient: 'var(--color-paper)' })
    : (activeThread?.spaceId ? (allSpaces.find(s => s.id === activeThread.spaceId) ?? { id: activeThread.spaceId, title: 'Space', totalItemCount: 0, backgroundGradient: 'var(--color-paper)' }) : null);
  const currentSpace = (() => {
    if (!currentSpaceBase) return currentSpaceBase;
    const isOwnerForSpace =
      isSpace && spaceId
        ? spaceRole === 'owner'
        : currentSpaceBase.id && (ownedSpaceIds.includes(currentSpaceBase.id) || memberOfSpaceIds.includes(currentSpaceBase.id))
          ? ownedSpaceIds.includes(currentSpaceBase.id)
          : undefined;
    return {
      ...currentSpaceBase,
      ...(isSpace && currentSpaceDetail ? { title: currentSpaceDetail.title, color: currentSpaceDetail.color ?? 'paper', backgroundGradient: currentSpaceDetail.backgroundGradient ?? currentSpaceBase.backgroundGradient } : {}),
      ...(isOwnerForSpace !== undefined ? { isOwner: isOwnerForSpace } : {}),
    };
  })();

  // Note-specific data for ActionStrip
  const noteType = isNote ? (currentNote?.noteType ?? 'default') : undefined;
  const noteCurrentThreadId = noteParentThreadId ?? undefined;
  const noteSimpleId = isNote ? (currentNote?.simpleNoteId ?? null) : null;
  const noteCreatedAt = isNote ? (currentNote?.createdAt ?? undefined) : undefined;
  const contentEncrypted = isNote ? (currentNote?.contentEncrypted ?? false) : undefined;
  const contentEncryptedServer = isNote ? (currentNote?.contentEncrypted ?? false) : undefined;

  // Space shared state for ActionStrip menu options
  const spaceIsShared = isSpace ? (currentSpaceDetail?.isPublic ?? false) : false;

  // contentOwnerId and userId for ActionStrip — hide strip / restrict options when member views another's content
  const contentOwnerId =
    isNote ? (currentNote?.userId ?? undefined)
    : isThread ? (currentThread?.userId ?? undefined)
    : isSpace ? (currentSpaceDetail?.ownerId ?? undefined)
    : undefined;

  // Effective space role for add-note gating (thread/note inside a shared space, not only on space URL)
  const effectiveSpaceRole: 'owner' | 'member' | null = (() => {
    if (isSpace) return spaceRole;
    if (isThread && currentThread?.spaceId) {
      if (memberOfSpaceIds.includes(currentThread.spaceId)) return 'member';
      if (ownedSpaceIds.includes(currentThread.spaceId)) return 'owner';
    }
    if (isNote && parentThreadData?.spaceId) {
      if (memberOfSpaceIds.includes(parentThreadData.spaceId)) return 'member';
      if (ownedSpaceIds.includes(parentThreadData.spaceId)) return 'owner';
    }
    return null;
  })();
  const contentType: 'thread' | 'note' | 'space' | 'dashboard' | 'profile' | 'search' | 'new-space' =
    isNote ? 'note' :
    isThread ? 'thread' :
    isSpace ? 'space' :
    pathname === '/new-space' ? 'new-space' :
    pathname === '/search' ? 'search' :
    pathname === '/profile' ? 'profile' :
    pathname === '/new-space' ? 'new-space' :
    'dashboard';
  // Only show "Add a note" when the user can add to the current context:
  // - Dashboard: always; Space: owner or member can add content to the space
  // - Thread: only if user owns the thread (members viewing another's thread cannot add)
  // - Note: only if user owns the note's parent thread (or note is in unorganized and user owns the note)
  const currentUserId = user?.id ?? null;
  // For note pages, check thread ownership from multiple sources to avoid waiting for parentThreadData to load.
  // parentThreadData comes from useThread which needs noteParentThreadId, which needs currentNote to load first.
  // Use nav.threads as a fast check: if the parent thread is in nav, the user owns it.
  const noteParentThreadOwnedByUser =
    parentThreadData?.userId === user?.id ||
    (noteParentThreadId && nav?.threads.some(t => t.id === noteParentThreadId)) ||
    (noteParentThreadId === 'thread_unorganized' && currentNote?.userId === user?.id);
  const canShowAddNote =
    contentType === 'dashboard' ||
    (contentType === 'space' && (effectiveSpaceRole === 'owner' || effectiveSpaceRole === 'member')) ||
    (contentType === 'thread' && contentOwnerId === currentUserId) ||
    (contentType === 'note' && noteParentThreadOwnedByUser);

  // Only show CreateNoteButton / ActionStrip once we have data to decide (avoids flash-then-hide for members)
  // For space: nav is enough to compute effectiveSpaceRole and show Add note; don't wait for currentSpaceDetail
  const layoutDataReadyForContent =
    contentType === 'dashboard' || contentType === 'profile' || contentType === 'search' || contentType === 'new-space' ||
    (contentType === 'space' && nav != null) ||
    (contentType === 'thread' && (currentThread != null || nav != null)) ||
    (contentType === 'note' && (parentThreadData != null || currentNote != null));

  // Unorganized thread is virtual — it has no editable options, so hide the ActionStrip dock
  const isUnorganized = isThread && currentId === 'thread_unorganized';
  const actionStripOptions = getMenuOptions(
    contentType,
    currentId,
    noteType,
    contentEncrypted,
    contentEncryptedServer,
    noteSimpleId,
    spaceRole,
    contentOwnerId,
    user?.id ?? null,
    spaceIsShared
  );
  const showActionStrip = shouldShowActionStripMenu(
    contentType,
    currentId,
    contentOwnerId,
    user?.id ?? null,
    actionStripOptions.length
  );

  // Action strip dock: hide with slide-out animation when entering note edit mode, when a panel opens, or when navigating away
  const [isEditMode, setIsEditMode] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const prevShowActionStripRef = useRef(showActionStrip);
  /** Preserves pathname while the strip exit animation runs so the dock key does not jump to the next route. */
  const lastStripPathnameRef = useRef(pathname);

  useEffect(() => {
    if (showActionStrip) {
      lastStripPathnameRef.current = pathname;
    }
  }, [showActionStrip, pathname]);

  // Remount the dock when navigating between thread/space/note so slide-in CSS runs again; keep key stable during exiting.
  const actionStripDockKey = showActionStrip
    ? pathname
    : exiting
      ? lastStripPathnameRef.current
      : pathname;

  useEffect(() => {
    const handleEditModeChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setIsEditMode(detail?.editing === true);
    };
    window.addEventListener('contentEditModeChange', handleEditModeChange);
    return () => window.removeEventListener('contentEditModeChange', handleEditModeChange);
  }, []);

  useEffect(() => {
    const handlePanelOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setPanelOpen(detail?.open === true);
    };
    window.addEventListener('actionStripPanelOpen', handlePanelOpen);
    return () => window.removeEventListener('actionStripPanelOpen', handlePanelOpen);
  }, []);

  useEffect(() => {
    if (prevShowActionStripRef.current && !showActionStrip) {
      setExiting(true);
    }
    prevShowActionStripRef.current = showActionStrip;
  }, [showActionStrip]);

  const dockHiding = (contentType === 'note' && isEditMode) || exiting || panelOpen;
  const showDock = (showActionStrip || exiting) && layoutDataReadyForContent;
  const isMobile = useIsMobile();
  // On mobile, space/thread/dashboard render CreateNoteButton inside the card; don't render it here
  const showCreateNoteInLayout =
    layoutDataReadyForContent &&
    contentType !== 'profile' &&
    contentType !== 'search' &&
    contentType !== 'new-space' &&
    contentType !== 'note' &&
    canShowAddNote &&
    !(isMobile && (contentType === 'space' || contentType === 'thread' || contentType === 'dashboard'));

  const handleDockAnimationEnd = useCallback((e: React.AnimationEvent) => {
    if (exiting && (e.animationName === 'action-strip-dock-slide-out' || e.animationName === 'mobile-dock-slide-out')) {
      setExiting(false);
    }
  }, [exiting]);

  // Force reflow when dock becomes visible on mobile so margin/padding apply (fixes action bar partially hidden under note content)
  const prevShowDockRef = useRef(showDock);
  useEffect(() => {
    if (showDock && !prevShowDockRef.current && typeof window !== 'undefined') {
      const isMobile = window.matchMedia('(max-width: 1159px)').matches;
      if (isMobile) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            void document.body.offsetHeight;
          });
        });
      }
    }
    prevShowDockRef.current = showDock;
  }, [showDock]);

  // Render shell when session cookie exists or Clerk confirms sign-in; then stay mounted (no transient isLoaded/isSignedIn unmount).
  const shouldShowShell = hasSessionCookie || (isLoaded && isSignedIn);
  if (shouldShowShell) {
    committedToShellRef.current = true;
  }

  if (!committedToShellRef.current) {
    return null;
  }

  return (
    <div className="app-layout">
      <NavigationProvider>
        {isLoaded && isSignedIn && user?.id && <SyncManagerIsland userId={user.id} />}
        <ReferralCreditInit userId={user?.id} />

        {/* ── Desktop: three-column grid (hidden on mobile) ── */}
        <div className="desktop-layout">

        {/* Column 1: Navigation */}
        <section className="layout-column">
          <NavigationIsland
            inboxCount={nav?.inboxCount ?? 0}
            spaces={allSpaces}
            activeThread={activeThread ?? null}
            currentSpace={currentSpace}
            isNote={isNote}
            currentId={currentId}
            showProfile={false}
            initials={navAvatarInitials}
            userColor={profile?.userColor ?? getCachedUserColor() ?? 'blue'}
            pathname={pathname}
            search={search}
          />
        </section>

        {/* Column 2: Main content + CreateNoteButton + action-strip-dock (matches SSR main-column-with-cta) */}
        <section className="layout-column main-column-with-cta">
          <div className="main-column__body">
            <div className="main-column__scroll">
              <Outlet key={pathname} />
            </div>
            {/* CreateNoteButton: on space page opens menu (Add a note / Add to space); elsewhere opens New Note */}
            {showCreateNoteInLayout && (
              <CreateNoteButton addToSpaceSpaceId={contentType === 'space' ? currentId : undefined} />
            )}
            {layoutDataReadyForContent && contentType === 'note' && canShowAddNote && (
              <div className="note-page-add-button">
                <NotePageAddButton />
              </div>
            )}
            {contentType === 'profile' && (
              <button
                type="button"
                className="btn btn--lg btn--secondary profile-logout-button"
                onClick={() => signOut({ redirectUrl: '/sign-in' })}
              >
                Logout
              </button>
            )}
            {showDock && (
              <div
                key={actionStripDockKey}
                id="square-buttons-container"
                className={`action-strip-dock ${dockHiding ? 'action-strip-dock--hiding' : 'action-strip-dock--showing'}`}
                onAnimationEnd={handleDockAnimationEnd}
              >
                <ActionStrip
                  variant="desktop"
                  contentType={contentType}
                  contentId={currentId}
                  currentThreadId={noteCurrentThreadId}
                  noteType={noteType}
                  contentEncrypted={contentEncrypted}
                  contentEncryptedServer={contentEncryptedServer}
                  noteSimpleId={noteSimpleId}
                  noteCreatedAt={noteCreatedAt}
                  spaceRole={spaceRole}
                  spaceIsShared={spaceIsShared}
                  contentOwnerId={contentOwnerId}
                  userId={user?.id}
                />
              </div>
            )}
          </div>
        </section>

        {/* Column 3: Panels only (matches SSR desktop-additional-column) */}
        <section className="layout-column desktop-additional-column">
          <div className="desktop-panel-container">
            <PanelManagerWithContext
              currentThread={activeThread}
              currentSpace={currentSpace}
              currentNote={currentNote ?? undefined}
              contentType={contentType}
              publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
            />
          </div>
        </section>

      </div>

      {/* ── Mobile: stacked layout (hidden on desktop) ── */}
      <div className="mobile-layout">

        {/* Top nav bar */}
        <div className="mobile-nav-slot">
          <MobileNavigation
            spaces={allSpaces}
            threads={allThreads}
            inboxCount={nav?.inboxCount ?? 0}
            currentSpace={currentSpace}
            currentThread={activeThread}
            initials={navAvatarInitials}
            userColor={profile?.userColor ?? getCachedUserColor() ?? 'blue'}
            pathname={pathname}
            search={search}
            initialPath={pathname}
            onNavigate={(href) => router.navigate({ to: href as any })}
          />
        </div>

        {/* Main content + CreateNoteButton + mobile-action-strip-dock (matches SSR mobile-main) */}
        <div className={`mobile-main main-column-with-cta ${showDock ? 'mobile-main--with-dock' : ''} ${isUnorganized ? 'mobile-main--unorganized' : ''}`}>
          <div className="mobile-main__body">
            <div className="main-column__scroll">
              <Outlet key={pathname} />
            </div>
            {/* CreateNoteButton: on mobile space/thread/dashboard it's rendered inside the card */}
            {showCreateNoteInLayout && (
              <CreateNoteButton addToSpaceSpaceId={contentType === 'space' ? currentId : undefined} />
            )}
            {layoutDataReadyForContent && contentType === 'note' && canShowAddNote && (
              <div className="note-page-add-button">
                <NotePageAddButton />
              </div>
            )}
            {contentType === 'profile' && (
              <button
                type="button"
                className="btn btn--lg btn--secondary profile-logout-button"
                onClick={() => signOut({ redirectUrl: '/sign-in' })}
              >
                Logout
              </button>
            )}
            {showDock && (
              <div
                key={actionStripDockKey}
                className={`mobile-action-strip-dock ${dockHiding ? 'mobile-action-strip-dock--hiding' : 'mobile-action-strip-dock--showing'}`}
                onAnimationEnd={handleDockAnimationEnd}
              >
                <ActionStrip
                  variant="mobile"
                  contentType={contentType}
                  contentId={currentId}
                  currentThreadId={noteCurrentThreadId}
                  noteType={noteType}
                  contentEncrypted={contentEncrypted}
                  contentEncryptedServer={contentEncryptedServer}
                  noteSimpleId={noteSimpleId}
                  noteCreatedAt={noteCreatedAt}
                  spaceRole={spaceRole}
                  spaceIsShared={spaceIsShared}
                  contentOwnerId={contentOwnerId}
                  userId={user?.id}
                />
              </div>
            )}
          </div>
        </div>

        {/* Mobile bottom sheet — fixed overlay, handles all panels on mobile */}
        <MobileBottomSheetWithContext
          currentThread={activeThread}
          currentSpace={currentSpace}
          currentNote={currentNote ?? undefined}
          contentType={contentType}
          publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
        />

      </div>
      </NavigationProvider>
    </div>
  );
}

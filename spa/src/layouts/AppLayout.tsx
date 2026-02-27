import {
  clearPwaPromptFromJoinFlag,
  isMobileDevice,
  shouldShowPwaPrompt,
} from '../../../src/utils/pwa-prompt';
import { isPWA } from '../../../src/utils/content-list-helpers';
import { useAuth, useUser } from '@clerk/clerk-react';
import ReferralCreditInit from '../../../src/components/react/ReferralCreditInit';
import { useQueryClient } from '@tanstack/react-query';
import { Outlet, useRouter, useRouterState } from '@tanstack/react-router';
import { useEffect, useRef, useCallback } from 'react';
import NavigationIsland from '../../../src/components/react/navigation/NavigationIsland';
import { NavigationProvider } from '../../../src/components/react/navigation/NavigationContext';
import MobileNavigation from '../../../src/components/react/navigation/MobileNavigation';
import PanelManagerWithContext from '../../../src/components/react/PanelManagerWithContext';
import MobileBottomSheetWithContext from '../../../src/components/react/MobileBottomSheetWithContext';
import CreateNoteButton from '../../../src/components/react/CreateNoteButton';
import NotePageAddButton from '../../../src/components/react/NotePageAddButton';
import ActionStrip from '../../../src/components/react/ActionStrip';
import { getMenuOptions, shouldShowMoreButton } from '../../../src/utils/menu-options';
import { api } from '../lib/api';
import { useNavigation, useRefreshNavigation } from '../hooks/queries/useNavigation';
import { useProfile, getCachedUserColor } from '../hooks/queries/useProfile';
import { useNote, getCachedNoteParentThreadId, getCachedNoteParentThread } from '../hooks/queries/useNote';
import { useThread } from '../hooks/queries/useThread';
import { useSpace } from '../hooks/queries/useSpace';

export default function AppLayout() {
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search }) ?? '';

  const { data: nav } = useNavigation();
  const queryClient = useQueryClient();
  const refreshNavigation = useRefreshNavigation();
  const { data: profile } = useProfile();

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
  const { data: currentThread } = useThread(threadIdForHook);
  const { data: currentSpaceDetail } = useSpace(spaceIdForHook);

  // For note pages, parent thread id (for nav highlight and for add-note permission)
  const noteParentThreadId = currentNote?.threads?.[0]?.id
    ?? (isNoteEarly ? getCachedNoteParentThreadId(noteIdForHook) : null);
  const { data: parentThreadData } = useThread(noteParentThreadId ?? '');

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
      api.post(`/api/threads/${threadIdForHook}/visit`).catch(() => {});
    } else if (isNote && noteIdForHook) {
      lastVisitRecordedPathRef.current = pathname;
      api.post(`/api/notes/${noteIdForHook}/visit`).catch(() => {});
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

  // Smooth fade-in on route transitions
  const desktopContentRef = useRef<HTMLElement>(null);
  const mobileContentRef = useRef<HTMLDivElement>(null);
  const prevPathnameRef = useRef(pathname);

  useEffect(() => {
    if (prevPathnameRef.current === pathname) return;
    prevPathnameRef.current = pathname;

    const targets = [desktopContentRef.current, mobileContentRef.current];
    for (const el of targets) {
      if (!el) continue;
      el.classList.add('route-pending');
      el.classList.remove('route-fade-in');
    }
    void desktopContentRef.current?.offsetWidth; // Force reflow
    for (const el of targets) {
      if (!el) continue;
      el.classList.add('route-fade-in');
      el.classList.remove('route-pending');
    }

    // Notify shared components and scripts that the route changed (content lists,
    // navigation, toasts, etc. use this to refresh or re-run on navigation).
    document.dispatchEvent(new Event('app:route-change'));
  }, [pathname]);

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
    return () => {
      window.removeEventListener('spaceCreated', refresh);
      window.removeEventListener('threadCreated', refresh);
      window.removeEventListener('threadUpdated', handleThreadUpdated);
      window.removeEventListener('spaceUpdated', handleSpaceUpdated);
      window.removeEventListener('spaceDeleted', handleSpaceDeleted);
      window.removeEventListener('threadDeleted', refresh);
    };
  }, [queryClient, refreshNavigation]);

  if (!isLoaded) {
    return (
      <div className="app-loading">
        <div className="app-loading__spinner" />
      </div>
    );
  }

  if (!isSignedIn) {
    return null;
  }

  // Derive nav state from current route
  // URL slugs are bare IDs (e.g. /thread/abc123), DB uses prefixed IDs (thread_abc123)
  const pathSlug = pathname.split('/').pop() || '';
  const isNote = pathname.startsWith('/note/');
  const isThread = pathname.startsWith('/thread/');
  const isSpace = pathname.startsWith('/space/');

  const currentId = isThread ? `thread_${pathSlug}`
    : isNote ? `note_${pathSlug}`
    : isSpace ? `space_${pathSlug}`
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

  // nav threads have full IDs like "thread_abc123"; URL has "/thread/abc123"
  const activeThreadFromNav = isThread
    ? (nav?.threads.find(t => t.id === `thread_${pathSlug}`) ?? null)
    : isNote
    ? (noteParentThreadId
        ? (nav?.threads.find(t => t.id === noteParentThreadId)
            ?? getCachedNoteParentThread(noteIdForHook))
        : null)
    : null;

  // Enrich with page-level data when available so nav shows correct thread color
  // (nav/cache can be stale or missing backgroundGradient; useThread/useNote load shortly after)
  // Fallback: when viewing a thread in a shared space as member, it's not in nav.threads — build from currentThread/parent
  const activeThread = (() => {
    const base = activeThreadFromNav;
    if (base) {
      if (isThread && currentThread?.backgroundGradient) {
        return { ...base, backgroundGradient: currentThread.backgroundGradient, title: currentThread.title, noteCount: currentThread.noteCount };
      }
      const noteParent = currentNote?.threads?.[0];
      if (isNote && noteParent) {
        const parentWithCount = noteParent as { count?: number; spaceId?: string | null };
        return {
          ...base,
          backgroundGradient: noteParent.backgroundGradient ?? base.backgroundGradient,
          title: noteParent.title ?? base.title,
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
    const noteParent = currentNote?.threads?.[0];
    const parentData = noteParent ?? parentThreadData;
    if (isNote && parentData?.id) {
      const withCount = parentData as { count?: number; noteCount?: number };
      return {
        id: parentData.id,
        title: parentData.title ?? 'Thread',
        noteCount: withCount.count ?? withCount.noteCount ?? 0,
        backgroundGradient: parentData.backgroundGradient ?? 'var(--color-paper)',
        spaceId: (parentData as { spaceId?: string | null }).spaceId ?? null,
      };
    }
    return null;
  })();

  // Enrich currentSpace with title/gradient from nav so navigation components can display it
  const currentSpace = spaceId
    ? (allSpaces.find(s => s.id === spaceId) ?? { id: spaceId, title: 'Space', totalItemCount: 0, backgroundGradient: 'var(--color-paper)' })
    : (activeThread?.spaceId ? (allSpaces.find(s => s.id === activeThread.spaceId) ?? { id: activeThread.spaceId, title: 'Space', totalItemCount: 0, backgroundGradient: 'var(--color-paper)' }) : null);

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

  // Space role — used by ActionStrip menu to show owner vs member options
  const isMemberSpace = isSpace && spaceId ? (nav?.memberOfSpaces ?? []).some(s => s.id === spaceId) : false;
  const spaceRole: 'owner' | 'member' | null = isSpace ? (isMemberSpace ? 'member' : 'owner') : null;

  // Effective space role for add-note gating (thread/note inside a shared space, not only on space URL)
  const memberOfSpaceIds = (nav?.memberOfSpaces ?? []).map(s => s.id);
  const ownedSpaceIds = (nav?.spaces ?? []).map(s => s.id);
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
  const canShowAddNote =
    contentType === 'dashboard' ||
    effectiveSpaceRole === 'owner' ||
    effectiveSpaceRole === 'member';

  // Only show CreateNoteButton / ActionStrip once we have data to decide (avoids flash-then-hide for members)
  const layoutDataReadyForContent =
    contentType === 'dashboard' || contentType === 'profile' || contentType === 'search' || contentType === 'new-space' ||
    (contentType === 'space' && (currentSpaceDetail != null || nav != null)) ||
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
  const hasVisibleMoreButton = shouldShowMoreButton(
    contentType,
    currentId,
    contentOwnerId,
    user?.id ?? null
  );
  const showActionStrip =
    (contentType === 'thread' || contentType === 'note' || contentType === 'space') &&
    !isUnorganized &&
    actionStripOptions.length > 0 &&
    hasVisibleMoreButton;

  return (
    <div className="app-layout">
      <NavigationProvider>
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
            initials={`${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.trim()}
            userColor={profile?.userColor ?? getCachedUserColor() ?? 'blue'}
            pathname={pathname}
            search={search}
          />
        </section>

        {/* Column 2: Main content + CreateNoteButton + action-strip-dock (matches SSR main-column-with-cta) */}
        <section className="layout-column main-column-with-cta route-fade-in" ref={desktopContentRef}>
          <div className="main-column__body">
            <div className="main-column__scroll">
              <Outlet key={pathname} />
            </div>
            {/* CreateNoteButton: on space page opens menu (Add a note / Add to space); elsewhere opens New Note */}
            {layoutDataReadyForContent && contentType !== 'profile' && contentType !== 'search' && contentType !== 'new-space' && contentType !== 'note' && canShowAddNote && (
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
            {layoutDataReadyForContent && showActionStrip && (
              <div id="square-buttons-container" className="action-strip-dock">
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
            initials={`${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.trim()}
            userColor={profile?.userColor ?? getCachedUserColor() ?? 'blue'}
            pathname={pathname}
            search={search}
            initialPath={pathname}
            onNavigate={(href) => router.navigate({ to: href as any })}
          />
        </div>

        {/* Main content + CreateNoteButton + mobile-action-strip-dock (matches SSR mobile-main) */}
        <div className={`mobile-main main-column-with-cta route-fade-in ${layoutDataReadyForContent && showActionStrip ? 'mobile-main--with-dock' : ''} ${isUnorganized ? 'mobile-main--unorganized' : ''}`} ref={mobileContentRef}>
          <div className="mobile-main__body">
            <div className="main-column__scroll">
              <Outlet key={pathname} />
            </div>
            {/* CreateNoteButton: on space page opens menu (Add a note / Add to space); elsewhere opens New Note */}
            {layoutDataReadyForContent && contentType !== 'profile' && contentType !== 'search' && contentType !== 'new-space' && contentType !== 'note' && canShowAddNote && (
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
            {layoutDataReadyForContent && showActionStrip && (
              <div className="mobile-action-strip-dock">
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

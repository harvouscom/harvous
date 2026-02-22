import {
  clearPwaPromptFromJoinFlag,
  isMobileDevice,
  shouldShowPwaPrompt,
} from '../../../src/utils/pwa-prompt';
import { isPWA } from '../../../src/utils/content-list-helpers';
import { useAuth, useUser } from '@clerk/clerk-react';
import ReferralCreditInit from '../../../src/components/react/ReferralCreditInit';
import { Outlet, useRouter, useRouterState } from '@tanstack/react-router';
import { useEffect, useRef, useCallback } from 'react';
import NavigationIsland from '../../../src/components/react/navigation/NavigationIsland';
import MobileNavigation from '../../../src/components/react/navigation/MobileNavigation';
import PanelManagerWithContext from '../../../src/components/react/PanelManagerWithContext';
import MobileBottomSheetWithContext from '../../../src/components/react/MobileBottomSheetWithContext';
import CreateNoteButton from '../../../src/components/react/CreateNoteButton';
import ActionStrip from '../../../src/components/react/ActionStrip';
import { useNavigation, useRefreshNavigation } from '../hooks/queries/useNavigation';
import { useProfile, getCachedUserColor } from '../hooks/queries/useProfile';
import { useNote, getCachedNoteParentThreadId, getCachedNoteParentThread } from '../hooks/queries/useNote';
import { useThread } from '../hooks/queries/useThread';
import { useSpace } from '../hooks/queries/useSpace';

export default function AppLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search }) ?? '';

  const { data: nav } = useNavigation();
  const refreshNavigation = useRefreshNavigation();
  const { data: profile } = useProfile();

  // Derive current IDs from path before hooks (hooks must be called unconditionally)
  const pathSlugEarly = pathname.split('/').pop() || '';
  const isNoteEarly = pathname.startsWith('/note/');
  const isThreadEarly = pathname.startsWith('/thread/');
  const isSpaceEarly = pathname.startsWith('/space/');
  const noteIdForHook = isNoteEarly
    ? (pathSlugEarly.startsWith('note_') ? pathSlugEarly : `note_${pathSlugEarly}`)
    : '';
  const threadIdForHook = isThreadEarly
    ? (pathSlugEarly.startsWith('thread_') ? pathSlugEarly : `thread_${pathSlugEarly}`)
    : '';
  const spaceIdForHook = isSpaceEarly
    ? (pathSlugEarly.startsWith('space_') ? pathSlugEarly : `space_${pathSlugEarly}`)
    : '';

  // When viewing a note page, fetch note details to get parent thread/type
  // This will be a cache hit (NotePage already fetched it) — no extra network request
  const { data: currentNote } = useNote(noteIdForHook);
  const { data: currentThread } = useThread(threadIdForHook);
  const { data: currentSpaceDetail } = useSpace(spaceIdForHook);

  // Redirect to sign-in if not authenticated
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      // Pass current path as redirectUrl so after sign-in the user lands back here
      const redirectUrl = encodeURIComponent(pathname);
      router.navigate({ to: `/sign-in?redirect_url=${redirectUrl}` as any });
    }
  }, [isLoaded, isSignedIn, router, pathname]);

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

  // Close any open desktop panel when the route changes (panel manager stays mounted across routes).
  // Also clear localStorage panel keys so LOAD_FROM_STORAGE doesn't reopen them on next mount.
  useEffect(() => {
    localStorage.removeItem('showNewNotePanel');
    localStorage.removeItem('showNewThreadPanel');
    localStorage.removeItem('showNewResourcePanel');
    localStorage.removeItem('showProfilePanel');
    window.dispatchEvent(new CustomEvent('closeAllPanels'));
  }, [pathname]);

  // Smooth fade-in on route transitions (replaces Astro View Transitions)
  const desktopContentRef = useRef<HTMLElement>(null);
  const mobileContentRef = useRef<HTMLDivElement>(null);
  const prevPathnameRef = useRef(pathname);

  useEffect(() => {
    if (prevPathnameRef.current === pathname) return;
    prevPathnameRef.current = pathname;

    // Restart the fade-in animation on both content containers
    const targets = [desktopContentRef.current, mobileContentRef.current];
    for (const el of targets) {
      if (!el) continue;
      el.classList.remove('route-fade-in');
      // Force reflow so removing + re-adding the class restarts the animation
      void el.offsetWidth;
      el.classList.add('route-fade-in');
    }

    // Emit astro:page-load so shared components (content lists, navigation,
    // etc.) that relied on Astro View Transitions still get notified of route
    // changes in the SPA.
    document.dispatchEvent(new Event('astro:page-load'));
  }, [pathname]);

  // Invalidate navigation cache when spaces/threads are created or deleted
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

    window.addEventListener('spaceCreated', refresh);
    window.addEventListener('threadCreated', refresh);
    window.addEventListener('spaceDeleted', handleSpaceDeleted);
    window.addEventListener('threadDeleted', refresh);
    return () => {
      window.removeEventListener('spaceCreated', refresh);
      window.removeEventListener('threadCreated', refresh);
      window.removeEventListener('spaceDeleted', handleSpaceDeleted);
      window.removeEventListener('threadDeleted', refresh);
    };
  }, [refreshNavigation]);

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
    ...(nav?.spaces ?? []),
    ...(nav?.memberOfSpaces ?? []),
  ].map(s => ({
    id: s.id,
    title: s.title,
    totalItemCount: 0,
    backgroundGradient: s.backgroundGradient,
  }));

  const allThreads = nav?.threads ?? [];

  // For note pages, the "active thread" in the nav is the note's parent thread.
  // Fall back to the localStorage-cached value so the thread is highlighted immediately
  // on first render before useNote finishes loading.
  const noteParentThreadId = currentNote?.threads?.[0]?.id
    ?? (isNote ? getCachedNoteParentThreadId(noteIdForHook) : null);

  // nav threads have full IDs like "thread_abc123"; URL has "/thread/abc123"
  const activeThread = isThread
    ? (nav?.threads.find(t => t.id === `thread_${pathSlug}`) ?? null)
    : isNote
    ? (noteParentThreadId
        ? (nav?.threads.find(t => t.id === noteParentThreadId)
            ?? getCachedNoteParentThread(noteIdForHook))
        : null)
    : null;

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

  const contentType: 'thread' | 'note' | 'space' | 'dashboard' | 'profile' =
    isNote ? 'note' :
    isThread ? 'thread' :
    isSpace ? 'space' :
    pathname === '/profile' ? 'profile' :
    'dashboard';

  // Unorganized thread is virtual — it has no editable options, so hide the ActionStrip dock
  const isUnorganized = isThread && currentId === 'thread_unorganized';
  const showActionStrip = (contentType === 'thread' || contentType === 'note' || contentType === 'space') && !isUnorganized;

  return (
    <div className="app-layout">
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
              <Outlet />
            </div>
            {contentType !== 'profile' && contentType !== 'search' && contentType !== 'new-space' && (
              <CreateNoteButton />
            )}
            {showActionStrip && (
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
            initialPath={pathname}
            onNavigate={(href) => router.navigate({ to: href as any })}
          />
        </div>

        {/* Main content + CreateNoteButton + mobile-action-strip-dock (matches SSR mobile-main) */}
        <div className={`mobile-main main-column-with-cta route-fade-in ${showActionStrip ? 'mobile-main--with-dock' : ''}`} ref={mobileContentRef}>
          <div className="mobile-main__body">
            <div className="main-column__scroll">
              <Outlet />
            </div>
            {contentType !== 'profile' && contentType !== 'search' && contentType !== 'new-space' && (
              <CreateNoteButton />
            )}
            {showActionStrip && (
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

    </div>
  );
}

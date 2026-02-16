import { useAuth, useUser } from '@clerk/clerk-react';
import { Outlet, useRouter, useRouterState } from '@tanstack/react-router';
import { useEffect } from 'react';
import NavigationIsland from '../../../src/components/react/navigation/NavigationIsland';
import MobileNavigation from '../../../src/components/react/navigation/MobileNavigation';
import PanelManagerWithContext from '../../../src/components/react/PanelManagerWithContext';
import MobileBottomSheetWithContext from '../../../src/components/react/MobileBottomSheetWithContext';
import SquareButton from '../../../src/components/react/SquareButton';
import { useNavigation, useRefreshNavigation } from '../hooks/queries/useNavigation';
import { useProfile, getCachedUserColor } from '../hooks/queries/useProfile';
import { useNote, getCachedNoteParentThreadId, getCachedNoteParentThread } from '../hooks/queries/useNote';

export default function AppLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const { data: nav } = useNavigation();
  const refreshNavigation = useRefreshNavigation();
  const { data: profile } = useProfile();

  // Derive current IDs from path before hooks (hooks must be called unconditionally)
  const pathSlugEarly = pathname.split('/').pop() || '';
  const isNoteEarly = pathname.startsWith('/note/');
  const noteIdForHook = isNoteEarly
    ? (pathSlugEarly.startsWith('note_') ? pathSlugEarly : `note_${pathSlugEarly}`)
    : '';

  // When viewing a note page, fetch note details to get parent thread/type
  // This will be a cache hit (NotePage already fetched it) — no extra network request
  const { data: currentNote } = useNote(noteIdForHook);

  // Redirect to sign-in if not authenticated
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      // Pass current path as redirectUrl so after sign-in the user lands back here
      const redirectUrl = encodeURIComponent(pathname);
      router.navigate({ to: `/sign-in?redirect_url=${redirectUrl}` as any });
    }
  }, [isLoaded, isSignedIn, router, pathname]);

  // Close any open desktop panel when the route changes (panel manager stays mounted across routes).
  // Also clear localStorage panel keys so LOAD_FROM_STORAGE doesn't reopen them on next mount.
  useEffect(() => {
    localStorage.removeItem('showNewNotePanel');
    localStorage.removeItem('showNewThreadPanel');
    localStorage.removeItem('showNewResourcePanel');
    localStorage.removeItem('showProfilePanel');
    window.dispatchEvent(new CustomEvent('closeAllPanels'));
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

  // Note-specific data for SquareButton menu
  const noteType = isNote ? (currentNote?.noteType ?? 'default') : undefined;
  const noteCurrentThreadId = noteParentThreadId ?? undefined;
  const noteSimpleId = isNote ? (currentNote?.simpleNoteId ?? null) : null;

  const contentType: 'thread' | 'note' | 'space' | 'dashboard' | 'profile' =
    isNote ? 'note' :
    isThread ? 'thread' :
    isSpace ? 'space' :
    pathname === '/profile' ? 'profile' :
    'dashboard';

  // Unorganized thread is virtual — it has no editable options, so hide the More button
  const isUnorganized = isThread && currentId === 'thread_unorganized';

  return (
    <div className="app-layout">

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
          />
        </section>

        {/* Column 2: Main content */}
        <section className="layout-column">
          <Outlet />
        </section>

        {/* Column 3: More/Add buttons + slide-in panel manager */}
        <section className="layout-column">
          <div className="desktop-panel-container">
            {/* DesktopPanelManager hides this by id when a panel opens */}
            <div
              id="square-buttons-container"
              className={`square-buttons-container ${contentType !== 'dashboard' && !isUnorganized ? 'square-buttons-container--with-more' : ''}`}
            >
              {contentType !== 'dashboard' && contentType !== 'profile' && !isUnorganized && (
                <SquareButton
                  variant="More"
                  withMenu={true}
                  contentType={contentType}
                  contentId={currentId}
                  noteType={noteType}
                  currentThreadId={noteCurrentThreadId}
                  noteSimpleId={noteSimpleId}
                />
              )}
              {contentType !== 'profile' && (
                <SquareButton variant="Add" withMenu={true} />
              )}
            </div>
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
          />
        </div>

        {/* Main content */}
        <div className="mobile-main">
          <Outlet />
        </div>

        {/* Bottom additional slot — More/Add buttons */}
        {contentType !== 'profile' && (
          <div className={`mobile-additional square-buttons-container ${contentType !== 'dashboard' && !isUnorganized ? 'square-buttons-container--with-more' : ''}`}>
            {contentType !== 'dashboard' && !isUnorganized && (
              <SquareButton
                variant="More"
                withMenu={true}
                contentType={contentType}
                contentId={currentId}
                noteType={noteType}
                currentThreadId={noteCurrentThreadId}
              />
            )}
            <SquareButton variant="Add" withMenu={true} />
          </div>
        )}

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

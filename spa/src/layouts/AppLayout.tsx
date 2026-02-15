import { useAuth, useUser } from '@clerk/clerk-react';
import { Outlet, useRouter, useRouterState } from '@tanstack/react-router';
import { useEffect } from 'react';
import NavigationIsland from '../../../src/components/react/navigation/NavigationIsland';
import MobileNavigation from '../../../src/components/react/navigation/MobileNavigation';
import PanelManagerWithContext from '../../../src/components/react/PanelManagerWithContext';
import MobileBottomSheetWithContext from '../../../src/components/react/MobileBottomSheetWithContext';
import SquareButton from '../../../src/components/react/SquareButton';
import { useNavigation } from '../hooks/queries/useNavigation';
import { useProfile } from '../hooks/queries/useProfile';
import { useNote } from '../hooks/queries/useNote';

export default function AppLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const { data: nav } = useNavigation();
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
      router.navigate({ to: '/sign-in' });
    }
  }, [isLoaded, isSignedIn, router]);

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

  // For note pages, the "active thread" in the nav is the note's parent thread
  const noteParentThreadId = currentNote?.threads?.[0]?.id ?? null;

  // nav threads have full IDs like "thread_abc123"; URL has "/thread/abc123"
  const activeThread = isThread
    ? (nav?.threads.find(t => t.id === `thread_${pathSlug}`) ?? null)
    : isNote
    ? (noteParentThreadId ? (nav?.threads.find(t => t.id === noteParentThreadId) ?? null) : null)
    : null;

  const currentSpace = spaceId
    ? { id: spaceId }
    : (activeThread?.spaceId ? { id: activeThread.spaceId } : null);

  // Note-specific data for SquareButton menu
  const noteType = isNote ? (currentNote?.type ?? 'default') : undefined;
  const noteCurrentThreadId = noteParentThreadId ?? undefined;

  const contentType: 'thread' | 'note' | 'space' | 'dashboard' | 'profile' =
    isNote ? 'note' :
    isThread ? 'thread' :
    isSpace ? 'space' :
    pathname === '/profile' ? 'profile' :
    'dashboard';

  // Build spaces list (owned + member)
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
            showProfile={isNote}
            initials={`${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.trim()}
            userColor={profile?.userColor ?? 'blue'}
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
              className={`square-buttons-container ${contentType !== 'dashboard' ? 'square-buttons-container--with-more' : ''}`}
            >
              {contentType !== 'dashboard' && contentType !== 'profile' && (
                <SquareButton
                  variant="More"
                  withMenu={true}
                  contentType={contentType}
                  contentId={currentId}
                  noteType={noteType}
                  currentThreadId={noteCurrentThreadId}
                />
              )}
              {contentType !== 'profile' && (
                <SquareButton variant="Add" withMenu={true} />
              )}
            </div>
            <PanelManagerWithContext
              currentThread={activeThread}
              currentSpace={currentSpace}
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
            userColor={profile?.userColor ?? 'blue'}
            initialPath={pathname}
          />
        </div>

        {/* Main content */}
        <div className="mobile-main">
          <Outlet />
        </div>

        {/* Bottom additional slot — More/Add buttons */}
        {contentType !== 'profile' && (
          <div className={`mobile-additional square-buttons-container ${contentType !== 'dashboard' ? 'square-buttons-container--with-more' : ''}`}>
            {contentType !== 'dashboard' && (
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
          contentType={contentType}
          publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
        />

      </div>

    </div>
  );
}

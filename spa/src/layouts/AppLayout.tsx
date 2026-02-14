import { useAuth, useUser } from '@clerk/clerk-react';
import { Outlet, useRouter, useRouterState } from '@tanstack/react-router';
import { useEffect } from 'react';
import NavigationIsland from '../../../src/components/react/navigation/NavigationIsland';
import { useNavigation } from '../hooks/queries/useNavigation';

export default function AppLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const { data: nav } = useNavigation();

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
  const currentId = pathname.split('/').pop() || '';
  const isNote = pathname.startsWith('/note/');
  const spaceId = pathname.startsWith('/s/') ? pathname.split('/')[2] : undefined;

  const activeThread = nav?.threads.find(t =>
    pathname.startsWith(`/thread/${t.id}`)
  ) ?? null;

  const currentSpace = spaceId
    ? { id: spaceId }
    : (activeThread?.spaceId ? { id: activeThread.spaceId } : null);

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

  return (
    <div className="app-shell">
      <NavigationIsland
        inboxCount={nav?.inboxCount ?? 0}
        spaces={allSpaces}
        activeThread={activeThread ?? null}
        currentSpace={currentSpace}
        isNote={isNote}
        currentId={currentId}
        showProfile={true}
        initials={user?.firstName?.[0] ?? ''}
        userColor={'blue'}
        pathname={pathname}
      />
      <main className="app-shell__content">
        <Outlet />
      </main>
    </div>
  );
}

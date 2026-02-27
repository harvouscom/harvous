import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from '@tanstack/react-router';
import { useUser } from '@clerk/clerk-react';
import { useSpace, useSpaceItems } from '../hooks/queries/useSpace';
import { safeGetItem, safeSetItem } from '../../../src/utils/safe-storage';
import SpaceContentList from '../../../src/components/react/SpaceContentList';
import SpaceCardStackHeader from '../../../src/components/react/SpaceCardStackHeader';
import TabNav from '../../../src/components/react/TabNav';
import CardStack from '../components/CardStack';

type SpaceFilter = 'all' | 'threads' | 'notes' | 'scripture' | 'resources';

const TABS: Array<{ id: SpaceFilter; label: string }> = [
  { id: 'all',       label: 'All' },
  { id: 'threads',   label: 'Threads' },
  { id: 'notes',     label: 'Notes' },
  { id: 'scripture', label: 'Scripture' },
];

export default function SpacePage() {
  const { spaceId: spaceSlug } = useParams({ strict: false }) as { spaceId: string };
  const navigate = useNavigate();
  // URL param is the slug (e.g. "ghi789"); DB + API need the full prefixed ID
  const spaceId = spaceSlug.startsWith('space_') ? spaceSlug : `space_${spaceSlug}`;
  const { user } = useUser();
  const { data: space, isLoading, isError } = useSpace(spaceId);
  const { data: spaceItems, isFetching: isFetchingItems } = useSpaceItems(spaceId);
  const [filter, setFilter] = useState<SpaceFilter>('all');

  const initialItems = spaceItems ?? [];
  const parentIsLoading = initialItems.length === 0 && isFetchingItems;

  // Redirect when space no longer exists (e.g. deleted) so we don't render SpaceContentList for a 404 space
  useEffect(() => {
    if (isError) navigate({ to: '/', replace: true });
  }, [isError, navigate]);

  // Track this space visit in navigation history so NavigationColumn shows it in the dropdown.
  // (NavigationContext isn't mounted in the SPA, so trackNavigationAccess() never runs.)
  useEffect(() => {
    if (!space) return;
    try {
      const stored = safeGetItem('harvous-navigation-history-v2');
      const history: any[] = stored ? JSON.parse(stored) : [];
      const existingIndex = history.findIndex((item: any) => item.id === spaceId);
      const now = Date.now();
      if (existingIndex !== -1) {
        history[existingIndex] = { ...history[existingIndex], title: space.title, lastAccessed: now };
      } else {
        history.push({ id: spaceId, title: space.title, backgroundGradient: space.backgroundGradient, firstAccessed: now, lastAccessed: now });
      }
      safeSetItem('harvous-navigation-history-v2', JSON.stringify(history));
      // Notify NavigationColumn to re-read history
      window.dispatchEvent(new CustomEvent('navigationHistoryUpdated'));
    } catch {
      // ignore storage errors
    }
  }, [spaceId, space]);

  const headerBgColor = space?.color
    ? `var(--color-${space.color})`
    : 'var(--color-paper)';

  const tabs = TABS.map(t => ({ ...t, isActive: t.id === filter }));

  if (isLoading) {
    return (
      <CardStack title="Loading..." headerBgColor="var(--color-paper)" centerTitle>
        <div className="page-loading" />
      </CardStack>
    );
  }

  if (isError) {
    return (
      <CardStack title="Space not found" headerBgColor="var(--color-paper)" centerTitle>
        <p className="page-error-message">This space doesn&apos;t exist or you don&apos;t have access to it.</p>
        <Link to="/" className="primary-button">Back to dashboard</Link>
      </CardStack>
    );
  }

  return (
    <CardStack
      title={space?.title ?? 'Space'}
      headerBgColor={headerBgColor}
      header={space ? (
        <SpaceCardStackHeader
          initialTitle={space.title}
          initialColor={(space.color ?? 'paper') as any}
          spaceId={spaceId}
          currentUserId={user?.id}
        />
      ) : undefined}
    >
      <TabNav
        tabs={tabs}
        onTabChange={(id) => setFilter(id as SpaceFilter)}
        className="content-tabs"
      />
      <SpaceContentList
        initialItems={initialItems}
        spaceId={spaceId}
        filter={filter}
        spaceIsShared={space?.isPublic}
        isOwner={space?.ownerId === user?.id}
        currentUserId={user?.id ?? null}
        parentIsLoading={parentIsLoading}
      />
      {/* Spacer so the last item can scroll above the floating "Create a note" button */}
      <div data-cta-spacer className="create-note-cta-spacer" />
    </CardStack>
  );
}

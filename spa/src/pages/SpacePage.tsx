import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useParams, Link, useNavigate } from '@tanstack/react-router';
import { useUser } from '@clerk/clerk-react';
import { useSpaceBootstrap } from '../hooks/queries/useSpace';
import { useNavigation } from '../hooks/queries/useNavigation';
import { getThreadQueryOptions } from '../hooks/queries/useThread';
import { getNoteQueryOptions, seedNoteFromList, type ListNoteForSeed } from '../hooks/queries/useNote';
import { safeGetItem, safeSetItem } from '../../../src/utils/safe-storage';
import {
  getStoredSpaceContentTab,
  setStoredSpaceContentTab,
  type SpaceContentTabId,
} from '../../../src/utils/content-tab-storage';
import SpaceContentList from '../../../src/components/react/SpaceContentList';
import SpaceCardStackHeader from '../../../src/components/react/SpaceCardStackHeader';
import TabNav from '../../../src/components/react/TabNav';
import FindSearchInput from '../../../src/components/react/FindSearchInput';
import RecentSearches from '../../../src/components/react/RecentSearches';
import CreateNoteButton from '../../../src/components/react/CreateNoteButton';
import CardStack from '../components/CardStack';
import SubtleContentMount from '@/components/react/SubtleContentMount';
import SearchResultsList, { fetchSearchResults, searchQueryKey } from '../components/SearchResultsList';
import { useIsMobile } from '../hooks/useIsMobile';

type SpaceFilter = 'all' | 'threads' | 'notes' | 'scripture' | 'resources' | 'search';

const TABS: Array<{ id: SpaceFilter; label: string }> = [
  { id: 'all',       label: 'All' },
  { id: 'threads',   label: 'Threads' },
  { id: 'notes',     label: 'Notes' },
  { id: 'scripture', label: 'Scripture' },
  { id: 'search',    label: 'Search' },
];

export default function SpacePage() {
  const { spaceId: spaceSlug } = useParams({ strict: false }) as { spaceId: string };
  const navigate = useNavigate();
  // URL param is the slug (e.g. "ghi789"); DB + API need the full prefixed ID
  const spaceId = spaceSlug.startsWith('space_') ? spaceSlug : `space_${spaceSlug}`;
  const { user } = useUser();
  const queryClient = useQueryClient();
  const { data: bootstrap, isLoading, isError, isFetching } = useSpaceBootstrap(spaceId);
  const { data: nav } = useNavigation();
  const space = bootstrap?.space;
  const spaceItems = bootstrap?.items;
  const [filter, setFilter] = useState<SpaceFilter>(() => getStoredSpaceContentTab(spaceId) ?? 'all');
  const [scopedSearchQuery, setScopedSearchQuery] = useState('');
  const [prevSpaceId, setPrevSpaceId] = useState(spaceId);
  if (spaceId !== prevSpaceId) {
    setPrevSpaceId(spaceId);
    setFilter(getStoredSpaceContentTab(spaceId) ?? 'all');
  }

  const handleSpaceTabChange = useCallback(
    (id: string) => {
      setFilter(id as SpaceFilter);
      setStoredSpaceContentTab(spaceId, id as SpaceContentTabId);
    },
    [spaceId],
  );

  const prefetchSpaceSearch = useCallback(
    (term: string) => {
      if (!term.trim()) return;
      queryClient.prefetchQuery({
        queryKey: searchQueryKey(term, { spaceId }),
        queryFn: () => fetchSearchResults(term, { spaceId }),
      });
    },
    [queryClient, spaceId],
  );

  // Prefetch thread details for threads in this space that aren't in nav (e.g. joined space)
  // so the thread page header shows title/color immediately when the user clicks a thread.
  const PREFETCH_THREAD_LIMIT = 15;
  useEffect(() => {
    if (!spaceId || !spaceItems?.length || !nav) return;
    const navThreadIds = new Set((nav.threads ?? []).map((t) => t.id));
    const threadIds = spaceItems
      .filter((item) => item.itemType === 'thread' && item.id && item.id !== 'thread_unorganized' && !navThreadIds.has(item.id))
      .slice(0, PREFETCH_THREAD_LIMIT)
      .map((item) => item.id);
    threadIds.forEach((threadId) => {
      queryClient.prefetchQuery(getThreadQueryOptions(threadId));
    });
  }, [spaceId, spaceItems, nav, queryClient]);

  const prefetchNote = (noteId: string) => {
    queryClient.prefetchQuery(getNoteQueryOptions(noteId));
  };

  // Build thread lookup from bootstrap items for seeding note cache with real thread context
  const spaceThreadLookup = useMemo(() => {
    if (!spaceItems?.length) return new Map<string, { title: string; color: string | null; backgroundGradient?: string }>();
    const threads = spaceItems.filter((i) => i.itemType === 'thread');
    return new Map(threads.map((t) => [t.id, { title: t.title, color: t.accentColor ?? null, backgroundGradient: t.backgroundGradient }]));
  }, [spaceItems]);

  const onNotesLoaded = useCallback(
    (notes: ListNoteForSeed[]) => {
      notes.forEach((n) => {
        const threadId = n.threadId ?? spaceId;
        const thread = spaceThreadLookup.get(threadId);
        seedNoteFromList(queryClient, n, {
          id: threadId,
          title: thread?.title ?? 'Thread',
          color: thread?.color ?? null,
          backgroundGradient: thread?.backgroundGradient ?? 'var(--color-gradient-gray)',
        });
      });
    },
    [queryClient, spaceId, spaceThreadLookup]
  );

  // Seed note cache from initial bootstrap items so opening a note shows content immediately
  useEffect(() => {
    if (!spaceItems?.length) return;
    const notes = spaceItems.filter((i: { itemType?: string }) => i.itemType === 'note') as ListNoteForSeed[];
    if (notes.length) onNotesLoaded(notes);
  }, [spaceItems, onNotesLoaded]);

  const navSpace = nav?.spaces?.find(s => s.id === spaceId) ?? nav?.memberOfSpaces?.find(s => s.id === spaceId);
  const resolvedSpaceTitle = space?.title ?? navSpace?.title ?? 'Space';
  const resolvedSpaceColor = (space?.color ?? navSpace?.color ?? 'paper') as 'paper' | 'blue' | 'yellow' | 'orange' | 'pink' | 'purple' | 'green';

  const initialItems = spaceItems ?? [];
  const parentIsLoading = initialItems.length === 0 && isFetching;
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

  const headerBgColor = `var(--color-${resolvedSpaceColor})`;
  const isMobile = useIsMobile();

  const tabs = TABS.map(t => ({ ...t, isActive: t.id === filter }));

  if (isLoading) {
    return (
      <CardStack
        headerBgColor={headerBgColor}
        isLoading={true}
        header={
          <SpaceCardStackHeader
            initialTitle={resolvedSpaceTitle}
            initialColor={resolvedSpaceColor}
            spaceId={spaceId}
            currentUserId={user?.id}
          />
        }
      >
        {/* Body empty while loading; content fades in when space loads */}
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
      isLoading={parentIsLoading}
      header={space ? (
        <SpaceCardStackHeader
          initialTitle={space.title}
          initialColor={(space.color ?? 'paper') as any}
          spaceId={spaceId}
          currentUserId={user?.id}
        />
      ) : undefined}
    >
      <SubtleContentMount key={spaceId} variant="fade">
        <TabNav
          tabs={tabs}
          onTabChange={handleSpaceTabChange}
          className="content-tabs"
        />
        {filter === 'search' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <FindSearchInput
              placeholder="Search this space…"
              initialQuery={scopedSearchQuery}
              onBeforeSearchNavigate={prefetchSpaceSearch}
              onSubmitSearch={setScopedSearchQuery}
              onClearSearch={() => setScopedSearchQuery('')}
              recentSearchRecordScope={{ type: 'space', id: spaceId }}
            />
            {!scopedSearchQuery.trim() && (
              <RecentSearches
                storageScope={{ type: 'space', id: spaceId }}
                onPrefetchSearch={prefetchSpaceSearch}
                onSelectRecentTerm={(term) => {
                  prefetchSpaceSearch(term);
                  setScopedSearchQuery(term);
                }}
              />
            )}
            <SearchResultsList
              query={scopedSearchQuery}
              scope={{ spaceId }}
              recentSearchCountSync={{ type: 'space', id: spaceId }}
            />
          </div>
        ) : (
          <SpaceContentList
            initialItems={initialItems}
            spaceId={spaceId}
            filter={filter}
            spaceIsShared={space?.isPublic}
            isOwner={space?.ownerId === user?.id}
            currentUserId={user?.id ?? null}
            parentIsLoading={parentIsLoading}
            onPrefetchNote={prefetchNote}
            onNotesLoaded={onNotesLoaded}
          />
        )}
        {/* Spacer so the last item can scroll above the floating "Create a note" button */}
        <div data-cta-spacer className="create-note-cta-spacer" />
      </SubtleContentMount>
      {isMobile && <CreateNoteButton addToSpaceSpaceId={spaceId} />}
    </CardStack>
  );
}

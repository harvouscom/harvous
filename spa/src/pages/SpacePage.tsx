import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useParams, Link, useNavigate } from '@tanstack/react-router';
import { useUser } from '@clerk/clerk-react';
import { useSpaceBootstrap, getCachedSpaceBootstrap } from '../hooks/queries/useSpace';
import { useNavigation } from '../hooks/queries/useNavigation';
import { getThreadQueryOptions } from '../hooks/queries/useThread';
import { getNoteQueryOptions, seedNoteFromList, type ListNoteForSeed } from '../hooks/queries/useNote';
import { setSelectedSpaceId } from '../../../src/components/react/navigation/selectedSpace';
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
import CardStack from '../components/CardStack';
import SubtleContentMount from '@/components/react/SubtleContentMount';
import SearchResultsList, { fetchSearchResults, searchQueryKey } from '../components/SearchResultsList';
import { useDebouncedSearchState } from '../hooks/useDebouncedSearchState';
import { MIN_SEARCH_QUERY_LENGTH } from '@/utils/search-query';
import { prefetchThreadRouteIntent } from '../utils/prefetch-route-intent';
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
  const { input: searchInput, setInput: setSearchInput, debounced: debouncedSearch, clear: clearSearch, applyImmediate: applySearchImmediate } =
    useDebouncedSearchState();
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
      const t = term.trim();
      if (!t || t.length < MIN_SEARCH_QUERY_LENGTH) return;
      queryClient.prefetchQuery({
        queryKey: searchQueryKey(t, { spaceId }),
        queryFn: () => fetchSearchResults(t, { spaceId }),
      });
    },
    [queryClient, spaceId],
  );

  useEffect(() => {
    clearSearch();
  }, [spaceId, clearSearch]);

  // Invalidate the members cache when the Astro-island EditSpacePeoplePanel
  // removes or adds a member (cross-context signal via DOM custom event).
  useEffect(() => {
    const handler = (e: Event) => {
      const { spaceId: changedSpaceId } = (e as CustomEvent<{ spaceId: string }>).detail;
      queryClient.invalidateQueries({ queryKey: ['space', changedSpaceId, 'members'] });
    };
    window.addEventListener('harvous:spacesMembersChanged', handler);
    return () => window.removeEventListener('harvous:spacesMembersChanged', handler);
  }, [queryClient]);

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

  const onThreadIntent = useCallback(
    (threadId: string) => prefetchThreadRouteIntent(queryClient, threadId),
    [queryClient],
  );

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
  const hasBootstrapShellHint = !!navSpace || !!getCachedSpaceBootstrap(spaceId);
  const parentIsLoading = initialItems.length === 0 && (isFetching || (isLoading && hasBootstrapShellHint));
  // Redirect when space no longer exists (e.g. deleted) so we don't render SpaceContentList for a 404 space
  useEffect(() => {
    if (isError) navigate({ to: '/', replace: true });
  }, [isError, navigate]);

  // Ensure selected space storage is always in sync with the current URL.
  // NavigationColumn does this via its URL-sync effect, but calling it here eliminates
  // any race between NavigationColumn's effect and PersistentNavigation's first render.
  useEffect(() => {
    setSelectedSpaceId(spaceId);
  }, [spaceId]);

  // Space visits are recorded in harvous-navigation-history-v2 by NavigationContext.trackNavigationAccess()
  // (app:route-change on pathname). Avoid duplicating that write here — it bypassed closed-item filtering.

  const headerBgColor = `var(--color-${resolvedSpaceColor})`;
  const tabs = TABS.map(t => ({ ...t, isActive: t.id === filter }));

  // Full-page loading only when we have no nav hint and no session bootstrap (cold open / unknown id).
  if (isLoading && !hasBootstrapShellHint) {
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
      title={resolvedSpaceTitle}
      headerBgColor={headerBgColor}
      isLoading={parentIsLoading}
      header={
        <SpaceCardStackHeader
          initialTitle={resolvedSpaceTitle}
          initialColor={resolvedSpaceColor as any}
          spaceId={spaceId}
          currentUserId={user?.id}
        />
      }
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
              value={searchInput}
              onValueChange={setSearchInput}
              onBeforeSearchNavigate={prefetchSpaceSearch}
              onSubmitSearch={() => {}}
              onClearSearch={clearSearch}
              recentSearchRecordScope={{ type: 'space', id: spaceId }}
            />
            {!searchInput.trim() && (
              <RecentSearches
                storageScope={{ type: 'space', id: spaceId }}
                onPrefetchSearch={prefetchSpaceSearch}
                onSelectRecentTerm={(term) => {
                  prefetchSpaceSearch(term);
                  applySearchImmediate(term);
                }}
              />
            )}
            <SearchResultsList
              query={debouncedSearch}
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
            onThreadIntent={onThreadIntent}
          />
        )}
        {/* Spacer so the last item can scroll above the floating "Create a note" button */}
        <div data-cta-spacer className="create-note-cta-spacer" />
      </SubtleContentMount>
    </CardStack>
  );
}

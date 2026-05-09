import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import OrganizedContentList from '../../../src/components/react/OrganizedContentList';
import TabNav from '../../../src/components/react/TabNav';
import FindSearchInput from '../../../src/components/react/FindSearchInput';
import RecentSearches from '../../../src/components/react/RecentSearches';
import CardStack from '../components/CardStack';
import SearchResultsList, { fetchSearchResults, searchQueryKey } from '../components/SearchResultsList';
import { useDebouncedSearchState } from '../hooks/useDebouncedSearchState';
import { useDashboardContent } from '../hooks/queries/useDashboard';
import { useProfile } from '../hooks/queries/useProfile';
import { getNoteQueryOptions, seedNoteFromList, type ListNoteForSeed } from '../hooks/queries/useNote';
import { useFeaturedItems } from '../hooks/queries/useFeaturedItems';
import FeaturedCarousel from '../components/FeaturedCarousel';
import SubtleContentMount from '@/components/react/SubtleContentMount';
import { addRecentSearchTerm } from '@/utils/recent-search-storage';
import { MIN_SEARCH_QUERY_LENGTH } from '@/utils/search-query';
import {
  getStoredDashboardContentTab,
  setStoredDashboardContentTab,
  type DashboardContentTabId,
} from '@/utils/content-tab-storage';
import { prefetchThreadRouteIntent } from '../utils/prefetch-route-intent';
import { MY_PILE_THREAD_TITLE } from '@/utils/my-pile-thread';
import { useSelectedSpaceId } from '../../../src/components/react/navigation/selectedSpace';

type DashboardContentFilter = 'all' | 'threads' | 'notes' | 'scripture' | 'resources';

const TABS: Array<{ id: DashboardContentTabId; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'threads', label: 'Threads' },
  { id: 'notes', label: 'Notes' },
  { id: 'scripture', label: 'Scripture' },
  { id: 'search', label: 'Search' },
];

export default function DashboardPage() {
  const { user } = useUser();
  const { isLoaded, isSignedIn } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<DashboardContentTabId>(() => getStoredDashboardContentTab() ?? 'all');
  const { input: searchInput, setInput: setSearchInput, debounced: debouncedSearch, clear: clearSearch, applyImmediate: applySearchImmediate } =
    useDebouncedSearchState();
  const authReady = isLoaded && isSignedIn;
  useProfile();
  const { data: featuredItems, isPending: featuredPending } = useFeaturedItems({ enabled: authReady });

  const lastListFilterRef = useRef<Exclude<DashboardContentTabId, 'search'>>('all');
  if (filter !== 'search') {
    lastListFilterRef.current = filter;
  }

  const listFilterForQuery = lastListFilterRef.current as DashboardContentFilter;

  const { data: cachedContent, dataUpdatedAt, isFetching } = useDashboardContent(
    listFilterForQuery,
    30,
    {
      enabled: authReady && filter !== 'search',
    },
  );
  const cachedItems = cachedContent?.pages.flatMap(p => p.items) ?? [];
  const lastPage = cachedContent?.pages?.length ? cachedContent.pages[cachedContent.pages.length - 1] : undefined;
  const initialHasMoreFromParent = lastPage?.hasMore;

  // Initial load waits for both dashboard content and featured items so VOTD/carousel and list
  // appear together (not list first then featured popping in).
  const listAwaitingFirstPage = filter !== 'search' && cachedItems.length === 0 && isFetching;
  const featuredAwaitingFirstLoad = filter !== 'search' && featuredPending;
  const isInitialLoading = listAwaitingFirstPage || featuredAwaitingFirstLoad;

  const hasEverLoadedRef = useRef(false);
  if (!isInitialLoading) {
    hasEverLoadedRef.current = true;
  }
  // Only block the whole page on the very first load; tab switches use inline list loading.
  const showFullPageLoading = isInitialLoading && !hasEverLoadedRef.current;

  // Seed the note detail cache from dashboard content so notes open instantly (no empty flash).
  // Dashboard items include rawContent (full HTML) alongside the truncated preview.
  const seededRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!cachedItems.length) return;
    for (const item of cachedItems) {
      const noteItem = item as any;
      if (noteItem.type !== 'note' || !noteItem.noteId) continue;
      if (seededRef.current.has(noteItem.noteId)) continue;
      seededRef.current.add(noteItem.noteId);

      const listNote: ListNoteForSeed = {
        id: noteItem.noteId,
        title: noteItem.rawTitle ?? noteItem.title,
        content: noteItem.rawContent ?? noteItem.content,
        contentEncrypted: noteItem.contentEncrypted,
        noteType: noteItem.noteType,
        threadId: noteItem.threadId,
        spaceId: noteItem.spaceId,
        simpleNoteId: noteItem.simpleNoteId ?? undefined,
        createdAt: noteItem.createdAt,
        updatedAt: noteItem.updatedAt,
        resourceTitle: noteItem.resourceTitle,
        resourceDescription: noteItem.resourceDescription,
        resourceImage: noteItem.resourceImage,
        version: noteItem.version,
        userId: noteItem.userId,
        primaryCollection: noteItem.primaryCollection ?? null,
        secondaryCollections: Array.isArray(noteItem.secondaryCollections) ? noteItem.secondaryCollections : [],
        collectionPinned: noteItem.collectionPinned ?? false,
        collectionUserOverride: noteItem.collectionUserOverride ?? false,
      };
      seedNoteFromList(queryClient, listNote, {
        id: noteItem.threadId ?? noteItem.noteId,
        title: noteItem.threadTitle ?? (noteItem.threadId === 'thread_unorganized' ? MY_PILE_THREAD_TITLE : 'Thread'),
        color: noteItem.threadColor ?? null,
        backgroundGradient: noteItem.threadBackgroundGradient ?? 'var(--color-gradient-gray)',
      });
    }
  }, [cachedItems, queryClient]);

  const spaceIdForLinks = useSelectedSpaceId(null);

  const prefetchSearch = useCallback(
    (term: string) => {
      const t = term.trim();
      if (!t || t.length < MIN_SEARCH_QUERY_LENGTH) return;
      queryClient.prefetchQuery({
        queryKey: searchQueryKey(t),
        queryFn: () => fetchSearchResults(t),
      });
    },
    [queryClient],
  );

  useEffect(() => {
    clearSearch();
  }, [user?.id, clearSearch]);

  // Prefetch full note details on hover/touch as a backup
  const prefetchNote = useCallback((noteId: string) => {
    queryClient.prefetchQuery(getNoteQueryOptions(noteId));
  }, [queryClient]);

  const onThreadIntent = useCallback(
    (threadId: string) => prefetchThreadRouteIntent(queryClient, threadId),
    [queryClient],
  );

  const handleTabChange = useCallback((id: string) => {
    const next = id as DashboardContentTabId;
    setFilter(next);
    setStoredDashboardContentTab(next);
  }, []);

  const tabs = TABS.map(t => ({ ...t, isActive: t.id === filter }));

  const contentListFilter: DashboardContentFilter =
    filter === 'search' ? 'all' : (filter as DashboardContentFilter);

  return (
    <CardStack title="My Home" headerBgColor="var(--color-paper)" centerTitle isLoading={showFullPageLoading}>
      {!showFullPageLoading && (
        <>
          {filter !== 'search' && featuredItems?.length ? <FeaturedCarousel items={featuredItems} /> : null}
          <SubtleContentMount key={user?.id ?? 'home'} variant="fade">
            <TabNav
              tabs={tabs}
              onTabChange={handleTabChange}
              className="dashboard-tab-nav content-tabs"
            />
            {filter === 'search' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <FindSearchInput
                  placeholder="Search my Harvous…"
                  value={searchInput}
                  onValueChange={setSearchInput}
                  onBeforeSearchNavigate={prefetchSearch}
                  onSubmitSearch={(term) => {
                    addRecentSearchTerm(null, term);
                  }}
                  onClearSearch={clearSearch}
                />
                {!searchInput.trim() && (
                  <RecentSearches
                    onPrefetchSearch={prefetchSearch}
                    onSelectRecentTerm={(term) => {
                      prefetchSearch(term);
                      applySearchImmediate(term);
                    }}
                  />
                )}
                <SearchResultsList
                  query={debouncedSearch}
                  recentSearchCountSync={null}
                  spaceIdForLinks={spaceIdForLinks}
                />
              </div>
            ) : (
              <OrganizedContentList
                initialItems={cachedItems as any}
                filter={contentListFilter}
                userId={user?.id}
                dataGeneratedAt={cachedItems.length > 0 ? dataUpdatedAt : undefined}
                onNavigate={(href) => navigate({ to: href as any })}
                parentIsLoading={listAwaitingFirstPage}
                initialHasMoreFromParent={initialHasMoreFromParent}
                onNotePrefetch={prefetchNote}
                onThreadIntent={onThreadIntent}
                spaceIdForLinks={spaceIdForLinks}
              />
            )}
            {/* Spacer so the last item can scroll above the floating "Create a note" button */}
            <div data-cta-spacer className="create-note-cta-spacer" />
          </SubtleContentMount>
        </>
      )}
    </CardStack>
  );
}

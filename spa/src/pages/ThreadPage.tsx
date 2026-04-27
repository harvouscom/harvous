import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useRouterState } from '@tanstack/react-router';
import { useThread } from '../hooks/queries/useThread';
import { useNavigation } from '../hooks/queries/useNavigation';
import { getNoteQueryOptions, seedNoteFromList, type ListNoteForSeed } from '../hooks/queries/useNote';
import ThreadNotesList from '../../../src/components/react/ThreadNotesList';
import ThreadCardStackHeader from '../../../src/components/react/ThreadCardStackHeader';
import TabNav from '../../../src/components/react/TabNav';
import FindSearchInput from '../../../src/components/react/FindSearchInput';
import RecentSearches from '../../../src/components/react/RecentSearches';
import CardStack from '../components/CardStack';
import SubtleContentMount from '@/components/react/SubtleContentMount';
import SearchResultsList, { fetchSearchResults, searchQueryKey } from '../components/SearchResultsList';
import { useDebouncedSearchState } from '../hooks/useDebouncedSearchState';
import { MIN_SEARCH_QUERY_LENGTH } from '@/utils/search-query';
import {
  getStoredThreadContentTab,
  setStoredThreadContentTab,
  type ThreadContentTabId,
} from '../../../src/utils/content-tab-storage';
import { MY_PILE_THREAD_TITLE, MY_PILE_THREAD_URL_SEGMENT } from '@/utils/my-pile-thread';

type NoteTypeFilter = 'all' | 'notes' | 'scripture' | 'search';

const TABS: Array<{ id: NoteTypeFilter; label: string }> = [
  { id: 'all',       label: 'All' },
  { id: 'notes',     label: 'Notes' },
  { id: 'scripture', label: 'Scripture' },
  { id: 'search',    label: 'Search' },
];

/** URL `/thread/mypile` and legacy `/thread/unorganized` map to DB id `thread_unorganized`. */
function threadSlugToThreadId(threadSlug: string): string {
  if (threadSlug === MY_PILE_THREAD_URL_SEGMENT || threadSlug === 'unorganized') {
    return 'thread_unorganized';
  }
  if (threadSlug.startsWith('thread_')) return threadSlug;
  return `thread_${threadSlug}`;
}

function getSpaceIdFromSearch(search: string | Record<string, unknown> | undefined): string | null {
  if (search == null) return null;
  // TanStack Router returns search as a parsed object (e.g. { space: 'space_xxx' }),
  // not a raw string. Handle both formats.
  if (typeof search === 'object') {
    const space = (search as Record<string, unknown>).space;
    return typeof space === 'string' && space.startsWith('space_') ? space : null;
  }
  const raw = typeof search === 'string' ? search : '';
  const params = new URLSearchParams(raw.startsWith('?') ? raw : `?${raw}`);
  const space = params.get('space');
  return space && space.startsWith('space_') ? space : null;
}

export default function ThreadPage() {
  const { threadId: threadSlug } = useParams({ strict: false }) as { threadId: string };
  const search = useRouterState({ select: (s) => s.location.search });
  const navigate = useNavigate();
  const threadId = threadSlugToThreadId(threadSlug);
  const isUnorganized = threadId === 'thread_unorganized';

  useEffect(() => {
    if (threadSlug === 'unorganized') {
      navigate({ to: '/thread/mypile', replace: true, search: (prev) => prev });
    }
  }, [threadSlug, navigate]);
  const queryClient = useQueryClient();
  const { data: threadPrefetch, isLoading } = useThread(threadId);
  const thread = threadPrefetch?.thread;
  const threadNoteTypeCounts = threadPrefetch?.noteTypeCounts;
  const { data: nav } = useNavigation();
  const [noteTypeFilter, setNoteTypeFilter] = useState<NoteTypeFilter>(
    () => getStoredThreadContentTab(threadId) ?? 'all',
  );
  const { input: searchInput, setInput: setSearchInput, debounced: debouncedSearch, clear: clearSearch, applyImmediate: applySearchImmediate } =
    useDebouncedSearchState();
  const [prevThreadId, setPrevThreadId] = useState(threadId);
  if (threadId !== prevThreadId) {
    setPrevThreadId(threadId);
    setNoteTypeFilter(getStoredThreadContentTab(threadId) ?? 'all');
  }

  const handleThreadTabChange = useCallback(
    (id: string) => {
      setNoteTypeFilter(id as NoteTypeFilter);
      setStoredThreadContentTab(threadId, id as ThreadContentTabId);
    },
    [threadId],
  );

  const prefetchThreadSearch = useCallback(
    (term: string) => {
      const t = term.trim();
      if (!t || t.length < MIN_SEARCH_QUERY_LENGTH) return;
      queryClient.prefetchQuery({
        queryKey: searchQueryKey(t, { threadId }),
        queryFn: () => fetchSearchResults(t, { threadId }),
      });
    },
    [queryClient, threadId],
  );

  useEffect(() => {
    clearSearch();
  }, [threadId, clearSearch]);

  // TanStack Router may not include unvalidated search params in location.search;
  // fall back to window.location.search so ?space= is always picked up.
  const urlSpaceId = useMemo(() => {
    let id = getSpaceIdFromSearch(search);
    if (!id && typeof window !== 'undefined') {
      try {
        const fromUrl = new URLSearchParams(window.location.search).get('space');
        if (fromUrl && fromUrl.startsWith('space_')) id = fromUrl;
      } catch { /* ignore */ }
    }
    return id;
  }, [search]);

  // Use nav data as an instant fallback while thread detail loads — avoids a hard
  // loading skeleton swap. Nav query is already warm from app startup.
  const navThread = nav?.threads.find(t => t.id === threadId);

  const prefetchNote = (noteId: string) => {
    queryClient.prefetchQuery(getNoteQueryOptions(noteId));
  };

  const threadContext = {
    id: threadId,
    title: isUnorganized ? MY_PILE_THREAD_TITLE : (thread?.title ?? navThread?.title ?? 'Thread'),
    color: isUnorganized ? 'paper' : (thread?.color ?? navThread?.color ?? 'paper'),
    backgroundGradient: thread?.backgroundGradient ?? navThread?.backgroundGradient ?? 'var(--color-gradient-gray)',
  };
  // Note: ThreadNotesList.onNotesLoaded provides Note[] (internal type) which is structurally
  // compatible with ListNoteForSeed for the fields seedNoteFromList reads.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onNotesLoaded = (notes: any[]) => {
    notes.forEach((n: ListNoteForSeed) => seedNoteFromList(queryClient, n, threadContext));
  };

  // Capture ?space= from URL when thread or URL space context changes (same thread can be
  // opened in multiple spaces; ref must not stay on the first space only).
  const spaceIdRef = useRef<string | null>(null);
  useEffect(() => {
    spaceIdRef.current = urlSpaceId;
  }, [threadId, urlSpaceId]);

  // Sync nav badge count: update navigationHistory entry with the correct noteCount
  // and space scope. Uses the ref so async title/count updates do not re-read a stale URL.
  useEffect(() => {
    const effectSpaceId = spaceIdRef.current;
    const navThread = nav?.threads.find(t => t.id === threadId);
    const title = isUnorganized ? MY_PILE_THREAD_TITLE : (thread?.title ?? navThread?.title);
    // Never push placeholder "Thread" into history — it overwrites real titles from localStorage on reload.
    if (!isUnorganized && !title) return;

    const count = navThread?.noteCount ?? thread?.noteCount ?? 0;
    const gradient = thread?.backgroundGradient ?? navThread?.backgroundGradient ?? 'var(--color-gradient-gray)';
    const spaceId = navThread?.spaceId ?? thread?.spaceId ?? effectSpaceId ?? null;
    const openedInSpaceId = effectSpaceId ?? null;
    if (typeof window !== 'undefined' && (window as any).addToNavigationHistory) {
      (window as any).addToNavigationHistory({
        id: threadId,
        title,
        count,
        backgroundGradient: gradient,
        spaceId,
        openedInSpaceIds: [openedInSpaceId],
        openedInSpaceId,
      });
    }
  }, [threadId, thread, nav, isUnorganized, urlSpaceId]);

  const tabs = TABS.map(t => ({ ...t, isActive: t.id === noteTypeFilter }));

  // For the My Pile thread, use hardcoded values since it's a virtual thread
  const resolvedTitle = isUnorganized ? MY_PILE_THREAD_TITLE
    : (thread?.title ?? navThread?.title ?? '');
  const resolvedColor = isUnorganized ? 'paper'
    : (thread?.color ?? navThread?.color ?? 'paper');

  const headerBgColor = `var(--color-${resolvedColor})`;
  // Always use ThreadCardStackHeader for non-unorganized so the header never shifts.
  // Nav data (navThread) provides title/color immediately; thread detail updates when loaded.
  return (
    <CardStack
      title={resolvedTitle}
      headerBgColor={headerBgColor}
      threadId={threadId}
      centerTitle={true}
      header={!isUnorganized ? (
        <ThreadCardStackHeader
          initialTitle={resolvedTitle || 'Thread'}
          initialColor={resolvedColor as any}
          threadId={threadId}
        />
      ) : undefined}
    >
      <SubtleContentMount key={threadId} variant="fade">
        <TabNav
          tabs={tabs}
          onTabChange={handleThreadTabChange}
          threadId={threadId}
          className="content-tabs"
        />
        {noteTypeFilter === 'search' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <FindSearchInput
              placeholder="Search notes in this thread…"
              value={searchInput}
              onValueChange={setSearchInput}
              onBeforeSearchNavigate={prefetchThreadSearch}
              onSubmitSearch={() => {}}
              onClearSearch={clearSearch}
              recentSearchRecordScope={{ type: 'thread', id: threadId }}
            />
            {!searchInput.trim() && (
              <RecentSearches
                storageScope={{ type: 'thread', id: threadId }}
                onPrefetchSearch={prefetchThreadSearch}
                onSelectRecentTerm={(term) => {
                  prefetchThreadSearch(term);
                  applySearchImmediate(term);
                }}
              />
            )}
            <SearchResultsList
              query={debouncedSearch}
              scope={{ threadId }}
              recentSearchCountSync={{ type: 'thread', id: threadId }}
            />
          </div>
        ) : (
          <ThreadNotesList
            initialNotes={[]}
            threadId={threadId}
            threadColor={thread?.color ?? undefined}
            noteTypeFilter={noteTypeFilter === 'notes' ? 'default' : noteTypeFilter}
            noteTypeCounts={threadNoteTypeCounts}
            onPrefetchNote={prefetchNote}
            onNotesLoaded={onNotesLoaded}
          />
        )}
        {/* Spacer so the last item can scroll above the floating "Create a note" button */}
        <div data-cta-spacer className="create-note-cta-spacer" />
      </SubtleContentMount>
    </CardStack>
  );
}

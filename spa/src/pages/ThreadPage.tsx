import { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useParams, useRouterState } from '@tanstack/react-router';
import { useThread } from '../hooks/queries/useThread';
import { useNavigation } from '../hooks/queries/useNavigation';
import { getNoteQueryOptions, seedNoteFromList, type ListNoteForSeed } from '../hooks/queries/useNote';
import ThreadNotesList from '../../../src/components/react/ThreadNotesList';
import ThreadCardStackHeader from '../../../src/components/react/ThreadCardStackHeader';
import TabNav from '../../../src/components/react/TabNav';
import FindSearchInput from '../../../src/components/react/FindSearchInput';
import RecentSearches from '../../../src/components/react/RecentSearches';
import CreateNoteButton from '../../../src/components/react/CreateNoteButton';
import CardStack from '../components/CardStack';
import SubtleContentMount from '@/components/react/SubtleContentMount';
import SearchResultsList, { fetchSearchResults, searchQueryKey } from '../components/SearchResultsList';
import { useIsMobile } from '../hooks/useIsMobile';
import {
  getStoredThreadContentTab,
  setStoredThreadContentTab,
  type ThreadContentTabId,
} from '../../../src/utils/content-tab-storage';

type NoteTypeFilter = 'all' | 'notes' | 'scripture' | 'search';

const TABS: Array<{ id: NoteTypeFilter; label: string }> = [
  { id: 'all',       label: 'All' },
  { id: 'notes',     label: 'Notes' },
  { id: 'scripture', label: 'Scripture' },
  { id: 'search',    label: 'Search' },
];

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
  const threadId = threadSlug.startsWith('thread_') ? threadSlug : `thread_${threadSlug}`;
  const isUnorganized = threadId === 'thread_unorganized';
  const queryClient = useQueryClient();
  const { data: threadPrefetch, isLoading } = useThread(threadId);
  const thread = threadPrefetch?.thread;
  const threadNoteTypeCounts = threadPrefetch?.noteTypeCounts;
  const { data: nav } = useNavigation();
  const [noteTypeFilter, setNoteTypeFilter] = useState<NoteTypeFilter>(
    () => getStoredThreadContentTab(threadId) ?? 'all',
  );
  const [scopedSearchQuery, setScopedSearchQuery] = useState('');
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
      if (!term.trim()) return;
      queryClient.prefetchQuery({
        queryKey: searchQueryKey(term, { threadId }),
        queryFn: () => fetchSearchResults(term, { threadId }),
      });
    },
    [queryClient, threadId],
  );
  // TanStack Router may not include unvalidated search params in location.search;
  // fall back to window.location.search so ?space= is always picked up.
  let urlSpaceId = getSpaceIdFromSearch(search);
  if (!urlSpaceId && typeof window !== 'undefined') {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get('space');
      if (fromUrl && fromUrl.startsWith('space_')) urlSpaceId = fromUrl;
    } catch { /* ignore */ }
  }

  // Use nav data as an instant fallback while thread detail loads — avoids a hard
  // loading skeleton swap. Nav query is already warm from app startup.
  const navThread = nav?.threads.find(t => t.id === threadId);

  const prefetchNote = (noteId: string) => {
    queryClient.prefetchQuery(getNoteQueryOptions(noteId));
  };

  const threadContext = {
    id: threadId,
    title: isUnorganized ? 'Unorganized' : (thread?.title ?? navThread?.title ?? 'Thread'),
    color: isUnorganized ? 'paper' : (thread?.color ?? navThread?.color ?? 'paper'),
    backgroundGradient: thread?.backgroundGradient ?? navThread?.backgroundGradient ?? 'var(--color-gradient-gray)',
  };
  // Note: ThreadNotesList.onNotesLoaded provides Note[] (internal type) which is structurally
  // compatible with ListNoteForSeed for the fields seedNoteFromList reads.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onNotesLoaded = (notes: any[]) => {
    notes.forEach((n: ListNoteForSeed) => seedNoteFromList(queryClient, n, threadContext));
  };

  // Capture ?space= from URL once per threadId so later effect runs (triggered by async
  // thread/nav data) don't re-read the URL after the user has navigated away.
  const spaceIdRef = useRef<string | null>(null);
  useEffect(() => {
    let captured: string | null = null;
    if (typeof window !== 'undefined') {
      try {
        const fromUrl = new URLSearchParams(window.location.search).get('space');
        if (fromUrl && fromUrl.startsWith('space_')) captured = fromUrl;
      } catch { /* ignore */ }
    }
    spaceIdRef.current = captured;
  }, [threadId]);

  // Sync nav badge count: update navigationHistory entry with the correct noteCount
  // and space scope. Uses the ref so the space captured on mount is stable across re-renders.
  useEffect(() => {
    const effectSpaceId = spaceIdRef.current;
    const navThread = nav?.threads.find(t => t.id === threadId);
    const title = isUnorganized ? 'Unorganized' : (thread?.title ?? navThread?.title);
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
  }, [threadId, thread, nav, isUnorganized]);

  const tabs = TABS.map(t => ({ ...t, isActive: t.id === noteTypeFilter }));

  // For the unorganized thread, use hardcoded values since it's a virtual thread
  const resolvedTitle = isUnorganized ? 'Unorganized'
    : (thread?.title ?? navThread?.title ?? '');
  const resolvedColor = isUnorganized ? 'paper'
    : (thread?.color ?? navThread?.color ?? 'paper');

  const headerBgColor = `var(--color-${resolvedColor})`;
  const isMobile = useIsMobile();

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
              initialQuery={scopedSearchQuery}
              onBeforeSearchNavigate={prefetchThreadSearch}
              onSubmitSearch={setScopedSearchQuery}
              onClearSearch={() => setScopedSearchQuery('')}
              recentSearchRecordScope={{ type: 'thread', id: threadId }}
            />
            {!scopedSearchQuery.trim() && (
              <RecentSearches
                storageScope={{ type: 'thread', id: threadId }}
                onPrefetchSearch={prefetchThreadSearch}
                onSelectRecentTerm={(term) => {
                  prefetchThreadSearch(term);
                  setScopedSearchQuery(term);
                }}
              />
            )}
            <SearchResultsList
              query={scopedSearchQuery}
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
      {isMobile && <CreateNoteButton />}
    </CardStack>
  );
}

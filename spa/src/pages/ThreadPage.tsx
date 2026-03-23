import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useParams, useRouterState } from '@tanstack/react-router';
import { useThread } from '../hooks/queries/useThread';
import { useNavigation } from '../hooks/queries/useNavigation';
import { getNoteQueryOptions, seedNoteFromList, type ListNoteForSeed } from '../hooks/queries/useNote';
import ThreadNotesList from '../../../src/components/react/ThreadNotesList';
import ThreadCardStackHeader from '../../../src/components/react/ThreadCardStackHeader';
import TabNav from '../../../src/components/react/TabNav';
import CreateNoteButton from '../../../src/components/react/CreateNoteButton';
import CardStack from '../components/CardStack';
import { useIsMobile } from '../hooks/useIsMobile';

type NoteTypeFilter = 'all' | 'notes' | 'scripture';

const TABS: Array<{ id: NoteTypeFilter; label: string }> = [
  { id: 'all',       label: 'All' },
  { id: 'notes',     label: 'Notes' },
  { id: 'scripture', label: 'Scripture' },
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
  const { data: thread, isLoading } = useThread(threadId);
  const { data: nav } = useNavigation();
  const [noteTypeFilter, setNoteTypeFilter] = useState<NoteTypeFilter>('all');
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

  // Sync nav badge count: update navigationHistory entry with the correct noteCount
  // (from nav for owned threads, or from thread prefetch for member threads not in nav).
  // Use ?space= from URL when thread/nav lack spaceId so thread is scoped under the right space.
  // openedInSpaceIds tracks WHERE the thread was opened FROM. On thread route use URL only so we don't re-scope when user switches space before URL updates.
  useEffect(() => {
    const navThread = nav?.threads.find(t => t.id === threadId);
    const count = navThread?.noteCount ?? thread?.noteCount ?? 0;
    const title = isUnorganized ? 'Unorganized' : (thread?.title ?? navThread?.title ?? 'Thread');
    const gradient = thread?.backgroundGradient ?? navThread?.backgroundGradient ?? 'var(--color-gradient-gray)';
    const spaceId = navThread?.spaceId ?? thread?.spaceId ?? urlSpaceId ?? null;
    const openedInSpaceId = urlSpaceId ?? null;
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
      <div>
        <TabNav
          tabs={tabs}
          onTabChange={(id) => setNoteTypeFilter(id as NoteTypeFilter)}
          threadId={threadId}
          className="content-tabs"
        />
        <ThreadNotesList
          initialNotes={[]}
          threadId={threadId}
          threadColor={thread?.color ?? undefined}
          noteTypeFilter={noteTypeFilter === 'notes' ? 'default' : noteTypeFilter}
          onPrefetchNote={prefetchNote}
          onNotesLoaded={onNotesLoaded}
        />
      </div>
      {/* Spacer so the last item can scroll above the floating "Create a note" button */}
      <div data-cta-spacer className="create-note-cta-spacer" />
      {isMobile && <CreateNoteButton />}
    </CardStack>
  );
}

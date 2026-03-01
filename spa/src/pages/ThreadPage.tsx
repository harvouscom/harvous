import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useThread } from '../hooks/queries/useThread';
import { useNavigation } from '../hooks/queries/useNavigation';
import { getNoteQueryOptions, seedNoteFromList, type ListNoteForSeed } from '../hooks/queries/useNote';
import ThreadNotesList from '../../../src/components/react/ThreadNotesList';
import ThreadCardStackHeader from '../../../src/components/react/ThreadCardStackHeader';
import TabNav from '../../../src/components/react/TabNav';
import CardStack from '../components/CardStack';

type NoteTypeFilter = 'all' | 'notes' | 'scripture';

const TABS: Array<{ id: NoteTypeFilter; label: string }> = [
  { id: 'all',       label: 'All' },
  { id: 'notes',     label: 'Notes' },
  { id: 'scripture', label: 'Scripture' },
];

export default function ThreadPage() {
  const { threadId: threadSlug } = useParams({ strict: false }) as { threadId: string };
  const threadId = threadSlug.startsWith('thread_') ? threadSlug : `thread_${threadSlug}`;
  const isUnorganized = threadId === 'thread_unorganized';
  const queryClient = useQueryClient();
  const { data: thread, isLoading } = useThread(threadId);
  const { data: nav } = useNavigation();
  const [noteTypeFilter, setNoteTypeFilter] = useState<NoteTypeFilter>('all');

  const prefetchNote = (noteId: string) => {
    queryClient.prefetchQuery(getNoteQueryOptions(noteId));
  };

  const threadContext = {
    id: threadId,
    title: isUnorganized ? 'Unorganized' : (thread?.title ?? navThread?.title ?? 'Thread'),
    color: isUnorganized ? 'paper' : (thread?.color ?? navThread?.color ?? 'paper'),
    backgroundGradient: thread?.backgroundGradient ?? navThread?.backgroundGradient ?? 'var(--color-gradient-gray)',
  };
  const onNotesLoaded = (notes: ListNoteForSeed[]) => {
    notes.forEach((n) => seedNoteFromList(queryClient, n, threadContext));
  };

  // Sync nav badge count: update navigationHistory entry with the correct noteCount
  // (from nav for owned threads, or from thread prefetch for member threads not in nav).
  useEffect(() => {
    const navThread = nav?.threads.find(t => t.id === threadId);
    const count = navThread?.noteCount ?? thread?.noteCount ?? 0;
    const title = isUnorganized ? 'Unorganized' : (thread?.title ?? navThread?.title ?? 'Thread');
    const gradient = thread?.backgroundGradient ?? navThread?.backgroundGradient ?? 'var(--color-gradient-gray)';
    if (typeof window !== 'undefined' && (window as any).addToNavigationHistory) {
      (window as any).addToNavigationHistory({
        id: threadId,
        title,
        count,
        backgroundGradient: gradient,
        spaceId: navThread?.spaceId ?? thread?.spaceId ?? null,
      });
    }
  }, [threadId, thread, nav, isUnorganized]);

  const tabs = TABS.map(t => ({ ...t, isActive: t.id === noteTypeFilter }));

  // Use nav data as an instant fallback while thread detail loads — avoids a hard
  // loading skeleton swap. Nav query is already warm from app startup.
  const navThread = nav?.threads.find(t => t.id === threadId);

  // For the unorganized thread, use hardcoded values since it's a virtual thread
  const resolvedTitle = isUnorganized ? 'Unorganized'
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
    </CardStack>
  );
}

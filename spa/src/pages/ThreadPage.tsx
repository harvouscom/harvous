import { useState, useEffect } from 'react';
import { useParams } from '@tanstack/react-router';
import { useThread } from '../hooks/queries/useThread';
import { useNavigation } from '../hooks/queries/useNavigation';
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
  // URL param is the slug (e.g. "abc123"); DB + API need the full prefixed ID
  const threadId = threadSlug.startsWith('thread_') ? threadSlug : `thread_${threadSlug}`;
  const isUnorganized = threadId === 'thread_unorganized';
  const { data: thread, isLoading } = useThread(threadId);
  const { data: nav } = useNavigation();
  const [noteTypeFilter, setNoteTypeFilter] = useState<NoteTypeFilter>('all');

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

  // Content is ready once thread detail has loaded (or this is the unorganized thread)
  const contentReady = isUnorganized || !isLoading;

  return (
    <CardStack
      title={resolvedTitle}
      headerBgColor={headerBgColor}
      threadId={threadId}
      centerTitle={isUnorganized}
      header={!isUnorganized && thread ? (
        <ThreadCardStackHeader
          initialTitle={thread.title}
          initialColor={(thread.color ?? 'paper') as any}
          threadId={threadId}
        />
      ) : undefined}
    >
      <div className={contentReady ? 'content-fade-in' : undefined}>
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
        />
      </div>
      {/* Spacer so the last item can scroll above the floating "Create a note" button */}
      <div data-cta-spacer className="create-note-cta-spacer" />
    </CardStack>
  );
}

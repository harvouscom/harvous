import { useState, useEffect } from 'react';
import { useParams } from '@tanstack/react-router';
import { useThread } from '../hooks/queries/useThread';
import { useNavigation } from '../hooks/queries/useNavigation';
import ThreadNotesList from '../../../src/components/react/ThreadNotesList';
import ThreadCardStackHeader from '../../../src/components/react/ThreadCardStackHeader';
import TabNav from '../../../src/components/react/TabNav';
import CardStack from '../components/CardStack';
import { getThreadGradientCSS } from '../../../src/utils/colors';

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
  // from the navigation API so the left-column badge shows the real number.
  useEffect(() => {
    const navThread = nav?.threads.find(t => t.id === threadId);
    const count = navThread?.noteCount ?? 0;
    const title = isUnorganized ? 'Unorganized' : (thread?.title ?? navThread?.title ?? 'Thread');
    const gradient = thread?.backgroundGradient ?? navThread?.backgroundGradient ?? 'var(--color-gradient-gray)';
    if (typeof window !== 'undefined' && (window as any).addToNavigationHistory) {
      (window as any).addToNavigationHistory({
        id: threadId,
        title,
        count,
        backgroundGradient: gradient,
        spaceId: navThread?.spaceId ?? null,
      });
    }
  }, [threadId, thread, nav, isUnorganized]);

  const tabs = TABS.map(t => ({ ...t, isActive: t.id === noteTypeFilter }));

  // For the unorganized thread, use hardcoded values since it's a virtual thread
  const resolvedTitle = isUnorganized ? 'Unorganized' : (thread?.title ?? 'Untitled');
  const resolvedColor = isUnorganized ? 'paper' : (thread?.color ?? 'paper');

  const headerBgColor = `var(--color-${resolvedColor})`;

  const backgroundGradient = thread?.backgroundGradient
    ?? getThreadGradientCSS(resolvedColor);

  if (!isUnorganized && isLoading) {
    return (
      <CardStack title="Loading..." headerBgColor="var(--color-paper)" centerTitle>
        <div className="page-loading" />
      </CardStack>
    );
  }

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
    </CardStack>
  );
}

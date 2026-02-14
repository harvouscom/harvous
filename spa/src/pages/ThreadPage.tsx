import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import ThreadNotesList from '../../../src/components/react/ThreadNotesList';
import TabNav from '../../../src/components/react/TabNav';

type NoteTypeFilter = 'all' | 'default' | 'scripture' | 'resource';

const TABS: Array<{ id: NoteTypeFilter; label: string }> = [
  { id: 'all',       label: 'All' },
  { id: 'default',   label: 'Notes' },
  { id: 'scripture', label: 'Scripture' },
  { id: 'resource',  label: 'Resources' },
];

export default function ThreadPage() {
  const { threadId } = useParams({ from: '/thread/$threadId' });
  const [noteTypeFilter, setNoteTypeFilter] = useState<NoteTypeFilter>('all');

  const tabs = TABS.map(t => ({ ...t, isActive: t.id === noteTypeFilter }));

  return (
    <div className="thread-page">
      <TabNav
        tabs={tabs}
        onTabChange={(id) => setNoteTypeFilter(id as NoteTypeFilter)}
        threadId={threadId}
      />
      <ThreadNotesList
        initialNotes={[]}
        threadId={threadId}
        noteTypeFilter={noteTypeFilter}
      />
    </div>
  );
}

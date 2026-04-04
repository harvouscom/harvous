import React, { useState } from 'react';
import ThreadNotesList from './ThreadNotesList';
import TabNav from './TabNav';

interface ThreadNotesListWithTabsProps {
  initialNotes: any[];
  threadId: string;
  noteTypeCounts?: {
    all: number;
    default: number;
    scripture: number;
    resource: number;
  };
}

export default function ThreadNotesListWithTabs({
  initialNotes,
  threadId,
  noteTypeCounts
}: ThreadNotesListWithTabsProps) {
  const [activeFilter, setActiveFilter] = useState<'all' | 'default' | 'scripture'>('all');

  // Handle tab change from TabNav component
  const handleTabChange = (tabId: string) => {
    if (tabId === 'all' || tabId === 'notes' || tabId === 'scripture') {
      const filter = tabId === 'notes' ? 'default' : tabId === 'scripture' ? 'scripture' : 'all';
      setActiveFilter(filter);
    }
  };

  // Prepare tabs for TabNav - use useMemo to prevent unnecessary re-renders
  const tabs = React.useMemo(() => [
    {
      id: 'all',
      label: 'All',
      isActive: activeFilter === 'all',
      count: noteTypeCounts?.all
    },
    {
      id: 'notes',
      label: 'Notes',
      isActive: activeFilter === 'default',
      count: noteTypeCounts?.default
    },
    {
      id: 'scripture',
      label: 'Scripture',
      isActive: activeFilter === 'scripture',
      count: noteTypeCounts?.scripture
    }
  ], [activeFilter, noteTypeCounts]);

  return (
    <>
      {/* Tab Navigation */}
      <TabNav
        tabs={tabs}
        onTabChange={handleTabChange}
        className="content-tabs"
        threadId={threadId}
      />
      
      {/* Notes List */}
      <ThreadNotesList
        initialNotes={initialNotes}
        threadId={threadId}
        noteTypeFilter={activeFilter}
        noteTypeCounts={noteTypeCounts}
      />
    </>
  );
}


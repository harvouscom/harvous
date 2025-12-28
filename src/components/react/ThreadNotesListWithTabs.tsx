import React, { useState, useEffect } from 'react';
import ThreadNotesList from './ThreadNotesList';

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

  useEffect(() => {
    // Listen for tab changes (event bubbles from tabNavContainer)
    const handleTabChange = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { tabId } = customEvent.detail || {};
      if (tabId === 'all' || tabId === 'notes' || tabId === 'scripture') {
        const filter = tabId === 'notes' ? 'default' : tabId === 'scripture' ? 'scripture' : 'all';
        console.log('[ThreadNotesListWithTabs] Tab changed to:', tabId, 'filter:', filter);
        setActiveFilter(filter);
      }
    };

    // Also check initial tab state
    const checkInitialTab = () => {
      const tabNavContainer = document.querySelector('.content-tabs');
      if (tabNavContainer) {
        const activeTab = tabNavContainer.querySelector('[data-tab-button][data-active="true"]');
        if (activeTab) {
          const tabId = activeTab.getAttribute('data-tab-id');
          if (tabId === 'all' || tabId === 'notes' || tabId === 'scripture') {
            const filter = tabId === 'notes' ? 'default' : tabId === 'scripture' ? 'scripture' : 'all';
            console.log('[ThreadNotesListWithTabs] Initial tab:', tabId, 'filter:', filter);
            setActiveFilter(filter);
          }
        } else {
          // Default to 'all' if no active tab found
          console.log('[ThreadNotesListWithTabs] No active tab found, defaulting to "all"');
          setActiveFilter('all');
        }
      }
    };

    // Check initial state after a short delay to ensure DOM is ready
    setTimeout(checkInitialTab, 100);

    // Listen for tab changes (event bubbles, so we can listen on document)
    document.addEventListener('tabChange', handleTabChange);

    return () => {
      document.removeEventListener('tabChange', handleTabChange);
    };
  }, []);

  return (
    <ThreadNotesList
      initialNotes={initialNotes}
      threadId={threadId}
      noteTypeFilter={activeFilter}
      noteTypeCounts={noteTypeCounts}
    />
  );
}


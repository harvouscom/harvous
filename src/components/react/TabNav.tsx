import React, { useState, useEffect, useCallback, useRef } from 'react';
import { extractIdFromPath } from '@/utils/url-helpers';

export interface TabNavProps {
  tabs: Array<{
    id: string;
    label: string;
    isActive?: boolean;
    count?: number;
  }>;
  onTabChange?: (tabId: string) => void;
  className?: string;
  threadId?: string; // Optional threadId for badge count updates
}

export default function TabNav({
  tabs,
  onTabChange,
  className = '',
  threadId
}: TabNavProps) {
  // State for badge counts - initialize from props (consistent server/client)
  const [badgeCounts, setBadgeCounts] = useState<Record<string, number>>(() => {
    const counts: Record<string, number> = {};
    tabs.forEach(tab => {
      if (tab.count !== undefined) {
        counts[tab.id] = tab.count;
      }
    });
    return counts;
  });

  // Track active tab - initialize from props to avoid hydration mismatch
  // Use empty string initially, then set in useEffect to ensure consistency
  const [activeTabId, setActiveTabId] = useState<string>('');

  // Ref to track if we're on a thread page
  const isThreadPageRef = useRef<boolean>(false);

  // Initialize activeTabId from props after mount to avoid hydration mismatch
  useEffect(() => {
    const activeTab = tabs.find(tab => tab.isActive);
    setActiveTabId(activeTab?.id || tabs[0]?.id || '');
    
    // Check if we're on a thread page (client-only)
    const currentPath = window.location.pathname;
    const currentThreadId = extractIdFromPath(currentPath) || '';
    isThreadPageRef.current = currentThreadId.startsWith('thread_') || currentThreadId === 'thread_unorganized';
  }, [tabs]);

  // Function to fetch fresh note type counts from API
  const fetchNoteTypeCounts = useCallback(async (): Promise<{
    all: number;
    default: number;
    scripture: number;
  } | null> => {
    if (!threadId && typeof window !== 'undefined') {
      // Try to get threadId from current path
      const currentPath = window.location.pathname;
      const currentThreadId = extractIdFromPath(currentPath) || '';

      if (currentThreadId.startsWith('thread_') || currentThreadId === 'thread_unorganized') {
        try {
          const response = await fetch(`/api/threads/${currentThreadId}/note-type-counts`, {
            credentials: 'include',
            cache: 'no-store'
          });

          if (!response.ok) {
            console.error('[TabNav] Failed to fetch note type counts:', response.status);
            return null;
          }

          const data = await response.json();
          return data.noteTypeCounts || null;
        } catch (error) {
          console.error('[TabNav] Error fetching note type counts:', error);
          return null;
        }
      }
    } else if (threadId) {
      try {
        const response = await fetch(`/api/threads/${threadId}/note-type-counts`, {
          credentials: 'include',
          cache: 'no-store'
        });

        if (!response.ok) {
          console.error('[TabNav] Failed to fetch note type counts:', response.status);
          return null;
        }

        const data = await response.json();
        return data.noteTypeCounts || null;
      } catch (error) {
        console.error('[TabNav] Error fetching note type counts:', error);
        return null;
      }
    }

    return null;
  }, [threadId]);

  // Update badge counts from API
  const updateBadgeCountsFromAPI = useCallback(async () => {
    if (!isThreadPageRef.current) return;

    const counts = await fetchNoteTypeCounts();
    if (counts) {
      setBadgeCounts(prev => ({
        ...prev,
        all: counts.all,
        notes: counts.default,
        scripture: counts.scripture
      }));
    }
  }, [fetchNoteTypeCounts]);

  // Handle note events with optimistic updates
  useEffect(() => {
    if (!isThreadPageRef.current) return;

    const handleNoteCreated = async (event: Event) => {
      const customEvent = event as CustomEvent;
      const { threadId: eventThreadId, note, actualThreadId } = customEvent.detail;

      // Use threadId prop if available, otherwise use pathname
      const currentThreadId = threadId || (() => {
        const currentPath = window.location.pathname;
        return extractIdFromPath(currentPath) || '';
      })();
      const noteThreadId = eventThreadId || actualThreadId || note?.threadId;

      if (noteThreadId === currentThreadId || (noteThreadId === 'thread_unorganized' && currentThreadId === 'thread_unorganized')) {
        // Optimistic update
        const noteType = note?.noteType || 'default';
        setBadgeCounts(prev => {
          const newCounts = { ...prev };
          newCounts.all = (newCounts.all || 0) + 1;
          if (noteType === 'scripture') {
            newCounts.scripture = (newCounts.scripture || 0) + 1;
          } else {
            newCounts.notes = (newCounts.notes || 0) + 1;
          }
          return newCounts;
        });

        // Verify with API after short delay
        setTimeout(() => {
          updateBadgeCountsFromAPI();
        }, 200);
      }
    };

    const handleNoteDeleted = async (event: Event) => {
      const customEvent = event as CustomEvent;
      const { threadId: eventThreadId } = customEvent.detail;

      // Use threadId prop if available, otherwise use pathname
      const currentThreadId = threadId || (() => {
        const currentPath = window.location.pathname;
        return extractIdFromPath(currentPath) || '';
      })();

      if (eventThreadId === currentThreadId) {
        // Optimistic update
        setBadgeCounts(prev => {
          const newCounts = { ...prev };
          newCounts.all = Math.max(0, (newCounts.all || 0) - 1);
          // We don't know the note type, so we'll verify with API
          return newCounts;
        });

        // Verify with API after short delay
        setTimeout(() => {
          updateBadgeCountsFromAPI();
        }, 200);
      }
    };

    const handleNoteAddedToThread = async (event: Event) => {
      const customEvent = event as CustomEvent;
      const { threadId: eventThreadId, noteType = 'default' } = customEvent.detail;

      // Use threadId prop if available, otherwise use pathname
      const currentThreadId = threadId || (() => {
        const currentPath = window.location.pathname;
        return extractIdFromPath(currentPath) || '';
      })();

      if (eventThreadId === currentThreadId) {
        // Optimistic update - update both all and specific note type count
        setBadgeCounts(prev => {
          const newCounts = { ...prev };
          newCounts.all = (newCounts.all || 0) + 1;
          if (noteType === 'scripture') {
            newCounts.scripture = (newCounts.scripture || 0) + 1;
          } else {
            newCounts.notes = (newCounts.notes || 0) + 1;
          }
          return newCounts;
        });

        // Verify with API after short delay
        setTimeout(() => {
          updateBadgeCountsFromAPI();
        }, 200);
      }
    };

    const handleNoteRemovedFromThread = async (event: Event) => {
      const customEvent = event as CustomEvent;
      const { threadId: eventThreadId, noteType = 'default' } = customEvent.detail;

      // Use threadId prop if available, otherwise use pathname
      const currentThreadId = threadId || (() => {
        const currentPath = window.location.pathname;
        return extractIdFromPath(currentPath) || '';
      })();

      if (eventThreadId === currentThreadId) {
        // Optimistic update - update both all and specific note type count
        setBadgeCounts(prev => {
          const newCounts = { ...prev };
          newCounts.all = Math.max(0, (newCounts.all || 0) - 1);
          if (noteType === 'scripture') {
            newCounts.scripture = Math.max(0, (newCounts.scripture || 0) - 1);
          } else {
            newCounts.notes = Math.max(0, (newCounts.notes || 0) - 1);
          }
          return newCounts;
        });

        // Verify with API after short delay
        setTimeout(() => {
          updateBadgeCountsFromAPI();
        }, 200);
      }
    };

    window.addEventListener('noteCreated', handleNoteCreated);
    window.addEventListener('noteDeleted', handleNoteDeleted);
    window.addEventListener('noteAddedToThread', handleNoteAddedToThread);
    window.addEventListener('noteRemovedFromThread', handleNoteRemovedFromThread);

    // Initial fetch on mount
    updateBadgeCountsFromAPI();

    return () => {
      window.removeEventListener('noteCreated', handleNoteCreated);
      window.removeEventListener('noteDeleted', handleNoteDeleted);
      window.removeEventListener('noteAddedToThread', handleNoteAddedToThread);
      window.removeEventListener('noteRemovedFromThread', handleNoteRemovedFromThread);
    };
  }, [updateBadgeCountsFromAPI, threadId]);

  // Handle tab click
  const handleTabClick = (tabId: string) => {
    setActiveTabId(tabId);

    // Dispatch tabChange event for compatibility
    window.dispatchEvent(new CustomEvent('tabChange', {
      detail: { tabId }
    }));

    // Call onTabChange callback if provided
    if (onTabChange) {
      onTabChange(tabId);
    }
  };

  // Get count for a tab (use badgeCounts state if available, otherwise fall back to prop)
  const getTabCount = (tabId: string): number | undefined => {
    // Map tab IDs to count keys
    const countKey = tabId === 'notes' ? 'notes' : tabId === 'scripture' ? 'scripture' : tabId === 'all' ? 'all' : undefined;
    
    if (countKey && badgeCounts[countKey] !== undefined) {
      return badgeCounts[countKey];
    }
    
    // Fall back to prop
    const tab = tabs.find(t => t.id === tabId);
    return tab?.count;
  };

  return (
    <div 
      className={`tab-nav-container ${className}`.trim()}
    >
      {/* Tab Navigation */}
      <div className="tab-nav">
        {tabs.map((tab) => {
          const isActive = activeTabId === tab.id || (activeTabId === '' && tab.isActive);
          const count = getTabCount(tab.id);
          
          return (
            <button
              key={tab.id}
              className={`tab-nav__button ${isActive ? 'opacity-100' : 'opacity-50'}`}
              data-tab-id={tab.id}
              data-active={isActive ? "true" : "false"}
              data-tab-button
              onClick={() => handleTabClick(tab.id)}
              suppressHydrationWarning
            >
              <span className="tab-nav__label">
                {tab.label}
              </span>
              {count !== undefined && count > 0 && (
                <div className="badge-count">
                  <span className="badge-number">{count > 99 ? '99+' : String(count)}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}


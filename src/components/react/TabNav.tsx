import React, { useState, useEffect, useCallback, useRef } from 'react';
import { extractIdFromPath } from '@/utils/url-helpers';

const TAB_COUNTS_CACHE_PREFIX = 'harvous-tab-counts-';

function getCachedTabCounts(threadId: string): Record<string, number> | undefined {
  try {
    const raw = sessionStorage.getItem(`${TAB_COUNTS_CACHE_PREFIX}${threadId}`);
    return raw ? JSON.parse(raw) : undefined;
  } catch { return undefined; }
}

function setCachedTabCounts(threadId: string, counts: Record<string, number>) {
  try { sessionStorage.setItem(`${TAB_COUNTS_CACHE_PREFIX}${threadId}`, JSON.stringify(counts)); } catch { /* ignore */ }
}

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
  // State for badge counts — seed from sessionStorage cache so counts appear instantly on load.
  const [badgeCounts, setBadgeCounts] = useState<Record<string, number>>(() => {
    if (threadId) {
      const cached = getCachedTabCounts(threadId);
      if (cached) return cached;
    }
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

  // Sync reset: swap to the new thread's cached counts (or clear) when threadId changes.
  const prevTabNavThreadRef = useRef(threadId);
  if (prevTabNavThreadRef.current !== threadId) {
    prevTabNavThreadRef.current = threadId;
    setBadgeCounts(threadId ? getCachedTabCounts(threadId) ?? {} : {});
  }

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

  // Handle note events with optimistic updates and badge count fetching.
  // Uses a `cancelled` flag so API responses from a previous thread are discarded
  // when the user navigates away before the response arrives.
  useEffect(() => {
    if (!isThreadPageRef.current) return;

    let cancelled = false;
    const pendingTimeouts: ReturnType<typeof setTimeout>[] = [];

    const fetchAndSetCounts = async () => {
      const counts = await fetchNoteTypeCounts();
      if (!cancelled && counts) {
        const mapped = { all: counts.all, notes: counts.default, scripture: counts.scripture };
        setBadgeCounts(prev => ({ ...prev, ...mapped }));
        if (threadId) setCachedTabCounts(threadId, mapped);
      }
    };

    const scheduleVerify = () => {
      const tid = setTimeout(() => fetchAndSetCounts(), 200);
      pendingTimeouts.push(tid);
    };

    const handleNoteCreated = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { threadId: eventThreadId, note, actualThreadId } = customEvent.detail;

      const currentThreadId = threadId || (() => {
        const currentPath = window.location.pathname;
        return extractIdFromPath(currentPath) || '';
      })();
      const noteThreadId = eventThreadId || actualThreadId || note?.threadId;

      if (noteThreadId === currentThreadId || (noteThreadId === 'thread_unorganized' && currentThreadId === 'thread_unorganized')) {
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
        scheduleVerify();
      }
    };

    const handleNoteDeleted = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { threadId: eventThreadId } = customEvent.detail;

      const currentThreadId = threadId || (() => {
        const currentPath = window.location.pathname;
        return extractIdFromPath(currentPath) || '';
      })();

      if (eventThreadId === currentThreadId) {
        setBadgeCounts(prev => {
          const newCounts = { ...prev };
          newCounts.all = Math.max(0, (newCounts.all || 0) - 1);
          return newCounts;
        });
        scheduleVerify();
      }
    };

    const handleNoteAddedToThread = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { threadId: eventThreadId, noteType = 'default' } = customEvent.detail;

      const currentThreadId = threadId || (() => {
        const currentPath = window.location.pathname;
        return extractIdFromPath(currentPath) || '';
      })();

      if (eventThreadId === currentThreadId) {
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
        scheduleVerify();
      }
    };

    const handleNoteRemovedFromThread = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { threadId: eventThreadId, noteType = 'default' } = customEvent.detail;

      const currentThreadId = threadId || (() => {
        const currentPath = window.location.pathname;
        return extractIdFromPath(currentPath) || '';
      })();

      if (eventThreadId === currentThreadId) {
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
        scheduleVerify();
      }
    };

    window.addEventListener('noteCreated', handleNoteCreated);
    window.addEventListener('noteDeleted', handleNoteDeleted);
    window.addEventListener('noteAddedToThread', handleNoteAddedToThread);
    window.addEventListener('noteRemovedFromThread', handleNoteRemovedFromThread);

    // Initial fetch
    fetchAndSetCounts();

    return () => {
      cancelled = true;
      pendingTimeouts.forEach(clearTimeout);
      window.removeEventListener('noteCreated', handleNoteCreated);
      window.removeEventListener('noteDeleted', handleNoteDeleted);
      window.removeEventListener('noteAddedToThread', handleNoteAddedToThread);
      window.removeEventListener('noteRemovedFromThread', handleNoteRemovedFromThread);
    };
  }, [fetchNoteTypeCounts, threadId]);

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

  // Get count for a tab. On thread page use badgeCounts (from API) for all/notes/scripture; otherwise use prop so parent-controlled counts (e.g. MySharingPanel) update when items change.
  const getTabCount = (tabId: string): number | undefined => {
    const tab = tabs.find(t => t.id === tabId);
    const countKey = tabId === 'notes' ? 'notes' : tabId === 'scripture' ? 'scripture' : tabId === 'all' ? 'all' : undefined;

    if (isThreadPageRef.current && countKey && badgeCounts[countKey] !== undefined) {
      return badgeCounts[countKey];
    }
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
              onTouchEnd={(e) => {
                // Fire immediately on touch without waiting for the synthesized click.
                // Prevents the 300ms focus→click delay that makes the first tap appear
                // to only darken the text without switching tabs on mobile PWA.
                e.preventDefault();
                handleTabClick(tab.id);
              }}
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


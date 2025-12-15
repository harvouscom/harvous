import React, { useState, useEffect, useRef } from 'react';
import InboxItemsList from './InboxItemsList';

interface InboxItem {
  id: string;
  type: 'thread' | 'note';
  title: string;
  content: string;
  imageUrl?: string;
  variant: 'Thread' | 'Note' | 'NoteImage';
  threadId?: string;
  noteId?: string;
  color?: string;
  subtitle?: string;
  count?: number;
  lastUpdated?: string;
  threadType?: string;
}

interface CollapsibleInboxSectionProps {
  inboxContent: InboxItem[];
  archivedItems: InboxItem[];
  inboxItemCount: number;
}

export default function CollapsibleInboxSection({
  inboxContent,
  archivedItems,
  inboxItemCount
}: CollapsibleInboxSectionProps) {
  const STORAGE_KEY = 'harvous_inbox_collapsed';
  const contentRef = useRef<HTMLDivElement>(null);
  
  // Default to collapsed if empty, expanded if has items
  const getInitialState = (): boolean => {
    if (typeof window === 'undefined') {
      return inboxItemCount === 0;
    }
    
    // Auto-expand if items exist
    if (inboxItemCount > 0) {
      return false; // expanded
    }
    
    // Check localStorage for preference when empty
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      return stored === 'true';
    }
    
    // Default to collapsed when empty
    return true;
  };

  const [isCollapsed, setIsCollapsed] = useState(getInitialState);
  const [activeTab, setActiveTab] = useState<'inbox' | 'archive'>('inbox');
  const previousCountRef = useRef<number>(inboxItemCount);

  // Auto-expand when items are first added (count changes from 0 to >0)
  // But don't auto-expand if user manually collapsed it
  useEffect(() => {
    const previousCount = previousCountRef.current;
    const countIncreased = previousCount === 0 && inboxItemCount > 0;
    
    // Only auto-expand if count went from 0 to >0 (new items added)
    if (countIncreased && isCollapsed) {
      setIsCollapsed(false);
      localStorage.setItem(STORAGE_KEY, 'false');
    }
    
    // Update ref for next comparison
    previousCountRef.current = inboxItemCount;
  }, [inboxItemCount, isCollapsed]);

  // Persist collapsed state to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, String(isCollapsed));
    }
  }, [isCollapsed]);

  // Update inbox/archive text based on active tab
  useEffect(() => {
    const updateInboxArchiveText = () => {
      const inboxText = document.querySelector('.inbox-auto-text');
      const archiveText = document.querySelector('.archive-auto-text');
      
      if (inboxText && archiveText) {
        if (activeTab === 'inbox') {
          inboxText.classList.remove('hidden');
          archiveText.classList.add('hidden');
        } else {
          inboxText.classList.add('hidden');
          archiveText.classList.remove('hidden');
        }
      }
    };
    
    updateInboxArchiveText();
  }, [activeTab]);


  // Handle tab switching - sync with tab-manager.js (but our onClick handler takes priority)
  useEffect(() => {
    const handleTabSwitch = () => {
      const inboxButton = document.querySelector('.inbox-archive-tabs [data-tab-id="inbox"]');
      const archiveButton = document.querySelector('.inbox-archive-tabs [data-tab-id="archive"]');
      
      // Only sync if our state doesn't match (to avoid conflicts with our onClick handler)
      if (inboxButton?.getAttribute('data-active') === 'true' && activeTab !== 'inbox') {
        setActiveTab('inbox');
      } else if (archiveButton?.getAttribute('data-active') === 'true' && activeTab !== 'archive') {
        setActiveTab('archive');
      }
    };

    // Check initial state after a short delay to let tab-manager.js initialize
    setTimeout(() => {
      const inboxButton = document.querySelector('.inbox-archive-tabs [data-tab-id="inbox"]');
      const archiveButton = document.querySelector('.inbox-archive-tabs [data-tab-id="archive"]');
      
      if (inboxButton?.getAttribute('data-active') === 'true') {
        setActiveTab('inbox');
      } else if (archiveButton?.getAttribute('data-active') === 'true') {
        setActiveTab('archive');
      }
    }, 100);

    // Listen for tab changes via MutationObserver (watches data-active changes)
    // But only sync if it's not from our own click handler
    const observer = new MutationObserver(() => {
      // Small delay to check if our state already matches
      setTimeout(handleTabSwitch, 10);
    });
    const tabContainer = document.querySelector('.inbox-archive-tabs');
    if (tabContainer) {
      observer.observe(tabContainer, {
        attributes: true,
        attributeFilter: ['data-active'],
        subtree: true
      });
    }

    return () => {
      observer.disconnect();
    };
  }, [activeTab]);

  const toggleCollapsed = () => {
    setIsCollapsed(prev => !prev);
  };

  // Track if we've handled a touch event to prevent double-firing with onClick
  const touchHandledRef = React.useRef(false);

  const handleTabClick = (tabId: 'inbox' | 'archive', e?: React.MouseEvent | React.TouchEvent) => {
    // Prevent tab-manager.js from interfering (though we removed data-tab-button so it shouldn't attach)
    if (e) {
      e.stopPropagation();
      
      // Handle touch events separately to prevent double-firing
      if (e.type === 'touchstart') {
        e.preventDefault();
        touchHandledRef.current = true;
        setTimeout(() => {
          touchHandledRef.current = false;
        }, 300);
      } else if (e.type === 'click' && touchHandledRef.current) {
        // Already handled as touch, skip click to prevent double-firing
        return;
      }
    }
    
    // If clicking the active tab, toggle collapsed state
    if (tabId === activeTab) {
      const newCollapsedState = !isCollapsed;
      setIsCollapsed(newCollapsedState);
      
      // Update DOM attributes to reflect the new state
      const inboxButton = document.querySelector('.inbox-archive-tabs [data-tab-id="inbox"]');
      const archiveButton = document.querySelector('.inbox-archive-tabs [data-tab-id="archive"]');
      
      if (tabId === 'inbox') {
        inboxButton?.setAttribute('data-active', newCollapsedState ? 'false' : 'true');
      } else {
        archiveButton?.setAttribute('data-active', newCollapsedState ? 'false' : 'true');
      }
    } else {
      // If clicking a different tab, switch tabs and always expand
      setActiveTab(tabId);
      setIsCollapsed(false);
      
      // Immediately update DOM attributes to show active state
      const inboxButton = document.querySelector('.inbox-archive-tabs [data-tab-id="inbox"]');
      const archiveButton = document.querySelector('.inbox-archive-tabs [data-tab-id="archive"]');
      
      if (tabId === 'inbox') {
        inboxButton?.setAttribute('data-active', 'true');
        archiveButton?.setAttribute('data-active', 'false');
      } else {
        inboxButton?.setAttribute('data-active', 'false');
        archiveButton?.setAttribute('data-active', 'true');
      }
    }
  };

  const currentItems = activeTab === 'inbox' ? inboxContent : archivedItems;
  const isEmpty = currentItems.length === 0;

  return (
    <div className="flex flex-col gap-3 pb-0">
      {/* TabNav and Auto-archive Text Row */}
      <div className="flex items-center justify-between pb-0 pt-0 pr-3 relative w-full">
        <div className="tab-nav-container inbox-archive-tabs">
          <div className="tab-nav">
            <button
              className={`tab-nav__button ${activeTab === 'inbox' && !isCollapsed ? 'opacity-100' : 'opacity-50'}`}
              data-tab-id="inbox"
              data-active={activeTab === 'inbox' && !isCollapsed ? 'true' : 'false'}
              onClick={(e) => handleTabClick('inbox', e)}
              onTouchStart={(e) => handleTabClick('inbox', e)}
              style={{ touchAction: 'manipulation' }}
            >
              <span className="tab-nav__label">Inbox</span>
            </button>
            <button
              className={`tab-nav__button ${activeTab === 'archive' && !isCollapsed ? 'opacity-100' : 'opacity-50'}`}
              data-tab-id="archive"
              data-active={activeTab === 'archive' && !isCollapsed ? 'true' : 'false'}
              onClick={(e) => handleTabClick('archive', e)}
              onTouchStart={(e) => handleTabClick('archive', e)}
              style={{ touchAction: 'manipulation' }}
            >
              <span className="tab-nav__label">Archive</span>
            </button>
          </div>
        </div>
        <div className="flex flex-col font-sans font-normal justify-center relative shrink-0 text-[12px] text-[#78766f]">
          <p className="leading-[1.3] whitespace-nowrap inbox-auto-text">14 day auto archive</p>
          <p className="leading-[1.3] whitespace-nowrap archive-auto-text hidden">30 day auto delete</p>
        </div>
      </div>

      {/* Collapsible Content Area */}
      <div
        ref={contentRef}
        className="inbox-section-content"
        style={{
          maxHeight: isCollapsed ? '0px' : 'none',
          overflow: 'hidden',
          transition: 'max-height 0.3s ease-out',
          paddingBottom: 0,
          marginBottom: 0
        }}
      >
        {/* Inbox Content */}
        <div 
          className={`inbox-content min-h-[120px] ${activeTab === 'inbox' ? '' : 'hidden'}`}
          style={{ paddingBottom: 0, marginBottom: 0 }}
        >
          {inboxContent.length > 0 ? (
            <InboxItemsList 
              items={inboxContent}
            />
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '120px',
              width: '100%',
              textAlign: 'center',
              paddingLeft: '0.75rem',
              paddingRight: '0.75rem',
              paddingTop: '24px',
              paddingBottom: '24px'
            }}>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <div style={{
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 600,
                  color: '#4a473d',
                  fontSize: '18px',
                  lineHeight: '1.2'
                }}>
                  <p>Your inbox is empty</p>
                </div>
                <div style={{
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 400,
                  color: '#78766f',
                  fontSize: '14px',
                  lineHeight: '1.3'
                }}>
                  <p>Where new items from Harvous appear</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Archive Content */}
        <div 
          className={`archive-content min-h-[120px] ${activeTab === 'archive' ? '' : 'hidden'}`}
          style={{ paddingBottom: 0, marginBottom: 0 }}
        >
          {archivedItems.length > 0 ? (
            <InboxItemsList 
              items={archivedItems}
            />
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '120px',
              width: '100%',
              textAlign: 'center',
              paddingLeft: '0.75rem',
              paddingRight: '0.75rem',
              paddingTop: '24px',
              paddingBottom: '24px'
            }}>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <div style={{
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 600,
                  color: '#4a473d',
                  fontSize: '18px',
                  lineHeight: '1.2'
                }}>
                  <p>Your archive is empty</p>
                </div>
                <div style={{
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 400,
                  color: '#78766f',
                  fontSize: '14px',
                  lineHeight: '1.3'
                }}>
                  <p>Archived items are kept for 30 days</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


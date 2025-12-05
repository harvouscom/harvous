import React, { useState, useMemo } from 'react';
import SearchInput from './SearchInput';
import ActionButton from './ActionButton';
import Icon from './Icon';

interface Note {
  id: string;
  title: string | null;
  content: string;
  spaceId: string | null;
  [key: string]: any;
}

interface Thread {
  id: string;
  title: string;
  color?: string;
  spaceId: string | null;
  isPublic?: boolean;
  subtitle?: string;
  count?: number;
  [key: string]: any;
}

interface SpaceItem {
  id: string;
  title: string;
  type: 'note' | 'thread';
  spaceId: string | null;
  lastAccessed?: number;
  updatedAt?: Date | string;
  createdAt?: Date | string;
  color?: string;
  isPublic?: boolean;
  subtitle?: string;
  count?: number;
  content?: string;
  noteType?: 'default' | 'scripture' | 'resource';
  [key: string]: any;
}

interface AddToSpaceSectionProps {
  allNotes: Note[];
  allThreads: Thread[];
  currentSpaceId: string | null; // null for new space, spaceId for editing
  currentThreadId?: string | null; // null for new thread, threadId for editing thread
  onItemSelect: (itemId: string, itemType: 'note' | 'thread') => void;
  selectedItems: string[]; // Array of selected IDs (notes and threads)
  isLoading?: boolean;
  placeholder?: string;
  emptyMessage?: string;
  itemsToShow?: 'notes' | 'all'; // Filter to show only notes or all items
  currentThreadNoteIds?: string[]; // Array of note IDs already in the thread (for filtering)
}

export default function AddToSpaceSection({
  allNotes,
  allThreads,
  currentSpaceId,
  currentThreadId = null,
  onItemSelect,
  selectedItems,
  isLoading = false,
  placeholder = "Search notes and threads",
  emptyMessage = "No items found",
  itemsToShow = 'all',
  currentThreadNoteIds = []
}: AddToSpaceSectionProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Combine notes and threads into unified items, filtered by space
  const availableItems = useMemo(() => {
    const items: SpaceItem[] = [];

    // Filter notes: show notes that don't belong to current space and aren't already in current thread
    allNotes.forEach(note => {
      // Skip notes that are already in the current thread
      if (currentThreadId && currentThreadNoteIds.includes(note.id)) {
        return;
      }
      
      if (currentSpaceId === null) {
        // For new space, show all notes (that aren't in the thread)
        items.push({
          id: note.id,
          title: note.title || 'Untitled Note',
          type: 'note',
          spaceId: note.spaceId,
          content: note.content,
          updatedAt: note.updatedAt,
          createdAt: note.createdAt,
          lastAccessed: undefined,
          noteType: note.noteType || 'default'
        });
      } else {
        // For editing space, show notes from other spaces or no space (that aren't in the thread)
        if (note.spaceId !== currentSpaceId) {
          items.push({
            id: note.id,
            title: note.title || 'Untitled Note',
            type: 'note',
            spaceId: note.spaceId,
            content: note.content,
            updatedAt: note.updatedAt,
            createdAt: note.createdAt,
            lastAccessed: undefined
          });
        }
      }
    });

    // Filter threads: show threads that don't belong to current space (only if itemsToShow is 'all')
    if (itemsToShow === 'all') {
      allThreads.forEach(thread => {
        // Exclude unorganized thread
        if (thread.id === 'thread_unorganized') return;
        
        if (currentSpaceId === null) {
          // For new space, show all threads
          items.push({
            id: thread.id,
            title: thread.title,
            type: 'thread',
            spaceId: thread.spaceId,
            color: thread.color,
            isPublic: thread.isPublic,
            subtitle: thread.subtitle,
            count: thread.count,
            updatedAt: thread.updatedAt,
            createdAt: thread.createdAt,
            lastAccessed: undefined
          });
        } else {
          // For editing space, show threads from other spaces or no space
          if (thread.spaceId !== currentSpaceId) {
            items.push({
              id: thread.id,
              title: thread.title,
              type: 'thread',
              spaceId: thread.spaceId,
              color: thread.color,
              isPublic: thread.isPublic,
              subtitle: thread.subtitle,
              count: thread.count,
              updatedAt: thread.updatedAt,
              createdAt: thread.createdAt,
              lastAccessed: undefined
            });
          }
        }
      });
    }

    // Filter out already selected items
    return items.filter(item => !selectedItems.includes(item.id));
  }, [allNotes, allThreads, currentSpaceId, currentThreadId, currentThreadNoteIds, selectedItems, itemsToShow]);

  // Sort and categorize items by updatedAt (newest first)
  const { recentItems, otherItems } = useMemo(() => {
    // Helper function to get timestamp from date (handles both Date objects and strings)
    const getTimestamp = (date: Date | string | undefined): number => {
      if (!date) return 0;
      if (date instanceof Date) return date.getTime();
      if (typeof date === 'string') return new Date(date).getTime();
      return 0;
    };

    // Sort all items by updatedAt (newest first), fallback to createdAt
    const sortedItems = [...availableItems].sort((a, b) => {
      const aTime = getTimestamp(a.updatedAt) || getTimestamp(a.createdAt) || 0;
      const bTime = getTimestamp(b.updatedAt) || getTimestamp(b.createdAt) || 0;
      return bTime - aTime; // Newest first
    });

    // Take top 3 for recent items
    const recent = sortedItems.slice(0, 3);
    
    // Remaining items go to other items (also sorted by updatedAt)
    const others = sortedItems.slice(3);

    return {
      recentItems: recent,
      otherItems: others
    };
  }, [availableItems]);

  // Filter items based on search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return availableItems;
    
    const query = searchQuery.toLowerCase();
    const filtered = availableItems.filter(item =>
      item.title.toLowerCase().includes(query) ||
      (item.type === 'note' && item.content?.toLowerCase().includes(query))
    );
    return filtered;
  }, [availableItems, searchQuery]);

  const handleItemClick = (itemId: string, itemType: 'note' | 'thread') => {
    onItemSelect(itemId, itemType);
    setSearchQuery(""); // Clear search after selection
  };

  // Helper function to strip HTML from content
  const stripHtml = (html: string): string => {
    if (!html) return '';
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim()
      .substring(0, 100);
  };

  // Render note item (similar to renderThreadItem - simplified, just title with note type icon)
  const renderNoteItem = (item: SpaceItem, onClick: () => void) => {
    const isSelected = selectedItems.includes(item.id);
    
    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick();
      }
    };
    
    // Get note type icon
    const getNoteTypeIcon = () => {
      const noteType = item.noteType || 'default';
      if (noteType === 'scripture') {
        return <Icon name="scroll" size={20} style={{ color: 'var(--color-deep-grey)', opacity: 0.3 }} />;
      } else if (noteType === 'resource') {
        return <Icon name="file-image" size={20} style={{ color: 'var(--color-deep-grey)', opacity: 0.3 }} />;
      } else {
        // Default note - use bookmark icon (same as CardNote)
        return (
          <svg className="block max-w-none size-full text-[var(--color-deep-grey)] opacity-30" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
          </svg>
        );
      }
    };
    
    return (
      <div
        key={item.id}
        className="group"
        style={{
          position: 'relative',
          animation: 'fadeIn 0.3s ease-out forwards',
          opacity: 0
        }}
      >
        <div
          onClick={onClick}
          onKeyDown={handleKeyDown}
          role="button"
          tabIndex={0}
          className="relative cursor-pointer"
          style={{
            position: 'relative',
            borderRadius: '0.75rem',
            height: '48px',
            width: '100%',
            textAlign: 'left',
            backgroundColor: isSelected ? 'var(--color-fog-white)' : 'var(--color-fog-white)',
            boxShadow: '0px 2px 8px 0px rgba(120, 118, 111, 0.1)',
            border: isSelected ? '2px solid var(--color-bold-blue)' : 'none',
            transition: 'transform 0.2s',
            cursor: 'pointer'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.002)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          {/* Accent bar on left */}
          <div 
            style={{ 
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: '2.75rem',
              borderTopLeftRadius: '0.75rem',
              borderBottomLeftRadius: '0.75rem',
              overflow: 'hidden',
              backgroundColor: 'var(--color-paper)'
            }}
          />
          
          {/* Content */}
          <div 
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1.5rem',
              paddingLeft: '0.75rem',
              paddingRight: '3rem',
              height: '100%',
              overflow: 'hidden'
            }}
          >
            {/* Note type icon */}
            <div style={{ position: 'relative', flexShrink: 0, width: '1.25rem', height: '1.25rem' }}>
              {getNoteTypeIcon()}
            </div>
            
            {/* Text content - only title */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: 0 }}>
              {/* Title */}
              <div style={{ 
                fontFamily: 'var(--font-sans)', 
                fontWeight: 700, 
                color: 'var(--color-deep-grey)', 
                fontSize: '16px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {item.title}
              </div>
            </div>
          </div>
          
          {/* Add button - appears on hover */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              right: '0.75rem',
              transform: 'translateY(-50%)',
              width: '2rem',
              height: '2rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0,
              transition: 'opacity 0.2s',
              zIndex: 10,
              pointerEvents: 'none'
            }}
            className="add-button-wrapper"
          >
            <ActionButton
              variant="Add"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClick();
              }}
              disabled={isLoading}
              style={{ pointerEvents: 'auto' }}
            />
          </div>
        </div>
        <style>{`
          .group:hover .add-button-wrapper {
            opacity: 1;
          }
        `}</style>
      </div>
    );
  };

  // Render thread item (similar to AddToSection - simplified, no subtitle or count)
  const renderThreadItem = (item: SpaceItem, onClick: () => void) => {
    const isSelected = selectedItems.includes(item.id);
    const threadAccentColor = item.color ? `var(--color-${item.color})` : "var(--color-purple)";
    
    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick();
      }
    };
    
    return (
      <div
        key={item.id}
        className="group"
        style={{
          position: 'relative',
          animation: 'fadeIn 0.3s ease-out forwards',
          opacity: 0
        }}
      >
        <div
          onClick={onClick}
          onKeyDown={handleKeyDown}
          role="button"
          tabIndex={0}
          className="relative cursor-pointer"
          style={{
            position: 'relative',
            borderRadius: '0.75rem',
            height: '48px',
            width: '100%',
            textAlign: 'left',
            backgroundColor: isSelected ? 'var(--color-fog-white)' : 'var(--color-fog-white)',
            boxShadow: '0px 2px 8px 0px rgba(120, 118, 111, 0.1)',
            border: isSelected ? '2px solid var(--color-bold-blue)' : 'none',
            transition: 'transform 0.2s',
            cursor: 'pointer'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.002)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          {/* Accent bar on left */}
          <div 
            style={{ 
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: '2.75rem',
              borderTopLeftRadius: '0.75rem',
              borderBottomLeftRadius: '0.75rem',
              overflow: 'hidden',
              backgroundColor: threadAccentColor
            }}
          />
          
          {/* Content */}
          <div 
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1.5rem',
              paddingLeft: '0.75rem',
              paddingRight: '3rem',
              height: '100%',
              overflow: 'hidden'
            }}
          >
            {/* User icon (Private) or User group icon (Shared) */}
            <div style={{ position: 'relative', flexShrink: 0, width: '1.25rem', height: '1.25rem' }}>
              {item.isPublic === true ? (
                <svg style={{ display: 'block', maxWidth: 'none', width: '100%', height: '100%', color: 'var(--color-deep-grey)', opacity: 0.3 }} fill="currentColor" viewBox="0 0 640 640">
                  <path d="M96 192C96 130.1 146.1 80 208 80C269.9 80 320 130.1 320 192C320 253.9 269.9 304 208 304C146.1 304 96 253.9 96 192zM32 528C32 430.8 110.8 352 208 352C305.2 352 384 430.8 384 528L384 534C384 557.2 365.2 576 342 576L74 576C50.8 576 32 557.2 32 534L32 528zM464 128C517 128 560 171 560 224C560 277 517 320 464 320C411 320 368 277 368 224C368 171 411 128 464 128zM464 368C543.5 368 608 432.5 608 512L608 534.4C608 557.4 589.4 576 566.4 576L421.6 576C428.2 563.5 432 549.2 432 534L432 528C432 476.5 414.6 429.1 385.5 391.3C408.1 376.6 435.1 368 464 368z"/>
                </svg>
              ) : (
                <svg style={{ display: 'block', maxWidth: 'none', width: '100%', height: '100%', color: 'var(--color-deep-grey)', opacity: 0.3 }} fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
              )}
            </div>
            
            {/* Text content - only title, no subtitle or count */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: 0 }}>
              {/* Title */}
              <div style={{ 
                fontFamily: 'var(--font-sans)', 
                fontWeight: 700, 
                color: 'var(--color-deep-grey)', 
                fontSize: '16px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {item.title}
              </div>
            </div>
          </div>
          
          {/* Add button - appears on hover */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              right: '0.75rem',
              transform: 'translateY(-50%)',
              width: '2rem',
              height: '2rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0,
              transition: 'opacity 0.2s',
              zIndex: 10,
              pointerEvents: 'none'
            }}
            className="add-button-wrapper"
          >
            <ActionButton
              variant="Add"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClick();
              }}
              disabled={isLoading}
              style={{ pointerEvents: 'auto' }}
            />
          </div>
        </div>
        <style>{`
          .group:hover .add-button-wrapper {
            opacity: 1;
          }
        `}</style>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
      
      {/* Search Input */}
      <div className="mb-3">
        <SearchInput
          placeholder={placeholder || (itemsToShow === 'notes' ? "Search notes" : "Search notes and threads")}
          value={searchQuery}
          onChange={setSearchQuery}
        />
      </div>

      {/* Search Results */}
      {searchQuery && (
        <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
          {filteredItems.length === 0 ? (
            <div className="text-center py-4 text-[var(--color-stone-grey)] text-sm font-sans">
              {emptyMessage} matching "{searchQuery}"
            </div>
          ) : (
            <>
              <div className="text-[12px] text-[var(--color-stone-grey)] font-sans mb-1">
                {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'} found
              </div>
              <div className="flex flex-col gap-2">
                {filteredItems.map(item => {
                  const onClick = () => handleItemClick(item.id, item.type);
                  return item.type === 'note' 
                    ? renderNoteItem(item, onClick)
                    : renderThreadItem(item, onClick);
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Show available items when no search query */}
      {!searchQuery && (
        <>
          {availableItems.length === 0 ? (
            <div className="text-center py-4 text-[var(--color-stone-grey)] text-sm font-sans">
              {currentSpaceId === null 
                ? "No items available to add"
                : "All items are already in this space"}
            </div>
          ) : (
            <div className="flex flex-col gap-3 flex-1 overflow-y-auto min-h-0">
              {/* Recent Items Section */}
              {recentItems.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between px-2">
                    <div className="text-[12px] text-[var(--color-stone-grey)] font-sans leading-[normal] text-nowrap">
                      Most Recent
                    </div>
                    {availableItems.length > 0 && (
                      <div className="text-[12px] text-[var(--color-stone-grey)] font-sans leading-[normal] text-nowrap">
                        {availableItems.length} {availableItems.length === 1 ? 'item' : 'items'} available
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    {recentItems.map(item => {
                      const onClick = () => handleItemClick(item.id, item.type);
                      return item.type === 'note' 
                        ? renderNoteItem(item, onClick)
                        : renderThreadItem(item, onClick);
                    })}
                  </div>
                </div>
              )}

              {/* All Items Section */}
              {otherItems.length > 0 && (
                <div className="flex flex-col gap-2">
                  {recentItems.length > 0 && (
                    <div className="pt-2 border-t border-[rgba(120,118,111,0.15)]">
                      <div className="text-[12px] text-[var(--color-stone-grey)] font-sans leading-[normal] text-nowrap mb-2">
                        All items
                      </div>
                    </div>
                  )}
                  {recentItems.length === 0 && (
                    <div className="flex items-center justify-between px-2">
                      <div className="text-[12px] text-[var(--color-stone-grey)] font-sans leading-[normal] text-nowrap">
                        All items
                      </div>
                      {availableItems.length > 0 && (
                        <div className="text-[12px] text-[var(--color-stone-grey)] font-sans leading-[normal] text-nowrap">
                          {availableItems.length} {availableItems.length === 1 ? 'item' : 'items'} available
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    {otherItems.map(item => {
                      const onClick = () => handleItemClick(item.id, item.type);
                      return item.type === 'note' 
                        ? renderNoteItem(item, onClick)
                        : renderThreadItem(item, onClick);
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {isLoading && (
        <div className="text-[12px] text-[var(--color-stone-grey)] font-sans text-center mt-2">Adding...</div>
      )}
    </div>
  );
}


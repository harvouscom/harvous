import React, { useState, useMemo, useEffect } from 'react';
import SearchInput from './SearchInput';
import ActionButton from './ActionButton';
import Icon from './Icon';
import { formatBadgeCount } from '@/utils/badge-count';
import { stripHtmlForPreview } from '@/utils/html-stripper';
import { generateThreadMeshGradient } from '@/utils/colors';

// Note Item Component with hover state
const NoteItem: React.FC<{
  item: SpaceItem;
  isSelected: boolean;
  isLoading: boolean;
  onClick: () => void;
}> = ({ item, isSelected, isLoading, onClick }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [hasHover, setHasHover] = useState(true); // Default to true (desktop)

  const meshGradient = useMemo(() => {
    const threadColors = item.threadColors;
    if (!threadColors || !Array.isArray(threadColors) || threadColors.length === 0) {
      return null;
    }
    const validColors = threadColors.filter(c => c && c.color && typeof c.frequency === 'number');
    if (validColors.length === 0) return null;
    return generateThreadMeshGradient(validColors, item.id);
  }, [item.threadColors, item.id]);
  
  useEffect(() => {
    // Detect if device supports hover (has cursor)
    if (typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia('(hover: hover)');
      setHasHover(mediaQuery.matches);
    }
  }, []);
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  // Get note type icon - consistent size for all icons (20px to match CardNote)
  const getNoteTypeIcon = () => {
    const noteType = item.noteType || 'default';
    const iconSize = 20;
    if (noteType === 'scripture') {
      return <Icon name="scroll" size={iconSize} style={{ color: 'var(--color-deep-grey)' }} />;
    } else if (noteType === 'resource') {
      return <Icon name="newspaper" size={iconSize} style={{ color: 'var(--color-deep-grey)' }} />;
    } else {
      // Default note - use bookmark icon (same as CardNote) - ensure same size as Icon component
      return (
        <svg 
          width={iconSize} 
          height={iconSize} 
          style={{ color: 'var(--color-deep-grey)', opacity: 0.3 }} 
          fill="currentColor" 
          viewBox="0 0 24 24"
        >
          <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
        </svg>
      );
    }
  };

  return (
    <div
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
          backgroundColor: 'white',
          boxShadow: 'none',
          border: isSelected ? '2px solid var(--color-bold-blue)' : 'none',
          transition: 'transform 0.2s',
          cursor: 'pointer'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.002)';
          setIsHovered(true);
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          setIsHovered(false);
        }}
      >
        {/* Accent bar on left - thread mesh gradient (dashboard parity) or light paper; icon for resource/scripture */}
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
            backgroundColor: 'var(--color-light-paper)',
            ...(meshGradient ? { backgroundImage: meshGradient } : {}),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {/* Show icon for resource/scripture notes */}
          {(item.noteType === 'resource' || item.noteType === 'scripture') && (
            <div style={{ 
              width: '20px', 
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0.3
            }}>
              {getNoteTypeIcon()}
            </div>
          )}
        </div>
        
        {/* Content */}
        <div 
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1.5rem',
            // Add extra left padding for resource/scripture notes to account for sidebar icon
            paddingLeft: (item.noteType === 'resource' || item.noteType === 'scripture') ? '3.5rem' : '0.75rem',
            paddingRight: '3rem',
            height: '100%',
            overflow: 'hidden'
          }}
        >
          {/* Note type icon - only show for default notes (resource/scripture show in sidebar) */}
          {(!item.noteType || item.noteType === 'default') && (
            <div style={{ position: 'relative', flexShrink: 0, width: '1.25rem', height: '1.25rem' }}>
              {getNoteTypeIcon()}
            </div>
          )}
          
          {/* Text content - only title */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: 0 }}>
            {/* Title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
              <div style={{ 
                fontFamily: 'var(--font-sans)', 
                fontWeight: 700, 
                color: 'var(--color-deep-grey)', 
                fontSize: '16px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0
              }}>
                {item.title}
              </div>
              {item.noteType === 'scripture' && (item.version || item.scriptureTranslation) && (
                <span style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '12px',
                  fontWeight: 'normal',
                  color: 'var(--color-stone-grey)',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}>
                  {item.version || item.scriptureTranslation}
                </span>
              )}
            </div>
          </div>
        </div>
        
        {/* Add button - appears on hover (desktop) or always visible (touch) */}
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
            opacity: hasHover ? (isHovered ? 1 : 0) : 1,
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
            className="w-8 h-8"
            style={{ pointerEvents: 'auto' }}
          />
        </div>
      </div>
    </div>
  );
};

// Thread Item Component with hover state
const ThreadItem: React.FC<{
  item: SpaceItem;
  isSelected: boolean;
  isLoading: boolean;
  onClick: () => void;
}> = ({ item, isSelected, isLoading, onClick }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [hasHover, setHasHover] = useState(true); // Default to true (desktop)
  const threadAccentColor = item.color ? `var(--color-${item.color})` : "var(--color-purple)";
  
  useEffect(() => {
    // Detect if device supports hover (has cursor)
    if (typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia('(hover: hover)');
      setHasHover(mediaQuery.matches);
    }
  }, []);
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
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
          backgroundColor: 'white',
          boxShadow: '0px 2px 8px 0px rgba(120, 118, 111, 0.1)',
          border: isSelected ? '2px solid var(--color-bold-blue)' : 'none',
          transition: 'transform 0.2s',
          cursor: 'pointer'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.002)';
          setIsHovered(true);
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          setIsHovered(false);
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
            backgroundColor: threadAccentColor,
            zIndex: 10
          }}
        />
        
        {/* White background for content area (starts after colored bar) */}
        <div 
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: '2.75rem',
            right: 0,
            borderTopRightRadius: '0.75rem',
            borderBottomRightRadius: '0.75rem',
            backgroundColor: 'white'
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
            overflow: 'hidden',
            position: 'relative',
            zIndex: 20
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
          
          {/* Text content - only title */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: 0 }}>
            {/* Title with badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
              <div style={{ 
                fontFamily: 'var(--font-sans)', 
                fontWeight: 700, 
                color: 'var(--color-deep-grey)', 
                fontSize: '16px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0
              }}>
                {item.title}
              </div>
              {/* Item count badge */}
              {item.count !== undefined && item.count !== null && item.count > 0 && (
                <div className="badge-count" style={{ flexShrink: 0 }}>
                  <span className="badge-number">
                    {formatBadgeCount(item.count)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Add button - appears on hover (desktop) or always visible (touch) */}
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
            opacity: hasHover ? (isHovered ? 1 : 0) : 1,
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
            className="w-8 h-8"
            style={{ pointerEvents: 'auto' }}
          />
        </div>
      </div>
    </div>
  );
};

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
  version?: string | null;
  scriptureTranslation?: string | null;
  threadColors?: Array<{ color: string; frequency: number }>;
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
          noteType: note.noteType || 'default',
          version: (note as any).version || null,
          scriptureTranslation: (note as any).scriptureTranslation || null,
          resourceImage: (note as any).resourceImage || null,
          resourceTitle: (note as any).resourceTitle || null,
          resourceDescription: (note as any).resourceDescription || null,
          threadColors: (note as any).threadColors,
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
            lastAccessed: undefined,
            noteType: note.noteType || 'default',
            version: (note as any).version || null,
            scriptureTranslation: (note as any).scriptureTranslation || null,
            resourceImage: (note as any).resourceImage || null,
            resourceTitle: (note as any).resourceTitle || null,
            resourceDescription: (note as any).resourceDescription || null,
            threadColors: (note as any).threadColors,
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

  // Use centralized stripHtml utility
  const stripHtml = (html: string): string => stripHtmlForPreview(html, 100);

  // Render functions now use the new components
  const renderNoteItem = (item: SpaceItem, onClick: () => void) => {
    const isSelected = selectedItems.includes(item.id);
    return (
      <NoteItem
        item={item}
        isSelected={isSelected}
        isLoading={isLoading}
        onClick={onClick}
      />
    );
  };

  // Render thread item
  const renderThreadItem = (item: SpaceItem, onClick: () => void) => {
    const isSelected = selectedItems.includes(item.id);
    return (
      <ThreadItem
        item={item}
        isSelected={isSelected}
        isLoading={isLoading}
        onClick={onClick}
      />
    );
  };

  return (
    <div className="flex-fill flex-stack" style={{ gap: 0 }}>
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
              <div className="flex-stack" style={{ gap: "0.5rem" }}>
                {filteredItems.map(item => {
                  const onClick = () => handleItemClick(item.id, item.type);
                  return (
                    <React.Fragment key={item.id}>
                      {item.type === 'note' 
                        ? renderNoteItem(item, onClick)
                        : renderThreadItem(item, onClick)}
                    </React.Fragment>
                  );
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
                <div className="flex-stack" style={{ gap: "0.5rem" }}>
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
                  <div className="flex-stack" style={{ gap: "0.5rem" }}>
                    {recentItems.map(item => {
                      const onClick = () => handleItemClick(item.id, item.type);
                      return (
                        <React.Fragment key={item.id}>
                          {item.type === 'note' 
                            ? renderNoteItem(item, onClick)
                            : renderThreadItem(item, onClick)}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* All Items Section */}
              {otherItems.length > 0 && (
                <div className="flex-stack" style={{ gap: "0.5rem" }}>
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
                  <div className="flex-stack" style={{ gap: "0.5rem" }}>
                    {otherItems.map(item => {
                      const onClick = () => handleItemClick(item.id, item.type);
                      return (
                        <React.Fragment key={item.id}>
                          {item.type === 'note' 
                            ? renderNoteItem(item, onClick)
                            : renderThreadItem(item, onClick)}
                        </React.Fragment>
                      );
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


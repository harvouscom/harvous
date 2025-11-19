import React, { useState, useMemo, useEffect } from 'react';
import SearchInput from './SearchInput';
import ActionButton from './ActionButton';

interface AddableItem {
  id: string;
  title: string;
  color?: string;
  isPublic?: boolean;
  subtitle?: string;
  count?: number;
  [key: string]: any; // Allow additional properties
}

interface NavigationHistoryItem {
  id: string;
  title: string;
  lastAccessed?: number;
  firstAccessed?: number;
  count?: number;
  [key: string]: any;
}

interface AddToSectionProps {
  allItems: AddableItem[];
  currentItems: AddableItem[];
  onItemSelect: (itemId: string) => void;
  isLoading?: boolean;
  loadingText?: string;
  title?: string;
  placeholder?: string;
  emptyMessage?: string;
  itemRenderer?: (item: AddableItem, onClick: () => void) => React.ReactNode;
}

export default function AddToSection({
  allItems,
  currentItems,
  onItemSelect,
  isLoading = false,
  loadingText = "Adding...",
  title = "Add to",
  placeholder = "Search to add...",
  emptyMessage = "No items found",
  itemRenderer
}: AddToSectionProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [navigationHistory, setNavigationHistory] = useState<NavigationHistoryItem[]>([]);

  // Get navigation history from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('harvous-navigation-history-v2');
        const history = stored ? JSON.parse(stored) : [];
        setNavigationHistory(history);
      } catch (error) {
        console.error('Error loading navigation history:', error);
        setNavigationHistory([]);
      }
    }
  }, []);

  // Filter available items (not already associated)
  const availableItems = useMemo(() => {
    const filtered = allItems.filter(item => 
      !currentItems.some(current => current.id === item.id)
    );
    console.log('AddToSection: Available items:', filtered.length, 'allItems:', allItems.length, 'currentItems:', currentItems.length);
    return filtered;
  }, [allItems, currentItems]);

  // Sort and categorize threads by navigation history
  const { recentThreads, otherThreads } = useMemo(() => {
    // Create a map of navigation history by thread ID for quick lookup
    const historyMap = new Map<string, NavigationHistoryItem>();
    navigationHistory.forEach(item => {
      if (item.id && item.lastAccessed) {
        historyMap.set(item.id, item);
      }
    });

    // Separate threads into recent and others
    const recent: AddableItem[] = [];
    const others: AddableItem[] = [];

    availableItems.forEach(item => {
      const historyItem = historyMap.get(item.id);
      if (historyItem && historyItem.lastAccessed) {
        recent.push({ ...item, lastAccessed: historyItem.lastAccessed });
      } else {
        others.push(item);
      }
    });

    // Sort recent threads by lastAccessed (most recent first)
    recent.sort((a, b) => {
      const aLast = (a as any).lastAccessed || 0;
      const bLast = (b as any).lastAccessed || 0;
      return bLast - aLast;
    });

    // Sort other threads alphabetically
    others.sort((a, b) => a.title.localeCompare(b.title));

    // Limit recent threads to 8
    const limitedRecent = recent.slice(0, 8);

    return {
      recentThreads: limitedRecent,
      otherThreads: others
    };
  }, [availableItems, navigationHistory]);

  // Filter items based on search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return availableItems;
    
    const filtered = availableItems.filter(item =>
      item.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
    console.log('AddToSection: Filtered items:', filtered.length, 'for query:', searchQuery);
    return filtered;
  }, [availableItems, searchQuery]);

  const handleItemClick = (itemId: string) => {
    console.log('AddToSection: Item clicked:', itemId);
    onItemSelect(itemId);
    setSearchQuery(""); // Clear search after selection
  };

  // Default item renderer for threads - inspired by CardThread but more compact
  const defaultItemRenderer = (item: AddableItem, onClick: () => void) => {
    const threadAccentColor = item.color ? `var(--color-${item.color})` : "var(--color-purple)";
    
    return (
      <div
        key={item.id}
        className="relative group"
        style={{
          animation: 'fadeIn 0.3s ease-out forwards',
          opacity: 0
        }}
      >
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
        <button
          onClick={onClick}
          className="relative rounded-xl h-[48px] cursor-pointer transition-transform duration-200 w-full text-left overflow-hidden hover:scale-[1.002]"
          style={{
            backgroundColor: 'var(--color-fog-white)',
            boxShadow: '0px 2px 8px 0px rgba(120, 118, 111, 0.1)'
          }}
        >
          {/* Accent bar on left - wider like CardThread so icon sits on it */}
          <div 
            className="absolute inset-y-0 left-0 w-11 rounded-l-xl" 
            style={{ backgroundColor: threadAccentColor }}
          />
          
          {/* Content */}
          <div className="flex items-center gap-6 pl-3 pr-12 h-full">
            {/* User icon (Private) or User group icon (Shared) - positioned on colored background */}
            <div className="relative shrink-0 size-5">
              {item.isPublic === true ? (
                // User group icon for Shared
                <svg className="block max-w-none size-full text-[var(--color-deep-grey)] opacity-30" fill="currentColor" viewBox="0 0 640 640">
                  <path d="M96 192C96 130.1 146.1 80 208 80C269.9 80 320 130.1 320 192C320 253.9 269.9 304 208 304C146.1 304 96 253.9 96 192zM32 528C32 430.8 110.8 352 208 352C305.2 352 384 430.8 384 528L384 534C384 557.2 365.2 576 342 576L74 576C50.8 576 32 557.2 32 534L32 528zM464 128C517 128 560 171 560 224C560 277 517 320 464 320C411 320 368 277 368 224C368 171 411 128 464 128zM464 368C543.5 368 608 432.5 608 512L608 534.4C608 557.4 589.4 576 566.4 576L421.6 576C428.2 563.5 432 549.2 432 534L432 528C432 476.5 414.6 429.1 385.5 391.3C408.1 376.6 435.1 368 464 368z"/>
                </svg>
              ) : (
                // Single user icon for Private
                <svg className="block max-w-none size-full text-[var(--color-deep-grey)] opacity-30" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
              )}
            </div>
            
            {/* Text content */}
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              {/* Title */}
              <div className="font-sans font-bold text-[var(--color-deep-grey)] text-[16px] truncate">
                {item.title}
              </div>
              
              {/* Subtitle row - only show subtitle if it exists, or note count */}
              {(item.subtitle || (item.count !== undefined && item.count !== null)) && (
                <div className="flex items-center gap-2">
                  {/* Only show subtitle text if it exists (not Public/Private) */}
                  {item.subtitle && (
                    <span className="text-[12px] font-sans text-[var(--color-stone-grey)] whitespace-nowrap">
                      {item.subtitle}
                    </span>
                  )}
                  
                  {/* Note Count Badge */}
                  {item.count !== undefined && item.count !== null && (
                    <div className="bg-[rgba(120,118,111,0.1)] flex items-center justify-center rounded-3xl px-2 h-5 flex-shrink-0">
                      <span className="text-[11px] font-sans font-semibold text-[var(--color-deep-grey)] leading-[0] badge-number">
                        {item.count}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          
          {/* Add button - appears on hover */}
          <ActionButton
            variant="Add"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClick();
            }}
            className="absolute top-1/2 right-3 transform -translate-y-1/2 w-8 h-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10"
            disabled={isLoading}
          />
        </button>
      </div>
    );
  };

  return (
    <div className="rounded-2xl p-4 flex-1 flex flex-col border min-h-0" style={{ 
      backgroundColor: 'var(--color-white)',
      borderColor: 'var(--color-fog-white)'
    }}>
        {/* Search Input */}
        <div className="mb-3">
          <SearchInput
            placeholder={placeholder}
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
                  {filteredItems.length} {filteredItems.length === 1 ? 'thread' : 'threads'} found
                </div>
                <div className="flex flex-col gap-2">
                  {filteredItems.map(item => 
                    itemRenderer 
                      ? itemRenderer(item, () => handleItemClick(item.id))
                      : defaultItemRenderer(item, () => handleItemClick(item.id))
                  )}
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
                This note is already in all your threads
              </div>
            ) : (
              <div className="flex flex-col gap-3 flex-1 overflow-y-auto min-h-0">
                {/* Recent Threads Section */}
                {recentThreads.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                    <div className="text-[12px] text-[var(--color-stone-grey)] font-sans leading-[normal] text-nowrap">
                      Most Recent
                    </div>
                      {availableItems.length > 0 && (
                        <div className="text-[12px] text-[var(--color-stone-grey)] font-sans leading-[normal] text-nowrap">
                          {availableItems.length} {availableItems.length === 1 ? 'thread' : 'threads'} available
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      {recentThreads.map(item => 
                        itemRenderer 
                          ? itemRenderer(item, () => handleItemClick(item.id))
                          : defaultItemRenderer(item, () => handleItemClick(item.id))
                      )}
                    </div>
                  </div>
                )}

                {/* All Threads Section */}
                {otherThreads.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {recentThreads.length > 0 && (
                      <div className="pt-2 border-t border-[rgba(120,118,111,0.15)]">
                        <div className="text-[12px] text-[var(--color-stone-grey)] font-sans leading-[normal] text-nowrap mb-2">
                          All threads
                        </div>
                      </div>
                    )}
                    {recentThreads.length === 0 && (
                      <div className="flex items-center justify-between">
                        <div className="text-[12px] text-[var(--color-stone-grey)] font-sans leading-[normal] text-nowrap">
                          All threads
                        </div>
                        {availableItems.length > 0 && (
                          <div className="text-[12px] text-[var(--color-stone-grey)] font-sans leading-[normal] text-nowrap">
                            {availableItems.length} {availableItems.length === 1 ? 'thread' : 'threads'} available
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex flex-col gap-2">
                      {otherThreads.map(item => 
                        itemRenderer 
                          ? itemRenderer(item, () => handleItemClick(item.id))
                          : defaultItemRenderer(item, () => handleItemClick(item.id))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {isLoading && (
          <div className="text-[12px] text-[var(--color-stone-grey)] font-sans text-center mt-2">{loadingText}</div>
        )}
    </div>
  );
}

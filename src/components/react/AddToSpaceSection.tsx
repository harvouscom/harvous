import { colorTokenVar } from '@/utils/space-cover';
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import SearchInput from './SearchInput';
import FindSearchInput from './FindSearchInput';
import RecentSearches from './RecentSearches';
import ActionButton from './ActionButton';
import { formatBadgeCount } from '@/utils/badge-count';
import {
  useSearch,
  fetchSearchResults,
  searchQueryKey,
  type SearchResult,
  type SearchResultType,
} from '@/hooks/useSearch';
import {
  addRecentSearchTerm,
  RECENT_SEARCH_COMMIT_IDLE_MS,
  type RecentSearchStorageScope,
} from '@/utils/recent-search-storage';
import { getTranslationAbbreviationDisplay } from '@/data/translations';
import { MIN_SEARCH_QUERY_LENGTH } from '@/utils/search-query';
import { stripHtmlForPreview } from '@/utils/html-stripper';
import {
  CondensedNoteRowLayout,
  condensedNoteRowIcon,
  getCondensedNoteAccentBarStyle,
  getCondensedNoteMeshGradient,
  getSolidThreadAccentBarStyle,
} from './CondensedNoteRowLayout';

// Note Item Component with hover state
const NoteItem: React.FC<{
  item: SpaceItem;
  isSelected: boolean;
  isLoading: boolean;
  onClick: () => void;
}> = ({ item, isSelected, isLoading, onClick }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [hasHover, setHasHover] = useState(true); // Default to true (desktop)

  const meshGradient = useMemo(
    () => getCondensedNoteMeshGradient(item.threadColors, item.id),
    [item.threadColors, item.id],
  );
  
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

  const rowNoteType =
    item.noteType === 'resource' || item.noteType === 'scripture' ? item.noteType : 'default';

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
          width: '100%',
          textAlign: 'left',
          border: isSelected ? '2px solid var(--color-bold-blue)' : 'none',
          transition: 'transform 0.2s',
          cursor: 'pointer',
          overflow: 'hidden',
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
        <CondensedNoteRowLayout
          accentBarStyle={getCondensedNoteAccentBarStyle(meshGradient)}
          icon={condensedNoteRowIcon({ noteType: rowNoteType })}
          style={{ cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
              <div
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 700,
                  color: 'var(--color-deep-grey)',
                  fontSize: '16px',
                  lineHeight: 1.2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                }}
              >
                {item.title}
              </div>
              {item.noteType === 'scripture' && (item.version || item.scriptureTranslation) && (
                <span
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: '12px',
                    fontWeight: 'normal',
                    color: 'var(--color-stone-grey)',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {getTranslationAbbreviationDisplay(String(item.version || item.scriptureTranslation || ''))}
                </span>
              )}
            </div>
          </div>
        </CondensedNoteRowLayout>

        {/* Add button - appears on hover (desktop) or always visible (touch) */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            right: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '2rem',
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
  const threadAccentColor = colorTokenVar(item.color, 'purple');
  
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
          width: '100%',
          textAlign: 'left',
          border: isSelected ? '2px solid var(--color-bold-blue)' : 'none',
          transition: 'transform 0.2s',
          cursor: 'pointer',
          overflow: 'hidden',
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
        <CondensedNoteRowLayout
          accentBarStyle={getSolidThreadAccentBarStyle(threadAccentColor)}
          icon={condensedNoteRowIcon({ itemType: 'thread' })}
          boxShadow="0px 2px 8px 0px rgba(120, 118, 111, 0.1)"
          style={{ cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
              <div
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 700,
                  color: 'var(--color-deep-grey)',
                  fontSize: '16px',
                  lineHeight: 1.2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                }}
              >
                {item.title}
              </div>
              <span
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '12px',
                  fontWeight: 'normal',
                  color: 'var(--color-stone-grey)',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                {item.isPublic === true ? 'Shared' : 'Private'}
              </span>
              {item.count !== undefined && item.count !== null && item.count > 0 && (
                <div className="badge-count" style={{ flexShrink: 0 }}>
                  <span className="badge-number">{formatBadgeCount(item.count)}</span>
                </div>
              )}
            </div>
          </div>
        </CondensedNoteRowLayout>

        {/* Add button - appears on hover (desktop) or always visible (touch) */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            right: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '2rem',
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
  /** Use `/api/search` (FTS) after submit; browse lists stay from `allNotes` / `allThreads`. */
  enableFullTextSearch?: boolean;
  /** Override API `type` (default: `notes` when itemsToShow is notes, else `all`). */
  fullTextSearchApiType?: SearchResultType;
  /** Required when enableFullTextSearch — separate recent list for this add surface. */
  recentSearchRecordScope?: Exclude<RecentSearchStorageScope, null>;
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
  currentThreadNoteIds = [],
  enableFullTextSearch = false,
  fullTextSearchApiType: fullTextSearchApiTypeProp,
  recentSearchRecordScope,
}: AddToSpaceSectionProps) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [ftsLiveQuery, setFtsLiveQuery] = useState("");
  const [ftsDebouncedQuery, setFtsDebouncedQuery] = useState("");

  const FTS_DEBOUNCE_MS = 200;
  useEffect(() => {
    if (!enableFullTextSearch) return;
    const t = window.setTimeout(() => setFtsDebouncedQuery(ftsLiveQuery.trim()), FTS_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [ftsLiveQuery, enableFullTextSearch]);

  const apiResultType: SearchResultType =
    fullTextSearchApiTypeProp ?? (itemsToShow === 'notes' ? 'notes' : 'all');

  const ftsQuery = enableFullTextSearch ? ftsDebouncedQuery : '';
  const { data: ftsData, isLoading: ftsLoading, isError: ftsError, error: ftsErr } = useSearch(
    ftsQuery,
    undefined,
    apiResultType,
  );

  const ftsLiveTrim = ftsLiveQuery.trim();
  const ftsDebouncePending = ftsLiveTrim.length > 0 && ftsDebouncedQuery !== ftsLiveTrim;
  const ftsDebouncedRef = useRef(ftsDebouncedQuery);
  ftsDebouncedRef.current = ftsDebouncedQuery;
  const ftsLiveRef = useRef(ftsLiveQuery);
  ftsLiveRef.current = ftsLiveQuery;

  const prefetchFts = useCallback(
    (term: string) => {
      const t = term.trim();
      if (!t || t.length < MIN_SEARCH_QUERY_LENGTH || !enableFullTextSearch) return;
      queryClient.prefetchQuery({
        queryKey: searchQueryKey(t, undefined, apiResultType),
        queryFn: () => fetchSearchResults(t, undefined, apiResultType),
      });
    },
    [queryClient, enableFullTextSearch, apiResultType],
  );

  // Not `| null`: both branches return an object literal, and the call site already
  // dereferences the result unguarded. Adding a guard there instead would enshrine
  // a branch that can never run.
  const searchResultToSpaceItem = useCallback((r: SearchResult): SpaceItem => {
    if (r.type === 'note') {
      return {
        id: r.id,
        title: r.title || 'Untitled Note',
        type: 'note',
        spaceId: r.spaceId ?? null,
        content: r.content ?? undefined,
        noteType: (r.noteType as SpaceItem['noteType']) || 'default',
        version: r.version ?? null,
        scriptureTranslation: r.scriptureTranslation ?? null,
        threadColors: r.threadColors,
      };
    }
    return {
      id: r.id,
      title: r.title || 'Untitled',
      type: 'thread',
      spaceId: r.spaceId ?? null,
      color: r.color ?? undefined,
      isPublic: false,
      subtitle: r.subtitle ?? undefined,
    };
  }, []);

  const addableFtsResults = useMemo(() => {
    if (!enableFullTextSearch || !ftsData?.results?.length) return [];
    return ftsData.results.filter((r) => {
      if (selectedItems.includes(r.id)) return false;
      if (r.type === 'note') {
        if (currentThreadId && currentThreadNoteIds.includes(r.id)) return false;
        if (currentSpaceId !== null && r.spaceId === currentSpaceId) return false;
        return true;
      }
      if (r.type === 'thread') {
        if (itemsToShow !== 'all') return false;
        if (r.id === 'thread_unorganized') return false;
        if (currentSpaceId !== null && r.spaceId === currentSpaceId) return false;
        return true;
      }
      return false;
    });
  }, [
    enableFullTextSearch,
    ftsData?.results,
    selectedItems,
    currentThreadId,
    currentThreadNoteIds,
    currentSpaceId,
    itemsToShow,
  ]);

  useEffect(() => {
    if (!enableFullTextSearch || !recentSearchRecordScope) return;
    const trimmed = ftsDebouncedQuery.trim();
    if (trimmed.length < MIN_SEARCH_QUERY_LENGTH) return;
    if (ftsLiveTrim !== trimmed) return;
    if (ftsLoading || ftsError) return;
    if (ftsData?.results === undefined) return;
    const resultCount = addableFtsResults.length;
    const timer = window.setTimeout(() => {
      const d = ftsDebouncedRef.current.trim();
      const live = ftsLiveRef.current.trim();
      if (d.length < MIN_SEARCH_QUERY_LENGTH) return;
      if (live !== d) return;
      if (d !== trimmed) return;
      addRecentSearchTerm(recentSearchRecordScope, d, { resultCount });
    }, RECENT_SEARCH_COMMIT_IDLE_MS);
    return () => window.clearTimeout(timer);
  }, [
    enableFullTextSearch,
    recentSearchRecordScope,
    ftsDebouncedQuery,
    ftsLiveTrim,
    ftsLoading,
    ftsError,
    ftsData?.results,
    addableFtsResults.length,
  ]);

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
    setSearchQuery("");
    setFtsLiveQuery("");
    setFtsDebouncedQuery("");
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

      {enableFullTextSearch && recentSearchRecordScope ? (
        <>
          <div className="mb-1">
            <FindSearchInput
              placeholder={
                placeholder || (itemsToShow === 'notes' ? 'Search notes…' : 'Search notes and threads…')
              }
              value={ftsLiveQuery}
              onValueChange={setFtsLiveQuery}
              disableAutoFocus
              onBeforeSearchNavigate={prefetchFts}
              onSubmitSearch={() => {
                /* Enter: recent term recorded in FindSearchInput */
              }}
              recentSearchRecordScope={recentSearchRecordScope}
            />
          </div>

          {!ftsLiveTrim ? (
            <>
              <div className="mb-2">
                <RecentSearches
                  storageScope={recentSearchRecordScope}
                  onPrefetchSearch={prefetchFts}
                  onSelectRecentTerm={(term) => {
                    prefetchFts(term);
                    setFtsLiveQuery(term);
                    setFtsDebouncedQuery(term.trim());
                  }}
                />
              </div>
              {availableItems.length === 0 ? (
                <div className="text-center py-4 text-[var(--color-stone-grey)] text-sm font-sans">
                  {currentSpaceId === null
                    ? 'No items available to add'
                    : 'All items are already in this space'}
                </div>
              ) : (
                <div className="flex flex-col gap-3 flex-1 overflow-y-auto min-h-0">
                  {recentItems.length > 0 && (
                    <div className="flex-stack" style={{ gap: '0.5rem' }}>
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
                      <div className="flex-stack" style={{ gap: '0.5rem' }}>
                        {recentItems.map((item) => {
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
                  {otherItems.length > 0 && (
                    <div className="flex-stack" style={{ gap: '0.5rem' }}>
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
                      <div className="flex-stack" style={{ gap: '0.5rem' }}>
                        {otherItems.map((item) => {
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
          ) : (
            <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto">
              {ftsDebouncePending || ftsLoading ? (
                <div className="text-center py-6 text-[var(--color-stone-grey)] text-sm font-sans">Searching…</div>
              ) : ftsError ? (
                <div className="text-center py-6 text-[var(--color-stone-grey)] text-sm font-sans">
                  {ftsErr instanceof Error ? ftsErr.message : 'Search failed. Try again.'}
                </div>
              ) : addableFtsResults.length === 0 ? (
                <div className="text-center py-4 text-[var(--color-stone-grey)] text-sm font-sans">
                  {emptyMessage} matching &quot;{ftsLiveTrim}&quot;
                </div>
              ) : (
                <>
                  <div className="text-[12px] font-semibold text-[var(--color-deep-grey)] font-sans mb-1 px-1">
                    {addableFtsResults.length} {addableFtsResults.length === 1 ? 'item' : 'items'} found
                  </div>
                  <div className="flex-stack" style={{ gap: '0.5rem' }}>
                    {addableFtsResults.map((r) => {
                      const item = searchResultToSpaceItem(r);
                      const onClick = () => handleItemClick(item.id, item.type);
                      return (
                        <React.Fragment key={r.id}>
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
        </>
      ) : (
        <>
          <div className="mb-3">
            <SearchInput
              placeholder={placeholder || (itemsToShow === 'notes' ? 'Search notes' : 'Search notes and threads')}
              value={searchQuery}
              onChange={setSearchQuery}
            />
          </div>

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
                  <div className="flex-stack" style={{ gap: '0.5rem' }}>
                    {filteredItems.map((item) => {
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

          {!searchQuery && (
            <>
              {availableItems.length === 0 ? (
                <div className="text-center py-4 text-[var(--color-stone-grey)] text-sm font-sans">
                  {currentSpaceId === null
                    ? 'No items available to add'
                    : 'All items are already in this space'}
                </div>
              ) : (
                <div className="flex flex-col gap-3 flex-1 overflow-y-auto min-h-0">
                  {recentItems.length > 0 && (
                    <div className="flex-stack" style={{ gap: '0.5rem' }}>
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
                      <div className="flex-stack" style={{ gap: '0.5rem' }}>
                        {recentItems.map((item) => {
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
                  {otherItems.length > 0 && (
                    <div className="flex-stack" style={{ gap: '0.5rem' }}>
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
                      <div className="flex-stack" style={{ gap: '0.5rem' }}>
                        {otherItems.map((item) => {
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
        </>
      )}

      {isLoading && (
        <div className="text-[12px] text-[var(--color-stone-grey)] font-sans text-center mt-2">Adding...</div>
      )}
    </div>
  );
}


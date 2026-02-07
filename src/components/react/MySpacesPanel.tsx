import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import SquareButton from './SquareButton';
import SearchInput from './SearchInput';
import { getThreadGradientCSS } from '@/utils/colors';
import { safeNavigate } from '@/utils/safe-navigate';
import { idToUrl } from '@/utils/url-helpers';
import { formatBadgeCount } from '@/utils/badge-count';
import { error as logError } from '@/utils/logger';

interface Space {
  id: string;
  title: string;
  color?: string;
  backgroundGradient?: string;
  totalItemCount: number;
  isPublic?: boolean;
  lastUpdated?: Date | string;
  updatedAt?: Date | string;
}

interface MySpacesPanelProps {
  onClose?: () => void;
  inBottomSheet?: boolean;
  initialSpaces?: Space[]; // Spaces fetched in Astro, passed as props
}

// Smart deduplication: prefers spaces with higher counts, or more recent updatedAt
function deduplicateSpaces(spaces: Space[]): Space[] {
  const spaceMap = new Map<string, Space>();
  for (const space of spaces) {
    const existing = spaceMap.get(space.id);
    if (!existing) {
      spaceMap.set(space.id, space);
    } else {
      // Always prefer the one with higher totalItemCount
      if (space.totalItemCount > existing.totalItemCount) {
        spaceMap.set(space.id, space);
      } else if (space.totalItemCount === existing.totalItemCount) {
        // If counts are equal, prefer the more recent one
        const newUpdated = space.updatedAt || space.lastUpdated;
        const existingUpdated = existing.updatedAt || existing.lastUpdated;
        
        if (newUpdated && existingUpdated) {
          const newDate = new Date(newUpdated);
          const existingDate = new Date(existingUpdated);
          if (newDate > existingDate) {
            spaceMap.set(space.id, space);
          }
        } else if (newUpdated && !existingUpdated) {
          spaceMap.set(space.id, space);
        }
        // If neither has updatedAt, keep existing (first one wins)
      }
      // If existing has higher count, keep it
    }
  }
  return Array.from(spaceMap.values());
}

export default function MySpacesPanel({ 
  onClose,
  inBottomSheet = false,
  initialSpaces = []
}: MySpacesPanelProps) {
  // Use initialSpaces if provided (from Astro), otherwise start empty
  // Deduplicate initial state to prevent duplicates from SSR
  const [spaces, setSpaces] = useState<Space[]>(() => {
    if (initialSpaces.length === 0) return [];
    return deduplicateSpaces(initialSpaces);
  });
  const [isLoading, setIsLoading] = useState(false); // No loading if we have initial data
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const lastFetchTimeRef = useRef<number>(0);
  const hasFetchedRef = useRef<boolean>(false); // Track if we've fetched at least once
  const fetchSpacesRef = useRef<((force?: boolean) => Promise<void>) | null>(null); // Store latest fetchSpaces function
  const hasFetchedFreshDataRef = useRef<boolean>(false); // Track if we've fetched fresh data to prevent stale initialSpaces override

  const fetchSpaces = useCallback(async (force = false) => {
    // Debounce: prevent duplicate fetches within 2 seconds (unless forced)
    // Increased from 500ms to prevent rapid reloads on mobile
    const now = Date.now();
    if (!force && now - lastFetchTimeRef.current < 2000) {
      return;
    }
    lastFetchTimeRef.current = now;
    hasFetchedRef.current = true;

    try {
      setIsLoading(true);
      setError(null);
      
      // Add cache-busting query parameter to ensure fresh data
      const cacheBuster = Date.now();
      const response = await fetch(`/api/navigation/data?t=${cacheBuster}`, {
        credentials: 'include',
        cache: 'no-store'
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch spaces: ${response.status}`);
      }

      const data = await response.json();
      
      // Ensure spaces have backgroundGradient
      const spacesWithGradients = (data.spaces || []).map((space: Space) => ({
        ...space,
        backgroundGradient: space.backgroundGradient || getThreadGradientCSS(space.color || 'paper')
      }));

      // Always merge with existing spaces to preserve optimistically added spaces
      // Deduplication will prefer the version with correct counts
      setSpaces(prevSpaces => {
        const mergedSpaces = deduplicateSpaces([...prevSpaces, ...spacesWithGradients]);
        return mergedSpaces;
      });
      hasFetchedFreshDataRef.current = true; // Mark that we've fetched fresh data
    } catch (err) {
      logError('Error fetching spaces:', { error: err });
      setError(err instanceof Error ? err.message : 'Failed to load spaces');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Store latest fetchSpaces in ref
  useEffect(() => {
    fetchSpacesRef.current = fetchSpaces;
  }, [fetchSpaces]);

  // Initialize only once on mount - prevent infinite loops from initialSpaces prop changes
  useEffect(() => {
    // Only run once on mount
    if (initialSpaces.length > 0 && !hasFetchedFreshDataRef.current) {
      // We have initial data from Astro, use it (only on mount)
      // Deduplicate by space ID, preferring spaces with correct counts
      // Merge with existing spaces to prefer the version with correct counts
      setSpaces(prevSpaces => {
        if (prevSpaces.length === 0) {
          return deduplicateSpaces(initialSpaces);
        }
        // Merge initialSpaces with existing, preferring correct counts
        return deduplicateSpaces([...prevSpaces, ...initialSpaces]);
      });
      setIsLoading(false);
    } else if (initialSpaces.length === 0) {
      // No initial data, fetch on mount (works for both desktop and mobile)
      // For bottom sheets, the event listener will handle refreshes when panel opens
      fetchSpaces(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only run once on mount

  // Visibility-based refetch: refetch when panel becomes visible (backup mechanism)
  // DISABLED for bottom sheets - they use event listeners instead
  // This prevents flickering/reload issues on mobile
  useEffect(() => {
    // Skip IntersectionObserver for bottom sheets - they have event listeners
    if (inBottomSheet) return;
    
    if (!containerRef.current) return;

    let timeoutId: NodeJS.Timeout | null = null;
    let hasFetchedOnVisible = false;
    const mountTime = Date.now();

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          // When panel becomes visible, refetch spaces to ensure latest data
          // Only trigger if it's been more than 2 seconds since mount (to avoid duplicate with mount fetch)
          // And only if we haven't already fetched on visible
          if (entry.isIntersecting && entry.intersectionRatio > 0.5 && !hasFetchedOnVisible) {
            const timeSinceMount = Date.now() - mountTime;
            // Increased threshold to 2 seconds to prevent rapid reloads
            if (timeSinceMount > 2000) {
              hasFetchedOnVisible = true;
              // Force fetch to bypass debounce
              timeoutId = setTimeout(() => {
                fetchSpaces(true);
              }, 100);
            }
          } else if (!entry.isIntersecting) {
            // Only reset after panel has been hidden for at least 1 second
            // This prevents rapid flickering from causing repeated fetches
            if (timeoutId) {
              clearTimeout(timeoutId);
              timeoutId = null;
            }
            // Don't reset hasFetchedOnVisible immediately - wait a bit
            setTimeout(() => {
              hasFetchedOnVisible = false;
            }, 1000);
          }
        });
      },
      {
        threshold: 0.5, // Increased from 0.1 to 0.5 - need 50% visible to trigger (more stable)
        rootMargin: '0px'
      }
    );

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [fetchSpaces, inBottomSheet]);

  // Panel activation listener: refetch when panel is opened via event
  // This is the primary mechanism for bottom sheets
  // Use ref pattern to avoid dependency on fetchSpaces (prevents re-runs)
  useEffect(() => {
    let hasHandledEvent = false;
    let timeoutId: NodeJS.Timeout | null = null;

    const handlePanelOpened = (event: CustomEvent) => {
      const panelName = event.detail?.panelName;
      // Refetch when this specific panel is opened
      if (panelName === 'mySpaces') {
        // Prevent multiple rapid fires
        if (hasHandledEvent) {
          return;
        }
        hasHandledEvent = true;

        // Check if we've already fetched recently (within last 2 seconds)
        const now = Date.now();
        if (now - lastFetchTimeRef.current < 2000) {
          hasHandledEvent = false; // Reset if we skipped
          return; // Skip if we just fetched
        }
        
        // Small delay to ensure panel is mounted before fetching, force to bypass debounce
        timeoutId = setTimeout(() => {
          if (fetchSpacesRef.current) {
            fetchSpacesRef.current(true);
          }
          // Reset flag after a delay to allow future events
          setTimeout(() => {
            hasHandledEvent = false;
          }, 1000);
        }, 200);
      }
    };

    window.addEventListener('openProfilePanel', handlePanelOpened as EventListener);

    return () => {
      window.removeEventListener('openProfilePanel', handlePanelOpened as EventListener);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []); // Empty deps - use ref pattern instead

  // Listen for space deletion events to refresh the list
  // Use ref pattern to avoid dependency on fetchSpaces
  useEffect(() => {
    const handleSpaceDeleted = (event: CustomEvent) => {
      const spaceId = event.detail?.spaceId;
      if (spaceId) {
        // Optimistically remove the space from the list immediately
        setSpaces(prevSpaces => prevSpaces.filter(space => space.id !== spaceId));
        
        // Refetch spaces after a delay to ensure database is committed
        setTimeout(() => {
          if (fetchSpacesRef.current) {
            fetchSpacesRef.current();
          }
        }, 300);
      }
    };

    const handleSpaceCreated = (event: CustomEvent) => {
      const space = event.detail?.space;
      const isOffline = event.detail?.isOffline;
      
      if (space) {
        // Don't add offline spaces optimistically - they'll be synced and appear via fetch
        // Offline spaces have local IDs that will be replaced by server IDs when synced
        if (isOffline) {
          // Just refetch to get spaces from IndexedDB if needed
          setTimeout(() => {
            if (fetchSpacesRef.current) {
              fetchSpacesRef.current(true);
            }
          }, 300);
          return;
        }
        
        // Only add server-created spaces optimistically
        setSpaces(prevSpaces => {
          // Check if already exists
          if (prevSpaces.some(s => s.id === space.id)) {
            return prevSpaces; // Already exists, don't add
          }
          // Add new space with backgroundGradient
          const newSpace: Space = {
            ...space,
            backgroundGradient: space.backgroundGradient || getThreadGradientCSS(space.color || 'paper'),
            totalItemCount: space.totalItemCount || 0 // Ensure it has totalItemCount
          };
          return deduplicateSpaces([...prevSpaces, newSpace]);
        });
        
        // Refetch to get proper counts
        setTimeout(() => {
          if (fetchSpacesRef.current) {
            fetchSpacesRef.current(true);
          }
        }, 300);
      }
    };

    window.addEventListener('spaceDeleted', handleSpaceDeleted as EventListener);
    window.addEventListener('spaceCreated', handleSpaceCreated as EventListener);

    return () => {
      window.removeEventListener('spaceDeleted', handleSpaceDeleted as EventListener);
      window.removeEventListener('spaceCreated', handleSpaceCreated as EventListener);
    };
  }, []); // Empty deps - use ref pattern instead

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      window.dispatchEvent(new CustomEvent('closeProfilePanel'));
    }
  };

  // Filter spaces based on search query
  const filteredSpaces = useMemo(() => {
    // Deduplicate by space ID as a safety net, preferring spaces with correct counts
    const uniqueSpaces = deduplicateSpaces(spaces);
    
    if (!searchQuery.trim()) return uniqueSpaces;
    
    const query = searchQuery.toLowerCase();
    return uniqueSpaces.filter(space =>
      space.title.toLowerCase().includes(query)
    );
  }, [spaces, searchQuery]);

  const handleSpaceClick = (spaceId: string) => {
    const spacePath = idToUrl(spaceId);
    
    // Use View Transitions for smooth navigation
    safeNavigate(spacePath, { history: 'replace' });
  };

  // Render space item in AddToSpaceSection style
  const renderSpaceItem = (space: Space) => {
    const spaceAccentColor = space.color ? `var(--color-${space.color})` : "var(--color-paper)";
    
    return (
      <div
        key={space.id}
        className="relative group"
        style={{
          animation: 'fadeIn 0.3s ease-out forwards',
          opacity: 0
        }}
      >
        <button
          onClick={() => handleSpaceClick(space.id)}
          className="relative rounded-xl h-[48px] cursor-pointer transition-transform duration-200 w-full text-left overflow-hidden hover:scale-[1.002]"
          style={{
            backgroundColor: 'white'
          }}
        >
          {/* Accent bar on left */}
          <div 
            className="absolute inset-y-0 left-0 w-11 rounded-l-xl" 
            style={{ backgroundColor: spaceAccentColor }}
          />
          
          {/* Content */}
          <div className="flex items-center gap-6 pl-3 pr-4 h-full">
            {/* User icon (Private) or User group icon (Shared) */}
            <div className="relative shrink-0 size-5">
              {space.isPublic === true ? (
                <svg className="block max-w-none size-full text-[var(--color-deep-grey)] opacity-30" fill="currentColor" viewBox="0 0 640 640">
                  <path d="M96 192C96 130.1 146.1 80 208 80C269.9 80 320 130.1 320 192C320 253.9 269.9 304 208 304C146.1 304 96 253.9 96 192zM32 528C32 430.8 110.8 352 208 352C305.2 352 384 430.8 384 528L384 534C384 557.2 365.2 576 342 576L74 576C50.8 576 32 557.2 32 534L32 528zM464 128C517 128 560 171 560 224C560 277 517 320 464 320C411 320 368 277 368 224C368 171 411 128 464 128zM464 368C543.5 368 608 432.5 608 512L608 534.4C608 557.4 589.4 576 566.4 576L421.6 576C428.2 563.5 432 549.2 432 534L432 528C432 476.5 414.6 429.1 385.5 391.3C408.1 376.6 435.1 368 464 368z"/>
                </svg>
              ) : (
                <svg className="block max-w-none size-full text-[var(--color-deep-grey)] opacity-30" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
              )}
            </div>
            
            {/* Text content - title and count */}
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              {/* Title */}
              <div className="font-sans font-bold text-[var(--color-deep-grey)] text-[16px] truncate">
                {space.title}
              </div>
            </div>
            
            {/* Item count badge */}
            {space.totalItemCount > 0 && (
              <div className="badge-count">
                <span className="badge-number">
                  {formatBadgeCount(space.totalItemCount)}
                </span>
              </div>
            )}
          </div>
        </button>
      </div>
    );
  };

  return (
    <div ref={containerRef} className={`panel-wrapper ${inBottomSheet ? 'panel-wrapper--bottom-sheet' : ''} relative`}>
      {/* Loading indicator - progress bar at top */}
      {isLoading && (
        <div className="panel__progress-bar" style={{ position: 'absolute', top: 0, zIndex: 50 }}>
          <div className="panel__progress-fill"></div>
        </div>
      )}
      
      {/* Content area - expands on mobile, fits content on desktop */}
      <div className={inBottomSheet ? "flex-1 flex flex-col min-h-0" : "flex flex-col"}>
        {/* Panel container */}
        <div className={`panel ${inBottomSheet ? 'panel--bottom-sheet' : ''} ${isLoading ? 'opacity-60 pointer-events-none' : ''}`}>
          {/* Header section */}
          <div className="panel__header">
            <div className="panel__title">
              <p>My Spaces</p>
            </div>
          </div>
          
          {/* Content area */}
          <div className={`panel__body ${inBottomSheet ? 'panel__body--bottom-sheet' : ''}`}>
            <div className={`panel__content ${inBottomSheet ? 'panel__content--bottom-sheet' : ''}`}>
              
              {/* Search Input */}
              <div className="mb-3 w-full">
                <SearchInput
                  placeholder="Search spaces..."
                  value={searchQuery}
                  onChange={setSearchQuery}
                />
              </div>

              {/* Error state */}
              {error && (
                <div className="w-full p-4 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-red-600 text-sm">{error}</p>
                </div>
              )}

              {/* Search Results */}
              {searchQuery && (
                <div className="flex flex-col gap-2 w-full">
                  {filteredSpaces.length === 0 ? (
                    <div className="text-center py-4 text-[var(--color-stone-grey)] text-sm font-sans">
                      No spaces found matching "{searchQuery}"
                    </div>
                  ) : (
                    <>
                      <div className="text-[12px] text-[var(--color-stone-grey)] font-sans mb-1">
                        {filteredSpaces.length} {filteredSpaces.length === 1 ? 'space' : 'spaces'} found
                      </div>
                      <div className="flex flex-col gap-2">
                        {filteredSpaces.map(space => renderSpaceItem(space))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Show all spaces when no search query */}
              {!searchQuery && (
                <>
                  {/* Empty state */}
                  {!isLoading && !error && spaces.length === 0 && (
                    <div className="w-full p-8 text-center">
                      <p className="text-[var(--color-pebble-grey)] text-[16px]">
                        No spaces yet. Create your first space and you'll see it here.
                      </p>
                    </div>
                  )}

                  {/* Spaces list */}
                  {!isLoading && !error && spaces.length > 0 && (
                    <div className="flex flex-col gap-2 w-full">
                      {spaces.length > 0 && (
                        <div className="text-[12px] text-[var(--color-stone-grey)] font-sans mb-1">
                          {spaces.length} {spaces.length === 1 ? 'space' : 'spaces'} available
                        </div>
                      )}
                      <div className="flex flex-col gap-2">
                        {spaces.map(space => renderSpaceItem(space))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom buttons */}
      <div className="panel__footer--buttons">
        {/* Back button - SquareButton Back variant */}
        <SquareButton 
          variant="Back"
          onClick={handleClose}
          inBottomSheet={inBottomSheet}
        />
        <button
          type="button"
          data-outer-shadow
          className="btn-cta flex-1 group"
          onClick={() => safeNavigate('/new-space', { history: 'push' })}
        >
          <span className="btn-cta__content">New Space</span>
          <div className="btn-cta__shadow" />
        </button>
      </div>

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
    </div>
  );
}


import React, { useEffect, useState, useRef } from 'react';
import FaXmarkIcon from "@fortawesome/fontawesome-free/svgs/solid/xmark.svg";

interface RecentSearch {
  term: string;
  count: number;
}

const RecentSearches: React.FC = () => {
  const [isClient, setIsClient] = useState(false);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const containerRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Handle SSR - only run client-side code after hydration
  useEffect(() => {
    setIsClient(true);
    updateRecentSearches();
    
    // Listen for updates when items are removed or counts are updated
    const handleUpdate = () => {
      updateRecentSearches();
    };
    
    window.addEventListener('recent-searches-updated', handleUpdate);
    
    return () => {
      window.removeEventListener('recent-searches-updated', handleUpdate);
    };
  }, []);

  // Set up click handlers for close icons using capture phase
  useEffect(() => {
    if (!isClient) return;

    const handlers = new Map<HTMLDivElement, (e: MouseEvent) => void>();

    containerRefs.current.forEach((el, searchTerm) => {
      const handleClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        const closeIcon = target.closest('.close-icon');
        const rect = el.getBoundingClientRect();
        const isCloseArea = e.clientX > rect.right - 60; // 60px from right edge
        
        if (closeIcon || isCloseArea) {
          e.stopImmediatePropagation();
          e.stopPropagation();
          e.preventDefault();
          removeFromRecentSearches(searchTerm);
        }
      };
      
      handlers.set(el, handleClick);
      el.addEventListener('click', handleClick, true); // Capture phase
    });

    return () => {
      handlers.forEach((handler, el) => {
        el.removeEventListener('click', handler, true);
      });
    };
  }, [isClient, recentSearches]);

  const updateRecentSearches = () => {
    const stored = JSON.parse(localStorage.getItem('harvous-recent-searches') || '[]');
    // Handle both old format (strings) and new format (objects)
    const searches = stored.map((item: any) => {
      if (typeof item === 'string') {
        return { term: item, count: 0 };
      }
      return item;
    }).slice(0, 5);
    
    setRecentSearches(searches);
  };

  const removeFromRecentSearches = (searchTerm: string) => {
    const recentSearches = JSON.parse(localStorage.getItem('harvous-recent-searches') || '[]');
    const updatedSearches = recentSearches.filter((search: any) => {
      // Handle both old format (strings) and new format (objects)
      const term = typeof search === 'string' ? search : search.term;
      return term !== searchTerm;
    });
    localStorage.setItem('harvous-recent-searches', JSON.stringify(updatedSearches));
    
    // Trigger reactivity by dispatching a custom event
    window.dispatchEvent(new CustomEvent('recent-searches-updated'));
  };


  // Don't render during SSR
  if (!isClient) {
    return null;
  }

  if (recentSearches.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="font-sans font-semibold text-[#4a473d] text-[16px] leading-[1.2]">
        <p>Recent searches</p>
      </div>
      <div className="flex flex-col gap-2">
        {recentSearches.map((search) => (
          <div key={search.term} className="recent-search-item">
            <div 
              className="relative nav-item-container"
              ref={(el) => {
                if (el) {
                  containerRefs.current.set(search.term, el);
                } else {
                  containerRefs.current.delete(search.term);
                }
              }}
            >
              <a 
                href={`/search?q=${encodeURIComponent(search.term)}`} 
                className="block recent-search-link w-full"
                style={{ pointerEvents: 'auto' }}
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  const closeIcon = target.closest('.close-icon');
                  if (closeIcon) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.nativeEvent && typeof e.nativeEvent.stopImmediatePropagation === 'function') {
                      e.nativeEvent.stopImmediatePropagation();
                    }
                    return false;
                  }
                }}
              >
                <button 
                  className="space-button relative rounded-xl h-[64px] cursor-pointer transition-[scale,shadow] duration-300 pl-4 pr-0 group w-full" 
                  style={{
                    backgroundImage: 'var(--color-gradient-gray)',
                    boxShadow: '0px -3px 0px 0px rgba(120, 118, 111, 0.2) inset'
                  }}
                >
                  <div className="flex items-center justify-between relative w-full h-full pl-2 pr-0 transition-transform duration-125">
                    <span className="text-[var(--color-deep-grey)] font-sans text-[18px] font-semibold whitespace-nowrap">
                      {search.term}
                    </span>
                    <div className="flex items-center justify-center p-[20px]">
                      <div className="badge-count bg-[rgba(120,118,111,0.1)] flex items-center justify-center rounded-3xl w-6 h-6 pointer-events-none">
                        <span className="text-[14px] font-sans font-semibold text-[var(--color-deep-grey)] leading-[0] badge-number">
                          {search.count}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              </a>
              {/* Close icon positioned outside the link element, aligned with badge count center */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  removeFromRecentSearches(search.term);
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                className="close-icon absolute top-1/2 transform -translate-y-1/2 w-8 h-8 cursor-pointer flex items-center justify-center"
                style={{ right: '16px', zIndex: 30, pointerEvents: 'auto' }}
                data-item-id={search.term}
                data-search-term={search.term}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    removeFromRecentSearches(search.term);
                  }
                }}
              >
                <img 
                  src={FaXmarkIcon.src} 
                  alt="Close" 
                  className="w-4 h-4 pointer-events-none" 
                  style={{ color: 'var(--color-deep-grey)' }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {/* Add CSS for hover states */}
      <style>{`
        .nav-item-container:has(.close-icon):hover .close-icon {
          opacity: 1 !important;
          visibility: visible !important;
        }
        .close-icon {
          opacity: 0;
          visibility: visible !important; /* Keep visible so it can receive clicks */
          pointer-events: auto !important; /* Always allow clicks */
          z-index: 50 !important;
          display: flex !important;
          transition: opacity 0.2s ease;
          position: absolute !important;
        }
        .nav-item-container .close-icon {
          z-index: 50 !important;
        }
        .badge-count {
          pointer-events: none;
        }
        .badge-count:hover {
          background-color: rgba(120, 118, 111, 0.1) !important;
        }
        /* Ensure close icon is always on top and clickable */
        .nav-item-container .close-icon:hover {
          opacity: 1 !important;
          visibility: visible !important;
        }
        /* Ensure link doesn't overlap close icon area */
        .recent-search-link {
          position: relative;
          z-index: 1;
        }
      `}</style>
    </div>
  );
};

export default RecentSearches;


import React, { useEffect, useState, useCallback } from 'react';
import FaXmarkIcon from "@fortawesome/fontawesome-free/svgs/solid/xmark.svg";

interface RecentSearch {
  term: string;
  count: number;
}

const RecentSearches: React.FC = () => {
  const [isClient, setIsClient] = useState(false);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);

  const updateRecentSearches = useCallback(() => {
    const stored = JSON.parse(localStorage.getItem('harvous-recent-searches') || '[]');
    // Handle both old format (strings) and new format (objects)
    const searches = stored.map((item: any) => {
      if (typeof item === 'string') {
        return { term: item, count: 0 };
      }
      return item;
    }).slice(0, 5);
    
    setRecentSearches(searches);
  }, []);

  const removeFromRecentSearches = useCallback((searchTerm: string) => {
    console.log('Removing search term:', searchTerm);
    const stored = JSON.parse(localStorage.getItem('harvous-recent-searches') || '[]');
    console.log('Current searches:', stored);
    
    const updatedSearches = stored.filter((search: any) => {
      // Handle both old format (strings) and new format (objects)
      const term = typeof search === 'string' ? search : search.term;
      return term !== searchTerm;
    });
    
    console.log('Updated searches:', updatedSearches);
    localStorage.setItem('harvous-recent-searches', JSON.stringify(updatedSearches));
    
    // Update state directly with the filtered results
    const formattedSearches = updatedSearches.map((item: any) => {
      if (typeof item === 'string') {
        return { term: item, count: 0 };
      }
      return item;
    }).slice(0, 5);
    
    setRecentSearches(formattedSearches);
    
    // Trigger reactivity by dispatching a custom event
    window.dispatchEvent(new CustomEvent('recent-searches-updated'));
  }, []);

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
  }, [updateRecentSearches]);


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
            <div className="relative nav-item-container">
              <button 
                className="space-button relative rounded-xl h-[64px] cursor-pointer transition-[scale,shadow] duration-300 pl-4 pr-4 group w-full text-left" 
                style={{
                  backgroundImage: 'var(--color-gradient-gray)',
                  boxShadow: '0px -3px 0px 0px rgba(120, 118, 111, 0.2) inset',
                  color: 'var(--color-deep-grey)'
                }}
                onClick={(e) => {
                  // Don't navigate if clicking on close icon
                  if ((e.target as HTMLElement).closest('.recent-search-close-icon')) {
                    return;
                  }
                  // Navigate to search results
                  window.location.href = `/find?q=${encodeURIComponent(search.term)}`;
                }}
              >
                <div className="flex items-center">
                  <span className="font-sans text-[18px] font-semibold">
                    {search.term}
                  </span>
                  <span className="badge-count bg-[rgba(120,118,111,0.1)] inline-flex items-center justify-center rounded-3xl w-6 h-6 ml-4 text-[14px] font-sans font-semibold leading-[0]">
                    {search.count}
                  </span>
                </div>
              </button>
              {/* Close icon - always visible, matches SpaceButton close handler pattern */}
              <div
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  e.preventDefault();
                  console.log('Close clicked for:', search.term);
                  removeFromRecentSearches(search.term);
                }}
                className="recent-search-close-icon absolute top-1/2 right-4 transform -translate-y-1/2 flex items-center justify-center w-6 h-6 cursor-pointer"
                data-item-id={search.term}
              >
                <img 
                  src={FaXmarkIcon.src} 
                  alt="Close" 
                  className="w-5 h-5" 
                  style={{ color: 'var(--color-deep-grey)' }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {/* CSS for close icon - always visible */}
      <style>{`
        .recent-search-item .recent-search-close-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 50;
        }
      `}</style>
    </div>
  );
};

export default RecentSearches;


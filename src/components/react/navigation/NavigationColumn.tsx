import React, { useState, useEffect } from 'react';
import SpaceButton from './SpaceButton';
import PersistentNavigation from './PersistentNavigation';
import Avatar from './Avatar';
import SquareButton from './SquareButton';

interface Space {
  id: string;
  title: string;
  totalItemCount: number;
  backgroundGradient: string;
}

interface ActiveThread {
  id: string;
  title: string;
  noteCount: number;
  backgroundGradient: string;
}

interface CurrentSpace {
  id: string;
}

interface NavigationColumnProps {
  inboxCount?: number;
  spaces?: Space[];
  activeThread?: ActiveThread | null;
  currentSpace?: CurrentSpace | null;
  isNote?: boolean;
  currentId?: string;
  showProfile?: boolean;
  initials?: string;
  userColor?: string;
}

const NavigationColumn: React.FC<NavigationColumnProps> = ({
  inboxCount = 0,
  spaces = [],
  activeThread = null,
  currentSpace = null,
  isNote = false,
  currentId = null,
  showProfile = false,
  initials = "DJ",
  userColor = "paper"
}) => {
  const [profileData, setProfileData] = useState({
    initials: initials,
    userColor: userColor,
  });
  const [showActiveThread, setShowActiveThread] = useState(false);
  const [currentItemId, setCurrentItemId] = useState('');
  const [updatedActiveThread, setUpdatedActiveThread] = useState<ActiveThread | null>(activeThread);

  useEffect(() => {
    const handleProfileUpdate = (event: CustomEvent) => {
      const { firstName, lastName, selectedColor } = event.detail;
      if (firstName && lastName && selectedColor) {
        const newInitials = `${firstName.charAt(0) || ''}${lastName.charAt(0) || ''}`.toUpperCase();
        setProfileData({
          initials: newInitials,
          userColor: selectedColor
        });
      }
    };
  
    window.addEventListener('updateProfile', handleProfileUpdate as EventListener);
  
    return () => {
      window.removeEventListener('updateProfile', handleProfileUpdate as EventListener);
    };
  }, []);

  // Sync updatedActiveThread when activeThread prop changes
  useEffect(() => {
    setUpdatedActiveThread(activeThread);
  }, [activeThread]);
  
  // Initialize current item ID and listen for page changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCurrentItemId(window.location.pathname.substring(1));
    }
  }, []);

  // Listen for page changes to update current item
  useEffect(() => {
    const handlePageLoad = () => {
      // Update current item ID when page changes
      setCurrentItemId(window.location.pathname.substring(1));
    };

    document.addEventListener('astro:page-load', handlePageLoad);
    
    return () => {
      document.removeEventListener('astro:page-load', handlePageLoad);
    };
  }, []);
  
  // Check if active thread is in persistent navigation on client side
  useEffect(() => {
    if (activeThread && typeof window !== 'undefined') {
      try {
        const navHistory = localStorage.getItem('harvous-navigation-history-v2');
        if (navHistory) {
          const history = JSON.parse(navHistory);
          const isInPersistentNav = history.some((item: any) => item.id === activeThread.id);
          // For note pages, always show the active thread button to maintain context
          // For other pages, only show if not in persistent navigation
          setShowActiveThread(!isInPersistentNav);
        }
      } catch (error) {
        console.error('Error checking persistent navigation:', error);
        setShowActiveThread(true); // Default to showing if error
      }
    }
  }, [activeThread, isNote, currentItemId]);

  // Listen for note count changes to refresh activeThread count
  useEffect(() => {
    if (!activeThread) return;

    const refreshActiveThreadCount = async () => {
      try {
        // Fetch current thread data from API
        const response = await fetch('/api/threads/list', {
          credentials: 'include'
        });

        if (response.ok) {
          const threads = await response.json();
          const threadData = threads.find((t: any) => t.id === activeThread.id);
          
          if (threadData) {
            setUpdatedActiveThread((prev) => {
              // Only update if count actually changed
              if (prev && prev.noteCount === threadData.noteCount) {
                return prev;
              }
              return {
                ...activeThread,
                noteCount: threadData.noteCount
              };
            });
          }
        }
      } catch (error) {
        console.error('Error refreshing active thread count:', error);
      }
    };

    const handleNoteCreated = () => {
      setTimeout(() => refreshActiveThreadCount(), 300);
    };

    const handleNoteDeleted = () => {
      setTimeout(() => refreshActiveThreadCount(), 300);
    };

    const handleNoteRemovedFromThread = (event: CustomEvent) => {
      const { threadId } = event.detail;
      if (threadId === activeThread.id) {
        setTimeout(() => refreshActiveThreadCount(), 300);
      }
    };

    const handleNoteAddedToThread = (event: CustomEvent) => {
      const { threadId } = event.detail;
      if (threadId === activeThread.id) {
        setTimeout(() => refreshActiveThreadCount(), 300);
      }
    };

    // Register event listeners
    window.addEventListener('noteCreated', handleNoteCreated);
    window.addEventListener('noteDeleted', handleNoteDeleted);
    window.addEventListener('noteRemovedFromThread', handleNoteRemovedFromThread as EventListener);
    window.addEventListener('noteAddedToThread', handleNoteAddedToThread as EventListener);

    // Cleanup
    return () => {
      window.removeEventListener('noteCreated', handleNoteCreated);
      window.removeEventListener('noteDeleted', handleNoteDeleted);
      window.removeEventListener('noteRemovedFromThread', handleNoteRemovedFromThread as EventListener);
      window.removeEventListener('noteAddedToThread', handleNoteAddedToThread as EventListener);
    };
  }, [activeThread]);
  return (
    <div className="h-full">
      <div className="flex flex-col items-start justify-between relative h-full">
        {/* Top Section - Navigation */}
        <div className="flex flex-col gap-12 items-start justify-start w-full flex-1 min-h-0">
          {/* Navigation Buttons */}
          <div className="flex flex-col items-start justify-start w-full">
            <a href="/" className="w-full">
              <SpaceButton 
                text="For You" 
                count={inboxCount} 
                state="WithCount" 
                className="w-full" 
                isActive={!currentSpace && !activeThread && !currentId}
                backgroundGradient={!currentSpace && !activeThread && !currentId ? "var(--color-paper)" : undefined}
              />
            </a>
            
            {/* Persistent Navigation - shows recently accessed items */}
            <PersistentNavigation />
            
            {/* Show created spaces */}
            {spaces.map(space => (
              <div key={space.id} data-navigation-item={space.id} className="w-full">
                <a href={`/${space.id}`} className="w-full">
                  <SpaceButton 
                    text={space.title} 
                    count={space.totalItemCount} 
                    state="Close" 
                    className="w-full" 
                    backgroundGradient={space.backgroundGradient}
                    isActive={currentSpace?.id === space.id}
                    itemId={space.id}
                  />
                </a>
              </div>
            ))}
            
            {/* Show active thread if any - but only if it's not already in persistent navigation */}
            {(updatedActiveThread || activeThread) && showActiveThread ? (
              <a href={`/${(updatedActiveThread || activeThread)!.id}`} className="w-full">
                <SpaceButton 
                  text={(updatedActiveThread || activeThread)!.title} 
                  count={(updatedActiveThread || activeThread)!.noteCount} 
                  state="Close" 
                  className="w-full" 
                  backgroundGradient={(updatedActiveThread || activeThread)!.backgroundGradient}
                  isActive={isNote || (updatedActiveThread || activeThread)!.id === currentItemId}
                  itemId={(updatedActiveThread || activeThread)!.id}
                />
              </a>
            ) : null}
            
            
          </div>
        </div>
        
        {/* Bottom Section with New Space Button, Search, and Avatar/Back Button */}
        <div className="flex gap-3 items-center justify-start w-full shrink-0">
          <div className="flex-1">
            <a href="/new-space" className="w-full">
              <SpaceButton text="New Space" className="w-full" />
            </a>
          </div>
          <a href="/find" aria-label="Search">
            <SquareButton variant="Find" />
          </a>
          {showProfile ? (
            <a href="/" aria-label="Go to dashboard">
              <SquareButton variant="Back" />
            </a>
          ) : (
            <a href="/profile" aria-label="Go to profile">
              <Avatar initials={profileData.initials} color={profileData.userColor} />
            </a>
          )}
        </div>
      </div>
      
      {/* Add CSS for SpaceButton styling */}
      <style>{`
        button {
          will-change: transform;
          transition: box-shadow 0.125s ease-in-out;
        }
        
        /* Force left alignment for all SpaceButton text, except badge numbers */
        .space-button span:not(.badge-number) {
          text-align: left !important;
        }
        
        /* Center badge numbers */
        .badge-number {
          text-align: center !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          width: 100% !important;
          height: 100% !important;
        }
        
        /* Ensure the button content is left-aligned */
        .space-button {
          text-align: left !important;
        }
        
        .space-button div {
          justify-content: flex-start !important;
        }

        button[style*="background-image"] {
          /* Shadow removed - handled by global CSS */
        }

        button:not([data-outer-shadow]):active {
          filter: brightness(0.97);
          /* Shadow removed - handled by global CSS */
        }

        /* Add text and icon animations similar to Button.astro and SquareButton.astro */
        button:active > div {
          translate: 0 0;
          transform: scale(0.98);
        }

        button:active svg {
          transform: scale(0.95);
        }

        /* Close icon hover states - only for inactive items that have a close icon (itemId) */
        .nav-item-container:not(.active):has(.close-icon) .badge-count:hover .badge-number {
          display: none !important;
        }
        .nav-item-container:not(.active):has(.close-icon) .badge-count:hover .close-icon {
          display: flex !important;
        }
        .close-icon {
          display: none;
        }
        
        /* TagClose variant - always show close icon, no badge count */
        .nav-item-container .close-icon[data-item-id] {
          display: flex !important;
        }
      `}</style>
    </div>
  );
};

export default NavigationColumn;

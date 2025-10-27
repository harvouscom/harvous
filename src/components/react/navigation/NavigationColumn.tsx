import React from 'react';
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
  return (
    <div slot="navigation" className="h-full">
      <div className="flex flex-col items-start justify-between relative h-full">
        {/* Top Section - Navigation */}
        <div className="flex flex-col gap-12 items-start justify-start w-full flex-1 min-h-0">
          {/* Navigation Buttons */}
          <div className="flex flex-col items-start justify-start w-full">
            <a href="/dashboard" className="w-full">
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
            
            {/* Show active thread if any */}
            {activeThread ? (
              <a href={`/${activeThread.id}`} className="w-full">
                <SpaceButton 
                  text={activeThread.title} 
                  count={activeThread.noteCount} 
                  state="Close" 
                  className="w-full" 
                  backgroundGradient={activeThread.backgroundGradient}
                  isActive={isNote || activeThread.id === currentId}
                  itemId={activeThread.id}
                />
              </a>
            ) : null}
          </div>
        </div>
        
        {/* Bottom Section with New Space Button, Search, and Avatar/Back Button */}
        <div className="flex gap-3 items-center justify-start w-full shrink-0">
          <a href="/new-space" className="flex-1">
            <SpaceButton text="New Space" className="w-full" />
          </a>
          <a href="/search">
            <SquareButton variant="Search" />
          </a>
          {showProfile ? (
            <a href="/dashboard">
              <SquareButton variant="Back" />
            </a>
          ) : (
            <a href="/profile">
              <Avatar initials={initials} color={userColor} />
            </a>
          )}
        </div>
      </div>
      
      {/* Add CSS for SpaceButton styling */}
      <style jsx>{`
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

        /* Close icon hover states - only for inactive items */
        .nav-item-container:not(.active):hover .badge-count {
          display: none !important;
        }
        .nav-item-container:not(.active):hover .close-icon {
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

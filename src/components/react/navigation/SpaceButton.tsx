import React from 'react';
import FaAngleDownIcon from "@fortawesome/fontawesome-free/svgs/solid/angle-down.svg";
import FaXmarkIcon from "@fortawesome/fontawesome-free/svgs/solid/xmark.svg";
import { useNavigation } from './NavigationContext';
import { getThreadTextColorCSS, THREAD_COLORS, type ThreadColor } from '@/utils/colors';

interface SpaceButtonProps {
  className?: string;
  text?: string;
  count?: number;
  state?: "Default" | "Dropdown" | "WithCount" | "DropdownTrigger" | "Close" | "WithArrow" | "TagClose";
  showCount?: boolean;
  backgroundGradient?: string;
  isActive?: boolean;
  itemId?: string;
  onClick?: () => void;
  disabled?: boolean;
  hideDropdownIcon?: boolean;
}

const SpaceButton: React.FC<SpaceButtonProps> = ({
  className = "",
  text = "For You",
  count = 1,
  state = "Default",
  showCount = false,
  backgroundGradient = "var(--color-gradient-gray)",
  isActive = true,
  itemId,
  onClick,
  disabled = false,
  hideDropdownIcon = false,
  ...props
}) => {
  const { removeFromNavigationHistory } = useNavigation();
  const handleCloseClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    
    if (!itemId) {
      console.log('❌ No item ID found');
      return;
    }
    
    // Check if this is a tag (in NoteDetailsPanel)
    const isTag = (event.target as HTMLElement).closest('.note-details-panel') || 
                  (event.target as HTMLElement).closest('.tag-item');
    
    if (isTag) {
      // Handle tag removal
      if ((window as any).removeTagFromNote) {
        (window as any).removeTagFromNote(event, event.target);
      } else {
        console.log('❌ removeTagFromNote function not available');
      }
      return;
    }
    
    // Check if this is a space (spaces can't be recovered once closed)
    if (itemId.startsWith('space_')) {
      // Get the space title from the button
      const button = (event.target as HTMLElement).closest('.space-button');
      const spaceTitle = button?.querySelector('span')?.textContent || 'this space';
      
      // Show confirmation dialog
      const confirmed = confirm(`Are you sure you want to close "${spaceTitle}"?\n\nThis will remove it from your navigation and you won't be able to bring it back.`);
      
      if (!confirmed) {
        return; // User cancelled
      }
    }
    
    // Check if this is a recent search item (on search page)
    const isRecentSearch = window.location.pathname === '/find' && 
                          (event.target as HTMLElement).closest('.recent-search-item');
    
    if (isRecentSearch) {
      // Remove from recent searches
      if ((window as any).removeFromRecentSearches) {
        (window as any).removeFromRecentSearches(itemId);
      } else {
        console.log('❌ removeFromRecentSearches function not available');
      }
    } else {
      // Remove from navigation history using context
      removeFromNavigationHistory(itemId);
      
      // For regular navigation items, navigate to dashboard
      if ((window as any).astroNavigate) {
        (window as any).astroNavigate('/');
      } else {
        window.location.replace('/');
      }
    }
  };

  // Compute button style - must be consistent for SSR and client to avoid hydration mismatch
  // For CSS variables, we can safely set them on both server and client since they're just strings
  const buttonStyle = React.useMemo(() => {
    if (!isActive || disabled) {
      return {};
    }
    
    // Directly apply CSS variables for consistent rendering between server and client
    // This avoids hydration mismatches
    const style: React.CSSProperties = {};
    if (backgroundGradient) {
      if (backgroundGradient.includes('gradient')) {
        style.backgroundImage = backgroundGradient;
      } else {
        style.backgroundColor = backgroundGradient;
      }
    }
    return style;
  }, [isActive, disabled, backgroundGradient]);
  
  const cursorStyle = disabled ? 'cursor-not-allowed' : 'cursor-pointer';
  const textStyle = disabled ? 'opacity-50' : '';
  
  // Helper to determine if background is colored (not paper or gray gradient)
  const isColoredBackground = (gradient: string | undefined): boolean => {
    if (!gradient || gradient === 'var(--color-gradient-gray)' || gradient === 'var(--color-paper)') {
      return false;
    }
    const threadColors = THREAD_COLORS.filter(c => c !== 'paper');
    return threadColors.some(color => gradient.includes(`--color-${color}`));
  };
  
  // Determine close icon color - pastel colors use dark text
  const closeIconColor = 'var(--color-deep-grey)';

  if (state === "Default") {
    return (
      <button 
        className={`space-button relative rounded-xl h-[64px] ${cursorStyle} transition-[scale,shadow] duration-300 px-4 ${className}`}
        style={buttonStyle}
        onClick={onClick}
        disabled={disabled}
        {...props}
      >
        <div className="flex items-center justify-start relative w-full h-full pl-2 pr-2 transition-transform duration-125 min-w-0">
          <div className="flex-1 min-w-0 overflow-hidden text-left">
            <span className={`text-[var(--color-deep-grey)] font-sans text-[18px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis block text-left ${textStyle}`} style={{textAlign: 'left'}}>
              {text}
            </span>
          </div>
        </div>
      </button>
    );
  }

  if (state === "WithCount") {
    // Add active class for CSS-based styling to avoid hydration issues
    const activeClass = isActive && !disabled && backgroundGradient ? 'space-button-active' : '';
    return (
      <button 
        className={`space-button relative rounded-xl h-[64px] ${cursorStyle} transition-[scale,shadow] duration-300 pl-4 pr-0 ${activeClass} ${className}`}
        style={buttonStyle}
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        {...props}
      >
        <div className="flex items-center relative w-full h-full pl-2 pr-0 transition-transform duration-125 min-w-0">
          <div className="flex-1 min-w-0 overflow-hidden text-left">
            <span className={`text-[var(--color-deep-grey)] font-sans text-[18px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis block text-left ${textStyle}`}>
              {text}
            </span>
          </div>
          <div className="p-[20px] flex-shrink-0">
            <div className="badge-count bg-[rgba(120,118,111,0.1)] flex items-center justify-center rounded-3xl w-6 h-6">
              <span className="text-[14px] font-sans font-semibold text-[var(--color-deep-grey)] leading-[0] badge-number">
                {count}
              </span>
            </div>
          </div>
        </div>
        
        {/* Only show shadow when active */}
        {isActive && (
          <div className="absolute inset-0 pointer-events-none rounded-xl shadow-[0px_-3px_0px_0px_rgba(120,118,111,0.2)_inset]" />
        )}
      </button>
    );
  }

  if (state === "DropdownTrigger") {
    return (
      <button 
        className={`space-button relative rounded-xl h-[64px] ${cursorStyle} transition-[scale,shadow] duration-300 pl-4 ${hideDropdownIcon ? 'pr-4' : 'pr-0'} ${className}`}
        style={buttonStyle}
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        {...props}
      >
        <div className={`flex items-center relative w-full h-full pl-2 ${hideDropdownIcon ? 'pr-2' : 'pr-0'} transition-transform duration-125 min-w-0`}>
          <div className="flex-1 min-w-0 overflow-hidden text-left">
            <span className={`text-[var(--color-deep-grey)] font-sans text-[18px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis block text-left ${textStyle}`}>
              {text}
            </span>
          </div>
          {count !== undefined && count !== null && (
            <div className="bg-[rgba(120,118,111,0.1)] flex items-center justify-center rounded-3xl w-6 h-6 ml-3">
              <span className="text-[14px] font-sans font-semibold text-[var(--color-deep-grey)] leading-[0] badge-number">
                {count}
              </span>
            </div>
          )}
          {!hideDropdownIcon && (
            <div className="flex items-center justify-center relative shrink-0">
              <div className="flex-none scale-y-[-100%]">
                <div className="box-border content-stretch flex gap-2.5 items-center justify-start p-[12px] relative">
                  <div className="flex items-center justify-center relative shrink-0">
                    <div className="flex-none scale-y-[-100%]">
                      <div className="relative size-5">
                        <img src={FaAngleDownIcon.src} alt="Dropdown" className="fill-[var(--color-deep-grey)] block max-w-none w-full h-full transition-transform duration-125" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </button>
    );
  }

  if (state === "Dropdown") {
    return (
      <button 
        className={`space-button relative rounded-xl h-[64px] ${cursorStyle} transition-[scale,shadow] duration-300 pl-4 pr-0 ${className}`}
        style={buttonStyle}
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        {...props}
      >
        <div className="flex items-center relative w-full h-full pl-2 pr-0 transition-transform duration-125 min-w-0">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex-1 min-w-0 overflow-hidden text-left">
              <span className={`text-[var(--color-deep-grey)] font-sans text-[18px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis block text-left ${textStyle}`}>
                {text}
              </span>
            </div>
            <div className="bg-[rgba(120,118,111,0.1)] flex items-center justify-center rounded-3xl w-6 h-6">
              <span className="text-[14px] font-sans font-semibold text-[var(--color-deep-grey)] leading-[0] badge-number">
                {count}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-center relative shrink-0">
            <div className="flex-none scale-y-[-100%]">
              <div className="box-border content-stretch flex gap-2.5 items-center justify-start p-[12px] relative">
                <div className="flex items-center justify-center relative shrink-0">
                  <div className="flex-none scale-y-[-100%]">
                    <div className="relative size-5">
                      <img src={FaAngleDownIcon.src} alt="Dropdown" className="fill-[var(--color-deep-grey)] block max-w-none w-full h-full transition-transform duration-125" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </button>
    );
  }

  if (state === "Close") {
    return (
      <div className={`relative nav-item-container ${isActive ? 'active' : ''}`}>
        <button
          className={`space-button relative rounded-xl h-[64px] ${cursorStyle} transition-[scale,shadow] duration-300 pl-4 pr-0 group ${className}`}
          style={buttonStyle}
          onClick={disabled ? undefined : onClick}
          disabled={disabled}
          {...props}
        >
          <div className="flex items-center justify-between relative w-full h-full pl-2 pr-0 transition-transform duration-125 min-w-0">
            <div className="flex-1 min-w-0 overflow-hidden">
              <span className={`text-[var(--color-deep-grey)] font-sans text-[18px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis block ${textStyle}`}>
                {text}
              </span>
            </div>
            {/* Right box - simple flex container for badge */}
            <div className="flex items-center justify-center p-[20px]">
              {/* Badge count - show when not hovering */}
              <div className="badge-count bg-[rgba(120,118,111,0.1)] flex items-center justify-center rounded-3xl w-6 h-6">
                <span className="text-[14px] font-sans font-semibold text-[var(--color-deep-grey)] leading-[0] badge-number">
                  {count}
                </span>
              </div>
            </div>
          </div>
        </button>
        {/* Close icon - only show for inactive items */}
        {!isActive && (
          <button
            type="button"
            onClick={handleCloseClick}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            className="close-icon absolute top-1/2 right-5 transform -translate-y-1/2 flex items-center justify-center w-6 h-6 cursor-pointer bg-transparent border-none p-0"
            data-item-id={itemId}
            aria-label={`Close ${text || 'item'}`}
          >
            <img src={FaXmarkIcon.src} alt="" className="w-4 h-4" style={{color: closeIconColor}} aria-hidden="true" />
          </button>
        )}
      </div>
    );
  }

  if (state === "TagClose") {
    return (
      <div className={`relative nav-item-container ${isActive ? 'active' : ''}`}>
        <button
          className={`space-button relative rounded-xl h-[64px] ${cursorStyle} transition-[scale,shadow] duration-300 pl-4 pr-0 group ${className}`}
          style={buttonStyle}
          onClick={disabled ? undefined : onClick}
          disabled={disabled}
          {...props}
        >
          <div className="flex items-center justify-between relative w-full h-full pl-2 pr-0 transition-transform duration-125 min-w-0">
            <div className="flex-1 min-w-0 overflow-hidden">
              <span className={`text-[var(--color-deep-grey)] font-sans text-[18px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis block ${textStyle}`}>
                {text}
              </span>
            </div>
          </div>
        </button>
        {/* Close icon - always visible for tags */}
        <button
          type="button"
          onClick={handleCloseClick}
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          className="close-icon absolute top-1/2 right-5 transform -translate-y-1/2 flex items-center justify-center w-6 h-6 cursor-pointer bg-transparent border-none p-0"
          data-item-id={itemId}
          aria-label={`Remove tag ${text || 'item'}`}
        >
          <img src={FaXmarkIcon.src} alt="" className="w-4 h-4" style={{color: closeIconColor}} aria-hidden="true" />
        </button>
      </div>
    );
  }

  if (state === "WithArrow") {
    return (
      <button 
        className={`space-button relative rounded-xl h-[64px] ${cursorStyle} transition-[scale,shadow] duration-300 pl-4 pr-0 ${className}`}
        style={buttonStyle}
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        {...props}
      >
        <div className="flex items-center justify-between relative w-full h-full pl-2 pr-0 transition-transform duration-125 min-w-0">
          <div className="flex-1 min-w-0 overflow-hidden">
            <span className={`text-[var(--color-deep-grey)] font-sans text-[18px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis block ${textStyle}`}>
              {text}
            </span>
          </div>
          <div className="flex items-center justify-center relative shrink-0">
            <div className="box-border content-stretch flex gap-2.5 items-center justify-start p-[12px] relative">
              <div className="flex items-center justify-center relative shrink-0">
                <div className="relative w-6 h-6">
                  <svg className="fill-[var(--color-pebble-grey)] block max-w-none w-full h-full transition-transform duration-125" viewBox="0 0 320 512">
                    <path d="M278.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-160 160c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L210.7 256 73.4 118.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l160 160z"/>
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </button>
    );
  }

  // Default fallback
  return (
    <button 
      className={`space-button relative rounded-xl h-[64px] ${cursorStyle} transition-[scale,shadow] duration-300 pl-4 pr-0 ${className}`}
      style={buttonStyle}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      {...props}
    >
      <div className="flex items-center relative w-full h-full pl-2 pr-0 transition-transform duration-125 min-w-0">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex-1 min-w-0 overflow-hidden text-left">
            <span className={`text-[var(--color-deep-grey)] font-sans text-[18px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis block text-left ${textStyle}`}>
              {text}
            </span>
          </div>
          <div className="bg-[rgba(120,118,111,0.1)] flex items-center justify-center rounded-3xl w-6 h-6">
            <span className="text-[14px] font-sans font-semibold text-[var(--color-deep-grey)] leading-[0] badge-number">
              {count}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-center relative shrink-0">
          <div className="flex-none scale-y-[-100%]">
            <div className="box-border content-stretch flex gap-2.5 items-center justify-start p-[12px] relative">
              <div className="flex items-center justify-center relative shrink-0">
                <div className="flex-none scale-y-[-100%]">
                  <div className="relative size-5">
                    <img src={FaAngleDownIcon.src} alt="Dropdown" className="fill-[var(--color-deep-grey)] block max-w-none w-full h-full transition-transform duration-125" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
};


export default SpaceButton;

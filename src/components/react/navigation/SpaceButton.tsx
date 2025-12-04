import React from 'react';
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
      return;
    }
    
    // Check if this is a tag (in NoteDetailsPanel)
    const isTag = (event.target as HTMLElement).closest('.note-details-panel') || 
                  (event.target as HTMLElement).closest('.tag-item');
    
    if (isTag) {
      // Handle tag removal
      if ((window as any).removeTagFromNote) {
        (window as any).removeTagFromNote(event, event.target);
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
    // Only apply background when active - inactive items have no background
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
        className={`space-button space-btn ${disabled ? 'space-btn--disabled' : ''} px-4 ${className}`}
        style={buttonStyle}
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        {...props}
      >
        <div className="space-btn__content space-btn__content--with-padding space-btn__content--justify-start">
          <div className="space-btn__text-wrapper">
            <span className={`space-btn__text ${textStyle}`}>
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
        className={`space-button space-btn ${disabled ? 'space-btn--disabled' : ''} pl-4 pr-0 group ${activeClass} ${className}`}
        style={buttonStyle}
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        {...props}
      >
        <div className="space-btn__content">
          <div className="space-btn__text-wrapper">
            <span className={`space-btn__text ${textStyle}`}>
              {text}
            </span>
          </div>
          <div className="space-btn__badge-wrapper">
            <div className="badge-count">
              <span className="badge-number">
                {String(count ?? 0)}
              </span>
            </div>
          </div>
        </div>
        
        {/* Show shadow when active */}
        {isActive && <div className="space-btn__shadow" />}
      </button>
    );
  }

  if (state === "DropdownTrigger") {
    return (
      <button 
        className={`space-button space-btn ${disabled ? 'space-btn--disabled' : ''} pl-4 pr-0 ${className}`}
        style={buttonStyle}
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        {...props}
      >
        <div className="space-btn__content">
          <div className="space-btn__text-wrapper">
            <span className={`space-btn__text ${textStyle}`}>
              {text}
            </span>
          </div>
          {count !== undefined && count !== null && (
            <div className="space-btn__badge-wrapper">
              <div className="badge-count">
                <span className="badge-number">
                  {String(count ?? 0)}
                </span>
              </div>
            </div>
          )}
          {!hideDropdownIcon && (
            <div className="space-btn__dropdown-icon space-btn__dropdown-icon--flipped">
              <div className="space-btn__dropdown-icon--flipped">
                <svg viewBox="0 0 448 512">
                  <path d="M201.4 374.6c12.5 12.5 32.8 12.5 45.3 0l160-160c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 306.7 86.6 169.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160z"/>
                </svg>
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
        className={`space-button space-btn ${disabled ? 'space-btn--disabled' : ''} pl-4 pr-0 ${className}`}
        style={buttonStyle}
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        {...props}
      >
        <div className="space-btn__content">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="space-btn__text-wrapper">
              <span className={`space-btn__text ${textStyle}`}>
                {text}
              </span>
            </div>
            <div className="badge-count">
              <span className="badge-number">
                {String(count ?? 0)}
              </span>
            </div>
          </div>
          <div className="space-btn__dropdown-icon space-btn__dropdown-icon--flipped">
            <div className="space-btn__dropdown-icon--flipped">
              <svg viewBox="0 0 448 512">
                <path d="M201.4 374.6c12.5 12.5 32.8 12.5 45.3 0l160-160c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 306.7 86.6 169.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160z"/>
              </svg>
            </div>
          </div>
        </div>
      </button>
    );
  }

  if (state === "Close") {
    return (
      <div className={`nav-item-container ${isActive ? 'active' : ''}`}>
        <button
          className={`space-button space-btn ${disabled ? 'space-btn--disabled' : ''} pl-4 pr-0 group ${className}`}
          style={buttonStyle}
          onClick={disabled ? undefined : onClick}
          disabled={disabled}
          {...props}
        >
          <div className="space-btn__content space-btn__content--justify-between">
            <div className="space-btn__text-wrapper">
              <span className={`space-btn__text ${textStyle}`}>
                {text}
              </span>
            </div>
            <div className="space-btn__badge-wrapper">
              <div className="badge-count">
                <span className="badge-number">
                  {String(count ?? 0)}
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
            className="close-icon"
            data-item-id={itemId}
            aria-label={`Close ${text || 'item'}`}
          >
            <svg viewBox="0 0 384 512" aria-hidden="true">
              <path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/>
            </svg>
          </button>
        )}
      </div>
    );
  }

  if (state === "TagClose") {
    return (
      <div className={`nav-item-container ${isActive ? 'active' : ''}`}>
        <button
          className={`space-button space-btn ${disabled ? 'space-btn--disabled' : ''} pl-4 pr-0 group ${className}`}
          style={buttonStyle}
          onClick={disabled ? undefined : onClick}
          disabled={disabled}
          {...props}
        >
          <div className="space-btn__content space-btn__content--justify-between">
            <div className="space-btn__text-wrapper">
              <span className={`space-btn__text ${textStyle}`}>
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
          className="close-icon"
          data-item-id={itemId}
          aria-label={`Remove tag ${text || 'item'}`}
        >
          <svg viewBox="0 0 384 512" aria-hidden="true">
            <path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/>
          </svg>
        </button>
      </div>
    );
  }

  if (state === "WithArrow") {
    return (
      <button 
        className={`space-button space-btn ${disabled ? 'space-btn--disabled' : ''} pl-4 pr-0 ${className}`}
        style={buttonStyle}
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        {...props}
      >
        <div className="space-btn__content space-btn__content--justify-between">
          <div className="space-btn__text-wrapper">
            <span className={`space-btn__text ${textStyle}`}>
              {text}
            </span>
          </div>
          <div className="space-btn__arrow-icon">
            <svg viewBox="0 0 320 512">
              <path d="M278.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-160 160c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L210.7 256 73.4 118.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l160 160z"/>
            </svg>
          </div>
        </div>
      </button>
    );
  }

  // Default fallback
  return (
    <button 
      className={`space-button space-btn ${disabled ? 'space-btn--disabled' : ''} pl-4 pr-0 ${className}`}
      style={buttonStyle}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      {...props}
    >
      <div className="space-btn__content">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="space-btn__text-wrapper">
            <span className={`space-btn__text ${textStyle}`}>
              {text}
            </span>
          </div>
          <div className="badge-count">
            <span className="badge-number">
              {String(count ?? 0)}
            </span>
          </div>
        </div>
        <div className="space-btn__dropdown-icon space-btn__dropdown-icon--flipped">
          <div className="space-btn__dropdown-icon--flipped">
            <svg viewBox="0 0 448 512">
              <path d="M201.4 374.6c12.5 12.5 32.8 12.5 45.3 0l160-160c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 306.7 86.6 169.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160z"/>
            </svg>
          </div>
        </div>
      </div>
    </button>
  );
};


export default SpaceButton;

import React from 'react';

interface ButtonSmallProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  state?: 'Default' | 'Secondary' | 'Delete';
  children: React.ReactNode;
  onMouseDown?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

export default function ButtonSmall({ 
  state = 'Default', 
  children, 
  className = '',
  type = 'button',
  onClick,
  onMouseDown: externalOnMouseDown,
  disabled,
  ...props 
}: ButtonSmallProps) {
  const variantClass = state === 'Default' ? 'btn--primary' : 
                       state === 'Secondary' ? 'btn--secondary' : 
                       'btn--danger';

  // Track if we've already handled the click to prevent double-firing
  const clickHandledRef = React.useRef(false);

  // Ensure onClick works in all contexts (including portals like BubbleMenu)
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || clickHandledRef.current) return;
    clickHandledRef.current = true;
    
    // Haptic feedback handled by global handler (public/scripts/haptics-handler.js)
    
    // Only prevent default for non-submit buttons to avoid breaking form submissions
    if (type !== 'submit') {
      e.preventDefault();
    }
    // Stop propagation to prevent conflicts with parent handlers (especially in portals)
    e.stopPropagation();
    if (onClick) {
      onClick(e);
    }
    // Reset after a short delay to allow for rapid clicks
    setTimeout(() => {
      clickHandledRef.current = false;
    }, 100);
  };

  // Use onMouseDown as primary handler for portal contexts (like BubbleMenu)
  // This is more reliable than onClick in Floating UI portals
  const handleMouseDown = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    
    // If external onMouseDown is provided, use it (for portal contexts)
    if (externalOnMouseDown) {
      externalOnMouseDown(e);
      return;
    }
    
    // Otherwise, use internal logic as fallback for onClick
    if (clickHandledRef.current) return;
    // Only trigger if it's a left click (button 0)
    if (e.button === 0) {
      clickHandledRef.current = true;
      
      // Haptic feedback handled by global handler (public/scripts/haptics-handler.js)
      
      e.preventDefault();
      e.stopPropagation();
      if (onClick) {
        // Create a synthetic click event to maintain compatibility
        const syntheticEvent = {
          ...e,
          type: 'click',
          currentTarget: e.currentTarget,
          target: e.target
        } as React.MouseEvent<HTMLButtonElement>;
        onClick(syntheticEvent);
      }
      // Reset after a short delay
      setTimeout(() => {
        clickHandledRef.current = false;
      }, 100);
    }
  };

  return (
    <button
      type={type}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      disabled={disabled}
      className={`btn btn--sm ${variantClass} ${className}`}
      style={{ 
        pointerEvents: 'auto',
        touchAction: 'manipulation',
        zIndex: 1
      }}
      {...props}
    >
      <div className="btn__content">
        {children}
      </div>
      <div className="btn__shadow-overlay" />
    </button>
  );
}

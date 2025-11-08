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
  const getBackgroundColor = () => {
    switch (state) {
      case 'Default':
        return 'var(--color-bold-blue)';
      case 'Secondary':
        return 'var(--color-stone-grey)';
      case 'Delete':
        return 'var(--color-red)';
      default:
        return 'var(--color-bold-blue)';
    }
  };

  // Track if we've already handled the click to prevent double-firing
  const clickHandledRef = React.useRef(false);

  // Ensure onClick works in all contexts (including portals like BubbleMenu)
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || clickHandledRef.current) return;
    clickHandledRef.current = true;
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
    <>
      <button
        type={type}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        disabled={disabled}
        data-outer-shadow
        className={`group relative rounded-2xl cursor-pointer transition-[scale,shadow] duration-300 pb-4 pt-3 px-4 flex items-center justify-center font-sans font-semibold text-[14px] leading-[0] text-nowrap text-[var(--color-fog-white)] min-h-[40px] shadow-[0px_2px_2px_0px_rgba(0,0,0,0.25)] disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
        style={{ 
          backgroundColor: getBackgroundColor(),
          pointerEvents: 'auto',
          touchAction: 'manipulation',
          position: 'relative',
          zIndex: 1
        }}
        {...props}
      >
        <div className="relative shrink-0 transition-transform duration-125 z-10">
          {children}
        </div>
        <div className="absolute inset-0 pointer-events-none rounded-2xl transition-shadow duration-125 shadow-[0px_-4px_0px_0px_rgba(0,0,0,0.1)_inset] group-active:!shadow-[0px_-1px_0px_0px_rgba(0,0,0,0.1)_inset]" />
      </button>
      <style>{`
        button[data-outer-shadow] {
          will-change: transform, box-shadow;
          transition:
            background-color 0.125s ease-in-out,
            box-shadow 0.125s ease-in-out;
          box-shadow:
            0px -4px 0px 0px hsla(0, 0%, 0%, 0.1) inset,
            0px 2px 2px 0px hsla(0, 0%, 0%, 0.25);
        }

        button[data-outer-shadow]:active {
          transform: scale(0.98);
        }

        button[data-outer-shadow]:active > div {
          translate: 0 0;
          transform: scale(0.98);
        }

        button[data-outer-shadow]:active[style*="var(--color-bold-blue)"] {
          background-color: var(--color-navy) !important;
          box-shadow:
            0px -2px 0px 0px #0000001a inset,
            0px 0px 2px 0px #00000040,
            0px 2px 0px 0px #00000040 inset;
        }

        button[data-outer-shadow]:active[style*="var(--color-stone-grey)"] {
          background-color: var(--color-deep-grey) !important;
          box-shadow:
            0px -2px 0px 0px #0000001a inset,
            0px 0px 2px 0px #00000040,
            0px 2px 0px 0px #00000040 inset;
        }

        button[data-outer-shadow]:active[style*="var(--color-red)"] {
          background-color: #b30524 !important;
          box-shadow:
            0px -2px 0px 0px #0000001a inset,
            0px 0px 2px 0px #00000040,
            0px 2px 0px 0px #00000040 inset;
        }
      `}</style>
    </>
  );
}


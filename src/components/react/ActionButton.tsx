import React from 'react';

interface ActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "Add" | "Close" | "default";
  children?: React.ReactNode;
}

export default function ActionButton({
  variant = "default",
  children,
  className = "",
  ...props
}: ActionButtonProps) {
  // Check if className overrides size (w-8, w-10, etc.)
  const hasSizeOverride = className.match(/\bw-\d+|h-\d+/);
  const defaultSize = hasSizeOverride ? '' : 'w-10 h-10';
  
  // Check if className contains absolute positioning - if so, don't add relative
  const hasAbsolute = className.match(/\babsolute\b/);
  const positioningClass = hasAbsolute ? '' : 'relative';
  
  const getAriaLabel = () => {
    if (variant === "Add") return "Add";
    if (variant === "Close") return "Close";
    return props['aria-label'] || undefined;
  };

  return (
    <button
      type="button"
      className={`btn-animate-squish group ${positioningClass} rounded-3xl ${defaultSize} cursor-pointer ${className}`}
      style={{ backgroundImage: 'var(--color-gradient-gray)' }}
      aria-label={getAriaLabel()}
      {...props}
    >
      <div className="box-border content-stretch flex flex-row gap-3 items-center justify-center relative rounded-3xl size-full">
        <div className="relative shrink-0 w-4 h-4 flex items-center justify-center fill-[var(--color-pebble-grey)] [&>svg]:h-4 [&>svg]:w-4 [&>svg]:-translate-y-0.5 [&>svg]:transition-transform [&>svg]:duration-125">
          {variant === "Add" ? (
            <svg
              className="-translate-y-0.5 fill-[var(--color-pebble-grey)] block max-w-none w-full h-full transition-transform duration-125"
              viewBox="0 0 448 512"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M256 80c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 144L48 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l144 0 0 144c0 17.7 14.3 32 32 32s32-14.3 32-32l0-144 144 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-144 0 0-144z"/>
            </svg>
          ) : variant === "Close" ? (
            <svg
              className="-translate-y-0.5 fill-[var(--color-pebble-grey)] block max-w-none w-full h-full transition-transform duration-125"
              viewBox="0 0 384 512"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/>
            </svg>
          ) : (
            children
          )}
        </div>
      </div>
    </button>
  );
}


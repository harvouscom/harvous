import React, { useEffect } from 'react';

interface SquareButtonProps {
  variant?: "Add" | "Close" | "More" | "Back" | "Search";
  onClick?: () => void;
  className?: string;
  type?: "button" | "submit" | "reset";
}

export default function SquareButton({
  variant = "More",
  onClick,
  className = "",
  type = "button"
}: SquareButtonProps) {
  useEffect(() => {
    const buttonStyles = `
      .square-button button[data-outer-shadow] {
        will-change: transform, box-shadow;
        transition:
          background-color 0.125s ease-in-out,
          box-shadow 0.125s ease-in-out;
        box-shadow:
          0px -8px 0px 0px hsla(0, 0%, 0%, 0.1) inset,
          0px 4px 4px 0px hsla(0, 0%, 0%, 0.25);
      }
      
      .square-button button:not([data-outer-shadow]) {
        transition:
          box-shadow 0.125s ease-in-out;
        box-shadow: 0px -3px 0px 0px #78766F33 inset;
      }

      .square-button button:not([data-outer-shadow]):active {
        filter: brightness(0.97);
        box-shadow: 
          0px -1px 0px 0px #78766F33 inset,
          0px 1px 0px 0px #78766F33 inset;
      }

      .square-button button {
        will-change: transform, box-shadow;
      }

      .square-button button:active > img {
        transform: scale(0.95);
      }

      button:active[class*="bg-[var(--color-blue)]"] {
        background-color: var(--color-navy);
        box-shadow:
          0px -4px 0px 0px #0000001a inset,
          0px 0px 4px 0px #00000040,
          0px 4px 0px 0px #00000040 inset;
      }

      button:active[class*="bg-[var(--color-stone-grey)]"] {
        background-color: var(--color-deep-grey);
        box-shadow:
          0px -4px 0px 0px #0000001a inset,
          0px 0px 4px 0px #00000040,
          0px 4px 0px 0px #00000040 inset;
      }
    `;

    const styleId = 'square-button-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = buttonStyles;
      document.head.appendChild(style);
    }
  }, []);
  const renderIcon = () => {
    switch (variant) {
      case "Back":
        return (
          <svg className="-translate-y-0.5 fill-[var(--color-pebble-grey)] block max-w-none w-full h-full transition-transform duration-125" viewBox="0 0 320 512">
            <path d="M9.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L109.2 288 416 288c17.7 0 32-14.3 32-32s-14.3-32-32-32l-306.7 0L214.6 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-160 160z"/>
          </svg>
        );
      case "Close":
        return (
          <svg className="-translate-y-0.5 fill-white block max-w-none w-full h-full transition-transform duration-125" viewBox="0 0 384 512">
            <path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/>
          </svg>
        );
      case "Add":
        return (
          <svg className="-translate-y-0.5 fill-[var(--color-pebble-grey)] block max-w-none w-full h-full transition-transform duration-125" viewBox="0 0 24 24">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
          </svg>
        );
      case "Search":
        return (
          <svg className="-translate-y-0.5 fill-[var(--color-pebble-grey)] block max-w-none w-full h-full transition-transform duration-125" viewBox="0 0 24 24">
            <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
          </svg>
        );
      case "More":
        return (
          <svg className="-translate-y-0.5 fill-[var(--color-pebble-grey)] block max-w-none w-full h-full transition-transform duration-125" viewBox="0 0 24 24">
            <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
          </svg>
        );
      default:
        return null;
    }
  };

  const getButtonClasses = () => {
    const baseClasses = "relative rounded-3xl w-[64px] h-[64px] cursor-pointer transition-[scale,shadow] duration-300";
    const variantClasses = variant === "Close" ? "group [&:active_svg]:-translate-y-0 [&:active_svg]:scale-[0.95] bg-[var(--color-stone-grey)]" : "[&:active_svg]:-translate-y-0 [&:active_svg]:scale-[0.95]";
    
    return `${baseClasses} ${variantClasses} ${className}`;
  };

  const getButtonStyle = () => {
    switch (variant) {
      case "Back":
        return {
          backgroundImage: 'var(--color-gradient-gray)',
        };
      case "Close":
        return {
          backgroundColor: 'var(--color-stone-grey)',
        };
      default:
        return {
          backgroundImage: 'var(--color-gradient-gray)',
        };
    }
  };

  return (
    <div className="square-button">
      <button
        type={type}
        className={getButtonClasses()}
        style={getButtonStyle()}
        onClick={onClick}
        data-outer-shadow={variant === "Close" ? "" : undefined}
      >
      <div className="flex flex-row items-center justify-center relative w-full h-full">
        <div className={`box-border flex flex-row gap-3 items-center justify-center px-4 relative w-full h-full ${
          variant === "Close" ? "pb-5 pt-4" : "pb-5 pt-[18px]"
        }`}>
          <div className={`relative shrink-0 flex items-center justify-center ${
            variant === "Close" ? "flex h-[42.426px] w-[42.426px]" : "w-6 h-6"
          }`}>
            {variant === "Close" && (
              <div className="flex-none">
                <div className="relative w-6 h-6 flex items-center justify-center">
                  {renderIcon()}
                </div>
              </div>
            )}
            {variant !== "Close" && renderIcon()}
          </div>
        </div>
      </div>
      {variant === "Close" && (
        <div className="absolute inset-0 pointer-events-none rounded-3xl transition-shadow duration-125 shadow-[0px_-8px_0px_0px_rgba(0,0,0,0.1)_inset] group-active:!shadow-[0px_-2px_0px_0px_rgba(0,0,0,0.1)_inset]" />
      )}
      </button>
    </div>
  );
}

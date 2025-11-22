import React, { useState, useEffect, useRef } from 'react';
import ThreadIcon from "@fortawesome/fontawesome-free/svgs/solid/layer-group.svg";
import NoteStickyIcon from "@fortawesome/fontawesome-free/svgs/solid/note-sticky.svg";
import EditIcon from "@fortawesome/fontawesome-free/svgs/solid/pen-to-square.svg";
import EraseIcon from "@fortawesome/fontawesome-free/svgs/solid/eraser.svg";
import CircleInfoIcon from "@fortawesome/fontawesome-free/svgs/solid/circle-info.svg";
import XmarkIcon from "@fortawesome/fontawesome-free/svgs/solid/xmark.svg";
import PlusIcon from "@fortawesome/fontawesome-free/svgs/solid/plus.svg";
import Menu from './Menu';
import { getMenuOptions } from "@/utils/menu-options";

interface SquareButtonProps {
  variant?: "Add" | "Close" | "More" | "Back" | "Find";
  onClick?: () => void;
  className?: string;
  type?: "button" | "submit" | "reset";
  withMenu?: boolean;
  contentType?: "thread" | "note" | "space" | "dashboard" | "profile";
  contentId?: string;
  currentThreadId?: string; // Add this prop
  inBottomSheet?: boolean;
}

export default function SquareButton({
  variant = "More",
  onClick,
  className = "",
  type = "button",
  withMenu = false,
  contentType = "dashboard",
  contentId,
  currentThreadId, // Add this prop
  inBottomSheet = false
}: SquareButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Get menu options based on variant
  const getMenuOptionsData = () => {
    if (variant === "Add") {
      return [
        { action: "openNewThreadPanel", label: "New Thread", icon: ThreadIcon },
        { action: "openNewNotePanel", label: "New Note", icon: NoteStickyIcon }
      ];
    } else if (variant === "More" && contentType) {
      const options = getMenuOptions(contentType, contentId);
      return options.map(option => {
        let icon;
        switch (option.action) {
          case "editThread":
          case "editSpace":
            icon = EditIcon;
            break;
          case "eraseThread":
          case "eraseNote":
          case "eraseSpace":
            icon = EraseIcon;
            break;
          case "seeDetails":
            icon = CircleInfoIcon;
            break;
          default:
            icon = EditIcon;
        }
        return { ...option, icon };
      });
    }
    return [];
  };

  const menuOptions = getMenuOptionsData();

  // Close menu when closeMoreMenu event is dispatched
  useEffect(() => {
    const handleCloseMenu = () => {
      setIsOpen(false);
    };
    window.addEventListener('closeMoreMenu', handleCloseMenu);
    return () => {
      window.removeEventListener('closeMoreMenu', handleCloseMenu);
    };
  }, []);

  // Handle click outside to close menu
  useEffect(() => {
    if (!withMenu || !isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
      // Don't close if click is inside the container
      if (containerRef.current && containerRef.current.contains(target)) {
        return;
      }
      
      // Don't close if click is on a confirmation dialog or its overlay
      const clickedElement = target as HTMLElement;
      const isDialogClick = clickedElement.closest?.('.fixed.inset-0') || 
                           clickedElement.closest?.('[role="dialog"]') ||
                           clickedElement.closest?.('.bg-white.rounded-xl.p-6');
      
      if (isDialogClick) {
        return;
      }
      
      // Otherwise, close the menu
      setIsOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [withMenu, isOpen]);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  const handleButtonClick = () => {
    if (withMenu) {
      toggleMenu();
    } else if (onClick) {
      onClick();
    }
  };
  // Styles moved to global.css for immediate availability
  const renderIcon = () => {
    // For Add and More with menu, show X when open, otherwise show icon
    if (variant === "Add" && withMenu) {
      if (isOpen) {
        return (
          <svg 
            className="-translate-y-0.5 fill-white block max-w-none w-full h-full transition-transform duration-125" 
            viewBox="0 0 384 512"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/>
          </svg>
        );
      }
      return (
        <svg 
          className="-translate-y-0.5 fill-white block max-w-none w-full h-full transition-transform duration-125" 
          viewBox="0 0 448 512"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M256 80c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 144L48 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l144 0 0 144c0 17.7 14.3 32 32 32s32-14.3 32-32l0-144 144 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-144 0 0-144z"/>
        </svg>
      );
    }

    if (variant === "More" && withMenu) {
      if (isOpen) {
        return (
          <svg 
            className="-translate-y-0.5 fill-white block max-w-none w-full h-full transition-transform duration-125" 
            viewBox="0 0 384 512"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/>
          </svg>
        );
      }
      return (
        <svg className="rotate-90 -translate-y-0.5 fill-[var(--color-pebble-grey)] block max-w-none w-full h-full transition-transform duration-125" viewBox="0 0 448 512">
          <path d="M8 256a56 56 0 1 1 112 0A56 56 0 1 1 8 256zm160 0a56 56 0 1 1 112 0 56 56 0 1 1 -112 0zm216-56a56 56 0 1 1 0 112 56 56 0 1 1 0-112z"/>
        </svg>
      );
    }

    // Default icons for variants without menu
    switch (variant) {
      case "Back":
        if (inBottomSheet) {
          // Angle down icon path (from FontAwesome)
          return (
            <svg className="-translate-y-0.5 fill-[var(--color-pebble-grey)] block max-w-none w-full h-full transition-transform duration-125" viewBox="0 0 448 512">
              <path d="M201.4 374.6c12.5 12.5 32.8 12.5 45.3 0l160-160c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 306.7 86.6 169.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160z"/>
            </svg>
          );
        } else {
          // Angle left icon path (from FontAwesome)
          return (
            <svg className="-translate-y-0.5 fill-[var(--color-pebble-grey)] block max-w-none w-full h-full transition-transform duration-125" viewBox="0 0 320 512">
              <path d="M41.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L109.3 256 246.6 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-160 160z"/>
            </svg>
          );
        }
      case "Close":
        return (
          <svg 
            className="-translate-y-0.5 fill-white block max-w-none w-full h-full transition-transform duration-125" 
            viewBox="0 0 384 512"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/>
          </svg>
        );
      case "Add":
        return (
          <svg 
            className="-translate-y-0.5 fill-white block max-w-none w-full h-full transition-transform duration-125" 
            viewBox="0 0 448 512"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M256 80c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 144L48 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l144 0 0 144c0 17.7 14.3 32 32 32s32-14.3 32-32l0-144 144 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-144 0 0-144z"/>
          </svg>
        );
      case "Find":
        return (
          <svg className="-translate-y-0.5 fill-[var(--color-pebble-grey)] block max-w-none transition-transform duration-125" style={{ width: '20px', height: '20px' }} viewBox="0 0 512 512">
            <path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"/>
          </svg>
        );
      case "More":
        return (
          <svg className="rotate-90 -translate-y-0.5 fill-[var(--color-pebble-grey)] block max-w-none w-full h-full transition-transform duration-125" viewBox="0 0 448 512">
            <path d="M8 256a56 56 0 1 1 112 0A56 56 0 1 1 8 256zm160 0a56 56 0 1 1 112 0 56 56 0 1 1 -112 0zm216-56a56 56 0 1 1 0 112 56 56 0 1 1 0-112z"/>
          </svg>
        );
      default:
        return null;
    }
  };

  const getButtonClasses = () => {
    const baseClasses = "relative rounded-3xl w-[64px] h-[64px] cursor-pointer transition-[scale,shadow] duration-300";
    let variantClasses = "";
    
    if (variant === "Close") {
      variantClasses = "group [&:active_svg]:-translate-y-0 [&:active_svg]:scale-[0.95] bg-[var(--color-stone-grey)]";
    } else if (variant === "Add" && withMenu) {
      variantClasses = `group [&:active_svg]:-translate-y-0 [&:active_svg]:scale-[0.95] ${isOpen ? 'bg-[var(--color-stone-grey)]' : 'bg-[var(--color-bold-blue)]'}`;
    } else if (variant === "More" && withMenu) {
      variantClasses = `group [&:active_svg]:-translate-y-0 [&:active_svg]:scale-[0.95] ${isOpen ? 'bg-[var(--color-stone-grey)]' : ''}`;
    } else {
      variantClasses = "[&:active_svg]:-translate-y-0 [&:active_svg]:scale-[0.95]";
    }
    
    return `${baseClasses} ${variantClasses} ${className}`;
  };

  const getButtonStyle = () => {
    if (variant === "Close") {
      return {
        backgroundColor: 'var(--color-stone-grey)',
      };
    } else if (variant === "More" && withMenu && !isOpen) {
      return {
        backgroundImage: 'var(--color-gradient-gray)',
      };
    } else if (variant === "Back" || (variant === "More" && !withMenu)) {
      return {
        backgroundImage: 'var(--color-gradient-gray)',
      };
    }
    return {};
  };

  const shouldShowIconWrapper = () => {
    return variant === "Close" || (variant === "Add" && withMenu && isOpen) || (variant === "More" && withMenu && isOpen);
  };

  const getIconSize = () => {
    if (shouldShowIconWrapper()) {
      return "flex h-[42.426px] w-[42.426px]";
    }
    if (variant === "Find") {
      return "w-5 h-5";
    }
    return "w-6 h-6";
  };

  const iconSize = getIconSize();

  return (
    <div className="square-button-container" ref={containerRef}>
      <button
        type={type}
        className={getButtonClasses()}
        style={getButtonStyle()}
        onClick={handleButtonClick}
        data-outer-shadow={(variant === "Close" || (variant === "Add" && withMenu)) ? "" : undefined}
        aria-label={
          variant === "Add" ? "Add new item" :
          variant === "Close" ? "Close" :
          variant === "More" ? "More options" :
          variant === "Back" ? "Go back" :
          variant === "Find" ? "Search" :
          "Button"
        }
      >
        <div className="flex flex-row items-center justify-center relative w-full h-full">
          <div className={`box-border flex flex-row gap-3 items-center justify-center px-4 relative w-full h-full ${
            variant === "Close" || (variant === "Add" && withMenu) ? "pb-5 pt-4" : "pb-5 pt-[18px]"
          }`}>
            <div className={`relative shrink-0 flex items-center justify-center ${iconSize}`}>
              {shouldShowIconWrapper() && (
                <div className="flex-none">
                  <div className="relative w-6 h-6 flex items-center justify-center">
                    {renderIcon()}
                  </div>
                </div>
              )}
              {!shouldShowIconWrapper() && renderIcon()}
            </div>
          </div>
        </div>
        {(variant === "Close" || (variant === "Add" && withMenu)) && (
          <div className="absolute inset-0 pointer-events-none rounded-3xl transition-shadow duration-125 shadow-[0px_-8px_0px_0px_rgba(0,0,0,0.1)_inset] group-active:!shadow-[0px_-2px_0px_0px_rgba(0,0,0,0.1)_inset]" />
        )}
        {(variant === "More" && withMenu && isOpen) && (
          <div className="absolute inset-0 pointer-events-none rounded-3xl transition-shadow duration-125 shadow-[0px_-8px_0px_0px_rgba(0,0,0,0.1)_inset] group-active:!shadow-[0px_-2px_0px_0px_rgba(0,0,0,0.1)_inset]" />
        )}
      </button>

      {/* Menu container */}
      {withMenu && menuOptions.length > 0 && isOpen && (
        <div 
          className={`more-menu-container ${variant === "More" ? "right-positioned" : ""}`}
        >
          <Menu
            options={menuOptions}
            contentType={contentType}
            contentId={contentId}
            currentThreadId={currentThreadId} // Pass this prop
          />
        </div>
      )}
    </div>
  );
}

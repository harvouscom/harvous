import React from 'react';
import ThreadIcon from "@fortawesome/fontawesome-free/svgs/solid/layer-group.svg";
import NoteStickyIcon from "@fortawesome/fontawesome-free/svgs/solid/note-sticky.svg";

export interface AddMenuProps {
  onClose?: () => void;
}

export default function AddMenu({ onClose }: AddMenuProps) {
  const handleNewThread = () => {
    console.log('AddMenu: New Thread button clicked');
    // Trigger new thread panel
    console.log('AddMenu: Dispatching openNewThreadPanel event');
    try {
      window.dispatchEvent(new CustomEvent('openNewThreadPanel'));
    } catch (error) {
      console.error('Error dispatching openNewThreadPanel event:', error);
    }
    // Close the menu when option is selected
    closeMenu();
  };

  const handleNewNote = () => {
    console.log('AddMenu: New Note button clicked');
    // Trigger new note panel
    console.log('AddMenu: Dispatching openNewNotePanel event');
    try {
      window.dispatchEvent(new CustomEvent('openNewNotePanel'));
    } catch (error) {
      console.error('Error dispatching openNewNotePanel event:', error);
    }
    // Close the menu when option is selected
    closeMenu();
  };

  const closeMenu = () => {
    // Dispatch the closeMoreMenu event that SquareButton listens for
    window.dispatchEvent(new CustomEvent('closeMoreMenu'));
    // Also call onClose if provided
    if (onClose) {
      onClose();
    }
  };

  return (
    <>
      <div className="add-menu bg-white rounded-xl overflow-hidden">
        {/* New Thread Option */}
        <button
          onClick={handleNewThread}
          className="add-menu-item flex items-center gap-3 py-[18px] px-4 pb-5 hover:bg-gray-50 transition-colors duration-150 cursor-pointer w-full text-left"
        >
          <div className="relative shrink-0 w-5 h-5 flex items-center justify-center">
            <img
              src={ThreadIcon.src}
              alt=""
              className="block max-w-none w-full h-full"
            />
          </div>
          <span className="text-subtitle text-[var(--color-deep-grey)] whitespace-nowrap">
            New Thread
          </span>
        </button>

        {/* Separator */}
        <div className="add-menu-separator border-t border-gray-50" />

        {/* New Note Option */}
        <button
          onClick={handleNewNote}
          className="add-menu-item flex items-center gap-3 py-[18px] px-4 pb-5 hover:bg-gray-50 transition-colors duration-150 cursor-pointer w-full text-left"
        >
          <div className="relative shrink-0 w-5 h-5 flex items-center justify-center">
            <img
              src={NoteStickyIcon.src}
              alt=""
              className="block max-w-none w-full h-full"
            />
          </div>
          <span className="text-subtitle text-[var(--color-deep-grey)] whitespace-nowrap">
            New Note
          </span>
        </button>
      </div>

      <style>{`
        .add-menu {
          min-width: 223px;
        }
        
        .add-menu-item {
          border: none !important;
          outline: none !important;
          box-shadow: none !important;
        }
      `}</style>
    </>
  );
}


import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import EditIcon from "@fortawesome/fontawesome-free/svgs/solid/pen-to-square.svg";
import EraseIcon from "@fortawesome/fontawesome-free/svgs/solid/eraser.svg";
import CircleInfoIcon from "@fortawesome/fontawesome-free/svgs/solid/circle-info.svg";
import { getMenuOptions } from "@/utils/menu-options";
import EraseConfirmDialog from './EraseConfirmDialog';

export interface ContextMoreMenuProps {
  contentType: "thread" | "note" | "space" | "dashboard" | "profile";
  contentId?: string;
  onClose?: () => void;
}

interface MenuOption {
  action: string;
  label: string;
  icon: any;
}

export default function ContextMoreMenu({
  contentType,
  contentId,
  onClose
}: ContextMoreMenuProps) {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  // Get menu options using the utility function
  const menuOptionsData = getMenuOptions(contentType, contentId);

  // Add icons to the menu options
  const menuOptions: MenuOption[] = menuOptionsData.map(option => {
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

  // Prevent body scroll when dialog is open
  useEffect(() => {
    if (showConfirmDialog) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    // Cleanup on unmount
    return () => {
      document.body.style.overflow = '';
    };
  }, [showConfirmDialog]);

  // Close the parent menu container (SquareButton)
  const closeParentMenu = () => {
    const parentContainer = document.querySelector('.square-button-container');
    if (parentContainer && (window as any).Alpine) {
      const alpineData = (window as any).Alpine.$data(parentContainer);
      if (alpineData) {
        alpineData.isOpen = false;
      }
    }
    // Also call onClose if provided
    if (onClose) {
      onClose();
    }
  };

  const handleAction = async (action: string, label: string) => {
    console.log('ContextMoreMenu:', label, 'button clicked');
    
    // Close the menu when any option is selected
    closeParentMenu();
    
    // Handle delete actions
    if (action.includes('erase')) {
      if (!contentId) {
        console.error('No content ID provided for delete action');
        return;
      }
      
      // Show confirmation dialog
      setPendingAction(action);
      setShowConfirmDialog(true);
      return;
    }
    
    // Handle other actions
    await executeAction(action);
  };

  const executeAction = async (action: string) => {
    if (action.includes('erase')) {
      await performErase();
    } else if (action === 'seeDetails') {
      // Handle See Details action for notes
      try {
        window.dispatchEvent(new CustomEvent('openNoteDetailsPanel', {
          detail: { contentId, contentType }
        }));
      } catch (error) {
        console.error('Error opening note details panel:', error);
      }
    } else if (action === 'editThread') {
      // Handle Edit Thread action
      try {
        window.dispatchEvent(new CustomEvent('openEditThreadPanel', {
          detail: { contentId, contentType }
        }));
      } catch (error) {
        console.error('Error opening edit thread panel:', error);
      }
    } else {
      // Handle other actions (like edit)
      console.log('Other action:', action);
    }
  };

  const performErase = async () => {
    if (!contentId) {
      console.error('No content ID provided for erase');
      return;
    }

    // Determine the API endpoint and parameter name
    let apiUrl, paramName, successMessage;
    switch (contentType) {
      case 'thread':
        apiUrl = '/api/threads/delete';
        paramName = 'threadId';
        successMessage = 'Thread erased successfully!';
        break;
      case 'note':
        apiUrl = '/api/notes/delete';
        paramName = 'noteId';
        successMessage = 'Note erased successfully!';
        break;
      case 'space':
        apiUrl = '/api/spaces/delete';
        paramName = 'spaceId';
        successMessage = 'Space erased successfully!';
        break;
      default:
        console.error('Unknown content type for delete:', contentType);
        return;
    }
    
    try {
      // Make the delete request
      const response = await fetch(`${apiUrl}?${paramName}=${encodeURIComponent(contentId)}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Dispatch appropriate deletion event for navigation updates
        if (contentType === 'thread') {
          window.dispatchEvent(new CustomEvent('threadDeleted', {
            detail: { threadId: contentId }
          }));
        } else if (contentType === 'note') {
          window.dispatchEvent(new CustomEvent('noteDeleted', {
            detail: { noteId: contentId }
          }));
        } else if (contentType === 'space') {
          window.dispatchEvent(new CustomEvent('spaceDeleted', {
            detail: { spaceId: contentId }
          }));
        }
        
        // Redirect to dashboard with toast parameters (like create operations)
        const redirectUrl = '/dashboard?toast=success&message=' + encodeURIComponent(successMessage);
        window.location.href = redirectUrl;
      } else {
        // Show error toast immediately (no redirect on error)
        if ((window as any).toast) {
          (window as any).toast.error(data.error || 'Failed to erase item');
        }
      }
    } catch (error) {
      console.error('Error deleting item:', error);
      if ((window as any).toast) {
        (window as any).toast.error('Failed to erase item');
      }
    }
  };

  const handleConfirmErase = () => {
    setShowConfirmDialog(false);
    if (pendingAction) {
      executeAction(pendingAction);
    }
    setPendingAction(null);
  };

  const handleCancelErase = () => {
    setShowConfirmDialog(false);
    setPendingAction(null);
  };

  if (menuOptions.length === 0) {
    return null;
  }

  return (
    <>
      <div className="context-more-menu bg-white rounded-xl shadow-[0px_3px_20px_0px_rgba(120,118,111,0.1)] overflow-hidden">
        {menuOptions.map((option, index) => (
          <button
            key={index}
            onClick={() => handleAction(option.action, option.label)}
            className="context-more-menu-item flex items-center gap-3 py-[18px] px-4 pb-5 hover:bg-gray-50 transition-colors duration-150 cursor-pointer w-full text-left"
          >
            <div className="relative shrink-0 w-5 h-5 flex items-center justify-center">
              <img
                src={option.icon.src}
                alt=""
                className="block max-w-none w-full h-full"
              />
            </div>
            <span className="text-subtitle text-[var(--color-deep-grey)] whitespace-nowrap">
              {option.label}
            </span>
          </button>
        ))}
      </div>

      {/* Confirmation Dialog - Rendered via Portal to ensure full viewport coverage */}
      {showConfirmDialog && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4"
          style={{
            paddingTop: 'max(1rem, env(safe-area-inset-top))',
            paddingBottom: 'max(1rem, env(safe-area-inset-bottom))'
          }}
        >
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-lg">
            <h3 className="text-lg font-semibold text-[var(--color-deep-grey)] mb-2">
              Are you sure?
            </h3>
            <p className="text-[var(--color-pebble-grey)] mb-6">
              Are you sure you want to erase this {contentType}?
            </p>
            <EraseConfirmDialog
              contentType={contentType}
              onCancel={handleCancelErase}
              onConfirm={handleConfirmErase}
            />
          </div>
        </div>,
        document.body
      )}

      <style>{`
        .context-more-menu {
          min-width: 223px;
        }
        
        .context-more-menu-item {
          border: none !important;
          outline: none !important;
        }
        
        .context-more-menu-item:first-child {
          border-radius: 12px 12px 0 0;
        }
        
        .context-more-menu-item:last-child {
          border-radius: 0 0 12px 12px;
        }
        
        .context-more-menu-item:only-child {
          border-radius: 12px;
        }
      `}</style>
    </>
  );
}

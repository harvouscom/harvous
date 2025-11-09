import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import EraseConfirmDialog from './EraseConfirmDialog';

export interface MenuOption {
  action: string;
  label: string;
  icon: any;
}

export interface MenuProps {
  options: MenuOption[];
  contentType?: "thread" | "note" | "space" | "dashboard" | "profile";
  contentId?: string;
  onClose?: () => void;
}

export default function Menu({
  options,
  contentType,
  contentId,
  onClose
}: MenuProps) {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

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

  // Close the parent menu container
  const closeMenu = () => {
    // Dispatch the closeMoreMenu event that SquareButton listens for
    window.dispatchEvent(new CustomEvent('closeMoreMenu'));
    // Also call onClose if provided
    if (onClose) {
      onClose();
    }
  };

  const handleAction = async (action: string, label: string) => {
    // Handle delete actions - show confirmation dialog first
    if (action.includes('erase')) {
      if (!contentId || !contentType) {
        console.error('No content ID or type provided for delete action');
        return;
      }
      
      // Show confirmation dialog (don't close menu yet)
      setPendingAction(action);
      setShowConfirmDialog(true);
      return;
    }
    
    // Close the menu for non-erase actions
    closeMenu();
    
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
    } else if (action === 'editSpace') {
      // Handle Edit Space action
      try {
        window.dispatchEvent(new CustomEvent('openEditSpacePanel', {
          detail: { contentId, contentType }
        }));
      } catch (error) {
        console.error('Error opening edit space panel:', error);
      }
    } else if (action === 'openNewThreadPanel') {
      // Handle New Thread action
      try {
        window.dispatchEvent(new CustomEvent('openNewThreadPanel'));
      } catch (error) {
        console.error('Error dispatching openNewThreadPanel event:', error);
      }
    } else if (action === 'openNewNotePanel') {
      // Handle New Note action
      try {
        window.dispatchEvent(new CustomEvent('openNewNotePanel'));
      } catch (error) {
        console.error('Error dispatching openNewNotePanel event:', error);
      }
    }
  };

  const performErase = async () => {
    if (!contentId || !contentType) {
      console.error('No content ID or type provided for erase');
      if ((window as any).toast) {
        (window as any).toast.error('Cannot erase: Missing content ID or type.');
      } else {
        alert('Error: No content ID or type provided');
      }
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
        if ((window as any).toast) {
          (window as any).toast.error('Unknown content type for erase.');
        } else {
          alert('Unknown content type for erase.');
        }
        return;
    }
    
    try {
      // Make the delete request
      const response = await fetch(`${apiUrl}?${paramName}=${encodeURIComponent(contentId)}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        console.error('Delete failed:', data);
        const errorMessage = data.error || 'Failed to erase item';
        
        if ((window as any).toast) {
          (window as any).toast.error(errorMessage);
        } else {
          alert('Failed to erase item: ' + errorMessage);
        }
        return;
      }
      
      if (data.success || response.status === 200) {
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
        const redirectUrl = '/?toast=success&message=' + encodeURIComponent(successMessage);
        window.location.href = redirectUrl;
      } else {
        // Show error toast immediately (no redirect on error)
        console.error('Delete failed:', data.error);
        if ((window as any).toast) {
          (window as any).toast.error(data.error || 'Failed to erase item');
        } else {
          alert('Failed to erase item: ' + (data.error || 'Unknown error'));
        }
      }
    } catch (error) {
      console.error('Error deleting item:', error);
      if ((window as any).toast) {
        (window as any).toast.error('Failed to erase item');
      } else {
        alert('Failed to erase item. Please check the console for details.');
      }
    }
  };

  const handleConfirmErase = async () => {
    setShowConfirmDialog(false);
    
    // Execute action BEFORE closing menu to ensure component stays mounted
    if (pendingAction) {
      const actionToExecute = pendingAction;
      setPendingAction(null);
      try {
        await executeAction(actionToExecute);
      } catch (error) {
        console.error('Error executing action:', error);
      }
    }
    
    // Close menu after action completes
    closeMenu();
  };

  const handleCancelErase = () => {
    setShowConfirmDialog(false);
    setPendingAction(null);
    // Keep menu open if user cancels
  };

  if (options.length === 0) {
    return null;
  }

  return (
    <>
      <div className="menu bg-white rounded-xl overflow-hidden">
        {options.map((option, index) => (
          <React.Fragment key={index}>
            {index > 0 && (
              <div className="menu-separator border-t border-gray-50" />
            )}
            <button
              onClick={() => handleAction(option.action, option.label)}
              className="menu-item flex items-center gap-3 py-[18px] px-4 pb-5 hover:bg-gray-50 transition-colors duration-150 cursor-pointer w-full text-left"
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
          </React.Fragment>
        ))}
      </div>

      {/* Confirmation Dialog - Rendered via Portal to ensure full viewport coverage */}
      {showConfirmDialog && contentType && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4"
          role="dialog"
          aria-modal="true"
          style={{
            paddingTop: 'max(1rem, env(safe-area-inset-top))',
            paddingBottom: 'max(1rem, env(safe-area-inset-bottom))'
          }}
          onClick={(e) => {
            // Close dialog if clicking on the overlay (but not the dialog content)
            if (e.target === e.currentTarget) {
              handleCancelErase();
            }
          }}
        >
          <div 
            className="bg-white rounded-xl p-6 max-w-md w-full shadow-lg"
            onClick={(e) => e.stopPropagation()}
            style={{ pointerEvents: 'auto' }}
          >
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
        .menu {
          min-width: 223px;
        }
        
        .menu-item {
          border: none !important;
          outline: none !important;
          box-shadow: none !important;
        }
      `}</style>
    </>
  );
}


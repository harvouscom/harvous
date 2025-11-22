import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { navigate } from 'astro:transitions/client';
import EraseConfirmDialog from './EraseConfirmDialog';

export interface MenuOption {
  action: string;
  label: string;
  icon: any;
}

// Helper function to render icon as inline SVG with proper fill color
const renderIcon = (icon: any, action: string) => {
  // Map actions to their corresponding SVG paths
  const iconMap: Record<string, { viewBox: string; path: string }> = {
    'pen-to-square': {
      viewBox: '0 0 512 512',
      path: 'M471.6 21.7c-21.9-21.9-57.3-21.9-79.2 0L362.3 51.7l97.9 97.9 30.1-30.1c21.9-21.9 21.9-57.3 0-79.2L471.6 21.7zm-299.2 220c-6.1 6.1-10.8 13.6-13.5 21.9l-29.6 88.8c-2.9 8.6-.6 18.1 5.8 24.6s15.9 8.7 24.6 5.8l88.8-29.6c8.2-2.7 15.7-7.4 21.9-13.5L437.7 172.3 339.7 74.3 172.4 241.7zM96 64C43 64 0 107 0 160L0 416c0 53 43 96 96 96l256 0c53 0 96-43 96-96l0-96c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 96c0 17.7-14.3 32-32 32L96 448c-17.7 0-32-14.3-32-32l0-256c0-17.7 14.3-32 32-32l96 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L96 64z'
    },
    'eraser': {
      viewBox: '0 0 576 512',
      path: 'M290.7 57.4L57.4 290.7c-25 25-25 65.5 0 90.5l80 80c12 12 28.3 18.7 45.3 18.7L288 480l9.4 0L512 480c17.7 0 32-14.3 32-32s-14.3-32-32-32l-124.1 0L518.6 285.3c25-25 25-65.5 0-90.5L381.3 57.4c-25-25-65.5-25-90.5 0zM297.4 416l-9.4 0-105.4 0-80-80L227.3 211.3 364.7 348.7 297.4 416z'
    },
    'circle-info': {
      viewBox: '0 0 512 512',
      path: 'M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM216 336l24 0 0-64-24 0c-13.3 0-24-10.7-24-24s10.7-24 24-24l48 0c13.3 0 24 10.7 24 24l0 88 8 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-80 0c-13.3 0-24-10.7-24-24s10.7-24 24-24zm40-208a32 32 0 1 1 0 64 32 32 0 1 1 0-64z'
    },
    'layer-group': {
      viewBox: '0 0 576 512',
      path: 'M264.5 5.2c14.9-6.9 32.1-6.9 47 0l218.6 101c8.5 3.9 13.9 12.4 13.9 21.8s-5.4 17.9-13.9 21.8l-218.6 101c-14.9 6.9-32.1 6.9-47 0L45.9 149.8C37.4 145.8 32 137.3 32 128s5.4-17.9 13.9-21.8L264.5 5.2zM476.9 209.6l53.2 24.6c8.5 3.9 13.9 12.4 13.9 21.8s-5.4 17.9-13.9 21.8l-218.6 101c-14.9 6.9-32.1 6.9-47 0L45.9 277.8C37.4 273.8 32 265.3 32 256s5.4-17.9 13.9-21.8l53.2-24.6 152 70.2c23.4 10.8 50.4 10.8 73.8 0l152-70.2zm-152 198.2l152-70.2 53.2 24.6c8.5 3.9 13.9 12.4 13.9 21.8s-5.4 17.9-13.9 21.8l-218.6 101c-14.9 6.9-32.1 6.9-47 0L45.9 405.8C37.4 401.8 32 393.3 32 384s5.4-17.9 13.9-21.8l53.2-24.6 152 70.2c23.4 10.8 50.4 10.8 73.8 0z'
    },
    'note-sticky': {
      viewBox: '0 0 448 512',
      path: 'M64 32C28.7 32 0 60.7 0 96L0 416c0 35.3 28.7 64 64 64l224 0 0-112c0-26.5 21.5-48 48-48l112 0 0-224c0-35.3-28.7-64-64-64L64 32zM448 352l-45.3 0L336 352c-8.8 0-16 7.2-16 16l0 66.7 0 45.3 32-32 64-64 32-32z'
    }
  };

  // Try to identify icon from action type
  let iconKey: string | null = null;
  if (action.includes('edit')) {
    iconKey = 'pen-to-square';
  } else if (action.includes('erase')) {
    iconKey = 'eraser';
  } else if (action.includes('seeDetails') || action.includes('Details')) {
    iconKey = 'circle-info';
  } else if (action.includes('Thread')) {
    iconKey = 'layer-group';
  } else if (action.includes('Note')) {
    iconKey = 'note-sticky';
  }

  // Fallback: try to identify from icon src path
  if (!iconKey && icon?.src) {
    const src = icon.src as string;
    if (src.includes('pen-to-square')) iconKey = 'pen-to-square';
    else if (src.includes('eraser')) iconKey = 'eraser';
    else if (src.includes('circle-info')) iconKey = 'circle-info';
    else if (src.includes('layer-group')) iconKey = 'layer-group';
    else if (src.includes('note-sticky')) iconKey = 'note-sticky';
  }

  // If we found a matching icon, render as inline SVG
  if (iconKey && iconMap[iconKey]) {
    const { viewBox, path } = iconMap[iconKey];
    return (
      <svg className="block max-w-none w-full h-full fill-[var(--color-deep-grey)]" viewBox={viewBox}>
        <path d={path} />
      </svg>
    );
  }

  // Fallback to img tag if we can't identify the icon
  return (
    <img
      src={icon?.src}
      alt=""
      className="block max-w-none w-full h-full"
    />
  );
};

export interface MenuProps {
  options: MenuOption[];
  contentType?: "thread" | "note" | "space" | "dashboard" | "profile";
  contentId?: string;
  currentThreadId?: string; // Add this prop
  onClose?: () => void;
}

export default function Menu({
  options,
  contentType,
  contentId,
  currentThreadId, // Add this prop
  onClose
}: MenuProps) {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [isExiting, setIsExiting] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Mount animation with delay to ensure DOM ready
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsMounted(true);
    }, 10);
    return () => clearTimeout(timer);
  }, []);

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
    setIsExiting(true);
    setIsMounted(false);
    setTimeout(() => {
      // Dispatch the closeMoreMenu event that SquareButton listens for
      window.dispatchEvent(new CustomEvent('closeMoreMenu'));
      // Also call onClose if provided
      if (onClose) {
        onClose();
      }
    }, 250); // Match animation duration
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
          const pathBeforeEvent = window.location.pathname;
          
          window.dispatchEvent(new CustomEvent('noteDeleted', {
            detail: { 
              noteId: contentId,
              threadId: currentThreadId // Pass the threadId so navigation knows which thread to update
            }
          }));
          
          // Give NavigationContext time to process the event and navigate if needed
          // (e.g., if unorganized thread becomes empty, NavigationContext will navigate)
          // If NavigationContext doesn't navigate, we'll proceed with normal redirect below
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Check if NavigationContext navigated away (page changed)
          // If so, don't proceed with our redirect
          if (window.location.pathname !== pathBeforeEvent) {
            // NavigationContext already navigated, we're done
            return;
          }
        } else if (contentType === 'space') {
          window.dispatchEvent(new CustomEvent('spaceDeleted', {
            detail: { spaceId: contentId }
          }));
        }
        
        // Redirect based on content type
        let redirectUrl: string;
        if (contentType === 'note') {
          // Priority 1: Use the explicitly passed currentThreadId if available
          if (currentThreadId) {
            redirectUrl = `/${currentThreadId}?toast=success&message=` + encodeURIComponent(successMessage);
          }
          // Priority 2: Fallback to the threadId from the API response
          else if (data.threadId && data.threadId !== 'thread_unorganized') {
            redirectUrl = `/${data.threadId}?toast=success&message=` + encodeURIComponent(successMessage);
          }
          // Priority 3: Fallback to dashboard
          else {
            redirectUrl = '/?toast=success&message=' + encodeURIComponent(successMessage);
          }
        } else {
          // For threads and spaces, redirect to dashboard
          redirectUrl = '/?toast=success&message=' + encodeURIComponent(successMessage);
        }
        // Use View Transitions instead of hard redirect to maintain React state
        navigate(redirectUrl, { history: 'replace' });
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
      <div 
        className={`menu bg-white rounded-3xl overflow-hidden ${isMounted && !isExiting ? 'menu-enter' : ''} ${isExiting ? 'menu-exit' : ''}`}
        style={!isMounted ? { opacity: 0, transform: 'translateY(-2px)' } : undefined}
      >
        {options.map((option, index) => (
          <React.Fragment key={index}>
            {index > 0 && (
              <div className="menu-separator border-t border-gray-50" />
            )}
            <button
              onClick={() => handleAction(option.action, option.label)}
              className="menu-item flex items-center gap-3 py-[18px] px-4 pb-5 hover:bg-gray-50 transition-colors duration-150 cursor-pointer w-full text-left rounded-[3px]"
            >
              <div className="relative shrink-0 w-5 h-5 flex items-center justify-center">
                {renderIcon(option.icon, option.action)}
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
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4 modal-overlay-enter"
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
            className="bg-white rounded-xl p-6 max-w-md w-full shadow-lg modal-content-enter"
            onClick={(e) => e.stopPropagation()}
            style={{ pointerEvents: 'auto' }}
          >
            <h3 className="text-lg font-semibold text-[var(--color-deep-grey)] mb-2">
              Are you sure?
            </h3>
            <p className="text-[var(--color-pebble-grey)] mb-6">
              {contentType === 'space' ? (
                <>When you erase a space your notes and threads will stay in your Harvous. Only the space will be erased.</>
              ) : (
                <>Are you sure you want to erase this {contentType}?</>
              )}
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


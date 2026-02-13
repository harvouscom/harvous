import React, { useState, useEffect, Fragment, useRef } from 'react';
import { createPortal } from 'react-dom';
import { usePersistedUserId } from '@/utils/user-id';
import { safeNavigate } from '@/utils/safe-navigate';
import EraseConfirmDialog from './EraseConfirmDialog';
import ButtonSmall from './ButtonSmall';
import { deleteNoteOffline, deleteThreadOffline, deleteSpaceOffline } from '@/utils/offline-mutations';
import { safeFetch } from '@/utils/safe-fetch';

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
    },
    'newspaper': {
      viewBox: '0 0 512 512',
      path: 'M96 96c0-35.3 28.7-64 64-64l288 0c35.3 0 64 28.7 64 64l0 320c0 35.3-28.7 64-64 64L80 480c-44.2 0-80-35.8-80-80L0 128c0-17.7 14.3-32 32-32s32 14.3 32 32l0 272c0 8.8 7.2 16 16 16s16-7.2 16-16L96 96zm64 24l0 80c0 13.3 10.7 24 24 24l112 0c13.3 0 24-10.7 24-24l0-80c0-13.3-10.7-24-24-24L184 96c-13.3 0-24 10.7-24 24zm208-8c0 8.8 7.2 16 16 16l48 0c8.8 0 16-7.2 16-16s-7.2-16-16-16l-48 0c-8.8 0-16 7.2-16 16zm0 96c0 8.8 7.2 16 16 16l48 0c8.8 0 16-7.2 16-16s-7.2-16-16-16l-48 0c-8.8 0-16 7.2-16 16zM160 304c0 8.8 7.2 16 16 16l256 0c8.8 0 16-7.2 16-16s-7.2-16-16-16l-256 0c-8.8 0-16 7.2-16 16zm0 96c0 8.8 7.2 16 16 16l256 0c8.8 0 16-7.2 16-16s-7.2-16-16-16l-256 0c-8.8 0-16 7.2-16 16z'
    },
    'tag': {
      viewBox: '0 0 448 512',
      path: 'M0 80V229.5c0 17 6.7 33.3 18.7 45.3l176 176c25 25 65.5 25 90.5 0L418.7 317.3c25-25 25-65.5 0-90.5l-176-176c-12-12-28.3-18.7-45.3-18.7H48C21.5 32 0 53.5 0 80zm112 96c-17.7 0-32-14.3-32-32s14.3-32 32-32s32 14.3 32 32s-14.3 32-32 32z'
    },
    'share': {
      viewBox: '0 0 512 512',
      path: 'M307 34.8c-11.5 5.1-19 16.6-19 29.2v64H176C78.8 128 0 206.8 0 304C0 417.3 81.5 467.9 100.2 478.1c2.5 1.4 5.3 1.9 8.1 1.9c10.9 0 19.7-8.9 19.7-19.7c0-7.5-4.3-14.4-9.8-19.5C108.8 431.9 96 414.4 96 384c0-53 43-96 96-96h96v64c0 12.6 7.4 24.1 19 29.2s25 3 34.4-5.4l160-144c6.7-6.1 10.6-14.7 10.6-23.8s-3.8-17.7-10.6-23.8l-160-144c-9.4-8.5-22.9-10.6-34.4-5.4z'
    },
    'lock': {
      viewBox: '0 0 448 512',
      path: 'M144 144l0 48 160 0 0-48c0-44.2-35.8-80-80-80s-80 35.8-80 80zM80 192l0-48C80 64.5 144.5 0 224 0s144 64.5 144 144l0 48 16 0c35.3 0 64 28.7 64 64l0 192c0 35.3-28.7 64-64 64L64 512c-35.3 0-64-28.7-64-64L0 256c0-35.3 28.7-64 64-64l16 0z'
    },
    'unlock': {
      viewBox: '0 0 448 512',
      path: 'M144 144c0-44.2 35.8-80 80-80c31.9 0 59.4 18.6 72.3 45.7c7.6 16 26.7 22.8 42.6 15.2s22.8-26.7 15.2-42.6C331 33.7 281.5 0 224 0C144.5 0 80 64.5 80 144l0 48-16 0c-35.3 0-64 28.7-64 64L0 448c0 35.3 28.7 64 64 64l320 0c35.3 0 64-28.7 64-64l0-192c0-35.3-28.7-64-64-64l-240 0 0-48z'
    },
    'hashtag': {
      viewBox: '0 0 448 512',
      path: 'M181.3 32.4c17.4 2.9 29.2 19.4 26.3 36.8L197.8 128l95.1 0 11.5-69.3c2.9-17.4 19.4-29.2 36.8-26.3s29.2 19.4 26.3 36.8L357.8 128l58.2 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-68.9 0L325.8 320l58.2 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-68.9 0-11.5 69.3c-2.9 17.4-19.4 29.2-36.8 26.3s-29.2-19.4-26.3-36.8l9.8-58.7-95.1 0-11.5 69.3c-2.9 17.4-19.4 29.2-36.8 26.3s-29.2-19.4-26.3-36.8L90.2 384 32 384c-17.7 0-32-14.3-32-32s14.3-32 32-32l68.9 0 21.3-128L64 192c-17.7 0-32-14.3-32-32s14.3-32 32-32l68.9 0 11.5-69.3c2.9-17.4 19.4-29.2 36.8-26.3zM187.1 192L165.8 320l95.1 0 21.3-128-95.1 0z'
    },
    'right-from-bracket': {
      viewBox: '0 0 512 512',
      path: 'M377.9 105.9L500.7 228.7c7.2 7.2 11.3 17.1 11.3 27.3s-4.1 20.1-11.3 27.3L377.9 406.1c-6.4 6.4-15 9.9-24 9.9c-18.7 0-33.9-15.2-33.9-33.9l0-62.1-128 0c-17.7 0-32-14.3-32-32l0-64c0-17.7 14.3-32 32-32l128 0 0-62.1c0-18.7 15.2-33.9 33.9-33.9c9 0 17.6 3.6 24 9.9zM160 96L96 96c-17.7 0-32 14.3-32 32l0 256c0 17.7 14.3 32 32 32l64 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-64 0c-53 0-96-43-96-96L0 128C0 75 43 32 96 32l64 0c17.7 0 32 14.3 32 32s-14.3 32-32 32z'
    }
  };

  // Try to identify icon from action type
  // Order matters: check more specific patterns first
  let iconKey: string | null = null;
  if (action.includes('edit')) {
    iconKey = 'pen-to-square';
  } else if (action.includes('erase')) {
    iconKey = 'eraser';
  } else if (action.includes('Tag') || action.includes('tag')) {
    iconKey = 'tag';
  } else if (action.includes('Thread')) {
    iconKey = 'layer-group';
  } else if (action.includes('share') || action.includes('Share')) {
    iconKey = 'share';
  } else if (action === 'lockNote' && icon?.src === 'unlock') {
    iconKey = 'unlock';
  } else if (action === 'removeLock') {
    iconKey = 'unlock';
  } else if (action.includes('lock')) {
    iconKey = 'lock';
  } else if (action === 'copyNoteId') {
    iconKey = 'hashtag';
  } else if (action.includes('Note')) {
    iconKey = 'note-sticky';
  } else if (action === 'viewSpace' || action.includes('seeDetails') || action.includes('Details')) {
    iconKey = 'circle-info';
  } else if (action === 'leaveSpace') {
    iconKey = 'right-from-bracket';
  } else if (action.includes('Resource')) {
    iconKey = 'newspaper';
  }

  // Fallback: try to identify from icon src path
  if (!iconKey && icon?.src) {
    const src = icon.src as string;
    if (src.includes('pen-to-square')) iconKey = 'pen-to-square';
    else if (src.includes('eraser')) iconKey = 'eraser';
    else if (src.includes('circle-info')) iconKey = 'circle-info';
    else if (src.includes('tag')) iconKey = 'tag';
    else if (src.includes('newspaper')) iconKey = 'newspaper';
    else if (src.includes('layer-group')) iconKey = 'layer-group';
    else if (src.includes('note-sticky')) iconKey = 'note-sticky';
    else if (src === 'unlock') iconKey = 'unlock';
    else if (src.includes('lock')) iconKey = 'lock';
    else if (src.includes('hashtag')) iconKey = 'hashtag';
    else if (src.includes('right-from-bracket')) iconKey = 'right-from-bracket';
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
  // Get userId at top level (not inside async functions) to comply with Rules of Hooks
  // Works online (from Clerk) and offline (from localStorage)
  const userId = usePersistedUserId();

  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [isExiting, setIsExiting] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const firstItemRef = useRef<HTMLButtonElement>(null);

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

  // Keyboard navigation: Escape to close menu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showConfirmDialog) {
        closeMenu();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showConfirmDialog]);

  // Keyboard navigation: Escape to close confirmation dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showConfirmDialog) {
        setShowConfirmDialog(false);
        setPendingAction(null);
      }
    };

    if (showConfirmDialog) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showConfirmDialog]);

  // Focus management: Focus first menu item when menu opens
  useEffect(() => {
    if (isMounted && firstItemRef.current) {
      firstItemRef.current.focus();
    }
  }, [isMounted]);

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

    // Handle leave space - show confirmation dialog first
    if (action === 'leaveSpace') {
      if (contentType !== 'space' || !contentId || !userId) return;
      setPendingAction('leaveSpace');
      setShowConfirmDialog(true);
      return;
    }
    
    // Close the menu for non-erase actions
    closeMenu();
    
    // Handle other actions
    await executeAction(action);
  };

  const executeAction = async (action: string) => {
    if (action === 'copyNoteId') {
      const option = options.find((o) => o.action === 'copyNoteId');
      const textToCopy = option?.label ?? '';
      try {
        await navigator.clipboard.writeText(textToCopy);
        if ((window as any).toast?.success) {
          (window as any).toast.success(`Copied ${textToCopy} to clipboard`);
        }
      } catch {
        if ((window as any).toast?.error) {
          (window as any).toast.error('Failed to copy note ID');
        }
      }
      closeMenu();
    } else if (action.includes('erase')) {
      await performErase();
    } else if (action === 'openNoteDetailsThreads') {
      // Handle Threads shortcut action for notes
      try {
        window.dispatchEvent(new CustomEvent('openNoteDetailsPanel', {
          detail: { contentId, contentType, tab: 'threads' }
        }));
      } catch (error) {
        console.error('Error opening note details panel (threads):', error);
      }
    } else if (action === 'openNoteDetailsTags') {
      // Handle Tags shortcut action for notes
      try {
        window.dispatchEvent(new CustomEvent('openNoteDetailsPanel', {
          detail: { contentId, contentType, tab: 'tags' }
        }));
      } catch (error) {
        console.error('Error opening note details panel (tags):', error);
      }
    } else if (action === 'openNoteDetailsNotes') {
      // Handle Notes shortcut action for scripture notes
      try {
        window.dispatchEvent(new CustomEvent('openNoteDetailsPanel', {
          detail: { contentId, contentType, tab: 'notes' }
        }));
      } catch (error) {
        console.error('Error opening note details panel (notes):', error);
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
    } else if (action === 'viewSpace') {
      // Handle Space details (members see People list; same panel as edit)
      try {
        window.dispatchEvent(new CustomEvent('openEditSpacePanel', {
          detail: { contentId, contentType }
        }));
      } catch (error) {
        console.error('Error opening edit space panel:', error);
      }
    } else if (action === 'leaveSpace') {
      // Leave space: DELETE member, redirect to / (confirmation handled by dialog)
      if (contentType !== 'space' || !contentId || !userId) return;
      try {
        const base = typeof window !== 'undefined' ? window.location.origin : '';
        const res = await fetch(`${base}/api/spaces/${contentId}/members/${userId}`, { method: 'DELETE' });
        if (res.ok) {
          window.location.href = '/';
        } else {
          const data = await res.json().catch(() => ({}));
          alert(data.message || 'Could not leave space.');
        }
      } catch {
        alert('Could not leave space.');
      }
    } else if (action === 'openNewThreadPanel') {
      // Handle Add Thread action
      try {
        window.dispatchEvent(new CustomEvent('openNewThreadPanel'));
      } catch (error) {
        console.error('Error dispatching openNewThreadPanel event:', error);
      }
    } else if (action === 'openNewNotePanel') {
      // Handle Add Note action
      try {
        window.dispatchEvent(new CustomEvent('openNewNotePanel'));
      } catch (error) {
        console.error('Error dispatching openNewNotePanel event:', error);
      }
    } else if (action === 'shareNote') {
      // Handle Share Note action
      try {
        window.dispatchEvent(new CustomEvent('openNoteSharePanel', {
          detail: { contentId, contentType }
        }));
      } catch (error) {
        console.error('Error opening note share panel:', error);
      }
    } else if (action === 'lockNote') {
      // Handle Lock with PIN - trigger Lock button in note view
      try {
        window.dispatchEvent(new CustomEvent('focusLockNote', {
          detail: { contentId }
        }));
      } catch (error) {
        console.error('Error dispatching focusLockNote:', error);
      }
    } else if (action === 'removeLock') {
      // Remove lock: open PIN panel so user confirms PIN, then panel removes lock
      try {
        window.dispatchEvent(new CustomEvent('focusLockNote', {
          detail: { contentId, removeLock: true }
        }));
      } catch (error) {
        console.error('Error dispatching focusLockNote for removeLock:', error);
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
        successMessage = 'Thread erased!';
        break;
      case 'note':
        apiUrl = '/api/notes/delete';
        paramName = 'noteId';
        successMessage = 'Note erased!';
        break;
      case 'space':
        apiUrl = '/api/spaces/delete';
        paramName = 'spaceId';
        successMessage = 'Space erased!';
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

    let deletedOffline = false;
    try {
      // OFFLINE-FIRST: Delete from local IndexedDB when offline mode is enabled
      // When offline mode is off (e.g. private space), we only delete on the server
      if (userId) {
        try {
          if (contentType === 'note') {
            await deleteNoteOffline(userId, contentId);
            deletedOffline = true;
          } else if (contentType === 'thread') {
            await deleteThreadOffline(userId, contentId);
            deletedOffline = true;
          } else if (contentType === 'space') {
            await deleteSpaceOffline(userId, contentId);
            deletedOffline = true;
          }
          console.log(`[Menu] ${contentType} deleted locally in IndexedDB`, { id: contentId });
        } catch (err) {
          console.error(`[Menu] Failed to delete ${contentType} offline:`, err);
          // Continue with server API call
        }
      }

      // Show success immediately only when we actually deleted offline; otherwise wait for server
      if (deletedOffline && (window as any).toast) {
        (window as any).toast.success(successMessage);
      }

      // Then try to push deletion to server
      let response: Response | null = null;
      let data: any = null;

      response = await safeFetch(`${apiUrl}?${paramName}=${encodeURIComponent(contentId)}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        retries: 3,
        timeout: 10000
      });

      // safeFetch returns null on network/auth failures
      if (response === null) {
        // Only treat as success if we deleted offline; otherwise the server never got the request
        if (!deletedOffline) {
          if ((window as any).toast) {
            (window as any).toast.error('Couldn\'t erase. Please check your connection and try again.');
          }
          return;
        }
        console.log('[Menu] Network error but item deleted offline, proceeding with navigation', { contentType, contentId });

        // Dispatch deletion events for navigation updates
        if (contentType === 'thread') {
          window.dispatchEvent(new CustomEvent('threadDeleted', {
            detail: { threadId: contentId }
          }));
        } else if (contentType === 'note') {
          window.dispatchEvent(new CustomEvent('noteDeleted', {
            detail: {
              noteId: contentId,
              threadId: currentThreadId
            }
          }));
        } else if (contentType === 'space') {
          window.dispatchEvent(new CustomEvent('spaceDeleted', {
            detail: { spaceId: contentId }
          }));
        }

        // Navigate: omit toast params when we already showed the toast (deletedOffline) to avoid double toast
        const query = deletedOffline ? '' : `?toast=success&message=${encodeURIComponent(successMessage)}`;
        let redirectUrl: string;
        if (contentType === 'note') {
          const currentPath = window.location.pathname;
          const threadPageMatch = currentPath.match(/^\/(thread_[a-zA-Z0-9_-]+)$/);
          if (threadPageMatch) {
            redirectUrl = `/${threadPageMatch[1]}${query}`;
          } else if (currentThreadId) {
            redirectUrl = `/${currentThreadId}${query}`;
          } else {
            redirectUrl = `/${query}`;
          }
        } else {
          redirectUrl = query ? `/${query}` : '/';
        }

        safeNavigate(redirectUrl, { history: 'replace' });
        return;
      }

      // Parse response JSON if successful
      try {
        data = await response.json();
      } catch (error) {
        console.error('[Menu] Failed to parse response JSON', error);
      }
      
      if (response && response.ok) {
        // Only show toast here when we won't redirect with toast params (note may stay on thread);
        // for space/thread we redirect with ?toast=success&message=... so toast-handler will show it once
        const willRedirectWithToast = contentType === 'space' || contentType === 'thread';
        if (!deletedOffline && !willRedirectWithToast && (window as any).toast) {
          (window as any).toast.success(successMessage);
        }
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
      } else if (response) {
        console.error('Delete failed:', data);
        const errorMessage = data?.error || 'Failed to sync deletion with server';
        console.error('[Menu] Server deletion failed:', errorMessage);

        if (!deletedOffline) {
          if ((window as any).toast) {
            (window as any).toast.error(errorMessage);
          }
          return;
        }

        // Item is already deleted locally, proceed with navigation
        if (contentType === 'thread') {
          window.dispatchEvent(new CustomEvent('threadDeleted', {
            detail: { threadId: contentId }
          }));
        } else if (contentType === 'note') {
          window.dispatchEvent(new CustomEvent('noteDeleted', {
            detail: { 
              noteId: contentId,
              threadId: currentThreadId
            }
          }));
        } else if (contentType === 'space') {
          window.dispatchEvent(new CustomEvent('spaceDeleted', {
            detail: { spaceId: contentId }
          }));
        }

        // Omit toast params when we already showed the toast (deletedOffline)
        const errQuery = deletedOffline ? '' : `?toast=success&message=${encodeURIComponent(successMessage)}`;
        let redirectUrl: string;
        if (contentType === 'note') {
          const currentPath = window.location.pathname;
          const threadPageMatch = currentPath.match(/^\/(thread_[a-zA-Z0-9_-]+)$/);
          if (threadPageMatch) {
            redirectUrl = `/${threadPageMatch[1]}${errQuery}`;
          } else if (currentThreadId) {
            redirectUrl = `/${currentThreadId}${errQuery}`;
          } else {
            redirectUrl = errQuery ? `/${errQuery}` : '/';
          }
        } else {
          redirectUrl = errQuery ? `/${errQuery}` : '/';
        }

        safeNavigate(redirectUrl, { history: 'replace' });
        return;
      }

        // Redirect based on content type (only reached if response.ok was true)
        let redirectUrl: string;
        if (contentType === 'note') {
          // Priority 1: If we're on a thread page, always redirect back to that thread
          // This ensures deleting a note from a thread page keeps us on that thread
          const currentPath = window.location.pathname;
          const threadPageMatch = currentPath.match(/^\/(thread_[a-zA-Z0-9_-]+)$/);
          if (threadPageMatch) {
            const threadIdFromUrl = threadPageMatch[1];
            redirectUrl = `/${threadIdFromUrl}?toast=success&message=` + encodeURIComponent(successMessage);
          } else if (currentThreadId) {
            // Priority 2: Use the explicitly passed currentThreadId if available
            redirectUrl = `/${currentThreadId}?toast=success&message=` + encodeURIComponent(successMessage);
          } else if (data.threadId && data.threadId !== 'thread_unorganized') {
            // Priority 3: Fallback to the threadId from the API response
            redirectUrl = `/${data.threadId}?toast=success&message=` + encodeURIComponent(successMessage);
          } else {
            // Priority 4: Fallback to dashboard
            redirectUrl = '/?toast=success&message=' + encodeURIComponent(successMessage);
          }
        } else {
          // For threads and spaces, redirect to dashboard
          redirectUrl = '/?toast=success&message=' + encodeURIComponent(successMessage);
        }
        // Use View Transitions instead of hard redirect to maintain React state
        safeNavigate(redirectUrl, { history: 'replace' });
    } catch (error) {
      // Only treat as success if we actually deleted offline; otherwise show error
      if (isNetworkError(error) && deletedOffline) {
        console.log('[Menu] Network error but item deleted offline, proceeding with navigation', { contentType, contentId });

        if (contentType === 'thread') {
          window.dispatchEvent(new CustomEvent('threadDeleted', {
            detail: { threadId: contentId }
          }));
        } else if (contentType === 'note') {
          window.dispatchEvent(new CustomEvent('noteDeleted', {
            detail: { 
              noteId: contentId,
              threadId: currentThreadId
            }
          }));
        } else if (contentType === 'space') {
          window.dispatchEvent(new CustomEvent('spaceDeleted', {
            detail: { spaceId: contentId }
          }));
        }

        // Omit toast params when we already showed the toast (deletedOffline)
        const catchQuery = deletedOffline ? '' : `?toast=success&message=${encodeURIComponent(successMessage)}`;
        let redirectUrl: string;
        if (contentType === 'note') {
          const currentPath = window.location.pathname;
          const threadPageMatch = currentPath.match(/^\/(thread_[a-zA-Z0-9_-]+)$/);
          if (threadPageMatch) {
            redirectUrl = `/${threadPageMatch[1]}${catchQuery}`;
          } else if (currentThreadId) {
            redirectUrl = `/${currentThreadId}${catchQuery}`;
          } else {
            redirectUrl = catchQuery ? `/${catchQuery}` : '/';
          }
        } else {
          redirectUrl = catchQuery ? `/${catchQuery}` : '/';
        }

        safeNavigate(redirectUrl, { history: 'replace' });
      } else {
        // Real error - log and show error toast
        console.error('Error deleting item:', error);
        if ((window as any).toast) {
          (window as any).toast.error('Failed to erase item');
        } else {
          alert('Failed to erase item. Please check the console for details.');
        }
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
        role="menu"
        aria-label="Options menu"
        className={`menu ${isMounted && !isExiting ? 'menu-enter' : ''} ${isExiting ? 'menu-exit' : ''}`}
        style={!isMounted ? { opacity: 0, transform: 'translateY(-2px)' } : undefined}
      >
        {options.map((option, index) => (
          <Fragment key={index}>
            {index > 0 && (
              <div className="menu-separator" />
            )}
            <button
              ref={index === 0 ? firstItemRef : null}
              role="menuitem"
              onClick={() => handleAction(option.action, option.label)}
              className="menu-item"
            >
              <div className="relative shrink-0 w-5 h-5 flex items-center justify-center">
                {renderIcon(option.icon, option.action)}
              </div>
              <span className="menu-item__label">
                {option.label}
              </span>
            </button>
          </Fragment>
        ))}
      </div>

      {/* Confirmation Dialog - Rendered via Portal to ensure full viewport coverage */}
      {showConfirmDialog && contentType && typeof document !== 'undefined' && createPortal(
        <div
          className="modal-overlay-enter"
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '1rem',
            backgroundColor: 'transparent',
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
            className="modal-content-enter"
            onClick={(e) => e.stopPropagation()}
            style={{ 
              backgroundColor: 'white',
              borderRadius: '0.75rem',
              padding: '1.5rem',
              maxWidth: '28rem',
              width: '100%',
              pointerEvents: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
            }}
          >
            <h3 style={{
              fontSize: '1.125rem',
              fontWeight: 600,
              color: 'var(--color-deep-grey)',
              marginBottom: '0.5rem'
            }}>
              {pendingAction === 'leaveSpace' ? 'Leave this space?' : 'Are you sure?'}
            </h3>
            <p style={{
              color: 'var(--color-pebble-grey)',
              marginBottom: '1.5rem'
            }}>
              {pendingAction === 'leaveSpace' ? (
                <>Anything you&apos;ve added to this space will remain in the space unless you remove it. You can rejoin later with the same link.</>
              ) : contentType === 'space' ? (
                <>When you erase a space your notes and threads will stay in your Harvous. Only the space will be erased.</>
              ) : (
                <>Are you sure you want to erase this {contentType}?</>
              )}
            </p>
            {pendingAction === 'leaveSpace' ? (
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <ButtonSmall type="button" onClick={handleCancelErase} state="Secondary">
                  Cancel
                </ButtonSmall>
                <ButtonSmall type="button" onClick={handleConfirmErase} state="Default">
                  Leave space
                </ButtonSmall>
              </div>
            ) : (
              <EraseConfirmDialog
                contentType={contentType!}
                onCancel={handleCancelErase}
                onConfirm={handleConfirmErase}
              />
            )}
          </div>
        </div>,
        document.body
      )}

      <style>{`
        .menu {
          min-width: 223px;
          box-shadow: 0px 3px 20px 0px rgba(120, 118, 111, 0.1);
        }
        
        .menu-item {
          border: none !important;
          outline: none !important;
          box-shadow: none !important;
          background-color: white;
        }
        
        .menu-item:hover {
          background-color: oklch(var(--lch-snow-white) / 0.5);
        }
        
        .menu-separator {
          border-color: var(--color-soft-gray);
        }
      `}</style>
    </>
  );
}


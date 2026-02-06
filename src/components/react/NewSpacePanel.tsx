import React, { useState, useEffect, useRef } from 'react';
import { formatBadgeCount } from '@/utils/badge-count';
import { THREAD_COLORS, getThreadColorCSS, getThreadGradientCSS, getThreadTextColorCSS, type ThreadColor } from '@/utils/colors';
import SquareButton from './SquareButton';
import AddToSpaceSection from './AddToSpaceSection';
import { captureException } from '@/utils/posthog';
import ActionButton from './ActionButton';
import { safeNavigate } from '@/utils/safe-navigate';
import { safeURL } from '@/utils/safe-url';
import Icon from './Icon';
import { stripHtmlForPreview } from '@/utils/html-stripper';
import UnsavedChangesDialog from './dialogs/UnsavedChangesDialog';
import { createSpaceOffline } from '@/utils/offline-mutations';
import { usePersistedUserId } from '@/utils/user-id';
import { isNetworkError } from '@/utils/network';

interface Note {
  id: string;
  title: string | null;
  content: string;
  spaceId: string | null;
  [key: string]: any;
}

interface Thread {
  id: string;
  title: string;
  color?: string;
  spaceId: string | null;
  isPublic?: boolean;
  subtitle?: string;
  count?: number;
  [key: string]: any;
}

interface NewSpacePanelProps {
  onClose?: () => void;
  onSpaceCreated?: () => void;
  inBottomSheet?: boolean;
}

export default function NewSpacePanel({ onClose, onSpaceCreated, inBottomSheet = false }: NewSpacePanelProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const userId = usePersistedUserId();
  const [title, setTitle] = useState('');
  const [selectedColor, setSelectedColor] = useState<ThreadColor>('paper');
  const [selectedType, setSelectedType] = useState('Private');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [allThreads, setAllThreads] = useState<Thread[]>([]);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true);

  // Ref for auto-focusing the space name input
  const titleInputRef = useRef<HTMLInputElement>(null);

  // When New Space panel is open, close any other create panels (Note, Thread, Resource)
  // so only this panel is visible (desktop slide-over and mobile bottom sheet both listen for these events)
  useEffect(() => {
    localStorage.removeItem('showNewNotePanel');
    localStorage.removeItem('showNewThreadPanel');
    localStorage.removeItem('showNewResourcePanel');
    window.dispatchEvent(new CustomEvent('closeNewNotePanel'));
    window.dispatchEvent(new CustomEvent('closeNewThreadPanel'));
    window.dispatchEvent(new CustomEvent('closeNewResourcePanel'));
  }, []);

  // Load data from localStorage on mount
  useEffect(() => {
    const savedTitle = localStorage.getItem('newSpaceTitle') || '';
    const savedColor = localStorage.getItem('newSpaceColor') || 'paper';
    const savedType = localStorage.getItem('newSpaceType') || 'Private';
    setTitle(savedTitle);
    setSelectedColor(savedColor as ThreadColor);
    setSelectedType(savedType);
  }, []);

  // Save data to localStorage on change
  useEffect(() => {
    localStorage.setItem('newSpaceTitle', title);
  }, [title]);

  useEffect(() => {
    localStorage.setItem('newSpaceColor', selectedColor);
  }, [selectedColor]);

  useEffect(() => {
    localStorage.setItem('newSpaceType', selectedType);
  }, [selectedType]);

  // Fetch all notes and threads on mount
  useEffect(() => {
    const fetchItems = async () => {
      setIsLoadingItems(true);
      try {
        const response = await fetch('/api/spaces/items', {
          credentials: 'include'
        });
        
        if (response.ok) {
          const data = await response.json();
          setAllNotes(data.notes || []);
          setAllThreads(data.threads || []);
        } else {
          console.error('Failed to fetch items');
          setAllNotes([]);
          setAllThreads([]);
        }
      } catch (error) {
        console.error('Error fetching items:', error);
        setAllNotes([]);
        setAllThreads([]);
      } finally {
        setIsLoadingItems(false);
      }
    };

    fetchItems();
  }, []);

  // Auto-focus the space name input when component mounts
  useEffect(() => {
    const timer = setTimeout(() => {
      if (titleInputRef.current) {
        titleInputRef.current.focus();
      }
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  // Check if there are unsaved changes
  const hasUnsavedChanges = () => {
    return title.trim().length > 0 || selectedItems.length > 0;
  };

  // Store pending navigation when user tries to navigate with unsaved changes
  const [pendingNavigation, setPendingNavigation] = useState<{ path: string; options?: { history?: 'replace' | 'push' } } | null>(null);

  // Navigation guard wrapper that checks for unsaved changes
  const safeNavigateWithGuard = async (path: string, options?: { history?: 'replace' | 'push' }) => {
    if (hasUnsavedChanges()) {
      // Store the pending navigation to execute after user confirms
      setPendingNavigation({ path, options });
      setShowUnsavedDialog(true);
      return;
    }
    // No unsaved changes, proceed with navigation
    await safeNavigate(path, options);
  };

  // Handle navigation away - show unsaved changes dialog if needed
  const handleNavigationAway = (e?: Event) => {
    if (hasUnsavedChanges()) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      setShowUnsavedDialog(true);
      return true; // Indicates navigation was prevented
    }
    return false; // No unsaved changes, allow navigation
  };

  // Intercept link clicks that would navigate away
  useEffect(() => {
    const handleLinkClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a');
      
      if (!link) return;
      
      // Don't intercept links within the panel form (like selected items)
      const panelForm = link.closest('form');
      if (panelForm) return;
      
      // Check if this is a navigation link (has href and not just a hash/anchor)
      const href = link.getAttribute('href');
      if (!href || href === '#' || href.startsWith('#')) return;
      
      // Don't intercept if it's the same page (just different hash)
      const currentPath = window.location.pathname;
      if (href.startsWith(currentPath + '#') || href === currentPath) return;
      
      // Check for unsaved changes
      if (hasUnsavedChanges()) {
        e.preventDefault();
        e.stopPropagation();
        setShowUnsavedDialog(true);
      }
    };

    document.addEventListener('click', handleLinkClick, true);
    
    return () => {
      document.removeEventListener('click', handleLinkClick, true);
    };
  }, [title, selectedItems]);

  // Handle browser navigation (back button, closing tab, etc.)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) {
        e.preventDefault();
        e.returnValue = ''; // Required for Chrome
        return ''; // Required for some browsers
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [title, selectedItems]);

  // Handle popstate (browser back/forward buttons)
  useEffect(() => {
    if (!hasUnsavedChanges()) return;

    // Push a state so we can intercept back button
    const state = { panelOpen: true, timestamp: Date.now() };
    window.history.pushState(state, '', window.location.href);
    
    const handlePopState = (e: PopStateEvent) => {
      if (hasUnsavedChanges()) {
        // Prevent navigation and show dialog
        // Push current state back to prevent navigation
        window.history.pushState(state, '', window.location.href);
        setShowUnsavedDialog(true);
      }
    };
    
    window.addEventListener('popstate', handlePopState);
    
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [title, selectedItems]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Prevent double submission
    if (isSubmitting) {
      return;
    }

    if (!title.trim()) {
      if (window.toast) {
        window.toast.error('Please enter a space name');
      } else {
        alert('Please enter a space name');
      }
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('color', selectedColor);
      formData.append('isPublic', 'false'); // Always private for now
      
      // Add selected items
      const selectedNoteIds: string[] = [];
      const selectedThreadIds: string[] = [];
      
      // Separate selected items into notes and threads
      selectedItems.forEach(itemId => {
        const isNote = allNotes.some(note => note.id === itemId);
        const isThread = allThreads.some(thread => thread.id === itemId);
        
        if (isNote) {
          selectedNoteIds.push(itemId);
        } else if (isThread) {
          selectedThreadIds.push(itemId);
        }
      });
      
      if (selectedNoteIds.length > 0) {
        formData.append('selectedNoteIds', JSON.stringify(selectedNoteIds));
      }
      if (selectedThreadIds.length > 0) {
        formData.append('selectedThreadIds', JSON.stringify(selectedThreadIds));
      }
      
      // OFFLINE-AWARE: Only create in IndexedDB if we're offline
      // When online, server is the single source of truth to avoid duplication
      let offlineSpaceId: string | null = null;
      const isOffline = !navigator.onLine;

      if (isOffline && userId) {
        try {
          offlineSpaceId = await createSpaceOffline(userId, {
            title: title.trim(),
            color: selectedColor,
            isPublic: false,
          });
          console.log('[NewSpacePanel] Space created locally in IndexedDB (offline)', { offlineSpaceId });
        } catch (err) {
          console.error('[NewSpacePanel] Failed to create space offline:', err);
          // Continue - will show error if server also fails
        }
      }
      
      let response: Response | null = null;
      let networkError = false;
      
      try {
        response = await fetch('/api/spaces/create', {
          method: 'POST',
          body: formData,
          credentials: 'include'
        });
      } catch (error) {
        // Network error occurred
        networkError = isNetworkError(error);
        
        if (networkError && offlineSpaceId) {
          // Offline save succeeded - treat as success
          console.log('[NewSpacePanel] Network error but space saved offline, treating as success', { offlineSpaceId });
          
          // Show "Saved offline" toast
          if (window.toast) {
            window.toast.success('Space saved offline. It will sync when you\'re back online.');
          }
          
          // Dispatch spaceCreated event with offline space data
          const offlineSpaceEvent = new CustomEvent('spaceCreated', {
            detail: {
              space: {
                id: offlineSpaceId,
                title: title.trim(),
                color: selectedColor,
                totalItemCount: 0,
              },
              isOffline: true
            }
          });
          window.dispatchEvent(offlineSpaceEvent);
          
          // Clear form data
          setTitle('');
          setSelectedColor('paper');
          setSelectedType('Private');
          setSelectedItems([]);
          localStorage.removeItem('newSpaceTitle');
          localStorage.removeItem('newSpaceColor');
          localStorage.removeItem('newSpaceType');
          
          // Close panel
          window.dispatchEvent(new CustomEvent('closeNewSpacePanel'));
          if (onClose) {
            onClose();
          }
          
          // Stay on current page when offline - space will appear in list from IndexedDB
          const currentUrl = safeURL(window.location.href);
          if (currentUrl) {
            currentUrl.searchParams.set('toast', 'success');
            currentUrl.searchParams.set('message', encodeURIComponent('Space saved offline. It will sync when you\'re back online.'));
            window.history.replaceState({}, '', currentUrl.toString());
          }
          
          setIsSubmitting(false);
          return;
        } else {
          // Network error but offline save also failed - rethrow
          throw error;
        }
      }

      if (response && response.ok) {
        const result = await response.json();
        
        // Clear form data
        setTitle('');
        setSelectedColor('paper');
        setSelectedType('Private');
        setSelectedItems([]);
        localStorage.removeItem('newSpaceTitle');
        localStorage.removeItem('newSpaceColor');
        localStorage.removeItem('newSpaceType');
        
        // Notify other components (desktop space dropdown listens for this)
        window.dispatchEvent(new CustomEvent('spaceCreated', {
          detail: { space: result.space }
        }));

        // If onSpaceCreated callback is provided, use it instead of redirecting
        if (onSpaceCreated) {
          onSpaceCreated();
        } else {
          // Check if there's a pending navigation from unsaved changes dialog
          if (pendingNavigation) {
            // Execute the pending navigation (user wanted to navigate after saving)
            const navPath = pendingNavigation.path;
            const navOptions = pendingNavigation.options;
            setPendingNavigation(null);
            window.dispatchEvent(new CustomEvent('closeNewSpacePanel'));
            if (onClose) {
              onClose();
            }
            setTimeout(() => {
              safeNavigate(navPath, navOptions);
            }, 100);
          } else {
            // Default behavior: redirect to the newly created space
            window.dispatchEvent(new CustomEvent('closeNewSpacePanel'));
            if (onClose) {
              onClose();
            }

            // Redirect to the newly created space
            if (result.space && result.space.id) {
              const redirectUrl = `/${result.space.id}`;
              // Add a small delay to ensure localStorage is updated before navigation
              setTimeout(() => {
                safeNavigate(redirectUrl, { history: 'replace' });
              }, 100);
            }
          }
        }
      } else {
        // Check if this is a network error
        const errorText = await response.text();
        let errorMessage = `Failed to create space: ${response.status}`;
        
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorMessage;
        } catch (e) {
          console.error('NewSpacePanel: Could not parse error response');
        }
        
        // Check if offline save succeeded
        if (offlineSpaceId) {
          // Offline save succeeded - treat as success
          console.log('[NewSpacePanel] Server error but space saved offline, treating as success', { offlineSpaceId });
          
          if (window.toast) {
            window.toast.success('Space saved offline. It will sync when you\'re back online.');
          }
          
          const offlineSpaceEvent = new CustomEvent('spaceCreated', {
            detail: {
              space: {
                id: offlineSpaceId,
                title: title.trim(),
                color: selectedColor,
                totalItemCount: 0,
              },
              isOffline: true
            }
          });
          window.dispatchEvent(offlineSpaceEvent);
          
          setTitle('');
          setSelectedColor('paper');
          setSelectedType('Private');
          setSelectedItems([]);
          localStorage.removeItem('newSpaceTitle');
          localStorage.removeItem('newSpaceColor');
          localStorage.removeItem('newSpaceType');
          
          window.dispatchEvent(new CustomEvent('closeNewSpacePanel'));
          if (onClose) {
            onClose();
          }
          
          setTimeout(() => {
            safeNavigate('/?toast=success&message=' + encodeURIComponent('Space saved offline'), { history: 'replace' });
          }, 100);
          
          setIsSubmitting(false);
          return;
        }
        
        throw new Error(errorMessage);
      }
    } catch (error: any) {
      // Check if this is a network error and we have an offline space
      if (isNetworkError(error) && offlineSpaceId) {
        // Network error but offline save succeeded - treat as success
        console.log('[NewSpacePanel] Network error but space saved offline, treating as success', { offlineSpaceId });
        
        if (window.toast) {
          window.toast.success('Space saved offline. It will sync when you\'re back online.');
        }
        
        const offlineSpaceEvent = new CustomEvent('spaceCreated', {
          detail: {
            space: {
              id: offlineSpaceId,
              title: title.trim(),
              color: selectedColor,
              totalItemCount: 0,
            },
            isOffline: true
          }
        });
        window.dispatchEvent(offlineSpaceEvent);
        
        setTitle('');
        setSelectedColor('paper');
        setSelectedType('Private');
        setSelectedItems([]);
        localStorage.removeItem('newSpaceTitle');
        localStorage.removeItem('newSpaceColor');
        localStorage.removeItem('newSpaceType');
        
        window.dispatchEvent(new CustomEvent('closeNewSpacePanel'));
        if (onClose) {
          onClose();
        }
        
        setTimeout(() => {
          safeNavigate('/?toast=success&message=' + encodeURIComponent('Space saved offline'), { history: 'replace' });
        }, 100);
      } else {
        // Real error - log and show error toast
        if (typeof window !== 'undefined' && window.posthog) {
          captureException(error, {
            context: 'space_creation',
            endpoint: '/api/spaces/create',
          });
        }
        
        console.error('NewSpacePanel: Error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to create space. Please try again.';
        if (window.toast) {
          window.toast.error(errorMessage);
        } else {
          alert(errorMessage);
        }
      }
    } finally {
      setTimeout(() => {
        setIsSubmitting(false);
      }, 0);
    }
  };

  const handleClose = () => {
    if (title.trim() || selectedItems.length > 0) {
      setShowUnsavedDialog(true);
    } else {
      window.dispatchEvent(new CustomEvent('closeNewSpacePanel'));
      if (onClose) {
        onClose();
      }
    }
  };

  const handleDiscardChanges = async () => {
    setTitle('');
    setSelectedColor('paper');
    setSelectedType('Private');
    setSelectedItems([]);
    localStorage.removeItem('newSpaceTitle');
    localStorage.removeItem('newSpaceColor');
    localStorage.removeItem('newSpaceType');
    setShowUnsavedDialog(false);
    
    // Execute pending navigation if there was one
    if (pendingNavigation) {
      await safeNavigate(pendingNavigation.path, pendingNavigation.options);
      setPendingNavigation(null);
    } else {
      // Close the panel - navigation will proceed naturally
      window.dispatchEvent(new CustomEvent('closeNewSpacePanel'));
      if (onClose) {
        onClose();
      }
    }
  };

  const handleSaveAndClose = () => {
    setShowUnsavedDialog(false);
    // Store that we should navigate after save
    // The form submission will handle the navigation after successful save
    const form = document.querySelector('form');
    if (form) {
      form.requestSubmit();
    }
  };

  const handleItemSelect = (itemId: string, itemType: 'note' | 'thread') => {
    setSelectedItems(prev => {
      const newItems = prev.includes(itemId)
        ? prev.filter(id => id !== itemId) // Remove if already selected
        : [...prev, itemId]; // Add if not selected
      return newItems;
    });
  };

  // Handle Cmd+Enter to submit form
  const handleFormKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      const form = e.currentTarget.closest('form');
      if (form && !isSubmitting && title.trim()) {
        form.requestSubmit();
      }
    }
  };

  // Use centralized stripHtml utility
  const stripHtml = (html: string): string => stripHtmlForPreview(html, 150);

  // Helper function to get note type icon
  const getNoteTypeIcon = (noteType: string = 'default') => {
    if (noteType === 'scripture') {
      return <Icon name="scroll" size={20} style={{ color: 'var(--color-deep-grey)', opacity: 0.3 }} />;
    } else if (noteType === 'resource') {
      return <Icon name="newspaper" size={20} style={{ color: 'var(--color-deep-grey)', opacity: 0.3 }} />;
    } else {
      // Default note - use bookmark icon
      return (
        <svg className="block max-w-none size-full text-[var(--color-deep-grey)] opacity-30" fill="currentColor" viewBox="0 0 24 24">
          <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
        </svg>
      );
    }
  };

  // Render compact thread item (similar to EditSpacePanel)
  const renderCompactThreadItem = (thread: Thread) => {
    const threadAccentColor = thread.color ? `var(--color-${thread.color})` : "var(--color-purple)";
    
    return (
      <div
        className="relative cursor-pointer"
        style={{
          position: 'relative',
          borderRadius: '0.75rem',
          height: '48px',
          width: '100%',
          textAlign: 'left',
          backgroundColor: 'white',
          boxShadow: 'none',
          transition: 'transform 0.2s',
          cursor: 'pointer'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.002)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        {/* Accent bar on left */}
        <div 
          style={{ 
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            width: '2.75rem',
            borderTopLeftRadius: '0.75rem',
            borderBottomLeftRadius: '0.75rem',
            overflow: 'hidden',
            backgroundColor: threadAccentColor
          }}
        />
        
        {/* Content */}
        <div 
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1.5rem',
            paddingLeft: '0.75rem',
            paddingRight: '3rem',
            height: '100%',
            overflow: 'hidden'
          }}
        >
          {/* User icon (Private) or User group icon (Shared) */}
          <div style={{ position: 'relative', flexShrink: 0, width: '1.25rem', height: '1.25rem' }}>
            {thread.isPublic === true ? (
              <svg style={{ display: 'block', maxWidth: 'none', width: '100%', height: '100%', color: 'var(--color-deep-grey)', opacity: 0.3 }} fill="currentColor" viewBox="0 0 640 640">
                <path d="M96 192C96 130.1 146.1 80 208 80C269.9 80 320 130.1 320 192C320 253.9 269.9 304 208 304C146.1 304 96 253.9 96 192zM32 528C32 430.8 110.8 352 208 352C305.2 352 384 430.8 384 528L384 534C384 557.2 365.2 576 342 576L74 576C50.8 576 32 557.2 32 534L32 528zM464 128C517 128 560 171 560 224C560 277 517 320 464 320C411 320 368 277 368 224C368 171 411 128 464 128zM464 368C543.5 368 608 432.5 608 512L608 534.4C608 557.4 589.4 576 566.4 576L421.6 576C428.2 563.5 432 549.2 432 534L432 528C432 476.5 414.6 429.1 385.5 391.3C408.1 376.6 435.1 368 464 368z"/>
              </svg>
            ) : (
              <svg style={{ display: 'block', maxWidth: 'none', width: '100%', height: '100%', color: 'var(--color-deep-grey)', opacity: 0.3 }} fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            )}
          </div>
          
          {/* Text content - only title */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: 0 }}>
            {/* Title with badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
              <div style={{ 
                fontFamily: 'var(--font-sans)', 
                fontWeight: 700, 
                color: 'var(--color-deep-grey)', 
                fontSize: '16px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0
              }}>
                {thread.title || 'Untitled Thread'}
              </div>
              {/* Item count badge */}
              {((thread.count !== undefined && thread.count !== null && thread.count > 0) || 
                (thread.noteCount !== undefined && thread.noteCount !== null && thread.noteCount > 0)) && (
                <div className="badge-count" style={{ flexShrink: 0 }}>
                  <span className="badge-number">
                    {formatBadgeCount(thread.count ?? thread.noteCount)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Render compact note item (similar to EditThreadPanel)
  const renderCompactNoteItem = (note: Note) => {
    const noteType = (note.noteType === 'resource' || note.noteType === 'scripture') ? note.noteType : 'default';
    
    return (
      <div
        className="relative cursor-pointer"
        style={{
          position: 'relative',
          borderRadius: '0.75rem',
          height: '48px',
          width: '100%',
          textAlign: 'left',
          backgroundColor: 'white',
          boxShadow: 'none',
          transition: 'transform 0.2s',
          cursor: 'pointer'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.002)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        {/* Accent bar on left */}
        <div 
          style={{ 
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            width: '2.75rem',
            borderTopLeftRadius: '0.75rem',
            borderBottomLeftRadius: '0.75rem',
            overflow: 'hidden',
            backgroundColor: 'var(--color-light-paper)'
          }}
        />
        
        {/* Content */}
        <div 
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1.5rem',
            paddingLeft: '0.75rem',
            paddingRight: '3rem',
            height: '100%',
            overflow: 'hidden'
          }}
        >
          {/* Note type icon */}
          <div style={{ position: 'relative', flexShrink: 0, width: '1.25rem', height: '1.25rem' }}>
            {getNoteTypeIcon(noteType)}
          </div>
          
          {/* Text content - only title */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: 0 }}>
            {/* Title */}
            <div style={{ 
              fontFamily: 'var(--font-sans)', 
              fontWeight: 700, 
              color: 'var(--color-deep-grey)', 
              fontSize: '16px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {note.title || 'Untitled Note'}
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (!isMounted) {
    return null;
  }

  return (
    <div className={`panel-wrapper ${inBottomSheet ? 'panel-wrapper--bottom-sheet' : ''}`}>
      {/* Form */}
      <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} className="form-layout">
        {/* Content area that expands to fill available space */}
        <div className="form-layout--expand">
          {/* Panel container */}
          <div className={`panel ${inBottomSheet ? 'panel--bottom-sheet' : ''}`}>
            {/* Header section with space name input */}
            <div 
              className="panel__header"
              style={{ 
                backgroundColor: getThreadColorCSS(selectedColor),
                color: getThreadTextColorCSS(selectedColor)
              }}
            >
              <div className="panel__title">
                <input 
                  ref={titleInputRef}
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Space name"
                  className="w-full bg-transparent border-none text-[24px] focus:outline-none text-center placeholder:text-[var(--color-pebble-grey)]"
                  style={{ 
                    color: getThreadTextColorCSS(selectedColor),
                    fontFamily: 'var(--font-roundo)',
                    fontWeight: 600 /* Semi-bold */
                  }}
                />
              </div>
            </div>
            
            {/* Content area */}
            <div className={`panel__body ${inBottomSheet ? 'panel__body--bottom-sheet' : ''}`}>
              <div className={`panel__content ${inBottomSheet ? 'panel__content--bottom-sheet' : ''} flex-1 min-h-0`}>
                
                {/* Color selection */}
                <div className="color-selection">
                  {THREAD_COLORS.map((color) => (
                    <button 
                      key={color}
                      type="button"
                      onClick={() => setSelectedColor(color)}
                      className={`color-swatch ${selectedColor === color ? 'color-swatch--selected' : ''}`}
                      style={{ backgroundColor: getThreadColorCSS(color) }}
                    >
                      {/* Check icon for selected color */}
                      {selectedColor === color && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Icon 
                            name="check" 
                            size={20} 
                            style={{ color: getThreadTextColorCSS(color) }} 
                          />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
                
                {/* Space type selection with ButtonGroup */}
                <div className="button-group">
                  <div className="button-group__container">
                    {/* Private button */}
                    <button
                      type="button"
                      onClick={() => setSelectedType('Private')}
                      className={`space-button button-group__button button-group__button--left h-[64px] ${
                        selectedType === 'Private' 
                          ? '' 
                          : 'bg-transparent'
                      }`}
                      style={selectedType === 'Private' ? { 
                        backgroundImage: 'var(--color-gradient-gray)' 
                      } : {}}
                    >
                      <div className="flex items-center justify-center gap-3 relative w-full h-full">
                        <div className="size-4 flex items-center justify-center shrink-0">
                          <Icon 
                            name="user" 
                            size={16} 
                            style={{ 
                              color: selectedType === 'Private' 
                                ? 'var(--color-deep-grey)' 
                                : 'var(--color-pebble-grey)' 
                            }} 
                          />
                        </div>
                        <span 
                          className={`font-sans text-[18px] font-semibold whitespace-nowrap ${
                            selectedType === 'Private' 
                              ? 'text-[var(--color-deep-grey)]' 
                              : 'text-[var(--color-pebble-grey)]'
                          }`}
                        >
                          Private
                        </span>
                      </div>
                    </button>
                    
                    {/* Shared button */}
                    <button
                      type="button"
                      onClick={() => setSelectedType('Shared')}
                      className={`space-button button-group__button button-group__button--right h-[64px] ${
                        selectedType === 'Shared'
                          ? ''
                          : 'bg-transparent'
                      }`}
                      style={selectedType === 'Shared' ? {
                        backgroundImage: 'var(--color-gradient-gray)'
                      } : {}}
                    >
                      <div className="flex items-center justify-center gap-3 relative w-full h-full">
                        <div className="size-4 flex items-center justify-center shrink-0">
                          <Icon
                            name="user-group"
                            size={16}
                            style={{
                              color: selectedType === 'Shared'
                                ? 'var(--color-deep-grey)'
                                : 'var(--color-pebble-grey)'
                            }}
                          />
                        </div>
                        <span
                          className={`font-sans text-[18px] font-semibold whitespace-nowrap ${
                            selectedType === 'Shared'
                              ? 'text-[var(--color-deep-grey)]'
                              : 'text-[var(--color-pebble-grey)]'
                          }`}
                        >
                          Shared
                        </span>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Selected Items - displayed above AddToSpaceSection */}
                {selectedItems.length > 0 && !isLoadingItems && (
                  <div className="w-full shrink-0 mb-3">
                    <div className="flex flex-col gap-2">
                      {selectedItems.map(itemId => {
                        const thread = allThreads.find(t => t.id === itemId);
                        const note = allNotes.find(n => n.id === itemId);
                        
                        if (thread) {
                          return (
                            <div key={thread.id} className="relative group">
                              <a 
                                href={`/${thread.id}`}
                                className="block"
                                aria-label={`View thread: ${thread.title || 'Untitled thread'}`}
                              >
                                {renderCompactThreadItem(thread)}
                              </a>
                              {/* Remove from selection button */}
                              <ActionButton
                                variant="Remove"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleItemSelect(thread.id, 'thread');
                                }}
                                className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center action-button-hover z-10"
                                disabled={isSubmitting}
                              />
                            </div>
                          );
                        } else if (note) {
                          return (
                            <div key={note.id} className="relative group">
                              <a 
                                href={`/${note.id}`}
                                className="block"
                                aria-label={`View note: ${note.title || 'Untitled note'}`}
                              >
                                {renderCompactNoteItem(note)}
                              </a>
                              {/* Remove from selection button */}
                              <ActionButton
                                variant="Remove"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleItemSelect(note.id, 'note');
                                }}
                                className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center action-button-hover z-10"
                                disabled={isSubmitting}
                              />
                            </div>
                          );
                        }
                        return null;
                      })}
                    </div>
                  </div>
                )}

                {/* AddToSpaceSection - replaces tabs */}
                <div className="w-full flex-1 min-h-0 flex flex-col">
                  {isLoadingItems ? (
                    <div className="panel__loading-state">
                      Loading items...
                    </div>
                  ) : (
                    <div className="flex-1 min-h-0">
                      <AddToSpaceSection
                        allNotes={allNotes}
                        allThreads={allThreads}
                        currentSpaceId={null}
                        onItemSelect={handleItemSelect}
                        selectedItems={selectedItems}
                        isLoading={isSubmitting}
                        placeholder="Search notes and threads"
                        emptyMessage="No items found"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom buttons */}
        <div className="panel__footer--buttons">
          {/* Create Space button */}
          <button 
            type="submit"
            disabled={isSubmitting || !title.trim()}
            data-outer-shadow
            className="btn-cta flex-1 group"
            tabIndex={3}
          >
            <span className="btn-cta__content">
              {isSubmitting ? 'Creating...' : 'Create Space'}
            </span>
            <div className="btn-cta__shadow" />
          </button>
        </div>
      </form>

      {/* Unsaved Changes Dialog */}
      <UnsavedChangesDialog
        isOpen={showUnsavedDialog}
        onCancel={() => {
          setShowUnsavedDialog(false);
          setPendingNavigation(null);
        }}
        onDiscard={handleDiscardChanges}
        onSaveAndClose={handleSaveAndClose}
      />
    </div>
  );
}


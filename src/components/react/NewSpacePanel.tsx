import React, { useState, useEffect, useRef } from 'react';
import { formatBadgeCount } from '@/utils/badge-count';
import { THREAD_COLORS, getThreadColorCSS, getThreadGradientCSS, getThreadTextColorCSS, type ThreadColor } from '@/utils/colors';
import SquareButton from './SquareButton';
import AddToSpaceSection from './AddToSpaceSection';
import {
  CondensedNoteRowLayout,
  condensedNoteRowIcon,
  getCondensedNoteAccentBarStyle,
  getCondensedNoteMeshGradient,
  getSolidThreadAccentBarStyle,
} from './CondensedNoteRowLayout';
import { captureException } from '@/utils/posthog';
import ActionButton from './ActionButton';
import { safeNavigate } from '@/utils/safe-navigate';
import { setSelectedSpaceId } from './navigation/selectedSpace';
import { idToUrl } from '@/utils/url-helpers';
import { safeURL } from '@/utils/safe-url';
import Icon from './Icon';
import { stripHtmlForPreview } from '@/utils/html-stripper';
import UnsavedChangesDialog from './dialogs/UnsavedChangesDialog';
import { createSpaceOffline } from '@/utils/offline-mutations';
import { usePersistedUserId } from '@/utils/user-id';
import { isNetworkError } from '@/utils/network';
import ThreadVisibilityDropdown from './ThreadVisibilityDropdown';

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

  // Detect standalone new-space page on desktop (check immediately, no effect needed)
  const wrapperRef = useRef<HTMLDivElement>(null);
  const floatingBtnRef = useRef<HTMLButtonElement>(null);
  const isDesktopPage = typeof window !== 'undefined' && window.innerWidth >= 1160 && !!document.querySelector('.main-column__body');


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
      if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('harvousSkipBeforeUnload') === 'upgrade') {
        return;
      }
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

    // Declare offline variable before try so it's accessible in the catch block
    let offlineSpaceId: string | null = null;

    try {
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('color', selectedColor);
      formData.append('isPublic', selectedType === 'Shared' ? 'true' : 'false');

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
            isPublic: selectedType === 'Shared',
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
              // Mark the new space as selected so PersistentNavigation filters correctly immediately.
              setSelectedSpaceId(result.space.id);

              // Register selected threads in navigation history scoped to the new space so they
              // appear in the space's persistent nav when the space page loads — without requiring
              // the user to open each thread manually first.
              if (selectedThreadIds.length > 0 && typeof (window as any).addToNavigationHistory === 'function') {
                selectedThreadIds.forEach((threadId: string) => {
                  const thread = allThreads.find(t => t.id === threadId);
                  if (thread) {
                    (window as any).addToNavigationHistory({
                      id: threadId,
                      title: thread.title || 'Thread',
                      count: (thread as any).count ?? 0,
                      backgroundGradient: (thread as any).backgroundGradient ?? 'var(--color-gradient-gray)',
                      spaceId: result.space.id,
                      openedInSpaceIds: [result.space.id],
                      openedInSpaceId: result.space.id,
                    });
                  }
                });
              }

              const redirectUrl = idToUrl(result.space.id);
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
        let errorJson: { error?: string; code?: string; upgradeUrl?: string } = {};

        try {
          errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorMessage;
        } catch (e) {
          console.error('NewSpacePanel: Could not parse error response');
        }

        // Shared space limit exceeded: show upgrade toast (Upgrade / Not now), do not close panel or navigate
        if (response.status === 403 && errorJson.code === 'SHARED_SPACE_LIMIT_EXCEEDED') {
          window.dispatchEvent(
            new CustomEvent('toast', {
              detail: {
                message: errorJson.error || errorMessage,
                type: 'error',
                code: 'SHARED_SPACE_LIMIT_EXCEEDED',
                upgradeUrl: errorJson.upgradeUrl || '/upgrade',
              },
            })
          );
          return;
        }

        // Check if offline save succeeded
        if (offlineSpaceId) {
          // Offline save succeeded - treat as success
          console.log('[NewSpacePanel] Server error but space saved offline, treating as success', { offlineSpaceId });
          // Don't show toast here - we redirect with ?toast= so toast-handler shows once
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
        // Don't show toast here - we redirect with ?toast= so toast-handler shows once
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

  // Render compact thread item (same row metrics as EditSpacePanel / AddToSpaceSection)
  const renderCompactThreadItem = (thread: Thread) => {
    const threadAccentColor = thread.color ? `var(--color-${thread.color})` : "var(--color-purple)";

    return (
      <div
        className="relative cursor-pointer"
        style={{
          position: 'relative',
          borderRadius: '0.75rem',
          width: '100%',
          textAlign: 'left',
          transition: 'transform 0.2s',
          cursor: 'pointer',
          overflow: 'hidden',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.002)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        <CondensedNoteRowLayout
          accentBarStyle={getSolidThreadAccentBarStyle(threadAccentColor)}
          icon={condensedNoteRowIcon({ itemType: 'thread' })}
          style={{ cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
              <div
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 700,
                  color: 'var(--color-deep-grey)',
                  fontSize: '16px',
                  lineHeight: 1.2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                }}
              >
                {thread.title || 'Untitled Thread'}
              </div>
              <span
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '12px',
                  fontWeight: 'normal',
                  color: 'var(--color-stone-grey)',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                {thread.isPublic === true ? 'Shared' : 'Private'}
              </span>
              {((thread.count !== undefined && thread.count !== null && thread.count > 0) ||
                (thread.noteCount !== undefined && thread.noteCount !== null && thread.noteCount > 0)) && (
                <div className="badge-count" style={{ flexShrink: 0 }}>
                  <span className="badge-number">{formatBadgeCount(thread.count ?? thread.noteCount)}</span>
                </div>
              )}
            </div>
          </div>
        </CondensedNoteRowLayout>
      </div>
    );
  };

  const renderCompactNoteItem = (note: Note) => {
    const noteType =
      note.noteType === 'resource' || note.noteType === 'scripture' ? note.noteType : 'default';
    const mesh = getCondensedNoteMeshGradient(
      (note as { threadColors?: { color: string; frequency: number }[] }).threadColors,
      note.id,
    );
    return (
      <div
        className="relative cursor-pointer"
        style={{
          position: 'relative',
          borderRadius: '0.75rem',
          width: '100%',
          textAlign: 'left',
          overflow: 'hidden',
          transition: 'transform 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.002)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        <CondensedNoteRowLayout
          accentBarStyle={getCondensedNoteAccentBarStyle(mesh)}
          icon={condensedNoteRowIcon({
            noteType: noteType as 'default' | 'scripture' | 'resource',
          })}
          style={{ cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: 'var(--font-sans)',
                fontWeight: 700,
                color: 'var(--color-deep-grey)',
                fontSize: '16px',
                lineHeight: 1.2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {note.title || 'Untitled Note'}
            </div>
          </div>
        </CondensedNoteRowLayout>
      </div>
    );
  };

  if (!isMounted) {
    return null;
  }

  return (
    <div ref={wrapperRef} className={`panel-wrapper ${inBottomSheet ? 'panel-wrapper--bottom-sheet' : ''}`}>
      {/* Form */}
      <form id="new-space-form" onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} className="form-layout">
        {/* Content area that expands to fill available space */}
        <div className="form-layout--expand" style={isDesktopPage ? { position: 'relative', overflow: 'hidden' } : { position: 'relative' }}>
          {/* Panel container */}
          <div className={`panel ${inBottomSheet ? 'panel--bottom-sheet' : ''} ${isLoadingItems ? 'opacity-60 pointer-events-none' : ''}`} style={isDesktopPage ? { overflow: 'hidden', marginBottom: 0 } : undefined}>
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
            <div className={`panel__body ${inBottomSheet ? 'panel__body--bottom-sheet' : ''} ${isDesktopPage ? 'panel__body--new-space-desktop' : ''}`}>
              <div className={`panel__content ${inBottomSheet ? 'panel__content--bottom-sheet' : ''} flex-1 min-h-0`}>
                <div className="panel__content-scroll">
                
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
                        <div className="absolute inset-0 flex-center">
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
                
                {/* Space visibility dropdown */}
                <ThreadVisibilityDropdown
                  isShared={selectedType === 'Shared'}
                  shareUrl={null}
                  onToggle={async (enabled) => {
                    setSelectedType(enabled ? 'Shared' : 'Private');
                  }}
                  isLoading={isSubmitting}
                  isEditMode={false}
                  privateTriggerLabel="Only I can see this space"
                  sharedTriggerLabel="Shared to anyone with link"
                  privateOptionLabel="Only I can see this space"
                  sharedOptionLabel="Share to anyone with link"
                  shareNotReadyLabel="Share link will be available after creating the space"
                />

                {/* Selected Items - displayed above AddToSpaceSection */}
                {selectedItems.length > 0 && !isLoadingItems && (
                  <div className="w-full shrink-0 mb-3">
                    <div className="flex-stack" style={{ gap: "0.5rem" }}>
                      {selectedItems.map((itemId, index) => {
                        const thread = allThreads.find(t => t.id === itemId);
                        const note = allNotes.find(n => n.id === itemId);
                        
                        if (thread) {
                          return (
                            <div key={thread.id} className="relative group card-enter" style={{ animationDelay: `${index * 50}ms` }}>
                              <a 
                                href={idToUrl(thread.id)}
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
                                className="absolute top-1/2 right-2 w-8 h-8 flex-center action-button-hover z-10 -translate-y-1/2"
                                disabled={isSubmitting}
                              />
                            </div>
                          );
                        } else if (note) {
                          return (
                            <div key={note.id} className="relative group card-enter" style={{ animationDelay: `${index * 50}ms` }}>
                              <a 
                                href={idToUrl(note.id)}
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
                                className="absolute top-1/2 right-2 w-8 h-8 flex-center action-button-hover z-10 -translate-y-1/2"
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

                {/* Search and add notes/threads */}
                <div className="w-full">
                  {isLoadingItems ? (
                    <div className="panel__loading-state">
                      Loading items...
                    </div>
                  ) : (
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
                  )}
                </div>

                {isDesktopPage && <div style={{ height: 64, flexShrink: 0, pointerEvents: 'none' }} />}

                </div>
              </div>
            </div>

            {/* Desktop: button inside .panel, absolutely positioned at bottom */}
            {isDesktopPage && (
              <button
                ref={floatingBtnRef}
                type="submit"
                disabled={isSubmitting}
                className="btn btn--lg btn--primary new-space-floating-button"
                tabIndex={3}
              >
                <div className="btn__content">
                  {isSubmitting ? 'Creating...' : 'Create space'}
                </div>
                <div className="btn__shadow-overlay" />
              </button>
            )}
          </div>
        </div>

        {/* Bottom buttons — inline in form on mobile/bottom-sheet */}
        {!isDesktopPage && (
          <div className="panel__footer--buttons">
            <button
              type="submit"
              disabled={isSubmitting || !title.trim()}
              data-outer-shadow
              className="btn-cta flex-1 group"
              tabIndex={3}
            >
              <span className="btn-cta__content">
                {isSubmitting ? 'Creating...' : 'Create space'}
              </span>
              <div className="btn-cta__shadow" />
            </button>
          </div>
        )}
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


import React, { useState, useEffect, useRef } from 'react';
import { THREAD_COLORS, getThreadColorCSS, getThreadGradientCSS, getThreadTextColorCSS, type ThreadColor } from '@/utils/colors';
import CardNote from '@/components/react/CardNote';
import SquareButton from './SquareButton';
import ActionButton from './ActionButton';
import AddToSpaceSection from './AddToSpaceSection';
import { captureException } from '@/utils/posthog';
import { safeNavigate } from '@/utils/safe-navigate';
import { idToUrl } from '@/utils/url-helpers';
import { safeFetch } from '@/utils/safe-fetch';
import Icon from './Icon';
import UnsavedChangesDialog from './dialogs/UnsavedChangesDialog';
import { stripHtmlForPreview } from '@/utils/html-stripper';
import { safeURL } from '@/utils/safe-url';
import { createThreadOffline } from '@/utils/offline-mutations';
import { usePersistedUserId } from '@/utils/user-id';
import { invalidateNoteDetailsCache } from '@/utils/note-details-cache';
import { invalidatePanelDataCache, PANEL_CACHE_KEYS } from '@/utils/panel-data-cache';
import { isNetworkError } from '@/utils/network';
import { useNewThreadPanelContext } from './contexts/NewThreadPanelContext';
import ThreadVisibilityDropdown from './ThreadVisibilityDropdown';

interface Note {
  id: string;
  title: string | null;
  content: string;
  spaceId: string | null;
  noteType?: 'default' | 'scripture' | 'resource';
  [key: string]: unknown;
}

interface CurrentSpace {
  id: string;
  title?: string;
  backgroundGradient?: string;
  color?: string;
}

interface NewThreadPanelProps {
  currentSpace?: CurrentSpace | null;
  onClose?: () => void;
  onThreadCreated?: () => void;
  // Edit mode props
  threadId?: string;
  initialTitle?: string;
  initialColor?: ThreadColor;
  // Optional: automatically add this note to the newly created thread
  noteIdToAdd?: string;
  // Optional: initial notes fetched in Astro (for better performance)
  initialNotes?: Note[];
  // Optional: show Back button instead of Close button
  useBackButton?: boolean;
  // Bottom sheet integration
  inBottomSheet?: boolean;
  registerSheetCloseHandler?: ((handler: (reason: 'dismiss' | 'escape' | 'button') => boolean | Promise<boolean>) => void) | null;
  // Lifecycle callback
  onPanelReady?: () => void;
}

export default function NewThreadPanel({
  currentSpace,
  onClose,
  onThreadCreated,
  threadId,
  initialTitle,
  initialColor,
  noteIdToAdd,
  initialNotes,
  useBackButton = false,
  inBottomSheet = false,
  registerSheetCloseHandler = null,
  onPanelReady,
}: NewThreadPanelProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Call onPanelReady when panel is mounted and form is ready
  useEffect(() => {
    if (isMounted && onPanelReady) {
      onPanelReady();
    }
  }, [isMounted, onPanelReady]);

  const userId = usePersistedUserId();
  
  // Detect edit mode
  const isEditMode = !!threadId;
  
  // Consume shared state from context (for persistence across desktop/mobile)
  // Only use context in create mode - edit mode uses local state
  const context = useNewThreadPanelContext();
  
  // Local state for edit mode (shouldn't affect shared context)
  const [editTitle, setEditTitle] = useState('');
  const [editSelectedColor, setEditSelectedColor] = useState<ThreadColor>('paper');
  const [editSelectedType, setEditSelectedType] = useState('Private');
  const [editAddToSpace, setEditAddToSpace] = useState(false);
  
  // Use context state for create mode, local state for edit mode
  const title = isEditMode ? editTitle : context.title;
  const setTitle = isEditMode ? setEditTitle : context.setTitle;
  const selectedColor = isEditMode ? editSelectedColor : context.selectedColor;
  const setSelectedColor = isEditMode ? setEditSelectedColor : context.setSelectedColor;
  const selectedType = isEditMode ? editSelectedType : context.selectedType;
  const setSelectedType = isEditMode ? setEditSelectedType : context.setSelectedType;
  const addToSpace = isEditMode ? editAddToSpace : context.addToSpace;
  const setAddToSpace = isEditMode ? setEditAddToSpace : context.setAddToSpace;
  const selectedItems = isEditMode ? [] : context.selectedItems; // Edit mode doesn't use selectedItems
  const setSelectedItems = isEditMode ? () => {} : context.setSelectedItems;
  const allNotes = isEditMode ? [] : context.allNotes; // Edit mode doesn't use allNotes
  const setAllNotes = isEditMode ? () => {} : context.setAllNotes;
  
  // Local state for UI-only concerns
  // Tab navigation disabled for v1
  // const [activeTab, setActiveTab] = useState('recent');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  // const [recentNotes, setRecentNotes] = useState<any[]>([]);
  // const [isLoadingNotes, setIsLoadingNotes] = useState(false);
  const [isLoadingItems, setIsLoadingItems] = useState(!initialNotes); // No loading if we have initial data
  // Shared functionality disabled for now
  // const [isShared, setIsShared] = useState(false);
  // const [sharedSettings, setSharedSettings] = useState({
  //   allowComments: true,
  //   allowReactions: true,
  //   visibility: 'space' // 'space', 'public', 'invite-only'
  // });

  // Ref for auto-focusing the thread name input
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Handle edit mode - set local state from initial data (edit mode only)
  useEffect(() => {
    if (isEditMode) {
      // Edit mode: use initial data in local state
      setEditTitle(initialTitle || '');
      setEditSelectedColor(initialColor || 'paper');
      setEditSelectedType('Private'); // Always private for now
      // Tab navigation disabled for v1
      // setActiveTab('recent');
    }
    // Create mode: context already loaded from localStorage on mount
  }, [isEditMode, initialTitle, initialColor]);

  // Initialize space checkbox when currentSpace is provided (create mode only)
  useEffect(() => {
    if (!isEditMode && currentSpace && currentSpace.id) {
      setAddToSpace(true);
    }
  }, [currentSpace, isEditMode, setAddToSpace]);

  // Tab navigation disabled for v1
  // useEffect(() => {
  //   if (!isEditMode) {
  //     localStorage.setItem('newThreadActiveTab', activeTab);
  //   }
  // }, [activeTab, isEditMode]);

  // Fetch recent notes when component mounts or tab changes to recent
  // useEffect(() => {
  //   if (activeTab === 'recent') {
  //     fetchRecentNotes();
  //   }
  // }, [activeTab]);

  // Fetch all notes on mount (create mode only) if no initialNotes provided
  useEffect(() => {
    if (!isEditMode && !initialNotes) {
      // Check if context already has notes (from previous panel mount)
      if (allNotes.length > 0) {
        setIsLoadingItems(false);
        return;
      }
      
      // No initial data provided, fetch from API (backward compatibility)
      const fetchItems = async () => {
        setIsLoadingItems(true);
        try {
          // Use safeFetch with retry logic for resilient API calls
          const response = await safeFetch('/api/spaces/items', {
            retries: 2,
            retryDelay: 1000
          });
          
          if (response && response.ok) {
            const data = await response.json();
            setAllNotes(data.notes || []);
          } else {
            // Failed to fetch - safeFetch handles logging
            setAllNotes([]);
          }
        } catch (error) {
          // Unexpected error
          captureException(error as Error);
          setAllNotes([]);
        } finally {
          setIsLoadingItems(false);
        }
      };

      fetchItems();
    } else if (!isEditMode && initialNotes) {
      // We have initial data from Astro, use it
      setAllNotes(initialNotes);
      setIsLoadingItems(false);
    }
  }, [isEditMode, initialNotes, allNotes.length, setAllNotes]);

  // Auto-focus the thread name input when component mounts
  useEffect(() => {
    // Small delay to ensure the input is rendered and visible
    const timer = setTimeout(() => {
      if (titleInputRef.current) {
        titleInputRef.current.focus();
      }
    }, 100);

    return () => clearTimeout(timer);
  }, []);


  // Tab navigation disabled for v1
  // const fetchRecentNotes = async () => {
  //   setIsLoadingNotes(true);
  //   try {
  //     const response = await fetch('/api/notes/recent');
  //     if (response.ok) {
  //       const notes = await response.json();
  //       setRecentNotes(notes);
  //     } else {
  //       console.error('Failed to fetch recent notes');
  //       setRecentNotes([]);
  //     }
  //   } catch (error) {
  //     console.error('Error fetching recent notes:', error);
  //     setRecentNotes([]);
  //   } finally {
  //     setIsLoadingNotes(false);
  //   }
  // };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('color', selectedColor);
      formData.append('isPublic', selectedType === 'Shared' ? 'true' : 'false');

      if (isEditMode) {
        formData.append('threadId', threadId!);
        
        const response = await fetch('/api/threads/update', {
          method: 'POST',
          body: formData,
          credentials: 'include'
        });

        if (response.ok) {
          const result = await response.json();
          
          // Close panel
          window.dispatchEvent(new CustomEvent('closeEditThreadPanel'));
          
          if (onClose) {
            onClose();
          }
          
          // Navigate to show updated thread with URL-based toast using View Transitions
          const currentUrl = safeURL(window.location.href);
          if (currentUrl) {
            currentUrl.searchParams.set('toast', 'success');
            currentUrl.searchParams.set('message', encodeURIComponent('Thread updated!'));
            safeNavigate(currentUrl.pathname + currentUrl.search, { history: 'replace' });
          }
        } else {
          const errorText = await response.text();
          console.error('NewThreadPanel: API error response:', errorText);
          throw new Error(`Failed to update thread: ${response.status}`);
        }
      } else {
        // Create mode
        // Only add spaceId if checkbox is checked and currentSpace exists
        if (addToSpace && currentSpace && currentSpace.id) {
          formData.append('spaceId', currentSpace.id);
        }
        
        // Add selected notes
        const selectedNoteIds: string[] = [];
        
        // Filter selected items to only include notes
        selectedItems.forEach(itemId => {
          const isNote = allNotes.some(note => note.id === itemId);
          if (isNote) {
            selectedNoteIds.push(itemId);
          }
        });
        
        if (selectedNoteIds.length > 0) {
          formData.append('selectedNoteIds', JSON.stringify(selectedNoteIds));
        }
        
        // OFFLINE-AWARE: Mutually exclusive paths — offline saves to IndexedDB only,
        // online goes to server only. No dual-path to avoid duplicates.
        const isOffline = !navigator.onLine;

        if (isOffline) {
          if (!userId) {
            if (window.toast) {
              window.toast.error('Sign in while online first to enable offline mode.');
            }
            setIsSubmitting(false);
            return;
          }

          try {
            const offlineThreadId = await createThreadOffline(userId, {
              title: title.trim(),
              color: selectedColor,
              spaceId: addToSpace && currentSpace?.id ? currentSpace.id : undefined,
              isPublic: selectedType === 'Shared',
            });

            if (window.toast) {
              window.toast.success('Thread saved offline. It will sync when you\'re back online.');
            }

            window.dispatchEvent(new CustomEvent('threadCreated', {
              detail: {
                thread: {
                  id: offlineThreadId,
                  title: title.trim(),
                  color: selectedColor,
                  spaceId: addToSpace && currentSpace?.id ? currentSpace.id : null,
                  noteCount: 0,
                },
                threadId: offlineThreadId,
                spaceId: addToSpace && currentSpace?.id ? currentSpace.id : null,
                isOffline: true
              }
            }));

            context.resetForm();
            context.clearLocalStorage();

            if (!useBackButton) {
              window.dispatchEvent(new CustomEvent('closeNewThreadPanel'));
            }
            if (onClose) {
              onClose();
            }

            setIsSubmitting(false);
            return;
          } catch (err) {
            console.error('[NewThreadPanel] Failed to create thread offline:', err);
            if (window.toast) {
              window.toast.error('Failed to save thread offline.');
            }
            setIsSubmitting(false);
            return;
          }
        }

        // ONLINE PATH: Server is the single source of truth
        let response: Response | null = null;

        try {
          response = await fetch('/api/threads/create', {
            method: 'POST',
            body: formData,
            credentials: 'include'
          });
        } catch (error) {
          // Network error — try offline fallback
          if (isNetworkError(error) && userId) {
            try {
              const offlineThreadId = await createThreadOffline(userId, {
                title: title.trim(),
                color: selectedColor,
                spaceId: addToSpace && currentSpace?.id ? currentSpace.id : undefined,
                isPublic: selectedType === 'Shared',
              });

              if (window.toast) {
                window.toast.success('Thread saved offline. It will sync when you\'re back online.');
              }

              window.dispatchEvent(new CustomEvent('threadCreated', {
                detail: {
                  thread: {
                    id: offlineThreadId,
                    title: title.trim(),
                    color: selectedColor,
                    spaceId: addToSpace && currentSpace?.id ? currentSpace.id : null,
                    noteCount: 0,
                  },
                  threadId: offlineThreadId,
                  spaceId: addToSpace && currentSpace?.id ? currentSpace.id : null,
                  isOffline: true
                }
              }));

              context.resetForm();
              context.clearLocalStorage();
              if (!useBackButton) {
                window.dispatchEvent(new CustomEvent('closeNewThreadPanel'));
              }
              if (onClose) onClose();
              setIsSubmitting(false);
              return;
            } catch (offlineErr) {
              console.error('[NewThreadPanel] Offline fallback failed:', offlineErr);
            }
          }
          throw error;
        }

        if (response && response.ok) {
          const result = await response.json();
          
          // Clear form data using context
          context.resetForm();
          context.clearLocalStorage();
          // Tab navigation disabled for v1
          // setActiveTab('recent');
          
          // Dispatch event to notify other components
          // Immediately update localStorage synchronously (don't wait for React)
          try {
            // Convert thread color to background gradient
            const threadColor = result.thread.color || 'blue';
            const backgroundGradient = getThreadGradientCSS(threadColor);
            
            const threadItem = {
              id: result.thread.id,
              title: result.thread.title,
              count: result.thread.noteCount || 0,
              backgroundGradient: backgroundGradient,
              firstAccessed: Date.now(),
              lastAccessed: Date.now()
            };
            
            const navHistory = localStorage.getItem('harvous-navigation-history-v2');
            const history = navHistory ? JSON.parse(navHistory) : [];
            
            // Check if item already exists
            const existingIndex = history.findIndex((h: any) => h.id === threadItem.id);
            if (existingIndex === -1) {
              history.push(threadItem);
              history.sort((a: any, b: any) => a.firstAccessed - b.firstAccessed);
              localStorage.setItem('harvous-navigation-history-v2', JSON.stringify(history));
            }
          } catch (error) {
            console.error('Error updating navigation history:', error);
          }

          // Store thread creation info in sessionStorage for client-side refresh
          const threadSpaceId = result.thread?.spaceId || (currentSpace?.id || null);
          if (result.thread && result.thread.id) {
            try {
              const threadCreationInfo = {
                threadId: result.thread.id,
                spaceId: threadSpaceId,
                timestamp: Date.now()
              };
              const recentThreads = JSON.parse(sessionStorage.getItem('recentlyCreatedThreads') || '[]');
              recentThreads.push(threadCreationInfo);
              // Keep only threads from last 10 seconds
              const tenSecondsAgo = Date.now() - 10000;
              const filtered = recentThreads.filter((t: any) => t.timestamp > tenSecondsAgo);
              sessionStorage.setItem('recentlyCreatedThreads', JSON.stringify(filtered));
            } catch (error) {
              console.error('[NewThreadPanel] Failed to store thread creation info:', error);
            }
          }

          // Use document (NavigationContext listens on document)
          document.dispatchEvent(new CustomEvent('threadCreated', {
            detail: { 
              thread: result.thread,
              threadId: result.thread?.id,
              spaceId: threadSpaceId // Include spaceId if thread was created in a space
            }
          }));

          // If noteIdToAdd is provided, add the note to the newly created thread
          if (noteIdToAdd && result.thread && result.thread.id) {
            try {
              const addNoteResponse = await fetch(`/api/notes/${noteIdToAdd}/add-thread`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ threadId: result.thread.id }),
                credentials: 'include'
              });
              
              if (addNoteResponse.ok) {
                invalidateNoteDetailsCache(noteIdToAdd);
                // Dispatch noteAddedToThread event so UI updates
                window.dispatchEvent(new CustomEvent('noteAddedToThread', {
                  detail: { noteId: noteIdToAdd, threadId: result.thread.id }
                }));
                invalidatePanelDataCache(PANEL_CACHE_KEYS.subscription);
              }
            } catch (error) {
              console.error('Error adding note to newly created thread:', error);
              // Don't fail the thread creation if adding the note fails
            }
          }

          // If onThreadCreated callback is provided, use it instead of redirecting
          if (onThreadCreated) {
            // Call the callback (it will handle closing the panel and refreshing)
            onThreadCreated();
          } else {
            // Default behavior: redirect to the newly created thread
            // Close panel - only dispatch event if not using back button
            if (!useBackButton) {
              window.dispatchEvent(new CustomEvent('closeNewThreadPanel'));
            }
            // Default behavior: redirect to the newly created thread
            if (onClose) {
              onClose();
            }

            // Redirect to the newly created thread
            if (result.thread && result.thread.id) {
              const redirectUrl = idToUrl(result.thread.id);
              // Add a small delay to ensure localStorage is updated before navigation
              setTimeout(() => {
                safeNavigate(redirectUrl, { history: 'replace' });
              }, 50);
            }
          }
        } else {
          const errorText = await response.text();
          let errorMessage = `Failed to create thread: ${response.status}`;

          try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.error || errorMessage;
          } catch (e) {
            console.error('NewThreadPanel: Could not parse error response');
          }

          throw new Error(errorMessage);
        }
      }
    } catch (error: any) {
      if (typeof window !== 'undefined' && window.posthog) {
        captureException(error, {
          context: 'thread_creation',
          endpoint: '/api/threads/create',
        });
      }

      console.error('NewThreadPanel: Error:', error);
      const errorMessage = error instanceof Error ? error.message : `Failed to ${isEditMode ? 'update' : 'create'} thread. Please try again.`;
      if (window.toast) {
        window.toast.error(errorMessage);
      } else {
        alert(errorMessage);
      }
    } finally {
      // Use setTimeout to ensure state update happens after any pending operations
      setTimeout(() => {
        setIsSubmitting(false);
      }, 0);
    }
  };

  const handleClose = () => {
    if (title.trim() || selectedItems.length > 0) {
      setShowUnsavedDialog(true);
    } else {
      // Only dispatch close event if not using back button (i.e., not inside another panel)
      // When useBackButton is true, we're inside NoteDetailsPanel and should only use onClose callback
      if (!useBackButton) {
        window.dispatchEvent(new CustomEvent('closeNewThreadPanel'));
      }
      
      if (onClose) {
        onClose();
      }
    }
  };

  // Allow the bottom sheet to ask whether this panel can dismiss.
  // Threads should keep the existing unsaved-changes prompt behavior.
  useEffect(() => {
    if (!registerSheetCloseHandler) return;

    registerSheetCloseHandler((reason) => {
      // Treat dismiss/escape the same as pressing Close.
      if (title.trim() || selectedItems.length > 0) {
        setShowUnsavedDialog(true);
        return false;
      }
      return true;
    });
  }, [registerSheetCloseHandler, title, selectedItems.length]);

  const handleDiscardChanges = () => {
    if (isEditMode) {
      // Edit mode: reset local state
      setEditTitle('');
      setEditSelectedColor('paper');
      setEditSelectedType('Private');
    } else {
      // Create mode: Use context's resetForm which handles both state and localStorage
      context.resetForm();
    }
    // Tab navigation disabled for v1
    // setActiveTab('recent');
    setShowUnsavedDialog(false);
    
    // Only dispatch close event if not using back button (i.e., not inside another panel)
    // When useBackButton is true, we're inside NoteDetailsPanel and should only use onClose callback
    if (!useBackButton) {
      window.dispatchEvent(new CustomEvent('closeNewThreadPanel'));
    }
    
    if (onClose) {
      onClose();
    }
  };

  const handleSaveAndClose = () => {
    setShowUnsavedDialog(false);
    // Trigger form submission
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
      if (form && !isSubmitting) {
        form.requestSubmit();
      }
    }
  };

  // Handle title keydown for auto-capitalize and select all
  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Handle Select All (Cmd+A on Mac, Ctrl+A on Windows/Linux)
    if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
      e.preventDefault();
      e.currentTarget.select();
      return;
    }
    
    // Auto-capitalize first letter
    const input = e.currentTarget;
    if (input.selectionStart === 0 && input.selectionEnd === 0) {
      // Cursor is at the start
      if (e.key.length === 1 && /^[a-z]$/.test(e.key)) {
        e.preventDefault();
        const capitalized = e.key.toUpperCase();
        if (title.length === 0) {
          setTitle(capitalized);
        } else {
          setTitle(capitalized + title);
        }
        // Set cursor position after the capitalized letter
        setTimeout(() => {
          input.setSelectionRange(1, 1);
        }, 0);
      }
    }
  };

  // Use centralized stripHtml utility
  const stripHtml = (html: string): string => stripHtmlForPreview(html, 150);

  if (!isMounted) {
    return null;
  }

  return (
    <div className="panel-wrapper panel-wrapper--bottom-sheet w-full">
      {/* Form */}
      <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} className="form-layout">
        {/* Content area that expands to fill available space */}
        <div className="form-layout--expand" style={{ position: 'relative' }}>
          {/* Panel container */}
          <div className={`panel panel--bottom-sheet ${isLoadingItems ? 'opacity-60 pointer-events-none' : ''}`}>
            {/* Header section with thread name input */}
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
                  onKeyDown={handleTitleKeyDown}
                  placeholder="Thread name"
                  className="w-full bg-transparent border-none text-[24px] font-bold focus:outline-none text-center placeholder:text-[var(--color-pebble-grey)]"
                  style={{ 
                    color: getThreadTextColorCSS(selectedColor),
                    fontFamily: 'var(--font-roundo)',
                    fontWeight: 600 /* Semi-bold */
                  }}
                />
              </div>
            </div>
            
            {/* Content area */}
            <div className="panel__body panel__body--bottom-sheet">
              <div className="panel__content panel__content--bottom-sheet flex-1 min-h-0">
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
                
                {/* Space Checkbox - Only show when currentSpace is provided (create mode only) */}
                {!isEditMode && currentSpace && currentSpace.id && (
                  <div className="w-full">
                    <button
                      type="button"
                      onClick={() => setAddToSpace(!addToSpace)}
                      className="space-button relative rounded-3xl h-[64px] cursor-pointer transition-[scale,shadow] duration-200 pl-4 pr-0 w-full"
                      style={{ 
                        backgroundImage: addToSpace 
                          ? (currentSpace.backgroundGradient || getThreadGradientCSS(currentSpace.color || 'paper'))
                          : 'var(--color-gradient-gray)'
                      }}
                    >
                      <div className="flex-between relative w-full h-full pl-2 pr-0 transition-transform duration-125">
                        <span 
                          className="font-sans text-[18px] font-semibold whitespace-nowrap"
                          style={{ 
                            color: addToSpace 
                              ? getThreadTextColorCSS(currentSpace.color || 'paper')
                              : 'var(--color-deep-grey)'
                          }}
                        >
                          Add to {currentSpace.title}
                        </span>
                        {addToSpace && (
                          <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
                            <Icon 
                              name="check"
                              size={20}
                              style={{ color: getThreadTextColorCSS(currentSpace.color || 'paper') }}
                            />
                          </div>
                        )}
                      </div>
                    </button>
                  </div>
                )}
                
                {/* Thread visibility dropdown */}
                <ThreadVisibilityDropdown
                  isShared={selectedType === 'Shared'}
                  shareUrl={null}
                  onToggle={async (enabled) => {
                    setSelectedType(enabled ? 'Shared' : 'Private');
                  }}
                  isLoading={isSubmitting}
                  isEditMode={false}
                />

                {/* Selected Notes - displayed above AddToSpaceSection (create mode only) */}
                {!isEditMode && selectedItems.length > 0 && !isLoadingItems && (
                  <div className="w-full shrink-0 mb-3">
                    <div className="panel__item-list">
                      {selectedItems.map((itemId, index) => {
                        const note = allNotes.find(n => n.id === itemId);
                        
                        if (note) {
                          return (
                            <div key={note.id} className="panel__item-list-item card-enter" style={{ animationDelay: `${index * 50}ms` }}>
                              <a 
                                href={idToUrl(note.id)}
                                className="panel__item-list-item-link"
                                aria-label={`View note: ${note.title || 'Untitled note'}`}
                              >
                                <CardNote
                                  title={note.noteType === 'resource' && note.resourceTitle ? (note.resourceTitle as string) : (note.title || "Untitled Note")}
                                  content={note.noteType === 'resource' && note.resourceDescription ? (note.resourceDescription as string) : stripHtml(note.content)}
                                  noteType={(note.noteType as 'default' | 'scripture' | 'resource' | undefined) || 'default'}
                                  resourceTitle={note.noteType === 'resource' ? ((note.resourceTitle as string) || null) : undefined}
                                  resourceDescription={note.noteType === 'resource' ? ((note.resourceDescription as string) || null) : undefined}
                                  resourceImage={note.noteType === 'resource' ? ((note.resourceImage as string) || null) : undefined}
                                />
                              </a>
                              {/* Remove from selection button */}
                              <ActionButton
                                variant="Remove"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleItemSelect(note.id, 'note');
                                }}
                                className="panel__item-list-item-actions"
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

                {/* AddToSpaceSection - for selecting notes to add to thread (create mode only) */}
                {!isEditMode && (
                  <div className="w-full flex-fill flex-stack" style={{ gap: 0 }}>
                    {isLoadingItems ? (
                      <div className="panel__loading-state">
                        Loading notes...
                      </div>
                    ) : (
                      <div className="flex-1 min-h-0">
                        <AddToSpaceSection
                          allNotes={allNotes}
                          allThreads={[]}
                          currentSpaceId={null}
                          onItemSelect={handleItemSelect}
                          selectedItems={selectedItems}
                          isLoading={isSubmitting}
                          placeholder="Search notes"
                          emptyMessage="No notes found"
                          itemsToShow="notes"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Tab navigation disabled for v1 */}
                {/* <div className="w-full">
                  <div className="flex-stack">
                    <div className="tab-nav-container">
                      <div className="flex-row" style={{ gap: 0, justifyContent: "flex-start" pb-0 pt-1 px-1 relative w-full">
                        <button
                          type="button"
                          className={`flex gap-2 h-11 items-center justify-center overflow-clip px-2 py-3 relative shrink-0 transition-all duration-200 ${
                            activeTab === 'recent' ? 'opacity-100' : 'opacity-50 hover:opacity-75'
                          }`}
                          onClick={() => setActiveTab('recent')}
                        >
                          <span className="font-sans font-semibold text-[14px] leading-[0] relative shrink-0 text-nowrap text-[#4a473d]">
                            Recent
                          </span>
                          {activeTab === 'recent' && (
                            <div className="absolute bottom-0 left-1/2 translate-x-[-50%] w-1 h-1">
                              <div className="w-1 h-1 bg-[#4a473d] rounded-full"></div>
                            </div>
                          )}
                        </button>
                        <button
                          type="button"
                          className={`flex gap-2 h-11 items-center justify-center overflow-clip px-2 py-3 relative shrink-0 transition-all duration-200 ${
                            activeTab === 'search' ? 'opacity-100' : 'opacity-50 hover:opacity-75'
                          }`}
                          onClick={() => setActiveTab('search')}
                        >
                          <span className="font-sans font-semibold text-[14px] leading-[0] relative shrink-0 text-nowrap text-[#4a473d]">
                            Search
                          </span>
                          {activeTab === 'search' && (
                            <div className="absolute bottom-0 left-1/2 translate-x-[-50%] w-1 h-1">
                              <div className="w-1 h-1 bg-[#4a473d] rounded-full"></div>
                            </div>
                          )}
                        </button>
                      </div>
                    </div>
                    
                    <div className="tab-content">
                      {activeTab === 'recent' && (
                        <div className="space-y-4">
                          {isLoadingNotes ? (
                            <div className="text-center py-8" style={{ color: 'var(--color-pebble-grey)' }}>
                              Loading recent notes...
                            </div>
                          ) : recentNotes.length > 0 ? (
                            <div className="grid grid-cols-1 gap-4">
                              {recentNotes.map((note) => (
                                <CardNote
                                  key={note.id}
                                  title={note.noteType === 'resource' && note.resourceTitle ? note.resourceTitle : note.title}
                                  content={note.noteType === 'resource' && note.resourceDescription ? note.resourceDescription : note.content}
                                  noteType={(note.noteType as 'default' | 'scripture' | 'resource' | undefined) || 'default'}
                                  resourceTitle={note.noteType === 'resource' ? (note.resourceTitle || null) : undefined}
                                  resourceDescription={note.noteType === 'resource' ? (note.resourceDescription || null) : undefined}
                                  resourceImage={note.noteType === 'resource' ? (note.resourceImage || null) : undefined}
                                  onClick={() => {
                                    safeNavigate(idToUrl(note.id), { history: 'replace' });
                                  }}
                                />
                              ))}
                            </div>
                          ) : (
                            <div className="text-center py-8" style={{ color: 'var(--color-pebble-grey)' }}>
                              No recent notes found
                            </div>
                          )}
                        </div>
                      )}
                      {activeTab === 'search' && (
                        <div className="text-center py-8" style={{ color: 'var(--color-pebble-grey)' }}>
                          Search functionality will be here
                        </div>
                      )}
                    </div>
                  </div>
                </div> */}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom buttons */}
        <div className="panel__footer--buttons">
          {/* Back or Close button - conditionally render based on useBackButton prop */}
          {inBottomSheet ? null : (
            <SquareButton variant="Back" onClick={handleClose} inBottomSheet={inBottomSheet} />
          )}
          
          {/* Create Thread button - Button Default variant */}
          <button 
            type="submit"
            disabled={isSubmitting}
            data-outer-shadow
            className="btn-cta flex-1 group"
            tabIndex={3}
          >
            <span className="btn-cta__content">
              {isSubmitting ? 'Creating...' : 'Create Thread'}
            </span>
            <div className="btn-cta__shadow" />
          </button>
        </div>
      </form>

      {/* Unsaved Changes Dialog */}
      <UnsavedChangesDialog
        isOpen={showUnsavedDialog}
        onCancel={() => setShowUnsavedDialog(false)}
        onDiscard={handleDiscardChanges}
        onSaveAndClose={handleSaveAndClose}
      />
    </div>
  );
}

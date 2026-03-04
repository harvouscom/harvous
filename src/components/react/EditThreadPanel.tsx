import React, { useState, useEffect, useRef, useCallback } from 'react';
import { THREAD_COLORS, getThreadColorCSS, getThreadGradientCSS, getThreadTextColorCSS, type ThreadColor } from '@/utils/colors';
import SquareButton from './SquareButton';
import ActionButton from './ActionButton';
import AddToSpaceSection from './AddToSpaceSection';
import { safeNavigate } from '@/utils/safe-navigate';
import { safeFetch } from '@/utils/safe-fetch';
import { captureException } from '@/utils/posthog';
import { stripHtmlForPreview } from '@/utils/html-stripper';
import Icon from './Icon';
import { safeURL } from '@/utils/safe-url';
import { idToUrl } from '@/utils/url-helpers';
import { updateThreadOffline } from '@/utils/offline-mutations';
import { usePersistedUserId } from '@/utils/user-id';
import { isNetworkError } from '@/utils/network';
import ThreadVisibilityDropdown from './ThreadVisibilityDropdown';
import UnsavedChangesDialog from './dialogs/UnsavedChangesDialog';
import TabNav from './TabNav';
import { invalidatePanelDataCache, PANEL_CACHE_KEYS } from '@/utils/panel-data-cache';

interface Note {
  id: string;
  title: string | null;
  content: string;
  spaceId: string | null;
  noteType?: string;
  userId?: string;
  [key: string]: any;
}

interface EditThreadPanelProps {
  threadId: string;
  initialTitle?: string;
  initialColor?: ThreadColor;
  onClose?: () => void;
  inBottomSheet?: boolean;
}

export default function EditThreadPanel({ 
  threadId,
  initialTitle = '', 
  initialColor = 'paper',
  onClose,
  inBottomSheet = false
}: EditThreadPanelProps) {
  const [isMounted, setIsMounted] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

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

  const userId = usePersistedUserId();
  const [formData, setFormData] = useState({
    title: initialTitle,
    selectedColor: initialColor,
    selectedType: 'Private'
  });
  
  // Track initial values for unsaved changes detection
  const [initialValues, setInitialValues] = useState({
    title: initialTitle,
    color: initialColor,
    isShared: false
  });
  
  // Auto-save state
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);

  // Tab navigation
  const [activeTab, setActiveTab] = useState<'added' | 'all'>('added');

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [currentThreadNoteIds, setCurrentThreadNoteIds] = useState<string[]>([]);
  const [currentThreadNotes, setCurrentThreadNotes] = useState<Note[]>([]);
  const [isRemovingNote, setIsRemovingNote] = useState(false);
  const [referencedScriptureNoteIds, setReferencedScriptureNoteIds] = useState<Set<string>>(new Set());
  
  // Track notes being removed optimistically to prevent double-removal
  const pendingRemovalsRef = useRef<Set<string>>(new Set());
  // Track scripture notes being removed to prevent them from being re-added during refresh
  const removingScriptureNotesRef = useRef<Set<string>>(new Set());
  // Track notes that have been successfully removed and should never be re-added
  // Use state instead of ref to ensure React re-renders when notes are removed
  const [removedNoteIds, setRemovedNoteIds] = useState<Set<string>>(new Set());
  // Keep a ref version for use in callbacks/effects that need current value
  const removedNoteIdsRef = useRef<Set<string>>(new Set());
  // Track previous threadId to detect actual changes
  const previousThreadIdRef = useRef<string | null>(null);
  
  // Keep ref in sync with state for use in callbacks
  useEffect(() => {
    removedNoteIdsRef.current = removedNoteIds;
  }, [removedNoteIds]);
  
  // Track button clicks to prevent link navigation
  const buttonClickRef = useRef<string | null>(null);

  // Share settings state
  const [isShared, setIsShared] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  
  // Refs to track current values for save functions (avoid stale closures)
  // Must be declared after isShared state
  const formDataRef = useRef(formData);
  const isSharedRef = useRef(isShared);
  
  // Refs to track pending saves and debounce timers
  const pendingTitleSaveRef = useRef<string | null>(null);
  const pendingColorSaveRef = useRef<ThreadColor | null>(null);
  const titleDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const notesDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const activeSaveOperationsRef = useRef<Set<string>>(new Set());
  // Track if we've fetched thread data to prevent props from overwriting it
  const hasFetchedThreadDataRef = useRef(false);
  // Track last fetched threadId to avoid refetching unnecessarily
  const lastFetchedThreadIdRef = useRef<string | null>(null);
  
  // Update refs when values change
  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);
  
  useEffect(() => {
    isSharedRef.current = isShared;
  }, [isShared]);
  


  // Fetch all notes and current thread notes on mount
  useEffect(() => {
    // Only clear removedNoteIds when threadId actually changes (new thread context)
    if (previousThreadIdRef.current !== threadId) {
      setRemovedNoteIds(new Set());
      previousThreadIdRef.current = threadId;
    }
    
    const fetchData = async () => {
      setIsLoadingItems(true);
      try {
        // Fetch all notes and thread notes in parallel with retry logic
        const [notesResponse, threadNotesResponse] = await Promise.all([
          safeFetch('/api/spaces/items', { retries: 2, retryDelay: 1000 }),
          safeFetch(`/api/threads/${threadId}/notes?limit=50`, { retries: 2, retryDelay: 1000 })
        ]);
        
        // Handle all notes response
        if (notesResponse && notesResponse.ok) {
          const notesData = await notesResponse.json();
          setAllNotes(notesData.notes || []);
        } else {
          // Failed to fetch - safeFetch handles logging
          setAllNotes([]);
        }

        // Handle thread notes response
        if (threadNotesResponse && threadNotesResponse.ok) {
          const threadNotesData = await threadNotesResponse.json();
          const notes = threadNotesData.notes || [];
          // Filter out notes that have been removed
          const filteredNotes = notes.filter((note: Note) => !removedNoteIds.has(note.id));
          const noteIds = filteredNotes.map((note: Note) => note.id);
          setCurrentThreadNoteIds(noteIds);
          setCurrentThreadNotes(filteredNotes);
          
          // Fetch scripture notes referenced by default notes in this thread
          const defaultNoteIds = filteredNotes
            .filter((note: Note) => note.noteType === 'default' || !note.noteType)
            .map((note: Note) => note.id);
          
          if (defaultNoteIds.length > 0) {
            try {
              const refsResponse = await fetch(`/api/threads/${threadId}/referenced-scripture-notes?noteIds=${defaultNoteIds.join(',')}`, {
                credentials: 'include'
              });
              if (refsResponse.ok) {
                const refsData = await refsResponse.json();
                setReferencedScriptureNoteIds(new Set(refsData.scriptureNoteIds || []));
              } else {
                setReferencedScriptureNoteIds(new Set());
              }
            } catch (error) {
              console.error('Error fetching referenced scripture notes:', error);
              setReferencedScriptureNoteIds(new Set());
            }
          } else {
            setReferencedScriptureNoteIds(new Set());
          }
        } else {
          // Failed to fetch - safeFetch handles logging
          setCurrentThreadNoteIds([]);
          setCurrentThreadNotes([]);
          setReferencedScriptureNoteIds(new Set());
        }
      } catch (error) {
        // Unexpected error
        captureException(error as Error);
        setAllNotes([]);
        setCurrentThreadNoteIds([]);
      } finally {
        setIsLoadingItems(false);
      }
    };

    fetchData();
  }, [threadId]);

  // Fetch share status on mount
  useEffect(() => {
    const fetchShareStatus = async () => {
      try {
        const response = await safeFetch(`/api/threads/${threadId}/share`, { retries: 1 });
        if (response && response.ok) {
          const data = await response.json();
          const isPublic = data.isPublic || false;
          setIsShared(isPublic);
          setShareUrl(data.shareUrl || null);
          if (isPublic) {
            setFormData(prev => ({ ...prev, selectedType: 'Shared' }));
          }
          // Update initial values
          setInitialValues(prev => ({ ...prev, isShared: isPublic }));
        }
      } catch (error) {
        console.error('Failed to fetch share status:', error);
      }
    };

    fetchShareStatus();
  }, [threadId]);
  
  // Update initial values when data is loaded
  useEffect(() => {
    setInitialValues({
      title: initialTitle,
      color: initialColor,
      isShared: isShared
    });
  }, [initialTitle, initialColor, isShared]);
  
  // Sync formData with props when they change, but only if we haven't fetched data yet
  useEffect(() => {
    // Skip if we've already fetched fresh data (prevents overwriting with stale props)
    if (hasFetchedThreadDataRef.current) {
      return;
    }
    
    setFormData(prev => {
      // Only update if props actually changed to avoid unnecessary re-renders
      if (prev.title !== initialTitle || prev.selectedColor !== initialColor) {
        return {
          ...prev,
          title: initialTitle,
          selectedColor: initialColor
        };
      }
      return prev;
    });
  }, [initialTitle, initialColor]);
  
  // Fetch latest thread data on mount to ensure we have saved values (even if props are stale)
  // Only fetch once per threadId change, not on every formData change
  useEffect(() => {
    if (!threadId || !threadId.startsWith('thread_')) {
      return; // Skip for invalid thread IDs
    }
    
    // Only fetch if threadId changed (new thread) or we haven't fetched yet
    if (lastFetchedThreadIdRef.current === threadId) {
      // Already fetched for this threadId, don't refetch
      return;
    }
    
    // Reset fetch flag when threadId changes
    hasFetchedThreadDataRef.current = false;
    lastFetchedThreadIdRef.current = threadId;
    
    const fetchThreadData = async () => {
      try {
        // Add cache-busting query param to ensure fresh data
        const cacheBuster = `?t=${Date.now()}`;
        const response = await fetch(`/api/threads/${threadId}/prefetch${cacheBuster}`, {
          credentials: 'include',
          cache: 'no-store' // Bypass browser cache
        });
        
        if (response.ok) {
          const data = await response.json();
          const thread = data.thread;
          
          if (thread) {
            // Always update formData with fetched data (don't check initial props)
            // The API is the source of truth, not the stale props
            setFormData(prev => ({
              ...prev,
              title: thread.title || '',
              selectedColor: thread.color || 'paper'
            }));
            
            // Always update initialValues to match fetched data
            setInitialValues(prev => ({
              ...prev,
              title: thread.title || '',
              color: thread.color || 'paper'
            }));
            
            // Mark that we've fetched data
            hasFetchedThreadDataRef.current = true;
          }
        }
      } catch (error) {
        console.error('[EditThreadPanel] Error fetching thread data:', error);
        // Silently fail - props will be used as fallback
      }
    };
    
    fetchThreadData();
  }, [threadId, initialTitle, initialColor]);
  
  // Helper function to refresh referenced scripture notes
  const refreshReferencedScriptureNotes = useCallback(async (notes: Note[]) => {
    const defaultNoteIds = notes
      .filter(note => note.noteType === 'default' || !note.noteType)
      .map(note => note.id);
    
    if (defaultNoteIds.length > 0) {
      try {
        const refsResponse = await fetch(`/api/threads/${threadId}/referenced-scripture-notes?noteIds=${defaultNoteIds.join(',')}`, {
          credentials: 'include'
        });
        if (refsResponse.ok) {
          const refsData = await refsResponse.json();
          const scriptureNoteIds = refsData.scriptureNoteIds || [];
          // Exclude scripture notes that are currently being removed
          const filteredScriptureNoteIds = scriptureNoteIds.filter(
            (id: string) => !removingScriptureNotesRef.current.has(id)
          );
          setReferencedScriptureNoteIds(new Set(filteredScriptureNoteIds));
        } else {
          setReferencedScriptureNoteIds(new Set());
        }
      } catch (error) {
        console.error('Error fetching referenced scripture notes:', error);
        setReferencedScriptureNoteIds(new Set());
      }
    } else {
      // No default notes left - all scripture notes should be removable
      // Clear referencedScriptureNoteIds and also clear any stale removingScriptureNotesRef entries
      setReferencedScriptureNoteIds(new Set());
      removingScriptureNotesRef.current.clear();
      // Note: We don't clear removedNoteIds here - those notes were explicitly removed and should stay removed
    }
  }, [threadId]);

  // Refresh referenced scripture notes whenever the notes list changes
  useEffect(() => {
    // Filter out removed notes before processing
    const activeNotes = currentThreadNotes.filter(note => !removedNoteIds.has(note.id));
    
    // If we're currently removing a note, delay the refresh to allow database operation to complete
    // For scripture notes, we need to wait longer to ensure they're fully removed
    if (isRemovingNote || pendingRemovalsRef.current.size > 0) {
      // Delay refresh by 1500ms to allow database operations to complete
      // This is especially important for scripture notes which have additional cleanup
      const timeoutId = setTimeout(() => {
        // Only refresh if we're no longer removing notes
        if (!isRemovingNote && pendingRemovalsRef.current.size === 0) {
          if (activeNotes.length > 0) {
            refreshReferencedScriptureNotes(activeNotes);
          } else {
            setReferencedScriptureNoteIds(new Set());
          }
        }
      }, 1500);
      
      return () => clearTimeout(timeoutId);
    }
    
    // Normal refresh when not removing - use filtered notes
    if (activeNotes.length > 0) {
      refreshReferencedScriptureNotes(activeNotes);
    } else {
      setReferencedScriptureNoteIds(new Set());
    }
  }, [currentThreadNotes, refreshReferencedScriptureNotes, isRemovingNote]);

  // Listen for noteAddedToThread and noteRemovedFromThread events to keep list in sync
  useEffect(() => {
    const handleNoteAddedToThread = async (event: CustomEvent) => {
      const { noteId, threadId: eventThreadId } = event.detail || {};
      if (eventThreadId !== threadId || !noteId) return;
      
      // Check if note is already in the list
      if (currentThreadNoteIds.includes(noteId)) {
        return; // Already in list
      }
      
      // Fetch note details and add to list
      try {
        const response = await fetch(`/api/notes/${noteId}/details`, {
          credentials: 'include'
        });
        
        if (response.ok) {
          const data = await response.json();
          const noteData = data.note;
          const newNote: Note = {
            id: noteData.id,
            title: noteData.title,
            content: noteData.content,
            spaceId: noteData.spaceId,
            noteType: noteData.noteType,
          };
          
          setCurrentThreadNotes(prev => {
            // Check if already exists
            if (prev.some(n => n.id === noteId)) {
              return prev;
            }
            // Don't add if this note was previously removed (use ref for current value in callback)
            if (removedNoteIdsRef.current.has(noteId)) {
              return prev;
            }
            return [newNote, ...prev];
          });
          setCurrentThreadNoteIds(prev => {
            if (prev.includes(noteId)) {
              return prev;
            }
            return [noteId, ...prev];
          });
        }
      } catch (error) {
        console.error('Error fetching note details for add:', error);
      }
    };
    
    const handleNoteRemovedFromThread = (event: CustomEvent) => {
      const { noteId, threadId: eventThreadId } = event.detail || {};
      if (eventThreadId !== threadId || !noteId) return;
      
      // Skip if this component already handled it optimistically
      if (pendingRemovalsRef.current.has(noteId)) {
        return;
      }
      
      // Skip if this note was already removed (prevent re-adding) - use ref for current value in callback
      if (removedNoteIdsRef.current.has(noteId)) {
        return;
      }
      
      // Track that this note has been removed
      setRemovedNoteIds(prev => {
        const updated = new Set(prev);
        updated.add(noteId);
        return updated;
      });
      
      // Remove note from list immediately (for external removals)
      setCurrentThreadNotes(prev => prev.filter(note => note.id !== noteId));
      setCurrentThreadNoteIds(prev => prev.filter(id => id !== noteId));
    };
    
    window.addEventListener('noteAddedToThread', handleNoteAddedToThread as unknown as EventListener);
    window.addEventListener('noteRemovedFromThread', handleNoteRemovedFromThread as unknown as EventListener);

    return () => {
      window.removeEventListener('noteAddedToThread', handleNoteAddedToThread as unknown as EventListener);
      window.removeEventListener('noteRemovedFromThread', handleNoteRemovedFromThread as unknown as EventListener);
    };
  }, [threadId, currentThreadNoteIds, refreshReferencedScriptureNotes]);

  // Handle share toggle
  const handleShareToggle = async (enabled: boolean) => {
    setShareLoading(true);
    try {
      const response = await fetch(`/api/threads/${threadId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: enabled ? 'enable' : 'disable' })
      });

      if (response.ok) {
        const data = await response.json();
        setIsShared(data.isPublic);
        setShareUrl(data.shareUrl);
        setFormData(prev => ({ ...prev, selectedType: data.isPublic ? 'Shared' : 'Private' }));

        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: data.isPublic ? 'Thread is now shared' : 'Thread is now private',
            type: 'success'
          }
        }));

        // Dispatch event to refresh dashboard
        // Include current title and color for immediate mobile updates
        const currentTitle = formDataRef.current.title;
        const currentColor = formDataRef.current.selectedColor;
        window.dispatchEvent(new CustomEvent('threadUpdated', {
          detail: { 
            threadId,
            title: currentTitle,
            color: currentColor,
            backgroundGradient: getThreadGradientCSS(currentColor)
          }
        }));
      } else {
        const error = await response.json();
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: error.error || 'Failed to update sharing settings',
            type: 'error'
          }
        }));
      }
    } catch (error) {
      console.error('Error toggling share:', error);
      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: 'Failed to update sharing settings',
          type: 'error'
        }
      }));
    } finally {
      setShareLoading(false);
    }
  };

  // Handle share link refresh
  const handleShareRefresh = async () => {
    setShareLoading(true);
    try {
      const response = await fetch(`/api/threads/${threadId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'refresh' })
      });

      if (response.ok) {
        const data = await response.json();
        setShareUrl(data.shareUrl);

        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: 'Share link refreshed',
            type: 'success'
          }
        }));
      } else {
        const error = await response.json();
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: error.error || 'Failed to refresh share link',
            type: 'error'
          }
        }));
      }
    } catch (error) {
      console.error('Error refreshing share link:', error);
      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: 'Failed to refresh share link',
          type: 'error'
        }
      }));
    } finally {
      setShareLoading(false);
    }
  };

  // Validate title
  const validateTitle = (title: string) => {
    const errors: Record<string, string> = {};
    
    if (!title.trim()) {
      errors.title = 'Thread title is required';
    }
    
    if (title.trim().length < 1) {
      errors.title = 'Thread title must be at least 1 character';
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };
  
  // Helper function to update navigation DOM elements
  // Uses requestAnimationFrame on mobile to ensure updates are visible after animations
  const updateNavigationDOM = (title?: string, color?: ThreadColor) => {
    if (typeof document === 'undefined') return;
    
    const performUpdate = () => {
      const gradient = color !== undefined ? getThreadColorCSS(color) : undefined;
      
      // Update navigation wrapper element (desktop)
      const navElement = document.querySelector(`[data-navigation-active="true"]`) || 
                         document.querySelector(`[data-thread-id="${threadId}"]`) ||
                         document.querySelector(`[slot="navigation"][data-thread-id="${threadId}"]`);
      if (navElement) {
        if (title !== undefined) {
          navElement.setAttribute('data-thread-title', title.trim());
        }
        if (color !== undefined && gradient) {
          navElement.setAttribute('data-thread-background-gradient', gradient);
        }
      }
      
      // Update main content div (used by page meta - works on both desktop and mobile)
      const mainDiv = document.querySelector(`[data-navigation-item="${threadId}"]`);
      if (mainDiv) {
        if (title !== undefined) {
          mainDiv.setAttribute('data-title', title.trim());
        }
        if (color !== undefined && gradient) {
          mainDiv.setAttribute('data-background-gradient', gradient);
        }
        // Also set thread-specific attributes for mobile navigation to read
        if (title !== undefined) {
          mainDiv.setAttribute('data-thread-title', title.trim());
        }
        if (color !== undefined && gradient) {
          mainDiv.setAttribute('data-thread-background-gradient', gradient);
        }
      }
      
      // Update CardStack header (the visible header on the thread page - works on both desktop and mobile)
      const cardStackHeader = document.querySelector(`.card-stack__header[data-thread-id="${threadId}"]`);
      if (cardStackHeader) {
        if (title !== undefined) {
          // Update the text content in the page-heading element
          const pageHeading = cardStackHeader.querySelector('.page-heading p');
          if (pageHeading) {
            pageHeading.textContent = title.trim();
          }
          // Also update data attribute for mobile navigation
          cardStackHeader.setAttribute('data-thread-title', title.trim());
        }
        if (color !== undefined && gradient) {
          // Update background color - use !important to ensure it persists on mobile
          const bgColor = getThreadColorCSS(color);
          (cardStackHeader as HTMLElement).style.setProperty('background-color', bgColor, 'important');
          // Update text color based on thread color
          const textColor = getThreadTextColorCSS(color);
          (cardStackHeader as HTMLElement).style.setProperty('color', textColor, 'important');
          // Also update data attribute for mobile navigation
          cardStackHeader.setAttribute('data-thread-background-gradient', gradient);
        }
      }
      
      // Update any note elements that reference this thread as parent
      const noteElements = document.querySelectorAll(`[data-parent-thread-id="${threadId}"]`);
      noteElements.forEach((noteEl) => {
        if (title !== undefined) {
          noteEl.setAttribute('data-parent-thread-title', title.trim());
        }
        if (color !== undefined && gradient) {
          noteEl.setAttribute('data-parent-thread-background-gradient', gradient);
        }
      });
      
      // Update mobile navigation elements (if they exist)
      // MobileNavigation reads from [data-navigation-active="true"] or [slot="navigation"]
      // but on mobile these might not exist, so we also update any element with data-thread-id
      const allThreadElements = document.querySelectorAll(`[data-thread-id="${threadId}"]`);
      allThreadElements.forEach((el) => {
        if (title !== undefined) {
          el.setAttribute('data-thread-title', title.trim());
        }
        if (color !== undefined && gradient) {
          el.setAttribute('data-thread-background-gradient', gradient);
        }
      });
    };
    
    // On mobile (or when inBottomSheet), use requestAnimationFrame to ensure updates are visible
    // after any bottom sheet animations complete
    if (inBottomSheet || (typeof window !== 'undefined' && window.innerWidth < 1160)) {
      // Double RAF to ensure it happens after any animations
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          performUpdate();
        });
      });
    } else {
      // On desktop, update immediately
      performUpdate();
    }
  };
  
  // Auto-save title changes (debounced) - using useCallback with refs to avoid stale closures
  const saveTitleChange = useCallback(async (title: string) => {
    if (!validateTitle(title)) {
      return;
    }
    
    if (title.trim() === initialValues.title) {
      // Clear pending save if it matches initial value
      pendingTitleSaveRef.current = null;
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(`pendingThreadTitle_${threadId}`);
      }
      return; // No change
    }
    
    // Track this save operation
    const saveId = `title_${Date.now()}`;
    activeSaveOperationsRef.current.add(saveId);
    setIsSaving(true);
    setSaveError(null);
    
    // Clear pending save from sessionStorage since we're saving now
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(`pendingThreadTitle_${threadId}`);
    }
    pendingTitleSaveRef.current = null;
    
    try {
      // Use refs to get current values (avoid stale closures)
      const currentColor = formDataRef.current.selectedColor;
      const currentIsShared = isSharedRef.current;
      
      const formDataToSend = new FormData();
      formDataToSend.append('id', threadId);
      formDataToSend.append('title', title.trim());
      formDataToSend.append('color', currentColor);
      formDataToSend.append('isPublic', currentIsShared ? 'true' : 'false');
      
      // OFFLINE-FIRST: Update thread in local IndexedDB immediately
      let offlineUpdateSuccess = false;
      if (userId) {
        try {
          await updateThreadOffline(userId, threadId, {
            title: title.trim(),
            color: currentColor,
          });
          offlineUpdateSuccess = true;
        } catch (err) {
          console.error('[EditThreadPanel] Failed to update thread offline:', err);
        }
      }
      
      let response: Response | null = null;
      let networkError = false;
      
      try {
        response = await fetch('/api/threads/update', {
          method: 'POST',
          body: formDataToSend,
        });
      } catch (error) {
        networkError = isNetworkError(error);
        
        if (networkError && offlineUpdateSuccess) {
          // Offline update succeeded - treat as success
          setInitialValues(prev => ({ ...prev, title: title.trim() }));
          // Update lastFetchedThreadIdRef to indicate we have fresh data from save
          lastFetchedThreadIdRef.current = threadId;
          updateNavigationDOM(title.trim());
          window.dispatchEvent(new CustomEvent('threadUpdated', {
            detail: { 
              threadId,
              title: title.trim(),
              color: currentColor,
              backgroundGradient: getThreadGradientCSS(currentColor)
            }
          }));
          activeSaveOperationsRef.current.delete(saveId);
          setIsSaving(false);
          return;
        } else {
          throw error;
        }
      }
      
      const data = await response.json();
      
      if (response && response.ok) {
        setInitialValues(prev => ({ ...prev, title: title.trim() }));
        // Update lastFetchedThreadIdRef to indicate we have fresh data from save
        lastFetchedThreadIdRef.current = threadId;
        updateNavigationDOM(title.trim());
        window.dispatchEvent(new CustomEvent('threadUpdated', {
          detail: { 
            threadId,
            title: title.trim(),
            color: currentColor,
            backgroundGradient: getThreadGradientCSS(currentColor)
          }
        }));
      } else {
        if (offlineUpdateSuccess) {
          // Offline update succeeded - treat as success
          setInitialValues(prev => ({ ...prev, title: title.trim() }));
          // Update lastFetchedThreadIdRef to indicate we have fresh data from save
          lastFetchedThreadIdRef.current = threadId;
          updateNavigationDOM(title.trim());
          window.dispatchEvent(new CustomEvent('threadUpdated', {
            detail: { 
              threadId,
              title: title.trim(),
              color: currentColor,
              backgroundGradient: getThreadGradientCSS(currentColor)
            }
          }));
        } else {
          throw new Error(data.error || 'Failed to update thread');
        }
      }
    } catch (error) {
      console.error('Error auto-saving title:', error);
      setSaveError(error instanceof Error ? error.message : 'Failed to save title');
      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: 'Failed to save title. Please try again.',
          type: 'error'
        }
      }));
    } finally {
      activeSaveOperationsRef.current.delete(saveId);
      setIsSaving(false);
    }
  }, [threadId, userId, initialValues.title]);
  
  // Auto-save color changes (immediate) - using useCallback with refs to avoid stale closures
  const saveColorChange = useCallback(async (color: ThreadColor) => {
    if (color === initialValues.color) {
      // Clear pending save if it matches initial value
      pendingColorSaveRef.current = null;
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(`pendingThreadColor_${threadId}`);
      }
      return; // No change
    }
    
    // Track this save operation
    const saveId = `color_${Date.now()}`;
    activeSaveOperationsRef.current.add(saveId);
    setIsSaving(true);
    setSaveError(null);
    
    // Clear pending save from sessionStorage since we're saving now
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(`pendingThreadColor_${threadId}`);
    }
    pendingColorSaveRef.current = null;
    
    try {
      // Use refs to get current values (avoid stale closures)
      const currentTitle = formDataRef.current.title;
      const currentIsShared = isSharedRef.current;
      
      const formDataToSend = new FormData();
      formDataToSend.append('id', threadId);
      formDataToSend.append('title', currentTitle.trim());
      formDataToSend.append('color', color);
      formDataToSend.append('isPublic', currentIsShared ? 'true' : 'false');
      
      // OFFLINE-FIRST: Update thread in local IndexedDB immediately
      let offlineUpdateSuccess = false;
      if (userId) {
        try {
          await updateThreadOffline(userId, threadId, {
            title: currentTitle.trim(),
            color: color,
          });
          offlineUpdateSuccess = true;
        } catch (err) {
          console.error('[EditThreadPanel] Failed to update thread offline:', err);
        }
      }
      
      let response: Response | null = null;
      let networkError = false;
      
      try {
        response = await fetch('/api/threads/update', {
          method: 'POST',
          body: formDataToSend,
        });
      } catch (error) {
        networkError = isNetworkError(error);
        
        if (networkError && offlineUpdateSuccess) {
          // Offline update succeeded - treat as success
          setInitialValues(prev => ({ ...prev, color: color }));
          // Update lastFetchedThreadIdRef to indicate we have fresh data from save
          lastFetchedThreadIdRef.current = threadId;
          updateNavigationDOM(undefined, color);
          window.dispatchEvent(new CustomEvent('threadUpdated', {
            detail: { 
              threadId,
              title: currentTitle.trim(),
              color: color,
              backgroundGradient: getThreadGradientCSS(color)
            }
          }));
          activeSaveOperationsRef.current.delete(saveId);
          setIsSaving(false);
          return;
        } else {
          throw error;
        }
      }
      
      const data = await response.json();
      
      if (response && response.ok) {
        setInitialValues(prev => ({ ...prev, color: color }));
        // Update lastFetchedThreadIdRef to indicate we have fresh data from save
        lastFetchedThreadIdRef.current = threadId;
        updateNavigationDOM(undefined, color);
        window.dispatchEvent(new CustomEvent('threadUpdated', {
          detail: { 
            threadId,
            title: currentTitle.trim(),
            color: color,
            backgroundGradient: getThreadGradientCSS(color)
          }
        }));
      } else {
        if (offlineUpdateSuccess) {
          // Offline update succeeded - treat as success
          setInitialValues(prev => ({ ...prev, color: color }));
          // Update lastFetchedThreadIdRef to indicate we have fresh data from save
          lastFetchedThreadIdRef.current = threadId;
          updateNavigationDOM(undefined, color);
          window.dispatchEvent(new CustomEvent('threadUpdated', {
            detail: { 
              threadId,
              title: currentTitle.trim(),
              color: color,
              backgroundGradient: getThreadGradientCSS(color)
            }
          }));
        } else {
          throw new Error(data.error || 'Failed to update thread');
        }
      }
    } catch (error) {
      console.error('Error auto-saving color:', error);
      setSaveError(error instanceof Error ? error.message : 'Failed to save color');
      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: 'Failed to save color. Please try again.',
          type: 'error'
        }
      }));
    } finally {
      activeSaveOperationsRef.current.delete(saveId);
      setIsSaving(false);
    }
  }, [threadId, userId, initialValues.color]);
  
  // Check for pending saves from sessionStorage on mount (for mobile remounts)
  // Must be after saveTitleChange and saveColorChange are defined
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const pendingTitle = sessionStorage.getItem(`pendingThreadTitle_${threadId}`);
    const pendingColor = sessionStorage.getItem(`pendingThreadColor_${threadId}`);
    
    if (pendingTitle && pendingTitle !== initialTitle) {
      // Restore pending title save
      pendingTitleSaveRef.current = pendingTitle;
      // Clear from sessionStorage
      sessionStorage.removeItem(`pendingThreadTitle_${threadId}`);
      // Trigger save after a small delay to ensure component is fully mounted
      setTimeout(() => {
        saveTitleChange(pendingTitle).catch(err => {
          console.error('[EditThreadPanel] Error restoring pending title save:', err);
        });
      }, 100);
    }
    
    if (pendingColor && pendingColor !== initialColor) {
      // Restore pending color save
      pendingColorSaveRef.current = pendingColor as ThreadColor;
      // Clear from sessionStorage
      sessionStorage.removeItem(`pendingThreadColor_${threadId}`);
      // Trigger save after a small delay to ensure component is fully mounted
      setTimeout(() => {
        saveColorChange(pendingColor as ThreadColor).catch(err => {
          console.error('[EditThreadPanel] Error restoring pending color save:', err);
        });
      }, 100);
    }
  }, [saveTitleChange, saveColorChange, threadId, initialTitle, initialColor]); // Run when save functions are available
  
  // Cleanup effect: ensure all pending saves complete before unmount
  useEffect(() => {
    return () => {
      // Complete any pending debounced saves
      if (titleDebounceTimerRef.current) {
        clearTimeout(titleDebounceTimerRef.current);
        titleDebounceTimerRef.current = null;
        
        if (pendingTitleSaveRef.current && pendingTitleSaveRef.current !== initialValues.title) {
          // Complete the save synchronously if possible, but don't block
          saveTitleChange(pendingTitleSaveRef.current).catch(err => {
            console.error('[EditThreadPanel] Error completing pending title save on unmount:', err);
          });
        }
      }
      
      if (notesDebounceTimerRef.current) {
        clearTimeout(notesDebounceTimerRef.current);
        notesDebounceTimerRef.current = null;
      }
      
      // Wait for active save operations to complete (with timeout)
      if (activeSaveOperationsRef.current.size > 0) {
        const maxWait = 2000; // Max 2 seconds
        const startTime = Date.now();
        const checkInterval = setInterval(() => {
          if (activeSaveOperationsRef.current.size === 0 || Date.now() - startTime > maxWait) {
            clearInterval(checkInterval);
          }
        }, 100);
      }
    };
  }, [saveTitleChange, initialValues.title]);
  
  // Debounced auto-save for title changes
  useEffect(() => {
    if (formData.title === initialValues.title) {
      // Clear any pending save
      if (titleDebounceTimerRef.current) {
        clearTimeout(titleDebounceTimerRef.current);
        titleDebounceTimerRef.current = null;
      }
      pendingTitleSaveRef.current = null;
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(`pendingThreadTitle_${threadId}`);
      }
      return; // No change
    }
    
    // Store pending save in sessionStorage (for mobile remounts)
    pendingTitleSaveRef.current = formData.title;
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(`pendingThreadTitle_${threadId}`, formData.title);
    }
    
    // Clear existing timer
    if (titleDebounceTimerRef.current) {
      clearTimeout(titleDebounceTimerRef.current);
    }
    
    const timeoutId = setTimeout(() => {
      saveTitleChange(formData.title);
      titleDebounceTimerRef.current = null;
    }, 1500); // 1.5 second debounce
    
    titleDebounceTimerRef.current = timeoutId;
    
    return () => {
      // On unmount, if there's a pending save, complete it immediately
      if (titleDebounceTimerRef.current) {
        clearTimeout(titleDebounceTimerRef.current);
        titleDebounceTimerRef.current = null;
        
        // Complete the pending save before unmounting
        if (pendingTitleSaveRef.current && pendingTitleSaveRef.current !== initialValues.title) {
          // Use a small delay to ensure the save function can access current state
          // But don't block unmount - the save will complete asynchronously
          saveTitleChange(pendingTitleSaveRef.current).catch(err => {
            console.error('[EditThreadPanel] Error completing pending title save on unmount:', err);
          });
        }
      }
    };
  }, [formData.title, initialValues.title, saveTitleChange, threadId]);

  // Handle adding selected notes to thread (auto-save)
  const handleAddNotesToThread = async () => {
    if (selectedItems.length === 0) {
      return;
    }
    
    setIsSaving(true);
    setSaveError(null);
    
    // Get notes to add (for optimistic update)
    const notesToAdd: Note[] = [];
    const selectedNoteIds: string[] = [];
    selectedItems.forEach(itemId => {
      const note = allNotes.find(note => note.id === itemId);
      if (note) {
        notesToAdd.push(note);
        selectedNoteIds.push(itemId);
      }
    });
    
    // Optimistic update: immediately add notes to UI
    if (notesToAdd.length > 0) {
      // Remove notes from removedNoteIds if they're being explicitly added back
      setRemovedNoteIds(prev => {
        const updated = new Set(prev);
        notesToAdd.forEach(note => {
          updated.delete(note.id);
        });
        return updated;
      });
      setCurrentThreadNotes(prev => {
        // Filter out any notes that are already in the list
        const existingIds = new Set(prev.map(n => n.id));
        const newNotes = notesToAdd.filter(note => !existingIds.has(note.id));
        return [...newNotes, ...prev];
      });
      setCurrentThreadNoteIds(prev => {
        const existingIds = new Set(prev);
        const newIds = selectedNoteIds.filter(id => !existingIds.has(id));
        return [...newIds, ...prev];
      });
    }
    
    try {
      const formDataToSend = new FormData();
      formDataToSend.append('id', threadId);
      formDataToSend.append('title', formData.title.trim());
      formDataToSend.append('color', formData.selectedColor);
      formDataToSend.append('isPublic', isShared ? 'true' : 'false');
      
      if (selectedNoteIds.length > 0) {
        formDataToSend.append('selectedNoteIds', JSON.stringify(selectedNoteIds));
      }
      
      const response = await fetch('/api/threads/update', {
        method: 'POST',
        body: formDataToSend,
      });
      
      const data = await response.json();
      
      if (response && response.ok) {
        // Dispatch noteAddedToThread events for each note
        selectedNoteIds.forEach(noteId => {
          const note = notesToAdd.find(n => n.id === noteId);
          window.dispatchEvent(new CustomEvent('noteAddedToThread', {
            detail: { 
              noteId, 
              threadId, 
              noteType: note?.noteType || 'default',
              skipNavigation: true 
            }
          }));
        });
        invalidatePanelDataCache(PANEL_CACHE_KEYS.subscription);

        // Clear selected items
        setSelectedItems([]);
        
        // Don't refresh from server - we already did optimistic update and the event will sync other components
        // The optimistic update is sufficient, and refreshing could cause navigation/panel closing issues
        // Note: refreshReferencedScriptureNotes is already called in the optimistic update above
        
        window.dispatchEvent(new CustomEvent('threadUpdated', {
          detail: { 
            threadId,
            title: formData.title.trim(),
            color: formData.selectedColor,
            backgroundGradient: getThreadGradientCSS(formData.selectedColor)
          }
        }));
      } else {
        // Revert optimistic update on error
        setCurrentThreadNotes(prev => prev.filter(note => !selectedNoteIds.includes(note.id)));
        setCurrentThreadNoteIds(prev => prev.filter(id => !selectedNoteIds.includes(id)));
        throw new Error(data.error || 'Failed to add notes to thread');
      }
    } catch (error) {
      console.error('Error adding notes to thread:', error);
      // Revert optimistic update on error
      setCurrentThreadNotes(prev => prev.filter(note => !selectedNoteIds.includes(note.id)));
      setCurrentThreadNoteIds(prev => prev.filter(id => !selectedNoteIds.includes(id)));
      setSaveError(error instanceof Error ? error.message : 'Failed to add notes');
      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: 'Failed to add notes to thread. Please try again.',
          type: 'error'
        }
      }));
    } finally {
      setIsSaving(false);
    }
  };
  
  // Auto-save when notes are selected (debounced to batch multiple selections)
  useEffect(() => {
    if (selectedItems.length === 0) {
      // Clear any pending timer
      if (notesDebounceTimerRef.current) {
        clearTimeout(notesDebounceTimerRef.current);
        notesDebounceTimerRef.current = null;
      }
      return;
    }
    
    // Clear existing timer
    if (notesDebounceTimerRef.current) {
      clearTimeout(notesDebounceTimerRef.current);
    }
    
    const timeoutId = setTimeout(() => {
      handleAddNotesToThread();
      notesDebounceTimerRef.current = null;
    }, 500); // Small delay to batch multiple selections
    
    notesDebounceTimerRef.current = timeoutId;
    
    return () => {
      // On unmount, complete pending note additions if any
      if (notesDebounceTimerRef.current) {
        clearTimeout(notesDebounceTimerRef.current);
        notesDebounceTimerRef.current = null;
        
        // Complete the pending save before unmounting
        if (selectedItems.length > 0) {
          // Use a small delay to ensure the save function can access current state
          // But don't block unmount - the save will complete asynchronously
          handleAddNotesToThread().catch(err => {
            console.error('[EditThreadPanel] Error completing pending notes save on unmount:', err);
          });
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItems]);

  // Handle input changes
  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear validation error for this field
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  // Handle color selection (auto-save immediately)
  const handleColorSelect = async (color: ThreadColor) => {
    setFormData(prev => ({ ...prev, selectedColor: color }));
    await saveColorChange(color);
  };

  // Check if there are unsaved changes or pending saves
  const hasUnsavedChanges = () => {
    return (
      formData.title.trim() !== initialValues.title ||
      formData.selectedColor !== initialValues.color ||
      isShared !== initialValues.isShared ||
      selectedItems.length > 0
    );
  };
  
  // Handle close with unsaved changes check
  const handleClose = () => {
    if (isSaving) {
      setShowUnsavedDialog(true);
      return;
    }
    
    if (hasUnsavedChanges()) {
      setShowUnsavedDialog(true);
      return;
    }
    
    if (onClose) {
      onClose();
    } else {
      window.dispatchEvent(new CustomEvent('closeEditThreadPanel'));
    }
  };
  
  // Handle unsaved changes dialog actions
  const handleDiscardChanges = () => {
    // Reset to initial values
    setFormData({
      title: initialValues.title,
      selectedColor: initialValues.color,
      selectedType: initialValues.isShared ? 'Shared' : 'Private'
    });
    setIsShared(initialValues.isShared);
    setSelectedItems([]);
    setShowUnsavedDialog(false);
    
    if (onClose) {
      onClose();
    } else {
      window.dispatchEvent(new CustomEvent('closeEditThreadPanel'));
    }
  };
  
  const handleSaveAndClose = async () => {
    setShowUnsavedDialog(false);
    
    // Wait for any pending saves to complete
    if (isSaving) {
      // Wait a bit for save to complete
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Save any remaining changes
    if (formData.title.trim() !== initialValues.title) {
      await saveTitleChange(formData.title);
    }
    if (formData.selectedColor !== initialValues.color) {
      await saveColorChange(formData.selectedColor);
    }
    if (selectedItems.length > 0) {
      await handleAddNotesToThread();
    }
    
    // Wait a bit more for saves to complete
    await new Promise(resolve => setTimeout(resolve, 500));
    
    if (onClose) {
      onClose();
    } else {
      window.dispatchEvent(new CustomEvent('closeEditThreadPanel'));
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

  // Remove note from thread
  const handleRemoveFromThread = async (noteId: string) => {
    // Mark that this button was clicked (already set in onClick, but ensure it's set)
    buttonClickRef.current = noteId;
    // Clear after a short delay
    setTimeout(() => {
      buttonClickRef.current = null;
    }, 100);
    
    setIsRemovingNote(true);
    
    // Mark this note as being removed optimistically
    pendingRemovalsRef.current.add(noteId);
    
    // Optimistic update: immediately remove note from UI
    const noteToRemove = currentThreadNotes.find(note => note.id === noteId);
    const isScriptureNote = noteToRemove?.noteType === 'scripture';
    
    // Track that this note has been removed IMMEDIATELY (before API call)
    // This ensures it stays filtered out even if something tries to re-add it
    setRemovedNoteIds(prev => {
      const updated = new Set(prev);
      updated.add(noteId);
      return updated;
    });
    
    setCurrentThreadNotes(prev => prev.filter(note => note.id !== noteId));
    setCurrentThreadNoteIds(prev => prev.filter(id => id !== noteId));
    
    // If removing a scripture note, immediately remove it from referencedScriptureNoteIds
    // This prevents it from being filtered out during the removal process
    if (isScriptureNote) {
      removingScriptureNotesRef.current.add(noteId);
      setReferencedScriptureNoteIds(prev => {
        const updated = new Set(prev);
        updated.delete(noteId);
        return updated;
      });
    }
    
    try {
      const response = await fetch(`/api/notes/${noteId}/remove-thread`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ threadId }),
        credentials: 'include'
      });
      
      if (response.ok) {
        const result = await response.json();
        
        // Show success toast
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: 'Note removed from thread',
            type: 'success'
          }
        }));

        // Dispatch noteRemovedFromThread event for real-time UI updates
        // Our listener will check pendingRemovalsRef synchronously and skip processing
        // Add skipNavigation flag to prevent page refresh when removing from EditThreadPanel
        window.dispatchEvent(new CustomEvent('noteRemovedFromThread', {
          detail: { 
            noteId: noteId,
            threadId: threadId,
            noteType: noteToRemove?.noteType || 'default',
            skipNavigation: true // Prevent page navigation/refresh when removing from EditThreadPanel
          }
        }));
        
        // Remove from pending set after dispatching (event dispatch is synchronous, so our listener has already checked)
        pendingRemovalsRef.current.delete(noteId);
        // Note: removedNoteIdsRef was already set during optimistic update, so no need to set it again
        // Remove from scripture notes tracking if it was a scripture note
        // Delay clearing to ensure refresh doesn't re-add it
        if (isScriptureNote) {
          setTimeout(() => {
            removingScriptureNotesRef.current.delete(noteId);
          }, 2000); // Wait 2 seconds before clearing
        }

        // Don't refresh from server - we already did optimistic update and the event will sync other components
        // The optimistic update is sufficient, and refreshing could cause navigation/panel closing issues
      } else {
        // Revert optimistic update on error
        pendingRemovalsRef.current.delete(noteId);
        // Remove from removedNoteIds since removal failed
        setRemovedNoteIds(prev => {
          const updated = new Set(prev);
          updated.delete(noteId);
          return updated;
        });
        if (isScriptureNote) {
          removingScriptureNotesRef.current.delete(noteId);
        }
        if (noteToRemove) {
          setCurrentThreadNotes(prev => [...prev, noteToRemove]);
          setCurrentThreadNoteIds(prev => [...prev, noteId]);
          // If it was a scripture note, we need to refresh to get the correct referenced state
          if (isScriptureNote) {
            // Trigger refresh to get correct referenced scripture notes state
            refreshReferencedScriptureNotes([...currentThreadNotes, noteToRemove]);
          }
        }
        const error = await response.json();
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: error.error || 'Error removing note from thread',
            type: 'error'
          }
        }));
      }
    } catch (error) {
      // Revert optimistic update on error
      pendingRemovalsRef.current.delete(noteId);
      // Remove from removedNoteIdsRef since removal failed
      removedNoteIdsRef.current.delete(noteId);
      if (isScriptureNote) {
        removingScriptureNotesRef.current.delete(noteId);
      }
      if (noteToRemove) {
        setCurrentThreadNotes(prev => [...prev, noteToRemove]);
        setCurrentThreadNoteIds(prev => [...prev, noteId]);
        // If it was a scripture note, we need to refresh to get the correct referenced state
        if (isScriptureNote) {
          // Trigger refresh to get correct referenced scripture notes state
          refreshReferencedScriptureNotes([...currentThreadNotes, noteToRemove]);
        }
      }
      console.error('Error removing note from thread:', error);
      // Log more details for debugging
      console.error('Error details:', {
        noteId,
        threadId,
        error: error instanceof Error ? error.message : String(error)
      });
      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: 'Error removing note from thread. Please try again.',
          type: 'error'
        }
      }));
    } finally {
      setIsRemovingNote(false);
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

  // Render compact note item (similar to AddToSpaceSection)
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
    <div className="h-full flex flex-col min-h-0">
      <div className="flex-1 flex flex-col min-h-0">
        {/* Content area that expands to fill available space */}
        <div className="flex-1 flex flex-col min-h-0" style={{ position: 'relative' }}>
          {/* Single unified panel using CardStack structure */}
          <div className={`bg-white box-border flex flex-col min-h-0 flex-1 items-start justify-between overflow-clip pb-6 pt-0 px-0 relative rounded-[24px] shadow-[0px_3px_20px_0px_rgba(120,118,111,0.1)] w-full mb-3.5 ${isLoadingItems ? 'opacity-60 pointer-events-none' : ''}`}>
            {/* Header section with dynamic background */}
            <div 
              className="box-border content-stretch flex gap-3 items-center justify-center leading-[0] mb-[-24px] not-italic pb-12 pt-6 px-6 relative shrink-0 w-full rounded-t-3xl"
              style={{ 
                backgroundColor: getThreadColorCSS(formData.selectedColor),
                color: getThreadTextColorCSS(formData.selectedColor)
              }}
            >
              <div className="panel__title">
                <p>Edit Thread</p>
              </div>
            </div>
            
            {/* Content area */}
            <div className="flex-1 box-border content-stretch flex flex-col items-start justify-start mb-[-24px] min-h-0 overflow-clip relative w-full">
              <div className="flex-1 bg-[var(--color-snow-white)] box-border content-stretch flex flex-col gap-3 items-start justify-start min-h-0 overflow-x-clip overflow-y-auto p-[12px] relative rounded-tl-[24px] rounded-tr-[24px] w-full">
                
                {/* Thread Title Input */}
                <div className="search-input rounded-3xl py-5 px-4 min-h-[64px] w-full">
                  <input 
                    ref={titleInputRef}
                    type="text"
                    value={formData.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    placeholder={formData.title ? '' : 'Thread Title'}
                    className="outline-none bg-transparent text-[18px] font-semibold text-[var(--color-deep-grey)] text-center placeholder:text-[var(--color-pebble-grey)] w-full" 
                  />
                  {validationErrors.title && (
                    <div className="text-red-500 text-sm mt-1 text-center">
                      {validationErrors.title}
                    </div>
                  )}
                </div>
                
                {/* Color selection */}
                <div className="color-selection flex gap-2 items-center justify-start w-full">
                  {THREAD_COLORS.map((color) => (
                    <button 
                      key={color}
                      type="button"
                      onClick={() => handleColorSelect(color)}
                      className={`color-swatch ${formData.selectedColor === color ? 'color-swatch--selected' : ''}`}
                      style={{ backgroundColor: getThreadColorCSS(color) }}
                    >
                      {/* Check icon for selected color */}
                      {formData.selectedColor === color && (
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

                {/* Thread visibility dropdown */}
                <ThreadVisibilityDropdown
                  isShared={isShared}
                  shareUrl={shareUrl}
                  onToggle={handleShareToggle}
                  onRefresh={handleShareRefresh}
                  isLoading={shareLoading}
                  isEditMode={true}
                />

                {/* Tab navigation */}
                {(() => {
                  const addedCount = currentThreadNotes.filter(n => !removedNoteIds.has(n.id) && !pendingRemovalsRef.current.has(n.id)).length;
                  const tabs = [
                    { id: 'added', label: 'Added', isActive: activeTab === 'added', count: addedCount || undefined },
                    { id: 'search', label: 'Add', isActive: activeTab === 'all' },
                  ];
                  return (
                    <TabNav
                      tabs={tabs}
                      onTabChange={(id) => setActiveTab(id === 'search' ? 'all' : id as 'added' | 'all')}
                      className="content-tabs"
                    />
                  );
                })()}

                {/* Added tab: current notes in thread + staged selections */}
                {activeTab === 'added' && !isLoadingItems && (
                  <>
                    <div className="w-full shrink-0 mb-3">
                      {currentThreadNotes.filter(n => !removedNoteIds.has(n.id) && !pendingRemovalsRef.current.has(n.id)).length === 0 && selectedItems.length === 0 ? (
                        <div className="text-center py-4 text-[var(--color-stone-grey)] text-sm">
                          No notes in this thread
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {currentThreadNotes
                            .filter(note => {
                              // First, exclude any note that has been removed
                              if (removedNoteIds.has(note.id)) {
                                return false;
                              }
                              // Exclude notes that are actively being removed right now (prevents flicker during removal)
                              if (pendingRemovalsRef.current.has(note.id)) {
                                return false;
                              }
                              return true;
                            })
                            .map((note, index) => (
                            <div key={note.id} className="relative group card-enter" style={{ animationDelay: `${index * 50}ms` }}>
                              <a
                                href={idToUrl(note.id)}
                                className="block"
                                aria-label={`View note: ${note.title || 'Untitled note'}`}
                                onMouseDown={(e) => {
                                  // Prevent navigation if button was clicked
                                  if (buttonClickRef.current === note.id) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    (e.nativeEvent as Event).stopImmediatePropagation();
                                    return false;
                                  }
                                  // Also check for remove button area
                                  const target = e.target as HTMLElement;
                                  const removeButton = target.closest('.btn-action') ||
                                                      target.closest('[aria-label="Remove"]') ||
                                                      target.closest('.remove-button-area');
                                  if (removeButton) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    (e.nativeEvent as Event).stopImmediatePropagation();
                                    return false;
                                  }
                                }}
                                onClick={(e) => {
                                  // Prevent navigation if button was clicked
                                  if (buttonClickRef.current === note.id) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    (e.nativeEvent as Event).stopImmediatePropagation();
                                    return false;
                                  }
                                  // Also check for remove button area
                                  const target = e.target as HTMLElement;
                                  const removeButton = target.closest('.btn-action') ||
                                                      target.closest('[aria-label="Remove"]') ||
                                                      target.closest('.remove-button-area');
                                  if (removeButton) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    (e.nativeEvent as Event).stopImmediatePropagation();
                                    return false;
                                  }
                                }}
                              >
                                {renderCompactNoteItem(note)}
                              </a>
                              {/* Remove from thread button - only for notes the current user owns */}
                              {note.userId === userId && (
                                <div
                                  className="remove-button-area absolute top-0 right-0 w-12 h-full"
                                  style={{ pointerEvents: 'none', zIndex: 10 }}
                                >
                                  <ActionButton
                                    variant="Remove"
                                    onMouseDown={(e) => {
                                      // Mark button click immediately on mousedown (before link's onMouseDown)
                                      buttonClickRef.current = note.id;
                                      e.preventDefault();
                                      e.stopPropagation();
                                      if (e.stopImmediatePropagation) {
                                        e.stopImmediatePropagation();
                                      }
                                    }}
                                    onClick={(e) => {
                                      // Mark button click immediately
                                      buttonClickRef.current = note.id;
                                      e.preventDefault();
                                      e.stopPropagation();
                                      if (e.stopImmediatePropagation) {
                                        e.stopImmediatePropagation();
                                      }
                                      handleRemoveFromThread(note.id);
                                    }}
                                    className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center action-button-hover"
                                    disabled={isRemovingNote}
                                    style={{ pointerEvents: 'auto', zIndex: 11 }}
                                  />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Selected Notes - staged selections not yet saved */}
                    {selectedItems.length > 0 && (
                      <div className="w-full shrink-0 mb-3">
                        <div className="flex flex-col gap-2">
                          {selectedItems.map(itemId => {
                            const note = allNotes.find(n => n.id === itemId);

                            if (note) {
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
                                    disabled={isSaving}
                                  />
                                </div>
                              );
                            }
                            return null;
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* All tab: search/add interface */}
                {activeTab === 'all' && (
                  <div className="w-full flex-1 min-h-0">
                    {isLoadingItems ? (
                      <div className="text-center py-8 text-[var(--color-stone-grey)]">
                        Loading notes...
                      </div>
                    ) : (
                      <AddToSpaceSection
                        allNotes={allNotes}
                        allThreads={[]}
                        currentSpaceId={null}
                        currentThreadId={threadId}
                        onItemSelect={handleItemSelect}
                        selectedItems={selectedItems}
                        isLoading={isSaving}
                        placeholder="Search notes"
                        emptyMessage="No notes found"
                        itemsToShow="notes"
                        currentThreadNoteIds={currentThreadNoteIds}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom buttons */}
        <div className="panel__footer--buttons">
          {/* Back button - SquareButton Back variant */}
          <SquareButton 
            variant="Back"
            onClick={handleClose}
            inBottomSheet={inBottomSheet}
            disabled={isSaving}
          />
        </div>
      </div>
      
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

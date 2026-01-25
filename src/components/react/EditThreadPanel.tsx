import React, { useState, useEffect } from 'react';
import { THREAD_COLORS, getThreadColorCSS, getThreadTextColorCSS, type ThreadColor } from '@/utils/colors';
import SquareButton from './SquareButton';
import ActionButton from './ActionButton';
import AddToSpaceSection from './AddToSpaceSection';
import { safeNavigate } from '@/utils/safe-navigate';
import { safeFetch } from '@/utils/safe-fetch';
import { captureException } from '@/utils/posthog';
import { stripHtmlForPreview } from '@/utils/html-stripper';
import Icon from './Icon';
import { safeURL } from '@/utils/safe-url';
import { updateThreadOffline } from '@/utils/offline-mutations';
import { usePersistedUserId } from '@/utils/user-id';
import { isNetworkError } from '@/utils/network';
import ThreadVisibilityDropdown from './ThreadVisibilityDropdown';

interface Note {
  id: string;
  title: string | null;
  content: string;
  spaceId: string | null;
  noteType?: string;
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

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const userId = usePersistedUserId();
  const [formData, setFormData] = useState({
    title: initialTitle,
    selectedColor: initialColor,
    selectedType: 'Private'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [currentThreadNoteIds, setCurrentThreadNoteIds] = useState<string[]>([]);
  const [currentThreadNotes, setCurrentThreadNotes] = useState<Note[]>([]);
  const [isRemovingNote, setIsRemovingNote] = useState(false);

  // Share settings state
  const [isShared, setIsShared] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);


  // Fetch all notes and current thread notes on mount
  useEffect(() => {
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
          const noteIds = notes.map((note: Note) => note.id);
          setCurrentThreadNoteIds(noteIds);
          setCurrentThreadNotes(notes);
        } else {
          // Failed to fetch - safeFetch handles logging
          setCurrentThreadNoteIds([]);
          setCurrentThreadNotes([]);
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
          setIsShared(data.isPublic || false);
          setShareUrl(data.shareUrl || null);
          if (data.isPublic) {
            setFormData(prev => ({ ...prev, selectedType: 'Shared' }));
          }
        }
      } catch (error) {
        console.error('Failed to fetch share status:', error);
      }
    };

    fetchShareStatus();
  }, [threadId]);

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
        window.dispatchEvent(new CustomEvent('threadUpdated', {
          detail: { threadId }
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

  // Validate form data
  const validateForm = () => {
    const errors: Record<string, string> = {};
    
    if (!formData.title.trim()) {
      errors.title = 'Thread title is required';
    }
    
    if (formData.title.trim().length < 1) {
      errors.title = 'Thread title must be at least 1 character';
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const formDataToSend = new FormData();
      formDataToSend.append('id', threadId);
      formDataToSend.append('title', formData.title.trim());
      formDataToSend.append('color', formData.selectedColor);
      formDataToSend.append('isPublic', 'false');
      
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
        formDataToSend.append('selectedNoteIds', JSON.stringify(selectedNoteIds));
      }

      // OFFLINE-FIRST: Update thread in local IndexedDB immediately
      let offlineUpdateSuccess = false;
      if (userId) {
        try {
          await updateThreadOffline(userId, threadId, {
            title: formData.title,
            color: formData.selectedColor,
          });
          offlineUpdateSuccess = true;
          console.log('[EditThreadPanel] Thread updated locally in IndexedDB', { threadId });
        } catch (err) {
          console.error('[EditThreadPanel] Failed to update thread offline:', err);
          // Continue with server API call
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
        // Network error occurred
        networkError = isNetworkError(error);
        
        if (networkError && offlineUpdateSuccess) {
          // Offline update succeeded - treat as success
          console.log('[EditThreadPanel] Network error but thread updated offline, treating as success', { threadId });
          
          // Show "Saved offline" toast
          window.dispatchEvent(new CustomEvent('toast', {
            detail: {
              message: 'Thread updated offline. It will sync when you\'re back online.',
              type: 'success'
            }
          }));
          
          // Dispatch threadUpdated event
          window.dispatchEvent(new CustomEvent('threadUpdated', {
            detail: { threadId: threadId }
          }));
          
          // Close panel after a short delay
          setTimeout(() => {
            if (onClose) {
              onClose();
            } else {
              window.dispatchEvent(new CustomEvent('closeEditThreadPanel'));
            }
          }, 500);

          // Stay on current page when offline - thread will update from IndexedDB
          const currentUrl = safeURL(window.location.href);
          if (currentUrl) {
            currentUrl.searchParams.set('toast', 'success');
            currentUrl.searchParams.set('message', encodeURIComponent('Thread updated offline. It will sync when you\'re back online.'));
            window.history.replaceState({}, '', currentUrl.toString());
          }
          
          setIsSubmitting(false);
          return;
        } else {
          // Network error but offline update also failed - rethrow
          throw error;
        }
      }

      const data = await response.json();

      if (response && response.ok) {
        // Clear selected items
        setSelectedItems([]);
        
        // Refresh current thread notes if we added any
        if (selectedItems.length > 0) {
          const threadNotesResponse = await fetch(`/api/threads/${threadId}/notes?limit=1000`, {
            credentials: 'include'
          });
          
          if (threadNotesResponse.ok) {
            const threadNotesData = await threadNotesResponse.json();
            const notes = threadNotesData.notes || [];
            const noteIds = notes.map((note: Note) => note.id);
            setCurrentThreadNoteIds(noteIds);
            setCurrentThreadNotes(notes);
          }
        }
        
        // Store threadId in sessionStorage for refresh on navigation
        try {
          const recentlyUpdatedThreads = JSON.parse(sessionStorage.getItem('recentlyUpdatedThreads') || '[]');
          recentlyUpdatedThreads.push({
            threadId: threadId,
            timestamp: Date.now()
          });
          // Keep only last 10 updates
          const trimmed = recentlyUpdatedThreads.slice(-10);
          sessionStorage.setItem('recentlyUpdatedThreads', JSON.stringify(trimmed));
        } catch (error) {
          console.warn('Failed to store thread update in sessionStorage:', error);
        }
        
        // Dispatch threadUpdated event to refresh dashboard
        window.dispatchEvent(new CustomEvent('threadUpdated', {
          detail: { threadId: threadId }
        }));
        
        // Close panel after a short delay
        setTimeout(() => {
          if (onClose) {
            onClose();
          } else {
            window.dispatchEvent(new CustomEvent('closeEditThreadPanel'));
          }
        }, 500);

        // Navigate to show updated thread using View Transitions
        const currentUrl = safeURL(window.location.href);
        if (currentUrl) {
          safeNavigate(currentUrl.pathname + currentUrl.search, { history: 'replace' });
        }
      } else {
        // Check if offline update succeeded
        if (offlineUpdateSuccess) {
          // Offline update succeeded - treat as success
          console.log('[EditThreadPanel] Server error but thread updated offline, treating as success', { threadId });
          
          window.dispatchEvent(new CustomEvent('toast', {
            detail: {
              message: 'Thread updated offline. It will sync when you\'re back online.',
              type: 'success'
            }
          }));
          
          window.dispatchEvent(new CustomEvent('threadUpdated', {
            detail: { threadId: threadId }
          }));
          
          setTimeout(() => {
            if (onClose) {
              onClose();
            } else {
              window.dispatchEvent(new CustomEvent('closeEditThreadPanel'));
            }
          }, 500);

          const currentUrl = safeURL(window.location.href);
          if (currentUrl) {
            currentUrl.searchParams.set('toast', 'success');
            currentUrl.searchParams.set('message', encodeURIComponent('Thread updated offline'));
            safeNavigate(currentUrl.pathname + currentUrl.search, { history: 'replace' });
          }
          
          setIsSubmitting(false);
          return;
        }
        
        console.error('EditThreadPanel: Thread update failed:', data);
        
        // Show error toast
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: data.error || 'Failed to update thread. Please try again.',
            type: 'error'
          }
        }));
      }

    } catch (error) {
      // Check if this is a network error and we have an offline update
      if (isNetworkError(error) && offlineUpdateSuccess) {
        // Network error but offline update succeeded - treat as success
        console.log('[EditThreadPanel] Network error but thread updated offline, treating as success', { threadId });
        
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: 'Thread updated offline. It will sync when you\'re back online.',
            type: 'success'
          }
        }));
        
        window.dispatchEvent(new CustomEvent('threadUpdated', {
          detail: { threadId: threadId }
        }));
        
        setTimeout(() => {
          if (onClose) {
            onClose();
          } else {
            window.dispatchEvent(new CustomEvent('closeEditThreadPanel'));
          }
        }, 500);

        const currentUrl = safeURL(window.location.href);
        if (currentUrl) {
          currentUrl.searchParams.set('toast', 'success');
          currentUrl.searchParams.set('message', encodeURIComponent('Thread updated offline'));
          safeNavigate(currentUrl.pathname + currentUrl.search, { history: 'replace' });
        }
      } else {
        // Real error - log and show error toast
        console.error('❌ EditThreadPanel: Error updating thread:', error);
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: 'Error updating thread. Please try again.',
            type: 'error'
          }
        }));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

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

  // Handle color selection
  const handleColorSelect = (color: ThreadColor) => {
    setFormData(prev => ({ ...prev, selectedColor: color }));
  };

  // Handle close
  const handleClose = () => {
    if (formData.title.trim() !== initialTitle || selectedItems.length > 0) {
      // Show unsaved changes dialog or just close
      // For now, just close - can add dialog later if needed
    }
    
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
    setIsRemovingNote(true);
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
        window.dispatchEvent(new CustomEvent('noteRemovedFromThread', {
          detail: { 
            noteId: noteId,
            threadId: threadId
          }
        }));

        // Refresh current thread notes
        const threadNotesResponse = await fetch(`/api/threads/${threadId}/notes?limit=1000`, {
          credentials: 'include'
        });
        
        if (threadNotesResponse.ok) {
          const threadNotesData = await threadNotesResponse.json();
          const notes = threadNotesData.notes || [];
          const noteIds = notes.map((note: Note) => note.id);
          setCurrentThreadNoteIds(noteIds);
          setCurrentThreadNotes(notes);
        }
      } else {
        const error = await response.json();
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: error.error || 'Error removing note from thread',
            type: 'error'
          }
        }));
      }
    } catch (error) {
      console.error('Error removing note from thread:', error);
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
      <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
        {/* Content area that expands to fill available space */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Single unified panel using CardStack structure */}
          <div className="bg-white box-border flex flex-col min-h-0 flex-1 items-start justify-between overflow-clip pb-6 pt-0 px-0 relative rounded-[24px] shadow-[0px_3px_20px_0px_rgba(120,118,111,0.1)] w-full mb-3.5">
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
                      className={`relative rounded-xl size-10 cursor-pointer transition-all duration-200 ${
                        formData.selectedColor === color ? 'ring-2 ring-[var(--color-deep-grey)] ring-offset-2' : ''
                      }`}
                      style={{ backgroundColor: getThreadColorCSS(color) }}
                    >
                      {/* Check icon for selected color */}
                      {formData.selectedColor === color && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <svg className="size-5" style={{ color: getThreadTextColorCSS(color) }} fill="currentColor" viewBox="0 0 24 24">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                          </svg>
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

                {/* Current Notes in Thread - displayed above selected notes */}
                {!isLoadingItems && (
                  <div className="w-full shrink-0 mb-3">
                    {currentThreadNotes.length === 0 ? (
                      <div className="text-center py-4 text-[var(--color-stone-grey)] text-sm">
                        No notes in this thread.
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {currentThreadNotes.map(note => (
                          <div key={note.id} className="relative group">
                            <a 
                              href={`/${note.id}`}
                              className="block"
                              aria-label={`View note: ${note.title || 'Untitled note'}`}
                            >
                              {renderCompactNoteItem(note)}
                            </a>
                            {/* Remove from thread button */}
                            <ActionButton
                              variant="Remove"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleRemoveFromThread(note.id);
                              }}
                              className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center action-button-hover z-10"
                              disabled={isRemovingNote}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Selected Notes - displayed above AddToSpaceSection */}
                {selectedItems.length > 0 && !isLoadingItems && (
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

                {/* AddToSpaceSection - for selecting notes to add to thread */}
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
                      isLoading={isSubmitting}
                      placeholder="Search notes"
                      emptyMessage="No notes found"
                      itemsToShow="notes"
                      currentThreadNoteIds={currentThreadNoteIds}
                    />
                  )}
                </div>
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
          />
          
          {/* Save Changes button - Button Default variant */}
          <button 
            type="submit"
            disabled={isSubmitting || !formData.title.trim()}
            data-outer-shadow
            className="btn-cta flex-1 group"
            tabIndex={3}
          >
            <span className="btn-cta__content">
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </span>
            <div className="btn-cta__shadow" />
          </button>
        </div>
      </form>
    </div>
  );
}

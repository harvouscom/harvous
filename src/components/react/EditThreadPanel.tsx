import React, { useState, useEffect } from 'react';
import { THREAD_COLORS, getThreadColorCSS, getThreadTextColorCSS, type ThreadColor } from '@/utils/colors';
import SquareButton from './SquareButton';
import CardNote from './CardNote';
import ActionButton from './ActionButton';
import AddToSpaceSection from './AddToSpaceSection';
import { navigate } from 'astro:transitions/client';
import { ButtonGroup } from '@/components/ui/button-group';
import SimpleTooltip from './SimpleTooltip';

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

  // Load Font Awesome for icons
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css';
    if (!document.querySelector(`link[href="${link.href}"]`)) {
      document.head.appendChild(link);
    }
  }, []);

  // Fetch all notes and current thread notes on mount
  useEffect(() => {
    const fetchData = async () => {
      setIsLoadingItems(true);
      try {
        // Fetch all notes
        const notesResponse = await fetch('/api/spaces/items', {
          credentials: 'include'
        });
        
        if (notesResponse.ok) {
          const notesData = await notesResponse.json();
          setAllNotes(notesData.notes || []);
        } else {
          console.error('Failed to fetch notes');
          setAllNotes([]);
        }

        // Fetch current thread notes
        const threadNotesResponse = await fetch(`/api/threads/${threadId}/notes?limit=1000`, {
          credentials: 'include'
        });
        
        if (threadNotesResponse.ok) {
          const threadNotesData = await threadNotesResponse.json();
          const notes = threadNotesData.notes || [];
          const noteIds = notes.map((note: Note) => note.id);
          setCurrentThreadNoteIds(noteIds);
          setCurrentThreadNotes(notes);
        } else {
          console.error('Failed to fetch thread notes');
          setCurrentThreadNoteIds([]);
          setCurrentThreadNotes([]);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        setAllNotes([]);
        setCurrentThreadNoteIds([]);
      } finally {
        setIsLoadingItems(false);
      }
    };

    fetchData();
  }, [threadId]);

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
    
    console.log('EditThreadPanel: handleSubmit called');
    console.log('EditThreadPanel: Form data:', formData);
    
    if (!validateForm()) {
      console.log('EditThreadPanel: Form validation failed');
      return;
    }

    console.log('EditThreadPanel: Form validation passed, starting submission');
    setIsSubmitting(true);

    try {
      console.log('EditThreadPanel: Making API call to update thread');
      console.log('EditThreadPanel: Data being sent:', {
        threadId: threadId,
        title: formData.title.trim(),
        color: formData.selectedColor,
        isPublic: false
      });
      
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

      const response = await fetch('/api/threads/update', {
        method: 'POST',
        body: formDataToSend,
      });

      console.log('EditThreadPanel: API response status:', response.status);
      const data = await response.json();
      console.log('EditThreadPanel: API response data:', data);

      if (response.ok) {
        console.log('✅ EditThreadPanel: Thread updated successfully');
        
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
        
        // Close panel after a short delay
        setTimeout(() => {
          if (onClose) {
            onClose();
          } else {
            window.dispatchEvent(new CustomEvent('closeEditThreadPanel'));
          }
        }, 500);

        // Navigate to show updated thread with URL-based toast using View Transitions
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.set('toast', 'success');
        currentUrl.searchParams.set('message', encodeURIComponent('Thread updated successfully!'));
        navigate(currentUrl.pathname + currentUrl.search, { history: 'replace' });
      } else {
        console.error('❌ EditThreadPanel: Thread update failed:', data);
        
        // Show error toast
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: data.error || 'Failed to update thread. Please try again.',
            type: 'error'
          }
        }));
      }

    } catch (error) {
      console.error('❌ EditThreadPanel: Error updating thread:', error);
      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: 'Error updating thread. Please try again.',
          type: 'error'
        }
      }));
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

  // Helper function to strip HTML from content
  const stripHtml = (html: string): string => {
    if (!html) return '';
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim()
      .substring(0, 150);
  };

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
              <div className="basis-0 font-sans font-bold grow min-h-px min-w-px relative shrink-0 text-[24px] text-center">
                <p className="leading-[normal]">Edit Thread</p>
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

                {/* Thread type selection with ButtonGroup */}
                <div className="w-full">
                  <ButtonGroup className="w-full gap-0">
                    {/* Private button */}
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, selectedType: 'Private' }))}
                      className={`space-button relative rounded-tl-3xl rounded-bl-3xl rounded-tr-none rounded-br-none h-[64px] cursor-pointer transition-[scale,shadow] duration-300 pl-4 pr-4 w-1/2 ${
                        formData.selectedType === 'Private' ? 'ring-2 ring-[var(--color-bold-blue)] ring-offset-2' : ''
                      }`}
                      style={{ backgroundImage: 'var(--color-gradient-gray)' }}
                    >
                      <div className="flex items-center justify-center gap-3 relative w-full h-full transition-transform duration-125">
                        <div className="size-4 flex items-center justify-center shrink-0">
                          <i className="fas fa-user text-[var(--color-deep-grey)]" style={{ fontSize: '16px', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}></i>
                        </div>
                        <span className="text-[var(--color-deep-grey)] font-sans text-[18px] font-semibold whitespace-nowrap">Private</span>
                      </div>
                    </button>
                    
                    {/* Shared button - disabled with tooltip */}
                    <SimpleTooltip content="Coming Soon" enableTooltip={true} className="w-1/2">
                      <button
                        type="button"
                        disabled
                        className="space-button relative rounded-tr-3xl rounded-br-3xl rounded-tl-none rounded-bl-none h-[64px] cursor-not-allowed transition-[scale,shadow] duration-300 pl-4 pr-4 w-full opacity-50"
                        style={{ backgroundImage: 'var(--color-gradient-gray)' }}
                      >
                        <div className="flex items-center justify-center gap-3 relative w-full h-full transition-transform duration-125">
                          <div className="size-4 flex items-center justify-center shrink-0">
                            <i className="fas fa-user-group text-[var(--color-deep-grey)]" style={{ fontSize: '16px', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}></i>
                          </div>
                          <span className="text-[var(--color-deep-grey)] font-sans text-[18px] font-semibold whitespace-nowrap">Shared</span>
                        </div>
                      </button>
                    </SimpleTooltip>
                  </ButtonGroup>
                </div>

                {/* Current Notes in Thread - displayed above selected notes */}
                {!isLoadingItems && (
                  <div className="w-full shrink-0 mb-3">
                    {currentThreadNotes.length === 0 ? (
                      <div className="text-center py-4 text-[var(--color-stone-grey)] text-sm">
                        No notes in this thread.
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {currentThreadNotes.map(note => (
                          <div key={note.id} className="relative group">
                            <a 
                              href={`/${note.id}`}
                              className="block transition-transform duration-200 hover:scale-[1.002]"
                              aria-label={`View note: ${note.title || 'Untitled note'}`}
                            >
                              <CardNote 
                                title={note.title || "Untitled Note"}
                                content={stripHtml(note.content)}
                                noteType={(note.noteType === 'resource' || note.noteType === 'scripture') ? note.noteType : 'default'}
                              />
                            </a>
                            {/* Remove from thread button */}
                            <ActionButton
                              variant="Remove"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleRemoveFromThread(note.id);
                              }}
                              className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10"
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
                    <div className="flex flex-col gap-3">
                      {selectedItems.map(itemId => {
                        const note = allNotes.find(n => n.id === itemId);
                        
                        if (note) {
                          return (
                            <div key={note.id} className="relative group">
                              <a 
                                href={`/${note.id}`}
                                className="block transition-transform duration-200 hover:scale-[1.002]"
                                aria-label={`View note: ${note.title || 'Untitled note'}`}
                              >
                                <CardNote 
                                  title={note.title || "Untitled Note"}
                                  content={stripHtml(note.content)}
                                  noteType={(note.noteType === 'resource' || note.noteType === 'scripture') ? note.noteType : 'default'}
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
                                className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10"
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
        <div className="flex items-center justify-between gap-3 shrink-0">
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
            className="group relative rounded-3xl cursor-pointer transition-[scale,shadow] duration-300 pb-7 pt-6 px-6 flex items-center justify-center font-sans font-semibold text-[18px] leading-[0] text-nowrap text-[var(--color-fog-white)] h-[64px] flex-1 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--color-bold-blue)' }}
            tabIndex={3}
            onClick={() => console.log('EditThreadPanel: Save button clicked, isSubmitting:', isSubmitting, 'title:', formData.title.trim())}
          >
            <div className="relative shrink-0 transition-transform duration-125">
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </div>
            <div className="absolute inset-0 pointer-events-none rounded-3xl transition-shadow duration-125 shadow-[0px_-8px_0px_0px_rgba(0,0,0,0.1)_inset] group-active:!shadow-[0px_-2px_0px_0px_rgba(0,0,0,0.1)_inset]" />
          </button>
        </div>
      </form>
    </div>
  );
}

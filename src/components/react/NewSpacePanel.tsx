import React, { useState, useEffect, useRef } from 'react';
import { THREAD_COLORS, getThreadColorCSS, getThreadGradientCSS, getThreadTextColorCSS, type ThreadColor } from '@/utils/colors';
import SquareButton from './SquareButton';
import AddToSpaceSection from './AddToSpaceSection';
import { captureException } from '@/utils/posthog';
import CardThread from './CardThread';
import CardNote from './CardNote';
import ActionButton from './ActionButton';
import { safeNavigate } from '@/utils/safe-navigate';
import Icon from './Icon';
import UnsavedChangesDialog from './dialogs/UnsavedChangesDialog';

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


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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
      
      const response = await fetch('/api/spaces/create', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (response.ok) {
        const result = await response.json();
        
        // Clear form data
        setTitle('');
        setSelectedColor('paper');
        setSelectedType('Private');
        setSelectedItems([]);
        localStorage.removeItem('newSpaceTitle');
        localStorage.removeItem('newSpaceColor');
        localStorage.removeItem('newSpaceType');
        
        // Dispatch event to notify other components
        // Immediately update localStorage synchronously
        try {
          const spaceColor = result.space.color || 'blue';
          const backgroundGradient = getThreadGradientCSS(spaceColor);
          
          const spaceItem = {
            id: result.space.id,
            title: result.space.title,
            count: result.space.totalItemCount || 0,
            backgroundGradient: backgroundGradient,
            firstAccessed: Date.now(),
            lastAccessed: Date.now()
          };
          
          const navHistory = localStorage.getItem('harvous-navigation-history-v2');
          const history = navHistory ? JSON.parse(navHistory) : [];
          
          // Check if item already exists
          const existingIndex = history.findIndex((h: any) => h.id === spaceItem.id);
          if (existingIndex === -1) {
            history.push(spaceItem);
            history.sort((a: any, b: any) => a.firstAccessed - b.firstAccessed);
            localStorage.setItem('harvous-navigation-history-v2', JSON.stringify(history));
          }
        } catch (error) {
          console.error('Error updating navigation history:', error);
        }

        window.dispatchEvent(new CustomEvent('spaceCreated', {
          detail: { space: result.space }
        }));

        // If onSpaceCreated callback is provided, use it instead of redirecting
        if (onSpaceCreated) {
          onSpaceCreated();
        } else {
          // Default behavior: redirect to the newly created space
          window.dispatchEvent(new CustomEvent('closeNewSpacePanel'));
          if (onClose) {
            onClose();
          }

          // Redirect to the newly created space with toast parameter
          if (result.space && result.space.id) {
            const redirectUrl = `/${result.space.id}?toast=success&message=${encodeURIComponent('Space created successfully!')}`;
            // Add a small delay to ensure localStorage is updated before navigation
            setTimeout(() => {
              safeNavigate(redirectUrl, { history: 'replace' });
            }, 100);
          }
        }
      } else {
        let errorMessage = `Failed to create space: ${response.status}`;
        try {
          const errorText = await response.text();
          console.error('NewSpacePanel: API error response:', errorText);
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorMessage;
        } catch (e) {
          console.error('NewSpacePanel: Could not parse error response');
        }
        throw new Error(errorMessage);
      }
    } catch (error: any) {
      // Track error in PostHog
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

  const handleDiscardChanges = () => {
    setTitle('');
    setSelectedColor('paper');
    setSelectedType('Private');
    setSelectedItems([]);
    localStorage.removeItem('newSpaceTitle');
    localStorage.removeItem('newSpaceColor');
    localStorage.removeItem('newSpaceType');
    setShowUnsavedDialog(false);
    
    window.dispatchEvent(new CustomEvent('closeNewSpacePanel'));
    if (onClose) {
      onClose();
    }
  };

  const handleSaveAndClose = () => {
    setShowUnsavedDialog(false);
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
                  className="w-full bg-transparent border-none text-[24px] font-bold focus:outline-none text-center placeholder:text-[var(--color-pebble-grey)]"
                  style={{ 
                    color: getThreadTextColorCSS(selectedColor)
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
                    
                    {/* Shared button - disabled */}
                    <button
                      type="button"
                      disabled
                      className="space-button button-group__button button-group__button--right button-group__button--disabled h-[64px] bg-transparent"
                    >
                      <div className="flex items-center justify-center gap-3 relative w-full h-full">
                        <div className="size-4 flex items-center justify-center shrink-0">
                          <Icon name="user-group" size={16} style={{ color: 'var(--color-pebble-grey)' }} />
                        </div>
                        <span className="text-[var(--color-pebble-grey)] font-sans text-[18px] font-semibold whitespace-nowrap">Shared</span>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Selected Items - displayed above AddToSpaceSection */}
                {selectedItems.length > 0 && !isLoadingItems && (
                  <div className="w-full shrink-0 mb-3">
                    <div className="panel__item-list">
                      {selectedItems.map(itemId => {
                        const thread = allThreads.find(t => t.id === itemId);
                        const note = allNotes.find(n => n.id === itemId);
                        
                        if (thread) {
                          return (
                            <div key={thread.id} className="panel__item-list-item">
                              <a 
                                href={`/${thread.id}`}
                                className="panel__item-list-item-link"
                                aria-label={`View thread: ${thread.title || 'Untitled thread'}`}
                              >
                                <CardThread thread={thread} />
                              </a>
                              {/* Remove from selection button */}
                              <ActionButton
                                variant="Remove"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleItemSelect(thread.id, 'thread');
                                }}
                                className="panel__item-list-item-actions"
                                disabled={isSubmitting}
                              />
                            </div>
                          );
                        } else if (note) {
                          return (
                            <div key={note.id} className="panel__item-list-item">
                              <a 
                                href={`/${note.id}`}
                                className="panel__item-list-item-link"
                                aria-label={`View note: ${note.title || 'Untitled note'}`}
                              >
                                <CardNote 
                                  title={note.title || "Untitled Note"}
                                  content={stripHtml(note.content)}
                                  noteType={note.noteType || 'default'}
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
          {/* Close button */}
          <SquareButton 
            variant="Close" 
            onClick={handleClose}
            inBottomSheet={inBottomSheet}
          />
          
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
        onCancel={() => setShowUnsavedDialog(false)}
        onDiscard={handleDiscardChanges}
        onSaveAndClose={handleSaveAndClose}
      />
    </div>
  );
}


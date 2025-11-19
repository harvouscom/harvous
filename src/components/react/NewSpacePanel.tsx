import React, { useState, useEffect, useRef } from 'react';
import { THREAD_COLORS, getThreadColorCSS, getThreadGradientCSS, getThreadTextColorCSS, type ThreadColor } from '@/utils/colors';
import SquareButton from './SquareButton';
import ChevronDownIcon from '@fortawesome/fontawesome-free/svgs/solid/chevron-down.svg';
import AddToSpaceSection from './AddToSpaceSection';
import { captureException } from '@/utils/posthog';
import CardThread from './CardThread';
import CardNote from './CardNote';
import ActionButton from './ActionButton';

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
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isDropdownOpen) {
        const target = event.target as HTMLElement;
        if (!target.closest('.dropdown-container')) {
          setIsDropdownOpen(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

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
              if ((window as any).astroNavigate) {
                (window as any).astroNavigate(redirectUrl);
              } else {
                window.location.href = redirectUrl;
              }
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
    <div className="h-full flex flex-col">
      {/* Form */}
      <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
        {/* Content area that expands to fill available space */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Single unified panel using CardStack structure */}
          <div className="bg-white box-border flex flex-col min-h-0 flex-1 items-start justify-between overflow-clip pb-6 pt-0 px-0 relative rounded-[24px] shadow-[0px_3px_20px_0px_rgba(120,118,111,0.1)] w-full h-full mb-3.5">
            {/* Header section with space name input */}
            <div 
              className="box-border content-stretch flex gap-3 items-center justify-center leading-[0] mb-[-24px] not-italic pb-12 pt-6 px-6 relative shrink-0 w-full"
              style={{ 
                backgroundColor: getThreadColorCSS(selectedColor),
                color: getThreadTextColorCSS(selectedColor)
              }}
            >
              <div className="basis-0 font-sans font-bold grow min-h-px min-w-px relative shrink-0 text-[24px]">
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
            <div className="basis-0 box-border content-stretch flex flex-col grow items-start justify-start mb-[-24px] min-h-px min-w-px overflow-clip relative shrink-0 w-full">
              <div className="basis-0 bg-[var(--color-snow-white)] box-border content-stretch flex flex-col gap-3 grow items-start justify-start min-h-px min-w-px overflow-x-clip overflow-y-auto p-[12px] relative rounded-tl-[24px] rounded-tr-[24px] shrink-0 w-full">
                
                {/* Color selection */}
                <div className="color-selection flex gap-2 items-center justify-start w-full">
                  {THREAD_COLORS.map((color) => (
                    <button 
                      key={color}
                      type="button"
                      onClick={() => setSelectedColor(color)}
                      className={`relative rounded-xl size-10 cursor-pointer transition-all duration-200 ${
                        selectedColor === color ? 'ring-2 ring-[var(--color-deep-grey)] ring-offset-2' : ''
                      }`}
                      style={{ backgroundColor: getThreadColorCSS(color) }}
                    >
                      {/* Check icon for selected color */}
                      {selectedColor === color && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <svg className="size-5" style={{ color: getThreadTextColorCSS(color) }} fill="currentColor" viewBox="0 0 24 24">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                          </svg>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
                
                {/* Space type selection with dropdown */}
                <div className="w-full">
                  <div className="relative dropdown-container">
                    <div 
                      onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                      className="w-full cursor-pointer"
                    >
                      <div className="relative w-full">
                        <div className="space-button relative rounded-3xl h-[64px] cursor-pointer transition-[scale,shadow] duration-300 pl-4 pr-0 w-full"
                             style={{ backgroundImage: 'var(--color-gradient-gray)' }}>
                          <div className="flex items-center justify-between relative w-full h-full pl-2 pr-0 transition-transform duration-125">
                            <span className="text-[var(--color-deep-grey)] font-sans text-[18px] font-semibold whitespace-nowrap">
                              {selectedType}
                            </span>
                            <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
                              <img src={ChevronDownIcon.src} alt="Dropdown" className="w-5 h-5" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Dropdown content */}
                    {isDropdownOpen && (
                      <div className="absolute top-full left-0 right-0 mt-2 z-10"
                           style={{ minWidth: '223px' }}
                           onClick={(e) => e.stopPropagation()}>
                        <div>
                          {/* Private option */}
                          <button 
                            type="button"
                            onClick={() => {
                              setSelectedType('Private');
                              setIsDropdownOpen(false);
                            }}
                            className="space-button relative rounded-3xl h-[64px] cursor-pointer transition-[scale,shadow] duration-300 pl-4 pr-0 w-full"
                            style={{ backgroundImage: 'var(--color-gradient-gray)' }}
                          >
                            <div className="flex items-center justify-start relative w-full h-full pl-2 pr-0 transition-transform duration-125">
                              <span className="text-[var(--color-deep-grey)] font-sans text-[18px] font-semibold whitespace-nowrap">Private</span>
                            </div>
                          </button>
                          
                          {/* Shared option - disabled */}
                          <button 
                            type="button"
                            disabled
                            className="space-button relative rounded-3xl h-[64px] cursor-not-allowed transition-[scale,shadow] duration-300 pl-4 pr-0 w-full opacity-50"
                            style={{ backgroundImage: 'var(--color-gradient-gray)' }}
                          >
                            <div className="flex items-center justify-start relative w-full h-full pl-2 pr-0 transition-transform duration-125">
                              <div className="flex flex-col items-start">
                                <span className="text-[var(--color-deep-grey)] font-sans text-[18px] font-semibold whitespace-nowrap">Shared</span>
                                <span className="text-[12px] text-[var(--color-pebble-grey)] font-medium">Coming Soon</span>
                              </div>
                            </div>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Selected Items - displayed above AddToSpaceSection */}
                {selectedItems.length > 0 && !isLoadingItems && (
                  <div className="w-full shrink-0 mb-3">
                    <div className="flex flex-col gap-3">
                      {selectedItems.map(itemId => {
                        const thread = allThreads.find(t => t.id === itemId);
                        const note = allNotes.find(n => n.id === itemId);
                        
                        if (thread) {
                          return (
                            <div key={thread.id} className="relative group">
                              <a 
                                href={`/${thread.id}`}
                                className="block transition-transform duration-200 hover:scale-[1.002]"
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
                                className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10"
                                disabled={isSubmitting}
                              />
                            </div>
                          );
                        } else if (note) {
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

                {/* AddToSpaceSection - replaces tabs */}
                <div className="w-full flex-1 min-h-0">
                  {isLoadingItems ? (
                    <div className="text-center py-8 text-[var(--color-stone-grey)]">
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
                      placeholder="Search to add notes and threads..."
                      emptyMessage="No items found"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom buttons */}
        <div className="flex items-center justify-between gap-3 shrink-0">
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
            className="group relative rounded-3xl cursor-pointer transition-[scale,shadow] duration-300 pb-7 pt-6 px-6 flex items-center justify-center font-sans font-semibold text-[18px] leading-[0] text-nowrap text-[var(--color-fog-white)] h-[64px] flex-1 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--color-bold-blue)' }}
            tabIndex={3}
          >
            <div className="relative shrink-0 transition-transform duration-125">
              {isSubmitting ? 'Creating...' : 'Create Space'}
            </div>
            <div className="absolute inset-0 pointer-events-none rounded-3xl transition-shadow duration-125 shadow-[0px_-8px_0px_0px_rgba(0,0,0,0.1)_inset] group-active:!shadow-[0px_-2px_0px_0px_rgba(0,0,0,0.1)_inset]" />
          </button>
        </div>
      </form>

      {/* Unsaved Changes Dialog */}
      {showUnsavedDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-lg">
            <h3 className="text-lg font-semibold text-[var(--color-deep-grey)] mb-2">
              Unsaved Changes
            </h3>
            <p className="text-[var(--color-deep-grey)] mb-4">
              You have unsaved changes. What would you like to do?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowUnsavedDialog(false)}
                className="px-4 py-2 text-[var(--color-deep-grey)] hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDiscardChanges}
                className="px-4 py-2 bg-[var(--color-stone-grey)] text-white rounded-lg hover:bg-opacity-90 transition-colors"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleSaveAndClose}
                className="px-4 py-2 bg-[var(--color-bold-blue)] text-white rounded-lg hover:bg-opacity-90 transition-colors"
              >
                Save & Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


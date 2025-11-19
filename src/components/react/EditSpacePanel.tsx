import React, { useState, useEffect } from 'react';
import { THREAD_COLORS, getThreadColorCSS, getThreadTextColorCSS, type ThreadColor } from '@/utils/colors';
import SquareButton from './SquareButton';
import ChevronDownIcon from '@fortawesome/fontawesome-free/svgs/solid/chevron-down.svg';
import AddToSpaceSection from './AddToSpaceSection';
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

interface EditSpacePanelProps {
  spaceId: string;
  initialTitle?: string;
  initialColor?: ThreadColor;
  onClose?: () => void;
  inBottomSheet?: boolean;
}

export default function EditSpacePanel({ 
  spaceId,
  initialTitle = '', 
  initialColor = 'paper',
  onClose,
  inBottomSheet = false
}: EditSpacePanelProps) {
  const [formData, setFormData] = useState({
    title: initialTitle,
    selectedColor: initialColor,
    selectedType: 'Private'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [allThreads, setAllThreads] = useState<Thread[]>([]);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [isAddingItems, setIsAddingItems] = useState(false);

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

  // Validate form data
  const validateForm = () => {
    const errors: Record<string, string> = {};
    
    if (!formData.title.trim()) {
      errors.title = 'Space title is required';
    }
    
    if (formData.title.trim().length < 1) {
      errors.title = 'Space title must be at least 1 character';
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle form submission (update space properties)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log('EditSpacePanel: handleSubmit called');
    console.log('EditSpacePanel: Form data:', formData);
    
    if (!validateForm()) {
      console.log('EditSpacePanel: Form validation failed');
      return;
    }

    console.log('EditSpacePanel: Form validation passed, starting submission');
    setIsSubmitting(true);

    try {
      console.log('EditSpacePanel: Making API call to update space');
      console.log('EditSpacePanel: Data being sent:', {
        spaceId: spaceId,
        title: formData.title.trim(),
        color: formData.selectedColor
      });
      
      const formDataToSend = new FormData();
      formDataToSend.append('title', formData.title.trim());
      formDataToSend.append('color', formData.selectedColor);

      const response = await fetch(`/api/spaces/${spaceId}/update`, {
        method: 'POST',
        body: formDataToSend,
        credentials: 'include'
      });

      console.log('EditSpacePanel: API response status:', response.status);
      const data = await response.json();
      console.log('EditSpacePanel: API response data:', data);

      if (response.ok) {
        console.log('✅ EditSpacePanel: Space updated successfully');
        
        // Add selected items to the space
        if (selectedItems.length > 0) {
          await addItemsToSpace();
        }
        
        // Close panel after a short delay
        setTimeout(() => {
          if (onClose) {
            onClose();
          } else {
            window.dispatchEvent(new CustomEvent('closeEditSpacePanel'));
          }
        }, 500);

        // Refresh the page to show updated space with URL-based toast
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.set('toast', 'success');
        currentUrl.searchParams.set('message', encodeURIComponent('Space updated successfully!'));
        window.history.replaceState({}, '', currentUrl.toString());
        window.location.reload();
      } else {
        console.error('❌ EditSpacePanel: Space update failed:', data);
        
        // Show error toast
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: data.error || 'Failed to update space. Please try again.',
            type: 'error'
          }
        }));
      }

    } catch (error) {
      console.error('❌ EditSpacePanel: Error updating space:', error);
      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: 'Error updating space. Please try again.',
          type: 'error'
        }
      }));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Add selected items to the space
  const addItemsToSpace = async () => {
    if (selectedItems.length === 0) return;

    setIsAddingItems(true);
    try {
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

      const response = await fetch(`/api/spaces/${spaceId}/add-items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          noteIds: selectedNoteIds,
          threadIds: selectedThreadIds
        }),
        credentials: 'include'
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Items added to space:', result);
        setSelectedItems([]); // Clear selected items after successful addition
      } else {
        const error = await response.json();
        console.error('Failed to add items to space:', error);
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: error.error || 'Failed to add items to space',
            type: 'error'
          }
        }));
      }
    } catch (error) {
      console.error('Error adding items to space:', error);
      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: 'Error adding items to space',
          type: 'error'
        }
      }));
    } finally {
      setIsAddingItems(false);
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
    if (onClose) {
      onClose();
    } else {
      window.dispatchEvent(new CustomEvent('closeEditSpacePanel'));
    }
  };

  const handleItemSelect = (itemId: string, itemType: 'note' | 'thread') => {
    setSelectedItems(prev => {
      if (prev.includes(itemId)) {
        // Remove if already selected
        return prev.filter(id => id !== itemId);
      } else {
        // Add if not selected
        return [...prev, itemId];
      }
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
                <p className="leading-[normal]">Edit Space</p>
              </div>
            </div>
            
            {/* Content area */}
            <div className="flex-1 box-border content-stretch flex flex-col items-start justify-start mb-[-24px] min-h-0 overflow-clip relative w-full">
              <div className="flex-1 bg-[var(--color-snow-white)] box-border content-stretch flex flex-col gap-3 items-start justify-start min-h-0 overflow-x-clip overflow-y-auto p-[12px] relative rounded-tl-[24px] rounded-tr-[24px] w-full">
                
                {/* Space Title Input */}
                <div className="search-input rounded-3xl py-5 px-4 min-h-[64px] w-full">
                  <input 
                    type="text"
                    value={formData.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    placeholder={formData.title ? '' : 'Space Title'}
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
                              {formData.selectedType}
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
                              setFormData(prev => ({ ...prev, selectedType: 'Private' }));
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
                                variant="Close"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleItemSelect(thread.id, 'thread');
                                }}
                                className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10"
                                disabled={isAddingItems}
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
                                variant="Close"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleItemSelect(note.id, 'note');
                                }}
                                className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10"
                                disabled={isAddingItems}
                              />
                            </div>
                          );
                        }
                        return null;
                      })}
                    </div>
                  </div>
                )}

                {/* AddToSpaceSection - for adding items to existing space */}
                <div className="w-full flex-1 min-h-0">
                  {isLoadingItems ? (
                    <div className="text-center py-8 text-[var(--color-stone-grey)]">
                      Loading items...
                    </div>
                  ) : (
                    <AddToSpaceSection
                      allNotes={allNotes}
                      allThreads={allThreads}
                      currentSpaceId={spaceId}
                      onItemSelect={handleItemSelect}
                      selectedItems={selectedItems}
                      isLoading={isAddingItems}
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
          {/* Back button */}
          <SquareButton 
            variant="Back"
            onClick={handleClose}
            inBottomSheet={inBottomSheet}
          />
          
          {/* Save Changes button */}
          <button 
            type="submit"
            disabled={isSubmitting || !formData.title.trim()}
            data-outer-shadow
            className="group relative rounded-3xl cursor-pointer transition-[scale,shadow] duration-300 pb-7 pt-6 px-6 flex items-center justify-center font-sans font-semibold text-[18px] leading-[0] text-nowrap text-[var(--color-fog-white)] h-[64px] flex-1 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--color-bold-blue)' }}
            tabIndex={3}
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


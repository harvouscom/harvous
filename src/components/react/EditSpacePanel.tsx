import React, { useState, useEffect } from 'react';
import { THREAD_COLORS, getThreadColorCSS, getThreadTextColorCSS, type ThreadColor } from '@/utils/colors';
import SquareButton from './SquareButton';
import AddToSpaceSection from './AddToSpaceSection';
import CardThread from './CardThread';
import CardNote from './CardNote';
import ActionButton from './ActionButton';
import { navigate } from 'astro:transitions/client';
import { ButtonGroup } from '@/components/ui/button-group';
import SimpleTooltip from './SimpleTooltip';

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
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [allThreads, setAllThreads] = useState<Thread[]>([]);
  const [currentSpaceNotes, setCurrentSpaceNotes] = useState<Note[]>([]);
  const [currentSpaceThreads, setCurrentSpaceThreads] = useState<Thread[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [isLoadingCurrentItems, setIsLoadingCurrentItems] = useState(true);
  const [isAddingItems, setIsAddingItems] = useState(false);
  const [isRemovingItem, setIsRemovingItem] = useState(false);

  // Load Font Awesome for icons
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css';
    if (!document.querySelector(`link[href="${link.href}"]`)) {
      document.head.appendChild(link);
    }
  }, []);

  // Fetch all notes and threads (for AddToSpaceSection)
  const fetchAllItems = async () => {
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

  // Fetch all notes and threads on mount
  useEffect(() => {
    fetchAllItems();
  }, []);

  // Fetch current items in the space
  const fetchCurrentSpaceItems = async () => {
    setIsLoadingCurrentItems(true);
    try {
      const response = await fetch(`/api/spaces/${spaceId}/items`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        setCurrentSpaceNotes(data.notes || []);
        setCurrentSpaceThreads(data.threads || []);
      } else {
        console.error('Failed to fetch current space items');
        setCurrentSpaceNotes([]);
        setCurrentSpaceThreads([]);
      }
    } catch (error) {
      console.error('Error fetching current space items:', error);
      setCurrentSpaceNotes([]);
      setCurrentSpaceThreads([]);
    } finally {
      setIsLoadingCurrentItems(false);
    }
  };

  // Fetch current space items on mount and when spaceId changes
  useEffect(() => {
    if (spaceId) {
      fetchCurrentSpaceItems();
    }
  }, [spaceId]);

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
        
        // Close panel after a short delay
        setTimeout(() => {
          if (onClose) {
            onClose();
          } else {
            window.dispatchEvent(new CustomEvent('closeEditSpacePanel'));
          }
        }, 500);

        // Navigate to show updated space with URL-based toast using View Transitions
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.set('toast', 'success');
        currentUrl.searchParams.set('message', encodeURIComponent('Space updated successfully!'));
        navigate(currentUrl.pathname + currentUrl.search, { history: 'replace' });
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

  // Remove items from space
  const handleRemoveFromSpace = async (itemId: string, itemType: 'note' | 'thread') => {
    setIsRemovingItem(true);
    try {
      const noteIds = itemType === 'note' ? [itemId] : [];
      const threadIds = itemType === 'thread' ? [itemId] : [];

      const response = await fetch(`/api/spaces/${spaceId}/remove-items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          noteIds,
          threadIds
        }),
        credentials: 'include'
      });

      if (response.ok) {
        const result = await response.json();
        
        // Show success toast
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: itemType === 'note' ? 'Note removed from space' : 'Thread removed from space',
            type: 'success'
          }
        }));

        // Dispatch event for item removed from space
        window.dispatchEvent(new CustomEvent('itemRemovedFromSpace', {
          detail: { itemId, itemType, spaceId }
        }));

        // Refresh current space items and all items (so removed item appears in available list)
        await Promise.all([
          fetchCurrentSpaceItems(),
          fetchAllItems()
        ]);
      } else {
        const error = await response.json();
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: error.error || `Error removing ${itemType} from space`,
            type: 'error'
          }
        }));
      }
    } catch (error) {
      console.error('Error removing item from space:', error);
      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: `Error removing ${itemType} from space. Please try again.`,
          type: 'error'
        }
      }));
    } finally {
      setIsRemovingItem(false);
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

  // Handle item selection - immediately add to space
  const handleItemSelect = async (itemId: string, itemType: 'note' | 'thread') => {
    setIsAddingItems(true);
    try {
      const noteIds = itemType === 'note' ? [itemId] : [];
      const threadIds = itemType === 'thread' ? [itemId] : [];

      const response = await fetch(`/api/spaces/${spaceId}/add-items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          noteIds,
          threadIds
        }),
        credentials: 'include'
      });

      if (response.ok) {
        const result = await response.json();
        
        // Show success toast
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: itemType === 'note' ? 'Note added to space' : 'Thread added to space',
            type: 'success'
          }
        }));

        // Refresh current space items and all items (so added item disappears from available list)
        await Promise.all([
          fetchCurrentSpaceItems(),
          fetchAllItems()
        ]);
      } else {
        const error = await response.json();
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: error.error || `Failed to add ${itemType} to space`,
            type: 'error'
          }
        }));
      }
    } catch (error) {
      console.error('Error adding item to space:', error);
      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: `Error adding ${itemType} to space. Please try again.`,
          type: 'error'
        }
      }));
    } finally {
      setIsAddingItems(false);
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

                {/* Space type selection with ButtonGroup */}
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

                {/* Current Items in Space - displayed above AddToSpaceSection */}
                {!isLoadingCurrentItems && (currentSpaceNotes.length > 0 || currentSpaceThreads.length > 0) && (
                  <div className="w-full shrink-0 mb-3">
                    <div className="flex flex-col gap-3">
                      {/* Current Threads */}
                      {currentSpaceThreads.map(thread => (
                        <div key={thread.id} className="relative group">
                          <a 
                            href={`/${thread.id}`}
                            className="block transition-transform duration-200 hover:scale-[1.002]"
                            aria-label={`View thread: ${thread.title || 'Untitled thread'}`}
                          >
                            <CardThread thread={thread} />
                          </a>
                          {/* Remove from space button */}
                          <ActionButton
                            variant="Remove"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleRemoveFromSpace(thread.id, 'thread');
                            }}
                            className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10"
                            disabled={isRemovingItem}
                          />
                        </div>
                      ))}
                      
                      {/* Current Notes */}
                      {currentSpaceNotes.map(note => (
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
                          {/* Remove from space button */}
                          <ActionButton
                            variant="Remove"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleRemoveFromSpace(note.id, 'note');
                            }}
                            className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10"
                            disabled={isRemovingItem}
                          />
                        </div>
                      ))}
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
                      selectedItems={[]}
                      isLoading={isAddingItems}
                      placeholder="Search notes and threads"
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


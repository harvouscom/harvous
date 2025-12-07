import React, { useState, useEffect } from 'react';
import { THREAD_COLORS, getThreadColorCSS, getThreadTextColorCSS, type ThreadColor } from '@/utils/colors';
import SquareButton from './SquareButton';
import AddToSpaceSection from './AddToSpaceSection';
import ActionButton from './ActionButton';
import { safeNavigate } from '@/utils/safe-navigate';
import Icon from './Icon';

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
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const formDataToSend = new FormData();
      formDataToSend.append('title', formData.title.trim());
      formDataToSend.append('color', formData.selectedColor);

      const response = await fetch(`/api/spaces/${spaceId}/update`, {
        method: 'POST',
        body: formDataToSend,
        credentials: 'include'
      });

      const data = await response.json();

      if (response.ok) {
        // Close panel after a short delay
        setTimeout(() => {
          if (onClose) {
            onClose();
          } else {
            window.dispatchEvent(new CustomEvent('closeEditSpacePanel'));
          }
        }, 500);

        // Navigate to show updated space using View Transitions
        const currentUrl = new URL(window.location.href);
        safeNavigate(currentUrl.pathname + currentUrl.search, { history: 'replace' });
      } else {
        console.error('EditSpacePanel: Space update failed:', data);
        
        // Show error toast
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: data.error || 'Failed to update space. Please try again.',
            type: 'error'
          }
        }));
      }

    } catch (error) {
      console.error('EditSpacePanel: Error updating space:', error);
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

  // Render compact thread item (similar to ThreadItem in AddToSpaceSection)
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
                    {thread.count ?? thread.noteCount ?? 0}
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
            backgroundColor: 'var(--color-paper)'
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
          {/* Note type icon - default bookmark */}
          <div style={{ position: 'relative', flexShrink: 0, width: '1.25rem', height: '1.25rem' }}>
            <svg style={{ display: 'block', maxWidth: 'none', width: '100%', height: '100%', color: 'var(--color-deep-grey)', opacity: 0.3 }} fill="currentColor" viewBox="0 0 24 24">
              <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
            </svg>
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

  return (
    <div className={`panel-wrapper h-full ${inBottomSheet ? 'panel-wrapper--bottom-sheet' : ''}`}>
      <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
        {/* Content area that expands to fill available space */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Panel container */}
          <div className={`panel h-full flex-1 ${inBottomSheet ? 'panel--bottom-sheet' : ''}`}>
            {/* Header section with dynamic background */}
            <div 
              className="panel__header"
              style={{ 
                backgroundColor: getThreadColorCSS(formData.selectedColor),
                color: getThreadTextColorCSS(formData.selectedColor)
              }}
            >
              <div className="panel__title">
                <p>Edit Space</p>
              </div>
            </div>
            
            {/* Content area */}
            <div className={`panel__body ${inBottomSheet ? 'panel__body--bottom-sheet' : ''}`}>
              <div className={`panel__content ${inBottomSheet ? 'panel__content--bottom-sheet' : ''}`}>
                
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
                <div className="button-group">
                  <div className="button-group__container">
                    {/* Private button */}
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, selectedType: 'Private' }))}
                      className={`space-button button-group__button button-group__button--left h-[64px] ${
                        formData.selectedType === 'Private' 
                          ? '' 
                          : 'bg-transparent'
                      }`}
                      style={formData.selectedType === 'Private' ? { 
                        backgroundImage: 'var(--color-gradient-gray)' 
                      } : {}}
                    >
                      <div className="flex items-center justify-center gap-3 relative w-full h-full">
                        <div className="size-4 flex items-center justify-center shrink-0">
                          <Icon 
                            name="user" 
                            size={16} 
                            style={{ 
                              color: formData.selectedType === 'Private' 
                                ? 'var(--color-deep-grey)' 
                                : 'var(--color-pebble-grey)' 
                            }} 
                          />
                        </div>
                        <span 
                          className={`font-sans text-[18px] font-semibold whitespace-nowrap ${
                            formData.selectedType === 'Private' 
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

                {/* Current Items in Space - displayed above AddToSpaceSection */}
                {!isLoadingCurrentItems && (currentSpaceNotes.length > 0 || currentSpaceThreads.length > 0) && (
                  <div className="w-full shrink-0 mb-3">
                    <div className="flex flex-col gap-2">
                      {/* Current Threads */}
                      {currentSpaceThreads.map(thread => (
                        <div key={thread.id} className="relative group">
                          <a 
                            href={`/${thread.id}`}
                            className="block"
                            aria-label={`View thread: ${thread.title || 'Untitled thread'}`}
                          >
                            {renderCompactThreadItem(thread)}
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
                            className="block"
                            aria-label={`View note: ${note.title || 'Untitled note'}`}
                          >
                            {renderCompactNoteItem(note)}
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
        <div className="panel__footer--buttons">
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


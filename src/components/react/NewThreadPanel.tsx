import React, { useState, useEffect, useRef } from 'react';
import { THREAD_COLORS, getThreadColorCSS, getThreadGradientCSS, getThreadTextColorCSS, type ThreadColor } from '@/utils/colors';
import CardNote from '@/components/react/CardNote';
import SquareButton from './SquareButton';
import ActionButton from './ActionButton';
import AddToSpaceSection from './AddToSpaceSection';
import { captureException } from '@/utils/posthog';
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

interface NewThreadPanelProps {
  currentSpace?: any;
  onClose?: () => void;
  onThreadCreated?: () => void;
  // Edit mode props
  threadId?: string;
  initialTitle?: string;
  initialColor?: ThreadColor;
}

export default function NewThreadPanel({ currentSpace, onClose, onThreadCreated, threadId, initialTitle, initialColor }: NewThreadPanelProps) {
  const [title, setTitle] = useState('');
  const [selectedColor, setSelectedColor] = useState<ThreadColor>('paper');
  const [selectedType, setSelectedType] = useState('Private');
  // Tab navigation disabled for v1
  // const [activeTab, setActiveTab] = useState('recent');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  // const [recentNotes, setRecentNotes] = useState<any[]>([]);
  // const [isLoadingNotes, setIsLoadingNotes] = useState(false);
  const [addToSpace, setAddToSpace] = useState(false);
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  // Shared functionality disabled for now
  // const [isShared, setIsShared] = useState(false);
  // const [sharedSettings, setSharedSettings] = useState({
  //   allowComments: true,
  //   allowReactions: true,
  //   visibility: 'space' // 'space', 'public', 'invite-only'
  // });

  // Ref for auto-focusing the thread name input
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Detect edit mode
  const isEditMode = !!threadId;

  // Load data from localStorage on mount (create mode) or use initial data (edit mode)
  useEffect(() => {
    if (isEditMode) {
      // Edit mode: use initial data
      setTitle(initialTitle || '');
      setSelectedColor(initialColor || 'paper');
      setSelectedType('Private'); // Always private for now
      // Tab navigation disabled for v1
      // setActiveTab('recent');
    } else {
      // Create mode: load from localStorage (except color, which always starts as 'paper')
      const savedTitle = localStorage.getItem('newThreadTitle') || '';
      // Always start with 'paper' color in create mode, don't load from localStorage
      const savedType = localStorage.getItem('newThreadType') || 'Private';
      // Tab navigation disabled for v1
      // const savedTab = localStorage.getItem('newThreadActiveTab') || 'recent';
      setTitle(savedTitle);
      setSelectedColor('paper'); // Always start with 'paper' in create mode
      setSelectedType(savedType);
      // setActiveTab(savedTab);
    }
  }, [isEditMode, initialTitle, initialColor]);

  // Initialize space checkbox when currentSpace is provided (create mode only)
  useEffect(() => {
    if (!isEditMode && currentSpace && currentSpace.id) {
      setAddToSpace(true);
    }
  }, [currentSpace, isEditMode]);

  // Save data to localStorage on change (create mode only)
  useEffect(() => {
    if (!isEditMode) {
      localStorage.setItem('newThreadTitle', title);
    }
  }, [title, isEditMode]);

  useEffect(() => {
    if (!isEditMode) {
      localStorage.setItem('newThreadColor', selectedColor);
    }
  }, [selectedColor, isEditMode]);

  useEffect(() => {
    if (!isEditMode) {
      localStorage.setItem('newThreadType', selectedType);
    }
  }, [selectedType, isEditMode]);

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

  // Fetch all notes on mount (create mode only)
  useEffect(() => {
    if (!isEditMode) {
      const fetchItems = async () => {
        setIsLoadingItems(true);
        try {
          const response = await fetch('/api/spaces/items', {
            credentials: 'include'
          });
          
          if (response.ok) {
            const data = await response.json();
            setAllNotes(data.notes || []);
          } else {
            console.error('Failed to fetch items');
            setAllNotes([]);
          }
        } catch (error) {
          console.error('Error fetching items:', error);
          setAllNotes([]);
        } finally {
          setIsLoadingItems(false);
        }
      };

      fetchItems();
    }
  }, [isEditMode]);

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

  // Load Font Awesome for icons
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css';
    if (!document.querySelector(`link[href="${link.href}"]`)) {
      document.head.appendChild(link);
    }
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
    
    console.log('NewThreadPanel: handleSubmit called');
    console.log('Title:', title);
    console.log('Selected color:', selectedColor);
    console.log('Selected type:', selectedType);
    console.log('Is edit mode:', isEditMode);

    console.log('NewThreadPanel: Starting submission');
    setIsSubmitting(true);
    console.log('NewThreadPanel: isSubmitting set to true');

    try {
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('color', selectedColor);
      formData.append('isPublic', 'false'); // Always private for now
      
      if (isEditMode) {
        formData.append('threadId', threadId!);
        console.log('NewThreadPanel: Sending request to /api/threads/update');
        console.log('Form data:', {
          threadId: threadId,
          title: title.trim(),
          color: selectedColor,
          isPublic: false,
        });
        
        const response = await fetch('/api/threads/update', {
          method: 'POST',
          body: formData,
          credentials: 'include'
        });

        console.log('NewThreadPanel: Response status:', response.status);
        console.log('NewThreadPanel: Response ok:', response.ok);

        if (response.ok) {
          const result = await response.json();
          console.log('NewThreadPanel: Thread updated successfully:', result);
          
          // Close panel
          window.dispatchEvent(new CustomEvent('closeEditThreadPanel'));
          
          if (onClose) {
            onClose();
          }
          
          // Navigate to show updated thread with URL-based toast using View Transitions
          const currentUrl = new URL(window.location.href);
          currentUrl.searchParams.set('toast', 'success');
          currentUrl.searchParams.set('message', encodeURIComponent('Thread updated successfully!'));
          navigate(currentUrl.pathname + currentUrl.search, { history: 'replace' });
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
        
        console.log('NewThreadPanel: Sending request to /api/threads/create');
        console.log('Form data:', {
          title: title.trim(),
          color: selectedColor,
          isPublic: false,
          spaceId: currentSpace?.id || null,
          selectedNoteIds: selectedNoteIds,
        });
        
        const response = await fetch('/api/threads/create', {
          method: 'POST',
          body: formData,
          credentials: 'include'
        });

        console.log('NewThreadPanel: Response status:', response.status);
        console.log('NewThreadPanel: Response ok:', response.ok);

        if (response.ok) {
          const result = await response.json();
          console.log('NewThreadPanel: Thread created successfully:', result);
          
          // Clear form data
          setTitle('');
          setSelectedColor('paper');
          setSelectedType('Private');
          setSelectedItems([]);
          // Tab navigation disabled for v1
          // setActiveTab('recent');
          localStorage.removeItem('newThreadTitle');
          localStorage.removeItem('newThreadColor');
          localStorage.removeItem('newThreadType');
          // localStorage.removeItem('newThreadActiveTab');
          
          // Dispatch event to notify other components
          console.log('NewThreadPanel: Dispatching threadCreated event with thread:', result.thread);

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

          window.dispatchEvent(new CustomEvent('threadCreated', {
            detail: { thread: result.thread }
          }));
          console.log('NewThreadPanel: threadCreated event dispatched successfully');

          // If onThreadCreated callback is provided, use it instead of redirecting
          if (onThreadCreated) {
            console.log('NewThreadPanel: Using onThreadCreated callback instead of redirecting');
            // Call the callback (it will handle closing the panel and refreshing)
            onThreadCreated();
          } else {
            // Default behavior: redirect to the newly created thread
            // Close panel
            window.dispatchEvent(new CustomEvent('closeNewThreadPanel'));
            // Default behavior: redirect to the newly created thread
            if (onClose) {
              onClose();
            }

            // Redirect to the newly created thread with toast parameter
            if (result.thread && result.thread.id) {
              console.log('NewThreadPanel: Redirecting to thread:', result.thread.id);
              const redirectUrl = `/${result.thread.id}?toast=success&message=${encodeURIComponent('Thread created successfully!')}`;
              // Add a small delay to ensure localStorage is updated before navigation
              setTimeout(() => {
                navigate(redirectUrl, { history: 'replace' });
              }, 50);
            }
          }
        } else {
          let errorMessage = `Failed to create thread: ${response.status}`;
          try {
            const errorText = await response.text();
            console.error('NewThreadPanel: API error response:', errorText);
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.error || errorMessage;
          } catch (e) {
            // If response isn't JSON, use status text
            console.error('NewThreadPanel: Could not parse error response');
          }
          throw new Error(errorMessage);
        }
      }
    } catch (error: any) {
      // Track error in PostHog
      if (typeof window !== 'undefined' && window.posthog) {
        captureException(error, {
          context: 'thread_creation',
          endpoint: '/api/threads/create',
        });
      }
      
      console.error('NewThreadPanel: Error:', error);
      const errorMessage = error instanceof Error ? error.message : `Failed to ${isEditMode ? 'update' : 'create'} thread. Please try again.`;
      console.error('NewThreadPanel: Error message:', errorMessage);
      if (window.toast) {
        window.toast.error(errorMessage);
      } else {
        alert(errorMessage);
      }
    } finally {
      console.log('NewThreadPanel: Submission finished, setting isSubmitting to false');
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
      // Dispatch close event for event system
      window.dispatchEvent(new CustomEvent('closeNewThreadPanel'));
      
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
    // Tab navigation disabled for v1
    // setActiveTab('recent');
    localStorage.removeItem('newThreadTitle');
    localStorage.removeItem('newThreadColor');
    localStorage.removeItem('newThreadType');
    // localStorage.removeItem('newThreadActiveTab');
    setShowUnsavedDialog(false);
    
    // Dispatch close event for event system
    window.dispatchEvent(new CustomEvent('closeNewThreadPanel'));
    
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
      <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
        {/* Content area that expands to fill available space */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Single unified panel using CardStack structure */}
          <div className="bg-white box-border flex flex-col min-h-0 flex-1 items-start justify-between overflow-clip pb-6 pt-0 px-0 relative rounded-[24px] shadow-[0px_3px_20px_0px_rgba(120,118,111,0.1)] w-full h-full mb-3.5">
            {/* Header section with thread name input */}
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
                  placeholder="Thread name"
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
                
                {/* Space Checkbox - Only show when currentSpace is provided (create mode only) */}
                {!isEditMode && currentSpace && currentSpace.id && (
                  <div className="w-full">
                    <button
                      type="button"
                      onClick={() => setAddToSpace(!addToSpace)}
                      className="space-button relative rounded-3xl h-[64px] cursor-pointer transition-[scale,shadow] duration-300 pl-4 pr-0 w-full"
                      style={{ 
                        backgroundImage: addToSpace 
                          ? (currentSpace.backgroundGradient || getThreadGradientCSS(currentSpace.color || 'paper'))
                          : 'var(--color-gradient-gray)'
                      }}
                    >
                      <div className="flex items-center justify-between relative w-full h-full pl-2 pr-0 transition-transform duration-125">
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
                            <i 
                              className="fa-solid fa-check text-[20px]" 
                              style={{ color: getThreadTextColorCSS(currentSpace.color || 'paper') }}
                            />
                          </div>
                        )}
                      </div>
                    </button>
                  </div>
                )}
                
                {/* Thread type selection with ButtonGroup */}
                <div className="w-full">
                  <ButtonGroup className="w-full gap-0">
                    {/* Private button */}
                    <button
                      type="button"
                      onClick={() => setSelectedType('Private')}
                      className={`space-button relative rounded-tl-3xl rounded-bl-3xl rounded-tr-none rounded-br-none h-[64px] cursor-pointer transition-[scale,shadow] duration-300 pl-4 pr-4 w-1/2 ${
                        selectedType === 'Private' ? 'ring-2 ring-[var(--color-bold-blue)] ring-offset-2' : ''
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

                {/* Selected Notes - displayed above AddToSpaceSection (create mode only) */}
                {!isEditMode && selectedItems.length > 0 && !isLoadingItems && (
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

                {/* AddToSpaceSection - for selecting notes to add to thread (create mode only) */}
                {!isEditMode && (
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
                        onItemSelect={handleItemSelect}
                        selectedItems={selectedItems}
                        isLoading={isSubmitting}
                        placeholder="Search notes"
                        emptyMessage="No notes found"
                        itemsToShow="notes"
                      />
                    )}
                  </div>
                )}

                {/* Tab navigation disabled for v1 */}
                {/* <div className="w-full">
                  <div className="flex flex-col gap-3">
                    <div className="tab-nav-container">
                      <div className="flex items-center justify-start gap-0 pb-0 pt-1 px-1 relative w-full">
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
                            <div className="text-center py-8 text-gray-500">
                              Loading recent notes...
                            </div>
                          ) : recentNotes.length > 0 ? (
                            <div className="grid grid-cols-1 gap-4">
                              {recentNotes.map((note) => (
                                <CardNote
                                  key={note.id}
                                  title={note.title}
                                  content={note.content}
                                  onClick={() => {
                                    navigate(`/note_${note.id}`, { history: 'replace' });
                                  }}
                                />
                              ))}
                            </div>
                          ) : (
                            <div className="text-center py-8 text-gray-500">
                              No recent notes found
                            </div>
                          )}
                        </div>
                      )}
                      {activeTab === 'search' && (
                        <div className="text-center py-8 text-gray-500">
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

        {/* Bottom buttons */}
        <div className="flex items-center justify-between gap-3 shrink-0">
          {/* Close button using SquareButton Close variant */}
          <SquareButton 
            variant="Close" 
            onClick={handleClose}
          />
          
          {/* Create Thread button - Button Default variant */}
          <button 
            type="submit"
            disabled={isSubmitting}
            data-outer-shadow
            className="group relative rounded-3xl cursor-pointer transition-[scale,shadow] duration-300 pb-7 pt-6 px-6 flex items-center justify-center font-sans font-semibold text-[18px] leading-[0] text-nowrap text-[var(--color-fog-white)] h-[64px] flex-1 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--color-bold-blue)' }}
            tabIndex={3}
            onClick={() => console.log('Create button clicked, isSubmitting:', isSubmitting)}
          >
            <div className="relative shrink-0 transition-transform duration-125">
              {isSubmitting ? 'Creating...' : 'Create Thread'}
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

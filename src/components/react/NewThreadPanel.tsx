import React, { useState, useEffect } from 'react';
import { THREAD_COLORS, getThreadColorCSS, type ThreadColor } from '@/utils/colors';
import { SimpleSwitch } from '@/components/ui/simple-switch';
import CardNote from '@/components/react/CardNote';

interface NewThreadPanelProps {
  currentSpace?: any;
  onClose?: () => void;
}

export default function NewThreadPanel({ currentSpace, onClose }: NewThreadPanelProps) {
  const [title, setTitle] = useState('');
  const [selectedColor, setSelectedColor] = useState<ThreadColor>('paper');
  const [selectedType, setSelectedType] = useState('Private');
  const [activeTab, setActiveTab] = useState('recent');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [recentNotes, setRecentNotes] = useState<any[]>([]);
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);
  // Shared functionality disabled for now
  // const [isShared, setIsShared] = useState(false);
  // const [sharedSettings, setSharedSettings] = useState({
  //   allowComments: true,
  //   allowReactions: true,
  //   visibility: 'space' // 'space', 'public', 'invite-only'
  // });

  // Load data from localStorage on mount
  useEffect(() => {
    const savedTitle = localStorage.getItem('newThreadTitle') || '';
    const savedColor = localStorage.getItem('newThreadColor') || 'paper';
    const savedType = localStorage.getItem('newThreadType') || 'Private';
    const savedTab = localStorage.getItem('newThreadActiveTab') || 'recent';
    setTitle(savedTitle);
    setSelectedColor(savedColor);
    setSelectedType(savedType);
    setActiveTab(savedTab);
  }, []);


  // Save data to localStorage on change
  useEffect(() => {
    localStorage.setItem('newThreadTitle', title);
  }, [title]);

  useEffect(() => {
    localStorage.setItem('newThreadColor', selectedColor);
  }, [selectedColor]);

  useEffect(() => {
    localStorage.setItem('newThreadType', selectedType);
  }, [selectedType]);

  useEffect(() => {
    localStorage.setItem('newThreadActiveTab', activeTab);
  }, [activeTab]);

  // Fetch recent notes when component mounts or tab changes to recent
  useEffect(() => {
    if (activeTab === 'recent') {
      fetchRecentNotes();
    }
  }, [activeTab]);

  const fetchRecentNotes = async () => {
    setIsLoadingNotes(true);
    try {
      const response = await fetch('/api/notes/recent');
      if (response.ok) {
        const notes = await response.json();
        setRecentNotes(notes);
      } else {
        console.error('Failed to fetch recent notes');
        setRecentNotes([]);
      }
    } catch (error) {
      console.error('Error fetching recent notes:', error);
      setRecentNotes([]);
    } finally {
      setIsLoadingNotes(false);
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log('NewThreadPanel: handleSubmit called');
    console.log('Title:', title);
    console.log('Selected color:', selectedColor);
    console.log('Selected type:', selectedType);
    
    if (!title.trim()) {
      console.log('NewThreadPanel: No title provided, returning');
      return;
    }

    console.log('NewThreadPanel: Starting submission');
    setIsSubmitting(true);
    console.log('NewThreadPanel: isSubmitting set to true');

    try {
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('color', selectedColor);
      formData.append('isPublic', 'false'); // Always private for now
      formData.append('spaceId', currentSpace?.id || '');
      
      console.log('NewThreadPanel: Sending request to /api/threads/create');
      console.log('Form data:', {
        title: title.trim(),
        color: selectedColor,
        isPublic: false, // Always private for now
        spaceId: currentSpace?.id || null,
      });
      
      const response = await fetch('/api/threads/create', {
        method: 'POST',
        body: formData,
      });

      console.log('NewThreadPanel: Response status:', response.status);
      console.log('NewThreadPanel: Response ok:', response.ok);

      if (response.ok) {
        const result = await response.json();
        console.log('NewThreadPanel: Thread created successfully:', result);
        
        // Show success message first
        window.dispatchEvent(new CustomEvent('toast', {
          detail: { message: 'Thread created successfully!', type: 'success' }
        }));
        
        // Clear form data
        setTitle('');
        setSelectedColor('paper');
        setSelectedType('Private');
        setActiveTab('recent');
        localStorage.removeItem('newThreadTitle');
        localStorage.removeItem('newThreadColor');
        localStorage.removeItem('newThreadType');
        localStorage.removeItem('newThreadActiveTab');
        
        // Small delay to ensure toast shows before redirecting
        setTimeout(() => {
          // Close panel
          // Dispatch close event for event system
          window.dispatchEvent(new CustomEvent('closeNewThreadPanel'));
          
          if (onClose) {
            onClose();
          }
          
          // Redirect to the newly created thread
          if (result.thread && result.thread.id) {
            console.log('NewThreadPanel: Redirecting to thread:', result.thread.id);
            window.location.href = `/${result.thread.id}`;
          }
        }, 100);
      } else {
        const errorText = await response.text();
        console.error('NewThreadPanel: API error response:', errorText);
        throw new Error(`Failed to create thread: ${response.status}`);
      }
    } catch (error) {
      console.error('NewThreadPanel: Error creating thread:', error);
      window.dispatchEvent(new CustomEvent('toast', {
        detail: { message: 'Failed to create thread. Please try again.', type: 'error' }
      }));
    } finally {
      console.log('NewThreadPanel: Submission finished, setting isSubmitting to false');
      // Use setTimeout to ensure state update happens after any pending operations
      setTimeout(() => {
        setIsSubmitting(false);
        console.log('NewThreadPanel: isSubmitting set to false');
      }, 0);
    }
  };

  const handleClose = () => {
    if (title.trim()) {
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
    setActiveTab('recent');
    localStorage.removeItem('newThreadTitle');
    localStorage.removeItem('newThreadColor');
    localStorage.removeItem('newThreadType');
    localStorage.removeItem('newThreadActiveTab');
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
              className="box-border content-stretch flex gap-3 items-center justify-center leading-[0] mb-[-24px] not-italic pb-12 pt-6 px-6 relative shrink-0 text-[var(--color-deep-grey)] w-full"
              style={{ backgroundColor: getThreadColorCSS(selectedColor) }}
            >
              <div className="basis-0 font-sans font-bold grow min-h-px min-w-px relative shrink-0 text-[24px]">
                <input 
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Thread name"
                  className="w-full bg-transparent border-none text-[24px] font-bold text-[var(--color-deep-grey)] focus:outline-none placeholder-[var(--color-pebble-grey)] text-center"
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
                          <svg className="size-5 text-[var(--color-deep-grey)]" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                          </svg>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
                
                {/* Thread type selection with toggle */}
                <div className="w-full">
                  <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--color-snow-white)]">
                    <span className="text-[var(--color-blue)] font-sans text-[16px] font-semibold">
                      Private
                    </span>
                    <div className="flex items-center gap-2">
                      <SimpleSwitch
                        checked={false}
                        onCheckedChange={() => {}} // Disabled - no action
                        disabled={true}
                        className="opacity-50 cursor-not-allowed"
                      />
                      <span className="text-[10px] text-[var(--color-pebble-grey)] font-medium">
                        Coming Soon
                      </span>
                    </div>
                    <span className="text-[var(--color-pebble-grey)] font-sans text-[16px] font-semibold opacity-50">
                      Shared
                    </span>
                  </div>
                </div>

                
                {/* Tab navigation */}
                <div className="w-full">
                  <div className="flex flex-col gap-3">
                    <div className="tab-nav-container">
                      {/* Tab Navigation */}
                      <div className="flex items-center justify-start gap-0 pb-0 pt-1 px-1 relative w-full">
                        <button
                          type="button"
                          className={`flex gap-2 h-11 items-center justify-center overflow-clip px-2 py-3 relative rounded-tl-[8px] rounded-tr-[8px] shrink-0 transition-all duration-200 ${
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
                          className={`flex gap-2 h-11 items-center justify-center overflow-clip px-2 py-3 relative rounded-tl-[8px] rounded-tr-[8px] shrink-0 transition-all duration-200 ${
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
                    
                    {/* Tab content */}
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
                                    // Navigate to the note
                                    window.location.href = `/note_${note.id}`;
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
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom buttons */}
        <div className="flex items-center justify-between gap-3 shrink-0">
          {/* Close button - SquareButton Close variant */}
          <button 
            type="button"
            onClick={handleClose} 
            tabIndex={4}
            data-outer-shadow
            className="group [&:active_svg]:-translate-y-0 [&:active_svg]:scale-[0.95] bg-[var(--color-stone-grey)] relative rounded-3xl w-[64px] h-[64px] cursor-pointer transition-[scale,shadow] duration-300"
          >
            <div className="flex flex-row items-center justify-center relative w-full h-full">
              <div className="box-border flex flex-row gap-3 items-center justify-center pb-5 pt-4 px-4 relative w-full h-full">
                <div className="flex h-[42.426px] items-center justify-center relative shrink-0 w-[42.426px]">
                  <div className="flex-none">
                    <div className="relative w-6 h-6 flex items-center justify-center">
                      <svg className="-translate-y-0.5 fill-white block max-w-none w-full h-full transition-transform duration-125" viewBox="0 0 384 512">
                        <path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/>
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="absolute inset-0 pointer-events-none rounded-3xl transition-shadow duration-125 shadow-[0px_-8px_0px_0px_rgba(0,0,0,0.1)_inset] group-active:!shadow-[0px_-2px_0px_0px_rgba(0,0,0,0.1)_inset]" />
          </button>
          
          {/* Create Thread button - Button Default variant */}
          <button 
            type="submit"
            disabled={isSubmitting}
            data-outer-shadow
            className="group relative rounded-3xl cursor-pointer transition-[scale,shadow] duration-300 pb-7 pt-6 px-6 flex items-center justify-center font-sans font-semibold text-[18px] leading-[0] text-nowrap text-[var(--color-fog-white)] h-[64px] flex-1 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--color-blue)' }}
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
                className="px-4 py-2 bg-[var(--color-blue)] text-white rounded-lg hover:bg-opacity-90 transition-colors"
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

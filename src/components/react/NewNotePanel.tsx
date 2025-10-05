import React, { useState, useEffect, useRef } from 'react';
import TiptapEditor from './TiptapEditor';
import ThreadCombobox from './ThreadCombobox';

interface Thread {
  id: string;
  title: string;
  color: string | null;
  noteCount: number;
  backgroundGradient: string;
}

interface NewNotePanelProps {
  currentThread?: any;
  onClose?: () => void;
}

export default function NewNotePanel({ currentThread, onClose }: NewNotePanelProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedThread, setSelectedThread] = useState('Unorganized');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nextNoteId, setNextNoteId] = useState('#New');
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [threadOptions, setThreadOptions] = useState<Thread[]>([
    {
      id: 'thread_unorganized',
      title: 'Unorganized',
      color: null,
      noteCount: 0,
      backgroundGradient: 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)'
    }
  ]);

  // Load data from localStorage on mount
  useEffect(() => {
    const savedTitle = localStorage.getItem('newNoteTitle') || '';
    const savedContent = localStorage.getItem('newNoteContent') || '';
    
    // Use currentThread prop if available, otherwise fall back to localStorage
    let initialThread = 'Unorganized';
    if (currentThread && currentThread.title) {
      initialThread = currentThread.title;
    } else {
      const savedThread = localStorage.getItem('newNoteThread');
      if (savedThread) {
        initialThread = savedThread;
      }
    }
    
    setTitle(savedTitle);
    setContent(savedContent);
    setSelectedThread(initialThread);
  }, [currentThread]);


  // Save to localStorage when values change
  useEffect(() => {
    localStorage.setItem('newNoteTitle', title);
  }, [title]);

  useEffect(() => {
    localStorage.setItem('newNoteContent', content);
  }, [content]);

  useEffect(() => {
    localStorage.setItem('newNoteThread', selectedThread);
  }, [selectedThread]);

  // Update selected thread when currentThread prop changes
  useEffect(() => {
    if (currentThread && currentThread.title) {
      setSelectedThread(currentThread.title);
    }
  }, [currentThread]);

  // Load threads from API
  const loadThreads = async () => {
    try {
      const response = await fetch('/api/threads/list', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const threads = await response.json();
        const formattedThreads = threads.map((thread: any) => ({
          id: thread.id,
          title: thread.title,
          color: thread.color,
          noteCount: thread.noteCount,
          backgroundGradient: thread.backgroundGradient
        }));
        
        // Ensure 'Unorganized' thread exists
        const hasUnorganizedThread = formattedThreads.some((thread: Thread) => thread.title === 'Unorganized');
        if (!hasUnorganizedThread) {
          formattedThreads.unshift({
            id: 'thread_unorganized',
            title: 'Unorganized',
            color: null,
            noteCount: 0,
            backgroundGradient: 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)'
          });
        }
        
        setThreadOptions(formattedThreads);
      }
    } catch (error) {
      console.error('Error loading threads:', error);
    }
  };

  // Load next note ID
  const loadNextNoteId = async () => {
    try {
      const response = await fetch('/api/notes/next-id', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        setNextNoteId(`#${data.formattedId}`);
      }
    } catch (error) {
      console.error('Error loading next note ID:', error);
    }
  };

  // Initialize data
  useEffect(() => {
    loadThreads();
    loadNextNoteId();
  }, []);

  // Auto-focus content area when component mounts
  useEffect(() => {
    // Small delay to ensure TiptapEditor is fully rendered
    const timer = setTimeout(() => {
      const editorElement = document.querySelector('#new-note-content .ProseMirror');
      if (editorElement) {
        (editorElement as HTMLElement).focus();
      }
    }, 100);
    
    return () => clearTimeout(timer);
  }, []);

  // Get selected thread object
  const getSelectedThread = () => {
    return threadOptions.find(thread => thread.title === selectedThread) || threadOptions[0];
  };

  // Check if there are unsaved changes
  const hasUnsavedChanges = () => {
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    
    // Check if there's meaningful content (not just whitespace or empty HTML)
    const hasContent = trimmedContent && 
      trimmedContent !== '<p></p>' && 
      trimmedContent !== '<p><br></p>' &&
      trimmedContent !== '<br>';
    
    return trimmedTitle || hasContent;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Don't submit if dialog is open
    if (showUnsavedDialog) {
      return;
    }
    
    // Get content from TiptapEditor
    let editorContent = content;
    const hiddenInput = document.querySelector('#new-note-content') as HTMLInputElement;
    if (hiddenInput && hiddenInput.value) {
      editorContent = hiddenInput.value;
    }
    
    // Check for meaningful content
    const trimmedTitle = title.trim();
    const trimmedContent = editorContent.trim();
    
    // Check if there's meaningful content (not just whitespace or empty HTML)
    const hasContent = trimmedContent && 
      trimmedContent !== '<p></p>' && 
      trimmedContent !== '<p><br></p>' &&
      trimmedContent !== '<br>';
    
    if (!trimmedTitle && !hasContent) {
      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: 'Please add a title or content to your note',
          type: 'warning'
        }
      }));
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.set('title', title);
      formData.set('content', editorContent);
      formData.set('threadId', getSelectedThread().id);

      const response = await fetch('/api/notes/create', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (response.ok) {
        const result = await response.json();
        
        // Show success toast
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: result.success || 'Note created successfully!',
            type: 'success'
          }
        }));

        // Dispatch note created event
        window.dispatchEvent(new CustomEvent('noteCreated', {
          detail: { note: result.note }
        }));

        // Navigate to the newly created note
        if (result.note && result.note.id) {
          console.log('NewNotePanel: Redirecting to note:', result.note.id);
          setTimeout(() => {
            window.location.href = `/${result.note.id}`;
          }, 100);
        }

        // Reset form
        setTitle('');
        setContent('');
        setSelectedThread('Unorganized');
        setIsSubmitting(false);
        
        // Clear localStorage
        localStorage.removeItem('newNoteTitle');
        localStorage.removeItem('newNoteContent');
        localStorage.removeItem('newNoteThread');
        
        // Refresh next note ID
        loadNextNoteId();
        
        // Close panel
        if (onClose) {
          onClose();
        }
      } else {
        const error = await response.json();
        
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: error.error || 'Error creating note',
            type: 'error'
          }
        }));
        
        setIsSubmitting(false);
      }
    } catch (error: any) {
      console.error('Error creating note:', error);
      
      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: `Error creating note: ${error?.message || 'Please try again.'}`,
          type: 'error'
        }
      }));
      
      setIsSubmitting(false);
    }
  };

  // Handle panel close
  const handleClose = () => {
    // Check for unsaved changes
    if (hasUnsavedChanges()) {
      setShowUnsavedDialog(true);
      return;
    }
    
    // No unsaved changes, close silently
    closePanel();
  };

  // Actually close the panel
  const closePanel = () => {
    localStorage.removeItem('newNoteTitle');
    localStorage.removeItem('newNoteContent');
    // Don't clear newNoteThread - preserve thread selection for next time
    setTitle('');
    setContent('');
    // Don't reset selectedThread - keep the current thread selection
    setIsSubmitting(false);
    setShowUnsavedDialog(false);
    
    if (onClose) {
      onClose();
    } else {
      window.dispatchEvent(new CustomEvent('closeNewNotePanel'));
    }
  };

  // Handle unsaved changes dialog actions
  const handleDiscardChanges = () => {
    closePanel();
  };

  const handleSaveAndClose = async () => {
    // Try to save the note first
    try {
      const formData = new FormData();
      formData.set('title', title);
      formData.set('content', content);
      formData.set('threadId', getSelectedThread().id);

      const response = await fetch('/api/notes/create', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (response.ok) {
        const result = await response.json();
        
        // Show success toast
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: 'Note saved successfully!',
            type: 'success'
          }
        }));

        // Navigate to the newly created note
        if (result.note && result.note.id) {
          console.log('NewNotePanel: Redirecting to note:', result.note.id);
          setTimeout(() => {
            window.location.href = `/${result.note.id}`;
          }, 100);
        }
      }
    } catch (error) {
      console.error('Error saving note:', error);
    }
    
    // Close the panel regardless of save success
    closePanel();
  };

  return (
    <>
    <form 
      onSubmit={handleSubmit}
      className="new-note-panel h-full flex flex-col"
      style={{ 
        minHeight: '100%',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)'
      }}
    >
      {/* Thread Selection */}
      <div className="mb-3.5 shrink-0">
        <ThreadCombobox
          selectedThread={selectedThread}
          onThreadSelect={setSelectedThread}
          threads={threadOptions}
          placeholder="Select thread..."
        />
      </div>

      {/* Note Content */}
      <div className="flex-1 flex flex-col min-h-0 mb-3.5" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        <div className="bg-white box-border flex flex-col h-full items-start justify-between overflow-clip pb-3 pt-6 px-3 relative rounded-[24px] shadow-[0px_3px_20px_0px_rgba(120,118,111,0.1)]">
          {/* Header with title input */}
          <div className="flex gap-3 items-center justify-center px-3 py-0 relative shrink-0 w-full">
            <div className="basis-0 font-sans font-semibold grow leading-[0] min-h-px min-w-px not-italic relative shrink-0 text-[var(--color-deep-grey)] text-[24px]">
              <input 
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Note title"
                tabIndex={1}
                className="w-full bg-transparent border-none text-[24px] font-semibold text-[var(--color-deep-grey)] focus:outline-none placeholder-[var(--color-pebble-grey)]"
              />
            </div>
            <div className="relative shrink-0 size-5">
              <svg className="block max-w-none size-full text-[var(--color-deep-grey)]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
              </svg>
            </div>
          </div>
          
          {/* Editor wrapper - spans available space */}
          <div className="flex-1 flex flex-col min-h-0 w-full" style={{ marginTop: '20px' }}>
            <div className="flex-1 flex flex-col min-h-0 px-3">
              <TiptapEditor
                content={content}
                id="new-note-content"
                name="content"
                placeholder="Type your note..."
                tabindex={2}
                minimalToolbar={false}
              />
            </div>
          </div>

          {/* Date and Note ID - fixed at bottom */}
          <div className="flex font-sans font-normal items-center justify-between leading-[0] not-italic px-3 py-0 relative shrink-0 text-[var(--color-stone-grey)] text-[12px] text-nowrap w-full" style={{ marginTop: '8px' }}>
            <div className="relative shrink-0">
              <p className="leading-[normal] text-nowrap whitespace-pre">Today</p>
            </div>
            <div className="relative shrink-0">
              <p className="leading-[normal] text-nowrap whitespace-pre">{nextNoteId}</p>
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
        
        {/* Create Note button - Button Default variant */}
        <button 
          type="submit"
          disabled={isSubmitting}
          data-outer-shadow
          className="group relative rounded-3xl cursor-pointer transition-[scale,shadow] duration-300 pb-7 pt-6 px-6 flex items-center justify-center font-sans font-semibold text-[18px] leading-[0] text-nowrap text-[var(--color-fog-white)] h-[64px] flex-1 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: 'var(--color-blue)' }}
          tabIndex={3}
        >
          <div className="relative shrink-0 transition-transform duration-125">
            {isSubmitting ? 'Creating...' : 'Create Note'}
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
          <p className="text-[var(--color-pebble-grey)] mb-6">
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
    </>
  );
}

// Add the CSS for data-outer-shadow - scoped to NewNotePanel only
const buttonStyles = `
  .new-note-panel button[data-outer-shadow] {
    will-change: transform, box-shadow;
    transition:
      background-color 0.125s ease-in-out,
      box-shadow 0.125s ease-in-out;
    box-shadow:
      0px -8px 0px 0px hsla(0, 0%, 0%, 0.1) inset,
      0px 4px 4px 0px hsla(0, 0%, 0%, 0.25);
  }
  
  .new-note-panel button:not([data-outer-shadow]) {
    transition:
      box-shadow 0.125s ease-in-out;
    box-shadow: 0px -3px 0px 0px #78766F33 inset;
  }

  .new-note-panel button:not([data-outer-shadow]):active {
    filter: brightness(0.97);
    box-shadow: 
      0px -1px 0px 0px #78766F33 inset,
      0px 1px 0px 0px #78766F33 inset;
  }

  .new-note-panel button {
    will-change: transform, box-shadow;
  }

  .new-note-panel button:active > img {
    transform: scale(0.95);
  }
  
  /* Ensure NewNotePanel appears instantly without fade */
  .new-note-panel {
    opacity: 1 !important;
    transition: none !important;
    animation: none !important;
  }
  
  .new-note-panel * {
    opacity: 1 !important;
    transition: none !important;
    animation: none !important;
  }
  
  /* Override any React component unmount transitions */
  .new-note-panel[data-astro-cid] {
    transition: none !important;
    animation: none !important;
  }
`;

// Inject the styles
if (typeof document !== 'undefined') {
  const styleId = 'new-note-panel-button-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = buttonStyles;
    document.head.appendChild(style);
  }
}

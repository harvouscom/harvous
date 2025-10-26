import React, { useState, useEffect, useRef } from 'react';
import TiptapEditor from './TiptapEditor';
import ThreadCombobox from './ThreadCombobox';
import SquareButton from './SquareButton';

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
  // Force note type to 'default' until designs are ready
  const [noteType, setNoteType] = useState<'default' | 'scripture' | 'resource'>('default');
  const [scriptureReference, setScriptureReference] = useState('');
  const [resourceUrl, setResourceUrl] = useState('');
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
    
    // Priority: currentThread prop (if in thread view) > default to "Unorganized"
    let initialThread = 'Unorganized';
    if (currentThread && currentThread.title) {
      initialThread = currentThread.title;
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
    } else {
      // If no currentThread, default to "Unorganized"
      setSelectedThread('Unorganized');
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

  // Load Font Awesome for icons
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css';
    if (!document.querySelector(`link[href="${link.href}"]`)) {
      document.head.appendChild(link);
    }
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

  // Cycle through note types - DISABLED until designs are ready
  const cycleNoteType = () => {
    // Note type switching is disabled until designs are ready
    console.log('Note type switching is disabled until designs are ready');
    return;
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
    
    // Get content from TiptapEditor - try multiple methods
    let editorContent = content;
    
    // Method 1: Try to get from hidden input
    const hiddenInput = document.querySelector('#new-note-content') as HTMLInputElement;
    if (hiddenInput && hiddenInput.value) {
      editorContent = hiddenInput.value;
      console.log('Content from hidden input:', editorContent.substring(0, 50) + '...');
    }
    
    // Method 2: Try to get from TiptapEditor directly via DOM
    const tiptapEditor = document.querySelector('.tiptap-content');
    if (tiptapEditor && (!editorContent || editorContent.trim() === '')) {
      editorContent = tiptapEditor.innerHTML;
      console.log('Content from TiptapEditor DOM:', editorContent.substring(0, 50) + '...');
    }
    
    // Method 3: Use the content state as fallback
    if (!editorContent || editorContent.trim() === '') {
      editorContent = content;
      console.log('Content from state:', editorContent.substring(0, 50) + '...');
    }
    
    // Final content validation and logging
    console.log('Final editorContent for submission:', {
      content: editorContent,
      contentLength: editorContent.length,
      contentTrimmed: editorContent.trim(),
      contentTrimmedLength: editorContent.trim().length,
      isEmpty: !editorContent || editorContent.trim() === '' || editorContent.trim() === '<p></p>' || editorContent.trim() === '<p><br></p>'
    });
    
    // Check for meaningful content based on note type
    const trimmedTitle = title.trim();
    const trimmedContent = editorContent.trim();
    const trimmedScriptureRef = scriptureReference.trim();
    const trimmedResourceUrl = resourceUrl.trim();
    
    // Check if there's meaningful content (not just whitespace or empty HTML)
    const hasContent = trimmedContent && 
      trimmedContent !== '<p></p>' && 
      trimmedContent !== '<p><br></p>' &&
      trimmedContent !== '<br>';
    
    // Type-specific validation
    if (noteType === 'default') {
      if (!trimmedTitle && !hasContent) {
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: 'Please add a title or content to your note',
            type: 'warning'
          }
        }));
        return;
      }
    } else if (noteType === 'scripture') {
      if (!trimmedScriptureRef) {
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: 'Please add a scripture reference (e.g., John 3:16)',
            type: 'warning'
          }
        }));
        return;
      }
      if (!hasContent) {
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: 'Please add your thoughts about this scripture',
            type: 'warning'
          }
        }));
        return;
      }
    } else if (noteType === 'resource') {
      if (!trimmedResourceUrl) {
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: 'Please add a resource URL',
            type: 'warning'
          }
        }));
        return;
      }
      if (!hasContent) {
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: 'Please add your thoughts about this resource',
            type: 'warning'
          }
        }));
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      
      // Set title based on note type
      if (noteType === 'default') {
        formData.set('title', title);
      } else if (noteType === 'scripture') {
        formData.set('title', scriptureReference); // Use scripture reference as title
      } else if (noteType === 'resource') {
        formData.set('title', resourceUrl); // Use URL as title
      }
      
      formData.set('content', editorContent);
      formData.set('threadId', getSelectedThread().id);
      formData.set('noteType', noteType);
      
      // Add type-specific metadata
      if (noteType === 'scripture') {
        formData.set('scriptureReference', scriptureReference);
      } else if (noteType === 'resource') {
        formData.set('resourceUrl', resourceUrl);
      }

      const response = await fetch('/api/notes/create', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (response.ok) {
        const result = await response.json();
        
        // Dispatch note created event
        window.dispatchEvent(new CustomEvent('noteCreated', {
          detail: { note: result.note }
        }));

        // Navigate to the newly created note with toast parameter
        if (result.note && result.note.id) {
          console.log('NewNotePanel: Redirecting to note:', result.note.id);
          const redirectUrl = `/${result.note.id}?toast=success&message=${encodeURIComponent(result.success || 'Note created successfully!')}`;
          window.location.href = redirectUrl;
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
        
        if (window.toast) {
          window.toast.error(error.error || 'Error creating note');
        } else {
          alert(error.error || 'Error creating note');
        }
        
        setIsSubmitting(false);
      }
    } catch (error: any) {
      console.error('Error creating note:', error);
      
      if (window.toast) {
        window.toast.error(`Error creating note: ${error?.message || 'Please try again.'}`);
      } else {
        alert(`Error creating note: ${error?.message || 'Please try again.'}`);
      }
      
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
      
      // Set title based on note type
      if (noteType === 'default') {
        formData.set('title', title);
      } else if (noteType === 'scripture') {
        formData.set('title', scriptureReference);
      } else if (noteType === 'resource') {
        formData.set('title', resourceUrl);
      }
      
      formData.set('content', content);
      formData.set('threadId', getSelectedThread().id);
      formData.set('noteType', noteType);
      
      // Add type-specific metadata
      if (noteType === 'scripture') {
        formData.set('scriptureReference', scriptureReference);
      } else if (noteType === 'resource') {
        formData.set('resourceUrl', resourceUrl);
      }

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

      {/* Note Content - Type-specific layouts */}
      <div className="flex-1 flex flex-col min-h-0 mb-3.5">
        {noteType === 'default' && (
          <div className="bg-white box-border flex flex-col h-full items-start justify-between overflow-clip pb-3 pt-6 px-3 relative rounded-[24px] shadow-[0px_3px_20px_0px_rgba(120,118,111,0.1)]">
            {/* Default Note Layout */}
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
              <div className="relative shrink-0 size-5" title="Note type switching disabled until designs are ready">
                <svg className="block max-w-none size-full text-[var(--color-deep-grey)] opacity-50" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
                </svg>
              </div>
            </div>
            
            <div className="flex-1 flex flex-col min-h-0 w-full" style={{ marginTop: '20px' }}>
              <div className="flex-1 flex flex-col min-h-0 px-3">
                <TiptapEditor
                  content={content}
                  id="new-note-content"
                  name="content"
                  placeholder="Type your note..."
                  tabindex={2}
                  minimalToolbar={false}
                  onContentChange={(newContent) => {
                    console.log('TiptapEditor content changed:', newContent.substring(0, 50) + '...');
                    setContent(newContent);
                  }}
                />
              </div>
            </div>

            <div className="flex font-sans font-normal items-center justify-between leading-[0] not-italic px-3 py-0 relative shrink-0 text-[var(--color-stone-grey)] text-[12px] text-nowrap w-full" style={{ marginTop: '8px' }}>
              <div className="relative shrink-0">
                <p className="leading-[normal] text-nowrap whitespace-pre">Today</p>
              </div>
              <div className="relative shrink-0">
                <p className="leading-[normal] text-nowrap whitespace-pre">{nextNoteId}</p>
              </div>
            </div>
          </div>
        )}

        {/* Scripture note type - DISABLED until designs are ready */}
        {false && noteType === 'scripture' && (
          <div className="bg-white box-border flex flex-col h-full items-start justify-between overflow-clip pb-3 pt-6 px-3 relative rounded-[24px] shadow-[0px_3px_20px_0px_rgba(120,118,111,0.1)]">
            {/* Scripture Note Layout */}
            <div className="flex gap-3 items-center justify-center px-3 py-0 relative shrink-0 w-full">
              <div className="basis-0 font-sans font-semibold grow leading-[0] min-h-px min-w-px not-italic relative shrink-0 text-[var(--color-deep-grey)] text-[24px]">
                <input 
                  type="text"
                  value={scriptureReference}
                  onChange={(e) => setScriptureReference(e.target.value)}
                  placeholder="Scripture reference (e.g., John 3:16)"
                  tabIndex={1}
                  className="w-full bg-transparent border-none text-[24px] font-semibold text-[var(--color-deep-grey)] focus:outline-none placeholder-[var(--color-pebble-grey)]"
                />
              </div>
              <div className="relative shrink-0 size-5" title="Note type switching disabled until designs are ready">
                <i className="fa-solid fa-scroll text-[var(--color-deep-grey)] text-[20px] opacity-50" />
              </div>
            </div>
            
            <div className="flex-1 flex flex-col min-h-0 w-full" style={{ marginTop: '20px' }}>
              <div className="flex-1 flex flex-col min-h-0 px-3">
                <TiptapEditor
                  content={content}
                  id="new-note-content"
                  name="content"
                  placeholder="Share your thoughts about this scripture..."
                  tabindex={2}
                  minimalToolbar={false}
                  onContentChange={(newContent) => {
                    console.log('TiptapEditor content changed (scripture):', newContent.substring(0, 50) + '...');
                    setContent(newContent);
                  }}
                />
              </div>
            </div>

            <div className="flex font-sans font-normal items-center justify-between leading-[0] not-italic px-3 py-0 relative shrink-0 text-[var(--color-stone-grey)] text-[12px] text-nowrap w-full" style={{ marginTop: '8px' }}>
              <div className="relative shrink-0">
                <p className="leading-[normal] text-nowrap whitespace-pre">Today</p>
              </div>
              <div className="relative shrink-0">
                <p className="leading-[normal] text-nowrap whitespace-pre">{nextNoteId}</p>
              </div>
            </div>
          </div>
        )}

        {/* Resource note type - DISABLED until designs are ready */}
        {false && noteType === 'resource' && (
          <div className="bg-white box-border flex flex-col h-full items-start justify-between overflow-clip pb-3 pt-6 px-3 relative rounded-[24px] shadow-[0px_3px_20px_0px_rgba(120,118,111,0.1)]">
            {/* Resource Note Layout */}
            <div className="flex gap-3 items-center justify-center px-3 py-0 relative shrink-0 w-full">
              <div className="basis-0 font-sans font-semibold grow leading-[0] min-h-px min-w-px not-italic relative shrink-0 text-[var(--color-deep-grey)] text-[24px]">
                <input 
                  type="url"
                  value={resourceUrl}
                  onChange={(e) => setResourceUrl(e.target.value)}
                  placeholder="Resource URL"
                  tabIndex={1}
                  className="w-full bg-transparent border-none text-[24px] font-semibold text-[var(--color-deep-grey)] focus:outline-none placeholder-[var(--color-pebble-grey)]"
                />
              </div>
              <div className="relative shrink-0 size-5" title="Note type switching disabled until designs are ready">
                <i className="fa-solid fa-file-image text-[var(--color-deep-grey)] text-[20px] opacity-50" />
              </div>
            </div>
            
            <div className="flex-1 flex flex-col min-h-0 w-full" style={{ marginTop: '20px' }}>
              <div className="flex-1 flex flex-col min-h-0 px-3">
                <TiptapEditor
                  content={content}
                  id="new-note-content"
                  name="content"
                  placeholder="Share your thoughts about this resource..."
                  tabindex={2}
                  minimalToolbar={false}
                  onContentChange={(newContent) => {
                    console.log('TiptapEditor content changed (resource):', newContent.substring(0, 50) + '...');
                    setContent(newContent);
                  }}
                />
              </div>
            </div>

            <div className="flex font-sans font-normal items-center justify-between leading-[0] not-italic px-3 py-0 relative shrink-0 text-[var(--color-stone-grey)] text-[12px] text-nowrap w-full" style={{ marginTop: '8px' }}>
              <div className="relative shrink-0">
                <p className="leading-[normal] text-nowrap whitespace-pre">Today</p>
              </div>
              <div className="relative shrink-0">
                <p className="leading-[normal] text-nowrap whitespace-pre">{nextNoteId}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom buttons */}
      <div className="flex items-center justify-between gap-3 shrink-0">
        {/* Close button using SquareButton Close variant */}
        <SquareButton 
          variant="Close" 
          onClick={handleClose}
        />
        
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

// Styles moved to global.css for immediate availability

import React, { useState, useEffect, useRef } from 'react';
import ThreadCombobox from './ThreadCombobox';
import { useNavigation } from './navigation/NavigationContext';
import { safeFetch } from '@/utils/safe-fetch';
import { captureException } from '@/utils/posthog';
import { getThreadGradientCSS } from '@/utils/colors';

// Import extracted hooks
import {
  useNewNoteForm,
  useThreadSelection,
  useScriptureDetection,
  useNoteSubmission,
} from './note-panel/hooks';

// Import Thread type from useThreadSelection
import type { Thread } from './note-panel/hooks/useThreadSelection';

// Import extracted components
import {
  DefaultNoteForm,
  ScriptureNoteForm,
  NewResourcePanel,
  SpaceSelector,
  NoteFormFooter,
  NewNotePanelStyles,
} from './note-panel';

import UnsavedChangesDialog from './dialogs/UnsavedChangesDialog';
import SuggestedThreadDialog from './dialogs/SuggestedThreadDialog';

interface NewNotePanelProps {
  currentThread?: any;
  currentSpace?: any;
  onClose?: () => void;
  initialNoteType?: 'default' | 'scripture' | 'resource';
}

export default function NewNotePanel({ currentThread, currentSpace, onClose, initialNoteType }: NewNotePanelProps) {
  // Get navigation context
  const navigation = useNavigation();
  const { addToNavigationHistory, navigationHistory } = navigation;

  // State for next note ID, unsaved dialog, and suggested thread
  const [nextNoteId, setNextNoteId] = useState('#New');
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [suggestedThreadName, setSuggestedThreadName] = useState<string | null>(null);
  const [showSuggestedThreadDialog, setShowSuggestedThreadDialog] = useState(false);
  const [scriptureCount, setScriptureCount] = useState(0);
  const [duplicateInfo, setDuplicateInfo] = useState<{ exists: boolean; noteId?: string; simpleNoteId?: number; title?: string; description?: string; image?: string; url?: string } | null>(null);

  // Ref to store the TiptapEditor instance for focusing
  const editorRef = useRef<any>(null);

  // Use extracted form hook
  const form = useNewNoteForm({
    currentSpace,
    initialNoteType,
  });

  // Use extracted thread selection hook
  const threadSelection = useThreadSelection({
    currentThread,
    navigationHistory,
  });

  // Use extracted scripture detection hook
  useScriptureDetection({
    title: form.title,
    content: form.content,
    noteType: form.noteType,
    isLoadingFromLocalStorage: form.isLoadingFromLocalStorage,
    setNoteType: form.setNoteType,
    setTitle: form.setTitle,
    setContent: form.setContent,
    setScriptureReference: form.setScriptureReference,
    setScriptureVersion: form.setScriptureVersion,
    scriptureReference: form.scriptureReference,
    scriptureVersion: form.scriptureVersion,
  });

  // Load next note ID
  const loadNextNoteId = async () => {
    try {
      const response = await safeFetch('/api/notes/next-id', {
        retries: 2,
        retryDelay: 1000
      });
      
      if (response && response.ok) {
        const data = await response.json();
        setNextNoteId(`#${data.formattedId}`);
      }
    } catch (error) {
      captureException(error as Error);
    }
  };

  // Use extracted submission hook
  const submission = useNoteSubmission({
    title: form.title,
    content: form.content,
    noteType: form.noteType,
    scriptureReference: form.scriptureReference,
    scriptureVersion: form.scriptureVersion,
    resourceUrl: form.resourceUrl,
    resourceMetadata: form.resourceMetadata,
    sourceNoteId: form.sourceNoteId,
    addToSpace: form.addToSpace,
    currentSpace,
    getSelectedThread: threadSelection.getSelectedThread,
    threadOptions: threadSelection.threadOptions,
    addToNavigationHistory,
    onClose,
    resetForm: form.resetForm,
    clearLocalStorage: form.clearLocalStorage,
    loadNextNoteId,
    setSelectedThread: threadSelection.setSelectedThread,
  });

  // Handle editor ready callback - focus the editor when it's initialized
  const handleEditorReady = (editor: any) => {
    if (!editor) return;
    
    editorRef.current = editor;
    setTimeout(() => {
      // Check if editor is still valid (not destroyed)
      if (!editor || editor.isDestroyed) return;
      
      // Check if view and docView are still valid
      if (!editor.view || !editor.view.docView) return;
      
      try {
        editor.commands.focus();
        try {
          editor.commands.setTextSelection(0);
        } catch {
          // If setTextSelection fails, just focus
        }
      } catch (e) {
        // Ignore errors during focus
      }
    }, 50);
  };

  // Initialize data
  useEffect(() => {
    loadNextNoteId();
  }, []);

  // Store timeout ref for cleanup
  const pendingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Listen for note count changes to refresh thread options
  useEffect(() => {
    const scheduleLoadThreads = () => {
      if (pendingTimeoutRef.current) {
        clearTimeout(pendingTimeoutRef.current);
      }
      pendingTimeoutRef.current = setTimeout(() => {
        pendingTimeoutRef.current = null;
        threadSelection.loadThreads();
      }, 300);
    };

    const handleNoteCreated = (event: Event) => {
      const customEvent = event as CustomEvent;
      const note = customEvent.detail?.note;
      // Use actualThreadId from event detail (from junction table), fallback to legacy threadId
      const threadId = customEvent.detail?.actualThreadId || note?.threadId;
      
      if (threadId) {
        // Only update the count for the actual thread where the note was created
        // If actualThreadId is provided, use that (it's the correct thread from junction table)
        // If not, use note.threadId but only if it's not unorganized (to avoid double-counting)
        const targetThreadId = customEvent.detail?.actualThreadId || (note?.threadId !== 'thread_unorganized' ? note?.threadId : null);
        
        if (targetThreadId && targetThreadId !== 'thread_unorganized') {
          threadSelection.setThreadOptions(prev => prev.map(thread => 
            thread.id === targetThreadId 
              ? { ...thread, noteCount: (thread.noteCount || 0) + 1 }
              : thread
          ));
        } else if (targetThreadId === 'thread_unorganized') {
          // Only increment unorganized if actualThreadId is explicitly 'thread_unorganized'
          // (not if it's just the fallback from note.threadId)
          if (customEvent.detail?.actualThreadId === 'thread_unorganized') {
            threadSelection.setThreadOptions(prev => prev.map(thread => 
              thread.id === 'thread_unorganized' 
                ? { ...thread, noteCount: (thread.noteCount || 0) + 1 }
                : thread
            ));
          }
        }
      }
      
      scheduleLoadThreads();
    };

    const handleNoteDeleted = (event: Event) => {
      const customEvent = event as CustomEvent;
      const note = customEvent.detail?.note;
      const threadId = note?.threadId;
      
      if (threadId) {
        threadSelection.setThreadOptions(prev => prev.map(thread => 
          thread.id === threadId 
            ? { ...thread, noteCount: Math.max(0, (thread.noteCount || 0) - 1) }
            : thread
        ));
      }
      
      scheduleLoadThreads();
    };

    const handleNoteRemovedFromThread = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { threadId } = customEvent.detail || {};
      
      if (threadId) {
        threadSelection.setThreadOptions(prev => prev.map(thread => 
          thread.id === threadId 
            ? { ...thread, noteCount: Math.max(0, (thread.noteCount || 0) - 1) }
            : thread
        ));
      }
      
      scheduleLoadThreads();
    };

    const handleNoteAddedToThread = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { threadId } = customEvent.detail || {};
      
      if (threadId) {
        threadSelection.setThreadOptions(prev => prev.map(thread => 
          thread.id === threadId 
            ? { ...thread, noteCount: (thread.noteCount || 0) + 1 }
            : thread
        ));
      }
      
      scheduleLoadThreads();
    };

    window.addEventListener('noteCreated', handleNoteCreated);
    window.addEventListener('noteDeleted', handleNoteDeleted);
    window.addEventListener('noteRemovedFromThread', handleNoteRemovedFromThread);
    window.addEventListener('noteAddedToThread', handleNoteAddedToThread);

    return () => {
      window.removeEventListener('noteCreated', handleNoteCreated);
      window.removeEventListener('noteDeleted', handleNoteDeleted);
      window.removeEventListener('noteRemovedFromThread', handleNoteRemovedFromThread);
      window.removeEventListener('noteAddedToThread', handleNoteAddedToThread);
      if (pendingTimeoutRef.current) {
        clearTimeout(pendingTimeoutRef.current);
        pendingTimeoutRef.current = null;
      }
    };
  }, [threadSelection]);

  // Font Awesome is loaded globally via CDN in Layout.astro

  // Listen for keyboard shortcut to save (Cmd+S)
  useEffect(() => {
    const handleSaveContent = () => {
      if (form.hasUnsavedChanges() && !submission.isSubmitting && !showUnsavedDialog) {
        const formElement = document.querySelector('.new-note-panel form') as HTMLFormElement;
        if (formElement) {
          formElement.requestSubmit();
        }
      }
    };
    
    window.addEventListener('saveContent', handleSaveContent);
    return () => {
      window.removeEventListener('saveContent', handleSaveContent);
    };
  }, [form, submission.isSubmitting, showUnsavedDialog]);

  // Listen for Cmd+Enter to submit form (dispatched from TiptapEditor or global handler)
  useEffect(() => {
    const handleSubmitPanelForm = () => {
      if (!submission.isSubmitting && !showUnsavedDialog) {
        const formElement = document.querySelector('.new-note-panel form') as HTMLFormElement;
        if (formElement) {
          formElement.requestSubmit();
        }
      }
    };
    
    window.addEventListener('submitPanelForm', handleSubmitPanelForm);
    return () => {
      window.removeEventListener('submitPanelForm', handleSubmitPanelForm);
    };
  }, [submission.isSubmitting, showUnsavedDialog]);

  // Prevent body scroll when dialog is open
  useEffect(() => {
    if (showUnsavedDialog) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    return () => {
      document.body.style.overflow = '';
    };
  }, [showUnsavedDialog]);

  // Handle panel close
  const handleClose = () => {
    if (form.hasUnsavedChanges()) {
      setShowUnsavedDialog(true);
      return;
    }
    closePanel();
  };

  // Actually close the panel
  const closePanel = () => {
    form.clearLocalStorage();
    form.resetForm();
    submission.setIsSubmitting(false);
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
    await submission.handleSaveAndClose();
    closePanel();
  };

  const showToast = (message: string, type: 'info' | 'success' | 'warning' | 'error') => {
    if (window.toast && typeof window.toast[type] === 'function') {
      window.toast[type](message);
    } else {
      window.dispatchEvent(new CustomEvent('toast', { detail: { message, type } }));
    }
  };

  // Handle form submission with dialog check
  const handleFormSubmit = async (e: React.FormEvent) => {
    if (showUnsavedDialog) {
      e.preventDefault();
      return;
    }
    
    // Check if we should show the suggested thread dialog
    // Only show if there are multiple scripture references (as the dialog text states)
    // Show dialog when:
    // 1. Note type is resource
    // 2. Selected thread is Unorganized (user hasn't manually selected the suggested thread)
    // 3. A suggested thread name exists (either existing thread or new thread name)
    // 4. There are multiple scripture references detected
    const isResource = form.noteType === 'resource';
    const isUnorganized = threadSelection.selectedThread === 'Unorganized';
    const hasSuggestedThread = suggestedThreadName && suggestedThreadName.trim() !== '';
    const hasMultipleScriptures = scriptureCount > 1;
    
    const shouldShowDialog = isResource && isUnorganized && hasSuggestedThread && hasMultipleScriptures;
    
    if (shouldShowDialog) {
      e.preventDefault();
      setShowSuggestedThreadDialog(true);
      return;
    }
    
    await submission.handleSubmit(e);
  };

  // Handle suggested thread dialog actions
  const handleUseSuggestedThread = async () => {
    const rawSuggested = suggestedThreadName || '';
    const desiredTitle = rawSuggested.trim();
    if (!desiredTitle) {
      setShowSuggestedThreadDialog(false);
      return;
    }

    setShowSuggestedThreadDialog(false);

    try {
      // If a thread already exists with this name, use it.
      const existingThread = threadSelection.threadOptions.find(
        (t) => t.title.trim().toLowerCase() === desiredTitle.toLowerCase()
      );

      let threadToUse: Thread;

      if (!existingThread) {
        // Create the thread so we have a real threadId to submit with.
        const formData = new FormData();
        formData.set('title', desiredTitle);
        formData.set('isPublic', 'false');
        formData.set('color', 'paper'); // Suggested threads always use paper color
        // Optional; empty string is treated as no space
        formData.set('spaceId', currentSpace?.id || '');

        const response = await fetch('/api/threads/create', {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });

        if (!response.ok) {
          const err = await response.json().catch(() => null);
          throw new Error(err?.error || 'Failed to create thread');
        }

        const data = await response.json();
        const created = data?.thread;
        if (!created?.id || !created?.title) {
          throw new Error('Thread create response missing thread info');
        }

        // Create thread object for the new thread
        threadToUse = {
          id: created.id,
          title: created.title,
          noteCount: 0,
          backgroundGradient: getThreadGradientCSS(created.color || 'paper'),
          color: created.color || null, // Ensure color is string | null, not undefined
        };

        // Ensure the new thread is available in the combobox options immediately.
        threadSelection.setThreadOptions((prev) => {
          if (prev.some((t) => t.id === created.id)) return prev;
          const unorganizedIdx = prev.findIndex((t) => t.id === 'thread_unorganized' || t.title === 'Unorganized');
          if (unorganizedIdx === -1) return [...prev, threadToUse];
          return [...prev.slice(0, unorganizedIdx + 1), threadToUse, ...prev.slice(unorganizedIdx + 1)];
        });
      } else {
        threadToUse = existingThread;
      }

      // Select the thread and clear the suggestion.
      threadSelection.handleThreadSelect(threadToUse.title);
      setSuggestedThreadName(null);

      // Wait for state to update - need to ensure threadOptions and selectedThread are updated
      // Wait a bit longer to ensure React state has propagated
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Verify the thread is actually selected before submitting
      let currentSelected = threadSelection.getSelectedThread();
      let retries = 0;
      while ((currentSelected.title !== threadToUse.title && currentSelected.id !== threadToUse.id) && retries < 3) {
        // If still not selected, wait a bit more and check again
        await new Promise((resolve) => setTimeout(resolve, 50));
        currentSelected = threadSelection.getSelectedThread();
        retries++;
      }

      // Ensure thread is in options and selected
      // Add to options if it's a newly created thread and not already there
      if (!existingThread) {
        const alreadyInOptions = threadSelection.threadOptions.some(t => t.id === threadToUse.id);
        if (!alreadyInOptions) {
          threadSelection.setThreadOptions((prev) => {
            if (prev.some((t) => t.id === threadToUse.id)) return prev;
            const unorganizedIdx = prev.findIndex((t) => t.id === 'thread_unorganized' || t.title === 'Unorganized');
            if (unorganizedIdx === -1) return [...prev, threadToUse];
            return [...prev.slice(0, unorganizedIdx + 1), threadToUse, ...prev.slice(unorganizedIdx + 1)];
          });
          // Wait for options to update
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      // Force selection by setting selectedThread directly
      threadSelection.setSelectedThread(threadToUse.title);
      
      // Wait longer to ensure all state has propagated
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Verify one more time
      currentSelected = threadSelection.getSelectedThread();
      if (currentSelected.id !== threadToUse.id) {
        // Last resort: directly update the selectedThread state
        threadSelection.setSelectedThread(threadToUse.title);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Pass threadId directly to avoid state timing issues
      const syntheticEvent = new Event('submit', { bubbles: true, cancelable: true }) as unknown as React.FormEvent;
      await submission.handleSubmit(syntheticEvent, threadToUse.id);
    } catch (err: any) {
      console.error('[SuggestedThreadDialog] Failed to use suggested thread:', err);
      showToast('Could not use suggested thread. Saving to Unorganized.', 'warning');
      setSuggestedThreadName(null);
      const syntheticEvent = new Event('submit', { bubbles: true, cancelable: true }) as unknown as React.FormEvent;
      await submission.handleSubmit(syntheticEvent);
    }
  };

  const handleCloseDialog = () => {
    // Just close the dialog without submitting
    setShowSuggestedThreadDialog(false);
  };

  const handleKeepUnorganized = async () => {
    setShowSuggestedThreadDialog(false);
    
    // Clear the suggestion
    setSuggestedThreadName(null);
    
    // Submit the form as-is
    const syntheticEvent = new Event('submit', { bubbles: true, cancelable: true }) as unknown as React.FormEvent;
    await submission.handleSubmit(syntheticEvent);
  };

  // Handle Cmd+Enter to submit form (for elements outside TiptapEditor)
  const handleFormKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (!submission.isSubmitting && !showUnsavedDialog) {
        const formElement = e.currentTarget as HTMLFormElement;
        formElement.requestSubmit();
      }
    }
  };

  return (
    <>
      <NewNotePanelStyles />
      <form 
        onSubmit={handleFormSubmit}
        onKeyDown={handleFormKeyDown}
        className="new-note-panel h-full flex flex-col w-full"
        style={{ 
          height: '100%',
          maxHeight: '100%',
          minHeight: 0,
          width: '100%'
        }}
      >
        {/* Thread Selection */}
        <div className="mb-3.5 shrink-0">
          <ThreadCombobox
            selectedThread={threadSelection.selectedThread}
            onThreadSelect={(thread) => {
              threadSelection.handleThreadSelect(thread);
              setSuggestedThreadName(null); // Clear suggestion when user manually selects
            }}
            threads={threadSelection.threadOptions}
            placeholder="Select thread..."
            suggestedThreadName={suggestedThreadName}
            onCreateThread={(threadName) => {
              threadSelection.handleThreadSelect(threadName);
              setSuggestedThreadName(null); // Clear after confirming
            }}
          />
        </div>

        {/* Space Selector - Only show when currentSpace is provided */}
        {currentSpace && currentSpace.id && (
          <SpaceSelector
            space={currentSpace}
            isSelected={form.addToSpace}
            onToggle={() => form.setAddToSpace(!form.addToSpace)}
          />
        )}

        {/* Note Content - Type-specific layouts */}
        <div className="flex-1 flex flex-col min-h-0 note-content-wrapper" style={{ marginBottom: '12px' }}>
          {form.noteType === 'default' && (
            <DefaultNoteForm
              title={form.title}
              onTitleChange={form.setTitle}
              content={form.content}
              onContentChange={form.setContent}
              nextNoteId={nextNoteId}
              onEditorReady={handleEditorReady}
            />
          )}

          {form.noteType === 'scripture' && (
            <ScriptureNoteForm
              scriptureReference={form.scriptureReference}
              onReferenceChange={form.setScriptureReference}
              content={form.content}
              onContentChange={form.setContent}
              nextNoteId={nextNoteId}
              onEditorReady={handleEditorReady}
            />
          )}

          {form.noteType === 'resource' && (
            <NewResourcePanel
              resourceUrl={form.resourceUrl}
              onResourceUrlChange={form.setResourceUrl}
              nextNoteId={nextNoteId}
              onMetadataFetched={form.setResourceMetadata}
              onSuggestedThread={(threadId: string, threadTitle: string) => {
                // Just set the suggestion - don't change the selected thread
                // User can see "Suggested" badge and open dropdown to select/edit
                setSuggestedThreadName(threadTitle);
              }}
              onScriptureCountChange={setScriptureCount}
              onDuplicateDetected={setDuplicateInfo}
            />
          )}
        </div>

        {/* Bottom buttons */}
        <NoteFormFooter
          isSubmitting={submission.isSubmitting}
          onClose={handleClose}
          noteType={form.noteType}
          duplicateInfo={duplicateInfo}
        />
      </form>

      {/* Unsaved Changes Dialog */}
      <UnsavedChangesDialog
        isOpen={showUnsavedDialog}
        onCancel={() => setShowUnsavedDialog(false)}
        onDiscard={handleDiscardChanges}
        onSaveAndClose={handleSaveAndClose}
      />

      {/* Suggested Thread Dialog */}
      {suggestedThreadName && suggestedThreadName.trim() !== '' && (
        <SuggestedThreadDialog
          isOpen={showSuggestedThreadDialog}
          suggestedThreadName={suggestedThreadName}
          onUseSuggested={handleUseSuggestedThread}
          onKeepUnorganized={handleKeepUnorganized}
          onClose={handleCloseDialog}
        />
      )}
    </>
  );
}

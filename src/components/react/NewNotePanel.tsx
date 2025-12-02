import React, { useState, useEffect, useRef } from 'react';
import ThreadCombobox from './ThreadCombobox';
import { useNavigation } from './navigation/NavigationContext';
import { safeFetch } from '@/utils/safe-fetch';
import { captureException } from '@/utils/posthog';

// Import extracted hooks
import {
  useNewNoteForm,
  useThreadSelection,
  useScriptureDetection,
  useNoteSubmission,
} from './note-panel/hooks';

// Import extracted components
import {
  DefaultNoteForm,
  ScriptureNoteForm,
  SpaceSelector,
  NoteFormFooter,
  NewNotePanelStyles,
} from './note-panel';

import UnsavedChangesDialog from './dialogs/UnsavedChangesDialog';

interface NewNotePanelProps {
  currentThread?: any;
  currentSpace?: any;
  onClose?: () => void;
}

export default function NewNotePanel({ currentThread, currentSpace, onClose }: NewNotePanelProps) {
  // Get navigation context
  const navigation = useNavigation();
  const { addToNavigationHistory, navigationHistory } = navigation;

  // State for next note ID and unsaved dialog
  const [nextNoteId, setNextNoteId] = useState('#New');
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);

  // Ref to store the TiptapEditor instance for focusing
  const editorRef = useRef<any>(null);
  
  // Ref to track if user has interacted with content field
  const hasInteractedWithContentRef = useRef(false);

  // Use extracted form hook
  const form = useNewNoteForm({
    currentSpace,
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
    hasInteractedWithContent: hasInteractedWithContentRef,
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
    editorRef.current = editor;
    setTimeout(() => {
      if (editor && !editor.isDestroyed) {
        editor.commands.focus();
        try {
          editor.commands.setTextSelection(0);
        } catch {
          // If setTextSelection fails, just focus
        }
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
      const threadId = note?.threadId;
      
      if (threadId) {
        threadSelection.setThreadOptions(prev => prev.map(thread => 
          thread.id === threadId 
            ? { ...thread, noteCount: (thread.noteCount || 0) + 1 }
            : thread
        ));
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

  // Handle virtual keyboard
  useEffect(() => {
    const visualViewport = window.visualViewport;
    if (!visualViewport) return;

    const toolbar = document.querySelector('.tiptap-toolbar') as HTMLElement;
    if (!toolbar) return;

    const handleResize = () => {
      const keyboardHeight = window.innerHeight - visualViewport.height;
      if (keyboardHeight > 150) {
        toolbar.style.position = 'fixed';
        toolbar.style.bottom = `${keyboardHeight}px`;
        toolbar.style.width = 'calc(100% - 2rem)';
        toolbar.style.left = '1rem';
        toolbar.style.right = '1rem';
        toolbar.style.zIndex = '50';
      } else {
        toolbar.style.position = 'relative';
        toolbar.style.bottom = 'auto';
        toolbar.style.width = 'auto';
        toolbar.style.left = 'auto';
        toolbar.style.right = 'auto';
      }
    };

    visualViewport.addEventListener('resize', handleResize);
    return () => visualViewport.removeEventListener('resize', handleResize);
  }, []);

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

  // Handle form submission with dialog check
  const handleFormSubmit = async (e: React.FormEvent) => {
    if (showUnsavedDialog) {
      e.preventDefault();
      return;
    }
    await submission.handleSubmit(e);
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
        className="new-note-panel h-full flex flex-col"
        style={{ 
          height: '100%',
          maxHeight: '100%',
          minHeight: 0,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)'
        }}
      >
        {/* Thread Selection */}
        <div className="mb-3.5 shrink-0">
          <ThreadCombobox
            selectedThread={threadSelection.selectedThread}
            onThreadSelect={threadSelection.handleThreadSelect}
            threads={threadSelection.threadOptions}
            placeholder="Select thread..."
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
        <div className="flex-1 flex flex-col min-h-0 mb-3.5">
          {form.noteType === 'default' && (
            <DefaultNoteForm
              title={form.title}
              onTitleChange={form.setTitle}
              content={form.content}
              onContentChange={form.setContent}
              nextNoteId={nextNoteId}
              onEditorReady={handleEditorReady}
              onContentInteraction={() => {
                hasInteractedWithContentRef.current = true;
              }}
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
        </div>

        {/* Bottom buttons */}
        <NoteFormFooter
          isSubmitting={submission.isSubmitting}
          onClose={handleClose}
        />
      </form>

      {/* Unsaved Changes Dialog */}
      <UnsavedChangesDialog
        isOpen={showUnsavedDialog}
        onCancel={() => setShowUnsavedDialog(false)}
        onDiscard={handleDiscardChanges}
        onSaveAndClose={handleSaveAndClose}
      />
    </>
  );
}

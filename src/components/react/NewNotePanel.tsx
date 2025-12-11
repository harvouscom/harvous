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
  NewResourcePanel,
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

  // State for next note ID, unsaved dialog, and resource panel state
  const [nextNoteId, setNextNoteId] = useState('#New');
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [hasDuplicateResource, setHasDuplicateResource] = useState(false);
  const [isResourceReady, setIsResourceReady] = useState(false);
  
  // State for thread suggestions based on resource domain or note content
  const [suggestedThreadIds, setSuggestedThreadIds] = useState<string[]>([]);
  const [suggestedThreadName, setSuggestedThreadName] = useState<string | null>(null);
  const [suggestedDomain, setSuggestedDomain] = useState<string | null>(null);
  const [suggestionReasons, setSuggestionReasons] = useState<Record<string, string>>({});

  // Ref to store the TiptapEditor instance for focusing
  const editorRef = useRef<any>(null);

  // Use extracted form hook
  const form = useNewNoteForm({
    currentSpace,
  });

  // Use extracted thread selection hook
  const threadSelection = useThreadSelection({
    currentThread,
    navigationHistory,
    suggestedThreadIds: suggestedThreadIds.length > 0 ? suggestedThreadIds : undefined,
    suggestedDomain: suggestedDomain || undefined,
    suggestionReasons: Object.keys(suggestionReasons).length > 0 ? suggestionReasons : undefined,
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

  // Fetch thread suggestions for resource notes when metadata is loaded (only when defaulting to Unorganized)
  useEffect(() => {
    // Only fetch suggestions for resource notes when selected thread is Unorganized
    if (form.noteType !== 'resource' || threadSelection.selectedThread !== 'Unorganized') {
      if (form.noteType === 'resource') {
        setSuggestedThreadIds([]);
        setSuggestedThreadName(null);
        setSuggestedDomain(null);
        setSuggestionReasons({});
      }
      return;
    }

    // Only fetch if resourceUrl is valid
    if (!form.resourceUrl || form.resourceUrl.trim() === '') {
      setSuggestedThreadIds([]);
      setSuggestedThreadName(null);
      setSuggestedDomain(null);
      setSuggestionReasons({});
      return;
    }

    // Wait for metadata to be loaded before fetching suggestions (for siteName)
    // The siteName is used for clean thread name suggestions
    if (!form.resourceMetadata) {
      return;
    }

    // Debounce the suggestion fetch
    const timeoutId = setTimeout(async () => {
      try {
        const response = await safeFetch('/api/resource/suggest-threads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            resourceUrl: form.resourceUrl,
            sourceName: form.resourceMetadata?.siteName || null
          }),
          retries: 1,
          retryDelay: 500
        });

        if (response && response.ok) {
          const data = await response.json();
          if (data.success) {
            setSuggestedThreadIds(data.suggestedThreadIds || []);
            setSuggestedThreadName(data.suggestedThreadName || null);
            setSuggestedDomain(data.domain || null);
            // Note: Threads will automatically update with suggestions via useEffect in useThreadSelection
          }
        }
      } catch (error) {
        // Silently fail - suggestions are non-critical
        captureException(error as Error);
        setSuggestedThreadIds([]);
        setSuggestedThreadName(null);
        setSuggestedDomain(null);
        setSuggestionReasons({});
      }
    }, 100); // Short debounce since metadata is already loaded

    return () => clearTimeout(timeoutId);
  }, [form.noteType, form.resourceUrl, form.resourceMetadata, threadSelection.selectedThread]);

  // Fetch thread suggestions for default notes when content changes (only when defaulting to Unorganized)
  useEffect(() => {
    // Only fetch suggestions for default notes when selected thread is Unorganized
    if (form.noteType !== 'default' || threadSelection.selectedThread !== 'Unorganized') {
      if (form.noteType === 'default') {
        setSuggestedThreadIds([]);
        setSuggestedThreadName(null);
        setSuggestedDomain(null);
        setSuggestionReasons({});
      }
      return;
    }

    // Only fetch if we have some content (title or content)
    if ((!form.title || form.title.trim() === '') && (!form.content || form.content.trim() === '')) {
      setSuggestedThreadIds([]);
      setSuggestedThreadName(null);
      setSuggestedDomain(null);
      setSuggestionReasons({});
      return;
    }

    // Debounce the suggestion fetch
    const timeoutId = setTimeout(async () => {
      try {
        const response = await safeFetch('/api/notes/suggest-threads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            title: form.title || '',
            content: form.content || ''
          }),
          retries: 1,
          retryDelay: 500
        });

        if (response && response.ok) {
          const data = await response.json();
          if (data.success) {
            setSuggestedThreadIds(data.suggestedThreadIds || []);
            setSuggestedThreadName(null); // No thread name suggestion for default notes
            // Store suggestion reasons in a map for ThreadCombobox
            const reasons: Record<string, string> = {};
            if (data.suggestedThreads) {
              data.suggestedThreads.forEach((thread: { id: string; reason: string }) => {
                reasons[thread.id] = thread.reason;
              });
            }
            setSuggestionReasons(reasons);
          }
        }
      } catch (error) {
        // Silently fail - suggestions are non-critical
        captureException(error as Error);
        setSuggestedThreadIds([]);
        setSuggestedThreadName(null);
        setSuggestedDomain(null);
        setSuggestionReasons({});
      }
    }, 500); // Debounce for default notes

    return () => clearTimeout(timeoutId);
  }, [form.noteType, form.title, form.content, threadSelection.selectedThread]);

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

  // Handle creating a thread from suggestion
  const handleCreateSuggestedThread = async (threadName: string) => {
    try {
      // Create thread via API
      const formData = new FormData();
      formData.append('title', threadName);
      formData.append('color', 'paper'); // Use paper/neutral color for suggested threads
      formData.append('isPublic', 'false');
      if (currentSpace?.id) {
        formData.append('spaceId', currentSpace.id);
      }

      const response = await safeFetch('/api/threads/create', {
        method: 'POST',
        body: formData,
        retries: 1,
        retryDelay: 500
      });

      if (response && response.ok) {
        const result = await response.json();
        if (result.thread && result.thread.id) {
          // Select the newly created thread
          threadSelection.handleThreadSelect(result.thread.title);
          // Reload threads to get updated list
          await threadSelection.loadThreads();
          // Clear suggestions since we've created the thread
          setSuggestedThreadIds([]);
          setSuggestedThreadName(null);
          setSuggestedDomain(null);
        }
      }
    } catch (error) {
      captureException(error as Error);
      if (window.toast) {
        window.toast.error('Failed to create thread. Please try again.');
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
            onThreadSelect={threadSelection.handleThreadSelect}
            threads={threadSelection.threadOptions}
            placeholder="Select thread..."
            suggestedThreadIds={suggestedThreadIds}
            suggestedThreadName={suggestedThreadName}
            onCreateThread={handleCreateSuggestedThread}
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
              onDuplicateFound={(duplicate) => setHasDuplicateResource(!!duplicate)}
              onReadyStateChange={setIsResourceReady}
            />
          )}
        </div>

        {/* Bottom buttons */}
        <NoteFormFooter
          isSubmitting={submission.isSubmitting}
          onClose={handleClose}
          noteType={form.noteType}
          disabled={form.noteType === 'resource' && !isResourceReady}
          buttonTextOverride={
            form.noteType === 'resource' && hasDuplicateResource 
              ? 'Already Saved' 
              : undefined
          }
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

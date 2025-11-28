import { useState, useCallback } from 'react';
import { formatReferenceForAPI } from '@/utils/scripture-detector';
import { captureException } from '@/utils/posthog';
import { safeNavigate } from '@/utils/safe-navigate';
import type { NoteType } from './useNewNoteForm';
import type { Thread } from './useThreadSelection';

export interface UseNoteSubmissionOptions {
  // Form data
  title: string;
  content: string;
  noteType: NoteType;
  scriptureReference: string;
  scriptureVersion: string;
  resourceUrl: string;
  sourceNoteId: string | null;
  addToSpace: boolean;
  currentSpace?: { id: string } | null;
  
  // Thread data
  getSelectedThread: () => Thread;
  threadOptions: Thread[];
  
  // Navigation
  addToNavigationHistory?: (item: { id: string; title: string; count: number; backgroundGradient: string }) => void;
  
  // Callbacks
  onSuccess?: () => void;
  onClose?: () => void;
  resetForm: () => void;
  clearLocalStorage: () => void;
  loadNextNoteId: () => Promise<void>;
  setSelectedThread: (thread: string) => void;
}

export interface UseNoteSubmissionReturn {
  isSubmitting: boolean;
  setIsSubmitting: (submitting: boolean) => void;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  handleSaveAndClose: () => Promise<void>;
}

/**
 * Hook for handling note submission logic
 */
export function useNoteSubmission(options: UseNoteSubmissionOptions): UseNoteSubmissionReturn {
  const {
    title,
    content,
    noteType,
    scriptureReference,
    scriptureVersion,
    resourceUrl,
    sourceNoteId,
    addToSpace,
    currentSpace,
    getSelectedThread,
    threadOptions,
    addToNavigationHistory,
    onSuccess,
    onClose,
    resetForm,
    clearLocalStorage,
    loadNextNoteId,
    setSelectedThread,
  } = options;

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Helper to show toast
  const showToast = useCallback((message: string, type: 'info' | 'success' | 'warning' | 'error') => {
    if (window.toast && typeof window.toast[type] === 'function') {
      window.toast[type](message);
    } else {
      window.dispatchEvent(new CustomEvent('toast', {
        detail: { message, type }
      }));
    }
  }, []);

  // Helper to update navigation history in localStorage
  const updateNavigationHistory = useCallback((threadData: Thread, isUnorganized: boolean) => {
    try {
      const stored = localStorage.getItem('harvous-navigation-history-v2');
      let history = stored ? JSON.parse(stored) : [];
      
      const threadId = isUnorganized ? 'thread_unorganized' : threadData.id;
      const threadTitle = isUnorganized ? 'Unorganized' : threadData.title;
      const existingIndex = history.findIndex((item: any) => item.id === threadId);
      
      let threadItem: any;
      if (existingIndex !== -1) {
        const existingItem = history[existingIndex];
        threadItem = {
          ...existingItem,
          id: threadId,
          title: threadTitle,
          count: isUnorganized ? (existingItem.count || 0) + 1 : (threadData.noteCount || 0) + 1,
          backgroundGradient: isUnorganized 
            ? 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)'
            : threadData.backgroundGradient,
          lastAccessed: Date.now()
        };
        history[existingIndex] = threadItem;
      } else {
        threadItem = {
          id: threadId,
          title: threadTitle,
          count: isUnorganized ? 1 : (threadData.noteCount || 0) + 1,
          backgroundGradient: isUnorganized 
            ? 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)'
            : threadData.backgroundGradient,
          firstAccessed: Date.now(),
          lastAccessed: Date.now()
        };
        history.push(threadItem);
      }
      
      // Sort by firstAccessed to maintain chronological order
      history.sort((a: any, b: any) => a.firstAccessed - b.firstAccessed);
      
      // Limit to 10 items
      if (history.length > 10) {
        history = history.slice(0, 10);
      }
      
      localStorage.setItem('harvous-navigation-history-v2', JSON.stringify(history));
      sessionStorage.setItem('harvous-pending-thread', JSON.stringify(threadItem));
      
      // Update React state via callback
      if (addToNavigationHistory) {
        addToNavigationHistory({
          id: threadId,
          title: threadTitle,
          count: threadItem.count,
          backgroundGradient: threadItem.backgroundGradient
        });
      }
    } catch {
      // Fallback to just calling addToNavigationHistory
      if (addToNavigationHistory) {
        addToNavigationHistory({
          id: threadData.id,
          title: threadData.title,
          count: (threadData.noteCount || 0) + 1,
          backgroundGradient: threadData.backgroundGradient
        });
      }
    }
  }, [addToNavigationHistory]);

  // Show scripture result toasts
  const showScriptureResultToasts = useCallback((scriptureResults: any[]) => {
    scriptureResults.forEach((scriptureResult: any, index: number) => {
      setTimeout(() => {
        if (scriptureResult.action === 'created') {
          showToast(`Created scripture note: ${scriptureResult.reference}`, 'info');
        } else if (scriptureResult.action === 'added') {
          showToast(`Added ${scriptureResult.reference} to this thread`, 'info');
        } else if (scriptureResult.action === 'unorganized') {
          showToast(`Scripture note ${scriptureResult.reference} exists in Unorganized`, 'info');
        }
      }, index * 150);
    });
  }, [showToast]);

  // Handle form submission
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isSubmitting) return;
    
    // Get content - prioritize React state
    let editorContent = content;

    // Fallback to DOM queries if React state is empty/invalid
    if (!editorContent || editorContent.trim() === '' || editorContent === '<p></p>' || editorContent === '<p><br></p>') {
      const hiddenInput = document.querySelector('#new-note-content') as HTMLInputElement;
      if (hiddenInput && hiddenInput.value && hiddenInput.value.trim() !== '' && hiddenInput.value !== '<p></p>') {
        editorContent = hiddenInput.value;
      }
      
      if (!editorContent || editorContent.trim() === '') {
        const tiptapEditor = document.querySelector('.ProseMirror');
        if (tiptapEditor) {
          editorContent = tiptapEditor.innerHTML;
        }
      }
    }

    const trimmedTitle = title.trim();
    const trimmedContent = editorContent.trim();
    const trimmedScriptureRef = scriptureReference.trim();
    const trimmedResourceUrl = resourceUrl.trim();
    
    const hasContent = trimmedContent && 
      trimmedContent !== '<p></p>' && 
      trimmedContent !== '<p><br></p>' &&
      trimmedContent !== '<br>';
    
    // Type-specific validation
    if (noteType === 'default') {
      if (!trimmedTitle && !hasContent) {
        showToast('Please add a title or content to your note', 'warning');
        return;
      }
    } else if (noteType === 'scripture') {
      const apiReference = formatReferenceForAPI(trimmedScriptureRef);
      if (!apiReference.trim()) {
        showToast('Please add a scripture reference (e.g., John 3:16)', 'warning');
        return;
      }
      if (!hasContent) {
        showToast('Please add your thoughts about this scripture', 'warning');
        return;
      }
    } else if (noteType === 'resource') {
      if (!trimmedResourceUrl) {
        showToast('Please add a resource URL', 'warning');
        return;
      }
      if (!hasContent) {
        showToast('Please add your thoughts about this resource', 'warning');
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
        formData.set('title', scriptureReference);
      } else if (noteType === 'resource') {
        formData.set('title', resourceUrl);
      }
      
      formData.set('content', editorContent);
      formData.set('threadId', getSelectedThread().id);
      formData.set('noteType', noteType);
      
      if (addToSpace && currentSpace && currentSpace.id) {
        formData.set('spaceId', currentSpace.id);
      }
      
      if (noteType === 'scripture') {
        const apiReference = formatReferenceForAPI(scriptureReference);
        formData.set('scriptureReference', apiReference);
        formData.set('scriptureVersion', scriptureVersion);
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
        
        // Show toasts for scripture processing results
        if (result.scriptureResults && Array.isArray(result.scriptureResults) && result.scriptureResults.length > 0) {
          showScriptureResultToasts(result.scriptureResults);
        }
        
        const actualThreadId = getSelectedThread().id;
        
        // Add thread to navigation history
        if (result.note && actualThreadId && addToNavigationHistory) {
          const selectedThreadData = getSelectedThread();
          const threadData = selectedThreadData || threadOptions.find(thread => thread.id === actualThreadId);
          
          if (threadData && actualThreadId !== 'thread_unorganized') {
            updateNavigationHistory(threadData, false);
          } else if (actualThreadId === 'thread_unorganized') {
            updateNavigationHistory(threadData || getSelectedThread(), true);
          }
        }
        
        // Dispatch note created event
        window.dispatchEvent(new CustomEvent('noteCreated', {
          detail: { 
            note: result.note,
            actualThreadId: actualThreadId
          }
        }));

        // Verify thread in localStorage
        if (result.note && actualThreadId) {
          const verifyThreadInStorage = () => {
            try {
              const stored = localStorage.getItem('harvous-navigation-history-v2');
              if (stored) {
                const history = JSON.parse(stored);
                return history.some((item: any) => item.id === actualThreadId);
              }
              return false;
            } catch {
              return false;
            }
          };

          let attempts = 0;
          const maxAttempts = 10;
          while (!verifyThreadInStorage() && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 10));
            attempts++;
          }
        }

        // Create hyperlink in source note
        if (sourceNoteId && result.note && result.note.id) {
          const from = localStorage.getItem('newNoteSourceSelectionFrom');
          const to = localStorage.getItem('newNoteSourceSelectionTo');

          if (from && to) {
            window.dispatchEvent(new CustomEvent('createHyperlink', {
              detail: {
                sourceNoteId,
                newNoteId: result.note.id,
                from: parseInt(from, 10),
                to: parseInt(to, 10),
              }
            }));
          }
          
          localStorage.removeItem('newNoteSourceNoteId');
          localStorage.removeItem('newNoteSourceSelectionFrom');
          localStorage.removeItem('newNoteSourceSelectionTo');
          localStorage.removeItem('newNoteSourceSelectionPlainText');
        }

        await new Promise(resolve => setTimeout(resolve, 200));

        // Navigate to newly created note
        if (result.note && result.note.id) {
          const redirectUrl = `/${result.note.id}?toast=success&message=${encodeURIComponent(result.success || 'Note created successfully!')}`;
          safeNavigate(redirectUrl, { history: 'replace' });
        }

        // Reset form
        resetForm();
        setSelectedThread('Unorganized');
        setIsSubmitting(false);
        clearLocalStorage();
        
        // Refresh next note ID
        loadNextNoteId();
        
        // Close panel
        if (onClose) {
          onClose();
        }
        
        if (onSuccess) {
          onSuccess();
        }
      } else {
        const error = await response.json();
        showToast(error.error || 'Error creating note', 'error');
        setIsSubmitting(false);
      }
    } catch (error: any) {
      if (typeof window !== 'undefined' && window.posthog) {
        captureException(error, {
          context: 'note_creation',
          endpoint: '/api/notes/create',
        });
      }
      
      showToast(`Error creating note: ${error?.message || 'Please try again.'}`, 'error');
      setIsSubmitting(false);
    }
  }, [
    isSubmitting, content, title, scriptureReference, resourceUrl, noteType,
    scriptureVersion, addToSpace, currentSpace, getSelectedThread, threadOptions,
    addToNavigationHistory, sourceNoteId, resetForm, setSelectedThread, clearLocalStorage,
    loadNextNoteId, onClose, onSuccess, showToast, showScriptureResultToasts, updateNavigationHistory
  ]);

  // Handle save and close from dialog
  const handleSaveAndClose = useCallback(async () => {
    try {
      const formData = new FormData();
      
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
      
      if (noteType === 'scripture') {
        const apiReference = formatReferenceForAPI(scriptureReference);
        formData.set('scriptureReference', apiReference);
        formData.set('scriptureVersion', scriptureVersion);
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
        
        showToast('Note saved successfully!', 'success');

        if (result.scriptureResults && result.scriptureResults.length > 0) {
          for (const scriptureResult of result.scriptureResults) {
            if (scriptureResult.action === 'created') {
              showToast(`Created scripture note: ${scriptureResult.reference}`, 'success');
            } else if (scriptureResult.action === 'added') {
              showToast(`Added ${scriptureResult.reference} to this thread`, 'success');
            }
          }
        }

        if (result.note && result.note.id) {
          setTimeout(() => {
            safeNavigate(`/${result.note.id}`, { history: 'replace' });
          }, 100);
        }
      }
    } catch {
      // Error saving note - continue with close
    }
  }, [noteType, title, scriptureReference, resourceUrl, content, getSelectedThread, scriptureVersion, showToast]);

  return {
    isSubmitting,
    setIsSubmitting,
    handleSubmit,
    handleSaveAndClose,
  };
}

// Extend Window interface
declare global {
  interface Window {
    posthog?: any;
  }
}


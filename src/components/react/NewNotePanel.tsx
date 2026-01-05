import React, { useState, useEffect, useRef, useCallback } from 'react';
import ThreadCombobox from './ThreadCombobox';
import { useNavigation } from './navigation/NavigationContext';
import { safeFetch } from '@/utils/safe-fetch';
import { captureException } from '@/utils/posthog';
import { getThreadGradientCSS } from '@/utils/colors';
import { debug } from '@/utils/logger';
import { safeURL } from '@/utils/safe-url';

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
  const [pendingThreadName, setPendingThreadName] = useState<string | null>(null);
  
  // State for subscription limit check
  const [isLimitReached, setIsLimitReached] = useState(false);
  const [currentCount, setCurrentCount] = useState(0);
  const [limit, setLimit] = useState(1000);

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
    setNoteType: form.setNoteType,
    setScriptureReference: form.setScriptureReference,
    setScriptureVersion: form.setScriptureVersion,
    setContent: form.setContent,
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

  // Check subscription status via API (simplified - no client-side checks needed)
  const checkSubscriptionStatus = useCallback(async () => {
    // Don't check if page isn't ready
    if (typeof window === 'undefined' || document.readyState === 'loading') {
      return;
    }

    try {
      const response = await fetch('/api/subscription/status', {
        credentials: 'include',
        cache: 'no-store'
      });
      
      if (response.ok) {
        const data = await response.json();
        setCurrentCount(data.currentCount || 0);
        setLimit(data.limit || 1000);
        setIsLimitReached(!data.hasUnlimited && (data.currentCount || 0) >= (data.limit || 1000));
      } else {
        // Only log if it's not a 401 (unauthorized) - that's expected if user isn't logged in
        if (response.status !== 401) {
          console.warn('[NewNotePanel] Subscription status check returned:', response.status);
        }
      }
    } catch (error) {
      // Only log if it's not a network error during page load
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        // This can happen during page transitions or if the server isn't ready
        // Silently ignore - the check will retry on next interaction
        return;
      }
      console.error('[NewNotePanel] Failed to check subscription status:', error);
    }
  }, []);

  // Check subscription status on mount
  useEffect(() => {
    checkSubscriptionStatus();
  }, [checkSubscriptionStatus]);

  // Check URL parameters for upgrade success on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const upgradeSuccess = urlParams.get('upgrade') === 'success' || urlParams.get('success') === 'true';
    
    if (upgradeSuccess) {
      console.log('[NewNotePanel] Detected upgrade success in URL, refreshing subscription status...');
      // Small delay to ensure subscription is fully processed
      setTimeout(() => {
        checkSubscriptionStatus();
      }, 500);
      
      // Clean up URL parameter without reloading
      const newUrl = safeURL(window.location.href);
      if (newUrl) {
        newUrl.searchParams.delete('upgrade');
        newUrl.searchParams.delete('success');
        window.history.replaceState({}, '', newUrl.toString());
      }
    }
  }, [checkSubscriptionStatus]);

  // Listen for Astro navigation events to re-check subscription
  useEffect(() => {
    const handlePageLoad = () => {
      console.log('[NewNotePanel] Page loaded, checking subscription status...');
      checkSubscriptionStatus();
    };
    
    document.addEventListener('astro:page-load', handlePageLoad);
    
    return () => {
      document.removeEventListener('astro:page-load', handlePageLoad);
    };
  }, [checkSubscriptionStatus]);

  // Listen for window focus/visibility changes to re-check subscription
  // Only check when page becomes visible (not on every focus to avoid errors)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && document.readyState === 'complete') {
        checkSubscriptionStatus();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [checkSubscriptionStatus]);

  // Listen for subscription upgrade events (triggered after successful payment)
  useEffect(() => {
    const handleSubscriptionUpgraded = () => {
      checkSubscriptionStatus();
    };
    
    window.addEventListener('subscriptionUpgraded', handleSubscriptionUpgraded);
    return () => window.removeEventListener('subscriptionUpgraded', handleSubscriptionUpgraded);
  }, [checkSubscriptionStatus]);

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
    setPendingThreadName(null); // Clear pending thread name on close
    
    // Remove any pending threads from options
    threadSelection.setThreadOptions(prev => prev.filter(t => !t.id.startsWith('pending_')));
    
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
    // If there's a pending thread, create it first (same logic as handleFormSubmit)
    if (pendingThreadName) {
      try {
        const trimmedName = pendingThreadName.trim();
        
        // Check if a thread with this name already exists
        const existingThread = threadSelection.threadOptions.find(
          (t) => t.title.trim().toLowerCase() === trimmedName.toLowerCase() && !t.id.startsWith('pending_')
        );
        
        if (existingThread) {
          // Use existing thread
          threadSelection.handleThreadSelect(existingThread.title);
          setPendingThreadName(null);
          threadSelection.setThreadOptions(prev => prev.filter(t => !t.id.startsWith('pending_')));
        } else {
          // Create the thread
          const formData = new FormData();
          formData.set('title', trimmedName);
          formData.set('isPublic', 'false');
          formData.set('color', 'paper');
          formData.set('spaceId', currentSpace?.id || '');

          const response = await fetch('/api/threads/create', {
            method: 'POST',
            body: formData,
            credentials: 'include',
          });

          if (!response.ok) {
            throw new Error('Failed to create thread');
          }

          const data = await response.json();
          const created = data?.thread;
          if (created?.id) {
            // Dispatch threadCreated event
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('threadCreated', {
                detail: { thread: created }
              }));
            }, 100);

            // Add thread to options
            const threadToUse: Thread = {
              id: created.id,
              title: created.title,
              noteCount: 0,
              backgroundGradient: getThreadGradientCSS(created.color || 'paper'),
              color: created.color || null,
            };

            threadSelection.setThreadOptions((prev) => {
              const filtered = prev.filter(t => !t.id.startsWith('pending_'));
              const unorganizedIdx = filtered.findIndex((t) => t.id === 'thread_unorganized' || t.title === 'Unorganized');
              if (filtered.some((t) => t.id === created.id)) return filtered;
              const updated = unorganizedIdx === -1 
                ? [...filtered, threadToUse]
                : [...filtered.slice(0, unorganizedIdx + 1), threadToUse, ...filtered.slice(unorganizedIdx + 1)];
              return updated;
            });

            await new Promise((resolve) => setTimeout(resolve, 100));
            threadSelection.handleThreadSelect(created.title);
            setPendingThreadName(null);
          }
        }
      } catch (err: any) {
        console.error('[NewNotePanel] Failed to create thread in handleSaveAndClose:', err);
        showToast('Could not create thread. Note saved to Unorganized.', 'warning');
        setPendingThreadName(null);
        threadSelection.setThreadOptions(prev => prev.filter(t => !t.id.startsWith('pending_')));
        threadSelection.handleThreadSelect('Unorganized');
      }
    }
    
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
    
    // Check if there's a pending thread name that needs to be created
    let threadIdToUse: string | undefined;
    
    if (pendingThreadName) {
      e.preventDefault(); // Prevent default submission until thread is created
      
      try {
        const trimmedName = pendingThreadName.trim();
        
        // Check if a thread with this name already exists (might have been created by another user/session)
        const existingThread = threadSelection.threadOptions.find(
          (t) => t.title.trim().toLowerCase() === trimmedName.toLowerCase() && !t.id.startsWith('pending_')
        );
        
        if (existingThread) {
          // Use existing thread instead of creating duplicate
          debug('[NewNotePanel] Using existing thread instead of creating duplicate', { threadId: existingThread.id, title: existingThread.title });
          threadIdToUse = existingThread.id;
          setPendingThreadName(null);
          
          // Remove pending thread from options
          threadSelection.setThreadOptions(prev => prev.filter(t => !t.id.startsWith('pending_')));
          
          // Select the existing thread
          threadSelection.handleThreadSelect(existingThread.title);
        } else {
          // Create the thread
          const formData = new FormData();
          formData.set('title', trimmedName);
          formData.set('isPublic', 'false');
          formData.set('color', 'paper'); // New threads from dropdown use paper color
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
            console.error('[NewNotePanel] Thread create response missing thread info:', data);
            throw new Error('Thread create response missing thread info');
          }

          debug('[NewNotePanel] Thread created successfully during note submission', { threadId: created.id, title: created.title });

          // Dispatch threadCreated event to refresh dashboard and navigation
          setTimeout(() => {
            debug('[NewNotePanel] Dispatching threadCreated event', { threadId: created.id });
            window.dispatchEvent(new CustomEvent('threadCreated', {
              detail: { thread: created }
            }));
          }, 100);

          // Create thread object for the new thread
          const threadToUse: Thread = {
            id: created.id,
            title: created.title,
            noteCount: 0,
            backgroundGradient: getThreadGradientCSS(created.color || 'paper'),
            color: created.color || null,
          };

          // Remove pending thread and add the real thread to options
          threadSelection.setThreadOptions((prev) => {
            const filtered = prev.filter(t => !t.id.startsWith('pending_'));
            const unorganizedIdx = filtered.findIndex((t) => t.id === 'thread_unorganized' || t.title === 'Unorganized');
            if (filtered.some((t) => t.id === created.id)) return filtered;
            const updated = unorganizedIdx === -1 
              ? [...filtered, threadToUse]
              : [...filtered.slice(0, unorganizedIdx + 1), threadToUse, ...filtered.slice(unorganizedIdx + 1)];
            return updated;
          });

          // Wait a bit for state to update
          await new Promise((resolve) => setTimeout(resolve, 100));

          threadIdToUse = created.id;
          setPendingThreadName(null);
        }
      } catch (err: any) {
        console.error('[NewNotePanel] Failed to create thread during note submission:', err);
        showToast('Could not create thread. Note saved to Unorganized.', 'warning');
        setPendingThreadName(null);
        
        // Remove pending thread from options
        threadSelection.setThreadOptions(prev => prev.filter(t => !t.id.startsWith('pending_')));
        
        // Fallback to Unorganized
        threadIdToUse = 'thread_unorganized';
        threadSelection.handleThreadSelect('Unorganized');
      }
    }
    
    // Check if there's a pending threadId from legacy onCreateThread (for backward compatibility)
    const pendingThreadId = (window as any).__pendingThreadId;
    if (pendingThreadId) {
      debug('[NewNotePanel] Using pending threadId (legacy)', { pendingThreadId });
      // Clear it so it's only used once
      delete (window as any).__pendingThreadId;
      await submission.handleSubmit(e, pendingThreadId);
    } else if (threadIdToUse) {
      // Use the newly created thread ID
      await submission.handleSubmit(e, threadIdToUse);
    } else {
      // No pending thread, submit normally
      await submission.handleSubmit(e);
    }
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
          console.error('[NewNotePanel] Thread create response missing thread info:', data);
          throw new Error('Thread create response missing thread info');
        }

        debug('[NewNotePanel] Thread created successfully', { threadId: created.id, title: created.title });

        // Dispatch threadCreated event to refresh dashboard and navigation
        // Add a small delay to ensure database commit before dispatching
        setTimeout(() => {
          debug('[NewNotePanel] Dispatching threadCreated event', { threadId: created.id });
          window.dispatchEvent(new CustomEvent('threadCreated', {
            detail: { thread: created }
          }));
        }, 100);

        // Create thread object for the new thread
        threadToUse = {
          id: created.id,
          title: created.title,
          noteCount: 0,
          backgroundGradient: getThreadGradientCSS(created.color || 'paper'),
          color: created.color || null, // Ensure color is string | null, not undefined
        };
        
        // Verify thread exists in database before proceeding (small delay to ensure commit)
        debug('[NewNotePanel] Waiting for thread commit');
        await new Promise((resolve) => setTimeout(resolve, 100));

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

      // Store the threadId so handleFormSubmit can use it (matching onCreateThread pattern)
      (window as any).__pendingThreadId = threadToUse.id;
      debug('[NewNotePanel] Stored pending threadId', { threadId: threadToUse.id });
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



  return (
    <>
      <NewNotePanelStyles />
      <form 
        onSubmit={handleFormSubmit}
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
              
              // Clear pending thread name if user manually selects a different thread
              // Check if the selected thread is not the pending one
              if (pendingThreadName && thread.trim().toLowerCase() !== pendingThreadName.trim().toLowerCase()) {
                setPendingThreadName(null);
                // Remove pending thread from options
                threadSelection.setThreadOptions(prev => prev.filter(t => !t.id.startsWith('pending_')));
              }
            }}
            threads={threadSelection.threadOptions}
            placeholder="Select thread..."
            suggestedThreadName={suggestedThreadName}
            onSuggestedThreadNameChange={(editedName) => {
              // Sync edited thread name back to suggestedThreadName state
              // This ensures the SuggestedThreadDialog shows the edited name
              if (editedName && editedName.trim()) {
                setSuggestedThreadName(editedName.trim());
              }
            }}
            onCreateThread={async (threadName) => {
              const trimmedName = threadName.trim();
              if (!trimmedName) return;

              // Check if a thread with this name already exists
              const existingThread = threadSelection.threadOptions.find(
                (t) => t.title.trim().toLowerCase() === trimmedName.toLowerCase()
              );

              if (existingThread) {
                // If thread exists, just select it
                threadSelection.handleThreadSelect(existingThread.title);
                setPendingThreadName(null);
                setSuggestedThreadName(null);
                return;
              }

              // Store the thread name as pending - it will be created when the note is submitted
              setPendingThreadName(trimmedName);
              
              // Create a temporary thread object for display purposes
              const pendingThread: Thread = {
                id: `pending_${Date.now()}`, // Temporary ID for pending thread
                title: trimmedName,
                noteCount: 0,
                backgroundGradient: getThreadGradientCSS('paper'),
                color: 'paper',
              };

              // Add pending thread to options and select it
              threadSelection.setThreadOptions((prev) => {
                // Remove any existing pending thread with the same name
                const filtered = prev.filter(t => !t.id.startsWith('pending_') || t.title !== trimmedName);
                const unorganizedIdx = filtered.findIndex((t) => t.id === 'thread_unorganized' || t.title === 'Unorganized');
                const updated = unorganizedIdx === -1 
                  ? [...filtered, pendingThread]
                  : [...filtered.slice(0, unorganizedIdx + 1), pendingThread, ...filtered.slice(unorganizedIdx + 1)];
                
                return updated;
              });

              // Select the pending thread
              threadSelection.handleThreadSelect(trimmedName);
              
              // Clear suggested thread name
              setSuggestedThreadName(null);
              
              debug('[NewNotePanel] Stored pending thread name', { threadName: trimmedName });
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
              parentThreadId={threadSelection.getSelectedThread()?.id}
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
              parentThreadId={threadSelection.getSelectedThread()?.id}
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
          isLimitReached={isLimitReached}
          currentCount={currentCount}
          limit={limit}
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

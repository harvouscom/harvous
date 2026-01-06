import { useState, useCallback } from 'react';
import { formatReferenceForAPI } from '@/utils/scripture-detector';
import { captureException } from '@/utils/posthog';
import { normalizeUrl, validateResourceUrl } from '@/utils/validation';
import { debug } from '@/utils/logger';
import { buildAPIUrl, getSafeOrigin, safeURL } from '@/utils/safe-url';
import { createNoteOffline, cacheHighestSimpleNoteId } from '@/utils/offline-mutations';
import { usePersistedUserId } from '@/utils/user-id';
import { isNetworkError } from '@/utils/network';
import type { NoteType, ResourceMetadata } from './useNewNoteForm';
import type { Thread } from './useThreadSelection';

export interface UseNoteSubmissionOptions {
  // Form data
  title: string;
  content: string;
  noteType: NoteType;
  scriptureReference: string;
  scriptureVersion: string;
  resourceUrl: string;
  resourceMetadata: ResourceMetadata | null;
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
  
  // State setters for scripture detection on submit
  setNoteType: (type: NoteType) => void;
  setScriptureReference: (ref: string) => void;
  setScriptureVersion: (version: string) => void;
  setContent: (content: string) => void;
}

export interface UseNoteSubmissionReturn {
  isSubmitting: boolean;
  setIsSubmitting: (submitting: boolean) => void;
  handleSubmit: (e: React.FormEvent, overrideThreadId?: string) => Promise<void>;
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
    resourceMetadata,
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
    setNoteType,
    setScriptureReference,
    setScriptureVersion,
    setContent,
  } = options;

  const userId = usePersistedUserId();
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
      // CRITICAL: Validate threadData before accessing its properties
      if (!isUnorganized && (!threadData || !threadData.id)) {
        console.error('[updateNavigationHistory] Invalid threadData:', {
          isUnorganized,
          threadDataExists: !!threadData,
          threadDataId: threadData?.id,
          threadDataTitle: threadData?.title
        });
        return;
      }
      
      const stored = localStorage.getItem('harvous-navigation-history-v2');
      let history = stored ? JSON.parse(stored) : [];
      
      const threadId = isUnorganized ? 'thread_unorganized' : threadData.id;
      const threadTitle = isUnorganized ? 'Unorganized' : threadData.title;
      
      // Validate threadId is not undefined
      if (!threadId) {
        console.error('[updateNavigationHistory] threadId is undefined:', {
          isUnorganized,
          threadDataId: threadData?.id
        });
        return;
      }
      
      debug('[updateNavigationHistory] Storing thread in navigation history', {
        threadId: threadId,
        threadTitle: threadTitle,
        isUnorganized: isUnorganized
      });
      
      const existingIndex = history.findIndex((item: any) => item.id === threadId);
      
      let threadItem: any;
      if (existingIndex !== -1) {
        // Thread already exists in history - update it
        const existingItem = history[existingIndex];
        
        threadItem = {
          ...existingItem,
          id: threadId, // CRITICAL: Ensure we use the correct threadId
          title: threadTitle,
          count: isUnorganized ? (existingItem.count || 0) + 1 : (threadData.noteCount || 0) + 1,
          backgroundGradient: isUnorganized 
            ? 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)'
            : threadData.backgroundGradient,
          lastAccessed: Date.now()
        };
        history[existingIndex] = threadItem;
      } else {
        // Thread doesn't exist - add it as new
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

  // Handle form submission
  const handleSubmit = useCallback(async (e: React.FormEvent, overrideThreadId?: string) => {
    e.preventDefault();
    
    if (isSubmitting) return;
    
    // Re-check subscription status right before submission as a final fallback
    // This catches cases where subscription became active but UI didn't update
    debug('[useNoteSubmission] Re-checking subscription status before submission...');
    try {
      const statusResponse = await fetch('/api/subscription/status', {
        credentials: 'include',
        cache: 'no-store'
      });
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        debug('[useNoteSubmission] Pre-submission subscription check:', statusData);
        if (statusData.hasUnlimited) {
          // Dispatch event to update UI
          window.dispatchEvent(new CustomEvent('subscriptionUpgraded', {
            detail: { hasUnlimited: true, currentCount: statusData.currentCount, limit: statusData.limit }
          }));
          debug('[useNoteSubmission] Subscription is active, proceeding with note creation...');
        }
      }
    } catch (error) {
      console.error('[useNoteSubmission] Error checking subscription before submission:', error);
      // Continue with submission anyway
    }
    
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
    
    // Scripture detection on submit (if noteType is still default and title looks like scripture)
    // This handles cases where user submits before the auto-detection debounce completes
    let currentNoteType = noteType;
    let currentScriptureReference = scriptureReference;
    let currentScriptureVersion = scriptureVersion;
    let currentContent = editorContent;
    
    if (currentNoteType === 'default' && trimmedTitle.length >= 5) {
      try {
        const detectionResponse = await fetch('/api/scripture/detect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: trimmedTitle }),
          credentials: 'include'
        });

        if (detectionResponse.ok) {
          const detection = await detectionResponse.json();
          
          if (detection.isScripture && detection.confidence >= 0.7 && detection.primaryReference) {
            // Fetch verse text
            try {
              const verseResponse = await fetch('/api/scripture/fetch-verse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reference: detection.primaryReference }),
                credentials: 'include'
              });

              if (verseResponse.ok) {
                const verseData = await verseResponse.json();
                
                // Update state via setters
                setNoteType('scripture');
                setScriptureReference(detection.primaryReference);
                setScriptureVersion('NET');
                
                // Set verse text as content only if content is empty or very short
                if (!currentContent || currentContent.trim().length < 10 || currentContent === '<p></p>' || currentContent === '<p><br></p>') {
                  setContent(verseData.text);
                  currentContent = verseData.text;
                }
                
                // Update local variables for use in rest of function
                currentNoteType = 'scripture';
                currentScriptureReference = detection.primaryReference;
                currentScriptureVersion = 'NET';
              }
            } catch {
              // Silently fail - proceed with default note type
            }
          }
        }
      } catch {
        // Silently fail - proceed with default note type
      }
    }
    
    // Type-specific validation (use currentNoteType which may have been updated by detection)
    let normalizedResourceUrl = '';
    if (currentNoteType === 'default') {
      if (!trimmedTitle && !hasContent) {
        showToast('Please add a title or content to your note', 'warning');
        return;
      }
    } else if (currentNoteType === 'scripture') {
      const apiReference = formatReferenceForAPI(currentScriptureReference.trim());
      if (!apiReference.trim()) {
        showToast('Please add a scripture reference (e.g., John 3:16)', 'warning');
        return;
      }
      if (!hasContent) {
        showToast('Please add your thoughts about this scripture', 'warning');
        return;
      }
    } else if (currentNoteType === 'resource') {
      if (!trimmedResourceUrl) {
        showToast('Please add a resource URL', 'warning');
        return;
      }
      // Validate URL with comprehensive security checks
      const urlValidation = validateResourceUrl(trimmedResourceUrl);
      if (!urlValidation.isValid) {
        // Show user-friendly error message
        const errorMessage = urlValidation.error || 'Please enter a valid URL';
        showToast(errorMessage, 'warning');
        return;
      }
      // Use normalized URL from validation
      normalizedResourceUrl = urlValidation.normalizedUrl!;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      
      // Set title based on note type (use currentNoteType which may have been updated by detection)
      if (currentNoteType === 'default') {
        formData.set('title', title);
      } else if (currentNoteType === 'scripture') {
        formData.set('title', currentScriptureReference);
      } else if (currentNoteType === 'resource') {
        formData.set('title', normalizedResourceUrl);
      }
      
      formData.set('content', currentContent);
      // Allow threadId override (useful when state hasn't updated yet)
      const threadIdToUse = overrideThreadId || getSelectedThread().id;
      
      // Debug logging to verify threadId is being passed correctly
      if (overrideThreadId) {
        debug('[useNoteSubmission] Using overrideThreadId', { overrideThreadId });
      }
      debug('[useNoteSubmission] Thread ID selection', { threadIdToUse });
      
      formData.set('threadId', threadIdToUse);
      
      // Verify it was set correctly
      const verifyThreadId = formData.get('threadId');
      debug('[useNoteSubmission] Verified threadId in formData', { verifyThreadId });
      formData.set('noteType', currentNoteType);
      
      if (addToSpace && currentSpace && currentSpace.id) {
        formData.set('spaceId', currentSpace.id);
      }
      
      if (currentNoteType === 'scripture') {
        const apiReference = formatReferenceForAPI(currentScriptureReference);
        formData.set('scriptureReference', apiReference);
        formData.set('scriptureVersion', currentScriptureVersion);
      } else if (currentNoteType === 'resource') {
        formData.set('resourceUrl', normalizedResourceUrl);
        // Pass pre-fetched metadata to avoid re-fetching on the server
        if (resourceMetadata) {
          formData.set('resourceMetadata', JSON.stringify(resourceMetadata));
        }
      }

      // OFFLINE-FIRST: Create note in local IndexedDB immediately
      let offlineNoteId: string | null = null;
      if (userId) {
        try {
          const threadIdToUse = overrideThreadId || getSelectedThread().id;
          offlineNoteId = await createNoteOffline(userId, {
            title: currentNoteType === 'default' ? title : (currentNoteType === 'scripture' ? currentScriptureReference : normalizedResourceUrl),
            content: currentContent,
            threadId: threadIdToUse,
            spaceId: addToSpace && currentSpace?.id ? currentSpace.id : undefined,
            noteType: currentNoteType,
            scriptureReference: currentNoteType === 'scripture' ? formatReferenceForAPI(currentScriptureReference) : undefined,
            scriptureVersion: currentNoteType === 'scripture' ? currentScriptureVersion : undefined,
            resourceUrl: currentNoteType === 'resource' ? normalizedResourceUrl : undefined,
            resourceMetadata: currentNoteType === 'resource' ? resourceMetadata : undefined,
          });
          debug('[useNoteSubmission] Note created locally in IndexedDB', { offlineNoteId });
        } catch (err) {
          console.error('[useNoteSubmission] Failed to create note offline:', err);
          // Continue with server API call - if offline fails, at least server still has it
        }
      }

      // Try to push to server (will queue if offline)
      let response: Response | null = null;
      let networkError = false;
      
      try {
        response = await fetch('/api/notes/create', {
          method: 'POST',
          body: formData,
          credentials: 'include'
        });
      } catch (error) {
        // Network error occurred (offline, fetch failed, etc.)
        networkError = isNetworkError(error);
        
        if (networkError && offlineNoteId) {
          // Offline save succeeded - treat as success
          debug('[useNoteSubmission] Network error but note saved offline, treating as success', { offlineNoteId });
          
          // Show "Saved offline" toast
          showToast('Note saved offline. It will sync when you\'re back online.', 'success');
          
          // Dispatch noteCreated event with offline note data
          const threadIdToUse = overrideThreadId || getSelectedThread().id;
          const offlineNoteEvent = new CustomEvent('noteCreated', {
            detail: {
              note: {
                id: offlineNoteId,
                title: currentNoteType === 'default' ? title : (currentNoteType === 'scripture' ? currentScriptureReference : normalizedResourceUrl),
                content: currentContent,
                noteType: currentNoteType,
                threadId: threadIdToUse,
                spaceId: addToSpace && currentSpace?.id ? currentSpace.id : null,
              },
              actualThreadId: threadIdToUse,
              noteId: offlineNoteId,
              threadId: threadIdToUse,
              spaceId: addToSpace && currentSpace?.id ? currentSpace.id : null,
              isOffline: true
            }
          });
          window.dispatchEvent(offlineNoteEvent);
          
          // CRITICAL: Set isSubmitting to false BEFORE closing panel
          // This ensures state updates complete before component unmounts
          setIsSubmitting(false);
          
          // Reset form and close panel
          resetForm();
          setSelectedThread('Unorganized');
          clearLocalStorage();
          localStorage.removeItem('showNewNotePanel');
          localStorage.removeItem('showNewThreadPanel');
          localStorage.removeItem('showNewResourcePanel');
          
          // Refresh note ID preview for next note creation
          try {
            await loadNextNoteId();
          } catch (err) {
            console.error('[useNoteSubmission] Failed to refresh note ID preview:', err);
          }
          
          // Small delay to ensure state updates complete before closing
          await new Promise(resolve => setTimeout(resolve, 50));
          
          if (onClose) {
            onClose();
          }
          window.dispatchEvent(new CustomEvent('closeNewNotePanel'));
          
          // Stay on current page when offline - note will appear in list from IndexedDB
          // Just refresh the current page to show the new note
          const currentUrl = safeURL(window.location.href);
          if (currentUrl) {
            // Add toast message to current URL
            currentUrl.searchParams.set('toast', 'success');
            currentUrl.searchParams.set('message', encodeURIComponent('Note saved offline. It will sync when you\'re back online.'));
            // Stay on current page - don't navigate
            window.history.replaceState({}, '', currentUrl.toString());
          }
          
          return;
        } else {
          // Network error but offline save also failed - rethrow
          throw error;
        }
      }

      if (response && response.ok) {
        const result = await response.json();
        
        // Cache the simpleNoteId for offline access
        // This ensures the next note ID is correct when going offline
        if (result.note && result.note.simpleNoteId && userId) {
          cacheHighestSimpleNoteId(userId, result.note.simpleNoteId);
          debug('[useNoteSubmission] Cached simpleNoteId', { simpleNoteId: result.note.simpleNoteId });
        }
        
        // Build scripture toast message for redirect (only for 'created' actions - these are non-obvious)
        // 'added' and 'unorganized' actions are visible when viewing the thread, so we skip those
        let scriptureToastMessage = '';
        if (result.scriptureResults && Array.isArray(result.scriptureResults)) {
          const createdScriptures = result.scriptureResults.filter(
            (r: any) => r.action === 'created'
          );
          
          if (createdScriptures.length === 1) {
            scriptureToastMessage = `Created scripture note: ${createdScriptures[0].reference}`;
          } else if (createdScriptures.length > 1) {
            scriptureToastMessage = `Created ${createdScriptures.length} scripture notes`;
          }
        }
        
        // Use overrideThreadId if provided, otherwise get from selected thread
        // CRITICAL: If overrideThreadId is provided, ALWAYS use it - never fall back to getSelectedThread().id
        // This is the source of truth for newly created threads
        // getSelectedThread().id might return stale data (last selected thread, not the new one)
        const actualThreadId = overrideThreadId ?? getSelectedThread().id;
        
        // PHASE 1: Database Commit Verification
        // Verify the note exists in the target thread before proceeding with navigation
        // This ensures database commits are visible before we navigate
        if (result.note && result.note.id && actualThreadId) {
          const verifyNoteInThread = async (noteId: string, threadId: string, maxAttempts = 3): Promise<boolean> => {
            const delays = [100, 200, 400]; // Exponential backoff in ms
            
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
              try {
                const url = buildAPIUrl(`/api/threads/${threadId}/notes`, {
                  offset: '0',
                  limit: '100'
                });
                
                if (!url) {
                  throw new Error('Failed to build verification URL');
                }
                
                const verifyResponse = await fetch(url, {
                  credentials: 'include',
                  cache: 'no-store'
                });
                
                if (verifyResponse.ok) {
                  const data = await verifyResponse.json();
                  const notes = data.notes || [];
                  const noteExists = notes.some((n: any) => n.id === noteId);
                  
                  if (noteExists) {
                    debug('[useNoteSubmission] Note verified in thread', { noteId, threadId, attempt: attempt + 1 });
                    return true;
                  }
                }
                
                // If not found and not last attempt, wait before retrying
                if (attempt < maxAttempts - 1) {
                  await new Promise(resolve => setTimeout(resolve, delays[attempt]));
                }
              } catch (error) {
                debug('[useNoteSubmission] Verification attempt failed', { noteId, threadId, attempt: attempt + 1, error });
                // Continue to next attempt
                if (attempt < maxAttempts - 1) {
                  await new Promise(resolve => setTimeout(resolve, delays[attempt]));
                }
              }
            }
            
            // If we get here, verification failed after all attempts
            debug('[useNoteSubmission] Note verification failed after all attempts', { noteId, threadId });
            return false;
          };
          
          // Verify note exists in thread (with timeout to prevent hanging)
          // Note: sessionStorage is now written before event dispatch to avoid race conditions
          const verificationPromise = verifyNoteInThread(result.note.id, actualThreadId);
          const timeoutPromise = new Promise<boolean>((resolve) => 
            setTimeout(() => resolve(false), 2000) // 2 second max wait
          );
          
          const verified = await Promise.race([verificationPromise, timeoutPromise]);
          if (!verified) {
            debug('[useNoteSubmission] Note verification timed out or failed, proceeding anyway', {
              noteId: result.note.id,
              threadId: actualThreadId
            });
            // Continue anyway - the client-side refresh will handle it
          }
        }
        
        // CRITICAL: Define finalThreadId to use consistently throughout this function
        // Since actualThreadId already prioritizes overrideThreadId, finalThreadId is the same
        // but we use this name for clarity in navigation history updates
        const finalThreadId = actualThreadId;
        
        // Thread ID selection (debug only)
        debug('[useNoteSubmission] Thread ID selection', {
          overrideThreadId: overrideThreadId,
          actualThreadId: actualThreadId,
          finalThreadId: finalThreadId
        });
        
        // CRITICAL: If overrideThreadId was provided but we're not using it, that's an error
        if (overrideThreadId && overrideThreadId !== actualThreadId) {
          console.error('[useNoteSubmission] CRITICAL ERROR: overrideThreadId provided but not used!', {
            overrideThreadId: overrideThreadId,
            actualThreadId: actualThreadId,
            getSelectedThreadId: getSelectedThread().id,
            reason: 'This should never happen - actualThreadId should equal overrideThreadId when overrideThreadId is provided'
          });
          // Force use overrideThreadId - it's the source of truth
          const forcedThreadId = overrideThreadId;
          console.warn('[useNoteSubmission] FORCING use of overrideThreadId:', forcedThreadId);
          // We'll use forcedThreadId below instead of actualThreadId
        }
        
        // Navigation history update (debug only)
        debug('[useNoteSubmission] Navigation history update', {
          actualThreadId: actualThreadId,
          overrideThreadId: overrideThreadId
        });
        
        // CRITICAL: If overrideThreadId is provided, it should be used for navigation history
        // This ensures the newly created thread is added, not the last selected thread
        if (overrideThreadId && overrideThreadId !== actualThreadId) {
          console.warn('[useNoteSubmission] WARNING: overrideThreadId differs from actualThreadId:', {
            overrideThreadId: overrideThreadId,
            actualThreadId: actualThreadId,
            getSelectedThreadId: getSelectedThread().id
          });
        }
        
        // CRITICAL: Validate actualThreadId before proceeding
        if (!actualThreadId || typeof actualThreadId !== 'string' || actualThreadId.trim() === '') {
          console.error('[useNoteSubmission] CRITICAL: actualThreadId is invalid - skipping navigation history update:', {
            actualThreadId: actualThreadId,
            type: typeof actualThreadId
          });
          // Don't add to navigation history if threadId is invalid - let noteCreated handler handle it
        } else if (result.note && addToNavigationHistory) {
          // CRITICAL: Use finalThreadId (which is overrideThreadId if provided) for all lookups
          // This ensures we use the newly created thread, not the last selected thread
          let threadData = finalThreadId 
            ? threadOptions.find(thread => thread.id === finalThreadId) || getSelectedThread()
            : getSelectedThread();
          
          // CRITICAL: If finalThreadId doesn't match threadData, force lookup by finalThreadId
          if (threadData && threadData.id !== finalThreadId) {
            console.warn('[useNoteSubmission] WARNING: threadData.id does not match finalThreadId, forcing lookup:', {
              finalThreadId: finalThreadId,
              threadDataId: threadData.id,
              threadDataTitle: threadData.title,
              overrideThreadId: overrideThreadId
            });
            // Force lookup by finalThreadId instead
            threadData = threadOptions.find(thread => thread.id === finalThreadId);
          }
          
          // CRITICAL: If threadData is undefined (e.g., newly created thread not in threadOptions yet),
          // fetch it from the API to ensure we have valid thread data for navigation history
          if (!threadData && finalThreadId && finalThreadId !== 'thread_unorganized') {
            try {
              debug('[useNoteSubmission] Fetching thread from API', { threadId: finalThreadId });
              const response = await fetch('/api/threads/list', {
                credentials: 'include'
              });
              if (response.ok) {
                const threads = await response.json();
                threadData = threads.find((t: any) => t.id === finalThreadId);
              } else {
                console.error('[useNoteSubmission] API fetch failed with status:', response.status);
              }
            } catch (error) {
              console.error('[useNoteSubmission] Error fetching thread from API:', error);
            }
          }
          
          // CRITICAL: Validate threadData exists and has a valid id before calling updateNavigationHistory
          // If threadData is undefined or missing id, create a minimal entry with just the threadId
          // The noteCreated event handler in NavigationContext will update it with full data later
          // IMPORTANT: Use finalThreadId (overrideThreadId if provided) for all checks
          if (finalThreadId === 'thread_unorganized') {
            // For unorganized, threadData might be undefined - use getSelectedThread() as fallback
            const unorganizedThreadData = threadData || getSelectedThread();
            if (unorganizedThreadData && unorganizedThreadData.id) {
              debug('[useNoteSubmission] Adding unorganized thread to navigation history', { threadId: unorganizedThreadData.id });
              updateNavigationHistory(unorganizedThreadData, true);
            } else {
              console.warn('[useNoteSubmission] Skipping navigation history update - unorganized thread data invalid');
            }
          } else if (threadData && threadData.id && threadData.id === finalThreadId) {
            // Validate that threadData has a valid id that matches finalThreadId
            debug('[useNoteSubmission] Adding thread to navigation history', {
              threadId: threadData.id,
              finalThreadId: finalThreadId
            });
            updateNavigationHistory(threadData, false);
          } else if (finalThreadId && finalThreadId !== 'thread_unorganized') {
            // CRITICAL: Validate finalThreadId is a valid string before creating minimal entry
            if (!finalThreadId || typeof finalThreadId !== 'string' || finalThreadId.trim() === '') {
              console.error('[useNoteSubmission] Cannot create minimal entry - finalThreadId is invalid:', {
                finalThreadId: finalThreadId,
                type: typeof finalThreadId
              });
              // Skip creating entry - let noteCreated handler handle it
              return;
            }
            
            // CRITICAL: If overrideThreadId was provided, we MUST use it for navigation history
            // Even if threadData is not found, we should create a minimal entry with the overrideThreadId
            // This ensures the newly created thread is added, not the last selected thread
            if (overrideThreadId && overrideThreadId !== finalThreadId) {
              console.error('[useNoteSubmission] CRITICAL: overrideThreadId mismatch!', {
                overrideThreadId: overrideThreadId,
                finalThreadId: finalThreadId,
                reason: 'This should never happen - finalThreadId should equal overrideThreadId when overrideThreadId is provided'
              });
            }
            
            // Thread data not found, but we have a valid threadId (from overrideThreadId or getSelectedThread)
            // Create a minimal entry with just the threadId to ensure navigation works
            // The noteCreated event handler will update it with full data asynchronously
            console.warn('[useNoteSubmission] Thread data not found, creating minimal entry with threadId only:', {
              finalThreadId: finalThreadId,
              overrideThreadId: overrideThreadId,
              threadDataExists: !!threadData,
              threadDataId: threadData?.id,
              getSelectedThreadId: getSelectedThread().id
            });
            
            // CRITICAL: Use finalThreadId (which should be overrideThreadId if provided)
            // This ensures we add the correct thread to navigation history
            const minimalThreadData: Thread = {
              id: finalThreadId, // Use finalThreadId (overrideThreadId if provided, otherwise getSelectedThread().id)
              title: finalThreadId, // Temporary title, will be updated by noteCreated handler
              noteCount: 1, // At least 1 (the new note)
              backgroundGradient: 'var(--color-paper)', // Default, will be updated
              color: null
            };
            
            // CRITICAL: Log the minimal entry before storing it
            debug('[useNoteSubmission] Creating minimal navigation entry', {
              minimalThreadData: minimalThreadData,
              finalThreadId: finalThreadId,
              finalThreadIdType: typeof finalThreadId,
              finalThreadIdValid: finalThreadId && typeof finalThreadId === 'string' && finalThreadId.trim() !== '',
              overrideThreadId: overrideThreadId,
              getSelectedThreadId: getSelectedThread().id
            });
            
            // Add to navigation history synchronously with minimal data
            // This ensures the thread appears in navigation immediately
            updateNavigationHistory(minimalThreadData, false);
            
            // CRITICAL: Verify the entry was stored correctly by reading from localStorage
            try {
              const stored = localStorage.getItem('harvous-navigation-history-v2');
              const history = stored ? JSON.parse(stored) : [];
              const storedEntry = history.find((item: any) => item.id === finalThreadId);
              debug('[useNoteSubmission] Verified stored entry', {
                finalThreadId: finalThreadId,
                storedEntryId: storedEntry?.id
              });
            } catch (error) {
              console.error('[useNoteSubmission] Error verifying stored entry:', error);
            }
            
            debug('[useNoteSubmission] Created minimal navigation entry', { threadId: finalThreadId });
          }
        }
        
        // PHASE 1: Write sessionStorage BEFORE dispatching event to avoid race conditions
        // This ensures sessionStorage is available when components receive the event
        if (result.note && result.note.id && actualThreadId) {
          try {
            const noteSpaceId = result.note?.spaceId || (addToSpace && currentSpace?.id ? currentSpace.id : null);
            const noteCreationInfo = {
              noteId: result.note.id,
              threadId: actualThreadId,
              spaceId: noteSpaceId,
              timestamp: Date.now()
            };
            const recentNotes = JSON.parse(sessionStorage.getItem('recentlyCreatedNotes') || '[]');
            recentNotes.push(noteCreationInfo);
            // Keep only notes from last 10 seconds
            const tenSecondsAgo = Date.now() - 10000;
            const filtered = recentNotes.filter((n: any) => n.timestamp > tenSecondsAgo);
            sessionStorage.setItem('recentlyCreatedNotes', JSON.stringify(filtered));
        debug('[useNoteSubmission] Stored note creation info in sessionStorage', {
          noteId: noteCreationInfo.noteId,
          threadId: noteCreationInfo.threadId,
          spaceId: noteCreationInfo.spaceId,
          timestamp: noteCreationInfo.timestamp
        });
            debug('[useNoteSubmission] Stored note creation info in sessionStorage (before event)', noteCreationInfo);
          } catch (error) {
            console.error('[useNoteSubmission] Failed to store note creation info:', error);
          }
        } else {
          console.warn('[useNoteSubmission] Not storing in sessionStorage', {
            hasNote: !!result.note,
            hasNoteId: !!result.note?.id,
            hasThreadId: !!actualThreadId
          });
        }
        
        // Dispatch note created event with the correct thread ID
        // Use finalThreadId (overrideThreadId if provided) as the source of truth
        const threadIdForEvent = finalThreadId;
        debug('[useNoteSubmission] Dispatching noteCreated event', { 
          threadId: threadIdForEvent,
          noteId: result.note?.id,
          hasNote: !!result.note
        });
        
        // PHASE 1: Include note info in event detail so components don't need to check sessionStorage
        // The note object from API includes: id, title, content, noteType, createdAt, updatedAt, spaceId
        // For resource notes, it may also include resourceTitle, resourceDescription, resourceImage
        // ThreadNotesList handles incomplete note data by creating a minimal placeholder if needed
        const noteCreatedEvent = new CustomEvent('noteCreated', {
          detail: { 
            note: result.note, // Complete note object from API response
            actualThreadId: threadIdForEvent, // Use the correct thread ID (overrideThreadId if provided)
            noteId: result.note?.id, // Include noteId for easy access
            threadId: threadIdForEvent, // Include threadId for easy access (duplicate for compatibility)
            spaceId: result.note?.spaceId || (addToSpace && currentSpace?.id ? currentSpace.id : null) // Include spaceId if note was created in a space
          }
        });
        
        // Dispatch event synchronously and give listeners a chance to process it
        // Use requestAnimationFrame to ensure event is processed before navigation
        window.dispatchEvent(noteCreatedEvent);
        
        // Give event listeners a chance to process the event synchronously
        // This is especially important for ThreadNotesList which needs to update before navigation
        // Use a microtask to allow React state updates to be scheduled
        await new Promise(resolve => {
          // Use requestAnimationFrame to ensure React has a chance to process the event
          requestAnimationFrame(() => {
            // Use setTimeout(0) to allow React state updates to be batched and processed
            setTimeout(() => {
              resolve(undefined);
            }, 0);
          });
        });

        // NOTE: We do NOT dispatch noteAddedToThread event here because we're about to navigate
        // to the note page. The event listener in [id].astro would refresh the thread page,
        // which would override our navigation to the note. Since we're leaving the thread page
        // anyway, the refresh isn't needed.
        // The event is only useful when staying on the thread page, which we're not doing.

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
          const plainText = localStorage.getItem('newNoteSourceSelectionPlainText');

          // Dispatch event if we have either positions (for editor mode) or plainText (for view mode)
          // The handler will use editor positions if available, or fall back to HTML text matching
          if ((from && to) || plainText) {
              debug('[useNoteSubmission] Setting up highlight save wait');
            // Create a promise that resolves when the highlight is saved
            const highlightSavedPromise = new Promise<void>((resolve) => {
              let resolved = false;
              
              const handleHighlightSaved = () => {
                if (resolved) return;
                resolved = true;
                debug('[useNoteSubmission] Highlight saved event received');
                window.removeEventListener('highlightSaved', handleHighlightSaved);
                resolve();
              };
              
              // Set up listener BEFORE dispatching event to avoid race condition
              window.addEventListener('highlightSaved', handleHighlightSaved);
              
              // Small delay to ensure listener is registered
              setTimeout(() => {
                // Dispatch the createHyperlink event
                debug('[useNoteSubmission] Dispatching createHyperlink event');
                window.dispatchEvent(new CustomEvent('createHyperlink', {
                  detail: {
                    sourceNoteId,
                    newNoteId: result.note.id,
                    from: from ? parseInt(from, 10) : undefined,
                    to: to ? parseInt(to, 10) : undefined,
                    plainText: plainText || null, // Include plainText for fallback text matching
                  }
                }));
              }, 10);
              
              // Timeout after 3 seconds to prevent hanging if highlight save fails
              setTimeout(() => {
                if (!resolved) {
                  console.warn('[useNoteSubmission] Highlight save timeout - proceeding anyway');
                  resolved = true;
                  window.removeEventListener('highlightSaved', handleHighlightSaved);
                  resolve();
                }
              }, 3000);
            });
            
            // Wait for highlight to be saved before continuing
            debug('[useNoteSubmission] Waiting for highlight to be saved');
            await highlightSavedPromise;
            debug('[useNoteSubmission] Highlight save complete');
          }
          
          localStorage.removeItem('newNoteSourceNoteId');
          localStorage.removeItem('newNoteSourceSelectionFrom');
          localStorage.removeItem('newNoteSourceSelectionTo');
          localStorage.removeItem('newNoteSourceSelectionPlainText');
        }

        // Always navigate to the note (not the thread) after creation
        // This matches the behavior when creating a note from the dashboard
        debug('[useNoteSubmission] Note creation complete', {
          noteId: result.note?.id,
          overrideThreadId: overrideThreadId
        });
        
        // CRITICAL CHECK: Ensure we have a valid note ID
        if (!result.note) {
          console.error('[useNoteSubmission] ERROR: result.note is missing!');
          console.error('[useNoteSubmission] Full result:', result);
        }
        if (!result.note?.id) {
          console.error('[useNoteSubmission] ERROR: result.note.id is missing!');
          console.error('[useNoteSubmission] result.note:', result.note);
        }
        
        if (result.note && result.note.id) {
          // ALWAYS navigate to the note, never to the thread
          let redirectUrl = `/${result.note.id}`;
          // Add toast message if applicable
          if (scriptureToastMessage) {
            redirectUrl += `?toast=info&message=${encodeURIComponent(scriptureToastMessage)}`;
          } else if (overrideThreadId && overrideThreadId !== 'thread_unorganized') {
            // If note was added to a thread, show a success message
            const threadData = threadOptions.find(thread => thread.id === overrideThreadId);
            if (threadData) {
              const toastMessage = `Note added to ${threadData.title}`;
              redirectUrl += `?toast=success&message=${encodeURIComponent(toastMessage)}`;
            }
          }
          
          debug('[useNoteSubmission] Navigation', { redirectUrl });
          
          // OPTIMIZATION: Prefetch the destination page before navigating
          // This improves perceived performance, especially on slow connections
          // Keep "Creating..." state visible during prefetch
          const origin = getSafeOrigin();
          const absoluteUrl = origin ? `${origin}${redirectUrl}` : redirectUrl;
          debug('[useNoteSubmission] Prefetching destination', { absoluteUrl });
          
          try {
            // Prefetch the page with a timeout (max 500ms wait)
            // This warms up the connection and starts loading resources
            const prefetchPromise = fetch(absoluteUrl, {
              method: 'HEAD',
              credentials: 'include',
              cache: 'no-cache'
            });
            
            // Wait for prefetch with timeout
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Prefetch timeout')), 500)
            );
            
            // Race between prefetch and timeout
            await Promise.race([prefetchPromise, timeoutPromise]).catch(() => {
              // Timeout is acceptable - we'll navigate anyway
              debug('[useNoteSubmission] Prefetch timeout or error - proceeding with navigation');
            });
          } catch (prefetchError) {
            // Prefetch failed - that's okay, we'll navigate anyway
            debug('[useNoteSubmission] Prefetch failed - proceeding with navigation', prefetchError);
          }
          
          // CRITICAL: Remove panel state from localStorage entirely (not just set to 'false')
          // This prevents DesktopPanelManager from reopening the panel on the new page
          // Do this AFTER prefetch but BEFORE navigation
          localStorage.removeItem('showNewNotePanel');
          localStorage.removeItem('showNewThreadPanel');
          localStorage.removeItem('showNewResourcePanel');
          // Verify removal (for debugging)
          if (localStorage.getItem('showNewNotePanel') === 'true') {
            console.warn('[useNoteSubmission] WARNING: showNewNotePanel still true after removal!');
          }
          
          // Reset form and clear localStorage
          resetForm();
          setSelectedThread('Unorganized');
          // Keep isSubmitting true until navigation starts (maintains "Creating..." state)
          clearLocalStorage();
          
          // Close panel
          if (onClose) {
            onClose();
          }
          // Dispatch close event to ensure panel manager closes it
          window.dispatchEvent(new CustomEvent('closeNewNotePanel'));
          
          debug('[useNoteSubmission] Navigating', { absoluteUrl });
          
          // Give event listeners a small additional window to process the event
          // This is especially important for ThreadNotesList which needs to update optimistically
          // before the component unmounts due to navigation
          await new Promise(resolve => setTimeout(resolve, 50));
          
          // Use replace for immediate navigation (no back button)
          // isSubmitting will remain true until navigation completes (panel closes on navigation)
          // Note: Event listeners should have processed by now, but fallback refresh mechanism
          // handles cases where event wasn't processed before navigation.
          // After this point, no code should execute as navigation will replace the page
          window.location.replace(absoluteUrl);
          
          // Note: Code after window.location.replace() typically doesn't execute as the page is replaced.
          // If this code does execute, it means navigation was prevented or failed, but we don't need to log an error
          // as this can happen in normal operation (e.g., if navigation is intercepted by a service worker).
        } else {
          // If no note was created, still close the panel
          localStorage.removeItem('showNewNotePanel');
          resetForm();
          setSelectedThread('Unorganized');
          setIsSubmitting(false);
          clearLocalStorage();
          
          if (onClose) {
            onClose();
          } else {
            window.dispatchEvent(new CustomEvent('closeNewNotePanel'));
          }
        }
      } else {
        const error = await response.json();
        
        // Handle note limit exceeded error
        if (error.code === 'NOTE_LIMIT_EXCEEDED') {
          // Save pending note data to sessionStorage
          // This allows us to auto-create the note after successful upgrade
          try {
            const pendingNoteData = {
              title: title.trim(),
              content: editorContent.trim(),
              threadId: overrideThreadId || getSelectedThread().id,
              noteType: currentNoteType,
              scriptureReference: currentScriptureReference.trim(),
              scriptureVersion: currentScriptureVersion,
              resourceUrl: normalizedResourceUrl || resourceUrl.trim(),
              resourceMetadata: resourceMetadata ? JSON.stringify(resourceMetadata) : null,
              spaceId: (addToSpace && currentSpace?.id) ? currentSpace.id : null,
              timestamp: Date.now()
            };
            
            sessionStorage.setItem('pendingNote', JSON.stringify(pendingNoteData));
            debug('[useNoteSubmission] Saved pending note data to sessionStorage', pendingNoteData);
          } catch (saveError) {
            console.error('[useNoteSubmission] Failed to save pending note data:', saveError);
          }
          
          // Limit reached UI is shown in footer, so just stop submission
          // No toast notification needed - the footer already shows the limit reached state
        } else {
          // Check if this is a network error
          if (isNetworkError(error) && offlineNoteId) {
            // Network error but offline save succeeded - treat as success
            showToast('Note saved offline. It will sync when you\'re back online.', 'success');
            
            // Dispatch noteCreated event
            const threadIdToUse = overrideThreadId || getSelectedThread().id;
            const offlineNoteEvent = new CustomEvent('noteCreated', {
              detail: {
                note: {
                  id: offlineNoteId,
                  title: currentNoteType === 'default' ? title : (currentNoteType === 'scripture' ? currentScriptureReference : normalizedResourceUrl),
                  content: currentContent,
                  noteType: currentNoteType,
                  threadId: threadIdToUse,
                  spaceId: addToSpace && currentSpace?.id ? currentSpace.id : null,
                },
                actualThreadId: threadIdToUse,
                noteId: offlineNoteId,
                threadId: threadIdToUse,
                spaceId: addToSpace && currentSpace?.id ? currentSpace.id : null,
                isOffline: true
              }
            });
            window.dispatchEvent(offlineNoteEvent);
            
            resetForm();
            setSelectedThread('Unorganized');
            clearLocalStorage();
            localStorage.removeItem('showNewNotePanel');
            if (onClose) onClose();
            window.dispatchEvent(new CustomEvent('closeNewNotePanel'));
            
            // Stay on current page when offline - note will appear in list from IndexedDB
            const currentUrl = safeURL(window.location.href);
            if (currentUrl) {
              currentUrl.searchParams.set('toast', 'success');
              currentUrl.searchParams.set('message', encodeURIComponent('Note saved offline. It will sync when you\'re back online.'));
              window.history.replaceState({}, '', currentUrl.toString());
            }
          } else {
            showToast(error.error || 'Error creating note', 'error');
          }
        }
        
        setIsSubmitting(false);
      }
    } catch (error: any) {
      // Check if this is a network error and we have an offline note
      if (isNetworkError(error) && offlineNoteId) {
        // Network error but offline save succeeded - treat as success
        showToast('Note saved offline. It will sync when you\'re back online.', 'success');
        
        const threadIdToUse = overrideThreadId || getSelectedThread().id;
        const offlineNoteEvent = new CustomEvent('noteCreated', {
          detail: {
            note: {
              id: offlineNoteId,
              title: currentNoteType === 'default' ? title : (currentNoteType === 'scripture' ? currentScriptureReference : normalizedResourceUrl),
              content: currentContent,
              noteType: currentNoteType,
              threadId: threadIdToUse,
              spaceId: addToSpace && currentSpace?.id ? currentSpace.id : null,
            },
            actualThreadId: threadIdToUse,
            noteId: offlineNoteId,
            threadId: threadIdToUse,
            spaceId: addToSpace && currentSpace?.id ? currentSpace.id : null,
            isOffline: true
          }
        });
        window.dispatchEvent(offlineNoteEvent);
        
        resetForm();
        setSelectedThread('Unorganized');
        clearLocalStorage();
        localStorage.removeItem('showNewNotePanel');
        if (onClose) onClose();
        window.dispatchEvent(new CustomEvent('closeNewNotePanel'));
        
        // Stay on current page when offline - note will appear in list from IndexedDB
        const currentUrl = safeURL(window.location.href);
        if (currentUrl) {
          currentUrl.searchParams.set('toast', 'success');
          currentUrl.searchParams.set('message', encodeURIComponent('Note saved offline. It will sync when you\'re back online.'));
          window.history.replaceState({}, '', currentUrl.toString());
        }
      } else {
        // Real error - log and show error toast
        if (typeof window !== 'undefined' && window.posthog) {
          captureException(error, {
            context: 'note_creation',
            endpoint: '/api/notes/create',
          });
        }
        
        showToast(`Error creating note: ${error?.message || 'Please try again.'}`, 'error');
      }
      
      setIsSubmitting(false);
    }
  }, [
    isSubmitting, content, title, scriptureReference, resourceUrl, noteType,
    scriptureVersion, addToSpace, currentSpace, getSelectedThread, threadOptions,
    addToNavigationHistory, sourceNoteId, resetForm, setSelectedThread, clearLocalStorage,
    loadNextNoteId, onClose, onSuccess, showToast, updateNavigationHistory,
    setNoteType, setScriptureReference, setScriptureVersion, setContent
  ]);

  // Handle save and close from dialog
  const handleSaveAndClose = useCallback(async () => {
    // Prevent duplicate submissions if already submitting
    if (isSubmitting) {
      return;
    }

    // Validate resource URL if needed
    if (noteType === 'resource' && resourceUrl) {
      const urlValidation = validateResourceUrl(resourceUrl);
      if (!urlValidation.isValid) {
        const errorMessage = urlValidation.error || 'Please enter a valid URL';
        showToast(errorMessage, 'warning');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      
      if (noteType === 'default') {
        formData.set('title', title);
      } else if (noteType === 'scripture') {
        formData.set('title', scriptureReference);
      } else if (noteType === 'resource') {
        // Use validated normalized URL
        const validatedUrl = resourceUrl ? validateResourceUrl(resourceUrl).normalizedUrl || resourceUrl : resourceUrl;
        formData.set('title', validatedUrl);
      }
      
      formData.set('content', content);
      formData.set('threadId', getSelectedThread().id);
      formData.set('noteType', noteType);
      
      if (noteType === 'scripture') {
        const apiReference = formatReferenceForAPI(scriptureReference);
        formData.set('scriptureReference', apiReference);
        formData.set('scriptureVersion', scriptureVersion);
      } else if (noteType === 'resource') {
        // Use validated normalized URL
        const validatedUrl = resourceUrl ? validateResourceUrl(resourceUrl).normalizedUrl || resourceUrl : resourceUrl;
        formData.set('resourceUrl', validatedUrl);
        // Pass pre-fetched metadata to avoid re-fetching on the server
        if (resourceMetadata) {
          formData.set('resourceMetadata', JSON.stringify(resourceMetadata));
        }
      }

      const response = await fetch('/api/notes/create', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (response.ok) {
        const result = await response.json();
        
        // Cache the simpleNoteId for offline access
        // This ensures the next note ID is correct when going offline
        if (result.note && result.note.simpleNoteId && userId) {
          cacheHighestSimpleNoteId(userId, result.note.simpleNoteId);
          debug('[useNoteSubmission] Cached simpleNoteId (save and close)', { simpleNoteId: result.note.simpleNoteId });
        }

        // Build scripture toast message for redirect (only for 'created' actions)
        let scriptureToastMessage = '';
        if (result.scriptureResults && result.scriptureResults.length > 0) {
          const createdScriptures = result.scriptureResults.filter(
            (r: any) => r.action === 'created'
          );
          
          if (createdScriptures.length === 1) {
            scriptureToastMessage = `Created scripture note: ${createdScriptures[0].reference}`;
          } else if (createdScriptures.length > 1) {
            scriptureToastMessage = `Created ${createdScriptures.length} scripture notes`;
          }
        }

        if (result.note && result.note.id) {
          let redirectUrl = `/${result.note.id}`;
          if (scriptureToastMessage) {
            redirectUrl += `?toast=info&message=${encodeURIComponent(scriptureToastMessage)}`;
          }
          
          // OPTIMIZATION: Prefetch the destination page before navigating
          // This improves perceived performance, especially on slow connections
          const origin = getSafeOrigin();
          const absoluteUrl = origin ? `${origin}${redirectUrl}` : redirectUrl;
          debug('[useNoteSubmission] Prefetching destination (save and close)', { absoluteUrl });
          
          try {
            // Prefetch the page with a timeout (max 500ms wait)
            const prefetchPromise = fetch(absoluteUrl, {
              method: 'HEAD',
              credentials: 'include',
              cache: 'no-cache'
            });
            
            // Wait for prefetch with timeout
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Prefetch timeout')), 500)
            );
            
            // Race between prefetch and timeout
            await Promise.race([prefetchPromise, timeoutPromise]).catch(() => {
              // Timeout is acceptable - we'll navigate anyway
              debug('[useNoteSubmission] Prefetch timeout or error (save and close) - proceeding with navigation');
            });
          } catch (prefetchError) {
            // Prefetch failed - that's okay, we'll navigate anyway
            debug('[useNoteSubmission] Prefetch failed (save and close) - proceeding with navigation', prefetchError);
          }
          
          // CRITICAL: Remove panel state from localStorage entirely (not just set to 'false')
          // This prevents DesktopPanelManager from reopening the panel on the new page
          localStorage.removeItem('showNewNotePanel');
          localStorage.removeItem('showNewThreadPanel');
          localStorage.removeItem('showNewResourcePanel');
          
          // Use window.location.replace() for guaranteed navigation with full page reload
          try {
            window.location.replace(redirectUrl);
          } catch (error) {
            // If replace fails, try href as fallback
            console.error('[useNoteSubmission] Navigation failed:', error);
            window.location.href = redirectUrl;
          }
        }
      } else {
        const error = await response.json();
        
        // Handle note limit exceeded error
        if (error.code === 'NOTE_LIMIT_EXCEEDED') {
          // Save pending note data to sessionStorage
          // This allows us to auto-create the note after successful upgrade
          try {
            const validatedUrl = resourceUrl ? validateResourceUrl(resourceUrl).normalizedUrl || resourceUrl : resourceUrl;
            const pendingNoteData = {
              title: title.trim(),
              content: content.trim(),
              threadId: getSelectedThread().id,
              noteType: noteType,
              scriptureReference: scriptureReference.trim(),
              scriptureVersion: scriptureVersion,
              resourceUrl: validatedUrl || resourceUrl.trim(),
              resourceMetadata: resourceMetadata ? JSON.stringify(resourceMetadata) : null,
              spaceId: (addToSpace && currentSpace?.id) ? currentSpace.id : null,
              timestamp: Date.now()
            };
            
            sessionStorage.setItem('pendingNote', JSON.stringify(pendingNoteData));
            debug('[useNoteSubmission] Saved pending note data to sessionStorage (save and close)', pendingNoteData);
          } catch (saveError) {
            console.error('[useNoteSubmission] Failed to save pending note data:', saveError);
          }
          
          // Limit reached UI is shown in footer, so just stop submission
          // No toast notification needed - the footer already shows the limit reached state
        } else {
          showToast(error.error || 'Error creating note', 'error');
        }
      }
    } catch (error: any) {
      // Error saving note - show error toast
      showToast(`Error creating note: ${error?.message || 'Please try again.'}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, noteType, title, scriptureReference, resourceUrl, content, getSelectedThread, scriptureVersion, resourceMetadata, showToast, addToSpace, currentSpace]);

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


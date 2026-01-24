import { useState, useCallback } from 'react';
import { formatReferenceForAPI } from '@/utils/scripture-detector';
import { captureException } from '@/utils/posthog';
import { normalizeUrl, validateResourceUrl } from '@/utils/validation';
import { debug } from '@/utils/logger';
import { buildAPIUrl, getSafeOrigin, safeURL } from '@/utils/safe-url';
import { createNoteOfflineWithRetry, cacheHighestSimpleNoteId, getOfflineErrorMessage, type OfflineOperationResult } from '@/utils/offline-mutations';
import { usePersistedUserId, getPersistedUserId, getPersistedUserIdWithIndexedDB } from '@/utils/user-id';
import { isNetworkError } from '@/utils/network';
import { authenticatedFetch } from '@/utils/fetch-helpers';
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

  // Helper to get effective userId with multiple fallback mechanisms (async version with IndexedDB)
  const getEffectiveUserId = useCallback(async (): Promise<{ userId: string | null; indexedDBIsEmpty: boolean }> => {
    // Try hook value first (most reliable when available)
    if (userId) return { userId, indexedDBIsEmpty: false };
    
    // Try persisted value from localStorage/window (synchronous check first)
    const persisted = getPersistedUserId();
    if (persisted) return { userId: persisted, indexedDBIsEmpty: false };
    
    // Try window directly (defensive check for timing issues)
    if (typeof window !== 'undefined' && (window as any).__harvous_userId) {
      return { userId: (window as any).__harvous_userId, indexedDBIsEmpty: false };
    }
    
    // Last resort: try IndexedDB (async) - this includes all fallback mechanisms
    // This will check userMetadata, notes, spaces, threads in IndexedDB
    const indexedDBResult = await getPersistedUserIdWithIndexedDB();
    if (indexedDBResult.userId) {
      return indexedDBResult;
    }
    
    // Final fallback: try to get from Clerk if available (offline-safe check)
    // Clerk might have session data cached even when offline
    try {
      if (typeof window !== 'undefined') {
        // Check if Clerk is available and has user data
        const clerkWindow = window as any;
        if (clerkWindow.__clerk_frontend_api) {
          // Try to access Clerk's user data if available
          // Note: This is a last resort - Clerk typically requires online connection
          // But session data might be cached in localStorage or sessionStorage
          // We can't directly access Clerk hooks here, but we can check for cached data
          const clerkSessionKey = '__clerk_db_jwt';
          const cookies = document.cookie.split(';');
          for (const cookie of cookies) {
            const [name] = cookie.trim().split('=');
            if (name === clerkSessionKey) {
              // Clerk session exists - but we can't extract userId from cookie directly
              // This is just a signal that user might be authenticated
              // We'll rely on the other mechanisms above
              break;
            }
          }
        }
      }
    } catch (e) {
      // Clerk not available or error accessing - that's fine, continue with other checks
      debug('[getEffectiveUserId] Clerk check failed (expected when offline):', e);
    }
    
    // Return the IndexedDB result which includes isEmpty information
    return indexedDBResult;
  }, [userId]);

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

  // Handle form submission
  const handleSubmit = useCallback(async (e: React.FormEvent, overrideThreadId?: string) => {
    e.preventDefault();
    
    if (isSubmitting) return;

    // Note: Subscription check removed - backend validates and returns NOTE_LIMIT_EXCEEDED if exceeded

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
        const detectionResponse = await authenticatedFetch('/api/scripture/detect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: trimmedTitle }),
        });

        if (detectionResponse.ok) {
          const detection = await detectionResponse.json();
          
          if (detection.isScripture && detection.confidence >= 0.7 && detection.primaryReference) {
            // Fetch verse text
            try {
              const verseResponse = await authenticatedFetch('/api/scripture/fetch-verse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reference: detection.primaryReference }),
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
            } catch (verseError) {
              // Log but proceed with default note type - this is a graceful fallback
              console.warn('[useNoteSubmission] Verse fetch failed, proceeding without scripture type:', verseError);
            }
          }
        }
      } catch (detectionError) {
        // Log but proceed with default note type - this is a graceful fallback
        console.warn('[useNoteSubmission] Scripture detection failed, proceeding with default type:', detectionError);
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

      // OFFLINE-AWARE: Only create in IndexedDB if we're offline
      // When online, server is the single source of truth to avoid duplication
      let offlineNoteId: string | null = null;
      let offlineSaveError: string | null = null;
      const isOffline = !navigator.onLine;

      // Only attempt offline save if we're actually offline
      if (isOffline) {
        // Get userId with enhanced fallback mechanisms (includes IndexedDB check)
        console.log('[useNoteSubmission] Offline mode - attempting local save...');
        let effectiveUserIdResult: { userId: string | null; indexedDBIsEmpty: boolean } = { userId: null, indexedDBIsEmpty: true };
        try {
          effectiveUserIdResult = await getEffectiveUserId();
        } catch (error: any) {
          console.error('[useNoteSubmission] Error in getEffectiveUserId:', {
            error: error?.message || error,
            name: error?.name,
            stack: error?.stack
          });
          // Continue with null - will show error below
        }

        const effectiveUserId = effectiveUserIdResult.userId;

        // Enhanced debug logging to help diagnose userId issues
        const persistedUserIdValue = getPersistedUserId();
        const windowUserId = typeof window !== 'undefined' ? (window as any).__harvous_userId : undefined;
        const localStorageUserId = typeof window !== 'undefined' ? localStorage.getItem('harvous-user-id') : null;

        console.log('[useNoteSubmission] userId check result:', {
          hookUserId: userId,
          persistedUserId: persistedUserIdValue,
          windowUserId: windowUserId,
          localStorageUserId: localStorageUserId,
          effectiveUserId: effectiveUserId,
          indexedDBIsEmpty: effectiveUserIdResult.indexedDBIsEmpty,
          isOffline: true,
          allSources: {
            hook: userId,
            persisted: persistedUserIdValue,
            window: windowUserId,
            localStorage: localStorageUserId,
            indexedDB: effectiveUserId ? 'found' : (effectiveUserIdResult.indexedDBIsEmpty ? 'empty' : 'has data but no userId')
          }
        });

        if (effectiveUserId) {
          const threadIdToUse = overrideThreadId || getSelectedThread().id;
          const offlineResult = await createNoteOfflineWithRetry(effectiveUserId, {
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

          if (offlineResult.success && offlineResult.noteId) {
            offlineNoteId = offlineResult.noteId;
            debug('[useNoteSubmission] Note created locally in IndexedDB (offline)', { offlineNoteId });
          } else {
            offlineSaveError = offlineResult.error || 'Failed to save offline';
            console.error('[useNoteSubmission] Failed to create note offline:', {
              error: offlineSaveError,
              errorType: offlineResult.errorType
            });
          }
        } else {
          // No userId available anywhere - this is a real issue
          // Enhanced error logging with all diagnostic information
          const diagnosticInfo = {
            hookUserId: userId,
            persistedUserId: persistedUserIdValue,
            windowUserId: windowUserId,
            localStorageUserId: localStorageUserId,
            indexedDBIsEmpty: effectiveUserIdResult.indexedDBIsEmpty,
            isOffline: true,
            hasClerkSession: typeof window !== 'undefined' && document.cookie.includes('__clerk'),
            timestamp: new Date().toISOString()
          };

          console.error('[useNoteSubmission] No userId available from any source', diagnosticInfo);
          debug('[useNoteSubmission] No userId available - diagnostic info:', diagnosticInfo);

          // Capture exception for monitoring
          captureException(new Error('No userId available for offline note creation'), {
            extra: diagnosticInfo
          });

          // Set a more actionable error message based on IndexedDB state
          if (effectiveUserIdResult.indexedDBIsEmpty) {
            offlineSaveError = 'You need to sign in while online first to set up offline access. After signing in online, you\'ll be able to create notes offline.';
          } else {
            offlineSaveError = 'Unable to access your offline data. Please sign in while online first, then you can create notes offline.';
          }
        }
      }
      // End of offline-only save block - when online, we skip straight to server API

      // Try to push to server (will queue if offline)
      let response: Response | null = null;
      let networkError = false;
      
      try {
        response = await authenticatedFetch('/api/notes/create', {
          method: 'POST',
          body: formData,
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
        } else if (networkError && offlineSaveError) {
          // Network error AND offline save failed - show offline error message
          debug('[useNoteSubmission] Network error and offline save failed', { offlineSaveError });
          showToast(offlineSaveError, 'error');
          setIsSubmitting(false);
          return;
        } else if (networkError) {
          // Network error but no offline context - show friendly offline message
          debug('[useNoteSubmission] Network error with no offline context');
          showToast('You\'re offline. Please try again when connected.', 'error');
          setIsSubmitting(false);
          return;
        } else {
          // Non-network error - rethrow
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
        
        // CRITICAL: Define finalThreadId to use consistently throughout this function
        // Note: We trust the API response - if note creation succeeded, the note exists
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
              const response = await authenticatedFetch('/api/threads/list');
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
          
          // CRITICAL: Navigation history updates are now handled by NavigationContext.handleNoteCreated
          // The noteCreated event will be dispatched below, and NavigationContext will handle adding
          // the thread to navigation history. This prevents duplication and race conditions.
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
        
        // Dispatch event for listeners (navigation will happen immediately after)
        window.dispatchEvent(noteCreatedEvent);

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

          const origin = getSafeOrigin();
          const absoluteUrl = origin ? `${origin}${redirectUrl}` : redirectUrl;

          // Fire-and-forget prefetch (don't wait for it)
          authenticatedFetch(absoluteUrl, { method: 'HEAD', cache: 'no-cache' }).catch(() => {});

          // CRITICAL: Remove panel state from localStorage entirely (not just set to 'false')
          // This prevents DesktopPanelManager from reopening the panel on the new page
          localStorage.removeItem('showNewNotePanel');
          localStorage.removeItem('showNewThreadPanel');
          localStorage.removeItem('showNewResourcePanel');

          // Reset form and clear localStorage
          resetForm();
          setSelectedThread('Unorganized');
          clearLocalStorage();

          // Close panel
          if (onClose) {
            onClose();
          }
          window.dispatchEvent(new CustomEvent('closeNewNotePanel'));

          debug('[useNoteSubmission] Navigating', { absoluteUrl });

          // Use replace for immediate navigation (no back button)
          // isSubmitting will remain true until navigation completes (panel closes on navigation)
          // Note: Event listeners should have processed by now, but fallback refresh mechanism
          // handles cases where event wasn't processed before navigation.
          // After this point, no code should execute as navigation will replace the page
          window.location.replace(absoluteUrl);

          // Safety timeout: If navigation doesn't complete within 3 seconds (e.g., blocked by service worker),
          // reset isSubmitting to prevent the UI from being stuck forever
          setTimeout(() => {
            setIsSubmitting(false);
          }, 3000);
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
          } else if (isNetworkError(error) && offlineSaveError) {
            // Network error AND offline save failed - show the specific offline error
            showToast(offlineSaveError, 'error');
          } else if (isNetworkError(error)) {
            // Network error with no offline context - show friendly offline message
            showToast('You\'re offline. Please try again when connected.', 'error');
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
      } else if (isNetworkError(error) && offlineSaveError) {
        // Network error AND offline save failed - show the specific offline error
        showToast(offlineSaveError, 'error');
      } else if (isNetworkError(error)) {
        // Network error with no offline context - show friendly offline message
        showToast('You\'re offline. Please try again when connected.', 'error');
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
    loadNextNoteId, onClose, onSuccess, showToast,
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

      const response = await authenticatedFetch('/api/notes/create', {
        method: 'POST',
        body: formData,
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
            const prefetchPromise = authenticatedFetch(absoluteUrl, {
              method: 'HEAD',
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


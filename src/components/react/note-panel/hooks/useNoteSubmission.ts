import { useState, useCallback, useRef } from 'react';
import { idToUrl } from '@/utils/url-helpers';
import { safeNavigate } from '@/utils/safe-navigate';
import { formatReferenceForAPI } from '@/utils/scripture-detector';
import { captureException } from '@/utils/posthog';
import { normalizeUrl, validateResourceUrl } from '@/utils/validation';
import { debug } from '@/utils/logger';
import { createNoteOfflineWithRetry, cacheHighestSimpleNoteId } from '@/utils/offline-mutations';
import { invalidatePanelDataCache, PANEL_CACHE_KEYS } from '@/utils/panel-data-cache';
import { usePersistedUserId, getPersistedUserId } from '@/utils/user-id';
import { isNetworkError } from '@/utils/network';
import { wrapTextWithNoteLink } from '@/utils/tiptap-helpers';
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

  // Ref-based mutex to prevent duplicate submissions (more reliable than state-based checks)
  // State checks can have race conditions on double-click; refs are synchronous
  const submitMutexRef = useRef(false);

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

    // Use ref-based mutex to prevent duplicate submissions on rapid double-click
    // State-based check (isSubmitting) can have race conditions
    if (submitMutexRef.current) {
      debug('[useNoteSubmission] Submission blocked by mutex (double-click prevention)');
      return;
    }
    submitMutexRef.current = true;

    if (isSubmitting) {
      submitMutexRef.current = false;
      return;
    }

    // Note: Subscription check removed - backend validates and returns NOTE_LIMIT_EXCEEDED if exceeded

    // Get content - prioritize React state
    let editorContent = content;

    // Fallback to DOM only within the new-note editor (never use document.querySelector('.ProseMirror') globally -
    // that can return the source note's editor when creating from selection with empty content)
    if (!editorContent || editorContent.trim() === '' || editorContent === '<p></p>' || editorContent === '<p><br></p>') {
      const newNoteInput = document.getElementById('new-note-content') as HTMLInputElement | null;
      if (newNoteInput) {
        const container = newNoteInput.closest('.tiptap-editor-container');
        if (container) {
          const proseMirror = container.querySelector('.ProseMirror');
          if (proseMirror && (proseMirror as HTMLElement).innerHTML.trim()) {
            editorContent = (proseMirror as HTMLElement).innerHTML;
          }
        }
        if (!editorContent?.trim() && newNoteInput.value?.trim() && newNoteInput.value !== '<p></p>') {
          editorContent = newNoteInput.value;
        }
      }
      if (!editorContent || editorContent.trim() === '') {
        editorContent = content ?? '';
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
    // Skip when offline — scripture detection will happen server-side during sync
    let currentNoteType = noteType;
    let currentScriptureReference = scriptureReference;
    let currentScriptureVersion = scriptureVersion;
    let currentContent = editorContent;

    const isOffline = !navigator.onLine;

    if (!isOffline && currentNoteType === 'default' && trimmedTitle.length >= 5) {
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
        submitMutexRef.current = false;
        return;
      }
    } else if (currentNoteType === 'scripture') {
      const apiReference = formatReferenceForAPI(currentScriptureReference.trim());
      if (!apiReference.trim()) {
        showToast('Please add a scripture reference (e.g., John 3:16)', 'warning');
        submitMutexRef.current = false;
        return;
      }
      if (!hasContent) {
        showToast('Please add your thoughts about this scripture', 'warning');
        submitMutexRef.current = false;
        return;
      }
    } else if (currentNoteType === 'resource') {
      if (!trimmedResourceUrl) {
        showToast('Please add a resource URL', 'warning');
        submitMutexRef.current = false;
        return;
      }
      // Validate URL with comprehensive security checks
      const urlValidation = validateResourceUrl(trimmedResourceUrl);
      if (!urlValidation.isValid) {
        // Show user-friendly error message
        const errorMessage = urlValidation.error || 'Please enter a valid URL';
        showToast(errorMessage, 'warning');
        submitMutexRef.current = false;
        return;
      }
      // Use normalized URL from validation
      normalizedResourceUrl = urlValidation.normalizedUrl!;
    }

    setIsSubmitting(true);

    // Declare offline variables before try so they're accessible in the catch block

    try {
      // Allow threadId override (useful when state hasn't updated yet)
      const threadIdToUse = overrideThreadId || getSelectedThread().id;
      if (overrideThreadId) {
        debug('[useNoteSubmission] Using overrideThreadId', { overrideThreadId });
      }
      debug('[useNoteSubmission] Thread ID selection', { threadIdToUse });

      const noteTitle =
        currentNoteType === 'default'
          ? title
          : currentNoteType === 'scripture'
            ? currentScriptureReference
            : normalizedResourceUrl;
      const payload: Record<string, unknown> = {
        content: currentContent,
        title: noteTitle,
        threadId: threadIdToUse,
        noteType: currentNoteType,
        contentEncrypted: false,
      };
      if (addToSpace && currentSpace?.id) payload.spaceId = currentSpace.id;
      // Always send scriptureVersion so server can tag pills with translation for any note type
      payload.scriptureVersion = currentScriptureVersion;
      if (currentNoteType === 'scripture') {
        payload.scriptureReference = formatReferenceForAPI(currentScriptureReference);
      } else if (currentNoteType === 'resource') {
        payload.resourceUrl = normalizedResourceUrl;
        if (resourceMetadata) payload.resourceMetadata = resourceMetadata;
      }

      // OFFLINE-AWARE: Mutually exclusive paths — offline saves to IndexedDB only,
      // online goes to server only. No dual-path to avoid duplicates.
      if (isOffline) {
        // Get userId from hook or localStorage
        const effectiveUserId = userId || getPersistedUserId();

        if (!effectiveUserId) {
          showToast('Sign in while online first to enable offline mode.', 'error');
          submitMutexRef.current = false;
          setIsSubmitting(false);
          return;
        }

        const threadIdToUse = overrideThreadId || getSelectedThread().id;
        const offlineResult = await createNoteOfflineWithRetry(effectiveUserId, {
          title: currentNoteType === 'default' ? title : (currentNoteType === 'scripture' ? currentScriptureReference : normalizedResourceUrl),
          content: currentContent,
          threadId: threadIdToUse,
          spaceId: addToSpace && currentSpace?.id ? currentSpace.id : undefined,
          noteType: currentNoteType === 'scripture' ? 'default' : currentNoteType, // Save as default offline; server detects scripture on sync
          scriptureReference: currentNoteType === 'scripture' ? formatReferenceForAPI(currentScriptureReference) : undefined,
          scriptureVersion: currentNoteType === 'scripture' ? currentScriptureVersion : undefined,
          resourceUrl: currentNoteType === 'resource' ? normalizedResourceUrl : undefined,
          resourceMetadata: currentNoteType === 'resource' ? resourceMetadata : undefined,
        });

        if (offlineResult.success && offlineResult.noteId) {
          debug('[useNoteSubmission] Note created locally in IndexedDB (offline)', { offlineNoteId: offlineResult.noteId });

          showToast('Note saved offline. It will sync when you\'re back online.', 'success');

          // Dispatch noteCreated event with offline note data
          window.dispatchEvent(new CustomEvent('noteCreated', {
            detail: {
              note: {
                id: offlineResult.noteId,
                title: currentNoteType === 'default' ? title : (currentNoteType === 'scripture' ? currentScriptureReference : normalizedResourceUrl),
                content: currentContent,
                noteType: currentNoteType,
                threadId: threadIdToUse,
                spaceId: addToSpace && currentSpace?.id ? currentSpace.id : null,
              },
              actualThreadId: threadIdToUse,
              noteId: offlineResult.noteId,
              threadId: threadIdToUse,
              spaceId: addToSpace && currentSpace?.id ? currentSpace.id : null,
              isOffline: true
            }
          }));

          // Reset form and close panel
          submitMutexRef.current = false;
          setIsSubmitting(false);
          resetForm();
          setSelectedThread('Unorganized');
          clearLocalStorage();
          localStorage.removeItem('showNewNotePanel');
          localStorage.removeItem('showNewThreadPanel');
          localStorage.removeItem('showNewResourcePanel');

          if (onClose) {
            onClose();
          }
          window.dispatchEvent(new CustomEvent('closeNewNotePanel'));
          return;
        } else {
          // Offline save failed
          showToast(offlineResult.error || 'Failed to save note offline.', 'error');
          submitMutexRef.current = false;
          setIsSubmitting(false);
          return;
        }
      }

      // ONLINE PATH: Server is the single source of truth
      let response: Response | null = null;

      try {
        response = await fetch('/api/notes/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          credentials: 'include'
        });
      } catch (error) {
        // Network error — try offline fallback
        if (isNetworkError(error)) {
          const effectiveUserId = userId || getPersistedUserId();
          if (effectiveUserId) {
            const threadIdToUse = overrideThreadId || getSelectedThread().id;
            const offlineResult = await createNoteOfflineWithRetry(effectiveUserId, {
              title: currentNoteType === 'default' ? title : (currentNoteType === 'scripture' ? currentScriptureReference : normalizedResourceUrl),
              content: currentContent,
              threadId: threadIdToUse,
              spaceId: addToSpace && currentSpace?.id ? currentSpace.id : undefined,
              noteType: currentNoteType === 'scripture' ? 'default' : currentNoteType,
              scriptureReference: currentNoteType === 'scripture' ? formatReferenceForAPI(currentScriptureReference) : undefined,
              scriptureVersion: currentNoteType === 'scripture' ? currentScriptureVersion : undefined,
              resourceUrl: currentNoteType === 'resource' ? normalizedResourceUrl : undefined,
              resourceMetadata: currentNoteType === 'resource' ? resourceMetadata : undefined,
            });

            if (offlineResult.success && offlineResult.noteId) {
              showToast('Note saved offline. It will sync when you\'re back online.', 'success');

              window.dispatchEvent(new CustomEvent('noteCreated', {
                detail: {
                  note: {
                    id: offlineResult.noteId,
                    title: currentNoteType === 'default' ? title : (currentNoteType === 'scripture' ? currentScriptureReference : normalizedResourceUrl),
                    content: currentContent,
                    noteType: currentNoteType,
                    threadId: threadIdToUse,
                    spaceId: addToSpace && currentSpace?.id ? currentSpace.id : null,
                  },
                  actualThreadId: threadIdToUse,
                  noteId: offlineResult.noteId,
                  threadId: threadIdToUse,
                  spaceId: addToSpace && currentSpace?.id ? currentSpace.id : null,
                  isOffline: true
                }
              }));

              submitMutexRef.current = false;
              setIsSubmitting(false);
              resetForm();
              setSelectedThread('Unorganized');
              clearLocalStorage();
              localStorage.removeItem('showNewNotePanel');
              if (onClose) onClose();
              window.dispatchEvent(new CustomEvent('closeNewNotePanel'));
              return;
            } else {
              showToast(offlineResult.error || 'Failed to save note offline.', 'error');
              submitMutexRef.current = false;
              setIsSubmitting(false);
              return;
            }
          } else {
            showToast('You\'re offline. Sign in while online first to enable offline mode.', 'error');
            submitMutexRef.current = false;
            setIsSubmitting(false);
            return;
          }
        } else {
          // Non-network error - rethrow
          throw error;
        }
      }

      if (response && response.ok) {
        // Safely parse JSON response - Safari PWA can throw "string did not match expected pattern"
        // when response.json() is called on non-JSON content (e.g., cached HTML from service worker)
        let result;
        try {
          const contentType = response.headers.get('content-type');
          if (!contentType?.includes('application/json')) {
            const text = await response.text();
            console.error('[useNoteSubmission] Non-JSON response on 200 OK:', {
              contentType,
              textPreview: text.slice(0, 200),
              url: response.url
            });
            throw new Error('Server returned non-JSON response');
          }
          result = await response.json();
        } catch (parseError: any) {
          console.error('[useNoteSubmission] JSON parse error on success response:', parseError);
          captureException(parseError, {
            context: 'note_creation_json_parse',
            endpoint: '/api/notes/create',
            responseStatus: response.status,
            responseUrl: response.url,
          });
          showToast('Error creating note: Invalid server response. Please try again.', 'error');
          submitMutexRef.current = false;
          setIsSubmitting(false);
          return;
        }

        // Cache the simpleNoteId for offline access
        // This ensures the next note ID is correct when going offline
        if (result.note && result.note.simpleNoteId && userId) {
          cacheHighestSimpleNoteId(userId, result.note.simpleNoteId);
          debug('[useNoteSubmission] Cached simpleNoteId', { simpleNoteId: result.note.simpleNoteId });
        }
        invalidatePanelDataCache(PANEL_CACHE_KEYS.subscription);

        // Build scripture toast message for redirect (when scriptureDeferred, results are empty and we show a short message)
        let scriptureToastMessage = '';
        if (result.scriptureDeferred) {
          scriptureToastMessage = 'Note created. Scripture links are being added.';
        } else if (result.scriptureProcessingError) {
          scriptureToastMessage = 'Note created. Some scripture links couldn\'t be created.';
        } else if (result.scriptureResults && Array.isArray(result.scriptureResults)) {
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
          let threadData: Thread | undefined = finalThreadId
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
            note: result.note,
            actualThreadId: threadIdForEvent,
            noteId: result.note?.id,
            threadId: threadIdForEvent,
            spaceId: result.note?.spaceId || (addToSpace && currentSpace?.id ? currentSpace.id : null),
            // Caller will navigate to the note page; NavigationContext skips async add so trackNavigationAccess adds the thread on load
            willNavigateToNote: true
          }
        });
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

          // Non-blocking: verify in background, don't block navigation
          setTimeout(() => {
            let attempts = 0;
            const maxAttempts = 10;
            const check = () => {
              if (verifyThreadInStorage() || attempts >= maxAttempts) return;
              attempts++;
              setTimeout(check, 10);
            };
            check();
          }, 0);
        }

        // Update source note with link — fire-and-forget so navigation isn't blocked
        if (sourceNoteId && result.note && result.note.id) {
          const plainText = localStorage.getItem('newNoteSourceSelectionPlainText');
          const capturedSourceNoteId = sourceNoteId;
          const capturedNewNoteId = result.note.id;

          window.dispatchEvent(new CustomEvent('highlightSaved'));
          localStorage.removeItem('newNoteSourceNoteId');
          localStorage.removeItem('newNoteSourceSelectionFrom');
          localStorage.removeItem('newNoteSourceSelectionTo');
          localStorage.removeItem('newNoteSourceSelectionPlainText');

          if (plainText?.trim()) {
            // Run in background — don't block navigation
            (async () => {
              try {
                const detailsRes = await fetch(`/api/notes/${capturedSourceNoteId}/details`, { credentials: 'include' });
                if (detailsRes.ok) {
                  const data = await detailsRes.json();
                  const note = data?.note ?? data;
                  const content = note?.content;
                  if (typeof content === 'string' && note?.contentEncrypted !== true) {
                    const updatedContent = wrapTextWithNoteLink(content, plainText.trim(), capturedNewNoteId);
                    if (updatedContent && updatedContent !== content) {
                      const updateRes = await fetch(`/api/notes/${capturedSourceNoteId}/update-content`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ content: updatedContent }),
                      });
                      if (updateRes.ok) {
                        try {
                          sessionStorage.setItem('harvous-source-note-content-' + capturedSourceNoteId, updatedContent);
                          sessionStorage.setItem('harvous-source-note-content-at-' + capturedSourceNoteId, String(Date.now()));
                        } catch { /* ignore */ }
                        window.dispatchEvent(new CustomEvent('sourceNoteContentUpdated', { detail: { noteId: capturedSourceNoteId, content: updatedContent } }));
                      }
                    }
                  }
                }
              } catch (e) {
                debug('[useNoteSubmission] Source note link update failed', e as Record<string, unknown>);
              }
            })();
          }
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
          let redirectUrl = idToUrl(result.note.id);
          // Add toast message if applicable
          if (scriptureToastMessage) {
            const toastType = result.scriptureProcessingError ? 'warning' : 'info';
            redirectUrl += `?toast=${toastType}&message=${encodeURIComponent(scriptureToastMessage)}`;
          } else if (overrideThreadId && overrideThreadId !== 'thread_unorganized') {
            // If note was added to a thread, show a success message
            const threadData = threadOptions.find(thread => thread.id === overrideThreadId);
            if (threadData) {
              const toastMessage = `Note added to ${threadData.title}`;
              redirectUrl += `?toast=success&message=${encodeURIComponent(toastMessage)}`;
            }
          }
          
          debug('[useNoteSubmission] Navigation', { redirectUrl });

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

          debug('[useNoteSubmission] Navigating', { redirectUrl });

          // Navigate to the created note — use safeNavigate for SPA-like transition when available,
          // falling back to full page navigation. Replace history so back button goes to thread, not panel.
          safeNavigate(redirectUrl, { history: 'replace' });

          // Safety timeout: If navigation doesn't complete within 3 seconds (e.g., blocked by service worker),
          // reset isSubmitting to prevent the UI from being stuck forever
          setTimeout(() => {
            submitMutexRef.current = false;
            setIsSubmitting(false);
          }, 3000);
        } else {
          // If no note was created, still close the panel
          localStorage.removeItem('showNewNotePanel');
          resetForm();
          setSelectedThread('Unorganized');
          submitMutexRef.current = false;
          setIsSubmitting(false);
          clearLocalStorage();
          
          if (onClose) {
            onClose();
          } else {
            window.dispatchEvent(new CustomEvent('closeNewNotePanel'));
          }
        }
      } else {
        // Server returned an error response
        const errorText = await response.text();
        let error: { error?: string; code?: string; upgradeUrl?: string } = { error: `Error creating note: ${response.status}` };

        try {
          const errorJson = JSON.parse(errorText);
          error = errorJson;
        } catch (e) {
          console.error('[useNoteSubmission] Could not parse error response as JSON');
          error.error = `Error creating note: ${response.statusText || response.status}`;
        }

        showToast(error.error || 'Error creating note', 'error');
        submitMutexRef.current = false;
        setIsSubmitting(false);
      }
    } catch (error: any) {
      // Non-network errors (network errors are handled in the fetch catch above)
      if (typeof window !== 'undefined' && window.posthog) {
        captureException(error, {
          context: 'note_creation',
          endpoint: '/api/notes/create',
        });
      }

      showToast(`Error creating note: ${error?.message || 'Please try again.'}`, 'error');
      submitMutexRef.current = false;
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
      const noteTitle =
        noteType === 'default'
          ? title
          : noteType === 'scripture'
            ? scriptureReference
            : resourceUrl ? validateResourceUrl(resourceUrl).normalizedUrl || resourceUrl : resourceUrl;
      const payload: Record<string, unknown> = {
        content,
        title: noteTitle,
        threadId: getSelectedThread().id,
        noteType,
        contentEncrypted: false,
      };
      // Always send scriptureVersion so server can tag pills with translation for any note type
      payload.scriptureVersion = scriptureVersion;
      if (noteType === 'scripture') {
        payload.scriptureReference = formatReferenceForAPI(scriptureReference);
      } else if (noteType === 'resource') {
        const validatedUrl = resourceUrl ? validateResourceUrl(resourceUrl).normalizedUrl || resourceUrl : resourceUrl;
        payload.resourceUrl = validatedUrl;
        if (resourceMetadata) payload.resourceMetadata = resourceMetadata;
      }

      const response = await fetch('/api/notes/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include'
      });

      if (response.ok) {
        // Safely parse JSON response - Safari PWA can throw "string did not match expected pattern"
        // when response.json() is called on non-JSON content (e.g., cached HTML from service worker)
        let result;
        try {
          const contentType = response.headers.get('content-type');
          if (!contentType?.includes('application/json')) {
            const text = await response.text();
            console.error('[useNoteSubmission] Non-JSON response on 200 OK (save and close):', {
              contentType,
              textPreview: text.slice(0, 200),
              url: response.url
            });
            throw new Error('Server returned non-JSON response');
          }
          result = await response.json();
        } catch (parseError: any) {
          console.error('[useNoteSubmission] JSON parse error on success response (save and close):', parseError);
          captureException(parseError, {
            context: 'note_creation_json_parse_save_close',
            endpoint: '/api/notes/create',
            responseStatus: response.status,
            responseUrl: response.url,
          });
          showToast('Error creating note: Invalid server response. Please try again.', 'error');
          setIsSubmitting(false);
          return;
        }

        // Cache the simpleNoteId for offline access
        // This ensures the next note ID is correct when going offline
        if (result.note && result.note.simpleNoteId && userId) {
          cacheHighestSimpleNoteId(userId, result.note.simpleNoteId);
          debug('[useNoteSubmission] Cached simpleNoteId (save and close)', { simpleNoteId: result.note.simpleNoteId });
        }
        invalidatePanelDataCache(PANEL_CACHE_KEYS.subscription);

        // Build scripture toast message for redirect (when scriptureDeferred, results are empty)
        let scriptureToastMessage = '';
        if (result.scriptureDeferred) {
          scriptureToastMessage = 'Note created. Scripture links are being added.';
        } else if (result.scriptureProcessingError) {
          scriptureToastMessage = 'Note created. Some scripture links couldn\'t be created.';
        } else if (result.scriptureResults && result.scriptureResults.length > 0) {
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
          let redirectUrl = idToUrl(result.note.id);
          if (scriptureToastMessage) {
            const toastType = result.scriptureProcessingError ? 'warning' : 'info';
            redirectUrl += `?toast=${toastType}&message=${encodeURIComponent(scriptureToastMessage)}`;
          }
          
          // CRITICAL: Remove panel state from localStorage entirely (not just set to 'false')
          // This prevents DesktopPanelManager from reopening the panel on the new page
          localStorage.removeItem('showNewNotePanel');
          localStorage.removeItem('showNewThreadPanel');
          localStorage.removeItem('showNewResourcePanel');
          
          // Navigate to the created note — use safeNavigate for SPA-like transition when available
          safeNavigate(redirectUrl, { history: 'replace' });
        }
      } else {
        // Safely parse error response - may be HTML if server error occurred
        const errorText = await response.text();
        let error: { error?: string; code?: string; upgradeUrl?: string } = { error: `Error creating note: ${response.status}` };
        
        try {
          const errorJson = JSON.parse(errorText);
          error = errorJson;
        } catch (e) {
          // If response isn't JSON (e.g., HTML error page), use status text
          console.error('[useNoteSubmission] Could not parse error response as JSON (save and close)');
          error.error = `Error creating note: ${response.statusText || response.status}`;
        }
        
        showToast(error.error || 'Error creating note', 'error');
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



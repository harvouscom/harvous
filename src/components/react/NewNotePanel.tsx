'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import ThreadCombobox from './ThreadCombobox';
import { useNavigation } from './navigation/NavigationContext';
import { safeFetch } from '@/utils/safe-fetch';
import { captureException } from '@/utils/posthog';
import { getThreadGradientCSS } from '@/utils/colors';
import { debug } from '@/utils/logger';
import { safeURL } from '@/utils/safe-url';
import { usePersistedUserId } from '@/utils/user-id';
import { getNextSimpleNoteIdPreview, getLocalNoteCount, cacheHighestSimpleNoteId, getCachedHighestSimpleNoteId } from '@/utils/offline-mutations';

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
  ThreadPickerHeader,
  TemplateSelector,
} from './note-panel';

import UnsavedChangesDialog from './dialogs/UnsavedChangesDialog';
import SuggestedThreadDialog from './dialogs/SuggestedThreadDialog';

interface NewNotePanelProps {
  currentThread?: any;
  currentSpace?: any;
  onClose?: () => void;
  initialNoteType?: 'default' | 'scripture' | 'resource';
  inBottomSheet?: boolean;
  registerSheetCloseHandler?: ((handler: (reason: 'dismiss' | 'escape' | 'button') => boolean | Promise<boolean>) => void) | null;
  onPanelReady?: () => void;
}

export default function NewNotePanel({
  currentThread,
  currentSpace,
  onClose,
  initialNoteType,
  inBottomSheet = false,
  registerSheetCloseHandler = null,
  onPanelReady,
}: NewNotePanelProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Call onPanelReady when panel is mounted and form is ready
  useEffect(() => {
    if (isMounted && onPanelReady) {
      onPanelReady();
    }
  }, [isMounted, onPanelReady]);

  // Get userId for offline operations (works online and offline)
  const userId = usePersistedUserId();

  // Get navigation context
  const navigation = useNavigation();
  const { addToNavigationHistory, navigationHistory } = navigation;

  // State for next note ID, unsaved dialog, and suggested thread
  // Initialize from localStorage cache immediately for better offline UX
  const [nextNoteId, setNextNoteId] = useState(() => {
    if (typeof window === 'undefined') return 'N...';
    const persistedUserId = localStorage.getItem('harvous-user-id');
    if (persistedUserId) {
      const cachedId = localStorage.getItem(`harvous_highestSimpleNoteId_${persistedUserId}`);
      if (cachedId) {
        const nextId = parseInt(cachedId, 10) + 1;
        return `N${nextId.toString().padStart(3, '0')}`;
      }
    }
    return 'N...'; // Show loading indicator instead of #New
  });
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [suggestedThreadName, setSuggestedThreadName] = useState<string | null>(null);
  const [showSuggestedThreadDialog, setShowSuggestedThreadDialog] = useState(false);
  const [scriptureCount, setScriptureCount] = useState(0);
  const [duplicateInfo, setDuplicateInfo] = useState<{ exists: boolean; noteId?: string; simpleNoteId?: number; title?: string; description?: string; image?: string; url?: string } | null>(null);
  const [pendingThreadName, setPendingThreadName] = useState<string | null>(null);
  
  // State for subscription limit check
  const [isLimitReached, setIsLimitReached] = useState(false);
  const [currentCount, setCurrentCount] = useState(0);
  const [limit, setLimit] = useState(200);

  // Thread dropdown (CardStack header)
  const [isThreadDropdownOpen, setIsThreadDropdownOpen] = useState(false);
  const [threadAnchorRect, setThreadAnchorRect] = useState<DOMRect | null>(null);
  const [threadDropdownAlignTop, setThreadDropdownAlignTop] = useState<number | null>(null);
  const threadHeaderRef = useRef<HTMLDivElement>(null);
  const cardStackInnerRef = useRef<HTMLDivElement>(null);
  const cardStackContentRef = useRef<HTMLDivElement>(null);
  const [cardOverflowing, setCardOverflowing] = useState(false);
  const [cardHasScrolledDown, setCardHasScrolledDown] = useState(false);

  // Ref to store the TiptapEditor instance for focusing
  const editorRef = useRef<any>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Use extracted form hook
  const form = useNewNoteForm({
    currentSpace,
    initialNoteType,
  });

  // When mobile panel opens, rehydrate form from localStorage (desktop draft) once on mount.
  // On desktop, rehydrate once per open so selection data (pre-filled content, source note) is loaded.
  // Delay showing form on desktop until after rehydrate to avoid title/content flash from stale context.
  // Important: run desktop rehydrate only once per mount (use ref); do NOT include `form` in deps or
  // the effect re-runs every render (form is a new object each time) and overwrites user input.
  const hasRehydratedRef = useRef(false);
  const hasDesktopRehydratedRef = useRef(false);
  const [desktopRehydrated, setDesktopRehydrated] = useState(false);
  useEffect(() => {
    if (inBottomSheet && !hasRehydratedRef.current) {
      hasRehydratedRef.current = true;
      form.rehydrateFromStorage();
    } else if (!inBottomSheet && !hasDesktopRehydratedRef.current) {
      hasDesktopRehydratedRef.current = true;
      form.rehydrateFromStorage();
      setDesktopRehydrated(true);
    }
  }, [inBottomSheet, form.rehydrateFromStorage]);

  // iOS: when an input in the sheet gains focus, Safari scrolls to center it and pushes the toolbar off.
  // Undo that by resetting window scroll after a short delay so header/toolbar stay visible.
  useEffect(() => {
    if (!inBottomSheet) return;
    const el = formRef.current;
    if (!el) return;
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const handler = () => {
      const t = setTimeout(() => {
        window.scrollTo(0, 0);
      }, 100);
      timeouts.push(t);
    };
    el.addEventListener('focusin', handler);
    return () => {
      el.removeEventListener('focusin', handler);
      timeouts.forEach((t) => clearTimeout(t));
    };
  }, [inBottomSheet]);

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

  // Load next note ID - with offline fallback
  const loadNextNoteId = useCallback(async () => {
    const isOffline = !navigator.onLine;
    debug('[NewNotePanel] loadNextNoteId called', { userId, online: !isOffline });
    
    // Helper function to format note ID consistently
    const formatNoteId = (id: number): string => `N${id.toString().padStart(3, '0')}`;
    
    // Helper function to try offline preview from IndexedDB
    const tryOfflinePreview = async (userIdToUse: string): Promise<boolean> => {
      try {
        debug('[NewNotePanel] Trying offline preview from IndexedDB', { userIdToUse });
        const previewId = await getNextSimpleNoteIdPreview(userIdToUse);
        debug('[NewNotePanel] Offline preview result', { previewId });
        if (previewId !== null) {
          setNextNoteId(formatNoteId(previewId));
          return true;
        }
      } catch (offlineError) {
        console.error('[NewNotePanel] Error getting offline ID preview:', offlineError);
      }
      return false;
    };
    
    // Helper function to get fallback ID from local note count
    const tryLocalCountFallback = async (userIdToUse: string): Promise<boolean> => {
      try {
        const localCount = await getLocalNoteCount(userIdToUse);
        const fallbackId = formatNoteId(localCount + 1);
        debug('[NewNotePanel] Using local count fallback', { localCount, fallbackId });
        setNextNoteId(fallbackId);
        return true;
      } catch (countError) {
        console.error('[NewNotePanel] Error getting local note count:', countError);
        return false;
      }
    };

    // STEP 1: Always check localStorage cache first (instant, synchronous)
    // This provides immediate feedback while we fetch the real value
    if (userId) {
      const cachedId = getCachedHighestSimpleNoteId(userId);
      if (cachedId !== null) {
        const nextId = cachedId + 1;
        const formattedId = formatNoteId(nextId);
        debug('[NewNotePanel] Using cached ID for immediate display', { cachedId, nextId, formattedId, isOffline });
        setNextNoteId(formattedId);
        
        // If offline, we're done - cached value is our best bet
        if (isOffline) {
          debug('[NewNotePanel] Offline - using cached ID as final value');
          return;
        }
        // If online, continue to fetch from server to update cache
      }
    }

    // STEP 2: Handle offline mode - prioritize local sources
    if (isOffline) {
      debug('[NewNotePanel] Offline mode - using local sources only');
      
      if (!userId) {
        // No userId yet - show N001 as default for new users
        debug('[NewNotePanel] No userId in offline mode, showing N001');
        setNextNoteId('N001');
        return;
      }
      
      // Try IndexedDB preview
      if (await tryOfflinePreview(userId)) {
        return;
      }
      
      // Try local note count fallback
      if (await tryLocalCountFallback(userId)) {
        return;
      }
      
      // Last resort: show N001 for offline mode (never #New)
      debug('[NewNotePanel] All offline sources failed, showing N001 as fallback');
      setNextNoteId('N001');
      return;
    }

    // STEP 3: Online mode - try server, fallback to local sources
    try {
      const response = await safeFetch('/api/notes/next-id', {
        retries: 2,
        retryDelay: 1000
      });
      
      if (response && response.ok) {
        const data = await response.json();
        // Server returns both nextNoteId (numeric) and formattedId (string)
        // Cache the numeric ID for offline use
        if (userId && data.nextNoteId !== undefined) {
          // Cache the highest ID (nextNoteId - 1) since nextNoteId is what will be assigned
          cacheHighestSimpleNoteId(userId, data.nextNoteId - 1);
          debug('[NewNotePanel] Cached highestSimpleNoteId from server', { cached: data.nextNoteId - 1 });
        }
        // Server already returns formattedId as "N502"
        setNextNoteId(data.formattedId);
        return;
      }
      
      // Response not ok - fallback to local sources
      debug('[NewNotePanel] Server response not ok, trying local fallbacks');
      if (userId) {
        if (await tryOfflinePreview(userId)) return;
        if (await tryLocalCountFallback(userId)) return;
      }
      
      // Keep cached value if we have one, otherwise show N001
      if (!getCachedHighestSimpleNoteId(userId || '')) {
        setNextNoteId('N001');
      }
    } catch (error) {
      // Server request failed - try local sources
      debug('[NewNotePanel] Server request failed, trying local fallbacks', { error });
      if (userId) {
        if (await tryOfflinePreview(userId)) return;
        if (await tryLocalCountFallback(userId)) return;
      }
      
      // Keep cached value if we have one, otherwise show N001
      if (!getCachedHighestSimpleNoteId(userId || '')) {
        setNextNoteId('N001');
        captureException(error as Error);
      }
    }
  }, [userId]);

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

  // Handle editor ready callback - focus the editor when it's initialized (desktop only).
  // On mobile (pointer: coarse) we skip auto-focus so the toolbar doesn't show until the user taps.
  const handleEditorReady = (editor: any) => {
    if (!editor) return;

    editorRef.current = editor;
    const isTouchPrimary = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
    if (isTouchPrimary) return;

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
  }, [loadNextNoteId]);

  // Check subscription status via API with offline fallback
  const checkSubscriptionStatus = useCallback(async () => {
    // Don't check if page isn't ready
    if (typeof window === 'undefined' || document.readyState === 'loading') {
      return;
    }

    // Helper to check local count
    const checkLocalCount = async () => {
      if (!userId) return;
      try {
        const localCount = await getLocalNoteCount(userId);
        // Use default limit of 200 if we can't get it from server
        const defaultLimit = 200;
        setCurrentCount(localCount);
        setLimit(defaultLimit);
        // Check if user is close to limit (within 10 notes) to prevent abuse
        setIsLimitReached(localCount >= defaultLimit - 10);
        
        if (localCount >= defaultLimit - 10) {
          console.warn('[NewNotePanel] User approaching note limit offline:', localCount, '/', defaultLimit);
        }
      } catch (offlineError) {
        console.error('[NewNotePanel] Error checking offline note count:', offlineError);
        // Keep default values on error
      }
    };

    // If offline, skip network request and use local data directly
    if (!navigator.onLine) {
      await checkLocalCount();
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
        setLimit(data.limit || 200);
        setIsLimitReached(!data.hasUnlimited && (data.currentCount || 0) >= (data.limit || 200));
      } else {
        // Only log if it's not a 401 (unauthorized) - that's expected if user isn't logged in
        if (response.status !== 401) {
          console.warn('[NewNotePanel] Subscription status check returned:', response.status);
        }
        // Fall through to offline check
        throw new Error('API check failed');
      }
    } catch (error) {
      // Server request failed - try offline check
      await checkLocalCount();
    }
  }, [userId]);

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
      }, 200);
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

  // Top gradient on card scroll: check overflow and track scroll (same smart treatment as TiptapEditor)
  useEffect(() => {
    if (!cardStackInnerRef.current) return;
    const el = cardStackInnerRef.current;
    const checkOverflow = () => {
      if (cardStackInnerRef.current) {
        const inner = cardStackInnerRef.current;
        setCardOverflowing(inner.scrollHeight > inner.clientHeight);
        setCardHasScrolledDown(inner.scrollTop > 0);
      }
    };
    checkOverflow();
    const timer = setTimeout(checkOverflow, 50);
    const updateScrollState = () => {
      if (!cardStackInnerRef.current) return;
      setCardHasScrolledDown(cardStackInnerRef.current.scrollTop > 0);
    };
    el.addEventListener('scroll', updateScrollState);
    return () => {
      clearTimeout(timer);
      el.removeEventListener('scroll', updateScrollState);
    };
  }, [form.noteType, form.content.length]);

  // Handle panel close
  const handleClose = () => {
    try {
      if (form.hasUnsavedChanges()) {
        setShowUnsavedDialog(true);
        return;
      }
      closePanel();
    } catch (error) {
      console.error('[NewNotePanel] Error in handleClose:', error);
      // Force close on error - better UX than being stuck
      closePanel();
    }
  };

  // Allow the bottom sheet to ask the panel whether it can dismiss.
  // Treat dismiss/escape the same as Close button - prompt if unsaved changes.
  useEffect(() => {
    if (!registerSheetCloseHandler) return;

    registerSheetCloseHandler((_reason) => {
      // All close attempts (dismiss, escape, button) behave the same:
      // prompt if there are unsaved changes.
      if (form.hasUnsavedChanges()) {
        setShowUnsavedDialog(true);
        return false;
      }
      return true;
    });
  }, [registerSheetCloseHandler, form]);

  // Actually close the panel - resilient to errors so close always works
  const closePanel = () => {
    // Wrap each operation in try-catch to ensure close always completes
    try {
      form.clearLocalStorage();
    } catch (e) {
      console.error('[NewNotePanel] Error clearing local storage:', e);
    }

    try {
      form.resetForm();
    } catch (e) {
      console.error('[NewNotePanel] Error resetting form:', e);
    }

    // Always reset these states regardless of errors above
    submission.setIsSubmitting(false);
    setShowUnsavedDialog(false);
    setPendingThreadName(null);

    try {
      // Remove any pending threads from options
      threadSelection.setThreadOptions(prev => prev.filter(t => !t.id.startsWith('pending_')));
    } catch (e) {
      console.error('[NewNotePanel] Error filtering threads:', e);
    }

    // Always dispatch close event
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
            // Dispatch threadCreated event on document (NavigationContext listens on document)
            setTimeout(() => {
              document.dispatchEvent(new CustomEvent('threadCreated', {
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
          // Create the thread - use color from pending thread if set via combobox color picker
          const pendingThread = threadSelection.threadOptions.find(
            (t) => t.id.startsWith('pending_') && t.title.trim().toLowerCase() === trimmedName.toLowerCase()
          );
          const threadColor = pendingThread?.color ?? 'paper';
          const formData = new FormData();
          formData.set('title', trimmedName);
          formData.set('isPublic', 'false');
          formData.set('color', threadColor);
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
          // Use document (NavigationContext listens on document)
          setTimeout(() => {
            debug('[NewNotePanel] Dispatching threadCreated event', { threadId: created.id });
            document.dispatchEvent(new CustomEvent('threadCreated', {
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
        // Use document (NavigationContext listens on document)
        setTimeout(() => {
          debug('[NewNotePanel] Dispatching threadCreated event', { threadId: created.id });
          document.dispatchEvent(new CustomEvent('threadCreated', {
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

  if (!isMounted) {
    return null;
  }

  // Get selected thread object for header display (from threadOptions or currentThread when adding to a thread in a shared space as member)
  const selectedThreadObj = threadSelection.threadOptions.find(
    t => t.title === threadSelection.selectedThread
  );
  const isCurrentThreadSelected = currentThread && currentThread.title === threadSelection.selectedThread;
  const threadBackgroundGradient = selectedThreadObj?.backgroundGradient
    ?? (isCurrentThreadSelected ? currentThread?.backgroundGradient : null)
    ?? 'var(--color-gradient-gray)';
  const threadColor = selectedThreadObj?.color
    ?? (isCurrentThreadSelected ? currentThread?.color ?? null : null)
    ?? null;
  const threadNoteCount = selectedThreadObj?.noteCount
    ?? (isCurrentThreadSelected ? currentThread?.noteCount : undefined)
    ?? 0;

  // Handle thread header click - align dropdown top with card-stack__inner content
  const handleThreadHeaderClick = () => {
    if (threadHeaderRef.current) {
      setThreadAnchorRect(threadHeaderRef.current.getBoundingClientRect());
    }
    setThreadDropdownAlignTop(cardStackInnerRef.current?.getBoundingClientRect().top ?? null);
    setIsThreadDropdownOpen(true);
  };

  return (
    <>
      <NewNotePanelStyles />
      <form
        ref={formRef}
        onSubmit={handleFormSubmit}
        className={`new-note-panel h-full flex flex-col w-full${inBottomSheet ? ' new-note-panel--in-sheet' : ''}`}
        style={{
          height: '100%',
          maxHeight: '100%',
          minHeight: 0,
          width: '100%'
        }}
      >
        {currentSpace && currentSpace.id && (
          <SpaceSelector
            space={currentSpace}
            isSelected={form.addToSpace}
            onToggle={() => form.setAddToSpace(!form.addToSpace)}
          />
        )}
        {/* CardStack layout (desktop and in-sheet) */}
        <div className="new-note-panel__card-stack-wrapper" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="card-stack" style={{ flex: 1, minHeight: 0 }}>
            <div className="card-stack__container">
              <ThreadPickerHeader
                ref={threadHeaderRef}
                selectedThreadName={threadSelection.selectedThread}
                threadBackgroundGradient={threadBackgroundGradient}
                threadColor={threadColor}
                noteCount={threadNoteCount}
                isOpen={isThreadDropdownOpen}
                onClick={handleThreadHeaderClick}
              />
              <ThreadCombobox
                selectedThread={threadSelection.selectedThread}
                onThreadSelect={(thread: string) => {
                  threadSelection.handleThreadSelect(thread);
                  setSuggestedThreadName(null);
                  setIsThreadDropdownOpen(false);
                  if (pendingThreadName && thread.trim().toLowerCase() !== pendingThreadName.trim().toLowerCase()) {
                    setPendingThreadName(null);
                    threadSelection.setThreadOptions(prev => prev.filter(t => !t.id.startsWith('pending_')));
                  }
                }}
                threads={threadSelection.threadOptions}
                placeholder="Select thread..."
                suggestedThreadName={suggestedThreadName}
                onSuggestedThreadNameChange={(editedName: string) => {
                  if (editedName && editedName.trim()) setSuggestedThreadName(editedName.trim());
                }}
                onCreateThread={async (threadName: string, color?: string) => {
                  const trimmedName = threadName.trim();
                  if (!trimmedName) return;
                  const existingThread = threadSelection.threadOptions.find(
                    (t) => t.title.trim().toLowerCase() === trimmedName.toLowerCase()
                  );
                  if (existingThread) {
                    threadSelection.handleThreadSelect(existingThread.title);
                    setPendingThreadName(null);
                    setSuggestedThreadName(null);
                    setIsThreadDropdownOpen(false);
                    return;
                  }
                  setPendingThreadName(trimmedName);
                  const threadColor = color ?? 'paper';
                  const pendingThread: Thread = {
                    id: `pending_${Date.now()}`,
                    title: trimmedName,
                    noteCount: 0,
                    backgroundGradient: getThreadGradientCSS(threadColor),
                    color: threadColor,
                  };
                  threadSelection.setThreadOptions((prev) => {
                    const filtered = prev.filter(t => !t.id.startsWith('pending_') || t.title !== trimmedName);
                    const unorganizedIdx = filtered.findIndex((t) => t.id === 'thread_unorganized' || t.title === 'Unorganized');
                    return unorganizedIdx === -1
                      ? [...filtered, pendingThread]
                      : [...filtered.slice(0, unorganizedIdx + 1), pendingThread, ...filtered.slice(unorganizedIdx + 1)];
                  });
                  threadSelection.handleThreadSelect(trimmedName);
                  setSuggestedThreadName(null);
                  setIsThreadDropdownOpen(false);
                  debug('[NewNotePanel] Stored pending thread name', { threadName: trimmedName });
                }}
                triggerless={true}
                isOpen={isThreadDropdownOpen}
                onClose={() => setIsThreadDropdownOpen(false)}
                anchorRect={threadAnchorRect}
                alignTopWith={threadDropdownAlignTop}
                dropdownPortalTargetRef={cardStackContentRef}
              />
              <div ref={cardStackContentRef} className="card-stack__content">
                <div ref={cardStackInnerRef} className="card-stack__inner">
                  {cardOverflowing && cardHasScrolledDown && (
                    <div
                      className="absolute top-0 left-0 right-0 pointer-events-none z-10"
                      style={{ height: '36px', background: 'linear-gradient(to top, transparent, white)' }}
                      aria-hidden="true"
                    />
                  )}
                  <div className="card-stack__inner-content">
                    {!inBottomSheet && !desktopRehydrated ? (
                      <div className="flex items-center justify-center py-8 text-[var(--color-pebble-grey)] text-[14px]">
                        Loading...
                      </div>
                    ) : (
                      <>
                    {form.noteType === 'default' && (
                      <TemplateSelector
                        selectedTemplateId={form.selectedTemplateId}
                        onSelectTemplate={form.setSelectedTemplateId}
                      />
                    )}
                    {form.noteType === 'default' && (
                      <DefaultNoteForm
                        title={form.title}
                        onTitleChange={form.setTitle}
                        content={form.content}
                        onContentChange={form.setContent}
                        nextNoteId={nextNoteId}
                        onEditorReady={handleEditorReady}
                        parentThreadId={threadSelection.getSelectedThread()?.id}
                        toolbarAtBottom={true}
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
                        toolbarAtBottom={true}
                      />
                    )}
                    {form.noteType === 'resource' && (
                      <NewResourcePanel
                        resourceUrl={form.resourceUrl}
                        onResourceUrlChange={form.setResourceUrl}
                        nextNoteId={nextNoteId}
                        onMetadataFetched={form.setResourceMetadata}
                        onSuggestedThread={(threadId: string, threadTitle: string) => setSuggestedThreadName(threadTitle)}
                        onScriptureCountChange={setScriptureCount}
                        onDuplicateDetected={setDuplicateInfo}
                      />
                    )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom buttons - outside wrapper to allow shadow to render */}
        <NoteFormFooter
          isSubmitting={submission.isSubmitting}
          onClose={handleClose}
          noteType={form.noteType}
          duplicateInfo={duplicateInfo}
          isLimitReached={isLimitReached}
          currentCount={currentCount}
          limit={limit}
          showCloseButton={!inBottomSheet}
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

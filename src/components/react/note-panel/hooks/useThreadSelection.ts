import { useState, useEffect, useRef, useCallback } from 'react';
import { safeFetch } from '@/utils/safe-fetch';
import { captureException } from '@/utils/posthog';
import { getThreadsLocal } from '@/utils/offline-read-layer';
import { usePersistedUserId } from '@/utils/user-id';

export interface Thread {
  id: string;
  title: string;
  color: string | null;
  noteCount: number;
  backgroundGradient: string;
  isSuggested?: boolean;
  suggestedReason?: string;
}

export interface UseThreadSelectionOptions {
  currentThread?: { id: string; title: string } | null;
  navigationHistory?: Array<{ id: string; title: string }>;
  suggestedThreadIds?: string[];
  suggestedDomain?: string;
  suggestionReasons?: Record<string, string>;
}

export interface UseThreadSelectionReturn {
  threadOptions: Thread[];
  selectedThread: string;
  setSelectedThread: (thread: string) => void;
  handleThreadSelect: (threadTitle: string) => void;
  getSelectedThread: () => Thread;
  loadThreads: () => Promise<void>;
  setThreadOptions: React.Dispatch<React.SetStateAction<Thread[]>>;
}

const DEFAULT_UNORGANIZED_THREAD: Thread = {
  id: 'thread_unorganized',
  title: 'Unorganized',
  color: null,
  noteCount: 0,
  backgroundGradient: 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)'
};

/**
 * Hook for managing thread selection and loading
 */
export function useThreadSelection(options: UseThreadSelectionOptions = {}): UseThreadSelectionReturn {
  const { currentThread, navigationHistory, suggestedThreadIds, suggestedDomain, suggestionReasons } = options;
  
  const [threadOptions, setThreadOptions] = useState<Thread[]>([DEFAULT_UNORGANIZED_THREAD]);
  const [selectedThread, setSelectedThread] = useState('Unorganized');
  const [hasSetThreadFromSaved, setHasSetThreadFromSaved] = useState(false);
  
  // Get userId for offline data access
  const userId = usePersistedUserId();
  
  // Track if we've initialized from currentThread to prevent resetting user's manual selection
  const hasInitializedFromCurrentThread = useRef(false);
  // Track if user has manually selected a thread (to prevent automatic resets)
  const hasManualSelection = useRef(false);
  
  // Debouncing refs for loadThreads
  const loadThreadsRef = useRef<{ lastCallTime: number; isLoading: boolean }>({ lastCallTime: 0, isLoading: false });
  const DEBOUNCE_WINDOW_MS = 2000;

  // Client-side thread detection from URL/navigation context
  const detectThreadFromContext = useCallback((): { id: string; title: string } | null => {
    if (typeof window === 'undefined') return null;
    
    // Try to get from navigation element data attributes
    const navigationElement = document.querySelector('[slot="navigation"]') as HTMLElement;
    if (navigationElement) {
      const threadId = navigationElement.getAttribute('data-parent-thread-id') || 
                       navigationElement.getAttribute('data-thread-id');
      const threadTitle = navigationElement.getAttribute('data-parent-thread-title') || 
                         navigationElement.getAttribute('data-thread-title');
      
      if (threadId && threadTitle) {
        return { id: threadId, title: threadTitle };
      }
    }
    
    // Try to get from URL pathname
    const pathname = window.location.pathname;
    if (pathname && pathname !== '/' && !pathname.includes('/dashboard') && 
        !pathname.includes('/sign-in') && !pathname.includes('/sign-up')) {
      const threadId = pathname.substring(1); // Remove leading slash
      if (threadId && threadId !== 'dashboard') {
        // Check navigation history for thread title
        const navHistory = navigationHistory || [];
        const historyItem = navHistory.find(item => item.id === threadId);
        if (historyItem && historyItem.title) {
          return { id: threadId, title: historyItem.title };
        }
      }
    }
    
    return null;
  }, [navigationHistory]);

  // Load threads from API with debouncing (or from IndexedDB when offline)
  const loadThreads = useCallback(async () => {
    const now = Date.now();
    const timeSinceLastCall = now - loadThreadsRef.current.lastCallTime;
    if (timeSinceLastCall < DEBOUNCE_WINDOW_MS || loadThreadsRef.current.isLoading) {
      return;
    }

    loadThreadsRef.current.lastCallTime = now;
    loadThreadsRef.current.isLoading = true;

    // Helper to format threads array
    const formatThreads = (threads: any[]): Thread[] => {
      return threads.map((thread: any) => {
        const isSuggested = suggestedThreadIds?.includes(thread.id) || false;
        let suggestedReason: string | undefined = undefined;
        
        if (isSuggested) {
          if (suggestionReasons && suggestionReasons[thread.id]) {
            suggestedReason = suggestionReasons[thread.id];
          } else if (suggestedDomain) {
            suggestedReason = `From ${suggestedDomain}`;
          }
        }
        
        return {
          id: thread.id,
          title: thread.title,
          color: thread.color,
          noteCount: thread.noteCount || 0,
          backgroundGradient: thread.backgroundGradient || 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)',
          isSuggested,
          suggestedReason,
        };
      });
    };

    // If offline, load from IndexedDB directly
    if (!navigator.onLine && userId) {
      try {
        const localThreads = await getThreadsLocal(userId);
        const formattedThreads = formatThreads(localThreads);
        
        // Ensure 'Unorganized' thread exists
        // CRITICAL: Only check by ID, not title - a thread with title "Unorganized" but different ID
        // (like a renamed onboarding thread) should NOT be treated as THE unorganized thread
        const hasUnorganizedThread = formattedThreads.some((thread: Thread) => 
          thread.id === 'thread_unorganized'
        );
        
        if (!hasUnorganizedThread) {
          formattedThreads.unshift(DEFAULT_UNORGANIZED_THREAD);
        }
        
        setThreadOptions(formattedThreads);
      } catch (offlineError) {
        console.error('[useThreadSelection] Error loading threads from IndexedDB:', offlineError);
      } finally {
        loadThreadsRef.current.isLoading = false;
      }
      return;
    }

    try {
      const response = await safeFetch('/api/threads/list', {
        retries: 2,
        retryDelay: 1000
      });
      
      if (response && response.ok) {
        const threads = await response.json();
        const formattedThreads = formatThreads(threads);
        
        // Ensure 'Unorganized' thread exists
        // CRITICAL: Only check by ID, not title - a thread with title "Unorganized" but different ID
        // (like a renamed onboarding thread) should NOT be treated as THE unorganized thread
        const hasUnorganizedThread = formattedThreads.some((thread: Thread) => 
          thread.id === 'thread_unorganized'
        );
        
        if (!hasUnorganizedThread) {
          formattedThreads.unshift(DEFAULT_UNORGANIZED_THREAD);
        }
        
        setThreadOptions(formattedThreads);
        
        // After threads are loaded, check if we have a saved thread ID to match
        const savedThreadId = localStorage.getItem('newNoteThread');
        if (savedThreadId && !hasSetThreadFromSaved) {
          let matchedThread = 'Unorganized';
          
          if (savedThreadId === 'thread_unorganized') {
            matchedThread = 'Unorganized';
          } else {
            const matchingThread = formattedThreads.find((thread: Thread) => thread.id === savedThreadId);
            if (matchingThread) {
              matchedThread = matchingThread.title;
            }
          }
          
          setSelectedThread(matchedThread);
          setHasSetThreadFromSaved(true);
          localStorage.removeItem('newNoteThread');
        }
      }
    } catch (error) {
      captureException(error as Error);
    } finally {
      loadThreadsRef.current.isLoading = false;
    }
  }, [hasSetThreadFromSaved, suggestedThreadIds, suggestedDomain, suggestionReasons]);

  // Separate effect to handle currentThread when it becomes available
  useEffect(() => {
    if (hasManualSelection.current) {
      return;
    }
    
    if (currentThread && currentThread.id) {
      if (!hasInitializedFromCurrentThread.current || 
          (selectedThread === 'Unorganized' && currentThread.id !== 'thread_unorganized')) {
        const matchingThread = threadOptions.find(thread => thread.id === currentThread.id);
        
        if (matchingThread && matchingThread.title !== selectedThread) {
          setSelectedThread(matchingThread.title);
          setHasSetThreadFromSaved(true);
          hasInitializedFromCurrentThread.current = true;
        } else if (currentThread.title && currentThread.title !== selectedThread && 
                   (!hasInitializedFromCurrentThread.current || selectedThread === 'Unorganized')) {
          setSelectedThread(currentThread.title);
          setHasSetThreadFromSaved(true);
          hasInitializedFromCurrentThread.current = true;
        }
      }
    }
  }, [currentThread, threadOptions, selectedThread]);

  // Handle thread selection when threadOptions are loaded
  // Priority: 1) currentThread, 2) client-side detection, 3) savedThreadId, 4) Unorganized
  useEffect(() => {
    // Don't override manual selections
    if (hasManualSelection.current) {
      return;
    }
    
    // Priority 1: Use currentThread prop if available
    if (currentThread && currentThread.id && !hasInitializedFromCurrentThread.current) {
      const matchingThread = threadOptions.find(thread => thread.id === currentThread.id);
      
      if (matchingThread) {
        if (matchingThread.title !== selectedThread) {
          setSelectedThread(matchingThread.title);
          setHasSetThreadFromSaved(true);
          hasInitializedFromCurrentThread.current = true;
        }
        return;
      }
      
      if (currentThread.title && currentThread.title !== selectedThread) {
        setSelectedThread(currentThread.title);
        setHasSetThreadFromSaved(true);
        hasInitializedFromCurrentThread.current = true;
        return;
      }
    }
    
    // Priority 2: Client-side detection
    if (!hasSetThreadFromSaved && !hasInitializedFromCurrentThread.current) {
      const detectedThread = detectThreadFromContext();
      if (detectedThread) {
        const matchingThread = threadOptions.find(thread => thread.id === detectedThread.id);
        if (matchingThread) {
          if (matchingThread.title !== selectedThread) {
            setSelectedThread(matchingThread.title);
            setHasSetThreadFromSaved(true);
            hasInitializedFromCurrentThread.current = true;
            return;
          }
        } else if (detectedThread.title && detectedThread.title !== selectedThread) {
          setSelectedThread(detectedThread.title);
          setHasSetThreadFromSaved(true);
          hasInitializedFromCurrentThread.current = true;
          return;
        }
      }
    }
    
    // Priority 3: Saved thread ID
    if (!hasSetThreadFromSaved && !hasInitializedFromCurrentThread.current) {
      const hasLoadedThreads = threadOptions.length > 1 || 
        (threadOptions.length === 1 && threadOptions[0]?.id === 'thread_unorganized');
      
      if (!hasLoadedThreads) {
        return;
      }
      
      const savedThreadId = localStorage.getItem('newNoteThreadPending') || localStorage.getItem('newNoteThread') || '';
      
      if (savedThreadId) {
        let matchedThread = 'Unorganized';
        
        if (savedThreadId === 'thread_unorganized') {
          matchedThread = 'Unorganized';
        } else {
          const matchingThread = threadOptions.find(thread => thread.id === savedThreadId);
          if (matchingThread) {
            matchedThread = matchingThread.title;
          }
        }
        
        if (matchedThread !== selectedThread) {
          setSelectedThread(matchedThread);
          setHasSetThreadFromSaved(true);
          localStorage.removeItem('newNoteThread');
          localStorage.removeItem('newNoteThreadPending');
        }
      }
    }
  }, [currentThread, threadOptions, hasSetThreadFromSaved, navigationHistory, detectThreadFromContext, selectedThread]);

  // Reset manual selection flag when currentThread prop changes
  useEffect(() => {
    hasManualSelection.current = false;
  }, [currentThread?.id]);

  // Save to localStorage when selectedThread changes (if not from saved)
  useEffect(() => {
    if (!hasSetThreadFromSaved) {
      localStorage.setItem('newNoteThread', selectedThread);
    }
  }, [selectedThread, hasSetThreadFromSaved]);

  // Initialize: load threads on mount
  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  // Update thread suggestions when suggestedThreadIds, suggestedDomain, or suggestionReasons changes
  useEffect(() => {
    if (suggestedThreadIds && suggestedThreadIds.length > 0) {
      setThreadOptions(prev => prev.map(thread => {
        const isSuggested = suggestedThreadIds.includes(thread.id);
        let suggestedReason: string | undefined = undefined;
        
        if (isSuggested) {
          if (suggestionReasons && suggestionReasons[thread.id]) {
            suggestedReason = suggestionReasons[thread.id];
          } else if (suggestedDomain) {
            suggestedReason = `From ${suggestedDomain}`;
          }
        }
        
        return {
          ...thread,
          isSuggested,
          suggestedReason,
        };
      }));
    } else if (suggestedThreadIds && suggestedThreadIds.length === 0) {
      // Clear suggestions
      setThreadOptions(prev => prev.map(thread => ({
        ...thread,
        isSuggested: false,
        suggestedReason: undefined,
      })));
    }
  }, [suggestedThreadIds, suggestedDomain, suggestionReasons]);

  // Handle manual thread selection from user
  const handleThreadSelect = useCallback((threadTitle: string) => {
    hasManualSelection.current = true;
    setSelectedThread(threadTitle);
  }, []);

  // Get selected thread object
  // CRITICAL: When "Unorganized" is selected, always prioritize `thread_unorganized`
  // This prevents confusion when there are multiple threads with title "Unorganized"
  // (e.g., a renamed onboarding thread) - we should always use the virtual unorganized thread
  const getSelectedThread = useCallback((): Thread => {
    // Special case: when selecting "Unorganized", always use thread_unorganized
    if (selectedThread === 'Unorganized') {
      const unorganizedThread = threadOptions.find(thread => thread.id === 'thread_unorganized');
      if (unorganizedThread) {
        return unorganizedThread;
      }
      // Fallback to DEFAULT_UNORGANIZED_THREAD if not in options
      return DEFAULT_UNORGANIZED_THREAD;
    }
    // For other threads, find by title
    return threadOptions.find(thread => thread.title === selectedThread) || threadOptions[0] || DEFAULT_UNORGANIZED_THREAD;
  }, [threadOptions, selectedThread]);

  return {
    threadOptions,
    selectedThread,
    setSelectedThread,
    handleThreadSelect,
    getSelectedThread,
    loadThreads,
    setThreadOptions,
  };
}


import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import TiptapEditor, { convertScriptureReferencesToPills } from './TiptapEditor';
import ThreadCombobox from './ThreadCombobox';
import SquareButton from './SquareButton';
import ButtonSmall from './ButtonSmall';
import { formatReferenceForAPI } from '@/utils/scripture-detector';
import { useNavigation } from './navigation/NavigationContext';
import { captureException } from '@/utils/posthog';
import { navigate } from 'astro:transitions/client';
import { getThreadGradientCSS, getThreadTextColorCSS } from '@/utils/colors';

interface Thread {
  id: string;
  title: string;
  color: string | null;
  noteCount: number;
  backgroundGradient: string;
}

interface NewNotePanelProps {
  currentThread?: any;
  currentSpace?: any;
  onClose?: () => void;
}

export default function NewNotePanel({ currentThread, currentSpace, onClose }: NewNotePanelProps) {
  // Get navigation context - will use default (no-op) values if NavigationProvider not available
  const navigation = useNavigation();
  const { addToNavigationHistory, navigationHistory, trackNavigationAccess } = navigation;
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedThread, setSelectedThread] = useState('Unorganized');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nextNoteId, setNextNoteId] = useState('#New');
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  // Force note type to 'default' until designs are ready
  const [noteType, setNoteType] = useState<'default' | 'scripture' | 'resource'>('default');
  const [scriptureReference, setScriptureReference] = useState('');
  const [scriptureVersion, setScriptureVersion] = useState('NET'); // Default to NET Bible for MVP
  const [resourceUrl, setResourceUrl] = useState('');
  const [isFetchingVerse, setIsFetchingVerse] = useState(false);
  const [sourceNoteId, setSourceNoteId] = useState<string | null>(null);
  const [sourceSelectionFrom, setSourceSelectionFrom] = useState<number | null>(null);
  const [sourceSelectionTo, setSourceSelectionTo] = useState<number | null>(null);
  const [addToSpace, setAddToSpace] = useState(false);
  const [threadOptions, setThreadOptions] = useState<Thread[]>([
    {
      id: 'thread_unorganized',
      title: 'Unorganized',
      color: null,
      noteCount: 0,
      backgroundGradient: 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)'
    }
  ]);

  // Track if we've already set thread to prevent unnecessary updates
  // Note: currentThread always takes priority when available
  const [hasSetThreadFromSaved, setHasSetThreadFromSaved] = useState(false);
  // Track if we've initialized from currentThread to prevent resetting user's manual selection
  const hasInitializedFromCurrentThread = useRef(false);
  // Track if we're loading from localStorage to prevent auto-detection toast on mount
  const isLoadingFromLocalStorage = useRef(false);

  // Ref to store the TiptapEditor instance for focusing
  const editorRef = useRef<any>(null);

  // Handle editor ready callback - focus the editor when it's initialized
  const handleEditorReady = (editor: any) => {
    editorRef.current = editor;
    // Focus the editor and position cursor at the start
    // Use a small delay to ensure the editor is fully rendered
    setTimeout(() => {
      if (editor && !editor.isDestroyed) {
        editor.commands.focus();
        // Position cursor at the start of the document
        try {
          editor.commands.setTextSelection(0);
        } catch (e) {
          // If setTextSelection fails, just focus (cursor will be at start by default)
        }
      }
    }, 50);
  };

  // Load data from localStorage on mount - runs only once per mount
  // When component remounts with new key (from panelKey), this will run again
  useEffect(() => {
    const savedTitle = localStorage.getItem('newNoteTitle') || '';
    const savedContent = localStorage.getItem('newNoteContent') || '';
    const savedThreadId = localStorage.getItem('newNoteThread') || '';
    const savedNoteType = localStorage.getItem('newNoteType') as 'default' | 'scripture' | 'resource' | null;
    const savedScriptureRef = localStorage.getItem('newNoteScriptureReference') || '';
    const savedScriptureVersion = localStorage.getItem('newNoteScriptureVersion') || 'NET';
    const savedScriptureText = localStorage.getItem('newNoteScriptureText') || '';
    
    // Mark that we're loading from localStorage to prevent auto-detection toast
    isLoadingFromLocalStorage.current = true;
    
    // Load source note context for hyperlink creation
    const savedSourceNoteId = localStorage.getItem('newNoteSourceNoteId');
    const savedSourceSelectionFrom = localStorage.getItem('newNoteSourceSelectionFrom');
    const savedSourceSelectionTo = localStorage.getItem('newNoteSourceSelectionTo');
    
    if (savedSourceNoteId) {
      setSourceNoteId(savedSourceNoteId);
    }
    if (savedSourceSelectionFrom) {
      setSourceSelectionFrom(parseInt(savedSourceSelectionFrom, 10));
    }
    if (savedSourceSelectionTo) {
      setSourceSelectionTo(parseInt(savedSourceSelectionTo, 10));
    }
    
    // Set note type if detected from selection
    // IMPORTANT: Set noteType FIRST to prevent auto-detection from running
    if (savedNoteType === 'scripture') {
      setNoteType('scripture');
      if (savedScriptureRef) {
        // Keep original format (no divider in title)
        setScriptureReference(savedScriptureRef);
        // Set title after a brief delay to ensure noteType is set first
        // This prevents the auto-detection useEffect from running with noteType still 'default'
        setTimeout(() => {
          setTitle(savedScriptureRef); // Reference becomes title
          // Clear the flag after state updates complete
          setTimeout(() => {
            isLoadingFromLocalStorage.current = false;
          }, 100);
        }, 0);
      } else {
        // No scripture ref, clear flag immediately
        setTimeout(() => {
          isLoadingFromLocalStorage.current = false;
        }, 100);
      }
      if (savedScriptureVersion) {
        setScriptureVersion(savedScriptureVersion);
      }
      if (savedScriptureText) {
        setContent(savedScriptureText); // Verse text becomes content
      }
      // Clear after loading
      localStorage.removeItem('newNoteType');
      localStorage.removeItem('newNoteScriptureReference');
      localStorage.removeItem('newNoteScriptureVersion');
      localStorage.removeItem('newNoteScriptureText');
    } else {
      // Use saved title if not scripture
      if (savedTitle) {
        setTitle(savedTitle);
      }
      // Clear the flag after state updates complete
      setTimeout(() => {
        isLoadingFromLocalStorage.current = false;
      }, 100);
    }
    
    // Handle content setting for non-scripture notes
    // If we have saved content from selected text feature and it's not scripture, use it
    // Check savedNoteType (not the state) since we read it from localStorage
    if (savedNoteType !== 'scripture') {
      // Not scripture - check if we have saved content from selection
      if (savedContent) {
        setContent(savedContent);
        // Clear after loading to prevent re-loading on next open
        localStorage.removeItem('newNoteContent');
      } else {
        // No saved content - clear content field
        setContent('');
      }
    }
    // If it's scripture, content was already set above from savedScriptureText
    
    // Handle thread selection separately (depends on threadOptions being loaded)
    // Store savedThreadId in a way that the thread selection effect can use it
    if (savedThreadId) {
      // Store in a way that persists until threads are loaded
      localStorage.setItem('newNoteThreadPending', savedThreadId);
      localStorage.removeItem('newNoteThread');
    }
  }, []); // Empty deps - only run on mount

  // Initialize space checkbox when currentSpace is provided
  useEffect(() => {
    if (currentSpace && currentSpace.id) {
      setAddToSpace(true);
    }
  }, [currentSpace]);

  // Client-side thread detection from URL/navigation context
  const detectThreadFromContext = (): { id: string; title: string } | null => {
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
      // Check if it's a thread ID (starts with thread_ or is a valid thread ID format)
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
  };

  // Separate effect to handle currentThread when it becomes available
  // This handles the case where currentThread is null on mount but becomes available later
  useEffect(() => {
    if (currentThread && currentThread.id) {
      // If we haven't initialized yet, or if we're still on default "Unorganized" and currentThread is available
      if (!hasInitializedFromCurrentThread.current || 
          (selectedThread === 'Unorganized' && currentThread.id !== 'thread_unorganized')) {
        const matchingThread = threadOptions.find(thread => thread.id === currentThread.id);
        
        if (matchingThread && matchingThread.title !== selectedThread) {
          setSelectedThread(matchingThread.title);
          setHasSetThreadFromSaved(true);
          hasInitializedFromCurrentThread.current = true;
        } else if (currentThread.title && currentThread.title !== selectedThread && 
                   (!hasInitializedFromCurrentThread.current || selectedThread === 'Unorganized')) {
          // Use title directly if thread not in options yet
          setSelectedThread(currentThread.title);
          setHasSetThreadFromSaved(true);
          hasInitializedFromCurrentThread.current = true;
        }
      }
    }
  }, [currentThread, threadOptions, selectedThread]);

  // Handle thread selection when threadOptions are loaded
  // Priority: 1) currentThread (if available - initial default only), 2) client-side detection, 3) savedThreadId, 4) Unorganized
  useEffect(() => {
    // Priority 1: Use currentThread prop if available (only once, don't reset user's manual selection)
    if (currentThread && currentThread.id && !hasInitializedFromCurrentThread.current) {
      // Use currentThread even if it's 'thread_unorganized' - don't ignore it
      const matchingThread = threadOptions.find(thread => thread.id === currentThread.id);
      
      if (matchingThread) {
        // Found matching thread in options - use it
        if (matchingThread.title !== selectedThread) {
          setSelectedThread(matchingThread.title);
          setHasSetThreadFromSaved(true);
          hasInitializedFromCurrentThread.current = true;
        }
        return; // currentThread takes priority, don't check other sources
      }
      
      // Thread not found in options yet - might still be loading
      // Use currentThread.title directly if available (even if thread not in options yet)
      if (currentThread.title && currentThread.title !== selectedThread) {
        setSelectedThread(currentThread.title);
        setHasSetThreadFromSaved(true);
        hasInitializedFromCurrentThread.current = true;
        
        // Set up retry mechanism to find the thread in options once they load
        // This will be handled by the effect re-running when threadOptions updates
        return;
      }
    }
    
    // Priority 2: Client-side detection if currentThread prop is not available or not initialized
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
          // Use detected title even if thread not in options yet
          setSelectedThread(detectedThread.title);
          setHasSetThreadFromSaved(true);
          hasInitializedFromCurrentThread.current = true;
          return;
        }
      }
    }
    
    // Priority 3: Check for saved thread ID (from previous note creation or selection)
    // Only if we haven't already set from currentThread or client-side detection
    if (!hasSetThreadFromSaved && !hasInitializedFromCurrentThread.current) {
      // Wait for threads to be loaded before checking saved thread ID
      // Check if we have more than just the default unorganized thread
      const hasLoadedThreads = threadOptions.length > 1 || 
        (threadOptions.length === 1 && threadOptions[0]?.id === 'thread_unorganized');
      
      if (!hasLoadedThreads) {
        return; // Threads not loaded yet, wait
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
          // Clear the saved thread IDs after using them
          localStorage.removeItem('newNoteThread');
          localStorage.removeItem('newNoteThreadPending');
        }
      }
    }
    // Priority 4: Default to Unorganized (already set in initial state)
  }, [currentThread, threadOptions, hasSetThreadFromSaved, navigationHistory]); // Added navigationHistory for client-side detection


  // Save to localStorage when values change
  useEffect(() => {
    localStorage.setItem('newNoteTitle', title);
  }, [title]);

  useEffect(() => {
    localStorage.setItem('newNoteContent', content);
  }, [content]);

  useEffect(() => {
    // Only save to localStorage if not from savedThreadId (to avoid circular updates)
    if (!hasSetThreadFromSaved) {
      localStorage.setItem('newNoteThread', selectedThread);
    }
  }, [selectedThread, hasSetThreadFromSaved]);

  // Note: Thread selection is now handled in the main useEffect above
  // This ensures currentThread takes priority over saved thread IDs

  // Auto-detection: Detect scripture references ONLY in title (not content)
  // This allows users to type scripture references in content without triggering auto-detection
  useEffect(() => {
    // Only detect if note type is still default (don't override user's manual selection)
    if (noteType !== 'default') return;
    
    // Skip auto-detection if we're currently loading from localStorage
    // This prevents the toast from showing when loading saved scripture data
    if (isLoadingFromLocalStorage.current) return;

    // Only check title field, not content
    const titleToCheck = title.trim();
    if (titleToCheck.length < 5) return; // Need at least a book name and reference

    // Debounce detection (1 second after typing stops in title)
    const timeoutId = setTimeout(async () => {
      // Double-check we're not loading from localStorage (race condition protection)
      if (isLoadingFromLocalStorage.current) return;
      
      try {
        const response = await fetch('/api/scripture/detect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: titleToCheck }),
          credentials: 'include'
        });

        if (response.ok) {
          const detection = await response.json();
          
          if (detection.isScripture && detection.confidence >= 0.7 && detection.primaryReference) {
            
            // Fetch verse text
            setIsFetchingVerse(true);
            try {
              const verseResponse = await fetch('/api/scripture/fetch-verse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reference: detection.primaryReference }),
                credentials: 'include'
              });

              if (verseResponse.ok) {
                const verseData = await verseResponse.json();
                
                // Set note type to scripture
                setNoteType('scripture');
                // Set reference as title (keep original format, no divider)
                setTitle(detection.primaryReference);
                // Set verse text as content (only if content is empty or very short)
                if (!content || content.trim().length < 10 || content === '<p></p>' || content === '<p><br></p>') {
                  setContent(verseData.text);
                }
                // Set scripture reference (keep original format, no divider)
                setScriptureReference(detection.primaryReference);
                // Set version (NET for MVP)
                setScriptureVersion('NET');
                
                // Show toast notification (only if not loading from localStorage)
                if (!isLoadingFromLocalStorage.current) {
                  if (window.toast && typeof window.toast.info === 'function') {
                    window.toast.info('Made a scripture note for you');
                  } else {
                    // Fallback: dispatch custom event (shouldn't be needed but keep as backup)
                    window.dispatchEvent(new CustomEvent('toast', {
                      detail: {
                        message: 'Made a scripture note for you',
                        type: 'info'
                      }
                    }));
                  }
                }
              }
            } catch (verseError) {
              // Silently fail - don't interrupt UX
            } finally {
              setIsFetchingVerse(false);
            }
          }
        }
      } catch (error) {
        // Silently fail - don't interrupt UX
      }
    }, 1000); // 1 second debounce

    return () => clearTimeout(timeoutId);
  }, [title, noteType]); // Removed content from dependencies - only detect in title

  // Version change handler (for future - when multiple translations are supported)
  // Note: Currently only NET is supported, but structure is in place for future translations
  const versionChangeRef = useRef<string>(scriptureVersion);
  useEffect(() => {
    // Only re-fetch if note type is scripture, we have a reference, and version actually changed
    if (noteType !== 'scripture' || !scriptureReference) return;
    if (versionChangeRef.current === scriptureVersion) return; // Skip initial mount

    const fetchNewVersion = async () => {
      setIsFetchingVerse(true);
      try {
        // Convert display format to API format for the fetch
        const apiReference = formatReferenceForAPI(scriptureReference);
        const verseResponse = await fetch('/api/scripture/fetch-verse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reference: apiReference }),
          credentials: 'include'
        });

        if (verseResponse.ok) {
          const verseData = await verseResponse.json();
          setContent(verseData.text);
        }
      } catch (error) {
        // Error fetching verse with new version
      } finally {
        setIsFetchingVerse(false);
      }
    };

    // Debounce version change
    const timeoutId = setTimeout(() => {
      fetchNewVersion();
      versionChangeRef.current = scriptureVersion;
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [scriptureVersion, scriptureReference, noteType]);

  // Load threads from API
  const loadThreads = async () => {
    try {
      const response = await fetch('/api/threads/list', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const threads = await response.json();
        const formattedThreads = threads.map((thread: any) => ({
          id: thread.id,
          title: thread.title,
          color: thread.color,
          noteCount: thread.noteCount || 0,
          backgroundGradient: thread.backgroundGradient
        }));
        
        // Ensure 'Unorganized' thread exists - check by both title and ID
        const hasUnorganizedThread = formattedThreads.some((thread: Thread) => 
          thread.title === 'Unorganized' || thread.id === 'thread_unorganized'
        );
        
        if (!hasUnorganizedThread) {
          formattedThreads.unshift({
            id: 'thread_unorganized',
            title: 'Unorganized',
            color: null,
            noteCount: 0,
            backgroundGradient: 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)'
          });
        } else {
          // Find and log the unorganized thread to verify its count
          const unorganizedThread = formattedThreads.find((thread: Thread) => 
            thread.title === 'Unorganized' || thread.id === 'thread_unorganized'
          );
          if (unorganizedThread) {
          }
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
          // Clear the saved thread ID after using it
          localStorage.removeItem('newNoteThread');
        }
      }
    } catch (error) {
      // Error loading threads
    }
  };

  // Load next note ID
  const loadNextNoteId = async () => {
    try {
      const response = await fetch('/api/notes/next-id', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        setNextNoteId(`#${data.formattedId}`);
      }
    } catch (error) {
      // Error loading next note ID
    }
  };

  // Initialize data
  useEffect(() => {
    loadThreads();
    loadNextNoteId();
  }, []);

  // Listen for note count changes to refresh thread options
  useEffect(() => {
    const handleNoteCreated = (event: Event) => {
      const customEvent = event as CustomEvent;
      const note = customEvent.detail?.note;
      const threadId = note?.threadId;
      
      
      // Optimistically update thread count immediately
      if (threadId) {
        setThreadOptions(prev => prev.map(thread => 
          thread.id === threadId 
            ? { ...thread, noteCount: (thread.noteCount || 0) + 1 }
            : thread
        ));
      }
      
      // Refresh thread counts after a delay to ensure database is committed
      setTimeout(() => {
        loadThreads();
      }, 300);
    };

    const handleNoteDeleted = (event: Event) => {
      const customEvent = event as CustomEvent;
      const note = customEvent.detail?.note;
      const threadId = note?.threadId;
      
      
      // Optimistically update thread count immediately
      if (threadId) {
        setThreadOptions(prev => prev.map(thread => 
          thread.id === threadId 
            ? { ...thread, noteCount: Math.max(0, (thread.noteCount || 0) - 1) }
            : thread
        ));
      }
      
      // Refresh thread counts after a delay to ensure database is committed
      setTimeout(() => {
        loadThreads();
      }, 300);
    };

    const handleNoteRemovedFromThread = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { threadId } = customEvent.detail || {};
      
      
      // Optimistically update thread count immediately
      if (threadId) {
        setThreadOptions(prev => prev.map(thread => 
          thread.id === threadId 
            ? { ...thread, noteCount: Math.max(0, (thread.noteCount || 0) - 1) }
            : thread
        ));
      }
      
      // Refresh thread counts after a delay to ensure database is committed
      setTimeout(() => {
        loadThreads();
      }, 300);
    };

    const handleNoteAddedToThread = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { threadId } = customEvent.detail || {};
      
      
      // Optimistically update thread count immediately
      if (threadId) {
        setThreadOptions(prev => prev.map(thread => 
          thread.id === threadId 
            ? { ...thread, noteCount: (thread.noteCount || 0) + 1 }
            : thread
        ));
      }
      
      // Refresh thread counts after a delay to ensure database is committed
      setTimeout(() => {
        loadThreads();
      }, 300);
    };

    // Register event listeners
    window.addEventListener('noteCreated', handleNoteCreated);
    window.addEventListener('noteDeleted', handleNoteDeleted);
    window.addEventListener('noteRemovedFromThread', handleNoteRemovedFromThread);
    window.addEventListener('noteAddedToThread', handleNoteAddedToThread);

    // Cleanup
    return () => {
      window.removeEventListener('noteCreated', handleNoteCreated);
      window.removeEventListener('noteDeleted', handleNoteDeleted);
      window.removeEventListener('noteRemovedFromThread', handleNoteRemovedFromThread);
      window.removeEventListener('noteAddedToThread', handleNoteAddedToThread);
    };
  }, []); // Empty deps - loadThreads is stable

  // Add this useEffect to handle virtual keyboard
  useEffect(() => {
    const visualViewport = window.visualViewport;
    if (!visualViewport) return;

    const toolbar = document.querySelector('.tiptap-toolbar') as HTMLElement;
    if (!toolbar) return;

    const handleResize = () => {
      // When the virtual keyboard is shown, the visual viewport height decreases.
      const keyboardHeight = window.innerHeight - visualViewport.height;
      if (keyboardHeight > 150) { // Threshold to detect keyboard
        toolbar.style.position = 'fixed';
        toolbar.style.bottom = `${keyboardHeight}px`;
        toolbar.style.width = 'calc(100% - 2rem)'; // Adjust width to match container padding
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

  // Load Font Awesome for icons
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css';
    if (!document.querySelector(`link[href="${link.href}"]`)) {
      document.head.appendChild(link);
    }
  }, []);

  // Get selected thread object
  const getSelectedThread = () => {
    return threadOptions.find(thread => thread.title === selectedThread) || threadOptions[0];
  };

  // Cycle through note types - DISABLED until designs are ready
  const cycleNoteType = () => {
    // Note type switching is disabled until designs are ready
    return;
  };

  // Check if there are unsaved changes
  const hasUnsavedChanges = () => {
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();
    
    // Check if there's meaningful content (not just whitespace or empty HTML)
    const hasContent = trimmedContent && 
      trimmedContent !== '<p></p>' && 
      trimmedContent !== '<p><br></p>' &&
      trimmedContent !== '<br>';
    
    return trimmedTitle || hasContent;
  };

  // Listen for keyboard shortcut to save
  useEffect(() => {
    const handleSaveContent = (e: Event) => {
      // Only save if form has content and we're not already submitting
      // Check for unsaved changes inline to avoid dependency issues
      const trimmedTitle = title.trim();
      const trimmedContent = content.trim();
      const hasContent = trimmedContent && 
        trimmedContent !== '<p></p>' && 
        trimmedContent !== '<p><br></p>' &&
        trimmedContent !== '<br>';
      const hasChanges = trimmedTitle || hasContent;
      
      if (hasChanges && !isSubmitting && !showUnsavedDialog) {
        // Trigger form submission
        const form = document.querySelector('.new-note-panel form') as HTMLFormElement;
        if (form) {
          form.requestSubmit();
        }
      }
    };
    
    window.addEventListener('saveContent', handleSaveContent);
    return () => {
      window.removeEventListener('saveContent', handleSaveContent);
    };
  }, [title, content, isSubmitting, showUnsavedDialog]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent double submission - check at the very beginning
    if (isSubmitting) {
      return;
    }
    
    // Don't submit if dialog is open
    if (showUnsavedDialog) {
      return;
    }
    
    // Get content from TiptapEditor - prioritize React state
    let editorContent = content; // Start with React state as primary source

    // Only fallback to DOM queries if React state is empty/invalid
    if (!editorContent || editorContent.trim() === '' || editorContent === '<p></p>' || editorContent === '<p><br></p>') {
      // Method 2: Try to get from hidden input as fallback
      const hiddenInput = document.querySelector('#new-note-content') as HTMLInputElement;
      if (hiddenInput && hiddenInput.value && hiddenInput.value.trim() !== '' && hiddenInput.value !== '<p></p>') {
        editorContent = hiddenInput.value;
      }
      
      // Method 3: Try to get from TiptapEditor DOM as last resort
      if (!editorContent || editorContent.trim() === '') {
        const tiptapEditor = document.querySelector('.ProseMirror');
        if (tiptapEditor) {
          editorContent = tiptapEditor.innerHTML;
        }
      }
    }

    
    // Check for meaningful content based on note type
    const trimmedTitle = title.trim();
    const trimmedContent = editorContent.trim();
    const trimmedScriptureRef = scriptureReference.trim();
    const trimmedResourceUrl = resourceUrl.trim();
    
    // Check if there's meaningful content (not just whitespace or empty HTML)
    const hasContent = trimmedContent && 
      trimmedContent !== '<p></p>' && 
      trimmedContent !== '<p><br></p>' &&
      trimmedContent !== '<br>';
    
    // Type-specific validation
    if (noteType === 'default') {
      if (!trimmedTitle && !hasContent) {
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: 'Please add a title or content to your note',
            type: 'warning'
          }
        }));
        return;
      }
    } else if (noteType === 'scripture') {
      // Convert display format to API format for validation
      const apiReference = formatReferenceForAPI(trimmedScriptureRef);
      if (!apiReference.trim()) {
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: 'Please add a scripture reference (e.g., John 3:16)',
            type: 'warning'
          }
        }));
        return;
      }
      if (!hasContent) {
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: 'Please add your thoughts about this scripture',
            type: 'warning'
          }
        }));
        return;
      }
    } else if (noteType === 'resource') {
      if (!trimmedResourceUrl) {
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: 'Please add a resource URL',
            type: 'warning'
          }
        }));
        return;
      }
      if (!hasContent) {
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: 'Please add your thoughts about this resource',
            type: 'warning'
          }
        }));
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
        formData.set('title', scriptureReference); // Use scripture reference as title
      } else if (noteType === 'resource') {
        formData.set('title', resourceUrl); // Use URL as title
      }
      
      formData.set('content', editorContent);
      formData.set('threadId', getSelectedThread().id);
      formData.set('noteType', noteType);
      
      // Add spaceId if checkbox is checked and currentSpace exists
      if (addToSpace && currentSpace && currentSpace.id) {
        formData.set('spaceId', currentSpace.id);
      }
      
      // Add type-specific metadata
      if (noteType === 'scripture') {
        // Convert display format back to API format (commas for API)
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
          // Show toasts sequentially with small delay to avoid overwhelming UI
          result.scriptureResults.forEach((scriptureResult: any, index: number) => {
            setTimeout(() => {
              if (scriptureResult.action === 'created') {
                if (window.toast && typeof window.toast.info === 'function') {
                  window.toast.info(`Created scripture note: ${scriptureResult.reference}`);
                } else {
                  window.dispatchEvent(new CustomEvent('toast', {
                    detail: {
                      message: `Created scripture note: ${scriptureResult.reference}`,
                      type: 'info'
                    }
                  }));
                }
              } else if (scriptureResult.action === 'added') {
                if (window.toast && typeof window.toast.info === 'function') {
                  window.toast.info(`Added ${scriptureResult.reference} to this thread`);
                } else {
                  window.dispatchEvent(new CustomEvent('toast', {
                    detail: {
                      message: `Added ${scriptureResult.reference} to this thread`,
                      type: 'info'
                    }
                  }));
                }
              } else if (scriptureResult.action === 'unorganized') {
                if (window.toast && typeof window.toast.info === 'function') {
                  window.toast.info(`Scripture note ${scriptureResult.reference} exists in Unorganized`);
                } else {
                  window.dispatchEvent(new CustomEvent('toast', {
                    detail: {
                      message: `Scripture note ${scriptureResult.reference} exists in Unorganized`,
                      type: 'info'
                    }
                  }));
                }
              }
              // 'skipped' action doesn't show a toast (silent)
            }, index * 150); // 150ms delay between toasts
          });
        }
        
        // Get the actual thread ID (from junction table), not the legacy threadId field
        // This is the thread the note was actually added to
        const actualThreadId = getSelectedThread().id;
        
        // Add thread to navigation history before navigating (if not already present)
        // Always add it synchronously using thread data we already have - don't rely on async fetch
        // Only if NavigationProvider is available (addToNavigationHistory is not a no-op)
        if (result.note && actualThreadId && addToNavigationHistory) {
          // Get thread data from selected thread (the actual thread the note was added to)
          const selectedThreadData = getSelectedThread();
          const threadData = selectedThreadData || threadOptions.find(thread => thread.id === actualThreadId);
          
          if (threadData && actualThreadId !== 'thread_unorganized') {
            // Directly write to localStorage synchronously BEFORE calling addToNavigationHistory
            // This ensures localStorage is updated immediately, even if React state update is delayed
            try {
              const stored = localStorage.getItem('harvous-navigation-history-v2');
              let history = stored ? JSON.parse(stored) : [];
              
              // Find existing thread in history to preserve firstAccessed timestamp
              const existingIndex = history.findIndex((item: any) => item.id === threadData.id);
              
              let threadItem: any;
              if (existingIndex !== -1) {
                // Thread exists - update in place, preserving firstAccessed
                const existingItem = history[existingIndex];
                threadItem = {
                  ...existingItem,
                  id: threadData.id,
                  title: threadData.title,
                  count: (threadData.noteCount || 0) + 1,
                  backgroundGradient: threadData.backgroundGradient,
                  lastAccessed: Date.now()
                  // firstAccessed is preserved from existingItem via spread operator
                };
                // Update in place
                history[existingIndex] = threadItem;
              } else {
                // Thread doesn't exist - add new with firstAccessed timestamp
                threadItem = {
                  id: threadData.id,
                  title: threadData.title,
                  count: (threadData.noteCount || 0) + 1,
                  backgroundGradient: threadData.backgroundGradient,
                  firstAccessed: Date.now(),
                  lastAccessed: Date.now()
                };
                history.push(threadItem);
              }
              
              // Sort by firstAccessed to maintain chronological order
              history.sort((a: any, b: any) => a.firstAccessed - b.firstAccessed);
              
              // Limit to 10 items (keep oldest items based on firstAccessed)
              if (history.length > 10) {
                history = history.slice(0, 10);
              }
              
              // Write synchronously
              localStorage.setItem('harvous-navigation-history-v2', JSON.stringify(history));
              
              // Also store in sessionStorage as backup
              sessionStorage.setItem('harvous-pending-thread', JSON.stringify(threadItem));
              
              // Now call addToNavigationHistory to update React state (if available)
              // This will update the state, but localStorage is already written
              if (addToNavigationHistory) {
                // Pass item without firstAccessed/lastAccessed (addToNavigationHistory will handle those)
                addToNavigationHistory({
                  id: threadData.id,
                  title: threadData.title,
                  count: (threadData.noteCount || 0) + 1,
                  backgroundGradient: threadData.backgroundGradient
                });
              }
            } catch (error) {
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
          } else if (actualThreadId === 'thread_unorganized') {
            // Only add unorganized thread if note actually has no junction entries
            // (i.e., it was created without selecting a specific thread)
            // Use the same synchronous localStorage write pattern as regular threads
            try {
              const stored = localStorage.getItem('harvous-navigation-history-v2');
              let history = stored ? JSON.parse(stored) : [];
              
              // Find existing unorganized thread in history to preserve firstAccessed timestamp
              const existingIndex = history.findIndex((item: any) => item.id === 'thread_unorganized');
              
              let threadItem: any;
              if (existingIndex !== -1) {
                // Unorganized thread exists - update in place, preserving firstAccessed
                const existingItem = history[existingIndex];
                threadItem = {
                  ...existingItem,
                  id: 'thread_unorganized',
                  title: 'Unorganized',
                  count: (existingItem.count || 0) + 1, // Increment existing count
                  backgroundGradient: 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)',
                  lastAccessed: Date.now()
                  // firstAccessed is preserved from existingItem via spread operator
                };
                // Update in place
                history[existingIndex] = threadItem;
              } else {
                // Unorganized thread doesn't exist - add new with firstAccessed timestamp
                threadItem = {
                  id: 'thread_unorganized',
                  title: 'Unorganized',
                  count: 1, // At least 1 (the new note)
                  backgroundGradient: 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)',
                  firstAccessed: Date.now(),
                  lastAccessed: Date.now()
                };
                history.push(threadItem);
              }
              
              // Sort by firstAccessed to maintain chronological order
              history.sort((a: any, b: any) => a.firstAccessed - b.firstAccessed);
              
              // Limit to 10 items (keep oldest items based on firstAccessed)
              if (history.length > 10) {
                history = history.slice(0, 10);
              }
              
              // Write synchronously
              localStorage.setItem('harvous-navigation-history-v2', JSON.stringify(history));
              
              // Also store in sessionStorage as backup
              sessionStorage.setItem('harvous-pending-thread', JSON.stringify(threadItem));
              
              // Now call addToNavigationHistory to update React state
              // This will update the state, but localStorage is already written
              if (addToNavigationHistory) {
                // Pass item without firstAccessed/lastAccessed (addToNavigationHistory will handle those)
                addToNavigationHistory({
                  id: 'thread_unorganized',
                  title: 'Unorganized',
                  count: threadItem.count,
                  backgroundGradient: 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)'
                });
              }
            } catch (error) {
              // Fallback to just calling addToNavigationHistory
              if (addToNavigationHistory) {
                addToNavigationHistory({
                  id: 'thread_unorganized',
                  title: 'Unorganized',
                  count: 1, // At least 1 (the new note)
                  backgroundGradient: 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)'
                });
              }
            }
          }
        }
        
        // Dispatch note created event
        // Include the actual thread ID (from junction table), not the legacy threadId field
        window.dispatchEvent(new CustomEvent('noteCreated', {
          detail: { 
            note: result.note,
            actualThreadId: actualThreadId // The thread the note was actually added to via junction table
          }
        }));

        // Ensure localStorage is updated before navigation
        // Check that the thread was added to localStorage
        // Use actual thread ID, not legacy threadId field
        if (result.note && actualThreadId) {
          const verifyThreadInStorage = () => {
            try {
              const stored = localStorage.getItem('harvous-navigation-history-v2');
              if (stored) {
                const history = JSON.parse(stored);
                const threadExists = history.some((item: any) => item.id === actualThreadId);
                return threadExists;
              }
              return false;
            } catch (error) {
              return false;
            }
          };

          // Wait for localStorage to be updated (with timeout)
          let attempts = 0;
          const maxAttempts = 10;
          while (!verifyThreadInStorage() && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 10));
            attempts++;
          }

          if (!verifyThreadInStorage()) {
            // Thread not found in localStorage after adding, but proceeding with navigation
          }
        }

        // Create hyperlink in source note (default behavior when creating from selected text)
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
            
            // Clear source note context from localStorage
            localStorage.removeItem('newNoteSourceNoteId');
            localStorage.removeItem('newNoteSourceSelectionFrom');
            localStorage.removeItem('newNoteSourceSelectionTo');
            localStorage.removeItem('newNoteSourceSelectionPlainText');
        }

        // Wait longer to ensure localStorage write is complete and persisted
        // This is critical for full page reloads where the new page needs to read from localStorage immediately
        await new Promise(resolve => setTimeout(resolve, 200));

        // Navigate to the newly created note with toast parameter
        if (result.note && result.note.id) {
          const redirectUrl = `/${result.note.id}?toast=success&message=${encodeURIComponent(result.success || 'Note created successfully!')}`;
          navigate(redirectUrl, { history: 'replace' });
        }

        // Reset form
        setTitle('');
        setContent('');
        setSelectedThread('Unorganized');
        setIsSubmitting(false);
        
        // Clear localStorage
        localStorage.removeItem('newNoteTitle');
        localStorage.removeItem('newNoteContent');
        localStorage.removeItem('newNoteThread');
        
        // Refresh next note ID
        loadNextNoteId();
        
        // Close panel
        if (onClose) {
          onClose();
        }
      } else {
        const error = await response.json();
        
        if (window.toast) {
          window.toast.error(error.error || 'Error creating note');
        } else {
          alert(error.error || 'Error creating note');
        }
        
        setIsSubmitting(false);
      }
    } catch (error: any) {
      // Track error in PostHog
      if (typeof window !== 'undefined' && window.posthog) {
        captureException(error, {
          context: 'note_creation',
          endpoint: '/api/notes/create',
        });
      }
      
      if (window.toast) {
        window.toast.error(`Error creating note: ${error?.message || 'Please try again.'}`);
      } else {
        alert(`Error creating note: ${error?.message || 'Please try again.'}`);
      }
      
      setIsSubmitting(false);
    }
  };

  // Prevent body scroll when dialog is open
  useEffect(() => {
    if (showUnsavedDialog) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    // Cleanup on unmount
    return () => {
      document.body.style.overflow = '';
    };
  }, [showUnsavedDialog]);

  // Handle panel close
  const handleClose = () => {
    // Check for unsaved changes
    if (hasUnsavedChanges()) {
      setShowUnsavedDialog(true);
      return;
    }
    
    // No unsaved changes, close silently
    closePanel();
  };

  // Actually close the panel
  const closePanel = () => {
    localStorage.removeItem('newNoteTitle');
    localStorage.removeItem('newNoteContent');
    // Don't clear newNoteThread - preserve thread selection for next time
    setTitle('');
    setContent('');
    // Don't reset selectedThread - keep the current thread selection
    setIsSubmitting(false);
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
    // Try to save the note first
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
      
      formData.set('content', content);
      formData.set('threadId', getSelectedThread().id);
      formData.set('noteType', noteType);
      
      // Add type-specific metadata
      if (noteType === 'scripture') {
        // Convert display format back to API format (commas for API)
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
        
        // Show success toast
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: 'Note saved successfully!',
            type: 'success'
          }
        }));

        // Handle scripture results from the create endpoint
        // (The create endpoint already processes scripture and returns results)
        console.log('NewNotePanel: Create result:', result);
        if (result.scriptureResults) {
          console.log('NewNotePanel: Scripture results from create:', result.scriptureResults, 'Length:', result.scriptureResults.length);
          
          if (result.scriptureResults.length > 0) {
            // Show toasts for each scripture reference created or added
            for (const scriptureResult of result.scriptureResults) {
              console.log('NewNotePanel: Processing result:', scriptureResult);
              // Show toast for newly created notes
              if (scriptureResult.action === 'created') {
                const message = `Created scripture note: ${scriptureResult.reference}`;
                console.log('NewNotePanel: Dispatching toast for created:', scriptureResult.reference);
                
                // Dispatch event
                const event = new CustomEvent('toast', {
                  detail: { message, type: 'success' }
                });
                window.dispatchEvent(event);
                
                // Fallback: directly call toast if available
                if (window.toast && typeof window.toast.success === 'function') {
                  setTimeout(() => window.toast.success(message), 100);
                }
              } 
              // Show toast for notes added to thread
              else if (scriptureResult.action === 'added') {
                const message = `Added ${scriptureResult.reference} to this thread`;
                console.log('NewNotePanel: Dispatching toast for added:', scriptureResult.reference);
                
                // Dispatch event
                const event = new CustomEvent('toast', {
                  detail: { message, type: 'success' }
                });
                window.dispatchEvent(event);
                
                // Fallback: directly call toast if available
                if (window.toast && typeof window.toast.success === 'function') {
                  setTimeout(() => window.toast.success(message), 100);
                }
              }
            }
          } else {
            console.log('NewNotePanel: No scripture results to process');
          }
        } else {
          console.log('NewNotePanel: No scriptureResults in result');
        }

        // Navigate to the newly created note
        if (result.note && result.note.id) {
          setTimeout(() => {
            navigate(`/${result.note.id}`, { history: 'replace' });
          }, 100);
        }
      }
    } catch (error) {
      // Error saving note
    }
    
    // Close the panel regardless of save success
    closePanel();
  };

  return (
    <>
    <style>{`
      /* Heading styles for TiptapEditor in NewNotePanel - match editor styles */
      /* Remove :global() as these are plain inline styles, not CSS Modules */
      .new-note-panel .tiptap-content .ProseMirror h2 {
        font-size: 18px !important;
        font-weight: 600 !important;
        line-height: 1.3 !important;
        margin-top: 1.5em !important;
        margin-bottom: 0.75em !important;
        color: var(--color-deep-grey) !important;
        font-family: var(--font-sans) !important;
      }

      .new-note-panel .tiptap-content .ProseMirror h2:first-child {
        margin-top: 0 !important;
      }

      .new-note-panel .tiptap-content .ProseMirror h3 {
        font-size: 16px !important;
        font-weight: 600 !important;
        line-height: 1.4 !important;
        margin-top: 1.25em !important;
        margin-bottom: 0.625em !important;
        color: var(--color-deep-grey) !important;
        font-family: var(--font-sans) !important;
      }

      .new-note-panel .tiptap-content .ProseMirror h3:first-child {
        margin-top: 0 !important;
      }

      /* Horizontal rule styles for TiptapEditor in NewNotePanel */
      .new-note-panel .tiptap-content .ProseMirror hr {
        margin: 1.5em 0 !important;
        border: none !important;
        border-top: 1px solid #e5e5e5 !important;
        background: none !important;
        height: 1px !important;
        padding: 0 !important;
      }

      .new-note-panel .tiptap-content .ProseMirror hr:first-child {
        margin-top: 0 !important;
      }

      .new-note-panel .tiptap-content .ProseMirror hr:last-child {
        margin-bottom: 0 !important;
      }
    `}</style>
    <form 
      onSubmit={handleSubmit}
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
          selectedThread={selectedThread}
          onThreadSelect={setSelectedThread}
          threads={threadOptions}
          placeholder="Select thread..."
        />
      </div>

      {/* Space Checkbox - Only show when currentSpace is provided */}
      {currentSpace && currentSpace.id && (
        <div className="mb-3.5 shrink-0">
          <button
            type="button"
            onClick={() => setAddToSpace(!addToSpace)}
            className="space-button relative rounded-3xl h-[64px] cursor-pointer transition-[scale,shadow] duration-300 pl-4 pr-0 w-full"
            style={{ 
              backgroundImage: addToSpace 
                ? (currentSpace.backgroundGradient || getThreadGradientCSS(currentSpace.color || 'paper'))
                : 'var(--color-gradient-gray)'
            }}
          >
            <div className="flex items-center justify-between relative w-full h-full pl-2 pr-0 transition-transform duration-125">
              <span 
                className="font-sans text-[18px] font-semibold whitespace-nowrap"
                style={{ 
                  color: addToSpace 
                    ? getThreadTextColorCSS(currentSpace.color || 'paper')
                    : 'var(--color-deep-grey)'
                }}
              >
                Add to {currentSpace.title}
              </span>
              {addToSpace && (
                <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
                  <i 
                    className="fa-solid fa-check text-[20px]" 
                    style={{ color: getThreadTextColorCSS(currentSpace.color || 'paper') }}
                  />
                </div>
              )}
            </div>
          </button>
        </div>
      )}

      {/* Note Content - Type-specific layouts */}
      <div className="flex-1 flex flex-col min-h-0 mb-3.5">
        {noteType === 'default' && (
          <div className="bg-white box-border flex flex-col flex-1 min-h-0 items-start pb-3 pt-6 px-3 relative rounded-[24px] shadow-[0px_3px_20px_0px_rgba(120,118,111,0.1)]" style={{ maxHeight: '100%' }}>
            {/* Default Note Layout */}
            <div className="flex gap-3 items-center justify-center px-3 py-0 relative shrink-0 w-full">
              <div className="basis-0 font-sans font-semibold grow leading-[0] min-h-px min-w-px not-italic relative shrink-0 text-[var(--color-deep-grey)] text-[24px]">
                <input 
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => {
                    // Handle Select All (Cmd+A on Mac, Ctrl+A on Windows/Linux)
                    if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
                      e.preventDefault();
                      e.currentTarget.select();
                      return;
                    }
                    
                    // Auto-capitalize first letter
                    const input = e.currentTarget;
                    if (input.selectionStart === 0 && input.selectionEnd === 0) {
                      // Cursor is at the start
                      if (e.key.length === 1 && /^[a-z]$/.test(e.key)) {
                        e.preventDefault();
                        const capitalized = e.key.toUpperCase();
                        // If title is empty, set it to the capitalized letter
                        // Otherwise, insert the capitalized letter at the start
                        if (title.length === 0) {
                          setTitle(capitalized);
                        } else {
                          setTitle(capitalized + title);
                        }
                        // Set cursor position after the capitalized letter
                        setTimeout(() => {
                          input.setSelectionRange(1, 1);
                        }, 0);
                      }
                    }
                  }}
                  placeholder="Note title"
                  tabIndex={1}
                  className="w-full bg-transparent border-none text-[24px] font-semibold text-[var(--color-deep-grey)] focus:outline-none placeholder-[var(--color-pebble-grey)]"
                />
              </div>
              <div className="relative shrink-0 size-5" title="Note type switching disabled until designs are ready">
                <svg className="block max-w-none size-full text-[var(--color-deep-grey)] opacity-50" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
                </svg>
              </div>
            </div>
            
            <div className="flex-1 flex flex-col min-h-0 w-full" style={{ marginTop: '20px', maxHeight: '100%' }}>
              <div className="flex-1 flex flex-col min-h-0 px-3" style={{ height: 0, maxHeight: '100%', overflow: 'hidden' }}>
                <TiptapEditor
                  content={content}
                  id="new-note-content"
                  name="content"
                  placeholder="Type your note..."
                  tabindex={2}
                  minimalToolbar={false}
                  onEditorReady={handleEditorReady}
                  onContentChange={(newContent) => {
                    setContent(newContent);
                  }}
                />
              </div>
            </div>

            <div className="flex font-sans font-normal items-center justify-between leading-[0] not-italic px-3 py-0 relative shrink-0 text-[var(--color-stone-grey)] text-[12px] text-nowrap w-full" style={{ marginTop: '8px' }}>
              <div className="relative shrink-0">
                <p className="leading-[normal] text-nowrap whitespace-pre">Today</p>
              </div>
              <div className="relative shrink-0">
                <p className="leading-[normal] text-nowrap whitespace-pre">{nextNoteId}</p>
              </div>
            </div>
          </div>
        )}

        {/* Scripture note type */}
        {noteType === 'scripture' && (
          <div className="bg-white box-border flex flex-col flex-1 min-h-0 items-start pb-3 pt-6 px-3 relative rounded-[24px] shadow-[0px_3px_20px_0px_rgba(120,118,111,0.1)]" style={{ maxHeight: '100%' }}>
            {/* Scripture Note Layout */}
            <div className="flex gap-3 items-center justify-center px-3 py-0 relative shrink-0 w-full">
              <div className="basis-0 font-sans font-semibold grow leading-[0] min-h-px min-w-px not-italic relative shrink-0 text-[var(--color-deep-grey)] text-[24px]">
                <input 
                  type="text"
                  value={scriptureReference}
                  onChange={(e) => setScriptureReference(e.target.value)}
                  placeholder="Scripture reference (e.g., John 3:16)"
                  tabIndex={1}
                  className="w-full bg-transparent border-none text-[24px] font-semibold text-[var(--color-deep-grey)] focus:outline-none placeholder-[var(--color-pebble-grey)]"
                />
              </div>
              <div className="relative shrink-0 size-5" title="Note type switching disabled until designs are ready">
                <i className="fa-solid fa-scroll text-[var(--color-deep-grey)] text-[20px] opacity-50" />
              </div>
            </div>
            
            <div className="flex-1 flex flex-col min-h-0 w-full" style={{ marginTop: '20px', maxHeight: '100%' }}>
              <div className="flex-1 flex flex-col min-h-0 px-3" style={{ height: 0, maxHeight: '100%', overflow: 'hidden' }}>
                <TiptapEditor
                  content={content}
                  id="new-note-content"
                  name="content"
                  placeholder="Share your thoughts about this scripture..."
                  tabindex={2}
                  minimalToolbar={false}
                  onEditorReady={handleEditorReady}
                  onContentChange={(newContent) => {
                    setContent(newContent);
                  }}
                />
              </div>
            </div>

            <div className="flex font-sans font-normal items-center justify-between leading-[0] not-italic px-3 py-0 relative shrink-0 text-[var(--color-stone-grey)] text-[12px] text-nowrap w-full" style={{ marginTop: '8px' }}>
              <div className="relative shrink-0">
                <p className="leading-[normal] text-nowrap whitespace-pre">Today</p>
              </div>
              <div className="relative shrink-0">
                <p className="leading-[normal] text-nowrap whitespace-pre">{nextNoteId}</p>
              </div>
            </div>
          </div>
        )}

        {/* Resource note type - DISABLED until designs are ready */}
        {false && noteType === 'resource' && (
          <div className="bg-white box-border flex flex-col h-full items-start justify-between overflow-clip pb-3 pt-6 px-3 relative rounded-[24px] shadow-[0px_3px_20px_0px_rgba(120,118,111,0.1)]">
            {/* Resource Note Layout */}
            <div className="flex gap-3 items-center justify-center px-3 py-0 relative shrink-0 w-full">
              <div className="basis-0 font-sans font-semibold grow leading-[0] min-h-px min-w-px not-italic relative shrink-0 text-[var(--color-deep-grey)] text-[24px]">
                <input 
                  type="url"
                  value={resourceUrl}
                  onChange={(e) => setResourceUrl(e.target.value)}
                  placeholder="Resource URL"
                  tabIndex={1}
                  className="w-full bg-transparent border-none text-[24px] font-semibold text-[var(--color-deep-grey)] focus:outline-none placeholder-[var(--color-pebble-grey)]"
                />
              </div>
              <div className="relative shrink-0 size-5" title="Note type switching disabled until designs are ready">
                <i className="fa-solid fa-file-image text-[var(--color-deep-grey)] text-[20px] opacity-50" />
              </div>
            </div>
            
            <div className="flex-1 flex flex-col min-h-0 w-full" style={{ marginTop: '20px' }}>
              <div className="flex-1 flex flex-col min-h-0 px-3">
                <TiptapEditor
                  content={content}
                  id="new-note-content"
                  name="content"
                  placeholder="Share your thoughts about this resource..."
                  tabindex={2}
                  minimalToolbar={false}
                  onContentChange={(newContent) => {
                    setContent(newContent);
                  }}
                />
              </div>
            </div>

            <div className="flex font-sans font-normal items-center justify-between leading-[0] not-italic px-3 py-0 relative shrink-0 text-[var(--color-stone-grey)] text-[12px] text-nowrap w-full" style={{ marginTop: '8px' }}>
              <div className="relative shrink-0">
                <p className="leading-[normal] text-nowrap whitespace-pre">Today</p>
              </div>
              <div className="relative shrink-0">
                <p className="leading-[normal] text-nowrap whitespace-pre">{nextNoteId}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom buttons */}
      <div className="flex items-center justify-between gap-3 shrink-0">
        {/* Close button using SquareButton Close variant */}
        <SquareButton 
          variant="Close" 
          onClick={handleClose}
        />
        
        {/* Create Note button - Button Default variant */}
        <button 
          type="submit"
          disabled={isSubmitting}
          data-outer-shadow
          className="group relative rounded-3xl cursor-pointer transition-[scale,shadow] duration-300 pb-7 pt-6 px-6 flex items-center justify-center font-sans font-semibold text-[18px] leading-[0] text-nowrap text-[var(--color-fog-white)] h-[64px] flex-1 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: 'var(--color-bold-blue)' }}
          tabIndex={3}
        >
          <div className="relative shrink-0 transition-transform duration-125">
            {isSubmitting ? 'Creating...' : 'Create Note'}
          </div>
          <div className="absolute inset-0 pointer-events-none rounded-3xl transition-shadow duration-125 shadow-[0px_-8px_0px_0px_rgba(0,0,0,0.1)_inset] group-active:!shadow-[0px_-2px_0px_0px_rgba(0,0,0,0.1)_inset]" />
        </button>
      </div>
    </form>

    {/* Unsaved Changes Dialog - Rendered via Portal to ensure full viewport coverage */}
    {showUnsavedDialog && typeof document !== 'undefined' && createPortal(
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4 modal-overlay-enter"
        style={{
          paddingTop: 'max(1rem, env(safe-area-inset-top))',
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom))'
        }}
        onClick={(e) => {
          // Close dialog if clicking on the overlay (but not the dialog content)
          if (e.target === e.currentTarget) {
            setShowUnsavedDialog(false);
          }
        }}
      >
        <div 
          className="bg-white rounded-xl p-6 max-w-md w-full shadow-lg modal-content-enter"
          onClick={(e) => e.stopPropagation()}
          style={{ pointerEvents: 'auto' }}
        >
          <h3 className="text-lg font-semibold text-[var(--color-deep-grey)] mb-2">
            Unsaved Changes
          </h3>
          <p className="text-[var(--color-pebble-grey)] mb-6">
            You have unsaved changes. What would you like to do?
          </p>
          <div className="flex gap-3 justify-end">
            <ButtonSmall
              type="button"
              onClick={() => setShowUnsavedDialog(false)}
              state="Secondary"
            >
              Cancel
            </ButtonSmall>
            <ButtonSmall
              type="button"
              onClick={handleDiscardChanges}
              state="Delete"
            >
              Discard
            </ButtonSmall>
            <ButtonSmall
              type="button"
              onClick={handleSaveAndClose}
              state="Default"
            >
              Save & Close
            </ButtonSmall>
          </div>
        </div>
      </div>,
      document.body
    )}
    </>
  );
}

// Styles moved to global.css for immediate availability

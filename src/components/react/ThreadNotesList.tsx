import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import InfiniteScrollList from './InfiniteScrollList';
import CardNote from './CardNote';
import ActionButton from './ActionButton';
import EraseConfirmDialog from './EraseConfirmDialog';
import Icon from './Icon';

// Helper function to strip HTML tags
function stripHtml(html: string): string {
  if (!html) return '';
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

interface Note {
  id: string;
  title: string | null;
  content: string;
  noteType?: 'default' | 'scripture' | 'resource';
  updatedAt?: Date;
  createdAt?: Date;
  // Resource metadata (for resource note type)
  resourceTitle?: string | null;
  resourceDescription?: string | null;
  resourceImage?: string | null;
}

interface NoteTypeCounts {
  all: number;
  default: number;
  scripture: number;
  resource: number;
}

interface ThreadNotesListProps {
  initialNotes: Note[];
  threadId: string;
  noteTypeFilter?: 'all' | 'default' | 'scripture' | 'resource';
  noteTypeCounts?: NoteTypeCounts;
  'client:load'?: boolean;
  'client:visible'?: boolean;
  'client:idle'?: boolean;
  'client:only'?: string | boolean;
  [key: string]: any; // Allow Astro directives and other dynamic props
}

// Helper function to filter notes by type
// Matches OrganizedContentList.tsx line 307: item.noteType === 'default' || !item.noteType
function filterNotesByType(notes: Note[], filter?: 'all' | 'default' | 'scripture' | 'resource'): Note[] {
  if (!filter || filter === 'all') {
    return notes;
  }
  if (filter === 'default') {
    return notes.filter(note => note.noteType === 'default' || !note.noteType);
  }
  if (filter === 'scripture') {
    return notes.filter(note => note.noteType === 'scripture');
  }
  if (filter === 'resource') {
    return notes.filter(note => note.noteType === 'resource');
  }
  return notes;
}

// Helper function to sort notes by time (newest first)
// Uses updatedAt or createdAt (NOT lastVisited) to avoid showing notes as recently visited
// when only the thread was visited. lastVisited should only be used for display purposes
// or sorting across all threads (like in a "recent notes" view).
function sortNotesByTime(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    // Get sort time for each note, using updatedAt or createdAt (not lastVisited)
    const getSortTime = (note: Note): Date | null => {
      if (note.updatedAt) {
        return note.updatedAt instanceof Date ? note.updatedAt : new Date(note.updatedAt);
      }
      if (note.createdAt) {
        return note.createdAt instanceof Date ? note.createdAt : new Date(note.createdAt);
      }
      return null;
    };

    const aTime = getSortTime(a);
    const bTime = getSortTime(b);

    // Handle null cases - null times go after non-null times
    if (!aTime && !bTime) return 0;
    if (!aTime) return 1;
    if (!bTime) return -1;

    // Sort newest first (descending)
    return bTime.getTime() - aTime.getTime();
  });
}

export default function ThreadNotesList({ 
  initialNotes, 
  threadId,
  noteTypeFilter = 'all',
  noteTypeCounts
}: ThreadNotesListProps) {
  // Manage notes list state for real-time updates
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [deletedNoteIds, setDeletedNoteIds] = useState<Set<string>>(new Set());
  const deletedNoteIdsRef = useRef<Set<string>>(new Set());
  
  // State for delete confirmation dialog
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<Note | null>(null);

  // Keep ref in sync with state
  useEffect(() => {
    deletedNoteIdsRef.current = deletedNoteIds;
  }, [deletedNoteIds]);

  // Track total count for filter and accumulated filtered items count
  const totalCountForFilterRef = useRef<number>(0);
  const accumulatedFilteredCountRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  // Track the actual database offset (total notes fetched from API, not filtered)
  // This is critical because the API doesn't filter by type, so we need to track
  // how many notes we've actually fetched from the database
  const databaseOffsetRef = useRef<number>(0);

  // Track previous noteTypeFilter to detect filter changes
  const prevNoteTypeFilterRef = useRef<string>(noteTypeFilter);
  const isMountedRef = useRef<boolean>(true);
  const hasRefreshedOnMountRef = useRef<boolean>(false);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  
  // Update notes when initialNotes change (e.g., page navigation)
  // Filter by note type and initialize state
  useEffect(() => {
    const filtered = initialNotes
      .filter(note => !deletedNoteIds.has(note.id));
    
    // If noteTypeFilter is 'all', skip type filtering (notes are already pre-filtered on server)
    // Otherwise, apply the type filter
    const typeFiltered = noteTypeFilter === 'all' 
      ? filtered 
      : filterNotesByType(filtered, noteTypeFilter);
    
    // Deduplicate by note ID to prevent duplicates
    const uniqueNotes = Array.from(
      new Map(typeFiltered.map(note => [note.id, note])).values()
    );
    
    // Sort by time (newest first) to ensure proper animation order
    // This maintains chronological order regardless of note type
    const sortedNotes = sortNotesByTime(uniqueNotes);
    
    setNotes(sortedNotes);
    // Initialize accumulatedFilteredCountRef immediately with the filtered count
    accumulatedFilteredCountRef.current = sortedNotes.length;
    
    // Update database offset to reflect initial notes (total fetched from server, not filtered)
    databaseOffsetRef.current = initialNotes.length;
    
    // Update previous filter ref
    prevNoteTypeFilterRef.current = noteTypeFilter;
  }, [initialNotes, deletedNoteIds, noteTypeFilter]);

  // Listen for note deletion events
  useEffect(() => {
    const handleNoteDeleted = (event: CustomEvent) => {
      const { noteId, threadId: deletedThreadId } = event.detail;
      // Only remove if the note belongs to this thread or if threadId matches
      if (noteId && (deletedThreadId === threadId || !deletedThreadId)) {
        setDeletedNoteIds(prev => {
          const newSet = new Set([...prev, noteId]);
          deletedNoteIdsRef.current = newSet;
          return newSet;
        });
        // Remove from notes list immediately
        setNotes(prev => prev.filter(note => note.id !== noteId));
      }
    };

    window.addEventListener('noteDeleted', handleNoteDeleted as EventListener);

    return () => {
      window.removeEventListener('noteDeleted', handleNoteDeleted as EventListener);
    };
  }, [threadId]);

  // Use ref to track current notes without causing effect re-runs
  const notesRef = useRef<Note[]>(notes);
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  // Listen for note added to thread events
  useEffect(() => {
    const handleNoteAddedToThread = async (event: CustomEvent) => {
      const { noteId, threadId: eventThreadId } = event.detail;
      
      // Only process if this is the current thread
      if (eventThreadId === threadId && noteId) {
        // Check if note is already in the list using ref
        const noteExists = notesRef.current.some(note => note.id === noteId);
        if (noteExists) {
          return; // Already in list, skip
        }

        try {
          // Fetch note details
          const response = await fetch(`/api/notes/${noteId}/details`, {
            credentials: 'include'
          });

          if (response.ok) {
            const data = await response.json();
            const noteData = data.note; // Extract note from response
            const newNote: Note = {
              id: noteData.id,
              title: noteData.title,
              content: noteData.content,
              noteType: noteData.noteType,
              updatedAt: noteData.updatedAt ? new Date(noteData.updatedAt) : undefined,
              createdAt: noteData.createdAt ? new Date(noteData.createdAt) : undefined,
              resourceTitle: noteData.resourceTitle || null,
              resourceDescription: noteData.resourceDescription || null,
              resourceImage: noteData.resourceImage || null,
            };

            // Add note to the beginning of the list (most recent first)
            // Only add if it matches the current filter
            setNotes(prev => {
              // Check if note already exists (double-check with current state)
              if (prev.some(n => n.id === noteId)) {
                return prev;
              }
              
              // Check if note matches the current filter
              const matchesFilter = noteTypeFilter === 'all' 
                || (noteTypeFilter === 'default' && (newNote.noteType === 'default' || !newNote.noteType))
                || (noteTypeFilter === 'scripture' && newNote.noteType === 'scripture')
                || (noteTypeFilter === 'resource' && newNote.noteType === 'resource');
              
              if (!matchesFilter) {
                return prev; // Don't add if it doesn't match filter
              }
              
              // Add new note and deduplicate
              const newNotes = [newNote, ...prev];
              const uniqueNotes = Array.from(
                new Map(newNotes.map(note => [note.id, note])).values()
              );
              
              // Sort by time (newest first) to ensure proper animation order
              // This maintains chronological order regardless of note type
              return sortNotesByTime(uniqueNotes);
            });
          }
        } catch (error) {
          console.error('Error fetching note details:', error);
        }
      }
    };

    window.addEventListener('noteAddedToThread', handleNoteAddedToThread as unknown as EventListener);

    return () => {
      window.removeEventListener('noteAddedToThread', handleNoteAddedToThread as unknown as EventListener);
    };
  }, [threadId, noteTypeFilter]);

  // Listen for note removed from thread events
  useEffect(() => {
    const handleNoteRemovedFromThread = (event: CustomEvent) => {
      const { noteId, threadId: eventThreadId } = event.detail;
      
      // Only process if this is the current thread
      if (eventThreadId === threadId && noteId) {
        // Remove note from list immediately
        setNotes(prev => prev.filter(note => note.id !== noteId));
      }
    };

    window.addEventListener('noteRemovedFromThread', handleNoteRemovedFromThread as EventListener);

    return () => {
      window.removeEventListener('noteRemovedFromThread', handleNoteRemovedFromThread as EventListener);
    };
  }, [threadId]);

  // Track previous pathname to detect navigation TO thread
  const previousPathnameRef = useRef<string>(typeof window !== 'undefined' ? window.location.pathname : '');

  // Listen for note created events - refresh when note is created in current thread
  useEffect(() => {
    const handleNoteCreated = async (event: CustomEvent) => {
      const { note, actualThreadId } = event.detail;
      
      // Check if note was created in the current thread
      // Use actualThreadId if provided (from junction table), otherwise fall back to note.threadId
      // For unorganized thread: if actualThreadId is null/undefined and note has no threadId or threadId is unorganized, treat as unorganized
      let noteThreadId = actualThreadId;
      if (!noteThreadId) {
        // If actualThreadId is not provided, check note.threadId
        // If note.threadId is null/undefined, it means the note has no thread associations = unorganized
        noteThreadId = note?.threadId || (threadId === 'thread_unorganized' ? 'thread_unorganized' : null);
      }
      
      // For unorganized thread: also refresh if note has no thread associations (actualThreadId is null and note.threadId is null/undefined)
      const isUnorganizedNote = !actualThreadId && (!note?.threadId || note?.threadId === 'thread_unorganized');
      const matchesCurrentThread = noteThreadId === threadId || (isUnorganizedNote && threadId === 'thread_unorganized');
      
      if (matchesCurrentThread && note?.id) {
        // Check if note is already in the list
        const noteExists = notesRef.current.some(n => n.id === note.id);
        if (noteExists) {
          return; // Already in list, skip
        }

        // Refresh the notes list to get the newly created note
        // Add a small delay to ensure database is fully updated
        setTimeout(async () => {
          if (!isMountedRef.current) return;

          try {
            const url = new URL(`/api/threads/${threadId}/notes`, window.location.origin);
            url.searchParams.set('offset', '0');
            url.searchParams.set('limit', '100');

            const response = await fetch(url.toString(), {
              credentials: 'include',
              cache: 'no-store'
            });

            if (!response.ok) {
              console.error('[ThreadNotesList] Failed to refresh after note creation:', response.status);
              return;
            }

            const data = await response.json();
            const freshNotes = data.notes || [];

            if (!isMountedRef.current) return;

            // Filter out deleted notes
            const filtered = freshNotes.filter((note: Note) => !deletedNoteIdsRef.current.has(note.id));
            
            // Apply note type filter
            const typeFiltered = noteTypeFilter === 'all' 
              ? filtered 
              : filterNotesByType(filtered, noteTypeFilter);

            // Deduplicate by note ID
            const uniqueNotes = Array.from(
              new Map(typeFiltered.map((note: Note) => [note.id, note])).values()
            );

            // Sort by time (newest first) to ensure proper animation order
            // This maintains chronological order regardless of note type
            const sortedNotes = sortNotesByTime(uniqueNotes);

            setNotes(sortedNotes);
            accumulatedFilteredCountRef.current = sortedNotes.length;
            databaseOffsetRef.current = freshNotes.length;
          } catch (error) {
            console.error('[ThreadNotesList] Error refreshing notes after creation:', error);
          }
        }, 200); // Small delay to ensure database is updated
      }
    };

    window.addEventListener('noteCreated', handleNoteCreated as unknown as EventListener);

    return () => {
      window.removeEventListener('noteCreated', handleNoteCreated as unknown as EventListener);
    };
  }, [threadId, noteTypeFilter]);

  // Refresh notes on View Transitions navigation
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    let refreshTimeout: ReturnType<typeof setTimeout> | null = null;
    let isRefreshing = false;
    const DEBOUNCE_MS = 300;
    const IMMEDIATE_REFRESH_MS = 100; // Shorter delay when navigating TO thread

    const fetchFreshNotes = async (force = false) => {
      if (isRefreshing || !isMountedRef.current) return;
      
      const currentPath = window.location.pathname;
      const currentThreadId = currentPath.substring(1); // Remove leading '/'
      
      // Only refresh if we're on the correct thread page
      if (currentThreadId !== threadId) {
        return;
      }

      isRefreshing = true;
      
      try {
        // Add a small delay to ensure database is updated (especially after note creation)
        // Use shorter delay if force refresh (navigating TO thread)
        const dbDelay = force ? 150 : 50;
        await new Promise(resolve => setTimeout(resolve, dbDelay));

        if (!isMountedRef.current) {
          isRefreshing = false;
          return;
        }

        const url = new URL(`/api/threads/${threadId}/notes`, window.location.origin);
        url.searchParams.set('offset', '0');
        url.searchParams.set('limit', '100'); // Fetch enough to cover initial load

        const response = await fetch(url.toString(), {
          credentials: 'include',
          cache: 'no-store'
        });

        if (!response.ok) {
          console.error('[ThreadNotesList] Failed to refresh notes:', response.status);
          return;
        }

        const data = await response.json();
        const freshNotes = data.notes || [];

        if (!isMountedRef.current) return;

        // Filter out deleted notes
        const filtered = freshNotes.filter((note: Note) => !deletedNoteIdsRef.current.has(note.id));
        
        // Apply note type filter
        const typeFiltered = noteTypeFilter === 'all' 
          ? filtered 
          : filterNotesByType(filtered, noteTypeFilter);

        // Deduplicate by note ID
        const uniqueNotes = Array.from(
          new Map(typeFiltered.map((note: Note) => [note.id, note])).values()
        );

        // Sort by time (newest first) to ensure proper animation order
        // This maintains chronological order regardless of note type
        const sortedNotes = sortNotesByTime(uniqueNotes);

        setNotes(sortedNotes);
        accumulatedFilteredCountRef.current = sortedNotes.length;
        databaseOffsetRef.current = freshNotes.length;
      } catch (error) {
        console.error('[ThreadNotesList] Error refreshing notes:', error);
      } finally {
        isRefreshing = false;
      }
    };

    const handlePageLoad = () => {
      // Clear any pending refresh
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }

      const currentPath = window.location.pathname;
      const currentThreadId = currentPath.substring(1);
      const previousPath = previousPathnameRef.current;
      const previousThreadId = previousPath.substring(1);

      // Detect if we've navigated TO this thread (not just refreshed on it)
      const navigatedToThread = currentThreadId === threadId && previousThreadId !== threadId;
      // Detect if we navigated from a note page (likely after creating a note)
      const navigatedFromNote = previousPath.startsWith('/note_');

      // Use shorter delay if we navigated TO the thread (especially from a note page)
      const delay = (navigatedToThread && navigatedFromNote) ? IMMEDIATE_REFRESH_MS : DEBOUNCE_MS;
      const forceRefresh = navigatedToThread;

      // Debounce to prevent multiple rapid refreshes, but use shorter delay for navigation TO thread
      refreshTimeout = setTimeout(() => {
        refreshTimeout = null;
        fetchFreshNotes(forceRefresh);
      }, delay);

      // Update previous pathname for next navigation
      previousPathnameRef.current = currentPath;
    };

    // Initialize previous pathname on mount
    if (previousPathnameRef.current === '') {
      previousPathnameRef.current = window.location.pathname;
    }

    // Check if we're coming from a note page (full page reload scenario)
    // This handles the case where navigation used window.location.href (full reload)
    // or when View Transitions didn't fire astro:page-load
    // Works for both regular threads and unorganized thread
    const checkAndRefreshOnMount = () => {
      if (hasRefreshedOnMountRef.current) return;
      
      const referrer = document.referrer;
      const currentPath = window.location.pathname;
      const currentThreadId = currentPath.substring(1);
      
      // Only refresh if we're on the correct thread page (including unorganized)
      if (currentThreadId !== threadId) {
        return;
      }
      
      // Check if we came from a note page
      const cameFromNotePage = referrer && (
        referrer.includes('/note_') || 
        new URL(referrer).pathname.startsWith('/note_')
      );
      
      // Also check if previous pathname was a note (for View Transitions scenarios)
      const previousWasNote = previousPathnameRef.current.startsWith('/note_');
      
      if (cameFromNotePage || previousWasNote) {
        hasRefreshedOnMountRef.current = true;
        // Refresh with a delay to ensure database is updated
        // This works for both regular threads and unorganized thread
        setTimeout(() => {
          fetchFreshNotes(true);
        }, 200);
      }
    };

    // Check on mount (for full page reloads)
    checkAndRefreshOnMount();

    document.addEventListener('astro:page-load', handlePageLoad);
    // Also listen for before-preparation to track navigation start
    const handleBeforePreparation = () => {
      previousPathnameRef.current = window.location.pathname;
    };
    document.addEventListener('astro:before-preparation', handleBeforePreparation);

    return () => {
      document.removeEventListener('astro:page-load', handlePageLoad);
      document.removeEventListener('astro:before-preparation', handleBeforePreparation);
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }
    };
  }, [threadId, noteTypeFilter]);

  // Check if this is the unorganized thread
  const isUnorganizedThread = threadId === 'thread_unorganized';

  // Handle delete button click
  const handleDeleteClick = (e: React.MouseEvent, note: Note) => {
    e.preventDefault();
    e.stopPropagation();
    setNoteToDelete(note);
    setShowDeleteConfirm(true);
  };

  // Handle delete confirmation
  const handleConfirmDelete = async () => {
    if (!noteToDelete) return;

    setShowDeleteConfirm(false);
    
    try {
      const response = await fetch(`/api/notes/delete?noteId=${encodeURIComponent(noteToDelete.id)}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMessage = data.error || 'Failed to delete note';
        if ((window as any).toast) {
          (window as any).toast.error(errorMessage);
        } else {
          alert('Failed to delete note: ' + errorMessage);
        }
        setNoteToDelete(null);
        return;
      }

      if (data.success || response.status === 200) {
        // Dispatch noteDeleted event
        window.dispatchEvent(new CustomEvent('noteDeleted', {
          detail: { 
            noteId: noteToDelete.id,
            threadId: threadId
          }
        }));

        // Remove from local state
        setDeletedNoteIds(prev => {
          const newSet = new Set([...prev, noteToDelete.id]);
          deletedNoteIdsRef.current = newSet;
          return newSet;
        });
        setNotes(prev => prev.filter(note => note.id !== noteToDelete.id));

        // Show success message
        if ((window as any).toast) {
          (window as any).toast.success('Note erased!');
        }
      }

      setNoteToDelete(null);
    } catch (error) {
      console.error('Error deleting note:', error);
      if ((window as any).toast) {
        (window as any).toast.error('Failed to delete note');
      } else {
        alert('Failed to delete note. Please check the console for details.');
      }
      setNoteToDelete(null);
    }
  };

  // Handle delete cancellation
  const handleCancelDelete = () => {
    setShowDeleteConfirm(false);
    setNoteToDelete(null);
  };

  // Filter out deleted notes (note type filtering is already applied in state)
  const filteredNotes = notes.filter(note => !deletedNoteIds.has(note.id));

  // Calculate initial hasMore based on filtered items vs total count for the filter type
  const getTotalCountForFilter = (): number => {
    // If noteTypeFilter is 'all' and we have pre-filtered notes, use the length of initialNotes
    // This handles the case where notes are pre-filtered on the server
    if (noteTypeFilter === 'all' && initialNotes.length > 0) {
      return initialNotes.length;
    }
    
    if (!noteTypeCounts) {
      // Fallback: if no counts provided, assume there might be more if we have a full page
      return filteredNotes.length;
    }
    
    switch (noteTypeFilter) {
      case 'all':
        return noteTypeCounts.all;
      case 'default':
        return noteTypeCounts.default;
      case 'scripture':
        return noteTypeCounts.scripture;
      case 'resource':
        return noteTypeCounts.resource;
      default:
        return noteTypeCounts.all;
    }
  };

  const totalCountForFilter = getTotalCountForFilter();
  // hasMore is true if we have fewer filtered items than the total count for this filter type
  // This ensures we continue loading until all matching notes are loaded
  const initialHasMore = filteredNotes.length < totalCountForFilter;

  // Update refs when total count or filtered notes change
  // This ensures refs are always in sync with the actual filtered count
  useEffect(() => {
    totalCountForFilterRef.current = totalCountForFilter;
    // Always update accumulatedFilteredCountRef to match the actual filtered notes length
    // This is critical for accurate hasMore calculation in loadMore
    accumulatedFilteredCountRef.current = filteredNotes.length;
  }, [totalCountForFilter, filteredNotes.length]);


  const loadMore = useCallback(async (offset: number, limit: number) => {
    // Early return if we've already reached the expected count for this filter
    if (accumulatedFilteredCountRef.current >= totalCountForFilterRef.current && totalCountForFilterRef.current > 0) {
      return {
        items: [],
        hasMore: false
      };
    }
    
    // Use the database offset ref for API calls (since API doesn't filter by type)
    // The API needs to know how many total notes we've fetched, not how many filtered items we've displayed
    const dbOffset = databaseOffsetRef.current;
    
    const url = new URL(`/api/threads/${threadId}/notes`, window.location.origin);
    url.searchParams.set('offset', dbOffset.toString());
    url.searchParams.set('limit', limit.toString());

    const response = await fetch(url.toString(), {
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to load more notes');
    }

    const data = await response.json();
    
    // Update database offset to reflect how many notes we've now fetched total
    databaseOffsetRef.current = dbOffset + data.notes.length;
    
    // Filter out deleted notes from loaded notes using ref to get latest state
    const filteredDeleted = data.notes.filter((note: Note) => !deletedNoteIdsRef.current.has(note.id));
    // Apply note type filter
    const filteredByType = filterNotesByType(filteredDeleted, noteTypeFilter);
    
    // Get the current actual filtered count from the ref
    const currentActualFilteredCount = accumulatedFilteredCountRef.current;
    const newFilteredCount = currentActualFilteredCount + filteredByType.length;
    
    // Update the ref with the new count immediately
    accumulatedFilteredCountRef.current = newFilteredCount;
    
    // Determine hasMore based on whether we've reached the expected count for this filter type
    // Continue fetching until filteredNotes.length >= noteTypeCounts[noteTypeFilter]
    const hasReachedExpectedCount = newFilteredCount >= totalCountForFilterRef.current;
    
    // If we've reached the expected count, we're done
    if (hasReachedExpectedCount && totalCountForFilterRef.current > 0) {
      return {
        items: filteredByType,
        hasMore: false
      };
    }
    
    // We haven't reached the expected count yet
    // Continue loading until we reach the expected filtered count
    // Key fix: Set hasMore = true if filtered count < expected count, regardless of API's hasMore value
    // This ensures we continue loading until all matching notes are loaded
    // Stop only if:
    // 1. We've reached expected count, OR
    // 2. API returned no items (exhausted all items from database)
    const apiHasMore = data.hasMore;
    const gotNoItems = data.notes.length === 0;
    
    // Continue loading if we haven't reached expected count AND we haven't exhausted all items
    const hasMore = !hasReachedExpectedCount && !gotNoItems;
    
    return {
      items: filteredByType,
      hasMore
    };
  }, [threadId, noteTypeFilter]);

  // Handle items change from InfiniteScrollList (when loading more)
  const handleItemsChange = useCallback((newItems: Note[]) => {
    // Deduplicate by note ID to prevent duplicates
    const uniqueNotes = Array.from(
      new Map(newItems.map(note => [note.id, note])).values()
    );
    
    // Sort by time (newest first) to ensure proper animation order
    // This maintains chronological order regardless of note type, so animation delays
    // continue correctly (e.g., if items are [scripture, scripture, default, scripture],
    // they animate with delays [0ms, 50ms, 100ms, 150ms] in that order)
    const sortedNotes = sortNotesByTime(uniqueNotes);
    
    setNotes(sortedNotes);
    
    // Update accumulated filtered count based on actual filtered items
    const filtered = sortedNotes.filter(note => !deletedNoteIdsRef.current.has(note.id));
    const typeFiltered = filterNotesByType(filtered, noteTypeFilter);
    accumulatedFilteredCountRef.current = typeFiltered.length;
    // Note: databaseOffsetRef is updated in loadMore, not here
  }, [noteTypeFilter]);

  const renderItem = (note: Note, index: number) => {
    const isScriptureNote = note.noteType === 'scripture';
    const cleanContent = stripHtml(note.content);
    const truncatedContent = cleanContent.substring(0, 150) + (cleanContent.length > 150 ? "..." : "");

    return (
      <div 
        className={`content-item note-item card-enter ${isUnorganizedThread ? 'panel__item-list-item' : ''}`}
        style={{ animationDelay: `${index * 50}ms` }}
      >
        <a 
          href={`/${note.id}`}
          className={`block transition-transform duration-200 active:scale-[0.99] ${isUnorganizedThread ? 'panel__item-list-item-link' : ''}`}
          style={{ touchAction: 'manipulation' }}
        >
          {isScriptureNote ? (
            // Condensed/mini version for scripture notes (matching AddToSpaceSection NoteItem)
            <div
              className="relative cursor-pointer"
              style={{
                position: 'relative',
                borderRadius: '0.75rem',
                height: '48px',
                width: '100%',
                textAlign: 'left',
                backgroundColor: 'white',
                boxShadow: 'none',
                transition: 'transform 0.2s',
                cursor: 'pointer'
              }}
            >
              {/* Accent bar on left */}
              <div 
                style={{ 
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: 0,
                  width: '2.75rem',
                  borderTopLeftRadius: '0.75rem',
                  borderBottomLeftRadius: '0.75rem',
                  overflow: 'hidden',
                  backgroundColor: 'var(--color-light-paper)'
                }}
              />
              
              {/* Content */}
              <div 
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1.5rem',
                  paddingLeft: '0.75rem',
                  paddingRight: '3rem',
                  height: '100%',
                  overflow: 'hidden'
                }}
              >
                {/* Note type icon - scroll icon with opacity */}
                <div style={{ position: 'relative', flexShrink: 0, width: '1.25rem', height: '1.25rem' }}>
                  <Icon name="scroll" size={20} style={{ color: 'var(--color-deep-grey)', opacity: 0.3 }} />
                </div>
                
                {/* Text content - only title */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: 0 }}>
                  {/* Title */}
                  <div style={{ 
                    fontFamily: 'var(--font-sans)', 
                    fontWeight: 700, 
                    color: 'var(--color-deep-grey)', 
                    fontSize: '16px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {note.title || 'Untitled Note'}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // Full CardNote for non-scripture notes
            <CardNote 
              title={note.noteType === 'resource' && note.resourceTitle ? note.resourceTitle : (note.title || "Untitled Note")}
              content={note.noteType === 'resource' && note.resourceDescription ? note.resourceDescription : truncatedContent}
              noteType={(note.noteType as 'default' | 'scripture' | 'resource' | undefined) || 'default'}
              resourceTitle={note.noteType === 'resource' ? (note.resourceTitle || null) : undefined}
              resourceDescription={note.noteType === 'resource' ? (note.resourceDescription || null) : undefined}
              resourceImage={note.noteType === 'resource' ? (note.resourceImage || null) : undefined}
            />
          )}
        </a>
        
        {/* Delete button - only show on unorganized thread and on hover */}
        {isUnorganizedThread && (
          <ActionButton
            variant="default"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleDeleteClick(e, note);
            }}
            aria-label="Delete note"
            className="panel__item-list-item-actions"
          >
            <svg 
              viewBox="0 0 576 512" 
              xmlns="http://www.w3.org/2000/svg"
              style={{ width: '16px', height: '16px', fill: 'var(--color-pebble-grey)' }}
            >
              <path d="M290.7 57.4L57.4 290.7c-25 25-25 65.5 0 90.5l80 80c12 12 28.3 18.7 45.3 18.7L288 480l9.4 0L512 480c17.7 0 32-14.3 32-32s-14.3-32-32-32l-124.1 0L518.6 285.3c25-25 25-65.5 0-90.5L381.3 57.4c-25-25-65.5-25-90.5 0zM297.4 416l-9.4 0-105.4 0-80-80L227.3 211.3 364.7 348.7 297.4 416z"/>
            </svg>
          </ActionButton>
        )}
      </div>
    );
  };

  return (
    <>
      <div ref={containerRef} style={{ paddingBottom: '12px' }}>
        <InfiniteScrollList
          initialItems={filteredNotes}
          items={filteredNotes}
          onItemsChange={handleItemsChange}
          loadMore={loadMore}
          renderItem={renderItem}
          itemKey={(note) => note.id}
          limit={20}
          className="flex flex-col gap-3"
          initialHasMore={initialHasMore}
          minimumExpectedCount={totalCountForFilter}
        />
      </div>

      {/* Delete Confirmation Dialog - Rendered via Portal */}
      {showDeleteConfirm && noteToDelete && typeof document !== 'undefined' && createPortal(
        <div
          className="modal-overlay-enter"
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '1rem',
            backgroundColor: 'rgba(0, 0, 0, 0.35)',
            paddingTop: 'max(1rem, env(safe-area-inset-top))',
            paddingBottom: 'max(1rem, env(safe-area-inset-bottom))'
          }}
          onClick={(e) => {
            // Close dialog if clicking on the overlay (but not the dialog content)
            if (e.target === e.currentTarget) {
              handleCancelDelete();
            }
          }}
        >
          <div 
            className="modal-content-enter"
            onClick={(e) => e.stopPropagation()}
            style={{ 
              backgroundColor: 'white',
              borderRadius: '0.75rem',
              padding: '1.5rem',
              maxWidth: '28rem',
              width: '100%',
              pointerEvents: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
            }}
          >
            <h3 style={{
              fontSize: '1.125rem',
              fontWeight: 600,
              color: 'var(--color-deep-grey)',
              marginBottom: '0.5rem'
            }}>
              Erase Note?
            </h3>
            <p style={{
              color: 'var(--color-pebble-grey)',
              marginBottom: '1.5rem'
            }}>
              Are you sure you want to permanently erase this note? This action cannot be undone. The note will be permanently removed from your Harvous.
            </p>
            <EraseConfirmDialog
              contentType="note"
              onCancel={handleCancelDelete}
              onConfirm={handleConfirmDelete}
            />
          </div>
        </div>,
        document.body
      )}
    </>
  );
}


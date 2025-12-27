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
function filterNotesByType(notes: Note[], filter?: 'all' | 'default' | 'scripture' | 'resource'): Note[] {
  if (!filter || filter === 'all') {
    return notes;
  }
  return notes.filter(note => {
    const noteType = note.noteType || 'default';
    return noteType === filter;
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
  const isFetchingAllNotesRef = useRef<boolean>(false);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  
  // Watch for filter changes and fetch all notes for the selected filter type
  // Similar to how OrganizedContentList handles scripture tab
  useEffect(() => {
    // Only fetch if filter just changed (not on every render)
    if (prevNoteTypeFilterRef.current !== noteTypeFilter) {
      // Store the current filter value to check against in async callback
      const currentFilter = noteTypeFilter;
      prevNoteTypeFilterRef.current = noteTypeFilter;
      isFetchingAllNotesRef.current = true;
      
      const fetchAllNotesForFilter = async () => {
        try {
          const url = new URL(`/api/threads/${threadId}/notes`, window.location.origin);
          url.searchParams.set('offset', '0');
          url.searchParams.set('limit', '200'); // Large limit to get all notes at once

          const response = await fetch(url.toString(), {
            credentials: 'include'
          });

          if (!response.ok) {
            throw new Error(`Failed to load notes: ${response.status}`);
          }

          const data = await response.json();
          
          // Filter out deleted notes
          const filteredDeleted = data.notes.filter((note: Note) => !deletedNoteIdsRef.current.has(note.id));
          // Apply note type filter
          const filteredByType = filterNotesByType(filteredDeleted, currentFilter);
          
          // Deduplicate by note ID
          const uniqueNotes = Array.from(
            new Map(filteredByType.map((note: Note) => [note.id, note])).values()
          );
          
          // Only update if still mounted and filter hasn't changed again
          if (isMountedRef.current && prevNoteTypeFilterRef.current === currentFilter) {
            setNotes(uniqueNotes);
            // Update refs to reflect all loaded notes
            accumulatedFilteredCountRef.current = uniqueNotes.length;
            databaseOffsetRef.current = data.notes.length; // Track total fetched from API
          }
        } catch (error) {
          console.error('[ThreadNotesList] Error loading notes for filter:', error);
        } finally {
          isFetchingAllNotesRef.current = false;
        }
      };
      
      fetchAllNotesForFilter();
    }
  }, [noteTypeFilter, threadId]);
  
  // Update notes when initialNotes change (e.g., page navigation)
  // Skip if filter just changed or we're fetching all notes (the filter useEffect handles fetching all notes)
  useEffect(() => {
    // Skip updating from initialNotes if filter just changed or we're fetching all notes
    // The filter useEffect handles fetching all notes when filter changes
    if (prevNoteTypeFilterRef.current !== noteTypeFilter || isFetchingAllNotesRef.current) {
      return;
    }
    
    const filtered = initialNotes
      .filter(note => !deletedNoteIds.has(note.id));
    const typeFiltered = filterNotesByType(filtered, noteTypeFilter);
    // Deduplicate by note ID to prevent duplicates
    const uniqueNotes = Array.from(
      new Map(typeFiltered.map(note => [note.id, note])).values()
    );
    setNotes(uniqueNotes);
    // Initialize accumulatedFilteredCountRef immediately with the filtered count
    accumulatedFilteredCountRef.current = uniqueNotes.length;
    
    // Update database offset to reflect initial notes
    databaseOffsetRef.current = initialNotes.length;
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
              const noteType = newNote.noteType || 'default';
              const matchesFilter = noteTypeFilter === 'all' || noteType === noteTypeFilter;
              
              if (!matchesFilter) {
                return prev; // Don't add if it doesn't match filter
              }
              
              // Insert at the beginning for immediate visibility
              // Deduplicate just to be safe
              const newNotes = [newNote, ...prev];
              return Array.from(
                new Map(newNotes.map(note => [note.id, note])).values()
              );
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
  // Always set to true if we're below expected count, to ensure we load more
  const initialHasMore = filteredNotes.length < totalCountForFilter;
  
  // Also check if we have fewer initial notes than the total (for "all" filter)
  // This ensures we load more even if filtering hasn't reduced the count yet
  const hasFewerInitialNotes = noteTypeFilter === 'all' && initialNotes.length < (noteTypeCounts?.all || 0);
  const shouldHaveMore = initialHasMore || hasFewerInitialNotes;

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
    // This handles the case where all notes were fetched upfront when filter changed
    if (accumulatedFilteredCountRef.current >= totalCountForFilterRef.current && totalCountForFilterRef.current > 0) {
      return {
        items: [],
        hasMore: false
      };
    }
    
    // Use the database offset ref instead of the filtered offset
    // The API doesn't filter by type, so we need to track how many notes we've
    // actually fetched from the database, not how many match our filter
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
    
    // Get the current actual filtered count from the current items state
    // This is more reliable than using the ref which might be stale
    const currentActualFilteredCount = accumulatedFilteredCountRef.current;
    const newFilteredCount = currentActualFilteredCount + filteredByType.length;
    
    // Update the ref with the new count immediately
    accumulatedFilteredCountRef.current = newFilteredCount;
    
    // Determine hasMore accounting for filtering and expected count
    const hasReachedExpectedCount = newFilteredCount >= totalCountForFilterRef.current;
    
    // If we've reached the expected count, we're done
    if (hasReachedExpectedCount) {
      return {
        items: filteredByType,
        hasMore: false
      };
    }
    
    // We haven't reached the expected count yet
    // Keep loading if:
    // 1. The API says there are more items, OR
    // 2. We got a full batch (limit items) - there might be more items ahead, OR
    // 3. We got a full batch but filtering reduced it (meaning there might be more filtered items ahead)
    // 
    // IMPORTANT: Do NOT return hasMore: true just because we got some notes back (data.notes.length > 0)
    // This causes infinite loops when API says hasMore: false but we got the last batch
    // Only return hasMore: true if there's a reasonable chance of more items
    const apiHasMore = data.hasMore;
    const gotFullBatch = data.notes.length === limit;
    const mightHaveMoreFiltered = gotFullBatch && filteredByType.length < limit && noteTypeFilter !== 'all';
    
    // Only keep loading if we haven't reached expected count AND there's a reasonable chance of more items
    // Stop if API says no more AND we got fewer than limit (we've reached the end)
    const hasMore = !hasReachedExpectedCount && (apiHasMore || gotFullBatch || mightHaveMoreFiltered);
    
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
    setNotes(uniqueNotes);
    
    // Update accumulated filtered count based on actual filtered items
    const filtered = uniqueNotes.filter(note => !deletedNoteIdsRef.current.has(note.id));
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

  // Force hasMore to be true if we're below expected count
  // This ensures auto-load triggers even if the API says there are no more
  const forceHasMore = filteredNotes.length < totalCountForFilter;

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
          initialHasMore={forceHasMore || shouldHaveMore}
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


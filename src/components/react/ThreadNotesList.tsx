import React, { useState, useEffect, useRef, useCallback } from 'react';
import InfiniteScrollList from './InfiniteScrollList';
import CardNote from './CardNote';

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
  noteType?: string;
  updatedAt?: Date;
  createdAt?: Date;
}

interface ThreadNotesListProps {
  initialNotes: Note[];
  threadId: string;
}

export default function ThreadNotesList({ 
  initialNotes, 
  threadId 
}: ThreadNotesListProps) {
  // Manage notes list state for real-time updates
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [deletedNoteIds, setDeletedNoteIds] = useState<Set<string>>(new Set());
  const deletedNoteIdsRef = useRef<Set<string>>(new Set());

  // Keep ref in sync with state
  useEffect(() => {
    deletedNoteIdsRef.current = deletedNoteIds;
  }, [deletedNoteIds]);

  // Update notes when initialNotes change (e.g., page navigation)
  useEffect(() => {
    const filtered = initialNotes.filter(note => !deletedNoteIds.has(note.id));
    setNotes(filtered);
  }, [initialNotes, deletedNoteIds]);

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
            };

            // Add note to the beginning of the list (most recent first)
            setNotes(prev => {
              // Check if note already exists (double-check with current state)
              if (prev.some(n => n.id === noteId)) {
                return prev;
              }
              
              // Insert at the beginning for immediate visibility
              return [newNote, ...prev];
            });
          }
        } catch (error) {
          console.error('Error fetching note details:', error);
        }
      }
    };

    window.addEventListener('noteAddedToThread', handleNoteAddedToThread as EventListener);

    return () => {
      window.removeEventListener('noteAddedToThread', handleNoteAddedToThread as EventListener);
    };
  }, [threadId]);

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

  // Filter out deleted notes
  const filteredNotes = notes.filter(note => !deletedNoteIds.has(note.id));

  const loadMore = useCallback(async (offset: number, limit: number) => {
    const url = new URL(`/api/threads/${threadId}/notes`, window.location.origin);
    url.searchParams.set('offset', offset.toString());
    url.searchParams.set('limit', limit.toString());

    const response = await fetch(url.toString(), {
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to load more notes');
    }

    const data = await response.json();
    // Filter out deleted notes from loaded notes using ref to get latest state
    const filteredNotes = data.notes.filter((note: Note) => !deletedNoteIdsRef.current.has(note.id));
    return {
      items: filteredNotes,
      hasMore: data.hasMore
    };
  }, [threadId]);

  // Handle items change from InfiniteScrollList (when loading more)
  const handleItemsChange = useCallback((newItems: Note[]) => {
    setNotes(newItems);
  }, []);

  const renderItem = (note: Note, index: number) => {
    const cleanContent = stripHtml(note.content);
    const truncatedContent = cleanContent.substring(0, 150) + (cleanContent.length > 150 ? "..." : "");

    return (
      <div 
        className="content-item note-item card-enter"
        style={{ animationDelay: `${index * 50}ms` }}
      >
        <a 
          href={`/${note.id}`}
          className="block transition-transform duration-200 active:scale-[0.99]"
          style={{ touchAction: 'manipulation' }}
        >
          <CardNote 
            title={note.title || "Untitled Note"}
            content={truncatedContent}
            noteType={note.noteType || 'default'}
          />
        </a>
      </div>
    );
  };

  return (
    <InfiniteScrollList
      initialItems={filteredNotes}
      items={filteredNotes}
      onItemsChange={handleItemsChange}
      loadMore={loadMore}
      renderItem={renderItem}
      itemKey={(note) => note.id}
      limit={20}
      className="flex flex-col gap-3"
    />
  );
}


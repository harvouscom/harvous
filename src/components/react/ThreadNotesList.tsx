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
  const [deletedNoteIds, setDeletedNoteIds] = useState<Set<string>>(new Set());
  const deletedNoteIdsRef = useRef<Set<string>>(new Set());

  // Keep ref in sync with state
  useEffect(() => {
    deletedNoteIdsRef.current = deletedNoteIds;
  }, [deletedNoteIds]);

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
      }
    };

    window.addEventListener('noteDeleted', handleNoteDeleted as EventListener);

    return () => {
      window.removeEventListener('noteDeleted', handleNoteDeleted as EventListener);
    };
  }, [threadId]);

  // Filter out deleted notes from initialNotes
  const filteredInitialNotes = initialNotes.filter(note => !deletedNoteIds.has(note.id));

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
          className="block transition-transform duration-200 hover:scale-[1.002]"
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
      initialItems={filteredInitialNotes}
      loadMore={loadMore}
      renderItem={renderItem}
      itemKey={(note) => note.id}
      limit={20}
      className="flex flex-col gap-3"
    />
  );
}


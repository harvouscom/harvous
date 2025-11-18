import React from 'react';
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
  const loadMore = async (offset: number, limit: number) => {
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
    return {
      items: data.notes,
      hasMore: data.hasMore
    };
  };

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
      initialItems={initialNotes}
      loadMore={loadMore}
      renderItem={renderItem}
      itemKey={(note) => note.id}
      limit={20}
      className="flex flex-col gap-3"
    />
  );
}


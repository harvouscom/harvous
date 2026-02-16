import { useEffect } from 'react';
import { useParams } from '@tanstack/react-router';
import { useNote } from '../hooks/queries/useNote';
import CardFullEditable from '../../../src/components/react/CardFullEditable';
import { useNavigation } from '../hooks/queries/useNavigation';
import { updateNoteOffline } from '../../../src/utils/offline-mutations';

export default function NotePage() {
  const { noteId: noteSlug } = useParams({ strict: false }) as { noteId: string };
  // URL param is the slug (e.g. "def456"); DB + API need the full prefixed ID
  const noteId = noteSlug.startsWith('note_') ? noteSlug : `note_${noteSlug}`;
  const { data: note, isLoading } = useNote(noteId);
  const { data: _nav } = useNavigation(); // kept warm for nav sidebar

  // The parent thread is the first thread this note belongs to (if any)
  const parentThread = note?.threads?.[0];
  const parentThreadId = parentThread?.id ?? undefined;

  // Set up the global save callback that CardFullEditable relies on
  useEffect(() => {
    if (!noteId) return;

    (window as any).noteSaveCallback = async function(newTitle: string, newContent: string) {
      // OFFLINE-FIRST: update IndexedDB immediately
      try {
        const userId = (window as any).__harvous_userId || localStorage.getItem('harvous-user-id');
        if (userId) {
          await updateNoteOffline(userId, noteId, { title: newTitle, content: newContent });
        }
      } catch (err) {
        console.error('[NotePage] Failed to update note offline:', err);
      }

      // Push to server
      const response = await fetch('/api/notes/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ noteId, title: newTitle, content: newContent }),
      });

      if (!response.ok) {
        throw new Error('Failed to update note');
      }

      const result = await response.json();

      window.dispatchEvent(new CustomEvent('noteUpdated', { detail: { noteId } }));

      return result;
    };

    return () => {
      // Clean up when leaving the note page
      (window as any).noteSaveCallback = undefined;
    };
  }, [noteId]);

  if (isLoading) {
    return <div className="page-loading" />;
  }

  if (!note) {
    return <div className="page-error">Note not found.</div>;
  }

  // Format date for display (CardFullEditable expects a readable string)
  const formattedDate = note.createdAt
    ? new Date(note.createdAt).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  return (
    // Wrapper div provides data attributes that CardFullEditable reads from the DOM
    <div
      data-note-id={noteId}
      {...(parentThreadId ? {
        'data-parent-thread-id': parentThreadId,
        'data-parent-thread-title': parentThread?.title ?? '',
        'data-parent-thread-background-gradient': parentThread?.backgroundGradient ?? '',
      } : {})}
      style={{ display: 'contents' }}
    >
      <CardFullEditable
        title={note.title || 'Untitled Note'}
        content={note.content ?? ''}
        date={formattedDate}
        noteId={noteId}
        noteType={(note.noteType || 'default') as 'default' | 'scripture' | 'resource'}
        version={note.version}
        resourceTitle={note.resourceTitle ?? undefined}
        resourceDescription={note.resourceDescription ?? undefined}
        resourceImage={note.resourceImage ?? undefined}
        resourceUrl={note.resourceUrl ?? undefined}
        isEditable={true}
        contentEncrypted={note.contentEncrypted ?? false}
        className="h-full flex-1 min-h-0"
      />
    </div>
  );
}

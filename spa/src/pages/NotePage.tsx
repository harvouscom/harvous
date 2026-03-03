import { useEffect, useRef } from 'react';
import { useParams } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { useNote } from '../hooks/queries/useNote';
import CardFullEditable from '../../../src/components/react/CardFullEditable';
import { useNavigation } from '../hooks/queries/useNavigation';
import { useUpdateNote } from '../hooks/mutations/useUpdateNote';
import { useProcessScriptureRefs } from '../hooks/mutations/useProcessScriptureRefs';
import { updateNoteOffline } from '../../../src/utils/offline-mutations';
import { detectScriptureReferences } from '@/utils/scripture-detector';
import { debug } from '@/utils/logger';

export default function NotePage() {
  const { noteId: noteSlug } = useParams({ strict: false }) as { noteId: string };
  // URL param is the slug (e.g. "def456"); DB + API need the full prefixed ID
  const noteId = noteSlug.startsWith('note_') ? noteSlug : `note_${noteSlug}`;
  const { user } = useUser();
  const { data: note, isLoading } = useNote(noteId);
  const { data: _nav } = useNavigation(); // kept warm for nav sidebar
  const queryClient = useQueryClient();
  const updateNoteMutation = useUpdateNote();
  const processScriptureMutation = useProcessScriptureRefs();

  // Notes in shared spaces that the current user did not add are view-only (member view).
  const isNoteOwner = !!(user?.id && note?.userId && note.userId === user.id);
  const isEditable = isNoteOwner;

  // Invalidate the note query when lock state changes (e.g. after removeLock)
  // so the fresh contentEncrypted value is fetched and CardFullEditable doesn't loop.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.noteId && String(detail.noteId) === String(noteId)) {
        queryClient.invalidateQueries({ queryKey: ['note', noteId] });
      }
    };
    window.addEventListener('noteLockStateChanged', handler);
    return () => window.removeEventListener('noteLockStateChanged', handler);
  }, [noteId, queryClient]);

  // When opening a note that has scripture refs but no pill markup (e.g. onboarding or legacy notes),
  // or has pending pills (from deferred create), run scripture processing once then refetch.
  const reprocessAttemptedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!note || isLoading || note.contentEncrypted) return;
    const content = note.content ?? '';
    if (!content || typeof content !== 'string') return;
    if (reprocessAttemptedRef.current === noteId) return;

    const hasPills = content.includes('data-scripture-reference');
    const hasPendingPills = content.includes('data-note-id="pending"');
    if (hasPills && !hasPendingPills) return; // Already has real pill IDs

    const runReprocess = () => {
      reprocessAttemptedRef.current = noteId;
      const parentThread = note.threads?.[0];
      const threadId = parentThread?.id ?? undefined;
      processScriptureMutation.mutate(
        { noteId, contentOverride: content, threadId },
        {
          onError: () => {
            reprocessAttemptedRef.current = null; // Allow retry on next mount
          },
        }
      );
    };

    if (hasPendingPills) {
      runReprocess();
      return;
    }

    // No pills: check for plain-text scripture refs (legacy/onboarding)
    const plainText = content
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const refs = detectScriptureReferences(plainText);
    if (refs.length === 0) return;
    runReprocess();
  }, [note, noteId, isLoading, processScriptureMutation]);

  // The parent thread is the first thread this note belongs to (if any)
  const parentThread = note?.threads?.[0];
  const parentThreadId = parentThread?.id ?? undefined;

  // Update navigation history with parent thread count/spaceId when note loads
  // so the left nav badge shows the correct count (e.g. when opening note without visiting thread page first).
  useEffect(() => {
    const parent = note?.threads?.[0];
    if (!parent?.id || typeof (window as any).addToNavigationHistory !== 'function') return;
    const threadWithMeta = parent as { count?: number; spaceId?: string | null };
    (window as any).addToNavigationHistory({
      id: parent.id,
      title: parent.id === 'thread_unorganized' ? 'Unorganized' : (parent.title ?? 'Thread'),
      count: threadWithMeta.count ?? 0,
      backgroundGradient: parent.backgroundGradient ?? 'var(--color-gradient-gray)',
      spaceId: threadWithMeta.spaceId ?? null,
      openedInSpaceIds: [threadWithMeta.spaceId ?? null],
    });
  }, [note]);

  // Diagnostic (dev): log whether note content has scripture pill markup (helps distinguish "no pills in content" vs "pills not rendering" for member view).
  useEffect(() => {
    if (!note?.content) return;
    const content = note.content;
    const hasPillMarkup = typeof content === 'string' && content.includes('data-scripture-reference');
    debug('[NotePage] scripture pill diagnostic', { noteId, hasPillMarkup, contentLength: content?.length });
  }, [noteId, note?.content]);

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

      // Push to server via mutation (handles cache invalidation + noteUpdated event)
      return updateNoteMutation.mutateAsync({ noteId, title: newTitle, content: newContent });
    };

    return () => {
      // Clean up when leaving the note page
      (window as any).noteSaveCallback = undefined;
    };
  }, [noteId]);

  if (isLoading && !note) {
    // Skeleton only when we have no cached data; if we have cached note (e.g. from list seed or prefetch), show it while refetching
    return <div className="card-full h-full flex-1 min-h-0" />;
  }

  if (!note) {
    return <div className="page-error">Note not found.</div>;
  }

  // Format date for display (CardFullEditable expects a readable string).
  // Hard-coded month names avoid iOS PWA ignoring the 'en-US' locale hint.
  const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const formattedDate = note.createdAt
    ? (() => { const d = new Date(note.createdAt!); return `${MONTHS_LONG[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`; })()
    : '';

  return (
    // Wrapper div provides data attributes that CardFullEditable reads from the DOM
    <div
      data-note-id={noteId}
      {...(parentThreadId ? {
        'data-parent-thread-id': parentThreadId,
        'data-parent-thread-title': parentThread?.title ?? '',
        'data-parent-thread-background-gradient': parentThread?.backgroundGradient ?? '',
        'data-parent-thread-count': String((parentThread as { count?: number }).count ?? 0),
        'data-parent-thread-space-id': (parentThread as { spaceId?: string | null }).spaceId ?? '',
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
        contentEncrypted={note.contentEncrypted ?? false}
        isEditable={isEditable}
        className="h-full flex-1 min-h-0"
      />
    </div>
  );
}

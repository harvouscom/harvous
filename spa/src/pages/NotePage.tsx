import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useRouterState } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { useNote } from '../hooks/queries/useNote';
import CardFullEditable from '../../../src/components/react/CardFullEditable';
import SubtleContentMount from '@/components/react/SubtleContentMount';
import { useNavigation } from '../hooks/queries/useNavigation';
import { useUpdateNote } from '../hooks/mutations/useUpdateNote';
import { useProcessScriptureRefs } from '../hooks/mutations/useProcessScriptureRefs';
import { updateNoteOffline } from '../../../src/utils/offline-mutations';
import { detectScriptureReferences } from '@/utils/scripture-detector';
import { debug } from '@/utils/logger';
import { MY_PILE_THREAD_TITLE } from '@/utils/my-pile-thread';
import '../styles/note-editor-chrome.css';

function getThreadIdFromSearch(search: string | Record<string, unknown> | undefined): string | null {
  if (search == null) return null;
  if (typeof search === 'object') {
    const t = (search as Record<string, unknown>).thread;
    return typeof t === 'string' && t.startsWith('thread_') ? t : null;
  }
  const raw = typeof search === 'string' ? search : '';
  const params = new URLSearchParams(raw.startsWith('?') ? raw : `?${raw}`);
  const thread = params.get('thread');
  return thread && thread.startsWith('thread_') ? thread : null;
}

function getCollectionFromSearch(search: string | Record<string, unknown> | undefined): string | undefined {
  if (search == null) return undefined;
  if (typeof search === 'object') {
    const c = (search as Record<string, unknown>).collection;
    return typeof c === 'string' ? c : undefined;
  }
  const raw = typeof search === 'string' ? search : '';
  const params = new URLSearchParams(raw.startsWith('?') ? raw : `?${raw}`);
  return params.get('collection') ?? undefined;
}

function getSpaceIdFromSearch(search: string | Record<string, unknown> | undefined): string | null {
  if (search == null) return null;
  if (typeof search === 'object') {
    const space = (search as Record<string, unknown>).space;
    return typeof space === 'string' && space.startsWith('space_') ? space : null;
  }
  const raw = typeof search === 'string' ? search : '';
  const params = new URLSearchParams(raw.startsWith('?') ? raw : `?${raw}`);
  const space = params.get('space');
  return space && space.startsWith('space_') ? space : null;
}

export default function NotePage() {
  const { noteId: noteSlug } = useParams({ strict: false }) as { noteId: string };
  // URL param is the slug (e.g. "def456"); DB + API need the full prefixed ID
  const noteId = noteSlug.startsWith('note_') ? noteSlug : `note_${noteSlug}`;
  const { user } = useUser();
  const { data: note, isLoading } = useNote(noteId);
  const { data: _nav } = useNavigation(); // kept warm for nav sidebar
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const search = useRouterState({ select: (s) => s.location.search });
  const urlThreadId = useMemo(() => {
    let id = getThreadIdFromSearch(search);
    if (!id && typeof window !== 'undefined') {
      try {
        const fromUrl = new URLSearchParams(window.location.search).get('thread');
        if (fromUrl && fromUrl.startsWith('thread_')) id = fromUrl;
      } catch { /* ignore */ }
    }
    return id;
  }, [search]);
  const urlSpaceId = useMemo(() => {
    let id = getSpaceIdFromSearch(search);
    if (!id && typeof window !== 'undefined') {
      try {
        const fromUrl = new URLSearchParams(window.location.search).get('space');
        if (fromUrl && fromUrl.startsWith('space_')) id = fromUrl;
      } catch { /* ignore */ }
    }
    return id;
  }, [search]);
  const collectionNavContext = useMemo(() => {
    let raw = getCollectionFromSearch(search);
    if (raw === undefined && typeof window !== 'undefined') {
      try {
        raw = new URLSearchParams(window.location.search).get('collection') ?? undefined;
      } catch {
        /* ignore */
      }
    }
    if (raw === undefined) return { type: 'home' as const };
    if (raw === '' || raw === '__ungrouped__') return { type: 'collection' as const, name: null };
    return { type: 'collection' as const, name: raw };
  }, [search]);
  const updateNoteMutation = useUpdateNote();
  const processScriptureMutation = useProcessScriptureRefs();

  const [formatToolbarHostEl, setFormatToolbarHostEl] = useState<HTMLDivElement | null>(null);
  const [scriptureChromeHostEl, setScriptureChromeHostEl] = useState<HTMLDivElement | null>(null);
  const [highlightChromeHostEl, setHighlightChromeHostEl] = useState<HTMLDivElement | null>(null);
  const [noteActionsHostEl, setNoteActionsHostEl] = useState<HTMLDivElement | null>(null);
  const [chromeMode, setChromeMode] = useState<'format' | 'scripture' | 'highlight' | 'noteActions'>('noteActions');

  useEffect(() => {
    setChromeMode('noteActions');
  }, [noteId]);

  // Notes in shared spaces that the current user did not add are view-only (member view).
  // Welcome thread onboarding pack notes: read-only in the card like scripture notes (CardFullEditable readOnlyLikeScripture); API also rejects edits.
  const isNoteOwner = !!(user?.id && note?.userId && note.userId === user.id);
  const isEditable = isNoteOwner;

  // Invalidate the note query when lock state or content changes externally
  // (e.g. after removeLock, or after a scripture pill's translation is changed
  // via the inline picker — the update-translation API updates the note content
  // on the server, then dispatches 'noteUpdated' so the cache is refreshed
  // before the user navigates here).
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.noteId && String(detail.noteId) === String(noteId)) {
        queryClient.invalidateQueries({ queryKey: ['note', noteId] });
      }
    };
    window.addEventListener('noteLockStateChanged', handler);
    window.addEventListener('noteUpdated', handler);
    return () => {
      window.removeEventListener('noteLockStateChanged', handler);
      window.removeEventListener('noteUpdated', handler);
    };
  }, [noteId, queryClient]);

  // After removing this note from the thread it was opened in, replace ?thread= with the next membership (or My Pile).
  const noteThreadFromUrlRef = useRef<string | null>(null);
  const noteSpaceIdRef = useRef<string | null>(null);
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<{ noteId?: string; threadId?: string; remainingThreadIds?: string[]; skipNavigation?: boolean }>).detail;
      if (d?.skipNavigation) return;
      if (!d?.noteId || String(d.noteId) !== String(noteId)) return;
      const removedThreadId = d.threadId;
      if (!removedThreadId) return;

      let urlThread: string | null = null;
      if (typeof window !== 'undefined') {
        try {
          const t = new URLSearchParams(window.location.search).get('thread');
          if (t?.startsWith('thread_')) urlThread = t;
        } catch { /* ignore */ }
      }
      if (!urlThread) urlThread = noteThreadFromUrlRef.current;
      if (urlThread !== null && urlThread !== removedThreadId) return;

      const remaining = Array.isArray(d.remainingThreadIds) ? d.remainingThreadIds : [];
      const nextThread = remaining[0] ?? 'thread_unorganized';

      const noteSlug = noteId.startsWith('note_') ? noteId.slice('note_'.length) : noteId;
      navigate({
        to: '/note/$noteId' as any,
        params: { noteId: noteSlug } as any,
        search: (prev: any) => ({ ...prev, thread: nextThread }),
        replace: true,
      });
      queryClient.invalidateQueries({ queryKey: ['note', noteId] });
    };
    window.addEventListener('noteRemovedFromThread', handler);
    return () => window.removeEventListener('noteRemovedFromThread', handler);
  }, [noteId, navigate, queryClient]);

  // Capture ?thread= / ?space= when note id or URL query context changes (same note can
  // be opened from another thread/space without remounting).
  useEffect(() => {
    noteThreadFromUrlRef.current = urlThreadId;
    noteSpaceIdRef.current = urlSpaceId;
  }, [noteId, urlThreadId, urlSpaceId]);

  // When opening a note that has scripture refs but no pill markup (e.g. onboarding or legacy notes),
  // or has pending pills (from deferred create), run scripture processing once then refetch.
  const reprocessAttemptedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!note || isLoading || note.contentEncrypted) return;
    const content = note.content ?? '';
    if (!content || typeof content !== 'string') return;
    if (reprocessAttemptedRef.current === noteId) return;

    const hasPills = content.includes('data-scripture-reference');
    const hasPendingPills = /data-note-id\s*=\s*["']pending["']/.test(content);
    if (hasPills && !hasPendingPills) return; // Already has real pill IDs

    const runReprocess = () => {
      reprocessAttemptedRef.current = noteId;
      const threads = note.threads ?? [];
      let threadIdFromUrl: string | null = urlThreadId;
      if (typeof window !== 'undefined' && !threadIdFromUrl) {
        try {
          const t = new URLSearchParams(window.location.search).get('thread');
          if (t?.startsWith('thread_')) threadIdFromUrl = t;
        } catch { /* ignore */ }
      }
      if (!threadIdFromUrl) threadIdFromUrl = noteThreadFromUrlRef.current;
      const parentThread =
        (threadIdFromUrl && threads.find((th) => th.id === threadIdFromUrl)) ?? threads[0];
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
  }, [note, noteId, isLoading, processScriptureMutation, urlThreadId]);

  // Parent thread: prefer ?thread= (multi-note membership) over API order (threads[0]).
  // When the API returns no threads (e.g. rare member edge) but the URL has ?thread=, keep that context.
  const parentThread = useMemo(() => {
    const threads = note?.threads ?? [];
    let threadId: string | null = urlThreadId;
    if (!threadId && typeof window !== 'undefined') {
      try {
        const fromUrl = new URLSearchParams(window.location.search).get('thread');
        if (fromUrl?.startsWith('thread_')) threadId = fromUrl;
      } catch { /* ignore */ }
    }
    if (!threadId) threadId = noteThreadFromUrlRef.current;
    if (threads.length) {
      const match = threadId && threads.find((th) => th.id === threadId);
      return match ?? threads[0];
    }
    if (threadId) {
      const isUnorganized = threadId === 'thread_unorganized';
      return {
        id: threadId,
        title: isUnorganized ? MY_PILE_THREAD_TITLE : 'Thread',
        color: null,
        backgroundGradient: isUnorganized ? 'var(--color-paper)' : 'var(--color-gradient-gray)',
      };
    }
    return undefined;
  }, [note?.threads, noteId, urlThreadId]);
  const parentThreadId = parentThread?.id ?? undefined;

  // Note detail API includes threadId on the row, but seeded list cache often only has threads[].
  // Resolve Welcome thread from parentThreadId, API threadId, or any membership — otherwise readOnlyLikeScripture stays false and the card stays editable.
  const isOnboardingReadonly = useMemo(() => {
    const apiThreadId =
      note && typeof note === 'object' && 'threadId' in note
        ? (note as { threadId?: string | null }).threadId ?? undefined
        : undefined;
    const resolved =
      parentThreadId ??
      apiThreadId ??
      note?.threads?.find((th) => th.id.startsWith('thread_onboarding_'))?.id ??
      note?.threads?.[0]?.id;
    if (resolved?.startsWith('thread_onboarding_')) return true;
    return note?.threads?.some((th) => th.id.startsWith('thread_onboarding_')) ?? false;
  }, [parentThreadId, note]);

  // Align localStorage thread cache with resolved parent (?thread=) so fallbacks in
  // CardFullEditable / Tiptap / nav match the thread the user opened from, not threads[0].
  useEffect(() => {
    if (!parentThread?.id || !noteId) return;
    try {
      localStorage.setItem(`harvous-note-thread-${noteId}`, parentThread.id);
    } catch { /* ignore */ }
    const tw = parentThread as { count?: number; spaceId?: string | null };
    try {
      localStorage.setItem(
        `harvous-note-thread-data-${noteId}`,
        JSON.stringify({
          id: parentThread.id,
          title: parentThread.title ?? '',
          noteCount: tw.count ?? 0,
          backgroundGradient: parentThread.backgroundGradient ?? 'var(--color-gradient-gray)',
          spaceId: tw.spaceId ?? null,
        })
      );
    } catch { /* ignore */ }
  }, [parentThread, noteId]);

  // Update navigation history with parent thread count/spaceId when note loads
  // so the left nav badge shows the correct count (e.g. when opening note without visiting thread page first).
  useEffect(() => {
    const parent = parentThread;
    if (!parent?.id || typeof (window as any).addToNavigationHistory !== 'function') return;
    const threadWithMeta = parent as { count?: number; spaceId?: string | null };
    // Skip update if note data is from seeded cache with fallback title ('Thread').
    // The real API data will load shortly and trigger this effect again with correct data.
    // This prevents overwriting a good existing history entry with default values.
    const isUnorganized = parent.id === 'thread_unorganized';
    const hasRealTitle = isUnorganized || (parent.title && parent.title !== 'Thread');
    if (!hasRealTitle) return;
    const spaceId = threadWithMeta.spaceId ?? (() => {
      try {
        const stored = localStorage.getItem('harvous-selected-space-id');
        return stored && stored.startsWith('space_') ? stored : null;
      } catch { return null; }
    })();
    const openedInSpaceId = noteSpaceIdRef.current;
    (window as any).addToNavigationHistory({
      id: parent.id,
      title: isUnorganized ? MY_PILE_THREAD_TITLE : parent.title,
      count: threadWithMeta.count ?? 0,
      backgroundGradient: parent.backgroundGradient ?? 'var(--color-gradient-gray)',
      spaceId: spaceId,
      openedInSpaceIds: [openedInSpaceId],
      openedInSpaceId: openedInSpaceId,
    });
  }, [note, parentThread, urlSpaceId]);

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

    (
      window as unknown as {
        noteSaveCallback?: (
          newTitle: string,
          newContent: string,
          collectionExtras?: {
            primaryCollection?: string | null;
            secondaryCollections?: string[];
            collectionPinned?: boolean;
            collectionUserOverride?: boolean;
          },
        ) => Promise<unknown>;
      }
    ).noteSaveCallback = async function (newTitle, newContent, collectionExtras) {
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
      return updateNoteMutation.mutateAsync({
        noteId,
        title: newTitle,
        content: newContent,
        ...(collectionExtras ?? {}),
      });
    };

    return () => {
      // Clean up when leaving the note page
      (window as unknown as { noteSaveCallback?: unknown }).noteSaveCallback = undefined;
    };
  }, [noteId, updateNoteMutation]);

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
    // Wrapper div provides data attributes that CardFullEditable reads from the DOM.
    // Must be a real box (not display:contents) so `.main-column__scroll > *` fills the scroll column.
    <div
      data-note-id={noteId}
      {...(parentThreadId ? {
        'data-parent-thread-id': parentThreadId,
        'data-parent-thread-title': parentThread?.title ?? '',
        'data-parent-thread-background-gradient': parentThread?.backgroundGradient ?? '',
        'data-parent-thread-count': String((parentThread as { count?: number }).count ?? 0),
        'data-parent-thread-space-id': (parentThread as { spaceId?: string | null }).spaceId ?? '',
      } : {})}
    >
      <div className="note-editor-column-shell h-full w-full">
        <div className="note-editor-scroll">
          <SubtleContentMount key={noteId} variant="fade">
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
              readOnlyLikeScripture={isOnboardingReadonly}
              editorChromeMode={isEditable ? 'prototypeNative' : 'default'}
              formatToolbarPortalTarget={isEditable ? formatToolbarHostEl : null}
              scriptureChromePortalTarget={isEditable ? scriptureChromeHostEl : null}
              highlightChromePortalTarget={isEditable ? highlightChromeHostEl : null}
              noteActionsPortalTarget={isEditable ? noteActionsHostEl : null}
              onPrototypeChromeModeChange={isEditable ? setChromeMode : undefined}
              initialPrimaryCollection={note.primaryCollection ?? null}
              initialSecondaryCollections={note.secondaryCollections ?? []}
              initialCollectionPinned={note.collectionPinned ?? false}
              initialCollectionUserOverride={note.collectionUserOverride ?? false}
              initialCollectionLastAutoUpdatedAtIso={note.collectionLastAutoUpdatedAt ?? null}
              collectionNavContext={collectionNavContext}
              className="h-full flex-1 min-h-0"
            />
          </SubtleContentMount>
        </div>
        {isEditable ? (
          <div className="note-editor-bottom-bar" data-mode={chromeMode}>
            <div
              ref={setHighlightChromeHostEl}
              className="note-editor-bottom-bar__highlight-host"
              style={{ display: chromeMode === 'highlight' ? 'block' : 'none' }}
            />
            <div
              ref={setScriptureChromeHostEl}
              className="note-editor-bottom-bar__scripture-host"
              style={{ display: chromeMode === 'scripture' ? 'block' : 'none' }}
            />
            <div
              ref={setFormatToolbarHostEl}
              className="note-editor-bottom-bar__format-host"
              style={{ display: chromeMode === 'format' ? 'flex' : 'none' }}
            />
            <div
              ref={setNoteActionsHostEl}
              style={{ display: chromeMode === 'noteActions' ? 'block' : 'none' }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

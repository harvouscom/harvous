import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useParams, useSearch } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import CardFullEditable from '../../../../src/components/react/CardFullEditable';
import SubtleContentMount from '@/components/react/SubtleContentMount';
import { detectScriptureReferences } from '@/utils/scripture-detector';
import { updateNoteOffline } from '../../../../src/utils/offline-mutations';
import { useNote } from '../../hooks/queries/useNote';
import { useProcessScriptureRefs } from '../../hooks/mutations/useProcessScriptureRefs';
import { useUpdateNote } from '../../hooks/mutations/useUpdateNote';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { effectiveNoteFolderLabel } from '@/utils/note-folder-display';
import PrototypeInspectorPane from './PrototypeInspectorPane';
import PrototypeMainPaneShell from './PrototypeMainPaneShell';
import { usePrototypeHomeSpaceId } from '../../hooks/usePrototypeHomeSpaceId';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';

export default function PrototypeNotePage() {
  const { noteId: noteSlugParam } = useParams({ strict: false }) as { noteId: string };
  const noteId = noteSlugParam.startsWith('note_') ? noteSlugParam : `note_${noteSlugParam}`;
  const { reference: initialReferenceWord } = useSearch({ strict: false }) as { reference?: string };
  const { homeSpaceId } = usePrototypeHomeSpaceId();

  const { data: note, isLoading } = useNote(noteId);

  const queryClient = useQueryClient();
  const updateNoteMutation = useUpdateNote();
  // Stable ref so noteSaveCallback never re-registers just because the mutation object identity changed
  const updateNoteMutationRef = useRef(updateNoteMutation);
  updateNoteMutationRef.current = updateNoteMutation;
  const processScriptureMutation = useProcessScriptureRefs();
  const {
    inspectorOpen,
    inspectorExiting,
    isMobileSidebar,
    closeInspector,
    setPrototypeFolderChip,
    dismissStandaloneScripturePassage,
    formatToolbarHostEl,
    scriptureChromeHostEl,
    highlightChromeHostEl,
    referenceChromeHostEl,
    setEditorChromeMode,
  } = useProtoShell();

  useEffect(() => {
    dismissStandaloneScripturePassage();
  }, [dismissStandaloneScripturePassage]);

  const resolvedSpaceFromNote =
    typeof note?.spaceId === 'string' && note.spaceId.trim().length > 0 ? note.spaceId : null;
  const resolvedSpaceFromThread = (note?.threads?.[0] as { spaceId?: string | null } | undefined)?.spaceId ?? null;

  const effectiveSpaceId =
    (resolvedSpaceFromNote != null ? resolvedSpaceFromNote : resolvedSpaceFromThread) ?? homeSpaceId ?? '';

  const isEditable = true;

  const onPrototypeFolderDisplayChange = useCallback(
    (label: string | null) => {
      setPrototypeFolderChip({ noteId, label });
    },
    [noteId, setPrototypeFolderChip],
  );

  useEffect(() => {
    if (!note) {
      setPrototypeFolderChip(null);
      return;
    }
    setPrototypeFolderChip({
      noteId,
      label: effectiveNoteFolderLabel({
        primaryCollection: note.primaryCollection ?? null,
        secondaryCollections: note.secondaryCollections ?? [],
      }),
    });
  }, [noteId, note, setPrototypeFolderChip]);

  useEffect(() => {
    return () => {
      setPrototypeFolderChip(null);
    };
  }, [setPrototypeFolderChip]);

  useEffect(() => {
    return () => {
      setEditorChromeMode('hidden');
    };
  }, [setEditorChromeMode]);

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

  const parentThread = useMemo(() => note?.threads?.[0], [note?.threads]);
  const parentThreadId = parentThread?.id ?? 'thread_unorganized';

  const isOnboardingReadonly = useMemo(
    () =>
      parentThreadId?.startsWith('thread_onboarding_') ||
      (note?.threads?.some((th) => th.id.startsWith('thread_onboarding_')) ?? false),
    [note?.threads, parentThreadId],
  );

  useEffect(() => {
    if (!parentThread?.id || !noteId) return;
    try {
      localStorage.setItem(`harvous-note-thread-${noteId}`, parentThread.id);
    } catch {
      /* ignore */
    }
    const tw = parentThread as { count?: number; spaceId?: string | null };
    try {
      localStorage.setItem(
        `harvous-note-thread-data-${noteId}`,
        JSON.stringify({
          id: parentThread.id,
          title: parentThread.title ?? '',
          noteCount: tw.count ?? 0,
          backgroundGradient: parentThread.backgroundGradient ?? '',
          spaceId: tw.spaceId ?? effectiveSpaceId,
        }),
      );
    } catch {
      /* ignore */
    }
  }, [noteId, parentThread, effectiveSpaceId]);

  const reprocessAttemptedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!note || isLoading || note.contentEncrypted) return;
    const content = note.content ?? '';
    if (!content || typeof content !== 'string') return;
    if (reprocessAttemptedRef.current === noteId) return;

    const hasPills = content.includes('data-scripture-reference');
    const hasPendingPills = /data-note-id\s*=\s*["']pending["']/.test(content);
    if (hasPills && !hasPendingPills) return;

    const runReprocess = () => {
      reprocessAttemptedRef.current = noteId;
      const threads = note.threads ?? [];
      const parentThreadForApi = threads[0];
      const threadId = parentThreadForApi?.id ?? 'thread_unorganized';
      processScriptureMutation.mutate(
        { noteId, contentOverride: content, threadId },
        {
          onError: () => {
            reprocessAttemptedRef.current = null;
          },
        },
      );
    };

    if (hasPendingPills) {
      runReprocess();
      return;
    }

    const plainText = content
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const refs = detectScriptureReferences(plainText);
    if (refs.length === 0) return;
    runReprocess();
  }, [note, noteId, isLoading, processScriptureMutation]);

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
      try {
        const uid =
          (window as unknown as { __harvous_userId?: string }).__harvous_userId ||
          localStorage.getItem('harvous-user-id');
        if (uid) {
          await updateNoteOffline(uid, noteId, { title: newTitle, content: newContent });
        }
      } catch (err) {
        console.error('[PrototypeNotePage] offline note update:', err);
      }
      return updateNoteMutationRef.current.mutateAsync({
        noteId,
        title: newTitle,
        content: newContent,
        ...(collectionExtras ?? {}),
      });
    };

    return () => {
      delete (window as unknown as { noteSaveCallback?: unknown }).noteSaveCallback;
    };
  }, [noteId]); // updateNoteMutation intentionally omitted — accessed via ref

  useEffect(() => {
    if (!inspectorOpen || !isMobileSidebar) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeInspector();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [inspectorOpen, isMobileSidebar, closeInspector]);

  /* Loading — use PDS shimmer, no SPA card-full class */
  if (isLoading && !note) {
    return (
      <PrototypeMainPaneShell>
        <div className="proto-editor-surface">
          <div className="proto-editor-loading">
            <div className="proto-editor-loading-wrap">
              <div className="proto-editor-loading-inner proto-editor-paper">
              <div className="proto-editor-loading-line proto-editor-loading-line--title" />
              <div className="proto-editor-loading-line" style={{ width: '90%' }} />
              <div className="proto-editor-loading-line" style={{ width: '75%' }} />
              <div className="proto-editor-loading-line proto-editor-loading-line--short" />
              </div>
            </div>
          </div>
        </div>
      </PrototypeMainPaneShell>
    );
  }

  if (!note) {
    return (
      <PrototypeMainPaneShell>
        <div className="proto-editor-surface proto-editor-error">Note not found.</div>
      </PrototypeMainPaneShell>
    );
  }

  const MONTHS_LONG = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const formattedDate = note.createdAt
    ? (() => {
        const d = new Date(note.createdAt!);
        return `${MONTHS_LONG[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
      })()
    : '';

  const prototypeDisplayTitle = stripServerAutoUntitledNoteTitleForDisplay(note.title);

  const showInspectorDesktop = (inspectorOpen || inspectorExiting) && !isMobileSidebar;
  const showInspectorMobile = (inspectorOpen || inspectorExiting) && isMobileSidebar;
  const inspectorReservesEditorSpace = inspectorOpen && !inspectorExiting;

  return (
    <PrototypeMainPaneShell>
    <div
      className={`proto-note-pane-row${inspectorReservesEditorSpace ? ' proto-note-pane-row--inspector-open' : ''}`}
      data-note-id={noteId}
      data-parent-thread-id={parentThreadId}
      data-parent-thread-title={parentThread?.title ?? ''}
      data-parent-thread-background-gradient={parentThread?.backgroundGradient ?? ''}
      data-parent-thread-count={String((parentThread as { count?: number })?.count ?? 0)}
      data-parent-thread-space-id={(parentThread as { spaceId?: string | null })?.spaceId ?? effectiveSpaceId}
    >
      {/* Editor column */}
      <div className="proto-editor-surface">
        <div className="proto-editor-scroll">
          <SubtleContentMount key={noteId} variant="fade">
            <div className="proto-editor-content-wrap">
              <div className="proto-editor-paper">
              <CardFullEditable
                title={prototypeDisplayTitle}
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
                editorChromeMode="prototypeNative"
                formatToolbarPortalTarget={formatToolbarHostEl}
                scriptureChromePortalTarget={scriptureChromeHostEl}
                highlightChromePortalTarget={highlightChromeHostEl}
                referenceChromePortalTarget={referenceChromeHostEl}
                initialReferenceWord={initialReferenceWord || null}
                onPrototypeChromeModeChange={setEditorChromeMode}
                initialPrimaryCollection={note.primaryCollection ?? null}
                initialSecondaryCollections={note.secondaryCollections ?? []}
                initialCollectionPinned={note.collectionPinned ?? false}
                initialCollectionUserOverride={note.collectionUserOverride ?? false}
                initialCollectionLastAutoUpdatedAtIso={note.collectionLastAutoUpdatedAt ?? null}
                onPrototypeFolderDisplayChange={onPrototypeFolderDisplayChange}
                prototypeNoteActionsChrome={true}
                alwaysEditing
              />
              </div>
            </div>
          </SubtleContentMount>
        </div>
      </div>

      {/* Inspector — desktop: flex column; mobile: fixed slide-over + backdrop */}
      {showInspectorDesktop ? (
        <div className={`proto-inspector-desktop${inspectorExiting ? ' proto-inspector-desktop--exiting' : ''}`}>
          <PrototypeInspectorPane note={note} spaceId={effectiveSpaceId} />
        </div>
      ) : null}

      {showInspectorMobile ? (
        <>
          <div
            className="proto-inspector-mobile-backdrop"
            role="presentation"
            tabIndex={-1}
            onClick={closeInspector}
          />
          <div
            className={`proto-inspector-mobile-panel${inspectorExiting ? ' proto-inspector-mobile-panel--exiting' : ''}`}
            role="dialog"
            aria-label="Note details"
          >
            <PrototypeInspectorPane note={note} spaceId={effectiveSpaceId} />
          </div>
        </>
      ) : null}
    </div>
    </PrototypeMainPaneShell>
  );
}

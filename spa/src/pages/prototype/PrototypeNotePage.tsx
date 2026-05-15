import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import CardFullEditable from '../../../../src/components/react/CardFullEditable';
import PrototypeNoteActionBar from './PrototypeNoteActionBar';
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
  const { homeSpaceId } = usePrototypeHomeSpaceId();

  const { data: note, isLoading } = useNote(noteId);

  const queryClient = useQueryClient();
  const updateNoteMutation = useUpdateNote();
  const processScriptureMutation = useProcessScriptureRefs();
  const { inspectorOpen, isMobileSidebar, closeInspector, setPrototypeFolderChip, dismissStandaloneScripturePassage } =
    useProtoShell();

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

  // Column-level bottom bar host. The format toolbar is portaled into this
  // element so it pins to the bottom of the editor column (sibling of the
  // scroll container) regardless of content height.
  const [formatToolbarHostEl, setFormatToolbarHostEl] = useState<HTMLDivElement | null>(null);
  const [scriptureChromeHostEl, setScriptureChromeHostEl] = useState<HTMLDivElement | null>(null);
  const [highlightChromeHostEl, setHighlightChromeHostEl] = useState<HTMLDivElement | null>(null);
  const [chromeMode, setChromeMode] = useState<
    'format' | 'scripture' | 'highlight' | 'noteActions' | 'hidden'
  >('noteActions');

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
      return updateNoteMutation.mutateAsync({
        noteId,
        title: newTitle,
        content: newContent,
        ...(collectionExtras ?? {}),
      });
    };

    return () => {
      delete (window as unknown as { noteSaveCallback?: unknown }).noteSaveCallback;
    };
  }, [noteId, updateNoteMutation]);

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
            <div className="proto-editor-loading-inner">
              <div className="proto-editor-loading-line proto-editor-loading-line--title" />
              <div className="proto-editor-loading-line" style={{ width: '90%' }} />
              <div className="proto-editor-loading-line" style={{ width: '75%' }} />
              <div className="proto-editor-loading-line proto-editor-loading-line--short" />
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

  const showInspectorDesktop = inspectorOpen && !isMobileSidebar;
  const showInspectorMobile = inspectorOpen && isMobileSidebar;

  return (
    <PrototypeMainPaneShell>
    <div
      style={{ display: 'flex', flexDirection: 'row', height: '100%', minHeight: 0, overflow: 'hidden' }}
      data-note-id={noteId}
      data-parent-thread-id={parentThreadId}
      data-parent-thread-title={parentThread?.title ?? ''}
      data-parent-thread-background-gradient={parentThread?.backgroundGradient ?? ''}
      data-parent-thread-count={String((parentThread as { count?: number })?.count ?? 0)}
      data-parent-thread-space-id={(parentThread as { spaceId?: string | null })?.spaceId ?? effectiveSpaceId}
    >
      {/* Editor column */}
      <div className="proto-editor-surface" style={{ flex: 1, minWidth: 0 }}>
        <div className="proto-editor-scroll">
          <SubtleContentMount key={noteId} variant="fade">
            <div className="proto-editor-content-wrap">
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
                onPrototypeChromeModeChange={setChromeMode}
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
          </SubtleContentMount>
        </div>

        {/* Column-level bottom bar — sibling of the scroll, pinned to viewport bottom. */}
        <div
          className="proto-editor-bottom-bar"
          data-mode={chromeMode}
          style={{ display: chromeMode === 'hidden' ? 'none' : undefined }}
        >
          <div
            ref={setHighlightChromeHostEl}
            className="proto-editor-bottom-bar__highlight"
            style={{ display: chromeMode === 'highlight' ? 'block' : 'none' }}
          />
          <div
            ref={setScriptureChromeHostEl}
            className="proto-editor-bottom-bar__scripture"
            style={{ display: chromeMode === 'scripture' ? 'block' : 'none' }}
          />
          <div
            ref={setFormatToolbarHostEl}
            className="proto-editor-bottom-bar__format"
            style={{ display: chromeMode === 'format' ? 'flex' : 'none' }}
          />
          <div
            className="proto-editor-bottom-bar__note-actions-stack"
            style={{ display: chromeMode === 'noteActions' ? 'flex' : 'none' }}
          >
            <PrototypeNoteActionBar
              noteId={noteId}
              spaceId={effectiveSpaceId}
              currentTitle={prototypeDisplayTitle}
              linkedFromNotes={note.linkedFromNotes ?? []}
              linkedToNotes={note.linkedToNotes ?? []}
              connectDisabled={isOnboardingReadonly}
            />
          </div>
        </div>
      </div>

      {/* Inspector — desktop: flex column; mobile: fixed slide-over + backdrop */}
      {showInspectorDesktop ? (
        <div
          style={{
            width: 'var(--pds-inspector-w)',
            flexShrink: 0,
            borderLeft: '1px solid var(--pds-border)',
            background: 'var(--pds-bg-sidebar)',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <PrototypeInspectorPane note={note} />
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
          <div className="proto-inspector-mobile-panel" role="dialog" aria-label="Note details">
            <PrototypeInspectorPane note={note} />
          </div>
        </>
      ) : null}
    </div>
    </PrototypeMainPaneShell>
  );
}

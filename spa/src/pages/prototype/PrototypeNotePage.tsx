import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import CardFullEditable from '../../../../src/components/react/CardFullEditable';
import PrototypeNoteActionBar from '../../../../src/components/react/PrototypeNoteActionBar';
import SubtleContentMount from '@/components/react/SubtleContentMount';
import { detectScriptureReferences } from '@/utils/scripture-detector';
import { updateNoteOffline } from '../../../../src/utils/offline-mutations';
import { useNote } from '../../hooks/queries/useNote';
import { useProcessScriptureRefs } from '../../hooks/mutations/useProcessScriptureRefs';
import { useUpdateNote } from '../../hooks/mutations/useUpdateNote';
import { useProtoShell } from '../../layouts/proto-shell-context';
import PrototypeInspectorPane from './PrototypeInspectorPane';

export default function PrototypeNotePage() {
  const { spaceId: spaceSlugParam, noteId: noteSlugParam } = useParams({ strict: false }) as {
    spaceId: string;
    noteId: string;
  };
  const spaceId = spaceSlugParam.startsWith('space_') ? spaceSlugParam : `space_${spaceSlugParam}`;
  const noteId = noteSlugParam.startsWith('note_') ? noteSlugParam : `note_${noteSlugParam}`;

  const { user } = useUser();
  const { data: note, isLoading } = useNote(noteId);
  const queryClient = useQueryClient();
  const updateNoteMutation = useUpdateNote();
  const processScriptureMutation = useProcessScriptureRefs();
  const { inspectorOpen, isMobileSidebar, openInspector } = useProtoShell();

  const isEditable = true;

  // Column-level bottom bar host. The format toolbar is portaled into this
  // element so it pins to the bottom of the editor column (sibling of the
  // scroll container) regardless of content height.
  const [formatToolbarHostEl, setFormatToolbarHostEl] = useState<HTMLDivElement | null>(null);
  const [scriptureChromeHostEl, setScriptureChromeHostEl] = useState<HTMLDivElement | null>(null);
  const [chromeMode, setChromeMode] = useState<'format' | 'scripture' | 'noteActions'>(
    'noteActions',
  );

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

  const collectionLabel = useMemo(() => {
    const raw = (note as { primaryCollection?: string | null } | undefined)?.primaryCollection;
    if (!raw) return null;
    const t = raw.trim();
    return t.length > 0 ? t : null;
  }, [note]);

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
          spaceId: tw.spaceId ?? spaceId,
        }),
      );
    } catch {
      /* ignore */
    }
  }, [noteId, parentThread, spaceId]);

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
        noteSaveCallback?: (newTitle: string, newContent: string) => Promise<unknown>;
      }
    ).noteSaveCallback = async function (newTitle: string, newContent: string) {
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
      return updateNoteMutation.mutateAsync({ noteId, title: newTitle, content: newContent });
    };

    return () => {
      delete (window as unknown as { noteSaveCallback?: unknown }).noteSaveCallback;
    };
  }, [noteId, updateNoteMutation]);

  /* Loading — use PDS shimmer, no SPA card-full class */
  if (isLoading && !note) {
    return (
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
    );
  }

  if (!note) {
    return (
      <div className="proto-editor-surface proto-editor-error">
        Note not found.
      </div>
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

  const showInspector = inspectorOpen && !isMobileSidebar;

  return (
    <div
      style={{ display: 'flex', flexDirection: 'row', height: '100%', minHeight: 0, overflow: 'hidden' }}
      data-note-id={noteId}
      data-parent-thread-id={parentThreadId}
      data-parent-thread-title={parentThread?.title ?? ''}
      data-parent-thread-background-gradient={parentThread?.backgroundGradient ?? ''}
      data-parent-thread-count={String((parentThread as { count?: number })?.count ?? 0)}
      data-parent-thread-space-id={(parentThread as { spaceId?: string | null })?.spaceId ?? spaceId}
    >
      {/* Editor column */}
      <div className="proto-editor-surface" style={{ flex: 1, minWidth: 0 }}>
        <div className="proto-editor-scroll">
          <SubtleContentMount key={noteId} variant="fade">
            <div className="proto-editor-content-wrap">
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
                editorChromeMode="prototypeNative"
                formatToolbarPortalTarget={formatToolbarHostEl}
                scriptureChromePortalTarget={scriptureChromeHostEl}
                onPrototypeChromeModeChange={setChromeMode}
              />
            </div>
          </SubtleContentMount>
        </div>

        {/* Column-level bottom bar — sibling of the scroll, pinned to viewport bottom. */}
        <div
          className="proto-editor-bottom-bar"
          data-mode={chromeMode}
        >
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
          {chromeMode === 'noteActions' ? (
            <PrototypeNoteActionBar
              collectionLabel={collectionLabel}
              onOpenInspector={!isMobileSidebar ? openInspector : undefined}
            />
          ) : null}
        </div>
      </div>

      {/* Inspector pane — rendered here when open on desktop */}
      {showInspector ? (
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
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { prototypeHomeRouteTo, prototypeNoteRouteTo } from '@/lib/prototype-path';
import { useQueryClient } from '@tanstack/react-query';
import CardFullEditable from '../../../../src/components/react/CardFullEditable';
import SubtleContentMount from '@/components/react/SubtleContentMount';
import { detectScriptureReferences } from '@/utils/scripture-detector';
import { updateNoteOffline } from '../../../../src/utils/offline-mutations';
import { getNoteIdFromCreateResponse, useNote } from '../../hooks/queries/useNote';
import { useProcessScriptureRefs } from '../../hooks/mutations/useProcessScriptureRefs';
import { useUpdateNote } from '../../hooks/mutations/useUpdateNote';
import { useDeleteNote } from '../../hooks/mutations/useDeleteNote';
import { alertCreateNoteFailure, useCreateSimpleNote } from '../../hooks/mutations/useCreateSimpleNote';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { noteFolderChipDisplayState } from '@/utils/note-folder-display';
import { isEffectivelyEmptyPrototypeNote } from '@/utils/prototype-note-empty';
import PrototypeInspectorPane from './PrototypeInspectorPane';
import PrototypeMainPaneShell from './PrototypeMainPaneShell';
import { usePrototypeHomeSpaceId } from '../../hooks/usePrototypeHomeSpaceId';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import { getEffectiveDefaultTranslation } from '@/utils/profile-cache';
import { isPrototypeDraftNoteSlug, noteParamSlug } from './proto-route-slugs';

const DRAFT_NOTE_ID = 'note_draft';
const EMPTY_NOTE_COLLECTIONS: string[] = [];

/**
 * Cap how many times a single note auto-reprocesses scripture. Without a cap, a
 * persistent server failure re-fires the mutation on every `note` refetch (the
 * effect depends on the query object). The counter resets when the page
 * remounts (navigate away and back), so transient failures still get a fresh try.
 */
const MAX_SCRIPTURE_REPROCESS_ATTEMPTS = 3;

export default function PrototypeNotePage() {
  const { noteId: noteSlugParam } = useParams({ strict: false }) as { noteId: string };
  const isDraft = isPrototypeDraftNoteSlug(noteSlugParam);
  const noteId = isDraft
    ? DRAFT_NOTE_ID
    : noteSlugParam.startsWith('note_')
      ? noteSlugParam
      : `note_${noteSlugParam}`;
  const { reference: initialReferenceWord } = useSearch({ strict: false }) as { reference?: string };
  const { homeSpaceId } = usePrototypeHomeSpaceId();
  const navigate = useNavigate();

  const { data: note, isLoading, isError, isFetching } = useNote(isDraft ? '' : noteId);

  const editorSecondaryCollections = useMemo(() => {
    if (isDraft) return EMPTY_NOTE_COLLECTIONS;
    const secondaries = note?.secondaryCollections;
    return secondaries?.length ? secondaries : EMPTY_NOTE_COLLECTIONS;
  }, [isDraft, note?.secondaryCollections]);

  const queryClient = useQueryClient();
  const updateNoteMutation = useUpdateNote();
  const createNoteMutation = useCreateSimpleNote();
  // Stable ref so noteSaveCallback never re-registers just because the mutation object identity changed
  const updateNoteMutationRef = useRef(updateNoteMutation);
  updateNoteMutationRef.current = updateNoteMutation;
  const createNoteMutationRef = useRef(createNoteMutation);
  createNoteMutationRef.current = createNoteMutation;
  const draftPersistPromiseRef = useRef<Promise<string | null> | null>(null);
  const persistedDraftIdRef = useRef<string | null>(null);
  const deleteNoteMutation = useDeleteNote();
  const deleteNoteMutationRef = useRef(deleteNoteMutation);
  deleteNoteMutationRef.current = deleteNoteMutation;
  const processScriptureMutation = useProcessScriptureRefs();
  const {
    inspectorOpen,
    inspectorExiting,
    isMobileSidebar,
    closeInspector,
    setPrototypeFolderChip,
    dismissStandaloneScripturePassage,
    formatToolbarHostEl,
    studyDockCarouselHostEl,
    referenceChromeHostEl,
    setEditorChromeMode,
  } = useProtoShell();

  useEffect(() => {
    dismissStandaloneScripturePassage();
  }, [dismissStandaloneScripturePassage]);

  useEffect(() => {
    const onDeleted = (e: Event) => {
      const deletedId = (e as CustomEvent<{ noteId?: string }>).detail?.noteId;
      if (deletedId && deletedId === noteId) {
        navigate({ to: prototypeHomeRouteTo(), replace: true });
      }
    };
    window.addEventListener('noteDeleted', onDeleted);
    return () => window.removeEventListener('noteDeleted', onDeleted);
  }, [noteId, navigate]);

  useEffect(() => {
    if (isDraft) return;
    if (isLoading || isFetching || !isError || note) return;
    navigate({ to: prototypeHomeRouteTo(), replace: true });
  }, [isDraft, isLoading, isFetching, isError, note, navigate]);

  const resolvedSpaceFromNote =
    typeof note?.spaceId === 'string' && note.spaceId.trim().length > 0 ? note.spaceId : null;
  const resolvedSpaceFromThread = (note?.threads?.[0] as { spaceId?: string | null } | undefined)?.spaceId ?? null;

  const effectiveSpaceId =
    (resolvedSpaceFromNote != null ? resolvedSpaceFromNote : resolvedSpaceFromThread) ?? homeSpaceId ?? '';

  const effectiveSpaceIdRef = useRef(effectiveSpaceId);
  effectiveSpaceIdRef.current = effectiveSpaceId;

  // Handle "New Note from selection" — TiptapEditor fires openNewNotePanel + writes to
  // localStorage; the prototype doesn't mount BottomSheet/CreateNoteButton so we wire
  // it up here directly.
  useEffect(() => {
    const handler = async () => {
      const spaceId = effectiveSpaceIdRef.current || homeSpaceId;
      if (!spaceId) return;

      const title = localStorage.getItem('newNoteTitle') ?? '';
      const content = localStorage.getItem('newNoteContent') ?? '';
      const linkedFromNoteId = localStorage.getItem('newNoteSourceNoteId') || undefined;

      // Clean up so a repeated open doesn't replay stale data.
      ['newNoteTitle', 'newNoteContent', 'newNoteSourceNoteId',
       'newNoteSourceSelectionFrom', 'newNoteSourceSelectionTo',
       'newNoteSourceSelectionPlainText', 'newNoteContentEmptyFromSelection',
       'showNewNotePanel'].forEach((k) => localStorage.removeItem(k));

      try {
        const res = await createNoteMutationRef.current.mutateAsync({
          spaceId,
          title,
          content: content || '<p></p>',
          linkedFromNoteId,
        });
        const createdId = getNoteIdFromCreateResponse(res);
        if (createdId) {
          navigate({
            to: prototypeNoteRouteTo(),
            params: { noteId: noteParamSlug(createdId) },
          });
        }
      } catch (err) {
        alertCreateNoteFailure(err);
      }
    };

    window.addEventListener('openNewNotePanel', handler);
    return () => window.removeEventListener('openNewNotePanel', handler);
  }, [homeSpaceId, navigate]);

  const isEditable = true;

  const liveFolderLabelRef = useRef<string | null>(null);

  const isNoteEditorFocused = useCallback(() => {
    if (typeof document === 'undefined') return false;
    const el = document.activeElement;
    if (!el) return false;
    if (el.closest('.ProseMirror')) return true;
    if (el.tagName === 'TEXTAREA' && el.closest('[data-note-id]')) return true;
    return false;
  }, []);

  const onPrototypeFolderDisplayChange = useCallback(
    (chip: ReturnType<typeof noteFolderChipDisplayState>) => {
      liveFolderLabelRef.current = chip.label;
      setPrototypeFolderChip({ noteId, ...chip });
    },
    [noteId, setPrototypeFolderChip],
  );

  useEffect(() => {
    liveFolderLabelRef.current = null;
    persistedDraftIdRef.current = null;
    draftPersistPromiseRef.current = null;
  }, [noteSlugParam]);

  useEffect(() => {
    if (isDraft || !note) {
      setPrototypeFolderChip(null);
      return;
    }
    if (isNoteEditorFocused()) return;
    const serverChip = noteFolderChipDisplayState({
      primaryCollection: note.primaryCollection ?? null,
      secondaryCollections: note.secondaryCollections ?? [],
    });
    const live = liveFolderLabelRef.current;
    if (live && !serverChip.label) {
      setPrototypeFolderChip({ noteId, label: live, extraCount: 0, membershipLabels: live ? [live] : [] });
      return;
    }
    if (serverChip.label) {
      liveFolderLabelRef.current = null;
    }
    setPrototypeFolderChip({
      noteId,
      label: serverChip.label ?? live,
      extraCount: serverChip.label ? serverChip.extraCount : 0,
      membershipLabels: serverChip.label ? serverChip.membershipLabels : live ? [live] : [],
    });
  }, [
    isDraft,
    noteId,
    note?.primaryCollection,
    note?.secondaryCollections,
    setPrototypeFolderChip,
    isNoteEditorFocused,
  ]);

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
    if (isDraft) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ noteId?: string; source?: string }>).detail;
      if (!detail?.noteId || String(detail.noteId) !== String(noteId)) return;
      // Autosave already patches the detail cache — refetching mid-edit resets editTitle.
      if (e.type === 'noteUpdated' && detail.source === 'autosave') return;
      queryClient.invalidateQueries({ queryKey: ['note', noteId] });
    };
    window.addEventListener('noteLockStateChanged', handler);
    window.addEventListener('noteUpdated', handler);
    return () => {
      window.removeEventListener('noteLockStateChanged', handler);
      window.removeEventListener('noteUpdated', handler);
    };
  }, [isDraft, noteId, queryClient]);

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

  const reprocessAttemptsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (isDraft || !note || isLoading || note.contentEncrypted) return;
    if (isNoteEditorFocused()) return;
    const content = note.content ?? '';
    if (!content || typeof content !== 'string') return;
    if ((reprocessAttemptsRef.current.get(noteId) ?? 0) >= MAX_SCRIPTURE_REPROCESS_ATTEMPTS) return;

    const hasPills = content.includes('data-scripture-reference');
    const hasPendingPills = /data-note-id\s*=\s*["']pending["']/.test(content);
    if (hasPills && !hasPendingPills) return;

    const runReprocess = () => {
      // Count every attempt (including failures) toward the cap. We intentionally
      // do NOT reset on error — that's what previously let a persistent failure
      // loop on each refetch.
      const attempts = reprocessAttemptsRef.current;
      attempts.set(noteId, (attempts.get(noteId) ?? 0) + 1);
      const threads = note.threads ?? [];
      const parentThreadForApi = threads[0];
      const threadId = parentThreadForApi?.id ?? 'thread_unorganized';
      processScriptureMutation.mutate({ noteId, contentOverride: content, threadId });
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
  }, [isDraft, note, noteId, isLoading, processScriptureMutation, isNoteEditorFocused]);

  const persistDraftNote = useCallback(
    async (
      newTitle: string,
      newContent: string,
      collectionExtras?: {
        primaryCollection?: string | null;
        secondaryCollections?: string[];
        collectionPinned?: boolean;
        collectionUserOverride?: boolean;
      },
    ): Promise<string | null> => {
      const scriptureVersion = getEffectiveDefaultTranslation();
      const updatePersisted = (id: string) =>
        updateNoteMutationRef.current.mutateAsync({
          noteId: id,
          title: newTitle,
          content: newContent,
          scriptureVersion,
          ...(collectionExtras ?? {}),
        });

      if (persistedDraftIdRef.current) {
        await updatePersisted(persistedDraftIdRef.current);
        return persistedDraftIdRef.current;
      }
      if (draftPersistPromiseRef.current) {
        const createdId = await draftPersistPromiseRef.current;
        if (!createdId) return null;
        await updatePersisted(createdId);
        return createdId;
      }
      const spaceId = effectiveSpaceIdRef.current || homeSpaceId;
      if (!spaceId) return null;

      draftPersistPromiseRef.current = (async () => {
        try {
          const res = await createNoteMutationRef.current.mutateAsync({
            spaceId,
            title: newTitle,
            content: newContent,
          });
          const createdId = getNoteIdFromCreateResponse(res);
          if (!createdId) {
            throw new Error('Create succeeded but response had no note id');
          }
          persistedDraftIdRef.current = createdId;
          if (collectionExtras && Object.keys(collectionExtras).length > 0) {
            await updateNoteMutationRef.current.mutateAsync({
              noteId: createdId,
              title: newTitle,
              content: newContent,
              scriptureVersion,
              ...collectionExtras,
            });
          }
          navigate({
            to: prototypeNoteRouteTo(),
            params: { noteId: noteParamSlug(createdId) },
            replace: true,
          });
          return createdId;
        } catch (err) {
          alertCreateNoteFailure(err);
          throw err;
        } finally {
          draftPersistPromiseRef.current = null;
        }
      })();

      return draftPersistPromiseRef.current;
    },
    [homeSpaceId, navigate],
  );

  const handleNoteSave = useCallback(
    async (
      newTitle: string,
      newContent: string,
      collectionExtras?: {
        primaryCollection?: string | null;
        secondaryCollections?: string[];
        collectionPinned?: boolean;
        collectionUserOverride?: boolean;
      },
    ) => {
      if (isEffectivelyEmptyPrototypeNote(newTitle, newContent)) {
        return;
      }
      if (isDraft) {
        const createdId = await persistDraftNote(newTitle, newContent, collectionExtras);
        return createdId ? { noteId: createdId } : undefined;
      }
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
        scriptureVersion: getEffectiveDefaultTranslation(),
        ...(collectionExtras ?? {}),
      });
    },
    [isDraft, noteId, persistDraftNote],
  );

  const handlePrototypeEditorUnmount = useCallback(
    (snapshot: { noteId: string; title: string; content: string }) => {
      if (isDraft) return;
      if (!isEffectivelyEmptyPrototypeNote(snapshot.title, snapshot.content)) return;
      const spaceId = effectiveSpaceIdRef.current || homeSpaceId;
      if (!spaceId) return;
      deleteNoteMutationRef.current.mutate({ noteId: snapshot.noteId, spaceId });
    },
    [homeSpaceId, isDraft],
  );

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
    ).noteSaveCallback = handleNoteSave;

    return () => {
      delete (window as unknown as { noteSaveCallback?: unknown }).noteSaveCallback;
    };
  }, [noteId, handleNoteSave]);

  useEffect(() => {
    if (!inspectorOpen || !isMobileSidebar) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeInspector();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [inspectorOpen, isMobileSidebar, closeInspector]);

  /* Loading — use PDS shimmer, no SPA card-full class */
  if (!isDraft && isLoading && !note) {
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

  if (!isDraft && !note) {
    return (
      <PrototypeMainPaneShell>
        <div className="proto-editor-surface proto-editor-error">Note not found.</div>
      </PrototypeMainPaneShell>
    );
  }

  const editorNote = isDraft
    ? {
        title: '',
        content: '',
        noteType: 'default' as const,
        version: undefined as number | undefined,
        resourceTitle: undefined as string | undefined,
        resourceDescription: undefined as string | undefined,
        resourceImage: undefined as string | undefined,
        resourceUrl: undefined as string | undefined,
        contentEncrypted: false,
        primaryCollection: null as string | null,
        secondaryCollections: [] as string[],
        collectionPinned: false,
        collectionUserOverride: false,
        collectionLastAutoUpdatedAt: null as string | null,
        createdAt: null as string | null,
        threads: [] as { id: string; title?: string; backgroundGradient?: string; count?: number; spaceId?: string | null }[],
      }
    : note!;

  const MONTHS_LONG = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const formattedDate = editorNote.createdAt
    ? (() => {
        const d = new Date(editorNote.createdAt!);
        return `${MONTHS_LONG[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
      })()
    : '';

  const prototypeDisplayTitle = stripServerAutoUntitledNoteTitleForDisplay(editorNote.title);

  const showInspectorDesktop = (inspectorOpen || inspectorExiting) && !isMobileSidebar;
  const showInspectorMobile = (inspectorOpen || inspectorExiting) && isMobileSidebar;
  // Only reserve editor space when the inspector actually renders. The desktop
  // inspector is gated on `!isDraft && note` below, so on a draft (a note with no
  // content yet) or before the note loads, reserving space shrinks the editor for
  // a panel that never appears — leaving a blank gap on the right.
  const inspectorReservesEditorSpace =
    inspectorOpen && !inspectorExiting && !isDraft && !!note;

  const notePaneRowClass = [
    'proto-note-pane-row',
    inspectorReservesEditorSpace ? 'proto-note-pane-row--inspector-open' : '',
  ]
    .filter(Boolean)
    .join(' ');

  // Keep the editor mounted across the draft→persisted-id swap. Saving a draft
  // creates the note server-side and navigates to /n/<id>, which changes `noteId`.
  // Keying SubtleContentMount on the raw noteId would remount the editor
  // mid-keystroke and drop any characters typed during the async create
  // round-trip (the reported "auto-folder creation wipes last typed text" bug).
  // Reuse the stable draft key for the note this page instance just persisted;
  // every other note keys on noteId as before so switching notes still remounts.
  const editorMountKey =
    !isDraft && persistedDraftIdRef.current === noteId ? DRAFT_NOTE_ID : noteId;

  return (
    <PrototypeMainPaneShell>
    <div
      className={notePaneRowClass}
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
          <SubtleContentMount key={editorMountKey} variant="fade">
            <div className="proto-editor-content-wrap">
              <div className="proto-editor-paper">
              <CardFullEditable
                title={prototypeDisplayTitle}
                content={editorNote.content ?? ''}
                date={formattedDate}
                noteId={noteId}
                noteType={(editorNote.noteType || 'default') as 'default' | 'scripture' | 'resource'}
                version={editorNote.version}
                resourceTitle={editorNote.resourceTitle ?? undefined}
                resourceDescription={editorNote.resourceDescription ?? undefined}
                resourceImage={editorNote.resourceImage ?? undefined}
                resourceUrl={editorNote.resourceUrl ?? undefined}
                contentEncrypted={editorNote.contentEncrypted ?? false}
                isEditable={isEditable}
                onSave={handleNoteSave}
                onPrototypeEditorUnmount={handlePrototypeEditorUnmount}
                readOnlyLikeScripture={isOnboardingReadonly}
                spaceId={effectiveSpaceId ?? undefined}
                editorChromeMode="prototypeNative"
                formatToolbarPortalTarget={formatToolbarHostEl}
                studyDockCarouselPortalTarget={studyDockCarouselHostEl}
                referenceChromePortalTarget={referenceChromeHostEl}
                initialReferenceWord={initialReferenceWord || null}
                onPrototypeChromeModeChange={setEditorChromeMode}
                initialPrimaryCollection={editorNote.primaryCollection ?? null}
                initialSecondaryCollections={editorSecondaryCollections}
                initialCollectionPinned={editorNote.collectionPinned ?? false}
                initialCollectionUserOverride={editorNote.collectionUserOverride ?? false}
                initialCollectionLastAutoUpdatedAtIso={editorNote.collectionLastAutoUpdatedAt ?? null}
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
      {showInspectorDesktop && !isDraft && note ? (
        <div className={`proto-inspector-desktop${inspectorExiting ? ' proto-inspector-desktop--exiting' : ''}`}>
          <PrototypeInspectorPane note={note} spaceId={effectiveSpaceId} />
        </div>
      ) : null}

      {showInspectorMobile && !isDraft && note ? (
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

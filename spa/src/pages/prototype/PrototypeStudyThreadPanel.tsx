/**
 * Study thread panel — expandable right-side layer over a note.
 * Layout mirrors PrototypeInspectorPane: minimal header + proto-inspector-section body blocks.
 * Name/auto/lock use proto-fte-* classes (same as PrototypeFolderTagEditor).
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import PrototypeConnectNoteSheet from './PrototypeConnectNoteSheet';
import PrototypeStudyThreadTrail from './PrototypeStudyThreadTrail';
import { usePrototypeHomeSpaceId } from '../../hooks/usePrototypeHomeSpaceId';
import { usePrototypeStudyThread } from '../../hooks/queries/usePrototypeStudyThread';
import { useUpdateStudyThreadTitle } from '../../hooks/mutations/useUpdateStudyThreadTitle';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { prototypeNoteRouteTo } from '@/lib/prototype-path';
import { noteParamSlug } from './proto-route-slugs';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import { studyThreadDisplayTitle } from '../../utils/study-thread-display-title';
import { trackThreadOpened } from '@/utils/analytics';
import ProtoSpaceLoading from './ProtoSpaceLoading';

interface PrototypeStudyThreadPanelProps {
  noteId: string;
  spaceId: string;
}

export default function PrototypeStudyThreadPanel({ noteId, spaceId }: PrototypeStudyThreadPanelProps) {
  const navigate = useNavigate();
  const { closeThreadPanel, expandThreadPanel, backFromThreadPanelToInspector, threadPanelExpanded } =
    useProtoShell();

  const { homeSpaceId } = usePrototypeHomeSpaceId();
  const effectiveSpaceId =
    (spaceId && spaceId.trim().length > 0 ? spaceId : null) ?? homeSpaceId ?? null;

  const { data: thread, isLoading, isError } = usePrototypeStudyThread(noteId, effectiveSpaceId);

  const [connectOpen, setConnectOpen] = useState(false);

  useEffect(() => {
    if (isLoading || isError || !thread) return;
    trackThreadOpened({
      threadId: thread.repNoteId ?? noteId,
      spaceId: effectiveSpaceId ?? undefined,
    });
  }, [isLoading, isError, thread, noteId, effectiveSpaceId]);

  const openNote = (id: string) => {
    navigate({ to: prototypeNoteRouteTo(), params: { noteId: noteParamSlug(id) } });
  };

  const nodeCount = thread?.nodeCount ?? 0;
  const repNoteId = thread?.repNoteId ?? noteId;
  const isManual = Boolean(thread?.studyThreadUserOverride);
  const isLocked = Boolean(thread?.studyThreadPinned);
  const suggestedDisplay =
    stripServerAutoUntitledNoteTitleForDisplay(thread?.suggestedTitle) || '';
  const serverDisplay = thread ? studyThreadDisplayTitle(thread) : suggestedDisplay;

  const updateTitle = useUpdateStudyThreadTitle();
  const [titleDraft, setTitleDraft] = useState(serverDisplay);
  const [editingTitle, setEditingTitle] = useState(false);

  useEffect(() => {
    if (!editingTitle) {
      setTitleDraft(isManual ? serverDisplay : suggestedDisplay);
    }
  }, [serverDisplay, suggestedDisplay, isManual, editingTitle]);

  const inputValue = isManual || editingTitle ? titleDraft : suggestedDisplay;
  const compareBaseline = isManual ? serverDisplay : suggestedDisplay;
  const titleDirty = inputValue.trim() !== compareBaseline.trim();

  const applyTitle = () => {
    const trimmed = inputValue.trim();
    if (!effectiveSpaceId) return;
    updateTitle.mutate({ repNoteId, spaceId: effectiveSpaceId, title: trimmed || null, userOverride: true });
    setEditingTitle(false);
  };

  const clearTitle = () => {
    setTitleDraft('');
    setEditingTitle(false);
    updateTitle.mutate({ repNoteId, spaceId: effectiveSpaceId, title: null, userOverride: true });
  };

  const useAutoSuggestion = () => {
    updateTitle.mutate(
      { repNoteId, spaceId: effectiveSpaceId, title: null, userOverride: false },
      { onSuccess: () => { setEditingTitle(false); setTitleDraft(suggestedDisplay); } },
    );
  };

  const toggleLock = () => {
    updateTitle.mutate({ repNoteId, spaceId: effectiveSpaceId, pinned: !isLocked });
  };

  const connectedNoteIds = useMemo(
    () => (thread?.nodes ?? []).map((n) => n.id).filter((id) => id !== noteId),
    [thread?.nodes, noteId],
  );

  return (
    <>
      <div className="proto-side-panel__header proto-side-panel__header--minimal">
        <span className="proto-side-panel__header-label">
          Threads
        </span>
        <div className="proto-side-panel__header-actions">
          {threadPanelExpanded ? (
            <button
              type="button"
              className="proto-side-panel__action-btn"
              title="Back to note details"
              aria-label="Back to note details"
              onClick={backFromThreadPanelToInspector}
            >
              <Icon name="caret-right" size={14} />
            </button>
          ) : (
            <>
              <button
                type="button"
                className="proto-side-panel__action-btn"
                title="Expand"
                aria-label="Expand thread view"
                onClick={expandThreadPanel}
              >
                <Icon name="up-right-and-down-left-from-center" size={14} />
              </button>
              <button
                type="button"
                className="proto-side-panel__action-btn"
                title="Close"
                aria-label="Close thread panel"
                onClick={closeThreadPanel}
              >
                <Icon name="caret-right" size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="proto-side-panel__body">
        {isLoading && !thread ? (
          <ProtoSpaceLoading label="Loading Thread" />
        ) : isError || !thread?.success ? (
          <p className="proto-inspector-muted" style={{ padding: '12px 14px' }}>Could not load thread.</p>
        ) : (
          <>
            <section className="proto-inspector-section">
              <p className="proto-inspector-section-title">Thread name</p>

              <div className="proto-fte-source">
                <div className="proto-fte-source__badge">
                  <Icon name={isManual ? 'wrench' : 'wand-magic-sparkles'} size={13} aria-hidden />
                  <span>{isManual ? 'Manual' : 'Automatic'}</span>
                </div>
                {isManual ? (
                  <button
                    type="button"
                    className="proto-fte-source__action"
                    onClick={useAutoSuggestion}
                    disabled={updateTitle.isPending}
                    title="Restore auto-suggested thread name"
                  >
                    <Icon name="rotate-left" size={11} aria-hidden />
                    {updateTitle.isPending ? 'Working…' : 'Use auto suggestion'}
                  </button>
                ) : null}
              </div>

              <div className="proto-fte-field">
                <input
                  type="text"
                  className="proto-fte-field__input"
                  value={inputValue}
                  placeholder={suggestedDisplay || 'Name this thread…'}
                  onChange={(e) => { setEditingTitle(true); setTitleDraft(e.target.value); }}
                  onBlur={() => { if (!isManual) setEditingTitle(false); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyTitle(); } }}
                  aria-label="Thread name"
                />
                <div className="proto-fte-field__actions">
                  <button
                    type="button"
                    className="proto-fte-field__btn proto-fte-field__btn--apply"
                    onClick={applyTitle}
                    disabled={updateTitle.isPending || !titleDirty || !effectiveSpaceId}
                    aria-label="Apply thread name"
                    title="Apply"
                  >
                    <Icon name="check" size={11} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="proto-fte-field__btn proto-fte-field__btn--clear"
                    onClick={clearTitle}
                    disabled={updateTitle.isPending}
                    aria-label="Clear thread name"
                    title="Clear"
                  >
                    <Icon name="xmark" size={11} aria-hidden />
                  </button>
                </div>
              </div>

              <div className="proto-fte-lock">
                <label className="proto-fte-lock__row">
                  <span className="proto-fte-lock__label">
                    <Icon name={isLocked ? 'lock' : 'unlock'} size={12} aria-hidden />
                    Lock thread name
                  </span>
                  <span
                    className="proto-fte-switch"
                    data-on={isLocked ? 'true' : 'false'}
                    role="switch"
                    aria-checked={isLocked}
                    tabIndex={0}
                    onClick={toggleLock}
                    onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleLock(); } }}
                  >
                    <span className="proto-fte-switch__thumb" />
                  </span>
                </label>
                <p className="proto-fte-lock__hint">
                  When on, Harvous keeps the thread name you choose.
                </p>
              </div>
            </section>

            <section className="proto-inspector-section proto-inspector-section--thread-trail">
              <div className="proto-side-panel__section-header">
                <p className="proto-inspector-section-title">
                  {nodeCount > 0 ? `${nodeCount} ${nodeCount === 1 ? 'note' : 'notes'}` : 'Connected notes'}
                </p>
                {effectiveSpaceId ? (
                  <button
                    type="button"
                    className="proto-inspector-connect-btn"
                    title="Connect another note"
                    onClick={() => setConnectOpen(true)}
                  >
                    <Icon name="plus" size={12} aria-hidden />
                    Connect
                  </button>
                ) : null}
              </div>

              <PrototypeStudyThreadTrail
                focusNoteId={noteId}
                repNoteId={repNoteId}
                spaceId={effectiveSpaceId ?? ''}
                nodes={thread.nodes}
                edges={thread.edges}
                memberOrder={thread.memberOrder ?? null}
                onOpen={openNote}
              />
            </section>
          </>
        )}
      </div>

      {effectiveSpaceId ? (
        <PrototypeConnectNoteSheet
          open={connectOpen}
          onOpenChange={setConnectOpen}
          spaceId={effectiveSpaceId}
          parentNoteId={noteId}
          placement="main-column-top-right"
          connectedNoteIds={connectedNoteIds}
        />
      ) : null}
    </>
  );
}

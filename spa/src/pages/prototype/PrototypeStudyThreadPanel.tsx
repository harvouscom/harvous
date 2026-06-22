/**
 * Study thread panel — expandable right-side layer over a note.
 * Layout mirrors PrototypeInspectorPane: minimal header + proto-inspector-section body blocks.
 * Name/auto/lock use proto-fte-* classes (same as PrototypeFolderTagEditor).
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import Icon from '@/components/react/Icon';
import PrototypeConnectNoteSheet from './PrototypeConnectNoteSheet';
import { usePrototypeHomeSpaceId } from '../../hooks/usePrototypeHomeSpaceId';
import {
  usePrototypeStudyThread,
  type StudyThreadNodeFlat,
  type StudyThreadEdge,
} from '../../hooks/queries/usePrototypeStudyThread';
import { useDisconnectNote } from '../../hooks/mutations/useDisconnectNote';
import { useUpdateStudyThreadTitle } from '../../hooks/mutations/useUpdateStudyThreadTitle';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { prototypeNoteRouteTo } from '@/lib/prototype-path';
import { noteParamSlug } from './proto-route-slugs';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import { stripHtmlForCard } from '@/utils/html-stripper';
import { protoRelativeCaptionAbbrev } from './proto-time';
import { studyThreadDisplayTitle } from '../../utils/study-thread-display-title';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function nodeDisplayTitle(node: StudyThreadNodeFlat): string {
  return (
    (node.noteType === 'resource' && node.resourceTitle ? node.resourceTitle : null) ??
    stripServerAutoUntitledNoteTitleForDisplay(node.title) ??
    `Note N${node.simpleNoteId?.toString().padStart(3, '0') ?? ''}`
  );
}

function nodePreview(node: StudyThreadNodeFlat): string {
  const raw =
    node.noteType === 'resource' && node.resourceDescription
      ? node.resourceDescription
      : node.content ?? '';
  return stripHtmlForCard(raw, false).slice(0, 120);
}

function findEdge(aId: string, bId: string, edges: StudyThreadEdge[]): StudyThreadEdge | undefined {
  return edges.find(
    (e) => (e.fromId === aId && e.toId === bId) || (e.fromId === bId && e.toId === aId),
  );
}

// ─── PanelNoteRow ─────────────────────────────────────────────────────────────

interface PanelNoteRowProps {
  node: StudyThreadNodeFlat;
  isFocus?: boolean;
  showDisconnect?: boolean;
  focusNoteId: string;
  edges: StudyThreadEdge[];
  onOpen: (id: string) => void;
}

function PanelNoteRow({ node, isFocus, showDisconnect, focusNoteId, edges, onOpen }: PanelNoteRowProps) {
  const disconnectNote = useDisconnectNote();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const edge = showDisconnect ? findEdge(focusNoteId, node.id, edges) : undefined;
  const title = nodeDisplayTitle(node);
  const preview = nodePreview(node);
  const rel = protoRelativeCaptionAbbrev(node.updatedAt);

  const handleDisconnect = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!edge) return;
    if (!confirmDisconnect) {
      setConfirmDisconnect(true);
      confirmTimerRef.current = setTimeout(() => setConfirmDisconnect(false), 2500);
      return;
    }
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    setConfirmDisconnect(false);
    disconnectNote.mutate({ fromNoteId: edge.fromId, toNoteId: edge.toId });
  };

  return (
    <li
      className="proto-note-row-item"
      data-active={isFocus ? 'true' : 'false'}
    >
      <button
        type="button"
        className="proto-note-row__main"
        onClick={() => onOpen(node.id)}
        aria-label={`Open ${title}`}
      >
        <div className="proto-note-row__title-line">
          <span className="pds-list-title proto-note-row__title-text">{title}</span>
          {isFocus ? <span className="proto-side-panel__current-badge">Current</span> : null}
        </div>
        {(rel || preview) ? (
          <div className="pds-list-preview proto-note-row__preview">
            {rel ? <span className="pds-list-timestamp">{rel}</span> : null}
            {rel && preview ? '  ' : null}
            {preview ? <span>{preview}</span> : null}
          </div>
        ) : null}
      </button>

      {edge ? (
        <div className="proto-note-row__menu">
          <button
            type="button"
            className={`proto-side-panel__action-btn proto-side-panel__disconnect-row-btn${confirmDisconnect ? ' proto-side-panel__disconnect-row-btn--confirm' : ''}`}
            title={confirmDisconnect ? 'Tap again to confirm' : 'Disconnect'}
            aria-label={confirmDisconnect ? `Confirm disconnect ${title}` : `Disconnect ${title}`}
            disabled={disconnectNote.isPending}
            onClick={handleDisconnect}
          >
            <Icon name={confirmDisconnect ? 'trash-can' : 'arrow-right-arrow-left'} size={11} aria-hidden />
          </button>
        </div>
      ) : null}
    </li>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

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
  const [connectAnchorRect, setConnectAnchorRect] = useState<DOMRect | null>(null);

  const openNote = (id: string) => {
    navigate({ to: prototypeNoteRouteTo(), params: { noteId: noteParamSlug(id) } });
  };

  // ── Thread name state (mirrors PrototypeFolderTagEditor pattern) ───────────
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

  const focusNode = thread?.nodes.find((n) => n.id === noteId) ?? null;
  const connectedNodes = thread?.nodes.filter((n) => n.id !== noteId) ?? [];

  return (
    <>
      {/* ── Minimal header: label + actions only ─────────────────────────── */}
      <div className="proto-side-panel__header proto-side-panel__header--minimal">
        <span className="proto-side-panel__header-label">
          <Icon name="arrow-right-arrow-left" size={13} aria-hidden />
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
              <Icon name="chevron-right" size={14} />
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
                <Icon name="chevron-right" size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Body: inspector-section blocks ───────────────────────────────── */}
      <div className="proto-side-panel__body">
        {isLoading ? (
          <p className="proto-inspector-muted" style={{ padding: '12px 14px' }}>Loading…</p>
        ) : isError || !thread?.success ? (
          <p className="proto-inspector-muted" style={{ padding: '12px 14px' }}>Could not load thread.</p>
        ) : (
          <>
            {/* Thread name section — same visual as inspector Folder section */}
            <section className="proto-inspector-section">
              <p className="proto-inspector-section-title">Thread name</p>

              {/* Source row: Automatic / Manual + "Use auto suggestion" */}
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

              {/* Name field — same as folder primary field */}
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

              {/* Lock toggle — same as folder lock */}
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
                  When on, Harvous won&apos;t change the thread name automatically when notes connect or change.
                </p>
              </div>
            </section>

            {/* Connected notes section */}
            <section className="proto-inspector-section">
              <div className="proto-side-panel__section-header">
                <p className="proto-inspector-section-title">
                  {nodeCount > 0 ? `${nodeCount} ${nodeCount === 1 ? 'note' : 'notes'}` : 'Connected notes'}
                </p>
                {effectiveSpaceId ? (
                  <button
                    type="button"
                    className="proto-inspector-connect-btn"
                    title="Connect another note"
                    onClick={(e) => { setConnectAnchorRect(e.currentTarget.getBoundingClientRect()); setConnectOpen(true); }}
                  >
                    <Icon name="plus" size={12} aria-hidden />
                    Connect
                  </button>
                ) : null}
              </div>

              {focusNode || connectedNodes.length > 0 ? (
                <ul className="proto-side-panel__note-list">
                  {focusNode ? (
                    <PanelNoteRow node={focusNode} isFocus focusNoteId={noteId} edges={thread.edges} onOpen={openNote} />
                  ) : null}
                  {connectedNodes.map((node) => (
                    <PanelNoteRow key={node.id} node={node} showDisconnect focusNoteId={noteId} edges={thread.edges} onOpen={openNote} />
                  ))}
                </ul>
              ) : (
                <div className="proto-side-panel__empty">
                  <p className="proto-inspector-muted">No notes connected yet.</p>
                </div>
              )}
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
          anchorRect={connectAnchorRect}
        />
      ) : null}
    </>
  );
}

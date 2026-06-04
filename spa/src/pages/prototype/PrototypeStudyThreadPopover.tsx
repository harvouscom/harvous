/**
 * Study thread popover — same floating pattern as PrototypeConnectNoteSheet.
 * Desktop: ProtoPopoverShell anchored to trigger button.
 * Mobile: Drawer bottom sheet.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from '@tanstack/react-router';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import Icon from '@/components/react/Icon';
import ProtoPopoverShell from './ProtoPopoverShell';
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
import { studyThreadDisplayTitle } from '../../utils/study-thread-display-title';

// ─── helpers ──────────────────────────────────────────────────────────────────

function nodeDisplayTitle(node: StudyThreadNodeFlat): string {
  return (
    (node.noteType === 'resource' && node.resourceTitle ? node.resourceTitle : null) ??
    stripServerAutoUntitledNoteTitleForDisplay(node.title) ??
    `Note N${node.simpleNoteId?.toString().padStart(3, '0') ?? ''}`
  );
}

function nodePreview(node: StudyThreadNodeFlat): string {
  const raw = node.noteType === 'resource' && node.resourceDescription
    ? node.resourceDescription
    : node.content ?? '';
  return stripHtmlForCard(raw, false).slice(0, 100);
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
    <li className="proto-note-row-item" data-active={isFocus ? 'true' : 'false'}>
      <button
        type="button"
        className="proto-note-row__main"
        onClick={() => onOpen(node.id)}
        aria-label={`Open ${title}`}
      >
        <div className="proto-note-row__title-line">
          <span className="pds-list-title proto-note-row__title-text">{title}</span>
        </div>
        {preview ? (
          <div className="pds-list-preview proto-note-row__preview">{preview}</div>
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

// ─── Main popover ─────────────────────────────────────────────────────────────

export interface PrototypeStudyThreadPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteId: string;
  spaceId: string;
  anchorRect?: DOMRect | null;
}

export default function PrototypeStudyThreadPopover({
  open,
  onOpenChange,
  noteId,
  spaceId,
  anchorRect = null,
}: PrototypeStudyThreadPopoverProps) {
  const navigate = useNavigate();
  const { isMobileSidebar } = useProtoShell();
  const { homeSpaceId } = usePrototypeHomeSpaceId();
  const effectiveSpaceId = (spaceId && spaceId.trim().length > 0 ? spaceId : null) ?? homeSpaceId ?? null;

  const cardRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const [connectOpen, setConnectOpen] = useState(false);
  const [connectAnchorRect, setConnectAnchorRect] = useState<DOMRect | null>(null);

  const { data: thread, isLoading, isError } = usePrototypeStudyThread(noteId, effectiveSpaceId);

  // ── Thread name state ──────────────────────────────────────────────────────
  const nodeCount = thread?.nodeCount ?? 0;
  const repNoteId = thread?.repNoteId ?? noteId;
  const isManual = Boolean(thread?.studyThreadUserOverride);
  const isLocked = Boolean(thread?.studyThreadPinned);
  const suggestedDisplay = stripServerAutoUntitledNoteTitleForDisplay(thread?.suggestedTitle) || '';
  const serverDisplay = thread ? studyThreadDisplayTitle(thread) : suggestedDisplay;

  const updateTitle = useUpdateStudyThreadTitle();
  const [titleDraft, setTitleDraft] = useState(serverDisplay);
  const [editingTitle, setEditingTitle] = useState(false);

  useEffect(() => {
    if (!editingTitle) setTitleDraft(isManual ? serverDisplay : suggestedDisplay);
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

  const openNote = (id: string) => {
    navigate({ to: prototypeNoteRouteTo(), params: { noteId: noteParamSlug(id) } });
    onOpenChange(false);
  };

  // ── Popover positioning (mirrors PrototypeConnectNoteSheet) ────────────────
  const shouldUseSheetPresentation =
    isMobileSidebar && typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const shouldUsePopover = open && !shouldUseSheetPresentation;

  useLayoutEffect(() => {
    if (!shouldUsePopover) return;
    const CARD_W = 400;
    const cardHeight = cardRef.current?.getBoundingClientRect().height ?? 480;
    const margin = 12;
    const offset = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const effectiveAnchor = anchorRect;

    let top: number;
    let left: number;
    if (effectiveAnchor) {
      top = effectiveAnchor.bottom + offset;
      if (top + cardHeight + margin > vh) top = effectiveAnchor.top - cardHeight - offset;
      if (top < margin) top = margin;
      left = effectiveAnchor.left;
      if (left + CARD_W + margin > vw) left = vw - CARD_W - margin;
      if (left < margin) left = margin;
    } else {
      left = Math.max(margin, (vw - CARD_W) / 2);
      top = Math.max(margin, Math.min(vh - cardHeight - margin, vh * 0.15));
    }
    setPosition({ top, left });
  }, [anchorRect, shouldUsePopover, nodeCount, isLoading]);

  useEffect(() => {
    if (!shouldUsePopover) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!cardRef.current) return;
      const target = e.target as Node | null;
      if (target && !cardRef.current.contains(target)) onOpenChange(false);
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenChange(false); };
    window.addEventListener('pointerdown', onPointerDown, { capture: true });
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, { capture: true } as AddEventListenerOptions);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [shouldUsePopover, onOpenChange]);

  // ── Content ────────────────────────────────────────────────────────────────
  const content = (
    <div className="proto-study-thread-popover">
      {/* Header */}
      <div className="proto-study-thread-popover__header">
        <div className="proto-study-thread-popover__title-row">
          <Icon name="arrow-right-arrow-left" size={12} aria-hidden />
          <span className="proto-study-thread-popover__title">Threads</span>
        </div>
        <button
          type="button"
          className="proto-side-panel__action-btn"
          onClick={() => onOpenChange(false)}
          aria-label="Close"
          title="Close"
        >
          <Icon name="xmark" size={12} />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="proto-study-thread-popover__body">
        {isLoading ? (
          <p className="proto-inspector-muted" style={{ padding: '8px 14px' }}>Loading…</p>
        ) : isError || !thread?.success ? (
          <p className="proto-inspector-muted" style={{ padding: '8px 14px' }}>Could not load thread.</p>
        ) : (
          <>
            {/* Thread name section */}
            <section className="proto-inspector-section">
              <p className="proto-inspector-section-title">Thread name</p>
              <div className="proto-fte-source">
                <div className="proto-fte-source__badge">
                  <Icon name={isManual ? 'wrench' : 'wand-magic-sparkles'} size={13} aria-hidden />
                  <span>{isManual ? 'Manual' : 'Automatic'}</span>
                </div>
                {isManual ? (
                  <button type="button" className="proto-fte-source__action" onClick={useAutoSuggestion} disabled={updateTitle.isPending}>
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
                  <button type="button" className="proto-fte-field__btn proto-fte-field__btn--apply" onClick={applyTitle} disabled={updateTitle.isPending || !titleDirty || !effectiveSpaceId} aria-label="Apply" title="Apply">
                    <Icon name="check" size={11} aria-hidden />
                  </button>
                  <button type="button" className="proto-fte-field__btn proto-fte-field__btn--clear" onClick={clearTitle} disabled={updateTitle.isPending} aria-label="Clear" title="Clear">
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
                  <span className="proto-fte-switch" data-on={isLocked ? 'true' : 'false'} role="switch" aria-checked={isLocked} tabIndex={0}
                    onClick={toggleLock}
                    onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleLock(); } }}>
                    <span className="proto-fte-switch__thumb" />
                  </span>
                </label>
                <p className="proto-fte-lock__hint">When on, Harvous won&apos;t change the thread name automatically when notes connect or change.</p>
              </div>
            </section>

            {/* Connected notes section */}
            <section className="proto-inspector-section">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <p className="proto-inspector-section-title" style={{ marginBottom: 0 }}>
                  {nodeCount > 0 ? `${nodeCount} ${nodeCount === 1 ? 'note' : 'notes'}` : 'Connected notes'}
                </p>
                {effectiveSpaceId ? (
                  <button type="button" className="proto-inspector-connect-btn" title="Connect another note"
                    onClick={(e) => { setConnectAnchorRect(e.currentTarget.getBoundingClientRect()); setConnectOpen(true); }}>
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
                <p className="proto-inspector-muted">No notes connected yet.</p>
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
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  if (shouldUsePopover && typeof document !== 'undefined') {
    return createPortal(
      <ProtoPopoverShell
        ref={cardRef}
        role="dialog"
        aria-label="Threads"
        className="proto-connect-note-popover"
        style={{
          position: 'fixed',
          top: position?.top ?? -9999,
          left: position?.left ?? -9999,
          zIndex: 6000,
          width: 400,
        }}
      >
        {content}
      </ProtoPopoverShell>,
      document.body,
    );
  }

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        onOverlayClick={() => onOpenChange(false)}
        overlayClassName="proto-connect-note-sheet-overlay"
        className="proto-study-thread-drawer"
      >
        {content}
      </DrawerContent>
    </Drawer.Root>
  );
}

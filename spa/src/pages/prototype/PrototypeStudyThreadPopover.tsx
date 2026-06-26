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
import PrototypeStudyThreadTrail from './PrototypeStudyThreadTrail';
import { useDismissOnOutside } from '../../hooks/usePopoverDismiss';
import { usePrototypeHomeSpaceId } from '../../hooks/usePrototypeHomeSpaceId';
import {
  usePrototypeStudyThread,
} from '../../hooks/queries/usePrototypeStudyThread';
import { useUpdateStudyThreadTitle } from '../../hooks/mutations/useUpdateStudyThreadTitle';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { prototypeNoteRouteTo } from '@/lib/prototype-path';
import { noteParamSlug } from './proto-route-slugs';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import { studyThreadDisplayTitle } from '../../utils/study-thread-display-title';

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

  const openNote = (id: string) => {
    navigate({ to: prototypeNoteRouteTo(), params: { noteId: noteParamSlug(id) } });
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

  useDismissOnOutside(cardRef, () => onOpenChange(false), shouldUsePopover, {
    ignoreSelector: '.proto-sidebar-root, .proto-inspector, .proto-inspector-mobile-panel, .proto-inspector-desktop',
  });

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
              <PrototypeStudyThreadTrail
                focusNoteId={noteId}
                nodes={thread.nodes}
                edges={thread.edges}
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

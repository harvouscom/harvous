/**
 * Study thread popover — same floating pattern as PrototypeConnectNoteSheet.
 * Desktop: fixed top-right of the main column.
 * Mobile: Drawer bottom sheet.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { useProtoAnchoredPopoverPosition } from './useProtoAnchoredPopoverPosition';
import ProtoSpaceLoading from './ProtoSpaceLoading';

// ─── Main popover ─────────────────────────────────────────────────────────────

export interface PrototypeStudyThreadPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteId: string;
  spaceId: string;
  /** Note ids already linked to the focus note — excluded from the connect picker. */
  connectedNoteIds?: string[];
}

export default function PrototypeStudyThreadPopover({
  open,
  onOpenChange,
  noteId,
  spaceId,
  connectedNoteIds = [],
}: PrototypeStudyThreadPopoverProps) {
  const navigate = useNavigate();
  const { isMobileSidebar } = useProtoShell();
  const { homeSpaceId } = usePrototypeHomeSpaceId();
  const effectiveSpaceId = (spaceId && spaceId.trim().length > 0 ? spaceId : null) ?? homeSpaceId ?? null;

  const cardRef = useRef<HTMLDivElement | null>(null);

  const [connectOpen, setConnectOpen] = useState(false);

  // Pin thread fetch to the note where the popover was opened — route noteId only drives trail focus.
  const sessionQueryNoteIdRef = useRef<string | null>(null);
  if (open) {
    if (!sessionQueryNoteIdRef.current) sessionQueryNoteIdRef.current = noteId;
  } else {
    sessionQueryNoteIdRef.current = null;
  }
  const threadQueryNoteId = sessionQueryNoteIdRef.current ?? noteId;

  const { data: thread, isLoading, isError } = usePrototypeStudyThread(threadQueryNoteId, effectiveSpaceId);

  const effectiveConnectedNoteIds = useMemo(
    () =>
      thread?.nodes?.length
        ? thread.nodes.map((n) => n.id).filter((id) => id !== noteId)
        : connectedNoteIds,
    [thread?.nodes, noteId, connectedNoteIds],
  );

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

  const { position } = useProtoAnchoredPopoverPosition(
    cardRef,
    {},
    { enabled: shouldUsePopover, maxHeightPx: 600, vhFraction: 0.8, strategy: 'main-column-top-right' },
    [nodeCount, isLoading, isError, connectOpen, titleDraft, editingTitle],
  );

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
        {isLoading && !thread ? (
          <ProtoSpaceLoading label="Loading Thread" />
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
                <p className="proto-fte-lock__hint">When on, Harvous keeps the thread name you choose.</p>
              </div>
            </section>

            {/* Connected notes section */}
            <section className="proto-inspector-section proto-inspector-section--thread-trail">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <p className="proto-inspector-section-title" style={{ marginBottom: 0 }}>
                  {nodeCount > 0 ? `${nodeCount} ${nodeCount === 1 ? 'note' : 'notes'}` : 'Connected notes'}
                </p>
                {effectiveSpaceId ? (
                  <button type="button" className="proto-inspector-connect-btn" title="Connect another note"
                    onClick={() => setConnectOpen(true)}>
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
          connectedNoteIds={effectiveConnectedNoteIds}
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

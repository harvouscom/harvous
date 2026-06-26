import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { useConnectNote } from '../../hooks/mutations/useConnectNote';
import { useUpdateStudyThreadTitle } from '../../hooks/mutations/useUpdateStudyThreadTitle';
import Icon from '@/components/react/Icon';
import ProtoPopoverShell from './ProtoPopoverShell';
import { useDismissOnOutside } from '../../hooks/usePopoverDismiss';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { PrototypeAddNotesPicker } from './PrototypeAddNotesSheet';
import type { SpaceNoteRow } from '../../hooks/queries/useSpace';

const MIN_THREAD_NOTES = 2;

export interface PrototypeCreateThreadSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  spaceNotes: SpaceNoteRow[];
  onCreated: (repNoteId: string) => void;
}

export default function PrototypeCreateThreadSheet({
  open,
  onOpenChange,
  spaceId,
  spaceNotes,
  onCreated,
}: PrototypeCreateThreadSheetProps) {
  const { isMobileSidebar } = useProtoShell();
  const connectNote = useConnectNote();
  const updateTitle = useUpdateStudyThreadTitle();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [threadName, setThreadName] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setThreadName('');
      setSelectedIds([]);
      setActionError(null);
    }
  }, [open]);

  const isPending = connectNote.isPending || updateTitle.isPending;
  const canSubmit = threadName.trim().length > 0 && selectedIds.length >= MIN_THREAD_NOTES && !isPending;

  const shouldUseSheetPresentation =
    isMobileSidebar && typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const shouldUsePopover = open && !shouldUseSheetPresentation;

  const handleSubmit = async () => {
    const title = threadName.trim();
    if (!title || selectedIds.length < MIN_THREAD_NOTES) return;
    const [first, ...rest] = selectedIds;
    if (!first) return;
    setActionError(null);
    try {
      for (const linkedNoteId of rest) {
        await connectNote.mutateAsync({ parentNoteId: first, linkedNoteId, spaceId });
      }
      await updateTitle.mutateAsync({
        repNoteId: first,
        spaceId,
        title,
        userOverride: true,
      });
      onOpenChange(false);
      onCreated(first);
      try {
        window.toast?.success('Thread created');
      } catch {
        /* ignore */
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not create thread.');
    }
  };

  useLayoutEffect(() => {
    if (!shouldUsePopover) return;
    const cardHeight = cardRef.current?.getBoundingClientRect().height ?? 480;
    const cardWidth = cardRef.current?.getBoundingClientRect().width ?? 360;
    const viewportMargin = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setPosition({
      left: Math.max(viewportMargin, (vw - cardWidth) / 2),
      top: Math.max(viewportMargin, Math.min(vh - cardHeight - viewportMargin, vh * 0.12)),
    });
  }, [shouldUsePopover, selectedIds.length, threadName]);

  useDismissOnOutside(cardRef, () => onOpenChange(false), shouldUsePopover);

  const content = (
    <>
      <div className="proto-study-thread-popover__header">
        <div className="proto-study-thread-popover__title-row">
          <Icon name="arrow-right-arrow-left" size={13} aria-hidden />
          <span className="proto-study-thread-popover__title">New thread</span>
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

      <div className="proto-create-folder-sheet__name-wrap">
        <label className="proto-inspector-section-title proto-create-folder-sheet__field-label" htmlFor="proto-create-thread-name">
          Thread name
        </label>
        <input
          id="proto-create-thread-name"
          type="text"
          className="proto-create-folder-sheet__name-input"
          value={threadName}
          onChange={(e) => {
            setThreadName(e.target.value);
            setActionError(null);
          }}
          placeholder="e.g. Letters to the church"
          autoFocus={open}
        />
      </div>

      <p className="proto-inspector-section-title proto-create-folder-sheet__notes-label">
        Choose notes (at least {MIN_THREAD_NOTES})
      </p>

      <PrototypeAddNotesPicker
        key={open ? 'open' : 'closed'}
        spaceId={spaceId}
        spaceNotes={spaceNotes}
        selectedIds={selectedIds}
        onSelectedIdsChange={setSelectedIds}
        showListScopeToggle
        defaultListScope="unsorted"
      />

      {actionError ? (
        <p className="proto-connect-note-sheet__error" role="alert">
          {actionError}
        </p>
      ) : null}

      <div className="proto-add-notes-sheet__footer">
        <button
          type="button"
          className="proto-share-popover__primary"
          disabled={!canSubmit}
          onClick={() => void handleSubmit()}
        >
          {isPending ? 'Creating…' : 'Create thread'}
        </button>
      </div>
    </>
  );

  if (!open) return null;

  if (shouldUsePopover && typeof document !== 'undefined') {
    return createPortal(
      <ProtoPopoverShell
        ref={cardRef}
        role="dialog"
        aria-label="New thread"
        className="proto-connect-note-popover proto-create-thread-popover"
        style={{
          position: 'fixed',
          top: position?.top ?? -9999,
          left: position?.left ?? -9999,
          zIndex: 6000,
        }}
      >
        <div className="proto-connect-note-sheet proto-connect-note-sheet--popover proto-create-thread-sheet">{content}</div>
      </ProtoPopoverShell>,
      document.body,
    );
  }

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        onOverlayClick={() => onOpenChange(false)}
        overlayClassName="proto-connect-note-sheet-overlay"
        className="proto-connect-note-sheet proto-create-thread-sheet"
      >
        {content}
      </DrawerContent>
    </Drawer.Root>
  );
}

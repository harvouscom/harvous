import { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import Icon from '@/components/react/Icon';
import type { SpaceGroupStudyThread } from '../../hooks/queries/useSpaceGroupThreads';
import { useSetCurrentSpaceThread } from '../../hooks/mutations/useSetCurrentSpaceThread';
import { useSheetPresentation } from './design-system/useSheetPresentation';
import { useProtoOverlayMotion } from '../../hooks/useProtoOverlayMotion';
import { useDismissOnOutside } from '../../hooks/usePopoverDismiss';
import { useProtoDialogFocus } from '../../hooks/useProtoDialogFocus';
import { useProtoAnchoredPopoverPosition } from './useProtoAnchoredPopoverPosition';
import ProtoPopoverShell from './ProtoPopoverShell';
import ProtoDialogBackdrop, { portaledDialogShellClassName } from './ProtoDialogBackdrop';
import PrototypeListEmptyState from './PrototypeListEmptyState';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  currentThreadId: string | null;
  otherThreads: SpaceGroupStudyThread[];
  isOwner: boolean;
  onStartThread: () => void;
  onChanged?: (threadId: string) => void;
  /** Fired after the space is left with no current Thread. */
  onCleared?: () => void;
};

export default function PrototypeChangeSharedThreadSheet({
  open,
  onOpenChange,
  spaceId,
  currentThreadId,
  otherThreads,
  isOwner,
  onStartThread,
  onChanged,
  onCleared,
}: Props) {
  const setCurrent = useSetCurrentSpaceThread();
  const { mounted, exiting } = useProtoOverlayMotion(open);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const headingId = useId();
  const [actionError, setActionError] = useState<string | null>(null);

  const isPending = setCurrent.isPending;
  const { asSheet: shouldUseSheetPresentation } = useSheetPresentation();
  const usePopoverPresentation = !shouldUseSheetPresentation;
  const showPopoverPortal = usePopoverPresentation && mounted;
  const { position } = useProtoAnchoredPopoverPosition(
    cardRef,
    {},
    {
      enabled: showPopoverPortal,
      strategy: 'centered',
      topVhFraction: 0.18,
      fallbackWidth: 360,
      fallbackHeight: 280,
    },
    [actionError, otherThreads.length],
  );

  const makeCurrent = async (threadId: string) => {
    if (threadId === currentThreadId) {
      onOpenChange(false);
      return;
    }
    setActionError(null);
    try {
      await setCurrent.mutateAsync({ spaceId, threadId });
      onChanged?.(threadId);
      onOpenChange(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not set this Thread as current.');
    }
  };

  /**
   * Clearing is not deleting: the Thread keeps its notes and reappears in the
   * space's Threads list. Without this the space could never get back to the
   * no-current-Thread state it starts in.
   */
  const clearCurrent = async () => {
    if (!currentThreadId) return;
    setActionError(null);
    try {
      await setCurrent.mutateAsync({ spaceId, threadId: currentThreadId, isPinned: false });
      onCleared?.();
      onOpenChange(false);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Could not clear the current Thread.',
      );
    }
  };

  useDismissOnOutside(cardRef, () => onOpenChange(false), open && usePopoverPresentation && !isPending, {
    dismissOnEscape: false,
  });
  useProtoDialogFocus({
    open: open && showPopoverPortal,
    dialogRef: cardRef,
    onDismiss: () => {
      if (!isPending) onOpenChange(false);
    },
  });

  if (!isOwner) return null;

  const content = (
    <>
      <div className="proto-study-thread-popover__header">
        <div className="proto-study-thread-popover__title-row">
          <span id={headingId} className="proto-study-thread-popover__title" role="heading" aria-level={2}>
            Change current Thread
          </span>
        </div>
        <button
          type="button"
          className="proto-side-panel__action-btn"
          onClick={() => onOpenChange(false)}
          aria-label="Close"
          disabled={isPending}
        >
          <Icon name="xmark" size={12} />
        </button>
      </div>

      <div className="proto-change-shared-thread__body">
        {otherThreads.length > 0 ? (
          <ul className="proto-shared-thread-list">
            {otherThreads.map((thread) => (
              <li key={thread.id} className="proto-glass-surface proto-shared-thread-list-row">
                <button
                  type="button"
                  className="proto-shared-thread-list-row__open pds-list-title"
                  disabled={isPending}
                  onClick={() => void makeCurrent(thread.id)}
                >
                  {thread.title}
                </button>
                <button
                  type="button"
                  className="proto-shared-thread-action"
                  disabled={isPending}
                  onClick={() => void makeCurrent(thread.id)}
                >
                  Set current
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="proto-change-shared-thread__empty">
            <PrototypeListEmptyState
              iconName="arrow-right-arrow-left"
              title="No other Threads yet"
              description="Start a new Thread to switch what’s current for this space."
            />
          </div>
        )}

        {actionError ? (
          <p className="proto-connect-note-sheet__error" role="alert">
            {actionError}
          </p>
        ) : null}
      </div>

      <div className="proto-add-notes-sheet__footer proto-sheet-footer--stacked">
        <button
          type="button"
          className="proto-share-popover__primary"
          disabled={isPending}
          onClick={() => {
            onOpenChange(false);
            onStartThread();
          }}
        >
          Start a Thread
        </button>
        {currentThreadId ? (
          <button
            type="button"
            className="proto-sheet-quiet-action"
            disabled={isPending}
            onClick={() => void clearCurrent()}
          >
            Clear current Thread
          </button>
        ) : null}
      </div>
    </>
  );

  if (showPopoverPortal && typeof document !== 'undefined') {
    return createPortal(
      <>
        <ProtoDialogBackdrop
          exiting={exiting}
          onDismiss={() => onOpenChange(false)}
          aria-label="Close Change current Thread dialog"
        />
        <ProtoPopoverShell
          ref={cardRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={headingId}
          className={portaledDialogShellClassName(
            'proto-connect-note-popover proto-change-shared-thread-popover',
            exiting,
          )}
          style={{
            position: 'fixed',
            top: position?.top ?? -9999,
            left: position?.left ?? -9999,
            zIndex: 6000,
          }}
        >
          <div className="proto-connect-note-sheet proto-connect-note-sheet--popover proto-change-shared-thread">
            {content}
          </div>
        </ProtoPopoverShell>
      </>,
      document.body,
    );
  }

  if (!open) return null;
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        onOverlayClick={() => {
          if (!isPending) onOpenChange(false);
        }}
        overlayClassName="proto-connect-note-sheet-overlay"
        className="proto-connect-note-sheet proto-change-shared-thread"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
      >
        {content}
      </DrawerContent>
    </Drawer.Root>
  );
}

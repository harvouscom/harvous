import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import Icon from '@/components/react/Icon';
import { useCreateSharedThread, type CreatedSharedThread } from '../../hooks/mutations/useCreateSharedThread';
import { useSetCurrentSpaceThread } from '../../hooks/mutations/useSetCurrentSpaceThread';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { useProtoOverlayMotion } from '../../hooks/useProtoOverlayMotion';
import { useDismissOnOutside } from '../../hooks/usePopoverDismiss';
import { useProtoDialogFocus } from '../../hooks/useProtoDialogFocus';
import { useProtoAnchoredPopoverPosition } from './useProtoAnchoredPopoverPosition';
import ProtoPopoverShell from './ProtoPopoverShell';
import ProtoDialogBackdrop, { portaledDialogShellClassName } from './ProtoDialogBackdrop';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  spaceColor?: string | null;
  isOwner: boolean;
  onCreated: (thread: CreatedSharedThread) => void;
  onPinFailure?: () => Promise<unknown> | unknown;
};

export function sharedThreadSubmitMode(
  createdThreadId: string | null,
  title: string,
  isPending: boolean,
): 'create' | 'retry-pin' | null {
  if (isPending) return null;
  if (createdThreadId) return 'retry-pin';
  return title.trim() ? 'create' : null;
}

export default function PrototypeCreateSharedThreadSheet({
  open,
  onOpenChange,
  spaceId,
  spaceColor,
  isOwner,
  onCreated,
  onPinFailure,
}: Props) {
  const { isMobileSidebar } = useProtoShell();
  const createThread = useCreateSharedThread();
  const setCurrent = useSetCurrentSpaceThread();
  const { mounted, exiting } = useProtoOverlayMotion(open);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const headingId = useId();
  const [title, setTitle] = useState('');
  const [createdThread, setCreatedThread] = useState<CreatedSharedThread | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (open) return;
    setTitle('');
    setActionError(null);
  }, [open, createdThread]);

  const isPending = createThread.isPending || setCurrent.isPending;
  const submitMode = sharedThreadSubmitMode(createdThread?.id ?? null, title, isPending);
  const canSubmit = submitMode !== null;
  const shouldUseSheetPresentation =
    isMobileSidebar && typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
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
      fallbackHeight: 260,
    },
    [title, actionError, createdThread?.id],
  );

  const pinCreatedThread = async (thread: CreatedSharedThread) => {
    try {
      await setCurrent.mutateAsync({ spaceId, threadId: thread.id });
      setCreatedThread(null);
      setTitle('');
      onOpenChange(false);
      onCreated({ ...thread, isPinned: true });
      try {
        window.toast?.success('Thread created');
      } catch {
        /* ignore */
      }
    } catch (error) {
      setCreatedThread(thread);
      setActionError(
        error instanceof Error
          ? `Thread created, but it could not be set as current: ${error.message}`
          : 'Thread created, but it could not be set as current.',
      );
      try {
        await onPinFailure?.();
      } catch {
        /* The inline retry remains available even if refetch also failed. */
      }
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setActionError(null);
    if (submitMode === 'retry-pin' && createdThread) {
      await pinCreatedThread(createdThread);
      return;
    }
    try {
      const thread = await createThread.mutateAsync({ spaceId, title, color: spaceColor });
      setCreatedThread(thread);
      await pinCreatedThread(thread);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not start this Thread.');
    }
  };

  useDismissOnOutside(cardRef, () => onOpenChange(false), open && usePopoverPresentation && !isPending, {
    dismissOnEscape: false,
  });
  useProtoDialogFocus({
    open: open && showPopoverPortal,
    dialogRef: cardRef,
    initialFocusRef: titleInputRef,
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
            Start a Thread
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

      <div className="proto-create-shared-thread__field">
        <label className="proto-inspector-section-title" htmlFor="proto-create-shared-thread-title">
          Thread title
        </label>
        <input
          ref={titleInputRef}
          id="proto-create-shared-thread-title"
          className="proto-create-folder-sheet__name-input"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setActionError(null);
          }}
          placeholder="What are you exploring?"
          autoFocus={open}
          disabled={isPending || createdThread !== null}
        />
      </div>

      {createdThread ? (
        <p className="proto-caption">“{createdThread.title}” was created. Retry setting this same Thread as current.</p>
      ) : null}

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
          {isPending ? 'Starting…' : createdThread ? 'Retry setting current' : 'Start Thread'}
        </button>
      </div>
    </>
  );

  if (showPopoverPortal && typeof document !== 'undefined') {
    return createPortal(
      <>
        <ProtoDialogBackdrop
          exiting={exiting}
          onDismiss={() => onOpenChange(false)}
          aria-label="Close Start a Thread dialog"
        />
        <ProtoPopoverShell
          ref={cardRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={headingId}
          className={portaledDialogShellClassName(
            'proto-connect-note-popover proto-create-shared-thread-popover',
            exiting,
          )}
          style={{
            position: 'fixed',
            top: position?.top ?? -9999,
            left: position?.left ?? -9999,
            zIndex: 6000,
          }}
        >
          <div className="proto-connect-note-sheet proto-connect-note-sheet--popover proto-create-shared-thread">
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
        className="proto-connect-note-sheet proto-create-shared-thread"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
      >
        {content}
      </DrawerContent>
    </Drawer.Root>
  );
}

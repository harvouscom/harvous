import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/react/Icon';
import { useProtoOverlayMotion } from '../../hooks/useProtoOverlayMotion';
import { useDismissOnOutside } from '../../hooks/usePopoverDismiss';
import { useProtoDialogFocus } from '../../hooks/useProtoDialogFocus';
import { useProtoAnchoredPopoverPosition } from './useProtoAnchoredPopoverPosition';
import ProtoPopoverShell from './ProtoPopoverShell';
import ProtoDialogBackdrop, { portaledDialogShellClassName } from './ProtoDialogBackdrop';
import '../../styles/prototype-shared-threads.css';

type Props = {
  open: boolean;
  threadTitle: string;
  onAdd: () => void;
  onSkip: () => void;
};

/**
 * One-time prompt offered when a fresh shared-space draft could join the space's
 * current Thread — replaces the old always-visible inline Thread picker with an
 * explicit choice made before the editor is shown.
 */
export default function PrototypeAddToThreadConfirm({ open, threadTitle, onAdd, onSkip }: Props) {
  const { mounted, exiting } = useProtoOverlayMotion(open);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const headingId = useId();

  const { position } = useProtoAnchoredPopoverPosition(
    cardRef,
    {},
    { enabled: mounted, strategy: 'centered', topVhFraction: 0.22, fallbackWidth: 340, fallbackHeight: 170 },
    [threadTitle],
  );

  useDismissOnOutside(cardRef, onSkip, mounted, { dismissOnEscape: false });
  useProtoDialogFocus({
    open: mounted,
    dialogRef: cardRef,
    onDismiss: onSkip,
  });

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <>
      <ProtoDialogBackdrop exiting={exiting} onDismiss={onSkip} aria-label="Close Add to Thread dialog" />
      <ProtoPopoverShell
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className={portaledDialogShellClassName('proto-connect-note-popover proto-add-to-thread-confirm', exiting)}
        style={{
          position: 'fixed',
          top: position?.top ?? -9999,
          left: position?.left ?? -9999,
          zIndex: 6000,
        }}
      >
        <div className="proto-connect-note-sheet proto-connect-note-sheet--popover">
          <div className="proto-study-thread-popover__header">
            <div className="proto-study-thread-popover__title-row">
              <Icon name="arrow-right-arrow-left" size={13} aria-hidden />
              <span id={headingId} className="proto-study-thread-popover__title" role="heading" aria-level={2}>
                Add this note to {threadTitle}?
              </span>
            </div>
          </div>
          <div className="proto-add-to-thread-confirm__footer">
            <button type="button" className="proto-shared-thread-action" onClick={onSkip}>
              Skip
            </button>
            <button
              type="button"
              className="proto-shared-thread-action proto-shared-thread-action--primary"
              onClick={onAdd}
            >
              Add
            </button>
          </div>
        </div>
      </ProtoPopoverShell>
    </>,
    document.body,
  );
}

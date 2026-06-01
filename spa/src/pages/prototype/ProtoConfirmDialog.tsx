import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import Icon, { type IconName } from '@/components/react/Icon';

export type ProtoConfirmDialogProps = {
  /** Primary title — matches native `confirmationDialog` title. */
  title: string;
  /** Optional body copy (native `message:`). */
  message?: string;
  /** Optional leading icon; pass `null` to hide. Defaults to warning circle for destructive confirms. */
  icon?: IconName | null;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Centered destructive confirmation — native `confirmationDialog` parity for prototype.
 * Portaled above shell chrome; Escape and scrim tap cancel.
 */
export default function ProtoConfirmDialog({
  title,
  message,
  icon = 'circle-exclamation',
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  busy = false,
  onConfirm,
  onCancel,
}: ProtoConfirmDialogProps) {
  const titleId = useId();
  const messageId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="proto-confirm-dialog-overlay"
      role="presentation"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        className="proto-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? messageId : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="proto-confirm-dialog__content">
          {icon ? (
            <Icon name={icon} size={40} className="proto-confirm-dialog__icon" aria-hidden />
          ) : null}
          <h2 id={titleId} className="proto-confirm-dialog__title">
            {title}
          </h2>
          {message ? (
            <p id={messageId} className="proto-confirm-dialog__message">
              {message}
            </p>
          ) : null}
        </div>
        <div className="proto-confirm-dialog__actions">
          <button
            ref={cancelRef}
            type="button"
            className="proto-confirm-dialog__btn proto-confirm-dialog__btn--cancel"
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="proto-confirm-dialog__btn proto-confirm-dialog__btn--destructive"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? 'Deleting…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

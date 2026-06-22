import { useId } from 'react';
import Icon from '@/components/react/Icon';

export type DeleteConfirmBarProps = {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  editLabel?: string;
  busy?: boolean;
  titleId?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** When provided, an Edit (pencil) action is shown before the destructive action. */
  onEdit?: () => void;
};

/** Single-row destructive confirm — heading plus optional edit, then trash / dismiss icons. */
export default function DeleteConfirmBar({
  title,
  confirmLabel = 'Delete',
  cancelLabel = 'Keep',
  editLabel = 'Edit',
  busy = false,
  titleId: titleIdProp,
  onConfirm,
  onCancel,
  onEdit,
}: DeleteConfirmBarProps) {
  const generatedTitleId = useId();
  const titleId = titleIdProp ?? generatedTitleId;

  return (
    <>
      {title ? (
        <>
          <p id={titleId} className="harvous-delete-confirm__title">
            {title}
          </p>
          <span className="harvous-delete-confirm__divider" aria-hidden />
        </>
      ) : null}
      {onEdit ? (
        <>
          <button
            type="button"
            className="harvous-delete-confirm__icon-btn"
            disabled={busy}
            aria-label={editLabel}
            title={editLabel}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={onEdit}
          >
            <Icon name="pen" size={13} aria-hidden />
          </button>
          <span className="harvous-delete-confirm__divider" aria-hidden />
        </>
      ) : null}
      <button
        type="button"
        className="harvous-delete-confirm__icon-btn harvous-delete-confirm__icon-btn--destructive"
        disabled={busy}
        aria-label={busy ? 'Deleting' : confirmLabel}
        title={busy ? 'Deleting' : confirmLabel}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={onConfirm}
      >
        <Icon name="trash-can" size={15} aria-hidden />
      </button>
      <span className="harvous-delete-confirm__divider" aria-hidden />
      <button
        type="button"
        className="harvous-delete-confirm__icon-btn"
        disabled={busy}
        aria-label={cancelLabel}
        title={cancelLabel}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={onCancel}
      >
        <Icon name="xmark" size={13} aria-hidden />
      </button>
    </>
  );
}

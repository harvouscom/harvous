import { useId } from 'react';
import Icon from '@/components/react/Icon';

export type DeleteConfirmBarProps = {
  title: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  titleId?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Single-row destructive confirm — heading plus trash / dismiss icon actions. */
export default function DeleteConfirmBar({
  title,
  confirmLabel = 'Delete',
  cancelLabel = 'Keep',
  busy = false,
  titleId: titleIdProp,
  onConfirm,
  onCancel,
}: DeleteConfirmBarProps) {
  const generatedTitleId = useId();
  const titleId = titleIdProp ?? generatedTitleId;

  return (
    <>
      <p id={titleId} className="harvous-delete-confirm__title">
        {title}
      </p>
      <span className="harvous-delete-confirm__divider" aria-hidden />
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

import { useId } from 'react';
import Icon from '@/components/react/Icon';

export type DeleteConfirmBarProps = {
  title?: string;
  /** Optional supporting line under the title — switches to a roomier stacked layout. */
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  editLabel?: string;
  busy?: boolean;
  titleId?: string;
  descriptionId?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** When provided, an Edit (pencil) action is shown before the destructive action. */
  onEdit?: () => void;
};

function ConfirmActions({
  confirmLabel,
  cancelLabel,
  editLabel,
  busy,
  onConfirm,
  onCancel,
  onEdit,
}: {
  confirmLabel: string;
  cancelLabel: string;
  editLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onEdit?: () => void;
}) {
  return (
    <>
      {onEdit ? (
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

/**
 * Shared delete confirm contents — compact single-row when title-only;
 * stacked copy + actions when `description` is set. No hairline dividers.
 */
export default function DeleteConfirmBar({
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Keep',
  editLabel = 'Edit',
  busy = false,
  titleId: titleIdProp,
  descriptionId: descriptionIdProp,
  onConfirm,
  onCancel,
  onEdit,
}: DeleteConfirmBarProps) {
  const generatedTitleId = useId();
  const generatedDescriptionId = useId();
  const titleId = titleIdProp ?? generatedTitleId;
  const descriptionId = descriptionIdProp ?? generatedDescriptionId;
  const descriptionText = description?.trim() || '';
  const stacked = Boolean(descriptionText);

  const actions = (
    <ConfirmActions
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      editLabel={editLabel}
      busy={busy}
      onConfirm={onConfirm}
      onCancel={onCancel}
      onEdit={onEdit}
    />
  );

  if (stacked) {
    return (
      <div className="harvous-delete-confirm__stack">
        <div className="harvous-delete-confirm__copy">
          {title ? (
            <p id={titleId} className="harvous-delete-confirm__title">
              {title}
            </p>
          ) : null}
          <p id={descriptionId} className="harvous-delete-confirm__description">
            {descriptionText}
          </p>
        </div>
        <div className="harvous-delete-confirm__actions">{actions}</div>
      </div>
    );
  }

  return (
    <>
      {title ? <p id={titleId} className="harvous-delete-confirm__title">{title}</p> : null}
      {actions}
    </>
  );
}

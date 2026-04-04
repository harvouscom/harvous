import React from 'react';
import ButtonSmall from './ButtonSmall';

interface EraseConfirmDialogProps {
  contentType?: string;
  onCancel: () => void;
  onConfirm: () => void;
  /** Thread erase in flight: disables actions and shows progress on the confirm button */
  busy?: boolean;
}

export default function EraseConfirmDialog({
  contentType = '',
  onCancel,
  onConfirm,
  busy = false,
}: EraseConfirmDialogProps) {
  return (
    <div style={{
      display: 'flex',
      gap: '0.75rem',
      justifyContent: 'flex-end',
      flexWrap: 'wrap'
    }}>
      <ButtonSmall
        type="button"
        onClick={onCancel}
        state="Secondary"
        disabled={busy}
      >
        Cancel
      </ButtonSmall>
      <ButtonSmall
        type="button"
        onClick={onConfirm}
        state="Delete"
        disabled={busy}
      >
        {busy ? 'Erasing…' : 'Erase'}
      </ButtonSmall>
    </div>
  );
}

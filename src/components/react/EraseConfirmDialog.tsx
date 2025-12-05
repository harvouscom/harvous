import React from 'react';
import ButtonSmall from './ButtonSmall';

interface EraseConfirmDialogProps {
  contentType?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function EraseConfirmDialog({
  contentType = '',
  onCancel,
  onConfirm
}: EraseConfirmDialogProps) {
  return (
    <div style={{
      display: 'flex',
      gap: '0.75rem',
      justifyContent: 'flex-end'
    }}>
      <ButtonSmall
        type="button"
        onClick={onCancel}
        state="Secondary"
      >
        Cancel
      </ButtonSmall>
      <ButtonSmall
        type="button"
        onClick={onConfirm}
        state="Delete"
      >
        Erase
      </ButtonSmall>
    </div>
  );
}

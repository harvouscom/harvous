import React from 'react';
import ButtonSmall from './ButtonSmall';

interface ClearDataConfirmDialogProps {
  onCancel: () => void;
  onConfirm: () => void;
}

export default function ClearDataConfirmDialog({
  onCancel,
  onConfirm
}: ClearDataConfirmDialogProps) {
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
        Clear All Data
      </ButtonSmall>
    </div>
  );
}


import React from 'react';
import ButtonSmall from './ButtonSmall';

interface DeleteAccountConfirmDialogProps {
  onCancel: () => void;
  onConfirm: () => void;
}

export default function DeleteAccountConfirmDialog({
  onCancel,
  onConfirm
}: DeleteAccountConfirmDialogProps) {
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
        Delete Account
      </ButtonSmall>
    </div>
  );
}


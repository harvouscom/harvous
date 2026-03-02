import React from 'react';
import ButtonSmall from './ButtonSmall';

interface DeleteAccountConfirmDialogProps {
  onCancel: () => void;
  onConfirm: () => void;
  isDeleting?: boolean;
}

export default function DeleteAccountConfirmDialog({
  onCancel,
  onConfirm,
  isDeleting = false
}: DeleteAccountConfirmDialogProps) {
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
        disabled={isDeleting}
      >
        Cancel
      </ButtonSmall>
      <ButtonSmall
        type="button"
        onClick={onConfirm}
        state="Delete"
        disabled={isDeleting}
      >
        {isDeleting ? 'Deleting...' : 'Delete Account'}
      </ButtonSmall>
    </div>
  );
}


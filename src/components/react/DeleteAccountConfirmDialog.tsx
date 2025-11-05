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
    <div className="flex gap-3 justify-end">
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


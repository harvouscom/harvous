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
        Clear All Data
      </ButtonSmall>
    </div>
  );
}


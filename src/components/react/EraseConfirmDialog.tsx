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
        Erase
      </ButtonSmall>
    </div>
  );
}

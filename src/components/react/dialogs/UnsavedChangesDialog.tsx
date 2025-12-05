import React from 'react';
import { createPortal } from 'react-dom';
import ButtonSmall from '../ButtonSmall';

export interface UnsavedChangesDialogProps {
  isOpen: boolean;
  onCancel: () => void;
  onDiscard: () => void;
  onSaveAndClose: () => void;
}

/**
 * A reusable dialog for handling unsaved changes
 */
export default function UnsavedChangesDialog({
  isOpen,
  onCancel,
  onDiscard,
  onSaveAndClose,
}: UnsavedChangesDialogProps) {
  // Don't render on server or if closed
  if (typeof document === 'undefined' || !isOpen) {
    return null;
  }

  return createPortal(
    <div 
      className="fixed inset-0 flex items-center justify-center z-[100] p-4 modal-overlay-enter"
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.35)',
        paddingTop: 'max(1rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))'
      }}
      onClick={(e) => {
        // Close dialog if clicking on the overlay (but not the dialog content)
        if (e.target === e.currentTarget) {
          onCancel();
        }
      }}
    >
      <div 
        className="bg-white rounded-xl p-6 max-w-md modal-content-enter"
        onClick={(e) => e.stopPropagation()}
        style={{ 
          pointerEvents: 'auto',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
        }}
      >
        <h3 className="text-lg font-semibold text-[var(--color-deep-grey)] mb-2">
          Unsaved Changes
        </h3>
        <p className="text-[var(--color-pebble-grey)] mb-6">
          You have unsaved changes. What would you like to do?
        </p>
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
            onClick={onDiscard}
            state="Delete"
          >
            Discard
          </ButtonSmall>
          <ButtonSmall
            type="button"
            onClick={onSaveAndClose}
            state="Default"
          >
            Save & Close
          </ButtonSmall>
        </div>
      </div>
    </div>,
    document.body
  );
}


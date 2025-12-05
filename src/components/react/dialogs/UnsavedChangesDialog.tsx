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
      className="modal-overlay-enter"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: '1rem',
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
        className="modal-content-enter"
        onClick={(e) => e.stopPropagation()}
        style={{ 
          backgroundColor: 'var(--surface-card)',
          borderRadius: '0.75rem',
          padding: '1.5rem',
          maxWidth: '28rem',
          width: '100%',
          pointerEvents: 'auto',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
        }}
      >
        <h3 style={{
          fontSize: '1.125rem',
          fontWeight: 600,
          color: 'var(--color-deep-grey)',
          marginBottom: '0.5rem'
        }}>
          Unsaved Changes
        </h3>
        <p style={{
          color: 'var(--color-pebble-grey)',
          marginBottom: '1.5rem'
        }}>
          You have unsaved changes. What would you like to do?
        </p>
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


import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import ButtonSmall from '../ButtonSmall';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmDestructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => {
      if (typeof document !== 'undefined') {
        document.body.style.overflow = '';
      }
    };
  }, [isOpen]);

  if (typeof document === 'undefined' || !isOpen) return null;

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
        zIndex: 1000025,
        padding: '1rem',
        paddingTop: 'max(1rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="modal-content-enter"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'white',
          borderRadius: '1.5rem',
          padding: '1.5rem',
          maxWidth: '28rem',
          width: '100%',
          pointerEvents: 'auto',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        }}
      >
        <h3
          style={{
            fontSize: '1.125rem',
            fontWeight: 700,
            color: 'var(--color-deep-grey)',
            marginBottom: '0.5rem',
            fontFamily: 'var(--font-sans)',
          }}
        >
          {title}
        </h3>
        <p
          style={{
            color: 'var(--color-pebble-grey)',
            marginBottom: '1.5rem',
            fontSize: '0.9375rem',
            fontFamily: 'var(--font-sans)',
            lineHeight: 1.5,
          }}
        >
          {message}
        </p>
        <div
          style={{
            display: 'flex',
            gap: '0.75rem',
            justifyContent: 'flex-end',
          }}
        >
          <ButtonSmall type="button" onClick={onCancel} state="Secondary">
            {cancelLabel}
          </ButtonSmall>
          <ButtonSmall
            type="button"
            onClick={onConfirm}
            state="Default"
            style={confirmDestructive ? { color: 'var(--color-red)' } : undefined}
          >
            {confirmLabel}
          </ButtonSmall>
        </div>
      </div>
    </div>,
    document.body
  );
}

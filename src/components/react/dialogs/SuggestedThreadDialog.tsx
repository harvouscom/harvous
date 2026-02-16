import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import ButtonSmall from '../ButtonSmall';

export interface SuggestedThreadDialogProps {
  isOpen: boolean;
  suggestedThreadName: string;
  onUseSuggested: () => void;
  onKeepUnorganized: () => void;
  onClose?: () => void;
}

/**
 * A dialog that appears when submitting a resource note with "Unorganized" selected
 * while an AI-suggested thread exists, giving users a chance to use the suggestion.
 */
export default function SuggestedThreadDialog({
  isOpen,
  suggestedThreadName,
  onUseSuggested,
  onKeepUnorganized,
  onClose,
}: SuggestedThreadDialogProps) {
  // Prevent body scroll when dialog is open
  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    // Cleanup on unmount
    return () => {
      if (typeof document !== 'undefined') {
        document.body.style.overflow = '';
      }
    };
  }, [isOpen]);

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
        zIndex: 1000025,
        padding: '1rem',
        paddingTop: 'max(1rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))'
      }}
      onClick={(e) => {
        // Close dialog if clicking on the overlay (but not the dialog content)
        // Just close, don't submit - user can click buttons to submit
        if (e.target === e.currentTarget) {
          onClose ? onClose() : onKeepUnorganized();
        }
      }}
    >
      <div 
        className="modal-content-enter"
        onClick={(e) => e.stopPropagation()}
        style={{ 
          backgroundColor: 'white',
          borderRadius: '0.75rem',
          padding: '1.5rem',
          maxWidth: '28rem',
          width: '100%',
          pointerEvents: 'auto',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          marginBottom: '0.75rem'
        }}>
          {/* Wand icon */}
          <svg 
            fill="currentColor" 
            viewBox="0 0 576 512"
            style={{ 
              width: '20px', 
              height: '20px', 
              color: 'var(--color-deep-grey)',
              flexShrink: 0
            }}
          >
            <path d="M234.7 42.7L197 56.8c-3 1.1-5 4-5 7.2s2 6.1 5 7.2l37.7 14.1L248.8 123c1.1 3 4 5 7.2 5s6.1-2 7.2-5l14.1-37.7L315 71.2c3-1.1 5-4 5-7.2s-2-6.1-5-7.2L277.3 42.7 263.2 5c-1.1-3-4-5-7.2-5s-6.1 2-7.2 5L234.7 42.7zM46.1 395.4c-18.7 18.7-18.7 49.1 0 67.9l34.6 34.6c18.7 18.7 49.1 18.7 67.9 0L529.9 116.5c18.7-18.7 18.7-49.1 0-67.9L495.3 14.1c-18.7-18.7-49.1-18.7-67.9 0L46.1 395.4zM484.6 82.6l-105 105-23.3-23.3 105-105 23.3 23.3zM7.5 117.2C3 118.9 0 123.2 0 128s3 9.1 7.5 10.8L64 160l21.2 56.5c1.7 4.5 6 7.5 10.8 7.5s9.1-3 10.8-7.5L128 160l56.5-21.2c4.5-1.7 7.5-6 7.5-10.8s-3-9.1-7.5-10.8L128 96 106.8 39.5C105.1 35 100.8 32 96 32s-9.1 3-10.8 7.5L64 96 7.5 117.2zm352 256c-4.5 1.7-7.5 6-7.5 10.8s3 9.1 7.5 10.8L416 416l21.2 56.5c1.7 4.5 6 7.5 10.8 7.5s9.1-3 10.8-7.5L480 416l56.5-21.2c4.5-1.7 7.5-6 7.5-10.8s-3-9.1-7.5-10.8L480 352l-21.2-56.5c-1.7-4.5-6-7.5-10.8-7.5s-9.1 3-10.8 7.5L416 352l-56.5 21.2z"/>
          </svg>
          <h3 style={{
            fontSize: '1.125rem',
            fontWeight: 600,
            color: 'var(--color-deep-grey)',
            margin: 0
          }}>
            Suggested Thread Available
          </h3>
        </div>
        <p style={{
          color: 'var(--color-pebble-grey)',
          marginBottom: '0.75rem',
          lineHeight: '1.5'
        }}>
          This resource has multiple scripture references. Would you like to organize it into the suggested thread <strong style={{ color: 'var(--color-deep-grey)' }}>"{suggestedThreadName}"</strong> instead of keeping it in Unorganized?
        </p>
        <p style={{
          color: 'var(--color-stone-grey)',
          fontSize: '0.875rem',
          marginBottom: '1.5rem',
          lineHeight: '1.4',
          fontStyle: 'italic'
        }}>
          FYI: You can edit the name of this suggested thread later.
        </p>
        <div style={{
          display: 'flex',
          gap: '0.75rem',
          justifyContent: 'flex-end',
          flexWrap: 'wrap'
        }}>
          <ButtonSmall
            type="button"
            onClick={onKeepUnorganized}
            state="Secondary"
          >
            Keep in Unorganized
          </ButtonSmall>
          <ButtonSmall
            type="button"
            onClick={onUseSuggested}
            state="Default"
          >
            Use Suggested Thread
          </ButtonSmall>
        </div>
      </div>
    </div>,
    document.body
  );
}

import React, { useState, useRef, useEffect } from 'react';
import ButtonSmall from './ButtonSmall';
import Icon from './Icon';

export type PinEntryMode = 'unlock' | 'set' | 'confirm';

interface PinEntryDialogProps {
  mode: PinEntryMode;
  onSubmit: (pin: string) => void;
  onCancel: () => void;
  error?: string;
  isLoading?: boolean;
  // For confirm mode, the PIN to confirm against
  pinToConfirm?: string;
}

export default function PinEntryDialog({
  mode,
  onSubmit,
  onCancel,
  error,
  isLoading = false,
  pinToConfirm
}: PinEntryDialogProps) {
  const [pin, setPin] = useState<string[]>(['', '', '', '']);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus first input on mount
  useEffect(() => {
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, []);

  // Clear error when PIN changes
  useEffect(() => {
    if (localError) {
      setLocalError(null);
    }
  }, [pin]);

  const handleInputChange = (index: number, value: string) => {
    // Only allow digits
    const digit = value.replace(/\D/g, '').slice(-1);

    const newPin = [...pin];
    newPin[index] = digit;
    setPin(newPin);

    // Auto-advance to next input
    if (digit && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all digits entered
    if (digit && index === 3) {
      const fullPin = newPin.join('');
      if (fullPin.length === 4) {
        // In confirm mode, check against pinToConfirm
        if (mode === 'confirm' && pinToConfirm) {
          if (fullPin !== pinToConfirm) {
            setLocalError('PINs do not match');
            setPin(['', '', '', '']);
            inputRefs.current[0]?.focus();
            return;
          }
        }
        onSubmit(fullPin);
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (pin[index] === '' && index > 0) {
        // Move to previous input on backspace when current is empty
        inputRefs.current[index - 1]?.focus();
        const newPin = [...pin];
        newPin[index - 1] = '';
        setPin(newPin);
      } else {
        // Clear current input
        const newPin = [...pin];
        newPin[index] = '';
        setPin(newPin);
      }
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 3) {
      inputRefs.current[index + 1]?.focus();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (pastedData.length > 0) {
      const newPin = ['', '', '', ''];
      for (let i = 0; i < pastedData.length && i < 4; i++) {
        newPin[i] = pastedData[i];
      }
      setPin(newPin);

      // Focus appropriate input
      if (pastedData.length < 4) {
        inputRefs.current[pastedData.length]?.focus();
      } else {
        // Auto-submit on full paste
        if (mode === 'confirm' && pinToConfirm) {
          if (pastedData !== pinToConfirm) {
            setLocalError('PINs do not match');
            setPin(['', '', '', '']);
            inputRefs.current[0]?.focus();
            return;
          }
        }
        onSubmit(pastedData);
      }
    }
  };

  const getTitle = () => {
    switch (mode) {
      case 'unlock':
        return 'Enter PIN to unlock';
      case 'set':
        return 'Set a 4-digit PIN';
      case 'confirm':
        return 'Confirm your PIN';
    }
  };

  const getSubtitle = () => {
    switch (mode) {
      case 'unlock':
        return 'Enter your PIN to view this note';
      case 'set':
        return 'This PIN will be required to unlock the note';
      case 'confirm':
        return 'Enter your PIN again to confirm';
    }
  };

  const displayError = error || localError;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        padding: '1.5rem',
        backgroundColor: 'white',
        borderRadius: '1rem',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        maxWidth: '320px',
        width: '100%',
        minWidth: 0,
        overflow: 'hidden'
      }}
    >
      {/* Header */}
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: '1rem'
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              backgroundColor: 'var(--color-fog-white)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Icon
              name={mode === 'unlock' ? 'lock' : 'unlock'}
              size={24}
              style={{ color: 'var(--color-stone-grey)' }}
            />
          </div>
        </div>
        <h3
          style={{
            fontSize: '18px',
            fontWeight: 700,
            color: 'var(--color-deep-grey)',
            margin: 0
          }}
        >
          {getTitle()}
        </h3>
        <p
          style={{
            fontSize: '14px',
            color: 'var(--color-stone-grey)',
            marginTop: '0.5rem'
          }}
        >
          {getSubtitle()}
        </p>
      </div>

      {/* PIN Input */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '0.75rem'
        }}
      >
        {pin.map((digit, index) => (
          <input
            key={index}
            ref={(el) => { inputRefs.current[index] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit ? '\u2022' : ''} // Show bullet for entered digits
            onChange={(e) => handleInputChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            disabled={isLoading}
            style={{
              width: '56px',
              height: '64px',
              textAlign: 'center',
              fontSize: '24px',
              fontWeight: 700,
              border: `2px solid ${displayError ? 'var(--color-error-red, #ef4444)' : 'var(--color-fog-white)'}`,
              borderRadius: '12px',
              outline: 'none',
              transition: 'border-color 0.2s, box-shadow 0.2s',
              backgroundColor: 'var(--color-fog-white)'
            }}
            onFocus={(e) => {
              e.target.style.borderColor = 'var(--color-deep-grey)';
              e.target.style.boxShadow = '0 0 0 3px rgba(0, 0, 0, 0.1)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = displayError ? 'var(--color-error-red, #ef4444)' : 'var(--color-fog-white)';
              e.target.style.boxShadow = 'none';
            }}
          />
        ))}
      </div>

      {/* Error Message */}
      {displayError && (
        <p
          style={{
            textAlign: 'center',
            color: 'var(--color-error-red, #ef4444)',
            fontSize: '14px',
            margin: 0
          }}
        >
          {displayError}
        </p>
      )}

      {/* Warning for set mode */}
      {mode === 'set' && (
        <div
          style={{
            backgroundColor: 'var(--color-fog-white)',
            borderRadius: '8px',
            padding: '12px',
            display: 'flex',
            gap: '8px',
            alignItems: 'flex-start',
            minWidth: 0,
            maxWidth: '100%'
          }}
        >
          <Icon
            name="circle-exclamation"
            size={16}
            style={{ color: 'var(--color-stone-grey)', flexShrink: 0, marginTop: '2px' }}
          />
          <p
            style={{
              fontSize: '12px',
              color: 'var(--color-stone-grey)',
              margin: 0,
              lineHeight: 1.4,
              minWidth: 0,
              maxWidth: '100%',
              overflowWrap: 'break-word',
              wordBreak: 'break-word'
            }}
          >
            If you forget your PIN, there is no way to recover the note content.
            Make sure to remember it.
          </p>
        </div>
      )}

      {/* Actions */}
      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          justifyContent: 'flex-end'
        }}
      >
        <ButtonSmall
          type="button"
          onClick={onCancel}
          state="Secondary"
          disabled={isLoading}
        >
          Cancel
        </ButtonSmall>
      </div>
    </div>
  );
}

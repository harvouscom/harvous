import React, { useState, useRef, useEffect } from 'react';
import Icon from './Icon';
import { decryptContent, decodeBlob, deriveKey } from '@/utils/note-encryption';
import { setNoteUnlocked } from '@/utils/note-unlock-state';
import { toast } from '@/utils/toast';

interface InlinePinUnlockProps {
  noteId: string;
  encryptedContent: string;
}

export default function InlinePinUnlock({ noteId, encryptedContent }: InlinePinUnlockProps) {
  const [pin, setPin] = useState<string[]>(['', '', '', '']);
  const [error, setError] = useState<string | undefined>();
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const clearPin = () => {
    setPin(['', '', '', '']);
    setError(undefined);
    inputRefs.current[0]?.focus();
  };

  const handleUnlock = async (enteredPin: string) => {
    setIsProcessing(true);
    setError(undefined);
    try {
      const decryptedContent = await decryptContent(encryptedContent, enteredPin);
      const { salt } = decodeBlob(encryptedContent);
      const key = await deriveKey(enteredPin, salt);
      setNoteUnlocked(noteId, key, enteredPin);
      window.dispatchEvent(new CustomEvent('pinEntryComplete', {
        detail: { noteId, newContent: decryptedContent, encrypted: false, contentEncryptedServer: true }
      }));
      toast.success('Note unlocked');
      clearPin();
    } catch {
      setPin(['', '', '', '']);
      inputRefs.current[0]?.focus();
      setError('Incorrect PIN');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleInputChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    if (!digit) return;
    const newPin = [...pin];
    newPin[index] = digit;
    setPin(newPin);
    if (index < 3) inputRefs.current[index + 1]?.focus();
    else {
      const fullPin = newPin.join('');
      if (fullPin.length === 4) handleUnlock(fullPin);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (pin[index] === '' && index > 0) {
        inputRefs.current[index - 1]?.focus();
        const newPin = [...pin];
        newPin[index - 1] = '';
        setPin(newPin);
      } else {
        const newPin = [...pin];
        newPin[index] = '';
        setPin(newPin);
      }
      e.preventDefault();
    } else if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      const newPin = [...pin];
      newPin[index] = e.key;
      setPin(newPin);
      if (index < 3) inputRefs.current[index + 1]?.focus();
      else {
        const fullPin = newPin.join('');
        if (fullPin.length === 4) handleUnlock(fullPin);
      }
    } else if (e.key === 'ArrowLeft' && index > 0) inputRefs.current[index - 1]?.focus();
    else if (e.key === 'ArrowRight' && index < 3) inputRefs.current[index + 1]?.focus();
    else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1 && !/^[0-9]$/.test(e.key)) {
      e.preventDefault();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (pastedData.length > 0) {
      const newPin = ['', '', '', ''];
      for (let i = 0; i < pastedData.length && i < 4; i++) newPin[i] = pastedData[i];
      setPin(newPin);
      if (pastedData.length < 4) inputRefs.current[pastedData.length]?.focus();
      else if (pastedData.length === 4) handleUnlock(pastedData);
    }
  };

  return (
    <div
      style={{
        lineHeight: '1.6',
        paddingTop: 12,
        paddingRight: 12,
        paddingBottom: 0,
        paddingLeft: 12,
        color: 'var(--color-stone-grey)',
        backgroundColor: 'var(--color-snow-white)',
        borderRadius: 24,
        boxSizing: 'border-box',
        width: '100%'
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: '.pin-digit-input:focus{border-color:var(--color-stone-grey)!important;box-shadow:0 0 0 2px var(--color-stone-grey)!important;outline:none!important}' }} />
      <div style={{ textAlign: 'center', marginTop: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.75rem' }}>
          <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="lock" size={24} style={{ color: 'var(--color-stone-grey)' }} />
          </div>
        </div>
        <p style={{ fontSize: 14, color: 'var(--color-stone-grey)', margin: 0 }}>
          Enter your PIN to view this note
        </p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem' }}>
        {pin.map((digit, index) => (
          <input
            key={index}
            ref={(el) => { inputRefs.current[index] = el; }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            maxLength={1}
            value={digit ? '\u2022' : ''}
            onChange={(e) => handleInputChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            disabled={isProcessing}
            aria-label={`PIN digit ${index + 1}`}
            className="pin-digit-input"
            style={{
              width: 48,
              height: 56,
              textAlign: 'center',
              fontSize: 20,
              fontWeight: 700,
              border: `2px solid ${error ? 'var(--color-error-red, #ef4444)' : 'var(--color-soft-gray)'}`,
              borderRadius: 10,
              outline: 'none',
              backgroundColor: 'white',
              color: 'var(--color-deep-grey)'
            }}
          />
        ))}
      </div>

      {error && (
        <p style={{ textAlign: 'center', color: 'var(--color-error-red, #ef4444)', fontSize: 14, margin: '0.75rem 0 0', fontStyle: 'normal' }}>{error}</p>
      )}
      <div style={{ height: 24, flexShrink: 0 }} aria-hidden="true" />
    </div>
  );
}

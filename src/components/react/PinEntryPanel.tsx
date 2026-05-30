import React, { useState, useRef, useEffect } from 'react';
import SquareButton from './SquareButton';
import Icon from './Icon';
import { encryptContent, decryptContent, validatePin, deriveKey, decodeBlob } from '@/utils/note-encryption';
import { setNoteUnlocked, lockNote } from '@/utils/note-unlock-state';
import { toast } from '@/utils/toast';

export type PinEntryPanelInitialMode = 'set' | 'unlock' | 'removeLock' | 'changeLock' | 'setForAccount' | 'lockWithAccountPin';

interface PinEntryPanelProps {
  noteId: string;
  initialMode: PinEntryPanelInitialMode;
  noteContent: string;
  isEncrypted: boolean;
  onClose?: () => void;
  inBottomSheet?: boolean;
  /** Prototype shell uses native-style PIN UI instead of classic panel chrome. */
  appearance?: 'classic' | 'prototype';
}

type Step = 'set' | 'confirm' | 'unlock' | 'unlocked';

function ProtoPinEntryHeaderIcon({ name }: { name: 'lock' | 'unlock' }) {
  return (
    <div className="proto-pin-entry__icon-wrap" aria-hidden>
      <Icon name={name} size={22} />
    </div>
  );
}

function protoPinEntryIconName(step: Step, initialMode: PinEntryPanelInitialMode): 'lock' | 'unlock' {
  if (step === 'unlocked') return 'unlock';
  if ((initialMode === 'unlock' || initialMode === 'removeLock') && step === 'unlock') return 'unlock';
  return 'lock';
}

export default function PinEntryPanel({
  noteId,
  initialMode,
  noteContent,
  isEncrypted,
  onClose,
  inBottomSheet = false,
  appearance = 'classic',
}: PinEntryPanelProps) {
  // changeLock/setForAccount: set starts at set; lockWithAccountPin starts at unlock (enter PIN to lock)
  const [step, setStep] = useState<Step>(
    initialMode === 'changeLock' || initialMode === 'removeLock'
      ? 'unlock'
      : initialMode === 'set' || initialMode === 'setForAccount'
        ? 'set'
        : initialMode === 'lockWithAccountPin'
          ? 'unlock'
          : 'unlock'
  );
  const [pendingPin, setPendingPin] = useState<string | null>(null);
  const [decryptedContent, setDecryptedContent] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [isProcessing, setIsProcessing] = useState(false);
  const [pin, setPin] = useState<string[]>(['', '', '', '']);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleClose = () => {
    if (onClose) onClose();
    else window.dispatchEvent(new CustomEvent('closePinEntryPanel'));
  };

  useEffect(() => {
    if (inputRefs.current[0]) inputRefs.current[0].focus();
  }, [step]);

  const clearPin = () => {
    setPin(['', '', '', '']);
    setError(undefined);
    inputRefs.current[0]?.focus();
  };

  const handleSetPin = (enteredPin: string) => {
    if (!validatePin(enteredPin)) {
      setError('PIN must be exactly 4 digits');
      return;
    }
    setPendingPin(enteredPin);
    setStep('confirm');
    clearPin();
  };

  const handleConfirmPin = async (confirmPin: string) => {
    if (confirmPin !== pendingPin) {
      setError('PINs do not match');
      clearPin();
      setPendingPin(null);
      setStep('set');
      return;
    }
    // For changeLock we must encrypt the decrypted content (from current-PIN step), not noteContent
    const contentToEncrypt =
      initialMode === 'changeLock' && decryptedContent !== null ? decryptedContent : noteContent;
    setIsProcessing(true);
    setError(undefined);
    try {
      if (initialMode === 'setForAccount') {
        const setRes = await fetch('/api/user/set-lock-pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ pin: pendingPin! })
        });
        if (!setRes.ok) {
          const data = await setRes.json();
          throw new Error(data.error || 'Failed to set PIN');
        }
      }
      const encryptedContent = await encryptContent(contentToEncrypt, pendingPin!);
      const response = await fetch(`/api/notes/${noteId}/update-content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content: encryptedContent, contentEncrypted: true })
      });
      if (!response.ok) throw new Error('Failed to save encrypted note');
      if (initialMode === 'changeLock') {
        lockNote(noteId);
        window.dispatchEvent(new CustomEvent('noteLockStateChanged', {
          detail: { noteId, contentEncrypted: true, contentEncryptedServer: true }
        }));
      }
      window.dispatchEvent(new CustomEvent('pinEntryComplete', {
        detail: { noteId, newContent: encryptedContent, encrypted: true, contentEncryptedServer: true }
      }));
      if (initialMode === 'changeLock') {
        toast.success('PIN changed');
      } else if (initialMode === 'setForAccount') {
        toast.success('Lock PIN set and note locked');
      } else {
        toast.success('Note locked with PIN');
      }
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to encrypt note. Please try again.');
      clearPin();
      setPendingPin(null);
      setStep('set');
      inputRefs.current[0]?.focus();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUnlock = async (enteredPin: string) => {
    setIsProcessing(true);
    setError(undefined);
    try {
      if (initialMode === 'lockWithAccountPin') {
        const verifyRes = await fetch('/api/user/verify-lock-pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ pin: enteredPin })
        });
        if (!verifyRes.ok) {
          const data = await verifyRes.json();
          throw new Error(data.error || 'Incorrect PIN');
        }
        const encryptedContent = await encryptContent(noteContent, enteredPin);
        const response = await fetch(`/api/notes/${noteId}/update-content`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ content: encryptedContent, contentEncrypted: true })
        });
        if (!response.ok) throw new Error('Failed to save encrypted note');
        window.dispatchEvent(new CustomEvent('pinEntryComplete', {
          detail: { noteId, newContent: encryptedContent, encrypted: true, contentEncryptedServer: true }
        }));
        toast.success('Note locked');
        handleClose();
        return;
      }
      const decrypted = await decryptContent(noteContent, enteredPin);
      if (initialMode === 'removeLock') {
        try {
          const response = await fetch(`/api/notes/${noteId}/update-content`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ content: decrypted, contentEncrypted: false })
          });
          if (!response.ok) throw new Error('Failed to remove lock');
          window.dispatchEvent(new CustomEvent('pinEntryComplete', {
            detail: { noteId, newContent: decrypted, encrypted: false, contentEncryptedServer: false }
          }));
          window.dispatchEvent(new CustomEvent('noteLockStateChanged', {
            detail: { noteId, contentEncrypted: false, contentEncryptedServer: false }
          }));
          toast.success('Lock removed');
          handleClose();
        } catch {
          setPin(['', '', '', '']);
          inputRefs.current[0]?.focus();
          setError('Failed to remove lock. Please try again.');
        }
        return;
      }
      if (initialMode === 'changeLock') {
        setDecryptedContent(decrypted);
        setStep('set');
        setPin(['', '', '', '']);
        inputRefs.current[0]?.focus();
        setIsProcessing(false);
        return;
      }
      const { salt } = decodeBlob(noteContent);
      const key = await deriveKey(enteredPin, salt);
      setNoteUnlocked(noteId, key, enteredPin);
      setDecryptedContent(decrypted);
      setStep('unlocked');
      toast.success('Note unlocked');
      queueMicrotask(() => {
        window.dispatchEvent(new CustomEvent('pinEntryComplete', {
          detail: { noteId, newContent: decrypted, encrypted: false, contentEncryptedServer: true }
        }));
      });
    } catch {
      setPin(['', '', '', '']);
      inputRefs.current[0]?.focus();
      setError('Incorrect PIN');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveLock = async () => {
    if (decryptedContent === null) return;
    setIsProcessing(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/notes/${noteId}/update-content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content: decryptedContent, contentEncrypted: false })
      });
      if (!response.ok) throw new Error('Failed to remove lock');
      window.dispatchEvent(new CustomEvent('pinEntryComplete', {
        detail: { noteId, newContent: decryptedContent, encrypted: false }
      }));
      toast.success('Lock removed');
      handleClose();
    } catch {
      setPin(['', '', '', '']);
      inputRefs.current[0]?.focus();
      setError('Failed to remove lock. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    if (step === 'confirm') {
      setStep('set');
      setPendingPin(null);
      clearPin();
    } else if (initialMode === 'changeLock' && step === 'set') {
      setStep('unlock');
      setDecryptedContent(null);
      setPendingPin(null);
      clearPin();
    } else if (step === 'unlocked') {
      handleClose();
    } else {
      handleClose();
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
      if (fullPin.length === 4) {
        if (step === 'set') handleSetPin(fullPin);
        else if (step === 'confirm' && pendingPin) handleConfirmPin(fullPin);
        else if (step === 'unlock') handleUnlock(fullPin);
      }
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
      // Digit key: replace this position (no need to delete first), then move or submit
      e.preventDefault();
      const newPin = [...pin];
      newPin[index] = e.key;
      setPin(newPin);
      if (index < 3) {
        inputRefs.current[index + 1]?.focus();
      } else {
        const fullPin = newPin.join('');
        if (step === 'set') handleSetPin(fullPin);
        else if (step === 'confirm' && pendingPin) handleConfirmPin(fullPin);
        else if (step === 'unlock') handleUnlock(fullPin);
      }
    } else if (e.key === 'ArrowLeft' && index > 0) inputRefs.current[index - 1]?.focus();
    else if (e.key === 'ArrowRight' && index < 3) inputRefs.current[index + 1]?.focus();
    else if (e.key === 'Escape') handleCancel();
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
      else {
        if (step === 'set') handleSetPin(pastedData);
        else if (step === 'confirm' && pendingPin) handleConfirmPin(pastedData);
        else if (step === 'unlock') handleUnlock(pastedData);
      }
    }
  };

  const getTitle = () => {
    if (step === 'set') {
      if (initialMode === 'changeLock') return 'Change Lock';
      if (initialMode === 'setForAccount') return 'Set your Harvous lock PIN';
      return 'Set a 4-digit PIN';
    }
    if (step === 'confirm') return 'Confirm your PIN';
    if (step === 'unlocked') return 'Note unlocked';
    if (initialMode === 'removeLock') return 'Remove Lock';
    if (initialMode === 'changeLock' && step === 'unlock') return 'Change Lock';
    if (initialMode === 'lockWithAccountPin') return 'Lock this note';
    return 'Enter PIN to unlock';
  };

  const getSubtitle = () => {
    if (step === 'set') {
      if (initialMode === 'changeLock') return 'Enter a new 4-digit PIN for this note.';
      if (initialMode === 'setForAccount') return "This PIN is for your entire Harvous. You'll use it to lock and unlock notes.";
      return 'This PIN will be required to unlock the note';
    }
    if (step === 'confirm') return 'Enter your PIN again to confirm';
    if (step === 'unlocked') return 'You can remove the lock to save this note without a PIN.';
    if (initialMode === 'removeLock') return 'Confirm your PIN to remove the lock from this note.';
    if (initialMode === 'changeLock' && step === 'unlock') return 'Enter your current PIN, then set a new one.';
    if (initialMode === 'lockWithAccountPin') return 'Enter your Harvous lock PIN to lock this note.';
    return 'Enter your PIN to view this note';
  };

  const pinDigitInputs = (
    <div className={appearance === 'prototype' ? 'proto-pin-entry__digits' : undefined} style={appearance === 'prototype' ? undefined : { display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem' }}>
      {pin.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            inputRefs.current[index] = el;
          }}
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
          className={appearance === 'prototype' ? 'proto-pin-entry__digit' : 'pin-digit-input'}
          style={
            appearance === 'prototype'
              ? undefined
              : {
                  width: 56,
                  height: 64,
                  textAlign: 'center',
                  fontSize: 24,
                  fontWeight: 700,
                  border: `2px solid ${error ? 'var(--color-error-red, #ef4444)' : 'var(--color-soft-gray)'}`,
                  borderRadius: 12,
                  outline: 'none',
                  backgroundColor: 'white',
                }
          }
        />
      ))}
    </div>
  );

  if (appearance === 'prototype') {
    return (
      <div className="proto-pin-entry" role="dialog" aria-modal="true" aria-label={getTitle()}>
        <ProtoPinEntryHeaderIcon name={protoPinEntryIconName(step, initialMode)} />
        <p className="proto-pin-entry__title">{getTitle()}</p>
        <p className="proto-pin-entry__subtitle">{getSubtitle()}</p>

        {step === 'unlocked' ? (
          <>
            <button
              type="button"
              className="proto-pin-entry__action"
              onClick={handleRemoveLock}
              disabled={isProcessing}
            >
              {isProcessing ? 'Removing…' : 'Remove lock'}
            </button>
            {error ? <p className="proto-pin-entry__error">{error}</p> : null}
          </>
        ) : (
          <>
            {pinDigitInputs}
            {error ? <p className="proto-pin-entry__error">{error}</p> : null}
            {step === 'set' && initialMode !== 'removeLock' ? (
              <p className="proto-pin-entry__hint">
                If you forget your PIN, there is no way to recover the note content. Make sure to remember it.
              </p>
            ) : null}
          </>
        )}

        <div className="proto-pin-entry__footer">
          <button
            type="button"
            className="proto-pin-entry__action proto-pin-entry__action--inline"
            onClick={step === 'unlocked' ? handleClose : handleCancel}
          >
            {step === 'unlocked' ? 'Done' : 'Cancel'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`panel-wrapper ${inBottomSheet ? 'panel-wrapper--bottom-sheet' : ''} w-full`}>
      <div className={inBottomSheet ? 'flex-1 flex flex-col min-h-0' : 'flex flex-col'}>
        <div className={`panel ${inBottomSheet ? 'panel--bottom-sheet' : ''}`}>
          <div className="panel__header">
            <div className="panel__title">
              <p>{getTitle()}</p>
            </div>
          </div>
          <div className={`panel__body ${inBottomSheet ? 'panel__body--bottom-sheet' : ''}`}>
            <div
              className={`panel__content panel__content--pin-entry ${inBottomSheet ? 'panel__content--bottom-sheet' : ''}`}
            >
              <div
                className="panel__content-scroll"
                style={{
                  maxWidth: '100%',
                  minWidth: 0,
                  borderRadius: 24,
                  lineHeight: '1.6',
                  color: 'var(--color-stone-grey)',
                  paddingTop: 12,
                  paddingRight: 12,
                  paddingBottom: 0,
                  paddingLeft: 12,
                  gap: 0
                }}
              >
              <style dangerouslySetInnerHTML={{ __html: '.pin-digit-input:focus{border-color:var(--color-stone-grey)!important;box-shadow:0 0 0 2px var(--color-stone-grey)!important;outline:none!important}' }} />
              <div style={{ textAlign: 'center', marginTop: 0 }}>
                <p style={{ fontSize: 14, color: 'var(--color-stone-grey)', margin: 0, marginTop: 12, fontStyle: 'normal', textWrap: 'balance' }}>{getSubtitle()}</p>
              </div>

              {step === 'unlocked' ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '0.75rem', marginTop: '1rem', width: '100%' }}>
                  <button
                    type="button"
                    onClick={handleRemoveLock}
                    disabled={isProcessing}
                    data-outer-shadow
                    className="btn-cta btn--secondary w-full group"
                  >
                    <span className="btn-cta__content">
                      {isProcessing ? 'Removing…' : 'Remove lock'}
                    </span>
                    <div className="btn-cta__shadow" />
                  </button>
                </div>
              ) : (
                <>
                  {pinDigitInputs}

                  {error && (
                    <p style={{ textAlign: 'center', color: 'var(--color-error-red, #ef4444)', fontSize: 14, margin: '0.75rem 0 0' }}>{error}</p>
                  )}

                  {step === 'set' && initialMode !== 'removeLock' && (
                    <div className="text-center px-4 pt-3 pb-2" style={{ color: 'var(--color-pebble-grey)', fontSize: '0.75rem', textWrap: 'balance', marginTop: '1rem', minWidth: 0, maxWidth: '100%' }}>
                      If you forget your PIN, there is no way to recover the note content. Make sure to remember it.
                    </div>
                  )}
                </>
              )}

              {step === 'unlocked' && error && (
                <p style={{ textAlign: 'center', color: 'var(--color-error-red, #ef4444)', fontSize: 14, margin: '0.75rem 0 0' }}>{error}</p>
              )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="panel__footer--buttons">
        <SquareButton variant="Back" onClick={step === 'unlocked' ? handleClose : handleCancel} inBottomSheet={inBottomSheet} />
      </div>
    </div>
  );
}

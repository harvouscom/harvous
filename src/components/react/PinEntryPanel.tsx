import React, { useState, useRef, useEffect } from 'react';
import SquareButton from './SquareButton';
import { encryptContent, decryptContent, validatePin, deriveKey, decodeBlob } from '@/utils/note-encryption';
import { setNoteUnlocked, lockNote } from '@/utils/note-unlock-state';
import { lockNoteWithPin, removeNoteLock } from '@/utils/note-lock-actions';
import AnimatedLockGlyph from './AnimatedLockGlyph';
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

/** How long the finished state holds before the sheet closes — long enough to see the shackle move. */
const SUCCESS_HOLD_MS = 720;
const SUCCESS_HOLD_REDUCED_MS = 260;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
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
  /** Prototype sheet only: the finished state that plays before it closes. */
  const [success, setSuccess] = useState<'locked' | 'unlocked' | null>(null);
  /** Bumped per wrong entry so the shake replays even when the message is unchanged. */
  const [errorBeat, setErrorBeat] = useState(0);
  const [pin, setPinState] = useState<string[]>(['', '', '', '']);
  /**
   * The digits as of the last keystroke, not the last render. Key events can arrive faster
   * than React re-renders (fast typing, autofill), and building each digit on the rendered
   * `pin` dropped all but the last — the fourth never completed the PIN.
   */
  const pinRef = useRef<string[]>(['', '', '', '']);
  const setPin = (next: string[]) => {
    pinRef.current = next;
    setPinState(next);
  };
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleClose = () => {
    if (onClose) onClose();
    else window.dispatchEvent(new CustomEvent('closePinEntryPanel'));
  };

  /**
   * The sheet says it worked by showing it — the shackle closes (or lifts) and the title
   * changes — then gets out of the way. Classic keeps its toast.
   */
  const finish = (kind: 'locked' | 'unlocked', classicToast: string) => {
    if (appearance !== 'prototype') {
      toast.success(classicToast);
      handleClose();
      return;
    }
    setSuccess(kind);
    window.setTimeout(handleClose, prefersReducedMotion() ? SUCCESS_HOLD_REDUCED_MS : SUCCESS_HOLD_MS);
  };

  const showError = (message: string) => {
    setError(message);
    setErrorBeat((n) => n + 1);
  };

  // A wrong entry remounts the digit row (that is what replays the shake), so focus has
  // to be put back on the fresh first input afterwards.
  useEffect(() => {
    if (errorBeat > 0) inputRefs.current[0]?.focus();
  }, [errorBeat]);

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
      showError('Those PINs don’t match. Try again.');
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
        window.dispatchEvent(new CustomEvent('lockPinSet'));
        await lockNoteWithPin(noteId, contentToEncrypt, pendingPin!);
        finish('locked', 'PIN set and note locked');
        return;
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
      } else {
        toast.success('Note locked with PIN');
      }
      handleClose();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not lock this note. Please try again.');
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
        // Start the key derivation now; it takes as long as the round trip, so the two
        // overlap instead of queueing. Discarded if the PIN turns out to be wrong.
        const encrypting = encryptContent(noteContent, enteredPin);
        encrypting.catch(() => {});
        const verifyRes = await fetch('/api/user/verify-lock-pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ pin: enteredPin })
        });
        if (!verifyRes.ok) {
          const data = await verifyRes.json().catch(() => ({}));
          // A wrong PIN and the attempt limit both read as an error under the digits;
          // anything else (network, server) also lands there rather than as "Incorrect".
          setPin(['', '', '', '']);
          inputRefs.current[0]?.focus();
          showError(
            verifyRes.status === 401 ? 'That isn’t your lock PIN.' : (data as { error?: string }).error || 'Could not check your PIN.'
          );
          return;
        }
        await lockNoteWithPin(noteId, noteContent, enteredPin, encrypting);
        finish('locked', 'Note locked');
        return;
      }
      const decrypted = await decryptContent(noteContent, enteredPin);
      if (initialMode === 'removeLock') {
        try {
          await removeNoteLock(noteId, decrypted);
          finish('unlocked', 'Lock removed');
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
    } catch (err) {
      setPin(['', '', '', '']);
      inputRefs.current[0]?.focus();
      // When locking, the PIN was already accepted — what failed is the save (a shared
      // space, the network), and the server's own words say which. Otherwise it's the PIN.
      showError(
        initialMode === 'lockWithAccountPin' && err instanceof Error
          ? err.message
          : 'That PIN didn’t open this note.'
      );
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
    const newPin = [...pinRef.current];
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
      if (pinRef.current[index] === '' && index > 0) {
        inputRefs.current[index - 1]?.focus();
        const newPin = [...pinRef.current];
        newPin[index - 1] = '';
        setPin(newPin);
      } else {
        const newPin = [...pinRef.current];
        newPin[index] = '';
        setPin(newPin);
      }
      e.preventDefault();
    } else if (/^[0-9]$/.test(e.key)) {
      // Digit key: replace this position (no need to delete first), then move or submit
      e.preventDefault();
      const newPin = [...pinRef.current];
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
      if (initialMode === 'setForAccount') return 'Choose a lock PIN';
      return 'Set a 4-digit PIN';
    }
    if (step === 'confirm') return 'Confirm your PIN';
    if (step === 'unlocked') return 'Note unlocked';
    if (initialMode === 'removeLock') return 'Remove lock';
    if (initialMode === 'changeLock' && step === 'unlock') return 'Change Lock';
    if (initialMode === 'lockWithAccountPin') return 'Lock this note';
    return 'Enter PIN to unlock';
  };

  const getSubtitle = () => {
    if (step === 'set') {
      if (initialMode === 'changeLock') return 'Enter a new 4-digit PIN for this note.';
      if (initialMode === 'setForAccount') return 'One PIN for your whole account. It locks and unlocks every protected note.';
      return 'This PIN will be required to unlock the note';
    }
    if (step === 'confirm') return 'Enter your PIN again to confirm';
    if (step === 'unlocked') return 'You can remove the lock to save this note without a PIN.';
    if (initialMode === 'removeLock') return 'Confirm your PIN to remove the lock from this note.';
    if (initialMode === 'changeLock' && step === 'unlock') return 'Enter your current PIN, then set a new one.';
    if (initialMode === 'lockWithAccountPin') return 'Enter your lock PIN to lock this note.';
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
    // Lock modes start with the shackle open and close it on success; remove-lock is the
    // reverse. The glyph is the whole confirmation — no toast on top of it.
    const removing = initialMode === 'removeLock';
    const glyphState: 'open' | 'closed' = success
      ? success === 'locked'
        ? 'closed'
        : 'open'
      : removing
        ? 'closed'
        : 'open';
    const title = success === 'locked' ? 'Locked' : success === 'unlocked' ? 'Lock removed' : getTitle();
    const subtitle = success
      ? success === 'locked'
        ? 'Only your PIN opens it now.'
        : 'This note is back to normal.'
      : isProcessing
        ? removing
          ? 'Unlocking…'
          : initialMode === 'lockWithAccountPin' || step === 'confirm'
            ? 'Locking…'
            : getSubtitle()
        : getSubtitle();
    const filledCount = pin.filter(Boolean).length;
    return (
      <div
        className="proto-pin-entry proto-pin-entry--sheet"
        data-success={success ?? undefined}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className={`proto-pin-entry__glyph${success ? ' proto-ink-on-accent' : ''}`} aria-hidden>
          <AnimatedLockGlyph state={glyphState} size={24} />
        </div>
        <p className="proto-pin-entry__title" aria-live="polite">
          {title}
        </p>
        <p className="proto-pin-entry__subtitle">{subtitle}</p>

        {success ? null : step === 'unlocked' ? (
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
            <div
              key={errorBeat}
              className="proto-pin-entry__digits"
              data-shake={errorBeat > 0 && error ? 'true' : undefined}
              data-busy={isProcessing ? 'true' : undefined}
              role="group"
              aria-label="PIN"
            >
              {pin.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => {
                    inputRefs.current[index] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  maxLength={1}
                  value={digit ? '\u2022' : ''}
                  onChange={(e) => handleInputChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onPaste={handlePaste}
                  disabled={isProcessing}
                  aria-label={`PIN digit ${index + 1}`}
                  aria-invalid={error ? true : undefined}
                  data-filled={digit ? 'true' : undefined}
                  data-next={!isProcessing && index === filledCount ? 'true' : undefined}
                  className="proto-pin-entry__digit"
                />
              ))}
            </div>
            {error ? (
              <p className="proto-pin-entry__error" role="alert">
                {error}
              </p>
            ) : null}
            {step === 'set' && initialMode !== 'removeLock' ? (
              <p className="proto-pin-entry__hint">
                There’s no way to recover a forgotten PIN — locked notes can’t be opened without it.
              </p>
            ) : null}
          </>
        )}

        {success ? null : (
          <div className="proto-pin-entry__footer">
            <button
              type="button"
              className="proto-pin-entry__quiet"
              onClick={step === 'unlocked' ? handleClose : handleCancel}
              disabled={isProcessing}
            >
              {step === 'unlocked' ? 'Done' : 'Cancel'}
            </button>
          </div>
        )}
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

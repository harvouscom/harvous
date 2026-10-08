import React, { useState, useEffect, useRef } from 'react';
import SquareButton from './SquareButton';
import Icon from './Icon';
import AnimatedLockGlyph from './AnimatedLockGlyph';
import { validatePin, encryptContent, decryptContent } from '@/utils/note-encryption';
import { getCachedProfileData, updateCachedProfileData } from '@/utils/profile-cache';
import { toast } from '@/utils/toast';
import { lockAllNotes } from '@/utils/note-unlock-state';

interface LockPinPanelProps {
  onClose?: () => void;
  inBottomSheet?: boolean;
  backIconDirection?: "auto" | "left" | "down";
  /** Embedded in prototype Settings — stay on page after set/change. */
  inline?: boolean;
  appearance?: 'classic' | 'prototype';
}

type Step = 'set' | 'confirm' | 'changeCurrent' | 'changeNew' | 'changeConfirm' | 'reencrypting' | 'removeCurrent';

/** Tell the shell the account PIN changed, so profile ("Set"/"Not set") and open notes refresh. */
function announcePinChanged(): void {
  window.dispatchEvent(new CustomEvent('lockPinSet'));
}

export default function LockPinPanel({
  onClose,
  inBottomSheet = false,
  backIconDirection = "auto",
  inline = false,
  appearance = 'classic',
}: LockPinPanelProps) {
  const [hasLockPinSet, setHasLockPinSet] = useState<boolean | null>(null);
  const [step, setStep] = useState<Step>('set');
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
  const [pendingPin, setPendingPin] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const pinChangeSuccessRef = useRef(false);
  /** Verified current PIN when changing PIN; used in confirm step so we don't overwrite it with new PIN. */
  const verifiedCurrentPinRef = useRef<string | null>(null);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, [step]);

  useEffect(() => {
    const cached = getCachedProfileData();
    if (cached && cached.hasLockPinSet !== undefined) {
      setHasLockPinSet(cached.hasLockPinSet);
      if (cached.hasLockPinSet) setStep('changeCurrent');
    } else {
      fetch('/api/user/get-profile')
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          const val = !!data?.hasLockPinSet;
          setHasLockPinSet(val);
          if (val) setStep('changeCurrent');
          const existing = getCachedProfileData();
          if (existing) updateCachedProfileData({ ...existing, hasLockPinSet: val });
        })
        .catch(() => setHasLockPinSet(false));
    }
  }, []);

  const clearPin = () => {
    setPin(['', '', '', '']);
    setError(undefined);
    inputRefs.current[0]?.focus();
  };

  /** Clear only PIN digits and focus; keeps error message visible. Use in catch when showing error. */
  const clearPinDigitsOnly = () => {
    setPin(['', '', '', '']);
    inputRefs.current[0]?.focus();
  };

  const handleInputChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    if (!digit) return;
    if (error) setError(undefined);
    const newPin = [...pinRef.current];
    newPin[index] = digit;
    setPin(newPin);
    if (index < 3) inputRefs.current[index + 1]?.focus();
    else {
      const fullPin = newPin.join('');
      if (fullPin.length === 4) {
        if (step === 'set') handleSetPin(fullPin);
        else if (step === 'confirm' && pendingPin) handleConfirmPin(fullPin);
        else if (step === 'changeCurrent') handleVerifyCurrentPin(fullPin);
        else if (step === 'changeNew') handleChangeNewPin(fullPin);
        else if (step === 'changeConfirm' && pendingPin) handleChangeConfirmPin(fullPin);
        else if (step === 'removeCurrent') handleRemovePin(fullPin);
      }
    }
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
    setIsProcessing(true);
    setError(undefined);
    try {
      const response = await fetch('/api/user/set-lock-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pin: confirmPin })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to set PIN');
      setHasLockPinSet(true);
      const existing = getCachedProfileData();
      if (existing) updateCachedProfileData({ ...existing, hasLockPinSet: true });
      announcePinChanged();
      toast.success('Lock PIN set');
      if (inline) {
        setStep('changeCurrent');
        setPendingPin(null);
        clearPin();
      } else if (onClose) onClose();
      else window.dispatchEvent(new CustomEvent('closeProfilePanel'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set PIN');
      clearPinDigitsOnly();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVerifyCurrentPin = async (currentPin: string) => {
    if (!validatePin(currentPin)) {
      setError('PIN must be exactly 4 digits');
      return;
    }
    setIsProcessing(true);
    setError(undefined);
    try {
      const response = await fetch('/api/user/verify-lock-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pin: currentPin })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Incorrect PIN');
      }
      verifiedCurrentPinRef.current = currentPin;
      setPendingPin(currentPin);
      setStep('changeNew');
      clearPin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Incorrect PIN');
      clearPinDigitsOnly();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleChangeNewPin = (enteredPin: string) => {
    if (!validatePin(enteredPin)) {
      setError('PIN must be exactly 4 digits');
      return;
    }
    setPendingPin(enteredPin);
    setStep('changeConfirm');
    clearPin();
  };

  const dismissWithToast = () => {
    // Every locked note now opens with the new PIN; the session's PIN is the old one.
    lockAllNotes();
    announcePinChanged();
    toast.success('Lock PIN changed');
    if (inline) {
      setStep('changeCurrent');
      setPendingPin(null);
      verifiedCurrentPinRef.current = null;
      clearPin();
    } else if (onClose) onClose();
    else window.dispatchEvent(new CustomEvent('closeProfilePanel'));
  };

  const handleChangeConfirmPin = async (confirmPin: string) => {
    if (confirmPin !== pendingPin) {
      setError('PINs do not match');
      clearPin();
      setPendingPin(null);
      setStep('changeNew');
      return;
    }
    const currentPin = verifiedCurrentPinRef.current;
    const newPin = confirmPin;
    if (!currentPin) {
      setError('Session expired. Enter your current PIN again.');
      setStep('changeCurrent');
      verifiedCurrentPinRef.current = null;
      clearPin();
      return;
    }
    setIsProcessing(true);
    setError(undefined);
    try {
      const setResponse = await fetch('/api/user/set-lock-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPin, newPin })
      });
      if (!setResponse.ok) {
        const data = await setResponse.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to change PIN');
      }
      pinChangeSuccessRef.current = true;
      let notes: Array<{ id: string; content?: string }> = [];
      try {
        const lockedRes = await fetch('/api/user/locked-notes?content=true', { credentials: 'include' });
        if (lockedRes.ok) {
          const lockedData = await lockedRes.json();
          notes = Array.isArray(lockedData?.notes) ? lockedData.notes : [];
        }
      } catch {
        // If locked-notes fails, PIN is already changed; skip re-encrypt and still dismiss
      }
      try {
        if (notes.length > 0) {
          setStep('reencrypting');
          let failedCount = 0;
          for (const n of notes) {
            if (!n.content || !n.id) continue;
            try {
              const decrypted = await decryptContent(n.content, currentPin);
              const encrypted = await encryptContent(decrypted, newPin);
              const updateRes = await fetch(`/api/notes/${n.id}/update-content`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ content: encrypted, contentEncrypted: true })
              });
              if (!updateRes.ok) failedCount += 1;
            } catch {
              // Skip note if decrypt fails (e.g. legacy per-note PIN) or update fails
              failedCount += 1;
            }
          }
          if (failedCount > 0) {
            toast.error(`Lock PIN changed. ${failedCount} note${failedCount === 1 ? '' : 's'} could not be updated.`);
          }
        }
      } catch {
        // Re-encrypt errors must not block dismiss
      }
      dismissWithToast();
      pinChangeSuccessRef.current = false;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change PIN');
      clearPinDigitsOnly();
      setPendingPin(null);
      setStep('changeNew');
    } finally {
      if (pinChangeSuccessRef.current) {
        pinChangeSuccessRef.current = false;
        dismissWithToast();
      }
      setIsProcessing(false);
    }
  };

  /**
   * Remove the account PIN. The server allows it only when no note is still locked —
   * the PIN is the only key to their text — so the 409 is the expected answer while
   * any remain, and its count is what to tell the person.
   */
  const handleRemovePin = async (currentPin: string) => {
    if (!validatePin(currentPin)) {
      setError('PIN must be exactly 4 digits');
      return;
    }
    setIsProcessing(true);
    setError(undefined);
    try {
      const response = await fetch('/api/user/remove-lock-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPin })
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; code?: string; lockedCount?: number };
      if (!response.ok) {
        if (data.code === 'HAS_LOCKED_NOTES') {
          const n = data.lockedCount ?? 0;
          throw new Error(
            n === 1
              ? 'One note is still locked. Remove its lock first.'
              : `${n} notes are still locked. Remove their locks first.`
          );
        }
        throw new Error(response.status === 401 ? 'That isn’t your lock PIN.' : data.error || 'Could not remove your PIN.');
      }
      setHasLockPinSet(false);
      const existing = getCachedProfileData();
      if (existing) updateCachedProfileData({ ...existing, hasLockPinSet: false });
      lockAllNotes();
      announcePinChanged();
      toast.success('Lock PIN removed');
      setStep('set');
      setPendingPin(null);
      clearPin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove your PIN.');
      clearPinDigitsOnly();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    setStep(hasLockPinSet ? 'changeCurrent' : 'set');
    setPendingPin(null);
    clearPin();
  };

  const handleBack = () => {
    if (inline) {
      setStep(hasLockPinSet ? 'changeCurrent' : 'set');
      setPendingPin(null);
      verifiedCurrentPinRef.current = null;
      clearPin();
      return;
    }
    if (onClose) onClose();
    else window.dispatchEvent(new CustomEvent('closeProfilePanel'));
  };

  const isSetFlow = hasLockPinSet === null ? false : !hasLockPinSet;
  const title =
    hasLockPinSet === null
      ? 'Lock PIN'
      : step === 'reencrypting'
        ? 'Updating locked notes…'
        : isSetFlow && step === 'set'
          ? 'Set your Harvous lock PIN'
          : isSetFlow && step === 'confirm'
            ? 'Confirm your PIN'
            : step === 'changeCurrent'
              ? 'Change lock PIN'
              : step === 'removeCurrent'
                ? 'Remove lock PIN'
              : step === 'changeNew'
                ? 'Enter new PIN'
                : step === 'changeConfirm'
                  ? 'Confirm new PIN'
                  : 'Lock PIN';
  const subtitle =
    hasLockPinSet === null
      ? ''
      : step === 'reencrypting'
        ? 'Re-encrypting your locked notes with the new PIN.'
        : isSetFlow && step === 'set'
          ? 'One PIN for your whole account. It locks and unlocks every protected note.'
          : isSetFlow && step === 'confirm'
            ? 'Enter your PIN again to confirm.'
            : step === 'changeCurrent'
              ? 'Enter your current PIN, then set a new one.'
              : step === 'removeCurrent'
                ? 'Enter your PIN to remove it. Only possible once no note is locked.'
              : step === 'changeNew'
                ? 'Enter a new 4-digit PIN.'
                : step === 'changeConfirm'
                  ? 'Enter your new PIN again to confirm.'
                  : '';

  const inlineLead =
    inline && appearance === 'prototype'
      ? step === 'reencrypting'
        ? subtitle
        : step === 'set'
          ? 'Choose a 4-digit PIN for your account.'
          : step === 'confirm'
            ? 'Enter it again to confirm.'
            : step === 'changeCurrent'
              ? 'To change it, enter your current PIN.'
              : step === 'removeCurrent'
                ? 'Enter your PIN to remove it. Unlock every locked note first.'
              : step === 'changeNew'
                ? 'Choose a new 4-digit PIN.'
                : step === 'changeConfirm'
                  ? 'Enter your new PIN again to confirm.'
                  : subtitle
      : subtitle;

  /* Settings states this as one of its facts beside the panel, so the inline panel there would
     only be saying it a second time. The sheet has no such list and keeps the line. */
  const showRecoveryHint = (step === 'set' || step === 'changeNew') && !(inline && appearance === 'prototype');
  const showPinInputs = step !== 'reencrypting';
  const backLabel =
    step === 'reencrypting' || (inline && (step === 'set' || step === 'changeCurrent'))
      ? null
      : step === 'set' || step === 'changeCurrent'
        ? inline
          ? null
          : 'Back'
        : 'Cancel';

  const pinInputs = showPinInputs ? (
    <>
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
            onKeyDown={(e) => {
              if (e.key === 'Backspace' && !digit && index > 0) inputRefs.current[index - 1]?.focus();
              if (e.key === 'Escape') handleCancel();
              if (!/^[0-9]$/.test(e.key) && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) e.preventDefault();
            }}
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
      {error ? (
        <p className={appearance === 'prototype' ? 'proto-pin-entry__error' : undefined} style={appearance === 'prototype' ? undefined : { textAlign: 'center', color: 'var(--color-error-red, #ef4444)', fontSize: 14, margin: '0.75rem 0 0' }}>
          {error}
        </p>
      ) : null}
      {showRecoveryHint ? (
        <p
          className={appearance === 'prototype' ? 'proto-pin-entry__hint' : 'text-center px-4 pt-3 pb-2'}
          style={
            appearance === 'prototype'
              ? undefined
              : { color: 'var(--color-pebble-grey)', fontSize: '0.75rem', textWrap: 'balance', marginTop: '1rem', minWidth: 0, maxWidth: '100%' }
          }
        >
          There’s no way to recover a forgotten PIN — locked notes can’t be opened without it.
        </p>
      ) : null}
    </>
  ) : null;

  if (appearance === 'prototype') {
    if (hasLockPinSet === null) {
      return (
        <div className="proto-lock-pin-settings">
          <p className="pds-caption" style={{ color: 'var(--pds-text-secondary)' }}>Loading…</p>
        </div>
      );
    }

    return (
      <div className={`proto-lock-pin-settings${inline ? ' proto-lock-pin-settings--inline' : ''}`}>
        <div className="proto-pin-entry proto-pin-entry--settings" role="group" aria-label={title}>
          {inline ? (
            /*
             * The page's one picture: the padlock, shut when a PIN exists and open when it does
             * not, beside what that means in four words. `AnimatedLockGlyph` rather than the
             * icon-set lock because its shackle is its own element and moves — when a PIN is set
             * or removed here, the lock closes or opens in front of the reader.
             */
            <div className="proto-lock-pin-settings__hero">
              <span className="proto-lock-pin-settings__glyph" aria-hidden>
                <AnimatedLockGlyph state={hasLockPinSet ? 'closed' : 'open'} size={24} />
              </span>
              <span className="proto-lock-pin-settings__hero-text">
                <span className="proto-lock-pin-settings__status">
                  {hasLockPinSet ? 'Lock PIN is on' : 'Set a lock PIN'}
                </span>
                {inlineLead ? <span className="proto-lock-pin-settings__lead">{inlineLead}</span> : null}
              </span>
            </div>
          ) : (
            <>
              <div className="proto-pin-entry__icon-wrap" aria-hidden>
                <Icon name="lock" size={22} />
              </div>
              <p className="proto-pin-entry__title">{title}</p>
              {subtitle ? <p className="proto-pin-entry__subtitle">{subtitle}</p> : null}
            </>
          )}
          {pinInputs}
          {inline && step === 'changeCurrent' ? (
            <div className="proto-pin-entry__footer proto-pin-entry__footer--inline">
              <button
                type="button"
                className="proto-lock-pin-settings__text-btn"
                disabled={isProcessing}
                onClick={() => {
                  setStep('removeCurrent');
                  clearPin();
                }}
              >
                Remove PIN
              </button>
            </div>
          ) : null}
          {backLabel ? (
            <div className="proto-pin-entry__footer proto-pin-entry__footer--inline">
              <button
                type="button"
                className={
                  inline
                    ? 'proto-lock-pin-settings__text-btn'
                    : 'proto-pin-entry__action proto-pin-entry__action--inline'
                }
                disabled={step === 'reencrypting'}
                onClick={step === 'reencrypting' ? () => {} : handleCancel}
              >
                {backLabel}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (hasLockPinSet === null) {
    return (
      <div className={`panel-wrapper ${inBottomSheet ? 'panel-wrapper--bottom-sheet' : ''} w-full`}>
        <div className={inBottomSheet ? 'flex-1 flex flex-col min-h-0' : 'flex flex-col'}>
          <div className={`panel ${inBottomSheet ? 'panel--bottom-sheet' : ''}`}>
            <div className="panel__header">
              <div className="panel__title">
                <p>Lock PIN</p>
              </div>
            </div>
            <div className={`panel__body ${inBottomSheet ? 'panel__body--bottom-sheet' : ''}`}>
              <div className="panel__content">
                <div className="panel__content-scroll panel__loading-state">
                <p>Loading…</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="panel__footer--buttons">
          <SquareButton
            variant="Back"
            backIconDirection={backIconDirection}
            onClick={handleBack}
            inBottomSheet={inBottomSheet}
          />
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
              <p>{title}</p>
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
                {subtitle && (
                  <p style={{ fontSize: 14, color: 'var(--color-stone-grey)', margin: 0, marginTop: 12, fontStyle: 'normal', textWrap: 'balance' }}>{subtitle}</p>
                )}
              </div>

              {pinInputs}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="panel__footer--buttons">
        <SquareButton
          variant="Back"
          backIconDirection={backIconDirection}
          onClick={step === 'reencrypting' ? () => {} : (step === 'set' || step === 'changeCurrent' ? handleBack : handleCancel)}
          inBottomSheet={inBottomSheet}
        />
      </div>
    </div>
  );
}

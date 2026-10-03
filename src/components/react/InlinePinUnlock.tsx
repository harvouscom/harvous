import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import AnimatedLockGlyph from './AnimatedLockGlyph';
import { decryptContent } from '@/utils/note-encryption';
import { isEncryptedNoteBlob } from '@/utils/note-lock-blob';
import {
  getLockSessionRevision,
  getSessionPin,
  setNoteUnlocked,
  subscribeLockSession,
} from '@/utils/note-unlock-state';

interface InlinePinUnlockProps {
  noteId: string;
  encryptedContent: string;
}

/**
 * The PIN gate in place of a locked note's body.
 *
 * One PIN entry opens every locked note for the unlock session (see note-unlock-state),
 * so when a session is already open this gate decrypts on its own and never asks. It
 * also waits for the full body: a note opened from a list is seeded with a blank (list
 * payloads never carry ciphertext), and decrypting that would read as a wrong PIN.
 */
export default function InlinePinUnlock({ noteId, encryptedContent }: InlinePinUnlockProps) {
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
  const [error, setError] = useState<string | undefined>();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorBeat, setErrorBeat] = useState(0);
  /** The shackle starts lifted and drops on mount: arriving on a locked note shows it locking. */
  const [glyphState, setGlyphState] = useState<'open' | 'closed'>('open');
  useEffect(() => {
    const id = requestAnimationFrame(() => setGlyphState('closed'));
    return () => cancelAnimationFrame(id);
  }, []);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const sessionRevision = useSyncExternalStore(subscribeLockSession, getLockSessionRevision, getLockSessionRevision);
  const bodyReady = isEncryptedNoteBlob(encryptedContent);
  /** The session PIN already tried against this body, so a mismatch doesn't loop. */
  const triedSessionPinRef = useRef<string | null>(null);

  const finishUnlock = useCallback(
    (decrypted: string, usedPin: string) => {
      setNoteUnlocked(noteId, null, usedPin);
      window.dispatchEvent(
        new CustomEvent('pinEntryComplete', {
          detail: { noteId, newContent: decrypted, encrypted: false, contentEncryptedServer: true },
        }),
      );
    },
    [noteId],
  );

  // An open session covers this note too — decrypt without asking.
  useEffect(() => {
    if (!bodyReady) return;
    const sessionPin = getSessionPin();
    if (!sessionPin || triedSessionPinRef.current === sessionPin) return;
    triedSessionPinRef.current = sessionPin;
    let cancelled = false;
    setIsProcessing(true);
    decryptContent(encryptedContent, sessionPin)
      .then((decrypted) => {
        if (!cancelled) finishUnlock(decrypted, sessionPin);
        // Interrupted (body or session changed mid-decrypt) — let the next run try again.
        else triedSessionPinRef.current = null;
      })
      .catch(() => {
        /* Locked with a different PIN (notes from before the account PIN) — ask. */
      })
      .finally(() => setIsProcessing(false));
    return () => {
      cancelled = true;
    };
  }, [bodyReady, encryptedContent, finishUnlock, sessionRevision]);

  useEffect(() => {
    if (bodyReady && !isProcessing) inputRefs.current[0]?.focus();
  }, [bodyReady, isProcessing]);

  const handleUnlock = async (enteredPin: string) => {
    if (!bodyReady) return;
    setIsProcessing(true);
    setError(undefined);
    try {
      const decrypted = await decryptContent(encryptedContent, enteredPin);
      triedSessionPinRef.current = enteredPin;
      finishUnlock(decrypted, enteredPin);
      setPin(['', '', '', '']);
    } catch {
      setPin(['', '', '', '']);
      setError('That PIN didn’t open this note.');
      setErrorBeat((n) => n + 1);
      requestAnimationFrame(() => inputRefs.current[0]?.focus());
    } finally {
      setIsProcessing(false);
    }
  };

  const submitIfFull = (next: string[]) => {
    const full = next.join('');
    if (full.length === 4) void handleUnlock(full);
  };

  const handleInputChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    if (!digit) return;
    const next = [...pinRef.current];
    next[index] = digit;
    setPin(next);
    if (index < 3) inputRefs.current[index + 1]?.focus();
    else submitIfFull(next);
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      const next = [...pinRef.current];
      if (pinRef.current[index] === '' && index > 0) {
        inputRefs.current[index - 1]?.focus();
        next[index - 1] = '';
      } else {
        next[index] = '';
      }
      setPin(next);
      e.preventDefault();
    } else if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      const next = [...pinRef.current];
      next[index] = e.key;
      setPin(next);
      if (index < 3) inputRefs.current[index + 1]?.focus();
      else submitIfFull(next);
    } else if (e.key === 'ArrowLeft' && index > 0) inputRefs.current[index - 1]?.focus();
    else if (e.key === 'ArrowRight' && index < 3) inputRefs.current[index + 1]?.focus();
    else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) e.preventDefault();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (!pasted) return;
    const next = ['', '', '', ''];
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setPin(next);
    if (pasted.length < 4) inputRefs.current[pasted.length]?.focus();
    else submitIfFull(next);
  };

  const filledCount = pin.filter(Boolean).length;
  return (
    <div className="proto-pin-entry proto-pin-entry--inline" aria-busy={!bodyReady || isProcessing}>
      <div className="proto-pin-entry__glyph" aria-hidden>
        <AnimatedLockGlyph state={isProcessing && bodyReady ? 'open' : glyphState} size={24} />
      </div>
      <p className="proto-pin-entry__title">This note is locked</p>
      <p className="proto-pin-entry__subtitle">
        {!bodyReady || isProcessing ? 'Opening…' : 'Enter your PIN to open it.'}
      </p>
      <div
        key={errorBeat}
        className="proto-pin-entry__digits"
        data-shake={errorBeat > 0 && error ? 'true' : undefined}
        data-busy={isProcessing ? 'true' : undefined}
        role="group"
        aria-label="Lock PIN"
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
            disabled={!bodyReady || isProcessing}
            aria-label={`PIN digit ${index + 1}`}
            aria-invalid={error ? true : undefined}
            data-filled={digit ? 'true' : undefined}
            data-next={bodyReady && !isProcessing && index === filledCount ? 'true' : undefined}
            className="proto-pin-entry__digit"
          />
        ))}
      </div>
      {error ? (
        <p className="proto-pin-entry__error" role="alert">
          {error}
        </p>
      ) : null}
      <p className="proto-pin-entry__hint">One PIN opens all your locked notes for a few minutes.</p>
    </div>
  );
}

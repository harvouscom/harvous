import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HIDDEN_GRACE_MS,
  SESSION_IDLE_MS,
  getSessionPin,
  getUnlockPin,
  handleVisibilityChange,
  isLockSessionActive,
  isNoteUnlocked,
  lockAllNotes,
  lockNote,
  setNoteUnlocked,
  subscribeLockSession,
  touchUnlockSession,
  unlockSession,
} from '../note-unlock-state';

describe('note unlock session', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-03T12:00:00Z'));
    lockAllNotes();
  });
  afterEach(() => {
    lockAllNotes();
    vi.useRealTimers();
  });

  it('one PIN entry covers every note, but a note counts as open only once decrypted', () => {
    setNoteUnlocked('note_a', null, '1234');
    expect(isLockSessionActive()).toBe(true);
    expect(isNoteUnlocked('note_a')).toBe(true);
    // note_b is covered by the session (the gate auto-decrypts with it) but not yet open.
    expect(isNoteUnlocked('note_b')).toBe(false);
    expect(getSessionPin()).toBe('1234');
    // A save may only re-encrypt a note that is actually open.
    expect(getUnlockPin('note_a')).toBe('1234');
    expect(getUnlockPin('note_b')).toBeUndefined();
  });

  it('idles out after the window with no activity', () => {
    unlockSession('1234');
    setNoteUnlocked('note_a', null, '1234');
    vi.advanceTimersByTime(SESSION_IDLE_MS - 1);
    expect(isNoteUnlocked('note_a')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(isLockSessionActive()).toBe(false);
    expect(isNoteUnlocked('note_a')).toBe(false);
    expect(getSessionPin()).toBeUndefined();
  });

  it('activity slides the window forward', () => {
    setNoteUnlocked('note_a', null, '1234');
    vi.advanceTimersByTime(SESSION_IDLE_MS - 1000);
    touchUnlockSession();
    vi.advanceTimersByTime(SESSION_IDLE_MS - 1000);
    expect(isNoteUnlocked('note_a')).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(isLockSessionActive()).toBe(false);
  });

  it('expires on read even when the timer never fired (throttled background tab)', () => {
    setNoteUnlocked('note_a', null, '1234');
    vi.setSystemTime(Date.now() + SESSION_IDLE_MS + 5);
    expect(isNoteUnlocked('note_a')).toBe(false);
  });

  it('a short trip away keeps the session; a long one ends it on return', () => {
    setNoteUnlocked('note_a', null, '1234');
    handleVisibilityChange('hidden');
    vi.setSystemTime(Date.now() + HIDDEN_GRACE_MS - 1000);
    handleVisibilityChange('visible');
    expect(isNoteUnlocked('note_a')).toBe(true);

    handleVisibilityChange('hidden');
    // Timers can be throttled while hidden, so move the clock without running them.
    vi.setSystemTime(Date.now() + HIDDEN_GRACE_MS + 1);
    handleVisibilityChange('visible');
    expect(isLockSessionActive()).toBe(false);
  });

  it('the hidden grace timer locks on its own', () => {
    setNoteUnlocked('note_a', null, '1234');
    handleVisibilityChange('hidden');
    vi.advanceTimersByTime(HIDDEN_GRACE_MS);
    expect(isLockSessionActive()).toBe(false);
  });

  it('re-locking one note keeps the session for the others', () => {
    setNoteUnlocked('note_a', null, '1234');
    setNoteUnlocked('note_b', null, '1234');
    lockNote('note_a');
    expect(isNoteUnlocked('note_a')).toBe(false);
    expect(isNoteUnlocked('note_b')).toBe(true);
  });

  it('tells subscribers when the session ends', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeLockSession(listener);
    setNoteUnlocked('note_a', null, '1234');
    listener.mockClear();
    lockAllNotes();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});

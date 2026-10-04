import { useEffect, useRef } from 'react';
import { isNoteUnlocked, getSessionPin, lockAllNotes } from '@/utils/note-unlock-state';
import { lockNoteWithPin, removeNoteLock } from '@/utils/note-lock-actions';
import { toast } from '@/utils/toast';

/**
 * Headless lock controller for the open note. Mounted by CardFullEditable, which owns the
 * live body; driven by `focusLockNote` events from the note menu and the Mod+Shift+L
 * shortcut, so neither has to know the body or the session.
 *
 *   - unlocked note, session open → lock it with the session PIN, no prompt
 *   - unlocked note, no session   → PIN sheet: choose a PIN (first time) or confirm it
 *   - locked note, open           → "Lock now": end the session, every note re-locks
 *   - locked note, still gated    → nothing to do; the gate is already asking
 *   - `removeLock`                → store the open plaintext back, or ask for the PIN first
 */
export type FocusLockNoteDetail = {
  contentId: string;
  removeLock?: boolean;
  /** From the caller's profile cache when it has one; otherwise fetched. */
  hasLockPinSet?: boolean;
};

interface LockNoteButtonProps {
  noteId: string;
  /** The live body as the user sees it: decrypted when the note is open, plain otherwise. */
  getNoteContent: () => string;
  /** Server-side contentEncrypted. */
  isEncrypted: boolean;
  /** Stored ciphertext, for the remove-lock sheet when the note is still gated. */
  serverNoteContent?: string;
  /** Flush any unsaved edit before the body is encrypted, so the lock write is the latest text. */
  flushPendingSave?: () => Promise<void>;
}

async function fetchHasLockPinSet(): Promise<boolean> {
  try {
    const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) || '';
    const res = await fetch(`${base}/api/user/get-profile`, { credentials: 'include' });
    if (!res.ok) return false;
    const data = (await res.json()) as { hasLockPinSet?: boolean };
    return data.hasLockPinSet === true;
  } catch {
    return false;
  }
}

function openPinSheet(detail: { noteId: string; mode: string; noteContent: string; isEncrypted: boolean }) {
  window.dispatchEvent(new CustomEvent('openPinEntryPanel', { detail }));
}

export default function LockNoteButton({
  noteId,
  getNoteContent,
  isEncrypted,
  serverNoteContent,
  flushPendingSave,
}: LockNoteButtonProps) {
  const propsRef = useRef({ getNoteContent, isEncrypted, serverNoteContent, flushPendingSave });
  propsRef.current = { getNoteContent, isEncrypted, serverNoteContent, flushPendingSave };
  const busyRef = useRef(false);

  useEffect(() => {
    const run = async (removeLock: boolean, knownHasPin: boolean | undefined) => {
      const { getNoteContent: read, isEncrypted: locked, serverNoteContent: cipher, flushPendingSave: flush } =
        propsRef.current;
      const open = locked && isNoteUnlocked(noteId);

      if (removeLock) {
        if (!locked) return;
        if (open) {
          await flush?.();
          await removeNoteLock(noteId, read());
          toast.success('Lock removed');
          return;
        }
        openPinSheet({ noteId, mode: 'removeLock', noteContent: cipher ?? '', isEncrypted: true });
        return;
      }

      if (locked) {
        if (open) {
          lockAllNotes();
          toast.success('Locked');
        }
        return;
      }

      await flush?.();
      const sessionPin = getSessionPin();
      if (sessionPin) {
        await lockNoteWithPin(noteId, read(), sessionPin);
        toast.success('Note locked');
        return;
      }
      const hasPin = knownHasPin ?? (await fetchHasLockPinSet());
      openPinSheet({
        noteId,
        mode: hasPin ? 'lockWithAccountPin' : 'setForAccount',
        noteContent: read(),
        isEncrypted: false,
      });
    };

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<FocusLockNoteDetail>).detail;
      if (detail?.contentId == null || String(detail.contentId) !== String(noteId)) return;
      if (busyRef.current) return;
      busyRef.current = true;
      run(detail.removeLock === true, detail.hasLockPinSet)
        .catch((err: unknown) => {
          toast.error(err instanceof Error ? err.message : 'Something went wrong with the lock.');
        })
        .finally(() => {
          busyRef.current = false;
        });
    };
    window.addEventListener('focusLockNote', handler);
    return () => window.removeEventListener('focusLockNote', handler);
  }, [noteId]);

  return null;
}

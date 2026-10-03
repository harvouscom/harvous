/**
 * Lock and remove-lock writes for one note, shared by the PIN sheet and the note menu.
 *
 * Both go through POST /api/notes/:id/update-content, which flips `contentEncrypted` and
 * — when locking — also turns off public sharing and co-editing server-side. Afterwards
 * the editor is told through `pinEntryComplete` (it owns the open body) and the shell
 * through `noteLockStateChanged` (it owns caches, menus and list rows).
 */
import { encryptContent } from './note-encryption';
import { lockAllNotes } from './note-unlock-state';

const API_BASE = (): string =>
  ((import.meta as { env?: Record<string, string | undefined> }).env?.VITE_API_BASE_URL as string | undefined) || '';

async function postContent(noteId: string, content: string, contentEncrypted: boolean): Promise<void> {
  const res = await fetch(`${API_BASE()}/api/notes/${encodeURIComponent(noteId)}/update-content`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ content, contentEncrypted }),
  });
  if (!res.ok) {
    let message = contentEncrypted ? 'Could not lock this note.' : 'Could not remove the lock.';
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      /* keep the default */
    }
    throw new Error(message);
  }
}

function announce(noteId: string, newContent: string, encrypted: boolean): void {
  window.dispatchEvent(
    new CustomEvent('pinEntryComplete', {
      detail: { noteId, newContent, encrypted, contentEncryptedServer: encrypted },
    }),
  );
  // `newContent` lets the shell write the note cache synchronously: until it does, the
  // cache still says the old lock state, and an autosave in that gap would encrypt (or
  // refuse) on stale information.
  window.dispatchEvent(
    new CustomEvent('noteLockStateChanged', {
      detail: { noteId, contentEncrypted: encrypted, contentEncryptedServer: encrypted, newContent },
    }),
  );
}

/**
 * Encrypt `plaintext` with the account PIN and store it as the note's body.
 *
 * Ends the unlock session too. Locking is the user saying "put this away", and with a
 * session still open the PIN gate would decrypt the note straight back on screen.
 */
export async function lockNoteWithPin(
  noteId: string,
  plaintext: string,
  pin: string,
  /** Already-started encryption of `plaintext` with `pin` — lets a caller overlap the
   *  310k-iteration key derivation with its PIN check instead of running them in turn. */
  precomputed?: Promise<string>,
): Promise<string> {
  const ciphertext = await (precomputed ?? encryptContent(plaintext, pin));
  await postContent(noteId, ciphertext, true);
  lockAllNotes();
  announce(noteId, ciphertext, true);
  return ciphertext;
}

/** Store an already-decrypted body back as plain text and clear the lock. */
export async function removeNoteLock(noteId: string, plaintext: string): Promise<void> {
  await postContent(noteId, plaintext, false);
  announce(noteId, plaintext, false);
}

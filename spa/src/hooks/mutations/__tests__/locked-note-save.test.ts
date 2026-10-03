import { afterEach, describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { decryptContent, encryptContent } from '@/utils/note-encryption';
import { isEncryptedNoteBlob } from '@/utils/note-lock-blob';
import { lockAllNotes, setNoteUnlocked } from '@/utils/note-unlock-state';
import { encryptLockedNoteBody, isCachedNoteLocked, LockedNoteSaveError } from '../useUpdateNote';

describe('locked note saves', () => {
  afterEach(() => lockAllNotes());

  it('encrypts the editor body with the session PIN, fresh each time', async () => {
    setNoteUnlocked('note_a', null, '4821');
    const first = await encryptLockedNoteBody('note_a', '<p>Prayer list</p>');
    const second = await encryptLockedNoteBody('note_a', '<p>Prayer list</p>');
    expect(isEncryptedNoteBlob(first)).toBe(true);
    expect(first).not.toBe(second);
    expect(await decryptContent(first, '4821')).toBe('<p>Prayer list</p>');
  });

  it('refuses to send plaintext once the session has ended', async () => {
    setNoteUnlocked('note_a', null, '4821');
    lockAllNotes();
    await expect(encryptLockedNoteBody('note_a', '<p>Prayer list</p>')).rejects.toBeInstanceOf(LockedNoteSaveError);
  });

  it('leaves a body that is already ciphertext alone', async () => {
    const blob = await encryptContent('<p>x</p>', '4821');
    expect(await encryptLockedNoteBody('note_a', blob)).toBe(blob);
  });

  it('reads the lock from the note detail cache', () => {
    const qc = new QueryClient();
    qc.setQueryData(['note', 'note_a'], { id: 'note_a', contentEncrypted: true });
    qc.setQueryData(['note', 'note_b'], { id: 'note_b', contentEncrypted: false });
    expect(isCachedNoteLocked(qc, 'note_a')).toBe(true);
    expect(isCachedNoteLocked(qc, 'note_b')).toBe(false);
  });
});

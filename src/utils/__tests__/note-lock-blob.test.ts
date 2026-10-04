import { describe, expect, it } from 'vitest';
import { isEncryptedNoteBlob } from '../note-lock-blob';
import { encryptContent } from '../note-encryption';

describe('isEncryptedNoteBlob', () => {
  it('accepts real ciphertext, including an empty note', async () => {
    expect(isEncryptedNoteBlob(await encryptContent('<p>Romans 8</p>', '1234'))).toBe(true);
    expect(isEncryptedNoteBlob(await encryptContent('', '1234'))).toBe(true);
  });

  it('refuses the plaintext an editor would send', () => {
    expect(isEncryptedNoteBlob('<p>My prayer list</p>')).toBe(false);
    expect(isEncryptedNoteBlob('')).toBe(false);
    expect(isEncryptedNoteBlob(null)).toBe(false);
    // Long enough and base64-ish, but a plain word run still has spaces.
    expect(isEncryptedNoteBlob('a'.repeat(30) + ' ' + 'b'.repeat(33))).toBe(false);
  });
});

describe('previews never show ciphertext', () => {
  it('strips a locked body to nothing in every preview helper', async () => {
    const { stripHtml, stripHtmlForPreview, stripHtmlForListPreview, stripHtmlForCard } = await import(
      '../html-stripper'
    );
    const blob = await encryptContent('<p>Prayer list</p>', '1234');
    expect(stripHtml(blob)).toBe('');
    expect(stripHtmlForPreview(blob)).toBe('');
    expect(stripHtmlForListPreview(blob)).toBe('');
    expect(stripHtmlForCard(blob)).toBe('');
    expect(stripHtmlForListPreview('<p>Prayer list</p>')).toBe('Prayer list');
  });
});

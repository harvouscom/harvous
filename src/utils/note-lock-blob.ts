/**
 * Shape check for a locked note's stored body — no crypto, safe on server and client.
 *
 * A locked note's `content` is `base64(salt[16] || iv[12] || ciphertext)` (see
 * note-encryption.ts), and AES-GCM always appends a 16-byte tag, so even an empty
 * plaintext encrypts to 44 bytes = 60 base64 characters. Anything shorter, or with a
 * character outside the base64 alphabet, cannot be ciphertext — which is exactly what
 * the server needs to refuse: an editor that saved a locked note's *plaintext* back
 * into a row still flagged `contentEncrypted` would leave a note no PIN can open.
 */
const MIN_BLOB_BASE64_LENGTH = 60;

export function isEncryptedNoteBlob(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const t = value.trim();
  if (t.length < MIN_BLOB_BASE64_LENGTH || t.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(t);
}

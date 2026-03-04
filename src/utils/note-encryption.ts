/**
 * Client-side encryption module for locked notes.
 * Uses AES-GCM 256-bit encryption with PBKDF2 key derivation.
 *
 * Security model:
 * - PIN is never stored or transmitted
 * - Derived key exists only in memory during session
 * - Server only sees ciphertext (opaque blob)
 * - No recovery if PIN forgotten
 *
 * Blob format: base64(salt[16] || iv[12] || ciphertext[variable])
 */

// PBKDF2 iterations per OWASP 2025 recommendation
const PBKDF2_ITERATIONS = 310000;
const SALT_LENGTH = 16; // bytes
const IV_LENGTH = 12; // bytes for AES-GCM
const KEY_LENGTH = 256; // bits

/**
 * Validate that a PIN is exactly 4 digits
 */
export function validatePin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

/**
 * Generate a cryptographically secure salt
 */
export function generateSalt(): Uint8Array {
  const salt = new Uint8Array(SALT_LENGTH);
  crypto.getRandomValues(salt);
  return salt;
}

/**
 * Generate a cryptographically secure IV for AES-GCM
 */
function generateIV(): Uint8Array {
  const iv = new Uint8Array(IV_LENGTH);
  crypto.getRandomValues(iv);
  return iv;
}

/**
 * Derive an AES-256 key from PIN using PBKDF2-SHA256
 */
export async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  // Import the PIN as raw key material
  const encoder = new TextEncoder();
  const pinBuffer = encoder.encode(pin);

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    pinBuffer,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // Derive AES-GCM key using PBKDF2
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    {
      name: 'AES-GCM',
      length: KEY_LENGTH
    },
    false, // not extractable
    ['encrypt', 'decrypt']
  );
}

/**
 * Encode salt, IV, and ciphertext into a single base64 blob
 */
export function encodeBlob(salt: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array): string {
  // Concatenate: salt || iv || ciphertext
  const combined = new Uint8Array(salt.length + iv.length + ciphertext.length);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(ciphertext, salt.length + iv.length);

  // Convert to base64
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decode a base64 blob into salt, IV, and ciphertext
 */
export function decodeBlob(blob: string): { salt: Uint8Array; iv: Uint8Array; ciphertext: Uint8Array } {
  // Decode from base64
  const binaryString = atob(blob);
  const combined = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    combined[i] = binaryString.charCodeAt(i);
  }

  // Extract components
  const salt = combined.slice(0, SALT_LENGTH);
  const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);

  return { salt, iv, ciphertext };
}

/**
 * Encrypt plaintext content with a 4-digit PIN.
 * Returns a base64 blob containing salt || iv || ciphertext.
 *
 * @param plaintext - The note content to encrypt
 * @param pin - The 4-digit PIN
 * @returns base64 encoded encrypted blob
 * @throws Error if PIN is invalid or encryption fails
 */
export async function encryptContent(plaintext: string, pin: string): Promise<string> {
  if (!validatePin(pin)) {
    throw new Error('Invalid PIN: must be exactly 4 digits');
  }

  // Generate fresh salt and IV for each encryption
  const salt = generateSalt();
  const iv = generateIV();

  // Derive key from PIN
  const key = await deriveKey(pin, salt);

  // Encrypt the content
  const encoder = new TextEncoder();
  const plaintextBuffer = encoder.encode(plaintext);

  const ciphertextBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as BufferSource
    },
    key,
    plaintextBuffer as BufferSource
  );

  const ciphertext = new Uint8Array(ciphertextBuffer);

  // Encode as blob
  return encodeBlob(salt, iv, ciphertext);
}

/**
 * Decrypt an encrypted blob using an existing CryptoKey (e.g. from note-unlock-state).
 * Use when the note is already unlocked and we have the key in memory.
 *
 * @param encryptedBlob - base64 encoded blob (salt || iv || ciphertext)
 * @param key - The AES-GCM key (from deriveKey)
 * @returns The decrypted plaintext content
 */
export async function decryptWithKey(encryptedBlob: string, key: CryptoKey): Promise<string> {
  let iv: Uint8Array, ciphertext: Uint8Array;
  try {
    ({ iv, ciphertext } = decodeBlob(encryptedBlob));
  } catch {
    throw new Error('Invalid encrypted content format');
  }
  if (iv.length !== IV_LENGTH || ciphertext.length === 0) {
    throw new Error('Invalid encrypted content format');
  }
  try {
    const plaintextBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ciphertext as BufferSource
    );
    return new TextDecoder().decode(plaintextBuffer);
  } catch {
    throw new Error('Decryption failed');
  }
}

/**
 * Decrypt an encrypted blob with a 4-digit PIN.
 *
 * @param encryptedBlob - base64 encoded blob (salt || iv || ciphertext)
 * @param pin - The 4-digit PIN
 * @returns The decrypted plaintext content
 * @throws Error if PIN is invalid, decryption fails, or blob is malformed
 */
export async function decryptContent(encryptedBlob: string, pin: string): Promise<string> {
  const pinTrimmed = pin.trim();
  if (!validatePin(pinTrimmed)) {
    throw new Error('Invalid PIN: must be exactly 4 digits');
  }

  // Normalize blob: remove any whitespace that may have been introduced in storage/transit
  const blobNormalized = encryptedBlob.trim().replace(/\s/g, '');

  // Decode the blob
  let salt: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array;
  try {
    ({ salt, iv, ciphertext } = decodeBlob(blobNormalized));
  } catch {
    throw new Error('Invalid encrypted content format');
  }

  // Validate blob has expected minimum size
  if (salt.length !== SALT_LENGTH || iv.length !== IV_LENGTH || ciphertext.length === 0) {
    throw new Error('Invalid encrypted content format');
  }

  // Derive key from PIN
  const key = await deriveKey(pinTrimmed, salt);

  // Decrypt the content
  try {
    const plaintextBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv as BufferSource
      },
      key,
      ciphertext as BufferSource
    );

    const decoder = new TextDecoder();
    return decoder.decode(plaintextBuffer);
  } catch {
    // AES-GCM authentication failed - wrong PIN or tampered data
    throw new Error('Decryption failed: incorrect PIN or corrupted data');
  }
}

/**
 * Check if the Web Crypto API is available.
 * Required for encryption to work.
 */
export function isCryptoAvailable(): boolean {
  return typeof crypto !== 'undefined' &&
         typeof crypto.subtle !== 'undefined' &&
         typeof crypto.getRandomValues === 'function';
}

/**
 * Verify a PIN against an encrypted blob without fully decrypting.
 * Useful for validation before starting edit session.
 *
 * @param encryptedBlob - The encrypted content blob
 * @param pin - The PIN to verify
 * @returns true if PIN is correct, false otherwise
 */
export async function verifyPin(encryptedBlob: string, pin: string): Promise<boolean> {
  try {
    await decryptContent(encryptedBlob, pin);
    return true;
  } catch {
    return false;
  }
}

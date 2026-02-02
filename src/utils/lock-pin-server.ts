/**
 * Server-side utilities for account-level lock PIN.
 * Used only for verification (hash/salt stored in UserMetadata); never for encryption/decryption.
 */

import crypto from 'node:crypto';

const PBKDF2_ITERATIONS = 100000;
const SALT_BYTES = 32;
const HASH_BYTES = 32;

/** 4-digit PIN format (matches client validatePin) */
const PIN_REGEX = /^\d{4}$/;

function normalizePin(pin: unknown): string {
  return String(pin ?? '').trim();
}

export function validatePinFormat(pin: string): boolean {
  return PIN_REGEX.test(normalizePin(pin));
}

/**
 * Hash a PIN with a given salt. Used for verification only.
 */
function hashPin(pin: string, salt: Buffer): Buffer {
  const normalized = normalizePin(pin);
  return crypto.pbkdf2Sync(
    normalized,
    salt,
    PBKDF2_ITERATIONS,
    HASH_BYTES,
    'sha256'
  );
}

/**
 * Generate a new salt and hash for a PIN. Returns { salt, hash } as base64.
 */
export function hashPinNew(pin: string): { salt: string; hash: string } {
  const normalized = normalizePin(pin);
  if (!PIN_REGEX.test(normalized)) {
    throw new Error('Invalid PIN: must be exactly 4 digits');
  }
  const salt = crypto.randomBytes(SALT_BYTES);
  const hash = hashPin(normalized, salt);
  return {
    salt: salt.toString('base64'),
    hash: hash.toString('base64')
  };
}

/**
 * Verify a PIN against stored salt and hash.
 */
export function verifyPin(pin: string, saltBase64: string, hashBase64: string): boolean {
  const normalized = normalizePin(pin);
  if (!PIN_REGEX.test(normalized)) return false;
  const salt = Buffer.from(saltBase64, 'base64');
  const expectedHash = Buffer.from(hashBase64, 'base64');
  const actualHash = hashPin(normalized, salt);
  if (expectedHash.length !== actualHash.length) return false;
  try {
    return crypto.timingSafeEqual(expectedHash, actualHash);
  } catch {
    return false;
  }
}

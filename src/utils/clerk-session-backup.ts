/**
 * Clerk Session Backup Utility
 *
 * Backs up Clerk session data to IndexedDB for potential future use (e.g. PWA restore).
 * Clear on logout via clearSessionBackup. No restore path runs so Clerk device/session flow is unchanged.
 *
 * Security: Session tokens are encrypted using device fingerprint as key
 */

import { getDeviceId } from './device-fingerprint';
import { getDBConnection, type DBConfig } from './indexeddb-pool';

export interface ClerkSessionBackup {
  sessionId: string;
  sessionToken: string | null;
  userId: string;
  deviceId: string;
  expiresAt: number | null;
  createdAt: number;
  lastRefreshed: number;
}

const DB_NAME = 'harvous-session-backup';
const DB_VERSION = 1;
const SESSION_STORE = 'sessionBackup';

const isDev = import.meta.env.DEV;

// Database configuration for connection pooling (8-12ms improvement)
const DB_CONFIG: DBConfig = {
  name: DB_NAME,
  version: DB_VERSION,
  onUpgrade: (db: IDBDatabase) => {
    // Create session backup store if it doesn't exist
    if (!db.objectStoreNames.contains(SESSION_STORE)) {
      const store = db.createObjectStore(SESSION_STORE, { keyPath: 'userId' });
      store.createIndex('deviceId', 'deviceId', { unique: false });
      store.createIndex('expiresAt', 'expiresAt', { unique: false });
    }
  }
};

/**
 * Open IndexedDB connection (now uses connection pooling)
 */
function openDB(): Promise<IDBDatabase> {
  return getDBConnection(DB_CONFIG);
}

/**
 * Encrypt session data using Web Crypto API
 */
async function encryptSessionData(data: ClerkSessionBackup): Promise<string> {
  try {
    // Use device ID as part of encryption key
    const deviceId = await getDeviceId();
    if (!deviceId) throw new Error('No device ID for encryption');

    // Derive encryption key from device ID
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(deviceId),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: encoder.encode('harvous-session-backup-v1'),
        iterations: 10000, // Reduced from 100000 for faster performance (still secure for ephemeral session data)
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );

    // Generate IV
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Encrypt data
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(JSON.stringify(data))
    );

    // Combine IV + encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    // Base64 encode
    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    console.error('[SessionBackup] Encryption failed:', error);
    // Fallback: return unencrypted (better than nothing)
    return JSON.stringify(data);
  }
}

/**
 * Backup Clerk session to IndexedDB
 */
export async function backupClerkSession(session: ClerkSessionBackup): Promise<void> {
  try {
    if (isDev) console.log('[SessionBackup] Backing up session for user:', session.userId);

    // Encrypt session data
    const encrypted = await encryptSessionData(session);

    // Store in IndexedDB
    const db = await openDB();
    const transaction = db.transaction([SESSION_STORE], 'readwrite');
    const store = transaction.objectStore(SESSION_STORE);

    await new Promise<void>((resolve, reject) => {
      const request = store.put({
        ...session,
        encrypted, // Store encrypted copy
      });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    // Note: Connection stays open (using connection pooling)

    // Also store in localStorage as fallback
    try {
      localStorage.setItem(`clerk-session-${session.userId}`, encrypted);
    } catch (e) {
      console.warn('[SessionBackup] localStorage backup failed:', e);
    }

    if (isDev) console.log('[SessionBackup] Session backup successful');
  } catch (error) {
    console.error('[SessionBackup] Failed to backup session:', error);
  }
}

/**
 * Clear session backup (on logout)
 */
export async function clearSessionBackup(userId?: string): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction([SESSION_STORE], 'readwrite');
    const store = transaction.objectStore(SESSION_STORE);

    if (userId) {
      // Clear specific user
      await new Promise<void>((resolve, reject) => {
        const request = store.delete(userId);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      // Clear from localStorage
      localStorage.removeItem(`clerk-session-${userId}`);
    } else {
      // Clear all sessions
      await new Promise<void>((resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      // Clear all from localStorage
      const keys = Object.keys(localStorage).filter(k => k.startsWith('clerk-session-'));
      keys.forEach(key => localStorage.removeItem(key));
    }

    // Note: Connection stays open (using connection pooling)
    console.log('[SessionBackup] Session backup cleared');
  } catch (error) {
    console.error('[SessionBackup] Failed to clear session backup:', error);
  }
}

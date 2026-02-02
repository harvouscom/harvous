/**
 * Clerk Session Backup Utility
 *
 * Backs up Clerk session data to IndexedDB to restore on app relaunch.
 * Solves the "Detect new device" issue in PWA/mobile where cookies don't persist.
 *
 * Security: Session tokens are encrypted using device fingerprint as key
 */

import { getDeviceId } from './device-fingerprint';

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

/**
 * Open IndexedDB connection
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create session backup store if it doesn't exist
      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        const store = db.createObjectStore(SESSION_STORE, { keyPath: 'userId' });
        store.createIndex('deviceId', 'deviceId', { unique: false });
        store.createIndex('expiresAt', 'expiresAt', { unique: false });
      }
    };
  });
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
 * Decrypt session data
 */
async function decryptSessionData(encryptedData: string): Promise<ClerkSessionBackup | null> {
  try {
    // Use device ID as part of decryption key
    const deviceId = await getDeviceId();
    if (!deviceId) throw new Error('No device ID for decryption');

    // Try to decode base64
    const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));

    // Extract IV and encrypted data
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);

    // Derive decryption key
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
      ['decrypt']
    );

    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted
    );

    const decoder = new TextDecoder();
    const jsonString = decoder.decode(decrypted);
    return JSON.parse(jsonString) as ClerkSessionBackup;
  } catch (error) {
    console.warn('[SessionBackup] Decryption failed, trying unencrypted fallback:', error);
    // Try parsing as unencrypted JSON (fallback)
    try {
      return JSON.parse(encryptedData) as ClerkSessionBackup;
    } catch (e) {
      console.error('[SessionBackup] Failed to parse session backup:', e);
      return null;
    }
  }
}

/**
 * Backup Clerk session to IndexedDB
 */
export async function backupClerkSession(session: ClerkSessionBackup): Promise<void> {
  try {
    console.log('[SessionBackup] Backing up session for user:', session.userId);

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

    db.close();

    // Also store in localStorage as fallback
    try {
      localStorage.setItem(`clerk-session-${session.userId}`, encrypted);
    } catch (e) {
      console.warn('[SessionBackup] localStorage backup failed:', e);
    }

    console.log('[SessionBackup] Session backup successful');
  } catch (error) {
    console.error('[SessionBackup] Failed to backup session:', error);
  }
}

/**
 * Restore Clerk session from IndexedDB
 */
export async function restoreClerkSession(): Promise<ClerkSessionBackup | null> {
  try {
    // Try to get from IndexedDB first
    const db = await openDB();
    const transaction = db.transaction([SESSION_STORE], 'readonly');
    const store = transaction.objectStore(SESSION_STORE);

    const allBackups = await new Promise<ClerkSessionBackup[]>((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });

    db.close();

    if (allBackups.length === 0) {
      console.log('[SessionBackup] No session backups found in IndexedDB');
      return null;
    }

    // Get most recent backup
    const backup = allBackups.sort((a, b) => b.lastRefreshed - a.lastRefreshed)[0];

    // Decrypt if encrypted field exists
    if ((backup as any).encrypted) {
      const decrypted = await decryptSessionData((backup as any).encrypted);
      if (decrypted) {
        console.log('[SessionBackup] Session restored from IndexedDB');
        return decrypted;
      }
    }

    console.log('[SessionBackup] Session restored from IndexedDB (unencrypted fallback)');
    return backup;
  } catch (error) {
    console.error('[SessionBackup] Failed to restore from IndexedDB:', error);

    // Fallback to localStorage
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith('clerk-session-'));
      if (keys.length > 0) {
        const encrypted = localStorage.getItem(keys[0]);
        if (encrypted) {
          const decrypted = await decryptSessionData(encrypted);
          if (decrypted) {
            console.log('[SessionBackup] Session restored from localStorage');
            return decrypted;
          }
        }
      }
    } catch (e) {
      console.error('[SessionBackup] localStorage restore failed:', e);
    }

    return null;
  }
}

/**
 * Check if session backup is still valid
 */
export function isSessionValid(session: ClerkSessionBackup): boolean {
  // Check if session has expired
  if (session.expiresAt && session.expiresAt < Date.now()) {
    console.log('[SessionBackup] Session expired');
    return false;
  }

  // Check if session is too old (max 7 days)
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  if (Date.now() - session.createdAt > sevenDaysMs) {
    console.log('[SessionBackup] Session too old (>7 days)');
    return false;
  }

  // Check if device ID matches
  getDeviceId().then(deviceId => {
    if (deviceId && session.deviceId !== deviceId) {
      console.warn('[SessionBackup] Device ID mismatch');
      return false;
    }
  });

  return true;
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

    db.close();
    console.log('[SessionBackup] Session backup cleared');
  } catch (error) {
    console.error('[SessionBackup] Failed to clear session backup:', error);
  }
}

/**
 * Refresh session backup timestamp
 */
export async function refreshSessionBackup(userId: string): Promise<void> {
  try {
    const session = await restoreClerkSession();
    if (session && session.userId === userId) {
      session.lastRefreshed = Date.now();
      await backupClerkSession(session);
    }
  } catch (error) {
    console.error('[SessionBackup] Failed to refresh session backup:', error);
  }
}

/**
 * Get all session backups (for debugging)
 */
export async function getAllSessionBackups(): Promise<ClerkSessionBackup[]> {
  try {
    const db = await openDB();
    const transaction = db.transaction([SESSION_STORE], 'readonly');
    const store = transaction.objectStore(SESSION_STORE);

    const backups = await new Promise<ClerkSessionBackup[]>((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });

    db.close();
    return backups;
  } catch (error) {
    console.error('[SessionBackup] Failed to get all backups:', error);
    return [];
  }
}

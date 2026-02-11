/**
 * Clerk PWA Helper Utility
 *
 * PWA-specific Clerk configuration and cookie management
 * Helps preserve Clerk cookies across PWA app launches
 */

import { getOrCreateDeviceId } from './device-fingerprint';
import { backupClerkSession, type ClerkSessionBackup } from './clerk-session-backup';

const DB_NAME = 'harvous-clerk-cookies';
const DB_VERSION = 1;
const COOKIES_STORE = 'clerkCookies';

/**
 * Detect if app is running in PWA mode
 */
export function isPWAMode(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true ||
    document.referrer.includes('android-app://')
  );
}

/**
 * Get all Clerk-related cookies
 */
function getClerkCookies(): string[] {
  const cookies = document.cookie.split(';');
  return cookies
    .map(c => c.trim())
    .filter(c => c.startsWith('__clerk') || c.startsWith('__session'));
}

/**
 * Parse cookie string into object
 */
function parseCookie(cookieString: string): { name: string; value: string } | null {
  const parts = cookieString.split('=');
  if (parts.length < 2) return null;
  return {
    name: parts[0].trim(),
    value: parts.slice(1).join('=').trim(),
  };
}

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

      // Create cookies store if it doesn't exist
      if (!db.objectStoreNames.contains(COOKIES_STORE)) {
        const store = db.createObjectStore(COOKIES_STORE, { keyPath: 'name' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

/**
 * Backup Clerk cookies to IndexedDB
 */
async function backupClerkCookies(): Promise<void> {
  try {
    const clerkCookies = getClerkCookies();
    if (clerkCookies.length === 0) return;

    const db = await openDB();
    const transaction = db.transaction([COOKIES_STORE], 'readwrite');
    const store = transaction.objectStore(COOKIES_STORE);

    for (const cookieString of clerkCookies) {
      const cookie = parseCookie(cookieString);
      if (cookie) {
        await new Promise<void>((resolve, reject) => {
          const request = store.put({
            ...cookie,
            timestamp: Date.now(),
          });
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      }
    }

    db.close();
    console.log('[ClerkPWA] Backed up', clerkCookies.length, 'Clerk cookies');
  } catch (error) {
    console.error('[ClerkPWA] Failed to backup cookies:', error);
  }
}

/**
 * Restore Clerk cookies from IndexedDB (exported for auth-pwa-init restore path)
 */
export async function restoreClerkCookies(): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction([COOKIES_STORE], 'readonly');
    const store = transaction.objectStore(COOKIES_STORE);

    const cookies = await new Promise<any[]>((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });

    db.close();

    if (cookies.length === 0) {
      console.log('[ClerkPWA] No Clerk cookies to restore');
      return;
    }

    // Try to restore cookies (may not work due to browser restrictions)
    for (const cookie of cookies) {
      try {
        // Set cookie with SameSite=Lax for better compatibility
        document.cookie = `${cookie.name}=${cookie.value}; path=/; SameSite=Lax; Secure`;
      } catch (e) {
        console.warn('[ClerkPWA] Failed to restore cookie:', cookie.name, e);
      }
    }

    console.log('[ClerkPWA] Restored', cookies.length, 'Clerk cookies');
  } catch (error) {
    console.error('[ClerkPWA] Failed to restore cookies:', error);
  }
}

/**
 * Watch for Clerk cookie changes and backup
 */
function watchClerkCookies(): void {
  let lastCookies = document.cookie;

  const checkInterval = setInterval(() => {
    const currentCookies = document.cookie;
    if (currentCookies !== lastCookies) {
      lastCookies = currentCookies;
      backupClerkCookies();
    }
  }, 5000); // Check every 5 seconds

  // Clear interval on page unload
  window.addEventListener('beforeunload', () => {
    clearInterval(checkInterval);
  });
}

/**
 * Listen for Clerk session changes and backup
 */
export async function listenForClerkSession(): Promise<void> {
  // Wait for Clerk to load
  const waitForClerk = (): Promise<void> => {
    return new Promise((resolve) => {
      if ((window as any).Clerk) {
        resolve();
      } else {
        const checkClerk = setInterval(() => {
          if ((window as any).Clerk) {
            clearInterval(checkClerk);
            resolve();
          }
        }, 100);

        // Timeout after 10 seconds
        setTimeout(() => {
          clearInterval(checkClerk);
          resolve();
        }, 10000);
      }
    });
  };

  await waitForClerk();

  const Clerk = (window as any).Clerk;
  if (!Clerk) {
    console.warn('[ClerkPWA] Clerk not available');
    return;
  }

  console.log('[ClerkPWA] Clerk loaded, setting up session listener');

  // Listen for session changes
  try {
    Clerk.addListener((session: any) => {
      if (session?.id) {
        console.log('[ClerkPWA] Clerk session changed, backing up...');

        // Get device ID (same semantics as auth-pwa-init for backup/restore consistency)
        getOrCreateDeviceId(true).then(deviceId => {
          const backup: ClerkSessionBackup = {
            sessionId: session.id,
            sessionToken: session.lastActiveToken?.getRawString() || null,
            userId: session.userId,
            deviceId,
            expiresAt: session.expireAt || null,
            createdAt: Date.now(),
            lastRefreshed: Date.now(),
          };

          backupClerkSession(backup);
        });

        // Backup cookies
        backupClerkCookies();
      }
    });
  } catch (error) {
    console.error('[ClerkPWA] Failed to add Clerk listener:', error);
  }
}

/**
 * Initialize Clerk for PWA
 * Should be called on app startup
 */
export async function initClerkForPWA(): Promise<void> {
  const isPWA = isPWAMode();

  console.log('[ClerkPWA] Initializing Clerk PWA helper, isPWA:', isPWA);

  // Generate/retrieve device ID (same semantics as auth-pwa-init for backup/restore consistency)
  const deviceId = await getOrCreateDeviceId(true);
  console.log('[ClerkPWA] Device ID:', deviceId.substring(0, 8) + '...');

  // Do NOT restore cookies here. Restoring before Clerk runs can cause Clerk to skip device
  // registration (Dashboard shows "unknown device"). Cookie restore only happens in the
  // silent-restore path in auth-pwa-init (before setSession) when deviceId matches backup.

  // Watch for cookie changes
  watchClerkCookies();

  // Listen for Clerk session changes
  await listenForClerkSession();

  console.log('[ClerkPWA] Initialization complete');
}

/**
 * Clear all Clerk PWA data (on logout)
 */
export async function clearClerkPWAData(): Promise<void> {
  try {
    const db = await openDB();

    // Clear cookies store
    const transaction = db.transaction([COOKIES_STORE], 'readwrite');
    const store = transaction.objectStore(COOKIES_STORE);

    await new Promise<void>((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    db.close();

    console.log('[ClerkPWA] Cleared all Clerk PWA data');
  } catch (error) {
    console.error('[ClerkPWA] Failed to clear Clerk PWA data:', error);
  }
}

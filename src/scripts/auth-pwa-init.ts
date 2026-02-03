/**
 * PWA Auth Init - bundled entry for sign-in/sign-up pages.
 * Uses static imports so the browser never requests /src/ in production.
 * Exports: initializePWAAuth (sign-in), initializePWAForSignUp (sign-up),
 * setupClerkSessionBackupListener (session backup on clerk:loaded).
 */

import { getOrCreateDeviceId } from '@/utils/device-fingerprint';
import {
  restoreClerkSession,
  isSessionValid,
  backupClerkSession
} from '@/utils/clerk-session-backup';
import { initClerkForPWA } from '@/utils/clerk-pwa-helper';

// Cache device ID for reuse in session listener
let cachedDeviceId: string | null = null;
const isDev = import.meta.env.DEV;

declare global {
  interface Window {
    Clerk?: {
      setSession: (sessionId: string) => Promise<void>;
      addListener: (cb: (session: { id: string; userId: string; expireAt?: number; lastActiveToken?: { getRawString: () => string } }) => void) => void;
    };
  }
}

function waitForClerk(): Promise<typeof window.Clerk | null> {
  return new Promise((resolve) => {
    if (window.Clerk) {
      resolve(window.Clerk);
      return;
    }
    const checkInterval = setInterval(() => {
      if (window.Clerk) {
        clearInterval(checkInterval);
        resolve(window.Clerk);
      }
    }, 100);
    setTimeout(() => {
      clearInterval(checkInterval);
      resolve(null);
    }, 10000);
  });
}

/**
 * Sign-in PWA auth: fingerprint, optional session restore + redirect, then initClerkForPWA.
 * Optimized: runs operations in parallel to reduce initialization time.
 */
export async function initializePWAAuth(): Promise<void> {
  try {
    if (isDev) console.log('[Auth] Initializing PWA auth...');

    // Run all operations in parallel for faster initialization
    const [deviceId, sessionBackup] = await Promise.all([
      getOrCreateDeviceId(true),  // Skip audio for faster sign-in
      restoreClerkSession(),
      initClerkForPWA() // Initialize Clerk in parallel
    ]);

    // Cache device ID for later use in session listener
    cachedDeviceId = deviceId;

    if (isDev) console.log('[Auth] Device ID:', deviceId.substring(0, 8) + '...');

    if (sessionBackup && await isSessionValid(sessionBackup)) {
      if (isDev) console.log('[Auth] Valid session backup found');

      if (sessionBackup.deviceId === deviceId) {
        if (isDev) console.log('[Auth] Device ID matches, attempting silent restore');

        const Clerk = await waitForClerk();

        if (Clerk && sessionBackup.sessionId) {
          try {
            await Clerk.setSession(sessionBackup.sessionId);
            if (isDev) console.log('[Auth] Session restored successfully, redirecting...');

            const urlParams = new URLSearchParams(window.location.search);
            const redirectUrl = urlParams.get('redirect_url') || '/';
            window.location.href = redirectUrl;
            return;
          } catch (error) {
            if (isDev) console.log('[Auth] Silent restore failed, continuing to sign-in:', error);
          }
        }
      } else {
        if (isDev) console.log('[Auth] Device ID mismatch - session from different device');
      }
    } else {
      if (isDev) console.log('[Auth] No valid session backup found');
    }
  } catch (error) {
    console.error('[Auth] PWA auth initialization failed:', error);
  }
}

/**
 * Sign-up PWA auth: fingerprint + initClerkForPWA.
 */
export async function initializePWAForSignUp(): Promise<void> {
  try {
    if (isDev) console.log('[Auth] Initializing device fingerprinting for sign-up...');

    const deviceId = await getOrCreateDeviceId();
    // Cache device ID for later use in session listener
    cachedDeviceId = deviceId;
    if (isDev) console.log('[Auth] Device ID created:', deviceId.substring(0, 8) + '...');

    await initClerkForPWA();

    if (isDev) console.log('[Auth] PWA initialization complete');
  } catch (error) {
    console.error('[Auth] PWA initialization failed:', error);
  }
}

/**
 * Registers clerk:loaded and Clerk.addListener to backup session on sign-in/sign-up.
 */
export function setupClerkSessionBackupListener(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('clerk:loaded', () => {
    if (!window.Clerk) return;

    window.Clerk.addListener(async (session) => {
      if (!session?.id || !session?.userId) return;

      if (isDev) console.log('[Auth] User signed in, backing up session...');

      try {
        // Use cached device ID (instant) or fetch if not available
        const deviceId = cachedDeviceId || await getOrCreateDeviceId();

        await backupClerkSession({
          sessionId: session.id,
          sessionToken: session.lastActiveToken?.getRawString() || null,
          userId: session.userId,
          deviceId,
          expiresAt: session.expireAt ?? null,
          createdAt: Date.now(),
          lastRefreshed: Date.now(),
        });

        if (isDev) console.log('[Auth] Session backup complete');
      } catch (error) {
        console.error('[Auth] Failed to backup session:', error);
      }
    });
  });
}

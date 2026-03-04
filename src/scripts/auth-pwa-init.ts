/**
 * PWA Auth Init - bundled entry for sign-in/sign-up pages.
 * Registers clerk:loaded and Clerk.addListener to backup session on sign-in/sign-up.
 * No restore path: ensures Clerk handles sign-in and device registration normally.
 */

import { getOrCreateDeviceId } from '@/utils/device-fingerprint';
import { backupClerkSession } from '@/utils/clerk-session-backup';

// Cache device ID for reuse in session listener
let cachedDeviceId: string | null = null;
const isDev = import.meta.env.DEV;

/**
 * Registers clerk:loaded and Clerk.addListener to backup session on sign-in/sign-up.
 */
export function setupClerkSessionBackupListener(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('clerk:loaded', () => {
    if (!window.Clerk) return;

    (window.Clerk as any).addListener(async (session: any) => {
      if (!session?.id || !session?.userId) return;

      if (isDev) console.log('[Auth] User signed in, backing up session...');

      try {
        const deviceId = cachedDeviceId || await getOrCreateDeviceId(true);
        cachedDeviceId = deviceId;

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

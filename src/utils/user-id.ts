import { useState, useEffect } from 'react';

/**
 * Hook to get userId from Clerk (online) or localStorage (offline)
 * Works in both authenticated and offline scenarios
 * Gracefully handles cases where ClerkProvider is not available
 */
export function usePersistedUserId(): string | null {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Try to get userId from Clerk first (if available)
    try {
      // Check if Clerk is available globally
      const clerk = (window as any).Clerk;
      if (clerk && clerk.user) {
        const clerkUserId = clerk.user.id;
        if (clerkUserId) {
          localStorage.setItem('harvous_userId', clerkUserId);
          setUserId(clerkUserId);
          return;
        }
      }
    } catch (error) {
      // Clerk not available, continue to localStorage fallback
      console.debug('[usePersistedUserId] Clerk not available, using localStorage');
    }

    // Fallback to localStorage userId (for offline scenarios or when Clerk isn't available)
    const stored = localStorage.getItem('harvous_userId');
    if (stored) {
      setUserId(stored);
    }
  }, []);

  return userId;
}
/**
 * Get persisted userId synchronously from localStorage
 * Returns null if no userId is stored
 * Use this for non-React contexts where hooks can't be used
 */
export function getPersistedUserId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('harvous_userId');
}

/**
 * Alias for getPersistedUserId - kept for backwards compatibility
 * Use getPersistedUserId() instead
 */
export function getPersistedUserIdWithIndexedDB(): string | null {
  return getPersistedUserId();
}

/**
 * Persist userId to localStorage
 * Use this to store userId when user logs in
 */
export function persistUserId(userId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('harvous_userId', userId);
}

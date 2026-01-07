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

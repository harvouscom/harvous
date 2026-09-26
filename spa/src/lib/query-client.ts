import { QueryClient } from '@tanstack/react-query';
import { APIError } from './api';

/**
 * The app's one QueryClient, in its own module so `main.tsx` can restore last visit's cache into
 * it before the first render (see src/utils/query-cache-persistence.ts).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,           // 1 minute
      // 30 minutes. Leaving the PWA for longer than gcTime used to drop every inactive query,
      // so coming back painted loaders instead of last-known data revalidating underneath.
      // Costs memory only; staleTime (not this) decides when anything refetches.
      gcTime: 30 * 60_000,
      retry: (failureCount, error) => {
        // Don't retry on 401 (session expired) — redirect to sign-in instead
        if (error instanceof APIError && error.status === 401) return false;
        return failureCount < 2;
      },
      // Refetch stale queries when the user returns to the tab/app or regains
      // network. staleTime still gates this, so quick tab flips don't refetch —
      // but coming back after being away (or after an edit on another device)
      // pulls fresh data without a manual reload.
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: false,
    },
  },
});

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { fetchVotdToday, todayCalendarDayKey } from '../../lib/votd-today';
import { useTradition } from '../useTradition';
import { useLocalDay } from '../useLocalDay';

/** Prefix for every day's entry — invalidate and `setQueriesData` with this. */
export const votdTodayQueryKey = ['votd', 'today'] as const;

/** One local day's entry, for one reader: a member's carries the words, a guest's does not. */
export function votdTodayKeyFor(day: string = todayCalendarDayKey(), userId?: string | null) {
  return [...votdTodayQueryKey, day, userId ?? 'guest'] as const;
}

/**
 * One key per local day, for both traditions: the server answers a member from the account, and
 * switching tradition invalidates it (`useUpdateTradition`), so the next fetch carries the new one.
 *
 * The day is in the key because the hour of `staleTime` used to outlive midnight: a passage
 * fetched at 11:30pm was still "fresh" at 12:20am, and an app resumed in the morning showed
 * yesterday's until something forced a refetch. A new day is now a new query.
 */
export function useVotdToday(options?: { enabled?: boolean }) {
  const tradition = useTradition();
  const day = useLocalDay();
  /*
   * Waits for Clerk, and is keyed by who is asking. Asked before Clerk had loaded, the request
   * went out without a session and came back as a guest's answer — the reference, no words —
   * which the card cannot show, and the query then held that for its hour even once the member
   * was plainly signed in. A guest's answer is never a member's.
   */
  const { isLoaded, userId } = useAuth();
  return useQuery({
    queryKey: votdTodayKeyFor(day, userId),
    enabled: options?.enabled !== false && isLoaded,
    queryFn: () => fetchVotdToday(tradition, day),
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
}

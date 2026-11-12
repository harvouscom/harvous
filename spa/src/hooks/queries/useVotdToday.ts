import { useQuery } from '@tanstack/react-query';
import { fetchVotdToday, todayCalendarDayKey } from '../../lib/votd-today';
import { useTradition } from '../useTradition';
import { useLocalDay } from '../useLocalDay';

/** Prefix for every day's entry — invalidate and `setQueriesData` with this. */
export const votdTodayQueryKey = ['votd', 'today'] as const;

/** One local day's entry. */
export function votdTodayKeyFor(day: string = todayCalendarDayKey()) {
  return [...votdTodayQueryKey, day] as const;
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
  return useQuery({
    queryKey: votdTodayKeyFor(day),
    enabled: options?.enabled !== false,
    queryFn: () => fetchVotdToday(tradition, day),
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
}

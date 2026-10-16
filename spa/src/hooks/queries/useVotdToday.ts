import { useQuery } from '@tanstack/react-query';
import { fetchVotdToday } from '../../lib/votd-today';
import { useTradition } from '../useTradition';

export const votdTodayQueryKey = ['votd', 'today'] as const;

/**
 * One key for both traditions: the server answers a member from the account, and switching
 * tradition invalidates it (`useUpdateTradition`), so the next fetch carries the new one.
 */
export function useVotdToday(options?: { enabled?: boolean }) {
  const tradition = useTradition();
  return useQuery({
    queryKey: votdTodayQueryKey,
    enabled: options?.enabled !== false,
    queryFn: () => fetchVotdToday(tradition),
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
}

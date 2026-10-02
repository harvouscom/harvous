import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import { useHarvousIdentity } from '../useHarvousIdentity';
import { useHasFeature } from '../useHasFeature';
import type { LeavingSoon } from '../../lib/history-window-copy';

export type HistoryWindowStatus =
  | { fullHistory: true }
  | {
      fullHistory: false;
      windowDays: number;
      graceDays: number;
      hiddenCount: number;
      hiddenCapped: boolean;
      hasHidden: boolean;
      leavingSoon: LeavingSoon | null;
    };

export const HISTORY_WINDOW_STATUS_KEY = ['user', 'history-window'] as const;

/**
 * The free history window's state, for the Home "leaves your history" row, the weekly
 * reminder, and the trail edge's count. Only asked for free accounts: Plus has no window and
 * guests have no account, so neither ever fetches.
 */
export function useHistoryWindowStatus() {
  const authReady = useAuthReady();
  const { isGuest } = useHarvousIdentity();
  const fullHistory = useHasFeature('full_history');
  const enabled = authReady && !isGuest && fullHistory.ready && !fullHistory.has;
  const query = useQuery({
    queryKey: HISTORY_WINDOW_STATUS_KEY,
    queryFn: () => api.get<HistoryWindowStatus>('/api/user/history-window'),
    enabled,
    // The window moves by the day; an hour is plenty fresh.
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
  const data = query.data && !query.data.fullHistory ? query.data : null;
  return { status: data, enabled };
}

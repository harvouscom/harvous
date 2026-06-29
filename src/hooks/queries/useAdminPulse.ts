import { useQuery } from '@tanstack/react-query';
import { useHarvousAdminCheck } from './useVotdPreview';
import type { DiscoveryRankItem } from './useAdminUsage';
import type { CanonGroupStat } from '@/utils/admin-pulse-canon-groups';

const API_BASE =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL
    ? String(import.meta.env.VITE_API_BASE_URL)
    : '';

async function adminApiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: 'include' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export type RankDelta = {
  name: string;
  current: number;
  previous: number;
  delta: number;
  deltaPct: number | null;
};

export type CanonBookCell = {
  name: string;
  order: number;
  count: number;
  sharePct: number;
  heatLevel: number;
};

export type PulseHistoryMonth = {
  month: string;
  books: DiscoveryRankItem[];
};

export type PulseXpActivity = {
  activityType: string;
  label: string;
  totalXp: number;
  eventCount: number;
  users: number;
};

export type PulseXpRate = {
  label: string;
  value: string;
  detail?: string;
};

export type PulseXpSummary = {
  days: number;
  totalXp: number;
  eventCount: number;
  users: number;
  avgXpPerUser: number;
  byActivity: PulseXpActivity[];
  rising: RankDelta[];
  rates: PulseXpRate[];
};

export type ListedRankDelta = {
  name: string;
  count: number;
  previous: number;
  delta: number;
  deltaPct: number | null;
};

export type PulseThreadsSummary = {
  totalThreads: number;
  avgNotesPerThread: number;
  linksCreated: number;
  threadsLinkedInWindow: number;
  notesInThreads: number;
};

export type PulseThreadsRecall = {
  impressions: number;
  opens: number;
  snoozes: number;
  snoozeRatePct: number;
  impressionsByKind: DiscoveryRankItem[];
  opensByKind: DiscoveryRankItem[];
};

export type PulseThreadsStats = {
  summary: PulseThreadsSummary;
  themes: DiscoveryRankItem[];
  recall: PulseThreadsRecall;
};

export type AdminPulse = {
  days: number;
  uniquePassages: number;
  books: CanonBookCell[];
  rising: {
    books: RankDelta[];
    passages: RankDelta[];
    themes: RankDelta[];
  };
  cooling: {
    books: RankDelta[];
    passages: RankDelta[];
    themes: RankDelta[];
  };
  curiosity: {
    passages: ListedRankDelta[];
    dictionaryWords: ListedRankDelta[];
    folders: ListedRankDelta[];
    tags: ListedRankDelta[];
    themes: DiscoveryRankItem[];
    tones: DiscoveryRankItem[];
    translations: DiscoveryRankItem[];
  };
  threads: PulseThreadsStats;
  history: PulseHistoryMonth[];
  xp: PulseXpSummary;
  canonGroups: {
    groups: CanonGroupStat[];
    rising: RankDelta[];
    cooling: RankDelta[];
  };
};

const PULSE_KEY = ['admin-pulse'] as const;
const ADMIN_PULSE_STALE_MS = 30 * 60 * 1000;

export function useAdminPulse(days = 7) {
  const admin = useHarvousAdminCheck();
  return useQuery({
    queryKey: [...PULSE_KEY, days],
    queryFn: () => adminApiGet<AdminPulse>(`/api/admin/pulse?days=${days}`),
    enabled: admin.isSuccess && admin.data?.isAdmin === true,
    staleTime: 0,
    gcTime: ADMIN_PULSE_STALE_MS,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: (previousData) => previousData,
  });
}

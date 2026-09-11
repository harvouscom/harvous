import { useQuery } from '@tanstack/react-query';
import { useHarvousAdminCheck } from './useVotdPreview';
import type { PulseXpSummary } from './useAdminPulse';

const API_BASE =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL
    ? String(import.meta.env.VITE_API_BASE_URL)
    : '';

const ADMIN_FETCH_MS = 45_000;

async function adminApiGet<T>(path: string): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      signal: AbortSignal.timeout(ADMIN_FETCH_MS),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
    }
    return res.json() as Promise<T>;
  } catch (error) {
    if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new Error('Timed out waiting for Usage. Try again in a few seconds.');
    }
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new Error('Timed out waiting for Usage. Try again in a few seconds.');
    }
    throw error;
  }
}

export type DiscoveryRankItem = { name: string; count: number };

export type UsageOverview = {
  days: number;
  users: {
    total: number;
    clerkAccounts: number | null;
    withContent: number;
    /** Active, non-withheld entitlements — the rule the feature gates apply. */
    paidAccounts: number;
    /** Of those, source='billing'. Kept separate so a comp never reads as revenue. */
    billingAccounts: number;
    grantedAccounts: number;
    freeAccounts: number;
    activationRate: number;
    signups: number;
    activeRatePct: number;
  };
  content: {
    notes: number;
    folders: number;
    threads: number;
    notesCreated: number;
    notesByType: { default: number; scripture: number; resource: number };
  };
  engagement: {
    activeUsers: number;
    notesEdited: number;
  };
  study: {
    avgNotesPerUserWithContent: number;
    notesLinkedInThreads: number;
    linkRatePct: number;
    highlightsSpawned: number;
    highlightRatePct: number;
    notesWithPassages: number;
    passageRatePct: number;
    pinnedNotes: number;
    studyThreadEntries: number;
  };
  passage: {
    usersWhoAddedPassage: number;
    dismissCloseEvents: number;
    createNoteEvents: number;
  };
  scripture: {
    totalPills: number;
    scriptureNoteShare: number;
    topTranslations: DiscoveryRankItem[];
  };
  recall: {
    opens: number;
    snoozes: number;
    snoozeRatePct: number;
    usersActive: number;
    opensByKind: DiscoveryRankItem[];
    avgStabilityDays: number;
  };
  xp: PulseXpSummary;
};

export type DailyCount = { date: string; count: number };

export type UsageTrends = {
  days: number;
  signups: DailyCount[];
  notesCreated: DailyCount[];
  activeUsers: DailyCount[];
  scripturePillsCreated: DailyCount[];
  recallOpens: DailyCount[];
};

export type UsageDiscovery = {
  days: number;
  passages: DiscoveryRankItem[];
  books: DiscoveryRankItem[];
  dictionaryWords: DiscoveryRankItem[];
  tags: DiscoveryRankItem[];
  folders: DiscoveryRankItem[];
  themes: DiscoveryRankItem[];
  tones: DiscoveryRankItem[];
};

const OVERVIEW_KEY = ['admin-usage-overview'] as const;
const TRENDS_KEY = ['admin-usage-trends'] as const;
const DISCOVERY_KEY = ['admin-usage-discovery'] as const;

/** Admin aggregates are day-granular; 30m avoids refetch churn without treating data as all-day stale. */
const ADMIN_USAGE_STALE_MS = 30 * 60 * 1000;

const adminUsageQueryOptions = {
  staleTime: ADMIN_USAGE_STALE_MS,
  gcTime: ADMIN_USAGE_STALE_MS,
  retry: 1,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const;

export function useAdminUsageOverview(days = 30) {
  const admin = useHarvousAdminCheck();
  return useQuery({
    queryKey: [...OVERVIEW_KEY, days],
    queryFn: () => adminApiGet<UsageOverview>(`/api/admin/usage/overview?days=${days}`),
    enabled: admin.isSuccess && admin.data?.isAdmin === true,
    ...adminUsageQueryOptions,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    placeholderData: (previousData) => previousData,
  });
}

export function useAdminUsageTrends(days = 30) {
  const admin = useHarvousAdminCheck();
  return useQuery({
    queryKey: [...TRENDS_KEY, days],
    queryFn: () => adminApiGet<UsageTrends>(`/api/admin/usage/trends?days=${days}`),
    enabled: admin.isSuccess && admin.data?.isAdmin === true,
    ...adminUsageQueryOptions,
    placeholderData: (previousData) => previousData,
  });
}

export function useAdminUsageDiscovery(days = 30) {
  const admin = useHarvousAdminCheck();
  return useQuery({
    queryKey: [...DISCOVERY_KEY, days],
    queryFn: () => adminApiGet<UsageDiscovery>(`/api/admin/usage/discovery?days=${days}`),
    enabled: admin.isSuccess && admin.data?.isAdmin === true,
    ...adminUsageQueryOptions,
  });
}

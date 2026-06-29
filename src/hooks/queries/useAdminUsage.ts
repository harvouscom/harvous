import { useQuery } from '@tanstack/react-query';
import { useHarvousAdminCheck } from './useVotdPreview';

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

export type DiscoveryRankItem = { name: string; count: number };

export type UsageOverview = {
  users: {
    total: number;
    clerkAccounts: number | null;
    withContent: number;
    freeTier: number;
    unlimitedTier: number;
    signupsLast7Days: number;
    signupsLast30Days: number;
    activationRate: number;
    activeLast30DaysPct: number;
  };
  content: {
    notes: number;
    folders: number;
    threads: number;
    notesCreatedLast7Days: number;
    notesCreatedLast30Days: number;
    notesByType: { default: number; scripture: number; resource: number };
  };
  engagement: {
    dau: number;
    wau: number;
    mau: number;
    stickiness: number | null;
    notesEditedLast7Days: number;
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
    usersWhoAddedPassageLast30Days: number;
    dismissCloseEventsLast30Days: number;
    createNoteEventsLast30Days: number;
  };
  scripture: {
    totalPills: number;
    scriptureNoteShare: number;
    topTranslations: DiscoveryRankItem[];
  };
};

export type DailyCount = { date: string; count: number };

export type UsageTrends = {
  days: number;
  signups: DailyCount[];
  notesCreated: DailyCount[];
  activeUsers: DailyCount[];
  scripturePillsCreated: DailyCount[];
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

export function useAdminUsageOverview() {
  const admin = useHarvousAdminCheck();
  return useQuery({
    queryKey: OVERVIEW_KEY,
    queryFn: () => adminApiGet<UsageOverview>('/api/admin/usage/overview'),
    enabled: admin.isSuccess && admin.data?.isAdmin === true,
    staleTime: 60_000,
  });
}

export function useAdminUsageTrends(days = 30) {
  const admin = useHarvousAdminCheck();
  return useQuery({
    queryKey: [...TRENDS_KEY, days],
    queryFn: () => adminApiGet<UsageTrends>(`/api/admin/usage/trends?days=${days}`),
    enabled: admin.isSuccess && admin.data?.isAdmin === true,
    staleTime: 60_000,
  });
}

export function useAdminUsageDiscovery(days = 30) {
  const admin = useHarvousAdminCheck();
  return useQuery({
    queryKey: [...DISCOVERY_KEY, days],
    queryFn: () => adminApiGet<UsageDiscovery>(`/api/admin/usage/discovery?days=${days}`),
    enabled: admin.isSuccess && admin.data?.isAdmin === true,
    staleTime: 60_000,
  });
}

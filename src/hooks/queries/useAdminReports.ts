import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

export type AdminReportRankItem = { name: string; count: number };

export type AdminMonthlyReportUsage = {
  signups: number;
  activeUsers: number;
  notesCreated: number;
  notesEdited: number;
  notesByType: { default: number; scripture: number; resource: number };
  scripturePills: number;
  study: {
    notesLinkedInThreads: number;
    linkRatePct: number;
    notesWithPassages: number;
    passageRatePct: number;
    highlightsSpawned: number;
    highlightRatePct: number;
    studyThreadEntries: number;
    pinnedNotes: number;
  };
  recall: {
    opens: number;
    snoozes: number;
    snoozeRatePct: number;
    usersActive: number;
  };
  passage: {
    usersWhoAddedPassage: number;
    dismissCloseEvents: number;
    createNoteEvents: number;
  };
};

export type AdminReportCanonSection = {
  id: string;
  label: string;
  count: number;
  testament: 'ot' | 'nt';
};

export type AdminReportCanonBook = {
  name: string;
  order: number;
  count: number;
  sharePct: number;
  heatLevel: number;
};

export type AdminMonthlyReportPayload = {
  month: string;
  seasonId: string;
  seasonName: string;
  generatedAt: string;
  usage: AdminMonthlyReportUsage;
  pulse: {
    uniquePassages: number;
    books: AdminReportRankItem[];
    themes: AdminReportRankItem[];
    passages: AdminReportRankItem[];
    tags: AdminReportRankItem[];
    translations: AdminReportRankItem[];
    monthlyAnalytics: { books: AdminReportRankItem[]; tags: AdminReportRankItem[] };
    curiosity?: {
      tones: AdminReportRankItem[];
      folders: AdminReportRankItem[];
      dictionaryWords: AdminReportRankItem[];
    };
    canon?: {
      sections: AdminReportCanonSection[];
      books: AdminReportCanonBook[];
    };
    threads: { totalThreads?: number; activeThreads?: number; avgNotesPerThread: number; linksCreated: number };
    xp: {
      totalXp: number;
      eventCount: number;
      users: number;
      avgXpPerUser: number;
      byActivity: { label: string; totalXp: number; eventCount: number; users: number }[];
    };
  };
};

export type AdminReportCatalogMonth = {
  month: string;
  label: string;
  generatedAt: string | null;
};

export type AdminReportCatalogSeason = {
  seasonId: string;
  seasonName: string;
  months: AdminReportCatalogMonth[];
};

export type AdminReportCatalogYear = {
  year: number;
  seasons: AdminReportCatalogSeason[];
};

export type AdminReportCatalog = {
  years: AdminReportCatalogYear[];
};

export type AdminReportRollup = {
  scope: 'season' | 'year';
  scopeId: string;
  scopeName: string;
  months: string[];
  totals: {
    monthCount: number;
    signups: number;
    activeUsers: number;
    notesCreated: number;
    notesEdited: number;
    scripturePills: number;
    recallOpens: number;
    recallSnoozes: number;
    totalXp: number;
    uniquePassages: number;
    threadLinksCreated: number;
  };
  usage: AdminMonthlyReportUsage;
  pulse: AdminMonthlyReportPayload['pulse'];
};

const REPORTS_KEY = ['admin-reports'] as const;

export function useAdminReportsCatalog() {
  const admin = useHarvousAdminCheck();
  return useQuery({
    queryKey: [...REPORTS_KEY, 'catalog'],
    queryFn: () => adminApiGet<AdminReportCatalog>('/api/admin/reports/catalog'),
    enabled: admin.isSuccess && admin.data?.isAdmin === true,
    staleTime: 60_000,
  });
}

export function useAdminMonthlyReport(month: string | null) {
  const admin = useHarvousAdminCheck();
  return useQuery({
    queryKey: [...REPORTS_KEY, 'month', month],
    queryFn: () => adminApiGet<AdminMonthlyReportPayload>(`/api/admin/reports/${month}`),
    enabled: admin.isSuccess && admin.data?.isAdmin === true && !!month,
    staleTime: 5 * 60_000,
  });
}

export function useAdminSeasonReport(seasonId: string | null) {
  const admin = useHarvousAdminCheck();
  return useQuery({
    queryKey: [...REPORTS_KEY, 'season', seasonId],
    queryFn: () => adminApiGet<AdminReportRollup>(`/api/admin/reports/season/${seasonId}`),
    enabled: admin.isSuccess && admin.data?.isAdmin === true && !!seasonId,
    staleTime: 5 * 60_000,
  });
}

export function useGenerateAdminReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (month: string) => {
      const res = await fetch(`${API_BASE}/api/admin/reports/generate?month=${month}`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
      }
      return res.json() as Promise<{ success: boolean; month: string; payload: AdminMonthlyReportPayload }>;
    },
    onSuccess: (data, month) => {
      queryClient.setQueryData([...REPORTS_KEY, 'month', month], data.payload);
      queryClient.invalidateQueries({ queryKey: REPORTS_KEY });
    },
  });
}

export function adminReportDownloadUrl(
  kind: 'month' | 'season' | 'year',
  id: string,
  format: 'csv' | 'json',
): string {
  const base = `${API_BASE}/api/admin/reports`;
  if (kind === 'month') {
    const qs = format === 'csv' ? '?format=csv' : '?format=json&download=1';
    return `${base}/${id}${qs}`;
  }
  if (kind === 'season') {
    return `${base}/season/${id}?format=${format}`;
  }
  return `${base}/year/${id}?format=${format}`;
}

export async function downloadAdminReport(url: string, filename: string): Promise<void> {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

import { useAuth } from '@clerk/clerk-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const API_BASE =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL
    ? String(import.meta.env.VITE_API_BASE_URL)
    : '';

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const votdApi = {
  get: <T>(path: string, params?: Record<string, string | number>) => {
    const url = params
      ? `${path}?${new URLSearchParams(Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])))}`
      : path;
    return apiRequest<T>(url);
  },
  post: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
};

export type VotdPreviewDay = {
  date: string;
  dayOfWeek: string;
  reference: string;
  translation: string;
  source: 'calendar' | 'pool' | 'override' | 'published';
  label: string | null;
  isHoliday: boolean;
  isOverridden: boolean;
  isPublished: boolean;
  versePreview: string;
};

type PreviewResponse = { days: VotdPreviewDay[] };

const PREVIEW_KEY = ['votd-preview'] as const;

export function useHarvousAdminCheck() {
  const { userId, isLoaded, isSignedIn } = useAuth();
  return useQuery({
    queryKey: ['harvous-admin-check', userId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/admin/check`, { credentials: 'include' });
      if (!res.ok) throw new Error('Unauthorized');
      return res.json() as Promise<{ isAdmin: boolean }>;
    },
    enabled: isLoaded && isSignedIn && !!userId,
    retry: false,
  });
}

export function useVotdPreviewForAdmin(days = 30) {
  const { userId, isLoaded, isSignedIn } = useAuth();
  const admin = useHarvousAdminCheck();
  const preview = useQuery({
    queryKey: [...PREVIEW_KEY, days, userId],
    queryFn: () => votdApi.get<PreviewResponse>('/api/admin/votd/preview', { days }),
    enabled:
      isLoaded && isSignedIn && !!userId && admin.isSuccess && admin.data?.isAdmin === true,
    staleTime: 30_000,
  });
  return { admin, preview };
}

export function useVotdPreviewMutations() {
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: PREVIEW_KEY });
  };

  const overrideMutation = useMutation({
    mutationFn: (body: { date: string; reference: string }) =>
      votdApi.post('/api/admin/votd/override', body),
    onSuccess: invalidate,
  });

  const refreshMutation = useMutation({
    mutationFn: (body: { date: string }) => votdApi.post<{ reference: string }>('/api/admin/votd/refresh', body),
    onSuccess: invalidate,
  });

  const clearMutation = useMutation({
    mutationFn: (date: string) => votdApi.delete(`/api/admin/votd/override/${encodeURIComponent(date)}`),
    onSuccess: invalidate,
  });

  return { overrideMutation, refreshMutation, clearMutation };
}

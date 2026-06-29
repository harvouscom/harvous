import { useMutation } from '@tanstack/react-query';
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

async function adminApiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export type DuplicateCleanupResult = {
  success: boolean;
  dryRun?: boolean;
  message?: string;
  deleted?: number;
  duplicateGroups?: number;
  report?: unknown[];
  error?: string;
};

export type BackfillAutoTagsResult = {
  success: boolean;
  dryRun: boolean;
  candidateCount: number;
  notesWithSuggestions: number;
  totalApplied: number;
  details?: unknown[];
  error?: string;
};

export type LinkIntegrityResult = {
  dryRun: boolean;
  threadLinks: {
    missingJunctionsCreated: number;
    orphanJunctionsRemoved: number;
    details: unknown[];
  };
  scriptureLinks: {
    missingJunctionsCreated: number;
    orphanJunctionsRemoved: number;
    details: unknown[];
  };
};

export type AggregateAnalyticsResult = {
  success: boolean;
  month: string;
  message: string;
  error?: string;
};

export function useAggregateAnalytics() {
  const admin = useHarvousAdminCheck();
  return useMutation({
    mutationFn: (params: { month?: string; previous?: boolean }) => {
      const qs = new URLSearchParams();
      if (params.month) qs.set('month', params.month);
      if (params.previous) qs.set('previous', 'true');
      const query = qs.toString();
      return adminApiGet<AggregateAnalyticsResult>(
        `/api/admin/aggregate-analytics${query ? `?${query}` : ''}`,
      );
    },
    meta: { requiresAdmin: admin.data?.isAdmin },
  });
}

export function useCleanupDuplicateNoteThreads() {
  return useMutation({
    mutationFn: (dryRun: boolean) =>
      adminApiGet<DuplicateCleanupResult>(
        `/api/admin/cleanup-duplicate-note-threads?dryRun=${dryRun ? 'true' : 'false'}`,
      ),
  });
}

export function useCleanupDuplicateScriptureRefs() {
  return useMutation({
    mutationFn: (dryRun: boolean) =>
      adminApiGet<DuplicateCleanupResult>(
        `/api/admin/cleanup-duplicate-scripture-refs?dryRun=${dryRun ? 'true' : 'false'}`,
      ),
  });
}

export function useBackfillAutoTags() {
  return useMutation({
    mutationFn: (body: { dryRun: boolean; onlyWithoutTags?: boolean }) =>
      adminApiPost<BackfillAutoTagsResult>('/api/admin/backfill-auto-tags', body),
  });
}

export function useCheckLinkIntegrity() {
  return useMutation({
    mutationFn: (dryRun: boolean) =>
      adminApiGet<LinkIntegrityResult>(`/api/admin/check-link-integrity?dryRun=${dryRun ? 'true' : 'false'}`),
  });
}

export function useRegenerateNoteTags() {
  return useMutation({
    mutationFn: (noteId: string) =>
      adminApiPost<{ success: boolean; applied: number; suggestionCount: number }>(
        '/api/admin/regenerate-note-tags',
        { noteId },
      ),
  });
}

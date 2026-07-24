import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useHarvousAdminCheck } from './useVotdPreview';
import type { DiagnosticTriageStatus } from '@/utils/diagnostic-sources';

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

async function adminApiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export type DiagnosticIssueSummary = {
  issueSignature: string;
  message: string;
  count: number;
  lastSeen: string;
  topRoute: string | null;
  sources: string[];
  status: DiagnosticTriageStatus;
  adminNotes: string | null;
};

export type DiagnosticIssuesResponse = {
  success: boolean;
  days: number;
  openCount: number;
  eventsLast24h: number;
  issues: DiagnosticIssueSummary[];
};

export type DiagnosticEventSample = {
  id: string;
  source: string;
  severity: string;
  message: string;
  stack: string | null;
  route: string | null;
  platform: string;
  appVersion: string | null;
  manualNote: string | null;
  metadata: string | null;
  createdAt: string;
};

export function useAdminDiagnosticIssues(days = 7) {
  const admin = useHarvousAdminCheck();
  return useQuery({
    queryKey: ['admin', 'diagnostics', 'issues', days],
    queryFn: () => adminApiGet<DiagnosticIssuesResponse>(`/api/admin/diagnostics/issues?days=${days}`),
    enabled: admin.data?.isAdmin === true,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

export function useAdminDiagnosticIssueEvents(signature: string | null) {
  const admin = useHarvousAdminCheck();
  return useQuery({
    queryKey: ['admin', 'diagnostics', 'events', signature],
    queryFn: () =>
      adminApiGet<{ success: boolean; events: DiagnosticEventSample[] }>(
        `/api/admin/diagnostics/issues/${signature}/events?limit=20`,
      ),
    enabled: admin.data?.isAdmin === true && !!signature,
    staleTime: 0,
  });
}

export function useUpdateDiagnosticTriage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      signature,
      status,
      adminNotes,
    }: {
      signature: string;
      status: DiagnosticTriageStatus;
      adminNotes?: string | null;
    }) => adminApiPatch(`/api/admin/diagnostics/issues/${signature}`, { status, adminNotes }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'diagnostics'] });
    },
  });
}

export function useBulkUpdateDiagnosticTriage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      signatures,
      status,
      adminNotes,
    }: {
      signatures: string[];
      status: DiagnosticTriageStatus;
      adminNotes?: string | null;
    }) =>
      adminApiPatch<{ success: boolean; updated: number; status: DiagnosticTriageStatus }>(
        '/api/admin/diagnostics/issues/bulk',
        { signatures, status, adminNotes },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'diagnostics'] });
    },
  });
}

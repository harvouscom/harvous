import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useHarvousAdminCheck } from './useVotdPreview';
import type { ThreadColor } from '@/utils/colors';

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

export type AdminContentSpace = {
  id: string;
  title: string;
  description: string | null;
  color: string;
  isFeatured: boolean;
  shareToken: string | null;
  joinUrl: string | null;
  threadCount: number;
  noteCount: number;
  memberCount: number;
  createdAt: string;
};

export type AdminContentThread = {
  id: string;
  title: string;
  subtitle: string | null;
  color: string | null;
  noteCount: number;
  createdAt: string;
};

export function useAdminContentSpaces() {
  const admin = useHarvousAdminCheck();
  return useQuery({
    queryKey: ['admin', 'content', 'spaces'],
    queryFn: () => adminApiGet<{ success: boolean; spaces: AdminContentSpace[] }>('/api/admin/content/spaces'),
    enabled: admin.data?.isAdmin === true,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

export function useAdminContentThreads(spaceId: string | null) {
  const admin = useHarvousAdminCheck();
  return useQuery({
    queryKey: ['admin', 'content', 'threads', spaceId],
    queryFn: () =>
      adminApiGet<{ success: boolean; threads: AdminContentThread[] }>(
        `/api/admin/content/spaces/${spaceId}/threads`,
      ),
    enabled: admin.data?.isAdmin === true && !!spaceId,
    staleTime: 0,
  });
}

export function useCreateAdminSpace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      title: string;
      description?: string | null;
      color?: ThreadColor;
      isFeatured?: boolean;
    }) => adminApiPost<{ success: boolean; space: { id: string }; joinUrl: string }>('/api/admin/spaces', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'content', 'spaces'] });
    },
  });
}

export function useCreateAdminThread(spaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; subtitle?: string | null; color?: ThreadColor | null }) =>
      adminApiPost(`/api/admin/spaces/${spaceId}/threads`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'content', 'spaces'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'content', 'threads', spaceId] });
    },
  });
}

export function useCreateAdminNote(threadId: string, spaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title?: string | null; content: string; noteType?: string }) =>
      adminApiPost(`/api/admin/threads/${threadId}/notes`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'content', 'spaces'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'content', 'threads', spaceId] });
    },
  });
}

export function useGrantAdminSpaceMember(spaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { userId: string }) => adminApiPost(`/api/admin/spaces/${spaceId}/members`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'content', 'spaces'] });
    },
  });
}

export function useAddSpaceToFeatured() {
  return useMutation({
    mutationFn: (body: {
      contentType: 'space';
      title: string;
      description?: string | null;
      shareToken: string;
      color?: string | null;
      isActive?: boolean;
    }) => adminApiPost('/api/admin/featured', body),
  });
}

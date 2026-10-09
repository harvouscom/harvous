/**
 * Admin › Families — support's read of a family and the overrides. Every write carries a
 * reason, which the server requires and records in the family's history.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useHarvousAdminCheck } from './useVotdPreview';

const API_BASE =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL
    ? String(import.meta.env.VITE_API_BASE_URL)
    : '';

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  return data as T;
}

export type AdminFamilyListItem = {
  id: string;
  name: string;
  ownerUserId: string;
  members: number;
  pendingRequests: number;
  escalated: boolean;
  frozen: boolean;
  createdAt: string;
};

export type AdminFamilyDetail = {
  family: {
    id: string;
    name: string;
    spaceId: string;
    spaceDeleted: boolean;
    ownerUserId: string;
    sponsoring: boolean;
    frozenAt: string | null;
    frozenReason: string | null;
    createdAt: string;
  };
  members: Array<{
    userId: string;
    name: string;
    email: string | null;
    role: 'parent' | 'child' | 'adult';
    isOwner: boolean;
    covered: boolean;
    joinedAt: string;
    roleChangedAt: string | null;
    roleChangedBy: string | null;
  }>;
  invites: Array<{ id: string; role: string; label: string | null; expiresAt: string; createdBy: string }>;
  requests: Array<{
    id: string;
    userId: string;
    name: string;
    toRole: string;
    status: string;
    createdAt: string;
    escalatedAt: string | null;
    supportTicketId: string | null;
    decidedVia: string | null;
    decidedAt: string | null;
  }>;
  events: Array<{
    id: string;
    kind: string;
    actorKind: 'member' | 'support' | 'system';
    actor: string | null;
    target: string | null;
    detail: Record<string, unknown> | null;
    reason: string | null;
    createdAt: string;
  }>;
};

export function useAdminFamilies(q: string) {
  const admin = useHarvousAdminCheck();
  return useQuery({
    queryKey: ['admin', 'families', q],
    queryFn: () => adminFetch<{ families: AdminFamilyListItem[] }>(`/api/admin/families?q=${encodeURIComponent(q)}`),
    enabled: Boolean(admin.data?.isAdmin),
    staleTime: 10_000,
  });
}

export function useAdminFamily(familyId: string | null) {
  const admin = useHarvousAdminCheck();
  return useQuery({
    queryKey: ['admin', 'family', familyId],
    queryFn: () => adminFetch<AdminFamilyDetail>(`/api/admin/families/${encodeURIComponent(familyId!)}`),
    enabled: Boolean(admin.data?.isAdmin && familyId),
    staleTime: 5_000,
  });
}

/** One mutation for every override: the path differs, the reason is always required. */
export function useAdminFamilyAction(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ path, body }: { path: string; body: Record<string, unknown> & { reason: string } }) =>
      adminFetch(`/api/admin/families/${encodeURIComponent(familyId)}${path}`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'family', familyId] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'families'] });
    },
  });
}

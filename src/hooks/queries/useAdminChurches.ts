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

export type AdminChurch = {
  id: string;
  orgId: string;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  createdBy: string;
  billingPlan: string | null;
  isActive: boolean;
  createdAt: string;
  spaceCount: number;
};

export type StaffSyncResult = {
  success: boolean;
  staffCount: number;
  spaces: { spaceId: string; title: string; added: number; promoted: number; removed: number; healedOwner: boolean }[];
  warnings: string[];
};

export function useAdminChurches() {
  const admin = useHarvousAdminCheck();
  return useQuery({
    queryKey: ['admin', 'churches'],
    queryFn: () => adminApiGet<{ success: boolean; churches: AdminChurch[] }>('/api/admin/churches'),
    enabled: admin.data?.isAdmin === true,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

export function useRegisterChurch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { orgId: string; name: string; city?: string; state?: string; country?: string }) =>
      adminApiPost<{ success: boolean; church: AdminChurch; clerkOrg: { name: string; slug: string | null } }>(
        '/api/admin/churches',
        body,
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin', 'churches'] }),
  });
}

export function useCreateChurchSpace(churchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; ownerUserId: string; description?: string; color?: string }) =>
      adminApiPost<{ success: boolean; space: { id: string; title: string } }>(
        `/api/admin/churches/${churchId}/spaces`,
        body,
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin', 'churches'] }),
  });
}

export function useSyncChurchStaff(churchId: string) {
  return useMutation({
    mutationFn: () => adminApiPost<StaffSyncResult>(`/api/admin/churches/${churchId}/sync-staff`),
  });
}

export function useSetChurchActive(churchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (active: boolean) =>
      adminApiPost<{ success: boolean; church: AdminChurch }>(
        `/api/admin/churches/${churchId}/${active ? 'reactivate' : 'deactivate'}`,
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin', 'churches'] }),
  });
}

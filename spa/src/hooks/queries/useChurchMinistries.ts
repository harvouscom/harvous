import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import { churchChannelsQueryKey } from './useChurchChannels';

export type MinistrySpace = {
  id: string;
  title: string;
  kind: 'channel' | 'group';
  color: string | null;
  audience: 'church' | 'ministry' | 'leaders' | string;
};

export type ChurchMinistry = {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  archivedAt: string | null;
  spaces: MinistrySpace[];
  staffUserIds: string[];
};

export type ChurchMinistriesResponse = {
  /** Church admins arrange ministries; every staffer can see them. */
  canManage: boolean;
  ministries: ChurchMinistry[];
  /** Spaces in no live ministry — church-wide. */
  unassignedSpaces: MinistrySpace[];
  /** Present on writes that moved leadership: whether the staff sync landed. */
  sync?: { ok: boolean };
};

export function churchMinistriesQueryKey(userId: string | null | undefined, orgId: string | null | undefined) {
  return ['church-ministries', userId ?? 'none', orgId ?? 'none'] as const;
}

/** Staff only. Pass `enabled` once the viewer is known to be staff. */
export function useChurchMinistries(orgId: string | null | undefined, options?: { enabled?: boolean }) {
  const { userId } = useAuth();
  const authReady = useAuthReady();
  const id = orgId?.trim() || null;
  return useQuery({
    queryKey: churchMinistriesQueryKey(userId, id),
    enabled: authReady && !!userId && !!id && options?.enabled !== false,
    queryFn: () => api.get<ChurchMinistriesResponse>(`/api/church/ministries?orgId=${encodeURIComponent(id!)}`),
    staleTime: 30_000,
    retry: false,
  });
}

export type MinistryAction =
  | { type: 'create'; name: string; description?: string | null }
  | { type: 'update'; ministryId: string; name?: string; description?: string | null; sortOrder?: number }
  | { type: 'archive'; ministryId: string; releaseSpaces?: boolean }
  | { type: 'restore'; ministryId: string }
  | { type: 'assign-space'; spaceId: string; ministryId: string | null; movePair?: boolean }
  | { type: 'set-staff'; userId: string; ministryIds: string[] }
  | { type: 'set-channel-audience'; spaceId: string; audience: 'church' | 'ministry' | 'leaders'; dryRun?: boolean };

/** Every ministry write; the list refreshes from the response itself. Server-gated on `manage_staff`. */
export function useChurchMinistryActions(orgId: string | null | undefined) {
  const queryClient = useQueryClient();
  const { userId } = useAuth();
  const id = orgId?.trim() || null;
  return useMutation({
    mutationFn: (action: MinistryAction) => {
      const { type, ...rest } = action;
      return api.post<ChurchMinistriesResponse & { affectedFollowCount?: number }>(`/api/church/ministries/${type}`, {
        orgId: id,
        ...rest,
      });
    },
    onSuccess: (data, action) => {
      if (action.type === 'set-channel-audience' && action.dryRun) return;
      if (data?.ministries) queryClient.setQueryData(churchMinistriesQueryKey(userId, id), data);
      // Leadership and channel membership may have moved: the hub's lanes read navigation.
      void queryClient.invalidateQueries({ queryKey: ['navigation'] });
      void queryClient.invalidateQueries({ queryKey: churchChannelsQueryKey(userId) });
      void queryClient.invalidateQueries({ queryKey: ['church-engagement'] });
    },
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import { churchServicesQueryKey } from './useChurchServices';

export type TeachingPlanService = {
  id: string;
  serviceDate: string;
  title: string;
  seriesTitle: string | null;
  reference: string | null;
  starterTemplateId: string | null;
  channelSpaceId: string | null;
  updatedAt: string | null;
};

export type TeachingPlanResponse = {
  church: { id: string; name: string };
  services: TeachingPlanService[];
  /** Series the church has already used — the editor's autocomplete source. */
  seriesTitles: string[];
  /** The church's ministry channels, for the companion-channel picker. */
  channels: { id: string; title: string; color: string | null }[];
};

export function churchTeachingPlanQueryKey(
  userId: string | null | undefined,
  orgId: string | null | undefined,
) {
  return ['church-teaching-plan', userId ?? 'none', orgId ?? 'home'] as const;
}

/**
 * The staff view of the teaching plan, past included.
 *
 * Server-gated on the `sermon_tools` capability — pass `enabled: true` only
 * once `useChurchStaffStatus` says the viewer has it, so a plain staff member
 * never fires a request that will 403.
 */
export function useChurchTeachingPlan(
  orgId: string | null | undefined,
  options?: { enabled?: boolean },
) {
  const { userId } = useAuth();
  const authReady = useAuthReady();
  const trimmedOrgId = orgId?.trim() || null;

  return useQuery({
    queryKey: churchTeachingPlanQueryKey(userId, trimmedOrgId),
    enabled: authReady && !!userId && !!trimmedOrgId && options?.enabled === true,
    queryFn: () =>
      api.get<TeachingPlanResponse>(
        `/api/church/services/plan?orgId=${encodeURIComponent(trimmedOrgId!)}`,
      ),
    staleTime: 30_000,
    retry: false,
  });
}

export type ServiceDraft = {
  serviceDate: string;
  title: string;
  seriesTitle?: string | null;
  reference?: string | null;
  starterTemplateId?: string | null;
  channelSpaceId?: string | null;
};

type ServiceAction =
  | ({ kind: 'create' } & ServiceDraft)
  | ({ kind: 'update'; serviceId: string } & Partial<ServiceDraft>)
  | { kind: 'delete'; serviceId: string };

/** Create / update / delete a service, refreshing both staff and congregant views. */
export function useChurchServiceActions(orgId: string | null | undefined) {
  const queryClient = useQueryClient();
  const { userId } = useAuth();
  const trimmedOrgId = orgId?.trim() || null;

  return useMutation({
    mutationFn: (action: ServiceAction) => {
      const { kind, ...rest } = action;
      switch (kind) {
        case 'create':
          return api.post('/api/church/services/create', { orgId: trimmedOrgId, ...rest });
        case 'update':
          return api.post('/api/church/services/update', { orgId: trimmedOrgId, ...rest });
        case 'delete':
          return api.post('/api/church/services/delete', { orgId: trimmedOrgId, ...rest });
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: churchTeachingPlanQueryKey(userId, trimmedOrgId),
      });
      // The staff edit is what changes what the congregation sees on Home.
      void queryClient.invalidateQueries({ queryKey: churchServicesQueryKey(userId) });
    },
  });
}

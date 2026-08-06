import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import type { TeachingPlanSeries, TeachingPlanSermon } from './useChurchTeachingPlan';

/**
 * A ministry's own plan — Youth's Wednesdays.
 *
 * Deliberately reuses `TeachingPlanSermon`: the server serializes a space row
 * into the same shape as a church row (with an empty `serviceTimeIds`, since
 * slots belong to the church), so one editor and one row component render
 * either plan without branching on which was asked for.
 */
export type ChurchSpacePlanResponse = {
  church: { id: string; name: string };
  space: {
    id: string;
    title: string;
    /** 0 = Sunday. Null until staff set the ministry's rhythm. */
    meetingDay: number | null;
    meetingTime: string | null;
  };
  services: TeachingPlanSermon[];
  /**
   * This plan's own series, never merged with the church's. The scope is what
   * keeps a granted volunteer leader out of the main service's rows.
   */
  series: TeachingPlanSeries[];
};

export function churchSpacePlanQueryKey(
  userId: string | null | undefined,
  spaceId: string | null | undefined,
) {
  return ['church-space-plan', userId ?? 'none', spaceId ?? 'none'] as const;
}

/**
 * Server-gated on `sermon_tools` for this space's church — pass `enabled: true`
 * only once the viewer is known to be staff, so a congregant never fires a
 * request that will 404.
 */
export function useChurchSpacePlan(
  spaceId: string | null | undefined,
  options?: { enabled?: boolean },
) {
  const { userId } = useAuth();
  const authReady = useAuthReady();
  const trimmed = spaceId?.trim() || null;

  return useQuery({
    queryKey: churchSpacePlanQueryKey(userId, trimmed),
    enabled: authReady && !!userId && !!trimmed && options?.enabled === true,
    queryFn: () =>
      api.get<ChurchSpacePlanResponse>(`/api/church/spaces/${encodeURIComponent(trimmed!)}/plan`),
    staleTime: 30_000,
    retry: false,
  });
}

export type SpaceSermonDraft = {
  serviceDate: string;
  title: string;
  /** An existing series in *this space's* plan… */
  seriesId?: string | null;
  /** …or a name, which creates one scoped to this space. */
  seriesTitle?: string | null;
  reference?: string | null;
  starterTemplateId?: string | null;
};

type SpaceSermonAction =
  | ({ kind: 'create' } & SpaceSermonDraft)
  | ({ kind: 'update'; serviceId: string } & Partial<SpaceSermonDraft>)
  | { kind: 'delete'; serviceId: string }
  | { kind: 'repeat'; serviceId: string; weeks: number }
  | { kind: 'series-rename'; seriesId: string; title: string }
  | { kind: 'series-delete'; seriesId: string };

/**
 * Create / update / delete a gathering on a space plan.
 *
 * Server-gated on the space plan's manage gate — since P5 that is
 * `manage_teaching_plan` **or** granted leader of this space, so a volunteer
 * runs their own ministry's plan through these same endpoints.
 */
export function useChurchSpaceSermonActions(spaceId: string | null | undefined) {
  const queryClient = useQueryClient();
  const { userId } = useAuth();
  const trimmed = spaceId?.trim() || null;

  return useMutation({
    mutationFn: (action: SpaceSermonAction) => {
      const { kind, ...rest } = action;
      const room = `/api/church/spaces/${encodeURIComponent(trimmed ?? '')}`;
      switch (kind) {
        case 'create':
          return api.post(`${room}/services/create`, rest);
        case 'update':
          return api.post(`${room}/services/update`, rest);
        case 'delete':
          return api.post(`${room}/services/delete`, rest);
        case 'repeat':
          return api.post(`${room}/services/repeat`, rest);
        case 'series-rename':
          return api.post(`${room}/series/rename`, rest);
        case 'series-delete':
          return api.post(`${room}/series/delete`, rest);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: churchSpacePlanQueryKey(userId, trimmed),
      });
      /*
        Deliberately does NOT invalidate the congregant sermons query. A space
        plan reaches Home only in P3 (context cards); until then "This Sunday"
        is church-plan-only, and refetching it here would imply otherwise.
      */
    },
  });
}

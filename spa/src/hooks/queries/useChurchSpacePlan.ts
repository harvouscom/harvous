import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import type { TeachingPlanSeries, TeachingPlanSermon } from './useChurchTeachingPlan';
import { spaceGroupThreadsQueryKey } from './useSpaceGroupThreads';
import { navigationQueryKeyPrefix } from './useNavigation';

/** What a plan plans — see ChurchServices.kind. Server-decided, never inferred. */
export type PlanKind = 'gathering' | 'content';

/**
 * A ministry's own plan — Youth's Wednesdays, or a channel's publishing queue.
 *
 * Deliberately reuses `TeachingPlanSermon`: the server serializes a space row
 * into the same shape as a church row (with an empty `serviceTimeIds`, since
 * slots belong to the church), so one editor and one row component render
 * either plan without branching on which was asked for.
 */
export type ChurchSpacePlanResponse = {
  church: { id: string; name: string };
  /**
   * A ministry channel publishes ('content'); every other space gathers.
   * Optional so a payload cached before this shipped still parses — absent
   * reads as 'gathering', which is what those rows were.
   */
  planKind?: PlanKind;
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
  /** Explicit null files it as an undated idea; the server refuses an absent key. */
  serviceDate: string | null;
  title: string;
  /** An existing series in *this space's* plan… */
  seriesId?: string | null;
  /** …or a name, which creates one scoped to this space. */
  seriesTitle?: string | null;
  reference?: string | null;
  starterTemplateId?: string | null;
};

export type SpaceSermonAction =
  | { kind: 'attachments'; serviceId: string; itemIds: string[] }
  | ({ kind: 'create' } & SpaceSermonDraft)
  | ({ kind: 'update'; serviceId: string } & Partial<SpaceSermonDraft>)
  | { kind: 'delete'; serviceId: string }
  | { kind: 'repeat'; serviceId: string; weeks: number }
  | { kind: 'link-note'; noteId: string; serviceId: string | null }
  | {
      kind: 'series-create';
      title: string;
      color?: string | null;
      description?: string | null;
      firstDate?: string | null;
    }
  | {
      kind: 'series-rerun';
      sourceSeriesId: string;
      startDate: string;
      runLabel?: string;
      copy?: {
        titles?: boolean;
        references?: boolean;
        starterTemplate?: boolean;
        resources?: boolean;
      };
    }
  /** Optional past the id — an absent key means "leave it". Mirrors the church plan. */
  | {
      kind: 'series-update';
      seriesId: string;
      title?: string;
      color?: string | null;
      description?: string | null;
    }
  | { kind: 'series-delete'; seriesId: string }
  /**
   * Publish this series into the room as a study plan the group walks. Also
   * the update path — republishing appends the weeks added since.
   */
  | { kind: 'series-publish-thread'; seriesId: string };

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
        case 'attachments':
          return api.post(`${room}/services/attachments/set`, rest);
        case 'link-note':
          return api.post(`${room}/services/link-note`, rest);
        case 'series-create':
          return api.post(`${room}/series/create`, rest);
        case 'series-rerun':
          return api.post(`${room}/series/rerun`, rest);
        case 'series-update':
          return api.post(`${room}/series/update`, rest);
        case 'series-delete':
          return api.post(`${room}/series/delete`, rest);
        case 'series-publish-thread':
          return api.post(`${room}/series/publish-thread`, rest);
      }
    },
    onSettled: (_data, _error, action) => {
      void queryClient.invalidateQueries({
        queryKey: churchSpacePlanQueryKey(userId, trimmed),
      });
      /* Publishing writes a Thread and notes into the room, so the space's own
         surfaces have to hear about it — the other actions touch only the plan. */
      if (action?.kind === 'series-publish-thread' && trimmed) {
        void queryClient.invalidateQueries({ queryKey: spaceGroupThreadsQueryKey(trimmed) });
        void queryClient.invalidateQueries({ queryKey: ['space', trimmed, 'bootstrap'] });
        void queryClient.invalidateQueries({ queryKey: [...navigationQueryKeyPrefix] });
      }
      /*
        Deliberately does NOT invalidate the congregant sermons query. A space
        plan reaches Home only in P3 (context cards); until then "This Sunday"
        is church-plan-only, and refetching it here would imply otherwise.
      */
    },
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import { churchSermonsQueryKey } from './useChurchSermons';

/** One library item a planned entry pulls from. */
export type AttachedResource = {
  itemId: string;
  title: string;
  kind: string;
  sourceDomain: string | null;
  sourceUrl: string | null;
  fileName: string | null;
};

export type TeachingPlanSermon = {
  id: string;
  /** Null = an undated idea in the planner's backlog, not yet on a Sunday. */
  serviceDate: string | null;
  /** The church services this sermon is preached at. */
  serviceTimeIds: string[];
  /** A one-off time, set only when the sermon sits at no usual service. */
  serviceTime: string | null;
  title: string;
  /** The ChurchSeries this sermon belongs to, or null for a standalone week. */
  seriesId: string | null;
  /** Its name, joined server-side — the row renders the label, not the id. */
  seriesTitle: string | null;
  reference: string | null;
  starterTemplateId: string | null;
  /** 'gathering' | 'content'. Optional for payloads cached before it shipped —
   *  absent reads as a gathering, which is what those rows were. */
  kind?: 'gathering' | 'content';
  /** Library items this entry draws on — staff prep, never congregant-facing. */
  resources?: AttachedResource[];
  /** Orders the planner's Ideas column. Optional so a payload cached before
   *  this shipped still parses. */
  createdAt?: string | null;
  updatedAt: string | null;
};

/** One of the church's recurring services — a checkbox in the sermon editor. */
export type ChurchServiceTimeOption = {
  id: string;
  /** 0 = Sunday, matching Date.getDay(). */
  dayOfWeek: number;
  startTime: string;
  label: string | null;
};

/**
 * A series in one plan. Replaced the bare-string list: a picker of objects can
 * rename and delete, and — once the resource library lands — be attached to.
 */
export type TeachingPlanSeries = {
  id: string;
  title: string;
  /** How many sermons sit under it; what makes the series worth opening. */
  serviceCount: number;
};

export type TeachingPlanResponse = {
  church: { id: string; name: string };
  /** Optional so a payload cached before this shipped still parses. */
  serviceTimes?: ChurchServiceTimeOption[];
  services: TeachingPlanSermon[];
  /** This plan's series, most recently taught first — the picker's source. */
  series: TeachingPlanSeries[];
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
 * Server-gated on `sermon_tools` — pass `enabled: true` only once
 * `useChurchStaffStatus` says the viewer has it, so a plain staff member never
 * fires a request that will 403. A teacher *does* have it: reading the plan is
 * a wider right than reshaping it, which `useChurchSermonActions` below needs
 * `manage_teaching_plan` for. The read is never sponsorship-gated either, so a
 * lapsed church still sees what it planned.
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

export type SermonDraft = {
  /** Explicit null files it as an undated idea; the server refuses an absent key. */
  serviceDate: string | null;
  /** Which of the church's services this sermon fills. */
  serviceTimeIds?: string[];
  /** A one-off time, for a sermon at none of the usual services. */
  serviceTime?: string | null;
  title: string;
  /** Pick an existing series… */
  seriesId?: string | null;
  /** …or name one, which creates it. Either grain; null on either detaches. */
  seriesTitle?: string | null;
  reference?: string | null;
  starterTemplateId?: string | null;
};

type SermonRepeat = {
  kind: 'repeat';
  serviceId: string;
  /** How many further weeks; the server caps it at a quarter. */
  weeks: number;
};

type SeriesAction =
  | { kind: 'series-rename'; seriesId: string; title: string }
  | { kind: 'series-delete'; seriesId: string };

type SermonAction =
  | { kind: 'attachments'; serviceId: string; itemIds: string[] }
  | ({ kind: 'create' } & SermonDraft)
  | ({ kind: 'update'; serviceId: string } & Partial<SermonDraft>)
  | { kind: 'delete'; serviceId: string }
  | SermonRepeat
  | SeriesAction;

/**
 * Create / update / delete a service, refreshing both staff and congregant
 * views. Server-gated on `manage_teaching_plan` — narrower than the read above.
 */
export function useChurchSermonActions(orgId: string | null | undefined) {
  const queryClient = useQueryClient();
  const { userId } = useAuth();
  const trimmedOrgId = orgId?.trim() || null;

  return useMutation({
    mutationFn: (action: SermonAction) => {
      const { kind, ...rest } = action;
      switch (kind) {
        case 'create':
          return api.post('/api/church/services/create', { orgId: trimmedOrgId, ...rest });
        case 'update':
          return api.post('/api/church/services/update', { orgId: trimmedOrgId, ...rest });
        case 'delete':
          return api.post('/api/church/services/delete', { orgId: trimmedOrgId, ...rest });
        case 'repeat':
          return api.post('/api/church/services/repeat', { orgId: trimmedOrgId, ...rest });
        case 'attachments':
          return api.post('/api/church/services/attachments/set', {
            orgId: trimmedOrgId,
            ...rest,
          });
        // Series ride the same mutation because they invalidate the same
        // queries — renaming one changes every sermon row that renders it.
        case 'series-rename':
          return api.post('/api/church/series/rename', { orgId: trimmedOrgId, ...rest });
        case 'series-delete':
          return api.post('/api/church/series/delete', { orgId: trimmedOrgId, ...rest });
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: churchTeachingPlanQueryKey(userId, trimmedOrgId),
      });
      // The staff edit is what changes what the congregation sees on Home.
      void queryClient.invalidateQueries({ queryKey: churchSermonsQueryKey(userId) });
    },
  });
}

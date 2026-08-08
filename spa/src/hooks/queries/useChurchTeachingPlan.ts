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
  /**
   * The **viewer's own** sermon draft for this week, or null.
   *
   * Never anyone else's, and there is no count: a colleague's draft is their
   * private note, and surfacing that one exists would be the first
   * church-facing read of note lineage. Optional so a payload cached before
   * this shipped still parses.
   */
  viewerDraftNoteId?: string | null;
  /** Its title, so the editor can name the linked note without a second fetch. */
  viewerDraftNoteTitle?: string | null;
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
  /**
   * A thread-colour token, or null for "not chosen" — which is the common case.
   * Never read this directly to draw with: `seriesAccent` in lib/church-services
   * turns null into a stable derived colour, so an unset series still reads as
   * one run rather than as no run.
   */
  color?: string | null;
  description?: string | null;
  /**
   * Which run of a recurring series this is — "2027", or null when the name has
   * no sibling. Render it only when the plan holds more than one series of this
   * title; a church that never re-runs anything should never see a label.
   */
  runLabel?: string | null;
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
  /** Name a series before any week exists. `firstDate` opens it with one. */
  | {
      kind: 'series-create';
      title: string;
      color?: string | null;
      description?: string | null;
      firstDate?: string | null;
    }
  /** Teach a finished series again on new dates — the seasonal case. */
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
  /**
   * Every field optional past the id: an absent key means "leave it", so
   * recolouring never resends a title and races someone else's rename.
   */
  | {
      kind: 'series-update';
      seriesId: string;
      title?: string;
      color?: string | null;
      description?: string | null;
    }
  | { kind: 'series-delete'; seriesId: string };

type SermonAction =
  | { kind: 'attachments'; serviceId: string; itemIds: string[] }
  | ({ kind: 'create' } & SermonDraft)
  | ({ kind: 'update'; serviceId: string } & Partial<SermonDraft>)
  | { kind: 'delete'; serviceId: string }
  /** Point one of your own notes at a week, or pass null to let it go. */
  | { kind: 'link-note'; noteId: string; serviceId: string | null }
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
        case 'link-note':
          return api.post('/api/church/services/link-note', { orgId: trimmedOrgId, ...rest });
        // Series ride the same mutation because they invalidate the same
        // queries — renaming or recolouring one changes every sermon row and
        // every run band that renders it.
        case 'series-create':
          return api.post('/api/church/series/create', { orgId: trimmedOrgId, ...rest });
        case 'series-rerun':
          return api.post('/api/church/series/rerun', { orgId: trimmedOrgId, ...rest });
        case 'series-update':
          return api.post('/api/church/series/update', { orgId: trimmedOrgId, ...rest });
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

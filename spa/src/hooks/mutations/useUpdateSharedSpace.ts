import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { getThreadGradientCSS, type ThreadColor } from '@/utils/colors';
import {
  coerceSpaceCoverBgInput,
  spaceCoverFromThreadColor,
  type SpaceCoverBg,
} from '@/utils/space-cover';
import { navigationQueryKeyPrefix } from '../queries/useNavigation';
import { clearCachedSpaceBootstrap, type SpaceBootstrapData, type SpaceDetail } from '../queries/useSpace';
import type { PublishCadence } from '@/utils/channel-publish-cadence';
import type { MeetingKind } from '@/utils/space-meeting-rhythm';
import type { StudyPlanningMode } from '@/utils/space-study-planning';

interface UpdateSharedSpaceInput {
  spaceId: string;
  title: string;
  color: ThreadColor | string;
  /** 1–5 within the color family; defaults to 1 on the server. */
  coverVariant?: number;
  description?: string | null;
  /** Ministry channels only — empty string clears. */
  publishCadence?: PublishCadence | null;
  /** 0–6, Sunday first. Omit to leave the stored rhythm alone; null clears it. */
  meetingDay?: number | null;
  /** 'HH:MM' wall clock. Only read when `meetingDay` is sent. */
  meetingTime?: string | null;
  /** 'in_person' | 'online' | 'hybrid'. Omit to leave it alone; null clears. */
  meetingKind?: MeetingKind | null;
  /** https only. Only read when `meetingKind` is sent. */
  meetingUrl?: string | null;
  /** 'off' | 'suggest'. Omit to leave it alone. Shared rooms only. */
  studyPlanningMode?: StudyPlanningMode;
}

type UpdateSharedSpaceResponse = {
  success: string;
  space: {
    id: string;
    title: string;
    color?: string | null;
    backgroundGradient?: string | null;
    description?: string | null;
    coverBgLight?: SpaceCoverBg | string | null;
    coverBgDark?: SpaceCoverBg | string | null;
    coverVariant?: number;
    publishCadence?: PublishCadence | null;
    lastCurriculumAt?: string | null;
    cadenceStale?: boolean;
    meetingDay?: number | null;
    meetingTime?: string | null;
    meetingKind?: MeetingKind | null;
    meetingUrl?: string | null;
    studyPlanningMode?: StudyPlanningMode;
  };
};

function normalizeSpaceId(spaceId: string): string {
  return spaceId.startsWith('space_') ? spaceId : `space_${spaceId}`;
}

function resolvePatchedSpace(
  prev: SpaceDetail | undefined,
  variables: UpdateSharedSpaceInput,
  data: UpdateSharedSpaceResponse,
): SpaceDetail {
  const sid = normalizeSpaceId(variables.spaceId);
  const fromInput = spaceCoverFromThreadColor(variables.color, variables.coverVariant ?? 1);
  const light = coerceSpaceCoverBgInput(data.space?.coverBgLight) ?? fromInput.light;
  const dark = coerceSpaceCoverBgInput(data.space?.coverBgDark) ?? fromInput.dark;
  const base = prev ?? ({ id: sid, title: variables.title, color: variables.color } as SpaceDetail);

  return {
    ...base,
    id: data.space?.id ?? sid,
    title: data.space?.title ?? variables.title,
    color: data.space?.color ?? variables.color,
    backgroundGradient:
      data.space?.backgroundGradient || getThreadGradientCSS(data.space?.color ?? variables.color),
    description:
      data.space?.description !== undefined
        ? data.space.description
        : variables.description !== undefined
          ? variables.description
          : base.description,
    coverBgLight: light ?? undefined,
    coverBgDark: dark ?? undefined,
    publishCadence:
      data.space?.publishCadence !== undefined
        ? data.space.publishCadence
        : variables.publishCadence !== undefined
          ? variables.publishCadence
          : base.publishCadence,
    lastCurriculumAt:
      data.space?.lastCurriculumAt !== undefined
        ? data.space.lastCurriculumAt
        : base.lastCurriculumAt,
    cadenceStale:
      data.space?.cadenceStale !== undefined ? data.space.cadenceStale : base.cadenceStale,
    /*
      This hook patches the cache rather than refetching (a racey prefetch was
      overwriting saved covers), which means anything it forgets to carry is
      simply lost until the next cold load. Left out, the settings panel
      reopened on `initialMeetingDay: null` seconds after saving a Wednesday.
    */
    meetingDay:
      data.space?.meetingDay !== undefined
        ? data.space.meetingDay
        : variables.meetingDay !== undefined
          ? variables.meetingDay
          : base.meetingDay,
    meetingTime:
      data.space?.meetingTime !== undefined
        ? data.space.meetingTime
        : variables.meetingTime !== undefined
          ? variables.meetingTime
          : base.meetingTime,
    meetingKind:
      data.space?.meetingKind !== undefined
        ? data.space.meetingKind
        : variables.meetingKind !== undefined
          ? variables.meetingKind
          : base.meetingKind,
    meetingUrl:
      data.space?.meetingUrl !== undefined
        ? data.space.meetingUrl
        : variables.meetingUrl !== undefined
          ? variables.meetingUrl
          : base.meetingUrl,
    studyPlanningMode:
      data.space?.studyPlanningMode !== undefined
        ? data.space.studyPlanningMode
        : variables.studyPlanningMode !== undefined
          ? variables.studyPlanningMode
          : base.studyPlanningMode,
  };
}

function applySpacePatch(queryClient: ReturnType<typeof useQueryClient>, spaceId: string, next: SpaceDetail) {
  const sid = normalizeSpaceId(spaceId);
  const ids = Array.from(new Set([sid, spaceId]));
  for (const id of ids) {
    queryClient.setQueryData<SpaceDetail>(['space', id], (prev) => ({ ...(prev ?? next), ...next, id: prev?.id ?? next.id }));
    queryClient.setQueryData<SpaceBootstrapData>(['space', id, 'bootstrap'], (prev) => {
      if (!prev?.space) return prev;
      return { ...prev, space: { ...prev.space, ...next, id: prev.space.id } };
    });
    clearCachedSpaceBootstrap(id);
  }
}

export function useUpdateSharedSpace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      spaceId,
      title,
      color,
      coverVariant,
      description,
      publishCadence,
      meetingDay,
      meetingTime,
      meetingKind,
      meetingUrl,
      studyPlanningMode,
    }: UpdateSharedSpaceInput) => {
      const sid = normalizeSpaceId(spaceId);
      const form = new FormData();
      form.set('title', title);
      form.set('color', color);
      form.set('coverVariant', String(coverVariant ?? 1));
      if (description !== undefined) {
        form.set('description', description ?? '');
      }
      if (publishCadence !== undefined) {
        form.set('publishCadence', publishCadence ?? '');
      }
      /* Sent as a pair or not at all. Absent, the route leaves the stored
         rhythm alone; present with an empty day, it clears both. */
      if (meetingDay !== undefined) {
        form.set('meetingDay', meetingDay === null ? '' : String(meetingDay));
        form.set('meetingTime', meetingTime ?? '');
      }
      /* Same pairing: absent leaves the stored place alone, present with an
         empty kind clears both. */
      if (meetingKind !== undefined) {
        form.set('meetingKind', meetingKind ?? '');
        form.set('meetingUrl', meetingUrl ?? '');
      }
      if (studyPlanningMode !== undefined) {
        form.set('studyPlanningMode', studyPlanningMode);
      }
      return api.post<UpdateSharedSpaceResponse>(`/api/spaces/${encodeURIComponent(sid)}/update`, form);
    },
    onSuccess: (data, variables) => {
      // Trust the update response + requested variant. Do not invalidate/refetch
      // space queries here — a racey prefetch was overwriting the saved cover
      // with the previous default image.
      const sid = normalizeSpaceId(variables.spaceId);
      const prev =
        queryClient.getQueryData<SpaceDetail>(['space', sid]) ??
        queryClient.getQueryData<SpaceDetail>(['space', variables.spaceId]);
      applySpacePatch(queryClient, variables.spaceId, resolvePatchedSpace(prev, variables, data));
      // Still refresh nav titles/colors, but keep space detail cache as patched.
      void queryClient.invalidateQueries({ queryKey: navigationQueryKeyPrefix });
    },
  });
}

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

interface UpdateSharedSpaceInput {
  spaceId: string;
  title: string;
  color: ThreadColor | string;
  /** 1–5 within the color family; defaults to 1 on the server. */
  coverVariant?: number;
  description?: string | null;
  /** Ministry channels only — empty string clears. */
  publishCadence?: PublishCadence | null;
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

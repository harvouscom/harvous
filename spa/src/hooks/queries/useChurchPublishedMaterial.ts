/**
 * "What is this for?" — attaching published material to the week or run it accompanies.
 *
 * The staff half of the inversion in `CHURCH_STUDY_MATERIAL_LINKING.md`. Only
 * meaningful for a note that lives in a ministry channel; the server refuses
 * anything else with a 404, so pass `enabled` only once the caller knows the
 * note is published in a channel they can author in.
 *
 * Both reads are keyed on the note rather than the church, because that is what
 * the picker is about and what the server gates on.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import { churchSermonsQueryKey } from './useChurchSermons';

/** A plan row this note may claim. */
export type PublishedMaterialServiceTarget = {
  id: string;
  title: string;
  serviceDate: string | null;
  seriesId: string | null;
};

/** A run this note may claim, so an eight-week study attaches once. */
export type PublishedMaterialSeriesTarget = {
  id: string;
  title: string;
  runLabel: string | null;
  serviceCount: number;
};

export type PublishedMaterialTargets = {
  services: PublishedMaterialServiceTarget[];
  series: PublishedMaterialSeriesTarget[];
};

export type PublishedMaterialClaims = {
  serviceIds: string[];
  seriesIds: string[];
};

export function publishedMaterialTargetsQueryKey(
  userId: string | null | undefined,
  noteId: string | null | undefined,
) {
  return ['church-published-material-targets', userId ?? 'none', noteId ?? 'none'] as const;
}

export function publishedMaterialClaimsQueryKey(
  userId: string | null | undefined,
  noteId: string | null | undefined,
) {
  return ['church-published-material-claims', userId ?? 'none', noteId ?? 'none'] as const;
}

export function useChurchPublishedMaterialTargets(
  noteId: string | null | undefined,
  options?: { enabled?: boolean },
) {
  const { userId } = useAuth();
  const authReady = useAuthReady();
  const trimmed = noteId?.trim() || null;

  return useQuery({
    queryKey: publishedMaterialTargetsQueryKey(userId, trimmed),
    enabled: authReady && !!userId && !!trimmed && options?.enabled === true,
    queryFn: () =>
      api.get<PublishedMaterialTargets>(
        `/api/church/published-material/targets?noteId=${encodeURIComponent(trimmed!)}`,
      ),
    staleTime: 30_000,
    retry: false,
  });
}

export function useChurchPublishedMaterialClaims(
  noteId: string | null | undefined,
  options?: { enabled?: boolean },
) {
  const { userId } = useAuth();
  const authReady = useAuthReady();
  const trimmed = noteId?.trim() || null;

  return useQuery({
    queryKey: publishedMaterialClaimsQueryKey(userId, trimmed),
    enabled: authReady && !!userId && !!trimmed && options?.enabled === true,
    queryFn: () =>
      api.get<PublishedMaterialClaims>(
        `/api/church/published-material/for-note?noteId=${encodeURIComponent(trimmed!)}`,
      ),
    staleTime: 30_000,
    retry: false,
  });
}

/**
 * Replace what this note claims.
 *
 * Invalidates the congregant "This Sunday" payload as well as the picker's own
 * state: the person attaching is usually looking at both, and a stale card that
 * still shows yesterday's answer is the bug this feature exists to avoid.
 */
export function useSetChurchPublishedMaterial(noteId: string | null | undefined) {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const trimmed = noteId?.trim() || null;

  return useMutation({
    mutationFn: (input: PublishedMaterialClaims) =>
      api.post<{ success: boolean }>('/api/church/published-material/set', {
        noteId: trimmed,
        serviceIds: input.serviceIds,
        seriesIds: input.seriesIds,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: publishedMaterialClaimsQueryKey(userId, trimmed),
      });
      void queryClient.invalidateQueries({ queryKey: churchSermonsQueryKey(userId) });
    },
  });
}

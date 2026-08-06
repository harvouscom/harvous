import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import { churchSermonsQueryKey } from './useChurchSermons';
import { churchTeachingPlanQueryKey } from './useChurchTeachingPlan';

/** One of the church's recurring services. */
export type ChurchServiceTime = {
  id: string;
  /** 0 = Sunday, matching Date.getDay(). */
  dayOfWeek: number;
  /** 'HH:MM' 24h on the church's own wall clock. */
  startTime: string;
  label: string | null;
  sortOrder?: number;
};

export type ChurchSettingsResponse = {
  church: { id: string; name: string; orgId: string };
  /** Raw, null intact — the form must be able to show "not set". */
  /** `country`/`state` are read-only context for the time-zone picker, not editable here. */
  settings: { timezone: string | null; country: string | null; state: string | null };
  serviceTimes: ChurchServiceTime[];
};

export function churchSettingsQueryKey(
  userId: string | null | undefined,
  orgId: string | null | undefined,
) {
  return ['church-settings', userId ?? 'none', orgId ?? 'home'] as const;
}

/**
 * Server-gated on staff membership — pass `enabled: true` only once
 * `useChurchStaffStatus` says the viewer may manage settings, so a congregant
 * never fires a request that will 403.
 */
export function useChurchSettings(orgId: string | null | undefined, options?: { enabled?: boolean }) {
  const { userId } = useAuth();
  const authReady = useAuthReady();
  const trimmedOrgId = orgId?.trim() || null;

  return useQuery({
    queryKey: churchSettingsQueryKey(userId, trimmedOrgId),
    enabled: authReady && !!userId && !!trimmedOrgId && options?.enabled === true,
    queryFn: () =>
      api.get<ChurchSettingsResponse>(
        `/api/church/settings?orgId=${encodeURIComponent(trimmedOrgId!)}`,
      ),
    staleTime: 60_000,
    retry: false,
  });
}

type SettingsAction =
  | { kind: 'timezone'; timezone: string | null }
  | { kind: 'addServiceTime'; dayOfWeek: number; startTime: string; label?: string | null }
  | { kind: 'removeServiceTime'; serviceTimeId: string };

/** Change the church's clock or its service times. Server-gated on `manage_church_settings`. */
export function useChurchSettingsActions(orgId: string | null | undefined) {
  const queryClient = useQueryClient();
  const { userId } = useAuth();
  const trimmedOrgId = orgId?.trim() || null;

  return useMutation({
    mutationFn: (action: SettingsAction) => {
      const { kind, ...rest } = action;
      const body = { orgId: trimmedOrgId, ...rest };
      switch (kind) {
        case 'timezone':
          return api.post('/api/church/settings/update', body);
        case 'addServiceTime':
          return api.post('/api/church/settings/service-times/create', body);
        case 'removeServiceTime':
          return api.post('/api/church/settings/service-times/delete', body);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: churchSettingsQueryKey(userId, trimmedOrgId),
      });
      // The plan payload carries the service times as the sermon editor's
      // checkboxes, and its date picker starts from them.
      void queryClient.invalidateQueries({
        queryKey: churchTeachingPlanQueryKey(userId, trimmedOrgId),
      });
      /*
        The one that is easy to forget and the only user-visible one: a sermon's
        times come from these slots, so removing or moving one changes what the
        congregation's "This Sunday" card says.
      */
      void queryClient.invalidateQueries({ queryKey: churchSermonsQueryKey(userId) });
    },
  });
}

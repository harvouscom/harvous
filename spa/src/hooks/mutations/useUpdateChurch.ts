import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../lib/api';
import { updateCachedProfile } from '../queries/useProfile';

export type UpdateChurchIntent = 'outside_us' | 'unlisted_us';

export interface UpdateChurchVariables {
  /** Set to link/refresh from Here’s My Church; `null` clears. */
  hmcChurchId?: string | null;
  /** Explicit manual path — required for outside_us / unlisted_us saves. */
  intent?: UpdateChurchIntent;
  /** Manual fallback only when not sending hmcChurchId. */
  churchName?: string | null;
  churchCity?: string | null;
  churchState?: string | null;
  churchCountry?: string | null;
}

interface UpdateChurchResponse {
  success?: boolean;
  church?: {
    hmcChurchId?: string | null;
    churchName: string | null;
    churchCity: string | null;
    churchState: string | null;
    churchCountry: string | null;
    connectedChurchId?: string | null;
    connectedOrgId?: string | null;
    connectedChurchAt?: string | null;
  };
  error?: string;
}

function clean(v: string | null | undefined): string | null | undefined {
  if (v === undefined) return undefined;
  const t = (v ?? '').trim();
  return t === '' ? null : t;
}

/**
 * Persist church details. Prefer `hmcChurchId` — server resolves name/city/state from HMC.
 */
export function useUpdateChurch() {
  const queryClient = useQueryClient();
  const { userId } = useAuth();

  return useMutation({
    mutationFn: async (vars: UpdateChurchVariables) => {
      const payload: Record<string, string | null> = {};
      if (vars.hmcChurchId !== undefined) {
        payload.hmcChurchId = vars.hmcChurchId;
      }
      if (vars.intent !== undefined) payload.intent = vars.intent;
      if (vars.churchName !== undefined) payload.churchName = clean(vars.churchName) ?? null;
      if (vars.churchCity !== undefined) payload.churchCity = clean(vars.churchCity) ?? null;
      if (vars.churchState !== undefined) payload.churchState = clean(vars.churchState) ?? null;
      if (vars.churchCountry !== undefined) payload.churchCountry = clean(vars.churchCountry) ?? null;
      return api.post<UpdateChurchResponse>('/api/user/update-church', payload);
    },
    onSuccess: (data, vars) => {
      const church = data.church ?? {
        hmcChurchId: vars.hmcChurchId ?? null,
        churchName: clean(vars.churchName) ?? null,
        churchCity: clean(vars.churchCity) ?? null,
        churchState: clean(vars.churchState) ?? null,
        churchCountry: clean(vars.churchCountry) ?? null,
      };
      updateCachedProfile({
        hmcChurchId: church.hmcChurchId ?? null,
        churchName: church.churchName,
        churchCity: church.churchCity,
        churchState: church.churchState,
        churchCountry: church.churchCountry,
        connectedChurchId: church.connectedChurchId ?? null,
        connectedOrgId: church.connectedOrgId ?? null,
        connectedChurchAt: church.connectedChurchAt ?? null,
      });
      void queryClient.invalidateQueries({ queryKey: ['profile', userId ?? 'none'] });
    },
  });
}

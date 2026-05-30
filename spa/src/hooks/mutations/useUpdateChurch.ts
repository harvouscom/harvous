import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../lib/api';
import { updateCachedProfile } from '../queries/useProfile';

export interface UpdateChurchVariables {
  churchName: string | null;
  churchCity: string | null;
  churchState: string | null;
  churchCountry: string | null;
}

interface UpdateChurchResponse {
  success?: boolean;
  church?: {
    churchName: string | null;
    churchCity: string | null;
    churchState: string | null;
    churchCountry: string | null;
  };
  error?: string;
}

function clean(v: string | null): string | null {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
}

/**
 * Persist church details to the user's account. Mirrors the classic-web
 * MyChurchPanel save against `POST /api/user/update-church`. On success the
 * cached profile is patched and the profile query invalidated so every surface
 * (prototype, classic web, native via sync) reflects the change.
 */
export function useUpdateChurch() {
  const queryClient = useQueryClient();
  const { userId } = useAuth();

  return useMutation({
    mutationFn: async (vars: UpdateChurchVariables) => {
      const payload = {
        churchName: clean(vars.churchName),
        churchCity: clean(vars.churchCity),
        churchState: clean(vars.churchState),
        churchCountry: clean(vars.churchCountry),
      };
      return api.post<UpdateChurchResponse>('/api/user/update-church', payload);
    },
    onSuccess: (data, vars) => {
      const church = data.church ?? {
        churchName: clean(vars.churchName),
        churchCity: clean(vars.churchCity),
        churchState: clean(vars.churchState),
        churchCountry: clean(vars.churchCountry),
      };
      updateCachedProfile(church);
      void queryClient.invalidateQueries({ queryKey: ['profile', userId ?? 'none'] });
    },
  });
}

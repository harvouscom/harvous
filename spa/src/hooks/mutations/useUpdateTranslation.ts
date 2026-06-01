import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../lib/api';
import { updateCachedProfile } from '../queries/useProfile';
import { getCachedProfileData, getEffectiveDefaultTranslation, updateCachedProfileData } from '@/utils/profile-cache';

interface UpdateTranslationResponse {
  success?: boolean;
  error?: string;
}

/**
 * Persist the user's default Bible translation. Mirrors the classic-web
 * DefaultTranslationPanel against `POST /api/user/update-translation`. On success
 * the cached profile is patched and the profile query invalidated so every surface
 * reflects the change.
 */
export function useUpdateTranslation() {
  const queryClient = useQueryClient();
  const { userId } = useAuth();

  return useMutation({
    mutationFn: async (defaultTranslation: string) =>
      api.post<UpdateTranslationResponse>('/api/user/update-translation', { defaultTranslation }),
    onSuccess: (_data, defaultTranslation) => {
      const previousDefault = getCachedProfileData()?.defaultTranslation ?? getEffectiveDefaultTranslation();
      updateCachedProfile({ defaultTranslation });
      updateCachedProfileData({ defaultTranslation });
      void queryClient.invalidateQueries({ queryKey: ['profile', userId ?? 'none'] });
      try {
        window.dispatchEvent(
          new CustomEvent('defaultTranslationChanged', {
            detail: { defaultTranslation, previousDefault },
          }),
        );
      } catch {
        /* ignore */
      }
    },
  });
}

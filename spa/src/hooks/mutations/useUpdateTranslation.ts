import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../lib/api';
import type { VotdToday } from '../../lib/votd-today';
import { votdTodayQueryKey } from '../queries/useVotdToday';
import { featuredItemsQueryKey } from '../queries/useFeaturedItems';
import { updateCachedProfile, type UserProfile } from '../queries/useProfile';
import { getCachedProfileData, getEffectiveDefaultTranslation, updateCachedProfileData } from '@/utils/profile-cache';
import { useHarvousIdentity } from '../useHarvousIdentity';
import { setGuestPrefs } from '../../lib/guest-store';

interface UpdateTranslationResponse {
  success?: boolean;
  error?: string;
}

interface UpdateTranslationContext {
  previousProfile: UserProfile | undefined;
  previousVotd: VotdToday | null | undefined;
  previousDefault: string;
}

function profileQueryKey(userId: string | null | undefined) {
  return ['profile', userId ?? 'none'] as const;
}

/**
 * Persist the user's default Bible translation. Mirrors the classic-web
 * DefaultTranslationPanel against `POST /api/user/update-translation`. Optimistically
 * patches React Query + sessionStorage so prototype settings UI does not flicker
 * between mutation end and profile refetch.
 */
export function useUpdateTranslation() {
  const queryClient = useQueryClient();
  const { userId } = useAuth();
  const { isGuest } = useHarvousIdentity();
  const key = profileQueryKey(userId);

  return useMutation({
    mutationFn: async (defaultTranslation: string) => {
      /*
       * A guest keeps this on the device. The POST 401'd and `onError` reverted the cache,
       * so the switch appeared to work for the chapter in front of them and was forgotten by
       * the next one — reading in the version you chose needs no account.
       */
      if (isGuest) {
        setGuestPrefs({ defaultTranslation });
        return { success: true };
      }
      return api.post<UpdateTranslationResponse>('/api/user/update-translation', {
        defaultTranslation,
      });
    },
    onMutate: async (defaultTranslation) => {
      await queryClient.cancelQueries({ queryKey: key });

      const previousProfile = queryClient.getQueryData<UserProfile>(key);
      const previousVotd = queryClient.getQueryData<VotdToday | null>(votdTodayQueryKey);
      const previousDefault =
        previousProfile?.defaultTranslation ??
        getCachedProfileData()?.defaultTranslation ??
        getEffectiveDefaultTranslation();

      queryClient.setQueryData<UserProfile | undefined>(key, (prev) =>
        prev ? { ...prev, defaultTranslation } : prev,
      );

      if (previousVotd != null) {
        queryClient.setQueryData<VotdToday | null>(votdTodayQueryKey, {
          ...previousVotd,
          translation: defaultTranslation,
        });
      }

      updateCachedProfile({ defaultTranslation });
      updateCachedProfileData({ defaultTranslation });

      return { previousProfile, previousVotd, previousDefault } satisfies UpdateTranslationContext;
    },
    onError: (_err, _defaultTranslation, context) => {
      if (!context) return;
      queryClient.setQueryData(key, context.previousProfile);
      if (context.previousVotd !== undefined) {
        queryClient.setQueryData(votdTodayQueryKey, context.previousVotd);
      }
      updateCachedProfile({ defaultTranslation: context.previousDefault });
      updateCachedProfileData({ defaultTranslation: context.previousDefault });
    },
    onSuccess: (_data, defaultTranslation, context) => {
      const previousDefault = context?.previousDefault ?? getEffectiveDefaultTranslation();
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: votdTodayQueryKey });
      void queryClient.invalidateQueries({ queryKey: featuredItemsQueryKey });
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

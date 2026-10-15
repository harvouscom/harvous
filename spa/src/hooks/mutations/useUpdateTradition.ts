import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../lib/api';
import { updateCachedProfile, type UserProfile } from '../queries/useProfile';
import { votdTodayQueryKey } from '../queries/useVotdToday';
import { useHarvousIdentity } from '../useHarvousIdentity';
import { setGuestPrefs } from '../../lib/guest-store';
import { markOnboardingStep } from '../../lib/proto-onboarding-sync';
import { normalizeTradition, type Tradition } from '@/utils/tradition';

interface UpdateTraditionResponse {
  success?: boolean;
  error?: string;
}

function profileQueryKey(userId: string | null | undefined) {
  return ['profile', userId ?? 'none'] as const;
}

/**
 * Persist Protestant / Catholic against `POST /api/user/update-tradition`, optimistically, the
 * way `useUpdateTranslation` does the translation. A guest keeps it on the device. Today's
 * passage is refetched because Catholics get Today's readings in its place.
 */
export function useUpdateTradition() {
  const queryClient = useQueryClient();
  const { userId } = useAuth();
  const { isGuest } = useHarvousIdentity();
  const key = profileQueryKey(userId);

  return useMutation({
    mutationFn: async (tradition: Tradition) => {
      if (isGuest) {
        setGuestPrefs({ tradition });
        return { success: true };
      }
      return api.post<UpdateTraditionResponse>('/api/user/update-tradition', { tradition });
    },
    onMutate: async (tradition) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previousProfile = queryClient.getQueryData<UserProfile>(key);
      const previous = normalizeTradition(previousProfile?.tradition);
      queryClient.setQueryData<UserProfile | undefined>(key, (prev) => (prev ? { ...prev, tradition } : prev));
      updateCachedProfile({ tradition });
      return { previousProfile, previous };
    },
    onError: (_err, _tradition, context) => {
      if (!context) return;
      queryClient.setQueryData(key, context.previousProfile);
      updateCachedProfile({ tradition: context.previous });
    },
    onSuccess: () => {
      markOnboardingStep('tradition');
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: votdTodayQueryKey });
    },
  });
}

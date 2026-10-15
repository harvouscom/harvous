import { useSyncExternalStore } from 'react';
import { normalizeTradition, type Tradition } from '@/utils/tradition';
import { useProfile } from './queries/useProfile';
import { useHarvousIdentity } from './useHarvousIdentity';
import { guestStoreServerSnapshot, guestStoreSnapshot, subscribeToGuestStore } from '../lib/guest-store';

/**
 * The reader's tradition (src/utils/tradition.ts): the account's for a member, the device's for
 * a guest. Protestant until the profile says otherwise, so a slow profile never flashes the
 * Catholic canon at someone who didn't choose it.
 */
export function useTradition(): Tradition {
  const { isGuest } = useHarvousIdentity();
  const { data: profile } = useProfile();
  const guestStore = useSyncExternalStore(subscribeToGuestStore, guestStoreSnapshot, guestStoreServerSnapshot);
  return normalizeTradition(isGuest ? guestStore.prefs.tradition : profile?.tradition);
}

export function useIsCatholic(): boolean {
  return useTradition() === 'catholic';
}

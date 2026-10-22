import { useEffect, useState, useSyncExternalStore } from 'react';
import { getEffectiveDefaultTranslation } from '@/utils/profile-cache';
import { guestPrefs, subscribeToGuestStore } from '../lib/guest-store';
import { useProfile } from './queries/useProfile';
import { useHarvousIdentity } from './useHarvousIdentity';

const guestTranslationSnapshot = () => guestPrefs().defaultTranslation;
const guestTranslationServerSnapshot = () => undefined;

/**
 * My Bible — the version the reader opens in when no `?t=` pins one — or `undefined` while it
 * is not known yet.
 *
 * `undefined` is the point. The reader used to resolve `profile?.defaultTranslation || 'NET'`
 * on its first render, which on a cold tab (no profile snapshot in sessionStorage yet) painted
 * the chapter in NET and then swapped it for ESV a beat later — or, worse, every internal door
 * passed that cold-cache NET along as `?t=`, and the pin then outranked the setting for good.
 * A caller that waits on `undefined` paints once, in the right version.
 *
 * Where the answer comes from depends on who is reading:
 * - **an account** — the profile. A placeholder snapshot counts when it carries the field (it is
 *   this account's own, from this tab); offline or after a failed fetch nothing better is coming,
 *   so the session cache's guess stands in rather than waiting forever.
 * - **a guest** — the guest store, which is where the reader's own picker writes for them.
 * - **nobody** — NET. There is no setting to wait for.
 *
 * It follows changes live: the profile and the guest store are both subscribed to, and a
 * `defaultTranslationChanged` announcement is taken at its word until the profile refetch it
 * triggers lands — a placeholder profile is outside the query cache, so the optimistic write in
 * `useUpdateTranslation` cannot reach it.
 */
export function useMyBibleTranslation(): string | undefined {
  const { mode } = useHarvousIdentity();
  const profileQuery = useProfile();
  const guestTranslation = useSyncExternalStore(
    subscribeToGuestStore,
    guestTranslationSnapshot,
    guestTranslationServerSnapshot,
  );

  const [announced, setAnnounced] = useState<string | undefined>(undefined);
  useEffect(() => {
    const onChanged = (event: Event) => {
      const next = (event as CustomEvent<{ defaultTranslation?: string }>).detail?.defaultTranslation;
      if (next) setAnnounced(next.toUpperCase());
    };
    window.addEventListener('defaultTranslationChanged', onChanged);
    return () => window.removeEventListener('defaultTranslationChanged', onChanged);
  }, []);
  /* A profile that lands after the announcement is newer than it. */
  useEffect(() => {
    setAnnounced(undefined);
  }, [profileQuery.dataUpdatedAt]);

  if (mode === 'guest') return (announced ?? guestTranslation ?? 'NET').toUpperCase();
  if (mode !== 'account') return 'NET';

  const fromProfile = announced ?? profileQuery.data?.defaultTranslation;
  if (fromProfile) return fromProfile.toUpperCase();
  if (profileQuery.isError || profileQuery.fetchStatus === 'paused') {
    return getEffectiveDefaultTranslation().toUpperCase();
  }
  return undefined;
}

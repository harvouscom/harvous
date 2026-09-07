import { useEffect, useRef } from 'react';
import { useProfile } from './queries/useProfile';
import { api } from '../lib/api';
import { canAddPack, downloadPack, listPacks } from '@/utils/bible-pack-store';

/**
 * Silently completes the account's default translation's offline pack once per app session, so
 * a phone with no signal already has the Bible it reads in — without ever needing to visit
 * Settings > Translation first, which used to be the only place a pack download could start
 * (`PrototypeTranslationPage.tsx`'s own auto-start effect only runs while that page is open).
 *
 * `useProfile()` is already `useAuthReady()`-gated internally, so `profile` staying undefined
 * is enough of a wait condition here — no separate auth check needed.
 *
 * `downloadPack()` skips books it has already saved (see `bible-pack-store.ts`), so this is
 * cheap to call every session: a translation that is already complete costs one `listPacks()`
 * IndexedDB read and nothing else, and an interrupted prior attempt resumes from wherever it
 * left off rather than restarting at Genesis.
 *
 * No abort on unmount, deliberately — unlike the Settings page's user-visible download (which a
 * closed sheet must be able to cancel; see `useBiblePacks.ts`), this is meant to keep completing
 * in the background for the life of the session even through an incidental remount of whatever
 * mounts it.
 */
export function useWarmDefaultTranslationPack(): void {
  const { data: profile } = useProfile();
  const startedRef = useRef(false);

  useEffect(() => {
    if (!profile || startedRef.current) return;
    startedRef.current = true;
    const translationId = profile.defaultTranslation || 'NET';
    void (async () => {
      const packs = await listPacks();
      const existing = packs.find((p) => p.translationId === translationId);
      if (existing?.complete) return;
      if (!canAddPack(packs, translationId)) return;
      await downloadPack(translationId, async (book) => {
        const params = new URLSearchParams({ book, translation: translationId });
        return api.get(`/api/scripture/book?${params.toString()}`);
      });
    })();
  }, [profile]);
}

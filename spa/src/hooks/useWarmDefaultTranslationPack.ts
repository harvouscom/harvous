import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useProfile } from './queries/useProfile';
import { api } from '../lib/api';
import { canAddPack, downloadPack, listPacks } from '@/utils/bible-pack-store';

/**
 * How long the app has to stay quiet before the pack is allowed to start, and how long we wait
 * for that quiet before giving up on it.
 *
 * A second of no fetches means the first screen has what it asked for. The ceiling is there
 * because a surface that polls would otherwise never be quiet, and a pack that never downloads
 * because someone left a dashboard open is worse than one that shares the pipe for a while.
 */
const QUIET_MS = 1000;
const QUIET_DEADLINE_MS = 15_000;

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
 *
 * **It waits for the app to go quiet first.** `downloadPack` walks the canon a book at a time, so
 * on a browser whose pack is incomplete this is up to 66 requests — and it used to start the
 * moment `profile` landed, which is in the middle of the first screen's own burst. Over HTTP/1.1
 * that burst is already queueing against a six-connection cap, so the pack was competing with the
 * page the reader is looking at. Nothing here is urgent: the pack has no deadline, resumes where
 * it left off, and is for a signal outage that has not happened yet.
 *
 * Quiet is read from the query cache rather than from a timer, because the thing worth waiting
 * for is the *network* going idle, not the main thread — `requestIdleCallback` fires happily
 * while twenty requests are in flight, since waiting on a socket leaves the CPU free.
 */
export function useWarmDefaultTranslationPack(): void {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const startedRef = useRef(false);

  useEffect(() => {
    if (!profile || startedRef.current) return;
    const translationId = profile.defaultTranslation || 'NET';

    const start = () => {
      if (startedRef.current) return;
      startedRef.current = true;
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
    };

    /*
     * Armed whenever nothing is in flight and disarmed the moment something is, so the pack
     * starts after a full second of quiet rather than in the first gap between two waves of the
     * opening burst.
     */
    let quiet: number | undefined;
    const disarm = () => {
      if (quiet !== undefined) {
        window.clearTimeout(quiet);
        quiet = undefined;
      }
    };
    const check = () => {
      if (startedRef.current) return;
      if (queryClient.isFetching() > 0) {
        disarm();
        return;
      }
      if (quiet === undefined) quiet = window.setTimeout(start, QUIET_MS);
    };

    const unsubscribe = queryClient.getQueryCache().subscribe(check);
    const deadline = window.setTimeout(start, QUIET_DEADLINE_MS);
    check();

    return () => {
      unsubscribe();
      disarm();
      window.clearTimeout(deadline);
    };
  }, [profile, queryClient]);
}

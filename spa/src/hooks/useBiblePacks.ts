import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import {
  MAX_OFFLINE_TRANSLATIONS,
  canAddPack,
  downloadPack,
  listPacks,
  removePack,
  requestPack,
  unrequestPack,
  type PackSummary,
} from '@/utils/bible-pack-store';

export interface PackDownloadState {
  translationId: string;
  booksSaved: number;
  booksTotal: number;
}

/**
 * The offline packs, and the machinery for adding and removing them.
 *
 * Local state rather than React Query: packs live in IndexedDB on this device, are changed
 * only by this page, and have no server copy to be stale against. A query cache would add a
 * second source of truth for something already stored locally.
 */
export function useBiblePacks() {
  const [packs, setPacks] = useState<PackSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<PackDownloadState | null>(null);
  /*
   * Translations asked for while another is transferring, in the order they were asked.
   *
   * There used to be no queue and no guard, so two presses started two `downloadPack` loops
   * against one `downloading` slot and one `abortRef`. The loops then took turns overwriting
   * the slot: each row flickered between "Stop · Saving 35 of 66" and "Finish / Remove · 3 of
   * 66 saved" — the second being its stale count from the last `refresh` — several times a
   * second, and the first controller was overwritten so that download could never be stopped.
   *
   * Serialised rather than run in parallel, following `downloadPack`'s own reasoning about
   * bandwidth: two packs at once compete for the connection the reader is also reading over,
   * and finish later than one after the other.
   */
  const [queue, setQueue] = useState<string[]>([]);
  const queueRef = useRef<string[]>([]);
  const runningRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  /* Guards against setState after the settings sheet closes mid-download. */
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    const next = await listPacks();
    if (mountedRef.current) setPacks(next);
  }, []);

  const setQueueState = useCallback((next: string[]) => {
    queueRef.current = next;
    if (mountedRef.current) setQueue(next);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh().finally(() => {
      if (mountedRef.current) setLoading(false);
    });
    return () => {
      mountedRef.current = false;
      // A download that outlives its page is a download nobody can see or stop.
      abortRef.current?.abort();
    };
  }, [refresh]);

  /*
   * Work the queue until it is empty, one pack at a time.
   *
   * Guarded by `runningRef` rather than by `downloading`: state is a render behind, and two
   * presses inside one frame would both read it as null and both start a runner — which is
   * the bug this replaces, reintroduced one level up.
   */
  const runQueue = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      while (queueRef.current.length > 0) {
        const translationId = queueRef.current[0];
        const controller = new AbortController();
        abortRef.current = controller;
        setDownloading({ translationId, booksSaved: 0, booksTotal: 66 });

        const result = await downloadPack(
          translationId,
          async (book) => {
            const params = new URLSearchParams({ book, translation: translationId });
            return api.get(`/api/scripture/book?${params.toString()}`);
          },
          {
            signal: controller.signal,
            onProgress: (p) => {
              /* Only the pack at the head owns the slot. A late tick from an aborted loop
                 would otherwise repaint a row that has already gone back to rest. */
              if (mountedRef.current && queueRef.current[0] === translationId) setDownloading(p);
            },
          },
        );

        abortRef.current = null;
        /*
         * Stopped before a single book landed, so there is nothing to be a pack.
         *
         * Without this the request written on the press outlives the download it was written
         * for, and the row settles into "Part-saved · 0 of 66" — a pack holding one of the
         * three slots and offering to finish a transfer that never began. Books already on
         * the device count as saved here, so a genuine partial keeps its request and its
         * Finish; only an empty one is withdrawn.
         */
        if (result.booksSaved === 0) await unrequestPack(translationId);
        setQueueState(queueRef.current.filter((id) => id !== translationId));
        if (!mountedRef.current) return;
        setDownloading(null);
        await refresh();
      }
    } finally {
      runningRef.current = false;
    }
  }, [refresh, setQueueState]);

  const download = useCallback(
    async (translationId: string) => {
      if (queueRef.current.includes(translationId)) return;
      /*
       * The limit counts what is queued as well as what is stored. `packs` only learns about
       * a new request once `refresh` resolves, so two quick presses at the limit's edge would
       * both pass a check made against `packs` alone.
       */
      const pending = queueRef.current.filter((id) => !packs.some((p) => p.translationId === id));
      if (!canAddPack([...packs, ...pending.map((id) => ({ translationId: id }) as PackSummary)], translationId)) {
        return;
      }

      setQueueState([...queueRef.current, translationId]);
      /*
       * `downloadPack` records the request as its first act, but it does not return until all
       * 66 books are done — and behind a queue it may not even have started. Without this the
       * list would not learn about the new pack until the transfer finished, and every other
       * row's control would flip to its limit-reached state minutes after the press.
       */
      void requestPack(translationId).then(refresh);
      void runQueue();
    },
    [packs, refresh, runQueue, setQueueState],
  );

  /** Stop the one transferring, or take a waiting one back out of the queue. */
  const cancel = useCallback(
    (translationId?: string) => {
      const target = translationId ?? queueRef.current[0];
      if (!target) return;
      if (queueRef.current[0] === target) {
        abortRef.current?.abort();
        return;
      }
      /* Taken out before its turn, so no book was ever fetched for it — the request written
         on the press goes with it, or it would sit there as an empty pack. */
      setQueueState(queueRef.current.filter((id) => id !== target));
      void unrequestPack(target).then(refresh);
    },
    [refresh, setQueueState],
  );

  const remove = useCallback(
    async (translationId: string) => {
      await removePack(translationId);
      await refresh();
    },
    [refresh],
  );

  return {
    packs,
    loading,
    downloading,
    /** Asked for, waiting its turn. The head of this is whatever `downloading` reports. */
    queue,
    download,
    cancel,
    remove,
    atLimit: packs.length >= MAX_OFFLINE_TRANSLATIONS,
    maxPacks: MAX_OFFLINE_TRANSLATIONS,
  };
}

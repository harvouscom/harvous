import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import {
  MAX_OFFLINE_TRANSLATIONS,
  canAddPack,
  downloadPack,
  listPacks,
  removePack,
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
  const abortRef = useRef<AbortController | null>(null);
  /* Guards against setState after the settings sheet closes mid-download. */
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    const next = await listPacks();
    if (mountedRef.current) setPacks(next);
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

  const download = useCallback(
    async (translationId: string) => {
      if (!canAddPack(packs, translationId)) return;

      const controller = new AbortController();
      abortRef.current = controller;
      setDownloading({ translationId, booksSaved: 0, booksTotal: 66 });

      await downloadPack(
        translationId,
        async (book) => {
          const params = new URLSearchParams({ book, translation: translationId });
          return api.get(`/api/scripture/book?${params.toString()}`);
        },
        {
          signal: controller.signal,
          onProgress: (p) => {
            if (mountedRef.current) setDownloading(p);
          },
        },
      );

      if (mountedRef.current) {
        setDownloading(null);
        await refresh();
      }
      abortRef.current = null;
    },
    [packs, refresh],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

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
    download,
    cancel,
    remove,
    atLimit: packs.length >= MAX_OFFLINE_TRANSLATIONS,
    maxPacks: MAX_OFFLINE_TRANSLATIONS,
  };
}

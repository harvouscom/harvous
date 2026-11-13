/**
 * Stickers beside a chapter's verses in the Bible reader. Keyed by book and chapter only: a
 * sticker is on the verse, not on a translation's wording, so it stays put when the reader
 * switches version (see server/utils/verse-stickers.ts for why it isn't a highlight row).
 *
 * Signed-in only. A guest has no account to keep them in, and guest adoption carries highlights
 * and notes, not stickers, so offering them would be offering something that disappears.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthReady } from '../useAuthReady';
import { useHarvousIdentity } from '../useHarvousIdentity';
import { isReaderSticker, type ReaderSticker } from '../../../../shared/verse-stickers';

export type ChapterSticker = { verse: number; sticker: ReaderSticker };

export function chapterStickersKey(book: string, chapter: number) {
  return ['prototype', 'scripture-stickers', book, chapter] as const;
}

export function useChapterStickers(book: string, chapter: number) {
  // Cold-start 401s are a recurring bug class here; every user-scoped query waits for auth.
  const authReady = useAuthReady();
  const { isGuest } = useHarvousIdentity();
  return useQuery({
    queryKey: chapterStickersKey(book, chapter),
    enabled: authReady && !isGuest && !!book && Number.isFinite(chapter),
    queryFn: async (): Promise<ChapterSticker[]> => {
      const params = new URLSearchParams({ book, chapter: String(chapter) });
      const res = await fetch(`/api/scripture/stickers?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load stickers');
      const data = (await res.json()) as { stickers?: Array<{ verse: unknown; sticker: unknown }> };
      return (data.stickers ?? []).flatMap((row) =>
        typeof row.verse === 'number' && isReaderSticker(row.sticker) ? [{ verse: row.verse, sticker: row.sticker }] : [],
      );
    },
  });
}

/** Sticks one on, swaps it, or (with `null`) takes it off — painted the moment it's tapped. */
export function useSetVerseSticker(book: string, chapter: number) {
  const queryClient = useQueryClient();
  const key = chapterStickersKey(book, chapter);
  return useMutation({
    mutationFn: async (input: { verse: number; sticker: ReaderSticker | null }) => {
      const res = await fetch('/api/scripture/stickers', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ book, chapter, ...input }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || 'Couldn’t save that sticker — try again');
      }
      return res.json();
    },
    onMutate: async ({ verse, sticker }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ChapterSticker[]>(key);
      queryClient.setQueryData<ChapterSticker[]>(key, (rows = []) => {
        const rest = rows.filter((row) => row.verse !== verse);
        return sticker ? [...rest, { verse, sticker }].sort((a, b) => a.verse - b.verse) : rest;
      });
      return { previous };
    },
    onError: (_error, _input, context) => {
      queryClient.setQueryData(key, context?.previous ?? []);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

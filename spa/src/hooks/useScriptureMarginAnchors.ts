import { useMemo } from 'react';
import {
  EMPTY_CHAPTER_MARGIN_ANCHORS,
  buildChapterMarginAnchors,
  type ChapterMarginAnchors,
} from '@/utils/scripture-margin-anchors';
import { usePrototypeSpaceScriptureIndex } from './queries/usePrototypeSpaceScriptureIndex';

/**
 * Per-verse note anchors for the chapter on screen, for the reader's left margin.
 *
 * Rides the space scripture index the sidebar's Scripture mode already loads, so
 * opening a chapter usually costs nothing: same query key, same cache entry, and
 * the same answer to "which notes cite this passage" that the sidebar gives.
 * Offline behaviour comes along for free for the same reason.
 */
export function useScriptureMarginAnchors(
  spaceId: string | undefined,
  book: string | undefined,
  chapter: number | undefined,
): { anchors: ChapterMarginAnchors; isLoading: boolean } {
  const { data: bookIndex, isLoading } = usePrototypeSpaceScriptureIndex(spaceId);

  const anchors = useMemo(() => {
    if (!bookIndex?.length || !book || !Number.isFinite(chapter)) {
      return EMPTY_CHAPTER_MARGIN_ANCHORS;
    }
    return buildChapterMarginAnchors(bookIndex, book, chapter as number);
  }, [bookIndex, book, chapter]);

  return { anchors, isLoading };
}

/**
 * Per-verse note anchors for the chapter on screen — what the reader's margin markers show.
 *
 * Reuses the space scripture index rather than adding a route, so a marker means exactly what
 * a Scripture list-mode row means: a note in this space cites this passage. The derivation is
 * pure and lives in `scripture-margin-anchors.ts`; this hook is only about where the index
 * comes from, including when there is no network.
 */

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import {
  buildChapterMarginAnchors,
  EMPTY_CHAPTER_MARGIN_ANCHORS,
  type ChapterMarginAnchors,
  type MarginAnchorBookLike,
} from '@/utils/scripture-margin-anchors';
import { getScriptureIndexLocal } from '@/utils/offline-scripture-index';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';
import { usePrototypeSpaceScriptureIndex } from './usePrototypeSpaceScriptureIndex';

export function useChapterMarginAnchors(
  spaceId: string | undefined,
  book: string,
  chapter: number,
): ChapterMarginAnchors {
  const { userId } = useAuth();
  const apiSpaceId = normalizePrototypeApiSpaceId(spaceId);
  const indexQuery = usePrototypeSpaceScriptureIndex(spaceId);
  const [mirrored, setMirrored] = useState<MarginAnchorBookLike[] | null>(null);

  const live = indexQuery.data;

  // Read the mirror only while the live index is absent — offline, or before the first fetch
  // lands. Once it arrives the live copy wins, so a marker is never a stale one.
  useEffect(() => {
    if (!userId || !apiSpaceId || live) return;
    let cancelled = false;
    void (async () => {
      const books = await getScriptureIndexLocal(userId, apiSpaceId);
      if (!cancelled) setMirrored((books as MarginAnchorBookLike[] | null) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, apiSpaceId, live]);

  return useMemo(() => {
    const books = (live as MarginAnchorBookLike[] | undefined) ?? mirrored;
    if (!books || !book || !Number.isFinite(chapter)) return EMPTY_CHAPTER_MARGIN_ANCHORS;
    return buildChapterMarginAnchors(books, book, chapter);
  }, [live, mirrored, book, chapter]);
}

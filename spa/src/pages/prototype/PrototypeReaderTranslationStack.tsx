/**
 * The translations behind the page, as paper.
 *
 * ## Why translations and not chapters
 *
 * A stack is good at one thing a list is not: holding several versions of the same object where
 * you can see that there are others and reach one in a gesture. Chapters are a sequence you move
 * *along*, and the reader already moves along them well — prev/next that crosses book boundaries,
 * a canon grid, a chapter grid. Translations are a set you *compare*, which is what the pile is
 * for, and it makes the reader's own sentence true: the text you are reading is the upper-most
 * paper.
 *
 * ## Why only two edges when there are eleven
 *
 * The same cap Activity's day stack uses, for the same reason: past two the pile stops reading as
 * a stack and starts reading as a row of tabs. The other nine are not hidden — the heading's
 * translation chip opens all of them, which is exactly the division the day sheet already draws
 * between flipping an edge and jumping from the date.
 *
 * ## Why the edges are the ones you last used
 *
 * Canonical order would put NASB and CSB behind NLT, which is an accident of a list rather than
 * anyone's comparison. See `recent-translations.ts`.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { TRANSLATION_ORDER, getTranslationAbbreviationDisplay } from '@/data/translations';
import {
  RECENT_TRANSLATIONS_UPDATED_EVENT,
  readRecentTranslations,
  translationEdges,
} from '@/utils/recent-translations';
import { bibleChapterQueryOptions } from '../../hooks/queries/usePrototypeBibleChapter';

/**
 * How many sheets show an edge.
 *
 * Passed to CSS as `--edge-count` rather than restated there. Activity keeps this number twice —
 * `MAX_EDGES` in TS and a `calc(step * 2)` reserve in CSS — and the two can drift silently, which
 * shows up as the topmost label clipped by the toolbar. One number, read in both places.
 */
export const READER_TRANSLATION_EDGES = 2;

export default function PrototypeReaderTranslationStack({
  translation,
  book,
  chapter,
  unavailable,
  onSelect,
}: {
  translation: string;
  book: string;
  chapter: number;
  /** Translations known not to have this chapter — versification genuinely differs. */
  unavailable?: readonly string[];
  onSelect: (translation: string) => void;
}) {
  const queryClient = useQueryClient();

  /*
   * Recents are read into state through a subscription rather than on every render: the list is
   * written by `handleChangeTranslation` in the page above, and a bare read here would not
   * re-render when it changed — the edges would keep naming the translation you just left.
   */
  const recents = useRecentTranslations();

  const edges = useMemo(
    () =>
      translationEdges({
        current: translation,
        recents,
        order: TRANSLATION_ORDER,
        count: READER_TRANSLATION_EDGES,
        exclude: unavailable,
      }),
    [translation, recents, unavailable],
  );

  /*
   * Warm the sheets behind, so a flip is a flip rather than a load.
   *
   * `bibleChapterQueryOptions` rather than a hand-rolled fetch, per its own warning: a prefetch
   * that builds its own key or its own fetcher warms an entry the hook never reads, which looks
   * like it works and silently does nothing. Same key, same function, or the prefetch is a lie.
   *
   * Cheap by construction — the options ask disk before network, and a translation already on
   * this device answers without a request at all.
   */
  useEffect(() => {
    if (!book || !Number.isFinite(chapter)) return;
    for (const id of edges) {
      void queryClient.prefetchQuery(bibleChapterQueryOptions(book, chapter, id));
    }
  }, [queryClient, book, chapter, edges]);

  if (edges.length === 0) return null;

  return (
    <div
      className="pds-reader-stack__edges"
      style={{ '--edge-count': READER_TRANSLATION_EDGES } as CSSProperties}
    >
      {/*
        Deepest first in the DOM so the nearest paints last and sits on top, which is the order a
        pile is actually in. `--edge-depth` is 1 for the nearest.
      */}
      {[...edges].reverse().map((id, i) => {
        const depth = edges.length - i;
        const label = getTranslationAbbreviationDisplay(id);
        return (
          <button
            key={id}
            type="button"
            className="pds-reader-stack__edge"
            style={{ '--edge-depth': depth } as CSSProperties}
            onClick={() => onSelect(id)}
            aria-label={`Read this chapter in ${label}`}
          >
            <span className="pds-caption pds-reader-stack__edge-label">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The recents list, kept current across the surfaces that write it.
 *
 * State plus a subscription rather than a bare read: the list lives in `localStorage` and is
 * written by the page above when a translation is chosen, so a component that only read it at
 * render time would keep naming the version you just left until something else re-rendered it.
 */
function useRecentTranslations(): string[] {
  const [value, setValue] = useState<string[]>(readRecentTranslations);

  useEffect(() => {
    const sync = () => setValue(readRecentTranslations());
    /* Read once on mount too: the list may have been written before this mounted. */
    sync();
    window.addEventListener(RECENT_TRANSLATIONS_UPDATED_EVENT, sync);
    /* `storage` only fires in *other* tabs, which is exactly the case the custom event misses. */
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(RECENT_TRANSLATIONS_UPDATED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return value;
}

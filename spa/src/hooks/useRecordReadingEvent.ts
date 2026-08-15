import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { readingPositionQueryKey } from './queries/useReadingPosition';

/**
 * How long a chapter has to be on screen before it counts as read.
 *
 * Paging from Genesis 40 to Genesis 43 passes through 41 and 42, and logging those would make
 * the history a record of navigation rather than reading. Four seconds is long enough that
 * passing through does not register and short enough that glancing at a cross-reference does.
 */
const DWELL_MS = 4000;

/**
 * Report a chapter as read, once it has actually been read.
 *
 * Fire-and-forget in the strongest sense: no loading state, no error surfaced, no retry, and
 * nothing in the reader waits on it or re-renders because of it. Reading is the one thing in
 * this app that must never depend on the network, and a bookmark is not worth a single frame
 * of the text arriving later.
 *
 * The dwell timer is cancelled on unmount and restarted whenever the chapter changes, so
 * paging quickly through a book logs only where the paging stopped.
 */
export function useRecordReadingEvent(
  book: string | undefined,
  chapter: number | undefined,
  translation: string | undefined,
  options: { enabled?: boolean } = {},
) {
  const enabled = options.enabled !== false;
  const queryClient = useQueryClient();
  /* Survives re-renders so a text-size change or a highlight does not re-log the chapter. */
  const loggedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !book || !Number.isInteger(chapter)) return;

    const key = `${book}:${chapter}`;
    if (loggedRef.current === key) return;

    const timer = window.setTimeout(() => {
      loggedRef.current = key;
      void api
        .post('/api/reading/event', { book, chapter, translation })
        .then(() => {
          // Home's "continue" card is reading the bookmark this just moved.
          void queryClient.invalidateQueries({ queryKey: readingPositionQueryKey });
        })
        .catch(() => {
          /*
           * Silent by design. The reader has nothing to say about a bookmark that did not
           * save, and the row is re-logged next time the chapter is opened anyway — a
           * reading history with a gap is worth more than a reader that complains.
           */
        });
    }, DWELL_MS);

    return () => window.clearTimeout(timer);
  }, [enabled, book, chapter, translation, queryClient]);
}

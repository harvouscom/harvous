import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { bibleBookChapterCounts } from '@/utils/bible-book-chapters';
import { parseReaderQuery } from '@/utils/parse-reader-query';
import { readingDwellCountsAsRead } from '@/utils/reading-event-kinds';
import {
  deriveContinueReading,
  deriveSmartJumpDestination,
  type SmartJumpDestination,
} from '@/utils/prototype-home-trends';
import { useReadingHistory } from './queries/useReadingHistory';
import { useVotdToday } from './queries/useVotdToday';

/**
 * How long a click waits for the reading position before settling for today's passage.
 *
 * Long enough to cover a cold start — Clerk loading, the session JWT, then the request — and
 * short enough that an API that is down still opens a chapter rather than a dead control.
 */
export const SMART_JUMP_SETTLE_DEADLINE_MS = 3000;

export type SmartJump = {
  /** The best answer right now. May still be the fallback while the position loads. */
  destination: SmartJumpDestination;
  /** The answer once the reading position is known (or known absent), bounded by the deadline. */
  resolve: () => Promise<SmartJumpDestination>;
};

/**
 * Where "open the reader" goes when nothing named a passage.
 *
 * Lives in one place because two surfaces ask the same question — the toolbar control and the
 * keyboard chord — and a second copy of the priority would drift the moment one of them gained
 * a case the other did not.
 *
 * Why `resolve` and not just the value: the two sources arrive at very different times.
 * Today's passage is a public endpoint and lands at once; the reading position waits on auth.
 * A click in that window used to read "no position" off a query that simply had not run yet,
 * open today's passage, and then — because the reader marks its position on open — overwrite
 * the real position with it. Every new session erased where someone had left off. So a click
 * waits until the position has actually answered.
 */
export function useSmartJumpDestination(): SmartJump {
  const { isLoaded: clerkLoaded, isSignedIn } = useAuth();
  const readingHistoryQuery = useReadingHistory();
  const { data: votd, isPending: votdPending } = useVotdToday();

  const lastRead = readingHistoryQuery.data?.lastRead ?? null;
  const chapters = readingHistoryQuery.data?.chapters;
  const votdReference = votd?.reference;

  const { destination, hasContinue } = useMemo(() => {
    const continueReading = deriveContinueReading(
      {
        lastRead,
        readChapters: (chapters ?? []).map((c) => ({
          book: c.book,
          chapter: c.chapter,
          countsAsRead: readingDwellCountsAsRead(c.dwellBucket),
        })),
      },
      bibleBookChapterCounts(),
    );

    const parsedVotd = votdReference ? parseReaderQuery(votdReference) : null;

    return {
      hasContinue: continueReading != null,
      destination: deriveSmartJumpDestination(
        continueReading,
        parsedVotd
          ? { book: parsedVotd.book, chapter: parsedVotd.chapter, verse: parsedVotd.verse }
          : null,
      ),
    };
  }, [lastRead, chapters, votdReference]);

  /*
   * Settled means the answer will not change for a reason we are waiting on. A signed-out
   * visitor has no position to wait for — the history query is disabled for them and would
   * sit pending forever. A failed history request is settled too: today's passage is then the
   * honest answer, not a guess made too early.
   */
  const historySettled =
    (clerkLoaded && !isSignedIn) || readingHistoryQuery.isSuccess || readingHistoryQuery.isError;
  const settled = historySettled && (hasContinue || !votdPending);

  const destinationRef = useRef(destination);
  const settledRef = useRef(settled);
  const waitersRef = useRef<Array<(d: SmartJumpDestination) => void>>([]);
  destinationRef.current = destination;
  settledRef.current = settled;

  useEffect(() => {
    if (!settled || waitersRef.current.length === 0) return;
    const waiters = waitersRef.current;
    waitersRef.current = [];
    for (const done of waiters) done(destination);
  }, [settled, destination]);

  useEffect(
    () => () => {
      const waiters = waitersRef.current;
      waitersRef.current = [];
      for (const done of waiters) done(destinationRef.current);
    },
    [],
  );

  const resolve = useCallback((): Promise<SmartJumpDestination> => {
    if (settledRef.current) return Promise.resolve(destinationRef.current);
    return new Promise((resolvePromise) => {
      let finished = false;
      const done = (d: SmartJumpDestination) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        resolvePromise(d);
      };
      const timer = setTimeout(() => {
        waitersRef.current = waitersRef.current.filter((w) => w !== done);
        done(destinationRef.current);
      }, SMART_JUMP_SETTLE_DEADLINE_MS);
      waitersRef.current.push(done);
    });
  }, []);

  return { destination, resolve };
}

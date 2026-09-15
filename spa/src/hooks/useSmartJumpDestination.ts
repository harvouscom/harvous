import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { parseReaderQuery } from '@/utils/parse-reader-query';
import { destinationFromLastActivity } from '@/utils/last-read-resume';
import {
  deriveSmartJumpDestination,
  type SmartJumpDestination,
} from '@/utils/prototype-home-trends';
import { useReadingHistory } from './queries/useReadingHistory';
import { useVotdToday } from './queries/useVotdToday';

export const SMART_JUMP_SETTLE_DEADLINE_MS = 3000;

export type SmartJump = {
  destination: SmartJumpDestination;
  resolve: () => Promise<SmartJumpDestination>;
};

/**
 * Where "open the reader" goes when nothing named a passage.
 *
 * Last activity first: the chapter and verse the reader actually left. Today's passage
 * and Genesis 1 are only for a first run, or when the position has not loaded.
 *
 * A click waits until the position has answered. Opening today's passage too early
 * used to overwrite last-read on arrival.
 */
export function useSmartJumpDestination(): SmartJump {
  const { isLoaded: clerkLoaded, isSignedIn } = useAuth();
  const readingHistoryQuery = useReadingHistory();
  const { data: votd, isPending: votdPending } = useVotdToday();

  const lastRead = readingHistoryQuery.data?.lastRead ?? null;
  const votdReference = votd?.reference;

  const { destination, hasContinue } = useMemo(() => {
    const fromActivity = destinationFromLastActivity(lastRead);
    const parsedVotd = votdReference ? parseReaderQuery(votdReference) : null;

    return {
      hasContinue: fromActivity != null,
      destination:
        fromActivity ??
        deriveSmartJumpDestination(
          null,
          parsedVotd
            ? { book: parsedVotd.book, chapter: parsedVotd.chapter, verse: parsedVotd.verse }
            : null,
        ),
    };
  }, [lastRead, votdReference]);

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
